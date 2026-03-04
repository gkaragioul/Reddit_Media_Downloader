const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const RedditDownloader = require('./downloader.cjs');

Menu.setApplicationMenu(null);

let downloader = null;

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
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// ── IPC Handlers ──────────────────────────────────────────────

ipcMain.handle('start-download', async (event, input, settings) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { success: false, message: 'No window found' };

    if (downloader && downloader.isRunning()) {
        return { success: false, message: 'Download already in progress' };
    }

    downloader = new RedditDownloader(win);

    // Fire-and-forget — progress/logs/completion come via IPC sends
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
    const fs = require('fs');
    const folder = downloader?.getOutputFolder();
    const redditDir = path.join(app.getPath('downloads'), 'RedditDownloads');
    const target = folder && fs.existsSync(folder) ? folder
        : fs.existsSync(redditDir) ? redditDir
        : app.getPath('downloads');
    shell.openPath(target);
});
