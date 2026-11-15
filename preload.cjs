'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const allowedActions = new Set([
  'minimize',
  'maximize',
  'close',
  'toggle-always-on-top',
  'toggle-fullscreen',
  'resize-to',
  'fit-clocks'
]);

contextBridge.exposeInMainWorld('clockCounterWindow', {
  action(action, payload) {
    if (allowedActions.has(action)) ipcRenderer.send('clock-counter:window', action, payload);
  },
  onAlwaysOnTop(listener) {
    if (typeof listener !== 'function') return;
    ipcRenderer.on('clock-counter:always-on-top', (_event, value) => listener(Boolean(value)));
  }
});
