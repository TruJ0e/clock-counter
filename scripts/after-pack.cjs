'use strict';

// Safe Electron optimization for this English-language release.
// Chromium's locale resources are not used by CLOCK COUNTER itself.
// Keep en-US plus en-GB fallback; retain all graphics, codecs, licenses,
// ICU data, V8 snapshots and other runtime files.
const fs=require('node:fs');
const path=require('node:path');
module.exports=async function afterPack(context){
  if(context.electronPlatformName!=='win32')return;
  const dir=path.join(context.appOutDir,'locales');
  if(!fs.existsSync(dir))return;
  const keep=new Set(['en-us.pak','en-gb.pak']);
  let removed=0,bytes=0;
  for(const name of fs.readdirSync(dir)) {
    if(!name.toLowerCase().endsWith('.pak')||keep.has(name.toLowerCase()))continue;
    const file=path.join(dir,name);
    const stat=fs.statSync(file);
    if(!stat.isFile())continue;
    bytes+=stat.size;
    fs.rmSync(file);
    removed++;
  }
  console.log('CLOCK COUNTER lean package: removed '+removed+
    ' unused locale packs ('+(bytes/1024/1024).toFixed(1)+' MiB).');
};
