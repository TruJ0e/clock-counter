import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

const root=path.resolve(import.meta.dirname,'..');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'clock-counter-files-'));
const exe=path.join(root,'node_modules','electron','dist','electron.exe');
const soundFile=path.join(profile,'test-tone.wav');
const backupFile=path.join(profile,'saved-setup.json');
// Valid 0.1 second mono 8kHz PCM WAV for deterministic file-picker testing.
const samples=800, buffer=Buffer.alloc(44+samples*2);
buffer.write('RIFF',0);buffer.writeUInt32LE(36+samples*2,4);
buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);
buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);
buffer.writeUInt32LE(8000,24);buffer.writeUInt32LE(16000,28);
buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);
buffer.write('data',36);buffer.writeUInt32LE(samples*2,40);
await fs.writeFile(soundFile,buffer);

let app;
const errors=[],failed=[];
async function step(name,fn) {
  try{await fn();console.log('PASS '+name);}
  catch(error){failed.push(name+': '+(error.stack||error));console.error('FAIL '+name+': '+error.message);}
}
try {
  app=await electron.launch({executablePath:exe,args:[root],cwd:root,timeout:45000,
    env:{...process.env,CLOCK_COUNTER_TEST_PROFILE:profile}});
  const page=await app.firstWindow({timeout:20000});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.accept().catch(()=>{}));
  await page.locator('.clock-tile').first().waitFor();
  await app.evaluate(({dialog},soundFile)=>{
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[soundFile]});
  },soundFile);
  await step('native audio import accepts WAV and securely copies it into app profile',async()=>{
    await page.locator('.tile-settings').first().click();
    await page.locator('#import-custom-sound').click();
    await page.waitForFunction(()=>document.querySelector('#setting-alarm').value==='custom');
    assert.equal(await page.locator('#setting-alarm').inputValue(),'custom');
    assert.ok((await page.locator('#custom-sound-status').textContent()).includes('test-tone.wav'));
    const manifest=JSON.parse(await fs.readFile(path.join(profile,'alarms','index.json'),'utf8'));
    assert.equal(manifest.length,1);
    assert.equal(manifest[0].ext,'.wav');
    assert.equal((await fs.stat(path.join(profile,'alarms',manifest[0].id+'.wav'))).size,buffer.length);
    await page.locator('#done-settings').click();
  });
  await app.evaluate(({dialog},backupFile)=>{
    dialog.showSaveDialog=async()=>({canceled:false,filePath:backupFile});
  },backupFile);
  await step('setup export writes clocks, preferences and embedded audio bytes',async()=>{
    await page.locator('#file-trigger').click();
    await page.locator('#menu-export').click();
    let exists=false;
    for(let i=0;i<25;i++) {
      exists=await fs.access(backupFile).then(()=>true).catch(()=>false);
      if(exists)break;
      await page.waitForTimeout(70);
    }
    assert.equal(exists,true);
    await app.evaluate(({dialog},backupFile)=>{
      dialog.showOpenDialog=async()=>({canceled:false,filePaths:[backupFile]});
    },backupFile);
    const saved=JSON.parse(await fs.readFile(backupFile,'utf8'));
    assert.equal(saved.kind,'clock-counter-setup');
    assert.equal(saved.clocks.length,1);
    assert.equal(saved.clocks[0].alarm,'custom');
    assert.equal(saved.soundAssets.length,1);
    assert.equal(saved.soundAssets[0].ext,'.wav');
    assert.equal(Buffer.from(saved.soundAssets[0].data,'base64').length,buffer.length);
  });
  await step('setup import restores audio with a new ID without overwriting existing audio',async()=>{
    const old=JSON.parse(await fs.readFile(backupFile,'utf8')).clocks[0].customSoundId;
    await page.locator('.clock-tile .minutes-field').fill('5');
    await page.locator('.clock-tile .minutes-field').blur();
    assert.equal(await page.locator('.clock-tile .time-readout').textContent(),'05:00');
    await page.locator('#file-trigger').click();
    await page.locator('#menu-import').click();
    await page.waitForFunction(()=>document.querySelector('.clock-tile .time-readout').textContent==='30:00');
    const clock=JSON.parse(await page.evaluate(()=>localStorage.getItem('clock-counter:clocks:v3')))[0];
    assert.notEqual(clock.customSoundId,old);
    assert.equal(clock.alarm,'custom');
    const manifest=JSON.parse(await fs.readFile(path.join(profile,'alarms','index.json'),'utf8'));
    assert.equal(manifest.length,2);
    assert.equal(new Set(manifest.map(item=>item.id)).size,2);
    const info=await page.evaluate(id=>window.clockCounterWindow.readSound(id),clock.customSoundId);
    assert.ok(info.data.startsWith('data:audio/wav;base64,'));
    assert.equal(Buffer.from(info.data.split(',')[1],'base64').length,buffer.length);
  });
  await step('importing malformed backup does not replace existing clocks',async()=>{
    // UI's importBackup validates before mutating state.
    const bad=path.join(profile,'invalid-setup.json');
    await fs.writeFile(bad,JSON.stringify({kind:'other',version:1,clocks:[]}));
    await app.evaluate(({dialog},bad)=>{
      dialog.showOpenDialog=async()=>({canceled:false,filePaths:[bad]});
    },bad);
    const before=await page.locator('.clock-tile .time-readout').textContent();
    await page.locator('#file-trigger').click();
    await page.locator('#menu-import').click();
    await page.waitForTimeout(120);
    assert.equal(await page.locator('.clock-tile .time-readout').textContent(),before);
    assert.ok((await page.locator('#global-status').textContent()).includes('IMPORT FAILED'));
  });
  await step('native file operations cause no uncaught renderer errors',async()=>{
    assert.deepEqual(errors,[]);
  });
}finally{
  if(app)await app.close().catch(()=>{});
  await fs.rm(profile,{recursive:true,force:true,maxRetries:3}).catch(()=>{});
}
if(failed.length){
  console.error('\nFILE TEST FAILURES:\n'+failed.join('\n\n'));process.exitCode=1;
}else console.log('\nAll native setup and audio tests passed.');
