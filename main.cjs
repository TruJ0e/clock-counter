'use strict';

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

// An explicit test profile keeps automated UI tests isolated from the user's settings.
if (process.env.CLOCK_COUNTER_TEST_PROFILE) {
  fs.mkdirSync(process.env.CLOCK_COUNTER_TEST_PROFILE, { recursive: true });
  app.setPath('userData', process.env.CLOCK_COUNTER_TEST_PROFILE);
}

const DEFAULT_SIZE = { width: 490, height: 570 };
const MIN_SIZE = { width: 350, height: 410 };
let mainWindow;

function settingsPath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function readSettings() {
  try {
    const data = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    if (data && typeof data === 'object') return data;
  } catch {
    // First launch, missing file or corrupt preferences: use safe defaults.
  }
  return {};
}

function safeBounds(saved) {
  if (!saved || typeof saved !== 'object') return { ...DEFAULT_SIZE };

  const width = Number.isInteger(saved.width) ? Math.min(1920, Math.max(MIN_SIZE.width, saved.width)) : DEFAULT_SIZE.width;
  const height = Number.isInteger(saved.height) ? Math.min(1200, Math.max(MIN_SIZE.height, saved.height)) : DEFAULT_SIZE.height;
  if (!Number.isInteger(saved.x) || !Number.isInteger(saved.y)) return { width, height };

  const candidate = { x: saved.x, y: saved.y, width, height };
  const available = screen.getAllDisplays().find((display) => {
    const r = display.workArea;
    const xIntersect = Math.max(0, Math.min(candidate.x + width, r.x + r.width) - Math.max(candidate.x, r.x));
    const yIntersect = Math.max(0, Math.min(candidate.y + height, r.y + r.height) - Math.max(candidate.y, r.y));
    return xIntersect >= 120 && yIntersect >= 100;
  });

  if (!available) return { width, height }; // Never reopen entirely off-screen.

  const r = available.workArea;
  return {
    x: Math.max(r.x, Math.min(candidate.x, r.x + r.width - Math.min(width, r.width))),
    y: Math.max(r.y, Math.min(candidate.y, r.y + r.height - Math.min(height, r.height))),
    width: Math.min(width, r.width),
    height: Math.min(height, r.height)
  };
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  const old = readSettings();
  const bounds = win.getNormalBounds();
  const state = {
    ...old,
    ...bounds,
    alwaysOnTop: win.isAlwaysOnTop()
  };
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    const temporary = settingsPath() + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(temporary, settingsPath());
  } catch (error) {
    console.warn('Unable to save Clock Counter window settings:', error.message);
  }
}

function createWindow() {
  const saved = readSettings();
  mainWindow = new BrowserWindow({
    ...safeBounds(saved),
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    backgroundColor: '#050505',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    frame: false,
    show: false,
    resizable: true,
    maximizable: true,
    alwaysOnTop: saved.alwaysOnTop === true,
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

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.webContents.send('clock-counter:always-on-top', mainWindow.isAlwaysOnTop());
  });
  mainWindow.on('close', () => saveWindowState(mainWindow));

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
}

app.whenReady().then(() => {
  ipcMain.on('clock-counter:window', (event, action) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;

    switch (action) {
      case 'minimize': win.minimize(); break;
      case 'maximize':
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
        break;
      case 'close': win.close(); break;
      case 'toggle-always-on-top':
        win.setAlwaysOnTop(!win.isAlwaysOnTop());
        saveWindowState(win);
        win.webContents.send('clock-counter:always-on-top', win.isAlwaysOnTop());
        break;
      case 'toggle-fullscreen':
        win.setFullScreen(!win.isFullScreen());
        break;
      default:
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
