'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

let window;

function createWindow() {
  window = new BrowserWindow({
    width: 490,
    height: 570,
    minWidth: 350,
    minHeight: 410,
    backgroundColor: '#050505',
    frame: false,
    show: false,
    resizable: true,
    maximizable: true,
    autoHideMenuBar: true,
    title: 'CLOCK COUNTER',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false
    }
  });

  window.loadFile(path.join(__dirname, 'index.html'));
  window.once('ready-to-show', () => window.show());

  // Prevent ordinary web links and popups from leaving the app unexpectedly.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
}

app.whenReady().then(() => {
  ipcMain.on('clock-counter:window', (event, action) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    if (!sourceWindow || sourceWindow.isDestroyed()) return;

    switch (action) {
      case 'minimize': sourceWindow.minimize(); break;
      case 'maximize':
        if (sourceWindow.isMaximized()) sourceWindow.unmaximize();
        else sourceWindow.maximize();
        break;
      case 'close': sourceWindow.close(); break;
      case 'toggle-always-on-top':
        sourceWindow.setAlwaysOnTop(!sourceWindow.isAlwaysOnTop());
        sourceWindow.webContents.send('clock-counter:always-on-top', sourceWindow.isAlwaysOnTop());
        break;
      case 'toggle-fullscreen':
        sourceWindow.setFullScreen(!sourceWindow.isFullScreen());
        break;
    }
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
