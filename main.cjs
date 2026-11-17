'use strict';

const {app,BrowserWindow,ipcMain,screen,Tray,Menu,dialog,Notification,shell} = require('electron');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {createUpdateManager}=require('./src/update-manager.cjs');

if(process.env.CLOCK_COUNTER_TEST_PROFILE) {
  fs.mkdirSync(process.env.CLOCK_COUNTER_TEST_PROFILE,{recursive:true});
  app.setPath('userData',process.env.CLOCK_COUNTER_TEST_PROFILE);
}
const DEFAULT_SIZE={width:490,height:570};
const MIN_SIZE={width:250,height:260};
const iconPath=path.join(__dirname,'assets',process.platform==='darwin'?'app-icon-512.png':'icon.ico');
const detached=new Map();
let mainWindow=null;
let tray=null;
let trayEnabled=false;
let isQuitting=false;
let layoutLocked=false;
let updates=null;

function settingsPath(){return path.join(app.getPath('userData'),'window-state.json');}
function readSettings(){
  try {
    const data=JSON.parse(fs.readFileSync(settingsPath(),'utf8'));
    if(data&&typeof data==='object')return data;
  }catch{}
  return {};
}
function saveWindowState(win) {
  if(!win||win.isDestroyed())return;
  const state={...readSettings(),...win.getNormalBounds(),
    alwaysOnTop:win.isAlwaysOnTop(),trayEnabled,locked:layoutLocked};
  try{
    fs.mkdirSync(path.dirname(settingsPath()),{recursive:true});
    const temp=settingsPath()+'.tmp';
    fs.writeFileSync(temp,JSON.stringify(state,null,2),'utf8');
    fs.renameSync(temp,settingsPath());
  }catch(err){console.warn('CLOCK COUNTER settings could not be saved:',err.message);}
}
function safeBounds(saved) {
  const bounds=screen.getPrimaryDisplay().workArea;
  if(!saved||typeof saved!=='object')return {...DEFAULT_SIZE};
  const width=Number.isInteger(saved.width)?Math.max(MIN_SIZE.width,saved.width):DEFAULT_SIZE.width;
  const height=Number.isInteger(saved.height)?Math.max(MIN_SIZE.height,saved.height):DEFAULT_SIZE.height;
  if(!Number.isInteger(saved.x)||!Number.isInteger(saved.y))
    return {width:Math.min(width,bounds.width),height:Math.min(height,bounds.height)};
  const candidate={x:saved.x,y:saved.y,width,height};
  const available=screen.getAllDisplays().find(d=>{
    const r=d.workArea;
    const xi=Math.max(0,Math.min(candidate.x+width,r.x+r.width)-Math.max(candidate.x,r.x));
    const yi=Math.max(0,Math.min(candidate.y+height,r.y+r.height)-Math.max(candidate.y,r.y));
    return xi>=120&&yi>=100;
  });
  if(!available)return {width:Math.min(width,bounds.width),height:Math.min(height,bounds.height)};
  const r=available.workArea;
  return {x:Math.max(r.x,Math.min(candidate.x,r.x+r.width-Math.min(width,r.width))),
    y:Math.max(r.y,Math.min(candidate.y,r.y+r.height-Math.min(height,r.height))),
    width:Math.min(width,r.width),height:Math.min(height,r.height)};
}
function canUseFile(win) {
  return win&&mainWindow&&!mainWindow.isDestroyed()&&win.webContents.id===mainWindow.webContents.id;
}
function showMain() {
  if(!mainWindow||mainWindow.isDestroyed())return createWindow();
  if(mainWindow.isMinimized())mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}
function refreshTrayMenu() {
  if(!tray)return;
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:'Show CLOCK COUNTER',click:showMain},
    {type:'separator'},
    {label:'Start all timers',click:()=>mainWindow?.webContents.send('clock-counter:tray-action','start-all')},
    {label:'Pause all timers',click:()=>mainWindow?.webContents.send('clock-counter:tray-action','pause-all')},
    {type:'separator'},
    {label:'Quit CLOCK COUNTER',click:()=>{isQuitting=true;app.quit();}}
  ]));
}
function setTrayEnabled(enabled){
  trayEnabled=Boolean(enabled);
  if(trayEnabled&&!tray) {
    tray=new Tray(iconPath);
    tray.setToolTip('CLOCK COUNTER');
    tray.on('double-click',showMain);
    tray.on('click',showMain);
    refreshTrayMenu();
  }else if(!trayEnabled&&tray) {
    tray.destroy();
    tray=null;
  }
  if(mainWindow&&!mainWindow.isDestroyed())saveWindowState(mainWindow);
  return trayEnabled;
}
function createWindow(){
  const saved=readSettings();
  mainWindow=new BrowserWindow({
    ...safeBounds(saved),
    minWidth:MIN_SIZE.width,minHeight:MIN_SIZE.height,
    backgroundColor:'#050505',icon:iconPath,frame:false,show:false,
    resizable:true,maximizable:true,alwaysOnTop:saved.alwaysOnTop===true,
    autoHideMenuBar:true,title:'CLOCK COUNTER',
    webPreferences:{
      preload:path.join(__dirname,'preload.cjs'),
      contextIsolation:true,nodeIntegration:false,sandbox:true,
      devTools:false,backgroundThrottling:false
    }
  });
  if(layoutLocked)mainWindow.setResizable(false);
  mainWindow.loadFile(path.join(__dirname,'index.html'));
  mainWindow.once('ready-to-show',()=>{
    mainWindow.show();
    mainWindow.webContents.send('clock-counter:always-on-top',mainWindow.isAlwaysOnTop());
    mainWindow.webContents.send('clock-counter:native-state',{trayEnabled,locked:layoutLocked});
    if(updates)mainWindow.webContents.send('clock-counter:update-status',updates.getStatus());
  });
  mainWindow.on('close',event=>{
    saveWindowState(mainWindow);
    if(!isQuitting&&trayEnabled){
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed',()=>{
    mainWindow=null;
    if(!trayEnabled)for(const win of detached.values())if(!win.isDestroyed())win.close();
  });
  mainWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  mainWindow.webContents.on('will-navigate',event=>event.preventDefault());
  return mainWindow;
}
function validClockId(id){return typeof id==='string'&&/^[a-z0-9_-]{1,40}$/i.test(id);}
function createDetached(id){
  if(!validClockId(id))return false;
  if(detached.has(id)&&!detached.get(id).isDestroyed()){
    detached.get(id).show();detached.get(id).focus();return true;
  }
  const win=new BrowserWindow({
    width:340,height:390,minWidth:190,minHeight:215,show:false,
    backgroundColor:'#050505',icon:iconPath,title:'CLOCK COUNTER — Floating Clock',
    autoHideMenuBar:true,
    webPreferences:{
      preload:path.join(__dirname,'preload.cjs'),
      contextIsolation:true,nodeIntegration:false,sandbox:true,
      devTools:false,backgroundThrottling:false
    }
  });
  detached.set(id,win);
  win.loadFile(path.join(__dirname,'detached.html'),{query:{clock:id}});
  win.once('ready-to-show',()=>{
    win.show();
    mainWindow?.webContents.send('clock-counter:request-snapshot',id);
  });
  win.on('closed',()=>{
    detached.delete(id);
    mainWindow?.webContents.send('clock-counter:detached-state',{id,open:false});
  });
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  mainWindow?.webContents.send('clock-counter:detached-state',{id,open:true});
  return true;
}
function soundsDir(){return path.join(app.getPath('userData'),'alarms');}
function soundsManifest(){return path.join(soundsDir(),'index.json');}
function readSounds(){
  try{const data=JSON.parse(fs.readFileSync(soundsManifest(),'utf8'));return Array.isArray(data)?data:[];}
  catch{return [];}
}
function writeSounds(data){
  fs.mkdirSync(soundsDir(),{recursive:true});
  fs.writeFileSync(soundsManifest(),JSON.stringify(data),'utf8');
}
const allowedSoundExtensions=new Map([['.mp3','audio/mpeg'],['.wav','audio/wav'],['.ogg','audio/ogg']]);
const allowedSoundId=id=>typeof id==='string'&&/^[0-9a-f-]{36}$/.test(id);

app.whenReady().then(()=>{
  const saved=readSettings();
  trayEnabled=saved.trayEnabled===true;
  layoutLocked=saved.locked===true;
  createWindow();
  if(trayEnabled)setTrayEnabled(true);

  // Only the installed NSIS build can automatically replace its executable.
  // Portable files, test profiles and developer builds never execute updates.
  const updateEnabled=app.isPackaged&&process.platform==='win32'&&
    !process.env.CLOCK_COUNTER_TEST_PROFILE&&
    !process.env.PORTABLE_EXECUTABLE_FILE&&
    !process.env.PORTABLE_EXECUTABLE_DIR;
  updates=createUpdateManager({
    enabled:updateEnabled,
    updater:updateEnabled?require('electron-updater').autoUpdater:null,
    stateFile:path.join(app.getPath('userData'),'update-state.json'),
    notify:status=>{
      if(mainWindow&&!mainWindow.isDestroyed()&&!mainWindow.webContents.isDestroyed())
        mainWindow.webContents.send('clock-counter:update-status',status);
    }
  });
  updates.start();
  ipcMain.handle('clock-counter:check-for-updates',async event=>{
    if(!canUseFile(BrowserWindow.fromWebContents(event.sender)))return {phase:'unavailable'};
    if(process.platform==='darwin'&&app.isPackaged){
      // Unsigned/notarized macOS DMGs cannot be silently self-installed.
      // The manual button opens the trusted download page instead.
      await shell.openExternal('https://ttc.trujoedigital.com/');
      return {phase:'current',message:'OPENED MAC DOWNLOAD PAGE - SELECT YOUR MAC'};
    }
    return updates.check({manual:true});
  });
  ipcMain.handle('clock-counter:get-update-status',async event=>{
    if(!canUseFile(BrowserWindow.fromWebContents(event.sender)))return {phase:'unavailable'};
    return updates.getStatus();
  });

  ipcMain.on('clock-counter:window',(event,action,payload)=>{
    const win=BrowserWindow.fromWebContents(event.sender);
    if(!win||win.isDestroyed())return;
    const isPrimary=canUseFile(win);
    // Detached windows cannot execute arbitrary main-window administrative actions.
    if(!isPrimary&&!['minimize','close'].includes(action))return;
    switch(action){
      case 'minimize':win.minimize();break;
      case 'maximize':if(isPrimary){if(win.isMaximized())win.unmaximize();else win.maximize();}break;
      case 'close':win.close();break;
      case 'quit':isQuitting=true;app.quit();break;
      case 'toggle-always-on-top':
        win.setAlwaysOnTop(!win.isAlwaysOnTop());
        saveWindowState(win);
        win.webContents.send('clock-counter:always-on-top',win.isAlwaysOnTop());
        break;
      case 'toggle-fullscreen':win.setFullScreen(!win.isFullScreen());break;
      case 'set-focus-mode':{
        if(typeof payload?.enabled!=='boolean')return;
        const min=payload.enabled?[180,180]:[250,260];
        win.setMinimumSize(...min);
        const [width,height]=win.getSize();
        if(width<min[0]||height<min[1])
          win.setSize(Math.max(width,min[0]),Math.max(height,min[1]));
        break;
      }
      case 'resize-to':{
        if(win.isFullScreen()||layoutLocked)return;
        const area=screen.getDisplayMatching(win.getBounds()).workArea;
        const width=Number(payload?.width),height=Number(payload?.height);
        if(!Number.isFinite(width)||!Number.isFinite(height))return;
        if(win.isMaximized())win.unmaximize();
        const [minW,minH]=win.getMinimumSize();
        win.setSize(Math.min(area.width,Math.max(minW,Math.round(width))),
          Math.min(area.height,Math.max(minH,Math.round(height))));
        break;
      }
      case 'fit-clocks':{
        if(layoutLocked)return;
        const count=Number(payload?.count);
        if(!Number.isInteger(count)||count<2||count>12||win.isFullScreen()||win.isMaximized())return;
        const area=screen.getDisplayMatching(win.getBounds()).workArea;
        const width=Math.min(area.width,370*Math.min(count,5)+10);
        const bounds=win.getBounds();
        if(bounds.width<width)win.setSize(width,Math.min(area.height,Math.max(bounds.height,560)));
        break;
      }
      case 'set-lock':
        if(typeof payload?.enabled!=='boolean')return;
        layoutLocked=payload.enabled;
        win.setResizable(!layoutLocked);
        saveWindowState(win);
        break;
      case 'set-tray':
        if(typeof payload?.enabled!=='boolean')return;
        setTrayEnabled(payload.enabled);
        win.webContents.send('clock-counter:native-state',{trayEnabled,locked:layoutLocked});
        break;
      case 'hide-to-tray':
        if(!trayEnabled)setTrayEnabled(true);
        win.hide();
        break;
      case 'show-main':showMain();break;
      case 'detach-clock':
        if(validClockId(payload?.id))createDetached(payload.id);
        break;
      case 'close-detached':
        if(detached.has(payload?.id))detached.get(payload.id).close();
        break;
      case 'notify':
        if(typeof payload?.title!=='string'||typeof payload?.body!=='string')return;
        if(Notification.isSupported()&&(!win.isFocused()||!win.isVisible())){
          const notice=new Notification({
            title:payload.title.slice(0,72),
            body:payload.body.slice(0,200),
            icon:iconPath
          });
          notice.show();
        }
        break;
    }
  });

  ipcMain.on('clock-counter:snapshot',(event,snapshot)=>{
    if(!canUseFile(BrowserWindow.fromWebContents(event.sender)))return;
    if(!validClockId(snapshot?.id))return;
    const win=detached.get(snapshot.id);
    if(win&&!win.isDestroyed())win.webContents.send('clock-counter:clock-snapshot',snapshot);
  });
  ipcMain.on('clock-counter:detached-command',(event,command)=>{
    const win=BrowserWindow.fromWebContents(event.sender);
    if(!win||!mainWindow||mainWindow.isDestroyed())return;
    let id;
    for(const [clockId,candidate] of detached)if(candidate===win)id=clockId;
    if(!id||!['start-pause','reset','ack'].includes(command))return;
    mainWindow.webContents.send('clock-counter:remote-control',{id,command});
  });

  ipcMain.handle('clock-counter:import-sound',async(event)=>{
    if(!canUseFile(BrowserWindow.fromWebContents(event.sender)))return null;
    const result=await dialog.showOpenDialog(mainWindow,{
      title:'Choose a CLOCK COUNTER alarm',
      properties:['openFile'],
      filters:[{name:'Audio files',extensions:['mp3','wav','ogg']}]
    });
    if(result.canceled||!result.filePaths?.length)return null;
    const selected=result.filePaths[0];
    const ext=path.extname(selected).toLowerCase();
    if(!allowedSoundExtensions.has(ext))throw new Error('Unsupported audio format.');
    const stat=fs.statSync(selected);
    if(!stat.isFile()||stat.size>8*1024*1024)throw new Error('Audio file must be smaller than 8 MB.');
    const id=crypto.randomUUID();
    fs.mkdirSync(soundsDir(),{recursive:true});
    fs.copyFileSync(selected,path.join(soundsDir(),id+ext));
    const record={id,name:path.basename(selected).slice(0,100),ext};
    const manifest=readSounds();
    manifest.push(record);
    writeSounds(manifest);
    return {id,name:record.name};
  });
  ipcMain.handle('clock-counter:read-sound',async(event,id)=>{
    if(!canUseFile(BrowserWindow.fromWebContents(event.sender))||!allowedSoundId(id))return null;
    const record=readSounds().find(item=>item.id===id);
    if(!record||!allowedSoundExtensions.has(record.ext))return null;
    const file=path.join(soundsDir(),record.id+record.ext);
    try{
      const stat=fs.statSync(file);
      if(stat.size>8*1024*1024)return null;
      return {data:'data:'+allowedSoundExtensions.get(record.ext)+';base64,'+fs.readFileSync(file).toString('base64'),name:record.name};
    }catch{return null;}
  });
  ipcMain.handle('clock-counter:install-sounds',async(event,assets)=>{
    if(!canUseFile(BrowserWindow.fromWebContents(event.sender)))return {};
    if(!Array.isArray(assets)||assets.length>24)throw new Error('Too many sound assets.');
    const map={};
    const records=readSounds();
    let total=0;
    for(const asset of assets){
      if(!allowedSoundId(asset?.id)||!allowedSoundExtensions.has(asset?.ext)||
        typeof asset?.data!=='string'||asset.data.length>11*1024*1024||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(asset.data))
        throw new Error('Invalid sound asset.');
      const bytes=Buffer.from(asset.data,'base64');
      total+=bytes.length;
      if(bytes.length>8*1024*1024||total>24*1024*1024)
        throw new Error('Imported audio assets exceed safety limit.');
      // Always assign a fresh ID. Never overwrite an existing user's sound.
      const id=crypto.randomUUID();
      fs.mkdirSync(soundsDir(),{recursive:true});
      fs.writeFileSync(path.join(soundsDir(),id+asset.ext),bytes,{flag:'wx'});
      map[asset.id]=id;
      records.push({id,name:String(asset.name||'Imported sound').slice(0,100),ext:asset.ext});
    }
    if(assets.length)writeSounds(records);
    return map;
  });
  ipcMain.handle('clock-counter:export-setup',async(event,setup)=>{
    if(!canUseFile(BrowserWindow.fromWebContents(event.sender)))return false;
    if(!setup||setup.kind!=='clock-counter-setup')return false;
    const safeSetup=JSON.parse(JSON.stringify(setup));
    safeSetup.soundAssets=[];
    const ids=new Set((Array.isArray(safeSetup.clocks)?safeSetup.clocks:[])
      .map(c=>c?.customSoundId).filter(allowedSoundId));
    const records=readSounds();
    let totalBytes=0;
    for(const id of ids){
      const found=records.find(item=>item.id===id&&allowedSoundExtensions.has(item.ext));
      if(!found)continue;
      try{
        const buffer=fs.readFileSync(path.join(soundsDir(),found.id+found.ext));
        totalBytes+=buffer.length;
        if(buffer.length>8*1024*1024||totalBytes>24*1024*1024)
          throw new Error('Imported sounds exceed 24 MB total; reduce file sizes.');
        safeSetup.soundAssets.push({id,ext:found.ext,name:found.name,data:buffer.toString('base64')});
      }catch(err){
        if(err.code!=='ENOENT')throw err;
      }
    }
    const data=JSON.stringify(safeSetup,null,2);
    if(data.length>34*1024*1024)throw new Error('Setup is too large.');
    const result=await dialog.showSaveDialog(mainWindow,{
      title:'Export CLOCK COUNTER setup',defaultPath:'clock-counter-setup.json',
      filters:[{name:'CLOCK COUNTER setup',extensions:['json']}]
    });
    if(result.canceled||!result.filePath)return false;
    fs.writeFileSync(result.filePath,data,'utf8');
    return true;
  });
  ipcMain.handle('clock-counter:import-setup',async(event)=>{
    if(!canUseFile(BrowserWindow.fromWebContents(event.sender)))return null;
    const result=await dialog.showOpenDialog(mainWindow,{
      title:'Import CLOCK COUNTER setup',properties:['openFile'],
      filters:[{name:'CLOCK COUNTER setup',extensions:['json']}]
    });
    if(result.canceled||!result.filePaths?.length)return null;
    const file=result.filePaths[0],stat=fs.statSync(file);
    if(stat.size>34*1024*1024)throw new Error('Setup file is too large.');
    return JSON.parse(fs.readFileSync(file,'utf8'));
  });
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();else showMain();});
});
app.on('before-quit',()=>{isQuitting=true;});
app.on('window-all-closed',()=>{if(!trayEnabled||isQuitting)app.quit();});
