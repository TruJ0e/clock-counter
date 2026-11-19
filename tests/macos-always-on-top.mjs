import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

if(process.platform!=='darwin'){
  console.log('SKIP macOS-specific Always on Top test on '+process.platform);
  process.exit(0);
}
const root=path.resolve(import.meta.dirname,'..');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'ttc-mac-top-'));
const executablePath=path.join(root,'node_modules','electron','dist','Electron.app','Contents','MacOS','Electron');
let app=null;
let page=null;
let nativeWin=null;
const errors=[];

async function launch() {
  app=await electron.launch({
    executablePath,
    args:[root],
    cwd:root,
    timeout:45000,
    env:{...process.env,CLOCK_COUNTER_TEST_PROFILE:profile}
  });
  page=await app.firstWindow({timeout:20000});
  page.on('pageerror',error=>errors.push(error.message));
  nativeWin=await app.browserWindow(page);
  await page.locator('#menu-top').waitFor({state:'attached'});
}

async function nativeState() {
  return nativeWin.evaluate(win=>({
    alwaysOnTop:win.isAlwaysOnTop(),
    allWorkspaces:win.isVisibleOnAllWorkspaces(),
    visible:win.isVisible()
  }));
}
async function toggle() {
  await page.locator('#file-trigger').click();
  await page.locator('#menu-top').click();
  await page.waitForTimeout(400);
}

try {
  await launch();
  let state=await nativeState();
  assert.equal(state.alwaysOnTop,false,'initially not floating');
  assert.equal(state.allWorkspaces,false,'initially limited to desktop Space');

  await toggle();
  state=await nativeState();
  assert.equal(state.alwaysOnTop,true,'menu enables floating above other apps');
  assert.equal(state.allWorkspaces,true,'menu enables macOS Spaces and full-screen visibility');
  assert.equal(await page.locator('#menu-top').getAttribute('aria-pressed'),'true');
  console.log('PASS macOS File Always on Top enables floating window and all Spaces');

  await toggle();
  state=await nativeState();
  assert.equal(state.alwaysOnTop,false,'menu disables floating level');
  assert.equal(state.allWorkspaces,false,'menu returns to normal macOS Space');
  assert.equal(await page.locator('#menu-top').getAttribute('aria-pressed'),'false');
  console.log('PASS macOS File Always on Top turns off completely');

  await toggle();
  assert.equal((await nativeState()).allWorkspaces,true);
  await app.close();
  app=null;
  await launch();
  state=await nativeState();
  assert.equal(state.alwaysOnTop,true,'floating preference survives app relaunch');
  assert.equal(state.allWorkspaces,true,'Space visibility survives app relaunch');
  assert.equal(await page.locator('#menu-top').getAttribute('aria-pressed'),'true');
  console.log('PASS macOS Always on Top restores saved workspace visibility');
  assert.deepEqual(errors,[],'no renderer errors');
  console.log('ALL_MACOS_NATIVE_ALWAYS_ON_TOP_CHECKS_PASSED');
} finally {
  if(app)await app.close().catch(()=>{});
  await fs.rm(profile,{recursive:true,force:true,maxRetries:3}).catch(()=>{});
}
