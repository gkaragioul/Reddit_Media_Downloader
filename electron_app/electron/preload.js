const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Invoke (request → response)
    startDownload: (input, settings) => ipcRenderer.invoke('start-download', input, settings),

    // Send (fire-and-forget, renderer → main)
    pauseDownload: () => ipcRenderer.send('pause-download'),
    stopDownload: () => ipcRenderer.send('stop-download'),
    openOutputFolder: () => ipcRenderer.send('open-output-folder'),

    // Listeners (main → renderer) — each returns a cleanup function
    onDownloadProgress: (callback) => {
        const handler = (_event, value) => callback(value);
        ipcRenderer.on('download-progress', handler);
        return () => ipcRenderer.removeListener('download-progress', handler);
    },
    onDownloadLog: (callback) => {
        const handler = (_event, message) => callback(message);
        ipcRenderer.on('download-log', handler);
        return () => ipcRenderer.removeListener('download-log', handler);
    },
    onDownloadComplete: (callback) => {
        const handler = (_event, stats) => callback(stats);
        ipcRenderer.on('download-complete', handler);
        return () => ipcRenderer.removeListener('download-complete', handler);
    },
});
