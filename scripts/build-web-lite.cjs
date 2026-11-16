'use strict';
// Build a self-contained, offline single-file CLOCK COUNTER browser edition.
// No external JS/CSS/fonts/network. Uses the same timer engine & UI as Electron.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const shim=String.raw`
(function(){
  'use strict';
  const prefix='clock-counter:web-sound:';
  const makeId=()=> 'web-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);
  function pick(accept) {
    return new Promise(resolve=>{
      const input=document.createElement('input');
      input.type='file';
      input.accept=accept;
      input.style.display='none';
      document.body.append(input);
      let done=false;
      const finish=value=>{if(done)return;done=true;input.remove();resolve(value);};
      input.onchange=()=>finish(input.files?.[0]||null);
      window.addEventListener('focus',()=>{
        setTimeout(()=>{if(!input.files?.length)finish(null);},350);
      },{once:true});
      input.click();
    });
  }
  function readAsDataURL(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result);
      reader.onerror=()=>reject(new Error('Could not read selected file'));
      reader.readAsDataURL(file);
    });
  }
  window.clockCounterWindow={
    action(name){
      if(name==='toggle-fullscreen'){
        if(document.fullscreenElement) document.exitFullscreen().catch(()=>{});
        else document.documentElement.requestFullscreen?.().catch(()=>{});
      }
      // Window controls, native tray and detach are intentionally unavailable.
    },
    onAlwaysOnTop(){return ()=>{}},
    onNativeState(){return ()=>{}},
    onTrayAction(){return ()=>{}},
    onRemoteControl(){return ()=>{}},
    onRequestSnapshot(){return ()=>{}},
    onDetachedState(){return ()=>{}},
    publishSnapshot(){},
    closeDetached(){},
    async importSound(){
      const file=await pick('.mp3,.wav,.ogg,audio/*');
      if(!file)return null;
      if(file.size>1200000)throw new Error('Browser edition supports audio files up to 1.2 MB');
      const id=makeId();
      const data=await readAsDataURL(file);
      try{
        localStorage.setItem(prefix+id,JSON.stringify({data,name:file.name.slice(0,100),
          ext:file.name.toLowerCase().split('.').pop()}));
      }catch{
        throw new Error('Browser storage is full. Choose a smaller sound.');
      }
      return {id,name:file.name.slice(0,100)};
    },
    async readSound(id){
      try{
        const data=localStorage.getItem(prefix+id);
        return data?JSON.parse(data):null;
      }catch{return null;}
    },
    async installSounds(assets){
      const map={};
      for(const asset of Array.isArray(assets)?assets.slice(0,12):[]){
        if(typeof asset.data!=='string'||asset.data.length>1800000)continue;
        const id=makeId(),ext=asset.ext||'.wav';
        const mime=ext==='.mp3'?'audio/mpeg':ext==='.ogg'?'audio/ogg':'audio/wav';
        try{
          localStorage.setItem(prefix+id,JSON.stringify({
            data:'data:'+mime+';base64,'+asset.data,
            name:String(asset.name||'Imported audio').slice(0,100),
            ext:ext.replace('.','')
          }));
          map[asset.id]=id;
        }catch { /* storage can be smaller on local file origins */ }
      }
      return map;
    },
    async exportSetup(setup){
      const safe=structuredClone(setup);
      safe.soundAssets=[];
      for(const clock of safe.clocks||[]){
        const id=clock.customSoundId;
        if(!id)continue;
        try{
          const sound=JSON.parse(localStorage.getItem(prefix+id)||'null');
          const match=sound?.data?.match(/^data:(audio\/[^;]+);base64,(.+)$/);
          if(match){
            const ext=match[1]==='audio/mpeg'?'.mp3':match[1]==='audio/ogg'?'.ogg':'.wav';
            safe.soundAssets.push({id,ext,name:sound.name||'Audio',data:match[2]});
          }
        }catch{}
      }
      const blob=new Blob([JSON.stringify(safe,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;a.download='clock-counter-setup.json';
      a.click();
      setTimeout(()=>URL.revokeObjectURL(url),15000);
      return true;
    },
    async importSetup(){
      const file=await pick('.json,application/json');
      if(!file)return null;
      if(file.size>8000000)throw new Error('Setup too large for browser edition');
      return JSON.parse(await file.text());
    }
  };
})();
`;
const parts=['src/timer-core.js','src/clocks.js','src/library.js','src/alarms.js','src/renderer.js'];
let js='';
for(const name of parts){
  let text=read(name);
  // Each module imports names from earlier modules. Inlining into the same
  // function scope preserves bindings while avoiding file:// CORS restrictions.
  text=text.replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm,'');
  text=text.replace(/^export\s+(?=(?:const|let|function|class)\b)/gm,'');
  if(/(?:^|\n)\s*(?:import|export)\b/m.test(text))throw new Error('Unprocessed module directive in '+name);
  js+='\n/* '+name+' */\n'+text+'\n';
}
let html=read('index.html');
html=html.replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/,
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; media-src data: blob:; connect-src \'none\'; object-src \'none\'; base-uri \'none\'">');
html=html.replace('<link rel="stylesheet" href="./src/styles.css">',
  '<style>'+read('src/styles.css')+'\n'+String.raw`
    .window-controls,.clock-only-toggle+.browser-only-hide { display:none!important; }
    #window-minimize,#window-maximize,#window-close,
    #menu-top,#menu-tray,#menu-hide-tray,#menu-detach,#menu-exit,#update-trigger,
    .detach-clock,.resize-grip { display:none!important; }
    .status-hint{display:none}
    .titlebar{-webkit-app-region:no-drag}
    .focus-drag{display:none!important}
  `+'</style>');
html=html.replace('<script type="module" src="./src/renderer.js"></script>',
  '<script>\n'+shim+'\n'+js+'\n</script>');
html=html.replace(/<title>CLOCK COUNTER<\/title>/,'<title>CLOCK COUNTER — Browser Edition</title>');
const result=path.join(root,'dist','CLOCK COUNTER WEB LITE.html');
fs.mkdirSync(path.dirname(result),{recursive:true});
fs.writeFileSync(result,html);
const shareable=path.join(root,'web-lite','CLOCK COUNTER WEB LITE.html');
fs.mkdirSync(path.dirname(shareable),{recursive:true});
fs.writeFileSync(shareable,html);
console.log('Built self-contained browser edition: '+result+' ('+fs.statSync(result).size+' bytes)');
