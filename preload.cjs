'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const allowedActions=new Set([
  'minimize','maximize','close','quit','toggle-always-on-top',
  'toggle-fullscreen','resize-to','fit-clocks','set-focus-mode',
  'set-lock','set-tray','hide-to-tray','show-main','detach-clock',
  'close-detached','notify'
]);
function subscribe(channel,listener){
  if(typeof listener!=='function')return ()=>{};
  const wrapped=(_event,payload)=>listener(payload);
  ipcRenderer.on(channel,wrapped);
  return ()=>ipcRenderer.removeListener(channel,wrapped);
}
contextBridge.exposeInMainWorld('clockCounterWindow',{
  action(action,payload){if(allowedActions.has(action))ipcRenderer.send('clock-counter:window',action,payload);},
  onAlwaysOnTop(listener){return subscribe('clock-counter:always-on-top',listener);},
  onNativeState(listener){return subscribe('clock-counter:native-state',listener);},
  onTrayAction(listener){return subscribe('clock-counter:tray-action',listener);},
  onRemoteControl(listener){return subscribe('clock-counter:remote-control',listener);},
  onRequestSnapshot(listener){return subscribe('clock-counter:request-snapshot',listener);},
  onDetachedState(listener){return subscribe('clock-counter:detached-state',listener);},
  publishSnapshot(snapshot){if(snapshot&&typeof snapshot==='object')ipcRenderer.send('clock-counter:snapshot',snapshot);},
  onClockSnapshot(listener){return subscribe('clock-counter:clock-snapshot',listener);},
  detachedCommand(command){if(['start-pause','reset','ack'].includes(command))ipcRenderer.send('clock-counter:detached-command',command);},
  importSound(){return ipcRenderer.invoke('clock-counter:import-sound');},
  readSound(id){return ipcRenderer.invoke('clock-counter:read-sound',id);},
  exportSetup(data){return ipcRenderer.invoke('clock-counter:export-setup',data);},
  importSetup(){return ipcRenderer.invoke('clock-counter:import-setup');},
  installSounds(assets){return ipcRenderer.invoke('clock-counter:install-sounds',assets);},
  onUpdateStatus(listener){return subscribe('clock-counter:update-status',listener);},
  checkForUpdates(){return ipcRenderer.invoke('clock-counter:check-for-updates');},
  getUpdateStatus(){return ipcRenderer.invoke('clock-counter:get-update-status');}
});
