const { app, BrowserWindow, ipcMain, shell, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const RedditDownloader = require('./downloader.cjs');

let downloader = null;

function getAppIconPath() {
    return app.isPackaged
        ? path.join(process.resourcesPath, 'icon.ico')
        : path.join(__dirname, '../assets/icon.ico');
}

function createWindow() {
    const win = new BrowserWindow({
        width: 860,
        height: 620,
        minWidth: 560,
        minHeight: 420,
        backgroundColor: '#18181b',
        icon: getAppIconPath(),
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
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

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
        const content = `GKMediaDownloader v${app.getVersion()} - Log exported ${now.toISOString()}\n${'-'.repeat(60)}\n\n${logLines.join('\n')}\n`;
        fs.writeFileSync(filePath, content, 'utf-8');
        shell.showItemInFolder(filePath);
        return { success: true, filePath };
    } catch (err) {
        return { success: false, message: err.message };
    }
});

ipcMain.handle('facebook-login', async () => {
    const fbSession = session.fromPartition('persist:gkmd-facebook');
    const win = new BrowserWindow({
        width: 1100,
        height: 780,
        title: 'Facebook Login - GK Media Downloader',
        backgroundColor: '#18181b',
        webPreferences: {
            partition: 'persist:gkmd-facebook',
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false,
        },
    });
    await win.loadURL('https://www.facebook.com/login');
    return await new Promise((resolve) => {
        const done = async () => {
            try {
                const cookies = await fbSession.cookies.get({ domain: 'facebook.com' });
                resolve({ success: true, loggedIn: cookies.some((cookie) => cookie.name === 'c_user') });
            } catch (err) {
                resolve({ success: false, message: err.message });
            }
        };
        win.on('closed', done);
    });
});

ipcMain.handle('get-version', () => {
    return app.getVersion();
});
