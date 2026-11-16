import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'ttc-update-ui-'));
const app=await electron.launch({
  executablePath:path.join(root,'node_modules','electron','dist','electron.exe'),
  args:[root],cwd:root,timeout:45000,
  env:{...process.env,CLOCK_COUNTER_TEST_PROFILE:profile}
});
try{
  const page=await app.firstWindow({timeout:20000});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const win=await app.browserWindow(page);
  const button=page.locator('#update-trigger');
  await button.waitFor();
  assert.equal(await button.isVisible(),true);
  assert.equal(await button.textContent(),'Update');
  const initial=await page.evaluate(()=>window.clockCounterWindow.getUpdateStatus());
  assert.equal(initial.phase,'unavailable','dev mode must never run installer');
  // Clicking Update is always a fresh manual IPC request, even if not installed.
  await button.click();
  await page.waitForFunction(()=>document.querySelector('#global-status').textContent.includes('Install CLOCK COUNTER'));
  assert.equal(await button.textContent(),'Update');
  // Verify the three progress states reach the existing top bar without reload.
  await win.evaluate(w=>w.webContents.send('clock-counter:update-status',{phase:'checking',message:'CHECKING FOR UPDATES'}));
  await page.waitForFunction(()=>document.querySelector('#update-trigger').textContent==='Checking…');
  assert.equal(await button.isDisabled(),true);
  await win.evaluate(w=>w.webContents.send('clock-counter:update-status',{phase:'downloading',message:'DOWNLOADING UPDATE — 45%',percent:45}));
  await page.waitForFunction(()=>document.querySelector('#update-trigger').textContent==='Updating…');
  assert.ok((await page.locator('#global-status').textContent()).includes('45%'));
  await win.evaluate(w=>w.webContents.send('clock-counter:update-status',{phase:'ready',message:'UPDATE READY — INSTALLS WHEN YOU QUIT'}));
  await page.waitForFunction(()=>document.querySelector('#update-trigger').textContent==='Update ready');
  assert.equal(await button.isDisabled(),false);
  assert.deepEqual(errors,[]);
  console.log('PASS desktop Update button, manual check IPC, and progress/ready status messages.');
}finally {
  await app.close().catch(()=>{});
  await fs.rm(profile,{recursive:true,force:true,maxRetries:3}).catch(()=>{});
}
