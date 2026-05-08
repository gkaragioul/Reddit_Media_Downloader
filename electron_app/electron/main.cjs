const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const RedditDownloader = require('./downloader.cjs');

let downloader = null;

// ── Update constants ────────────────────────────────────────
const REPO_OWNER = 'karagioules';
const REPO_NAME = 'GKMediaDownloader';
const GITHUB_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

// AppData dir for update state persistence
const APP_DATA_DIR = path.join(app.getPath('userData'));
const DISMISSED_VERSION_FILE = path.join(APP_DATA_DIR, 'dismissed_update.txt');
const PENDING_UPDATE_FILE = path.join(APP_DATA_DIR, 'pending_update.txt');

// ETag cache for GitHub API (avoids rate limit on repeated checks)
let cachedETag = null;
let cachedRelease = null;

function createWindow() {
    const win = new BrowserWindow({
        width: 860,
        height: 620,
        minWidth: 560,
        minHeight: 420,
        backgroundColor: '#18181b',
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#18181b',
            symbolColor: '#71717a',
            height: 36,
        },
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    win.once('ready-to-show', () => win.show());

    if (process.env.VITE_DEV_SERVER_URL) {
        win.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
        win.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    // Clean up orphaned update scripts from previous runs
    cleanupOrphanedScripts();

    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// ── Orphaned script cleanup ──────────────────────────────────

function cleanupOrphanedScripts() {
    try {
        const tempDir = app.getPath('temp');
        const files = fs.readdirSync(tempDir);
        for (const file of files) {
            if ((file.startsWith('gkmd_relaunch_') || file.startsWith('gkmd_launcher_')) &&
                (file.endsWith('.cmd') || file.endsWith('.ps1') || file.endsWith('.vbs'))) {
                try { fs.unlinkSync(path.join(tempDir, file)); } catch {}
            }
        }
    } catch {}
}

// ── HTTP helpers ─────────────────────────────────────────────

function httpsGetJson(url, useETagCache = false) {
    return new Promise((resolve, reject) => {
        const headers = {
            'User-Agent': `GKMediaDownloader/${app.getVersion()}`,
            'Accept': 'application/vnd.github.v3+json',
        };

        // Add ETag header if we have a cached response (304 Not Modified doesn't count against rate limit)
        if (useETagCache && cachedETag) {
            headers['If-None-Match'] = cachedETag;
        }

        const options = { headers, timeout: 15000 };

        https.get(url, options, (res) => {
            // 304 Not Modified — return cached data (doesn't count against rate limit)
            if (res.statusCode === 304 && cachedRelease) {
                res.resume();
                return resolve(cachedRelease);
            }
            if (res.statusCode === 301 || res.statusCode === 302) {
                const location = res.headers.location;
                res.resume();
                if (location) return httpsGetJson(location, useETagCache).then(resolve, reject);
                return reject(new Error('Redirect without location'));
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`GitHub API returned ${res.statusCode}`));
            }

            // Cache ETag for future requests
            if (useETagCache && res.headers.etag) {
                cachedETag = res.headers.etag;
            }

            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (useETagCache) cachedRelease = parsed;
                    resolve(parsed);
                }
                catch { reject(new Error('Failed to parse GitHub response')); }
            });
            res.on('error', reject);
        }).on('error', reject);
    });
}

function httpsDownloadFile(url, destPath, onProgress, hops = 0) {
    return new Promise((resolve, reject) => {
        if (hops > 5) return reject(new Error('Too many redirects'));

        const options = {
            headers: {
                'User-Agent': `GKMD/${app.getVersion()}`,
                'Accept': 'application/octet-stream',
            },
            timeout: 120000,
        };

        https.get(url, options, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                const location = res.headers.location;
                res.resume();
                if (location) return httpsDownloadFile(location, destPath, onProgress, hops + 1).then(resolve, reject);
                return reject(new Error('Redirect without location'));
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
            }

            const totalBytes = parseInt(res.headers['content-length'], 10) || -1;
            let downloadedBytes = 0;

            const ws = fs.createWriteStream(destPath);
            const hash = crypto.createHash('sha256');

            res.on('data', (chunk) => {
                ws.write(chunk);
                hash.update(chunk);
                downloadedBytes += chunk.length;
                if (totalBytes > 0 && onProgress) {
                    onProgress(Math.round((downloadedBytes / totalBytes) * 100));
                }
            });

            res.on('end', () => {
                ws.end(() => {
                    const sha256 = hash.digest('hex');
                    resolve({ filePath: destPath, sha256 });
                });
            });

            ws.on('error', (err) => {
                try { fs.unlinkSync(destPath); } catch {}
                reject(err);
            });
            res.on('error', (err) => {
                try { fs.unlinkSync(destPath); } catch {}
                reject(err);
            });
        }).on('error', reject);
    });
}

// ── Version comparison ───────────────────────────────────────

function isNewerVersion(latest, current) {
    const lp = latest.split('.').map(Number);
    const cp = current.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        const l = lp[i] || 0;
        const c = cp[i] || 0;
        if (l > c) return true;
        if (l < c) return false;
    }
    return false;
}

// ── Dismissed version persistence ────────────────────────────

function isDismissed(tagName) {
    try {
        if (!fs.existsSync(DISMISSED_VERSION_FILE)) return false;
        return fs.readFileSync(DISMISSED_VERSION_FILE, 'utf-8').trim() === tagName;
    } catch { return false; }
}

function dismissVersion(tagName) {
    try { fs.writeFileSync(DISMISSED_VERSION_FILE, tagName, 'utf-8'); } catch {}
}

// ── Pending update tracking ──────────────────────────────────

function writePendingUpdateMarker(version) {
    try { fs.writeFileSync(PENDING_UPDATE_FILE, version, 'utf-8'); } catch {}
}

function checkPendingUpdateFailed() {
    try {
        if (!fs.existsSync(PENDING_UPDATE_FILE)) return null;
        const expected = fs.readFileSync(PENDING_UPDATE_FILE, 'utf-8').trim();
        fs.unlinkSync(PENDING_UPDATE_FILE);
        if (!expected) return null;
        const expectedClean = expected.replace(/^v/, '');
        if (isNewerVersion(expectedClean, app.getVersion())) {
            return expected; // Update didn't apply
        }
        return null; // Update succeeded
    } catch { return null; }
}

// ── IPC Handlers ──────────────────────────────────────────────

ipcMain.handle('start-download', async (event, input, settings) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { success: false, message: 'No window found' };

    if (downloader && downloader.isRunning()) {
        return { success: false, message: 'Download already in progress' };
    }

    downloader = new RedditDownloader(win);

    downloader.start(input, settings || {}).catch((err) => {
        try {
            win.webContents.send('download-log', `[ERROR] ${err.message}`);
            win.webContents.send('download-complete', { error: err.message });
        } catch {}
    });

    return { success: true, message: 'Download started' };
});

ipcMain.on('pause-download', () => {
    if (downloader) downloader.togglePause();
});

ipcMain.on('stop-download', () => {
    if (downloader) downloader.stop();
});

ipcMain.on('open-output-folder', () => {
    const folder = downloader?.getOutputFolder();
    const target = folder && fs.existsSync(folder) ? folder
        : app.getPath('downloads');
    shell.openPath(target);
});

ipcMain.handle('save-logs', async (_event, logLines) => {
    try {
        const logsDir = path.join(app.getPath('userData'), 'logs');
        fs.mkdirSync(logsDir, { recursive: true });
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const filePath = path.join(logsDir, `gkmd_log_${ts}.txt`);
        const content = `GKMediaDownloader v${app.getVersion()} — Log exported ${now.toISOString()}\n${'─'.repeat(60)}\n\n${logLines.join('\n')}\n`;
        fs.writeFileSync(filePath, content, 'utf-8');
        shell.showItemInFolder(filePath);
        return { success: true, filePath };
    } catch (err) {
        return { success: false, message: err.message };
    }
});

// ── Update IPC Handlers ──────────────────────────────────────

ipcMain.handle('get-version', () => {
    return app.getVersion();
});

ipcMain.handle('check-pending-update-failed', () => {
    return checkPendingUpdateFailed();
});

ipcMain.handle('check-for-updates', async (_event, isAuto) => {
    try {
        const release = await httpsGetJson(GITHUB_API_URL, true);
        const tagName = release.tag_name;
        if (!tagName) return null;

        const latestVersionStr = tagName.replace(/^v/, '');
        const currentVersion = app.getVersion();

        if (!isNewerVersion(latestVersionStr, currentVersion)) return null;

        // For auto checks, skip if user dismissed this version
        if (isAuto && isDismissed(tagName)) return null;

        // Find .exe asset (the NSIS installer)
        const assets = release.assets || [];
        const exeAsset = assets.find((a) => a.name && a.name.endsWith('.exe'));
        if (!exeAsset || !exeAsset.browser_download_url) return null;

        // Extract SHA256 from release notes body (format: "SHA256: <hex>")
        let expectedSha256 = null;
        const body = release.body || '';
        const shaMatch = body.match(/SHA256:\s*([a-fA-F0-9]{64})/i);
        if (shaMatch) expectedSha256 = shaMatch[1].toLowerCase();

        return {
            version: tagName,
            downloadUrl: exeAsset.browser_download_url,
            releaseNotes: body || 'No release notes.',
            fileName: exeAsset.name,
            expectedSha256,
        };
    } catch (err) {
        console.error('Update check failed:', err.message);
        return { error: err.message };
    }
});

ipcMain.handle('dismiss-update', (_event, version) => {
    dismissVersion(version);
});

ipcMain.handle('download-update', async (event, downloadUrl, fileName, expectedSha256) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    try {
        const tempDir = app.getPath('temp');
        const destPath = path.join(tempDir, `gkmd_${Date.now()}_${fileName}`);

        // Download with progress reporting
        const onProgress = (pct) => {
            try { win?.webContents.send('update-download-progress', pct); } catch {}
        };

        const result = await httpsDownloadFile(downloadUrl, destPath, onProgress);

        // Verify SHA256 if provided
        if (expectedSha256) {
            if (result.sha256 !== expectedSha256) {
                try { fs.unlinkSync(destPath); } catch {}
                return {
                    success: false,
                    message: `Integrity check failed.\n\nExpected: ${expectedSha256}\nActual: ${result.sha256}\n\nThe file has been deleted for safety.`,
                };
            }
        }

        return { success: true, filePath: destPath };
    } catch (err) {
        return { success: false, message: err.message };
    }
});

ipcMain.on('install-update', (_event, installerPath, version) => {
    if (!fs.existsSync(installerPath)) return;

    // Write pending update marker so next launch can detect if install failed
    writePendingUpdateMarker(version);

    const appExePath = process.execPath;
    const tempDir = app.getPath('temp');
    const ts = Date.now();

    // ── Step 1: PowerShell script (does the actual work) ──
    // Mirrors MyLocalBackup: Start-Process -Verb RunAs -Wait for UAC elevation,
    // then relaunch the app after install completes.
    const ps1Path = path.join(tempDir, `gkmd_relaunch_${ts}.ps1`);
    const ps1Lines = [
        `Start-Sleep -Seconds 3`,
        `$proc = Start-Process -FilePath '${installerPath.replace(/'/g, "''")}' -ArgumentList '/S' -Verb RunAs -Wait -PassThru`,
        `if ($proc.ExitCode -ne 0) {`,
        `  Add-Content '${path.join(tempDir, 'gkmd_install.log').replace(/'/g, "''")}' "Installer exited with code $($proc.ExitCode)"`,
        `}`,
        `Start-Sleep -Seconds 2`,
        `if (Test-Path '${appExePath.replace(/'/g, "''")}') { Start-Process '${appExePath.replace(/'/g, "''")}' }`,
        `Remove-Item '${ps1Path.replace(/'/g, "''")}' -Force -ErrorAction SilentlyContinue`,
    ];
    fs.writeFileSync(ps1Path, ps1Lines.join('\r\n'), 'utf-8');

    // ── Step 2: VBScript launcher (equivalent of .NET UseShellExecute=true) ──
    // WScript.Shell.Run gives the child process its own desktop session,
    // which is required for UAC prompts and GUI app launches to work.
    // This is the exact mechanism MyLocalBackup uses via .NET's UseShellExecute.
    const vbsPath = path.join(tempDir, `gkmd_launcher_${ts}.vbs`);
    const vbsContent = [
        `Set ws = CreateObject("WScript.Shell")`,
        `ws.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File ""${ps1Path}""", 0, True`,
        `CreateObject("Scripting.FileSystemObject").DeleteFile WScript.ScriptFullName`,
    ].join('\r\n');
    fs.writeFileSync(vbsPath, vbsContent, 'utf-8');

    // ── Step 3: Launch the VBScript ──
    // wscript.exe runs the VBS which launches PowerShell with its own session.
    // detached + unref ensures the process survives Electron exiting.
    const child = spawn('wscript.exe', [vbsPath], {
        detached: true,
        stdio: 'ignore',
    });
    child.unref();

    // Quit the app so the installer can replace files
    setTimeout(() => {
        app.quit();
    }, 500);
});
