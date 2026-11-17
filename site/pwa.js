'use strict';

// Website-only installation controls. The timer never calls a remote API.
let deferredInstallPrompt=null;
window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();
  deferredInstallPrompt=event;
  const install=document.getElementById('install-webapp');
  if(install)install.hidden=false;
});
window.addEventListener('DOMContentLoaded',()=>{
  const dialog=document.getElementById('download-dialog');
  const trigger=document.getElementById('download-trigger');
  const close=document.getElementById('download-close');
  const done=document.getElementById('download-done');
  const install=document.getElementById('install-webapp');
  if(!dialog||!trigger||!close||!done)return;
  trigger.addEventListener('click',()=>dialog.showModal());
  close.addEventListener('click',()=>dialog.close());
  done.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{
    if(event.target===dialog)dialog.close();
  });
  install?.addEventListener('click',async()=>{
    if(!deferredInstallPrompt)return;
    const prompt=deferredInstallPrompt;
    deferredInstallPrompt=null;
    install.hidden=true;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      // Safari provides Add to Home Screen instead; instructions remain visible.
    }
  });
});
if('serviceWorker' in navigator &&
    (location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('/sw.js',{scope:'/'})
      .catch(()=>{}); // Browsers may disable service workers in private mode.
  });
}
