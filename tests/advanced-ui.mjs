import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

const root=path.resolve(import.meta.dirname,'..');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'clock-counter-advanced-'));
const executablePath=path.join(root,'node_modules','electron','dist','electron.exe');
const failures=[];
let app;
async function step(name,run){
  try {await run();console.log('PASS '+name);}
  catch(err){failures.push(name+': '+(err.stack||err));console.error('FAIL '+name+': '+err.message);}
}
try{
  app=await electron.launch({executablePath,args:[root],cwd:root,timeout:45000,
    env:{...process.env,CLOCK_COUNTER_TEST_PROFILE:profile}});
  const page=await app.firstWindow({timeout:20000});
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  const win=await app.browserWindow(page);
  const tiles=()=>page.locator('.clock-tile');
  const tile=i=>tiles().nth(i);
  async function fileClick(id){
    await page.locator('#file-trigger').click();
    await page.locator(id).click();
  }
  async function settings(i=0){
    await tile(i).locator('.tile-settings').click();
    await page.locator('#settings-dialog').waitFor({state:'visible'});
  }
  async function advance(ms){
    await page.clock.fastForward(ms);
    await page.clock.runFor(60);
  }
  async function drawer(i=0){
    if(await tile(i).locator('.controls-drawer').getAttribute('data-collapsed')==='true')
      await tile(i).locator('.drawer-toggle').click();
  }
  async function setSeconds(seconds,i=0){
    await drawer(i);
    await tile(i).locator('.minutes-field').fill('0');
    await tile(i).locator('.minutes-field').blur();
    await tile(i).locator('.seconds-field').fill(String(seconds));
    await tile(i).locator('.seconds-field').blur();
  }

  await step('presets save, list, apply, and reload',async()=>{
    await fileClick('#menu-library');
    await page.locator('#preset-name').fill('Seven minutes');
    await page.locator('#preset-minutes').fill('7');
    await page.locator('#preset-save').click();
    assert.ok((await page.locator('#presets-list').textContent()).includes('Seven minutes'));
    await page.locator('#library-done').click();
    await page.locator('#file-trigger').click();
    await page.locator('.custom-preset-menu .preset-item').filter({hasText:'Seven minutes'}).click();
    assert.equal(await tile(0).locator('.time-readout').textContent(),'07:00');
  });
  await step('activity collections save stages and apply sequence',async()=>{
    await fileClick('#menu-library');
    await page.locator('#collection-name').fill('Read then rest');
    await page.locator('#step-name').fill('Reading');
    await page.locator('#step-minutes').fill('1');
    await page.locator('#step-icon').selectOption('reading');
    await page.locator('#step-color').fill('#2486f2');
    await page.locator('#step-add').click();
    await page.locator('#step-name').fill('Break');
    await page.locator('#step-minutes').fill('1');
    await page.locator('#step-icon').selectOption('break');
    await page.locator('#step-color').fill('#24c45e');
    await page.locator('#step-add').click();
    await page.locator('#collection-save').click();
    const item=page.locator('#collections-list .library-item').filter({hasText:'Read then rest'});
    assert.equal(await item.count(),1);
    await item.getByText('Use',{exact:true}).click();
    assert.equal(await tile(0).getAttribute('data-mode'),'sequence');
    assert.equal(await tile(0).locator('.time-readout').textContent(),'01:00');
    assert.equal(await tile(0).locator('.mode-readout').textContent(),'READING');
    assert.equal(await tile(0).locator('.task-symbol').isVisible(),true);
    assert.equal(await tile(0).locator('.step-label').textContent(),'1/2');
  });
  await page.clock.install();
  await step('sequential timers move to the next step automatically',async()=>{
    await tile(0).locator('.play-pause').click();
    await advance(60400);
    assert.equal(await tile(0).getAttribute('data-mode'),'sequence');
    assert.equal(await tile(0).locator('.mode-readout').textContent(),'BREAK');
    assert.equal(await tile(0).locator('.step-label').textContent(),'2/2');
    await advance(60400);
    assert.equal(await tile(0).getAttribute('data-running'),'false');
    assert.equal(await tile(0).locator('.time-readout').textContent(),'00:00');
    await fileClick('#menu-timer-reset');
  });
  await step('work/break scheduler builds the correct rounds',async()=>{
    await settings();
    await page.locator('#setting-mode').selectOption('workbreak');
    await page.locator('#setting-work-min').fill('1');
    await page.locator('#setting-work-min').blur();
    await page.locator('#setting-break-min').fill('1');
    await page.locator('#setting-break-min').blur();
    await page.locator('#setting-long-min').fill('2');
    await page.locator('#setting-long-min').blur();
    await page.locator('#setting-rounds').fill('2');
    await page.locator('#setting-rounds').blur();
    await page.locator('#done-settings').click();
    assert.equal(await tile(0).getAttribute('data-mode'),'workbreak');
    assert.equal(await tile(0).locator('.step-label').textContent(),'1/4');
  });
  await step('stopwatch counts upward with configurable duration goal',async()=>{
    await settings();
    await page.locator('#setting-mode').selectOption('stopwatch');
    await page.locator('#setting-stopwatch-goal').fill('1');
    await page.locator('#setting-stopwatch-goal').blur();
    await page.locator('#done-settings').click();
    assert.equal(await tile(0).getAttribute('data-mode'),'stopwatch');
    await drawer();
    await tile(0).locator('.play-pause').click();
    await advance(3200);
    const actual=await tile(0).locator('.time-readout').textContent();
    assert.ok(['00:03','00:04','00:05'].includes(actual),'stopwatch '+actual);
    await fileClick('#menu-timer-reset');
    assert.equal(await tile(0).locator('.time-readout').textContent(),'00:00');
  });
  await step('warning thresholds, semantic markers, task pictogram and hide time on Play',async()=>{
    await settings();
    await page.locator('#setting-mode').selectOption('countdown');
    await page.locator('#setting-task-icon').selectOption('reading');
    await page.locator('#setting-progress-markers').check();
    await page.locator('#setting-hide-on-play').check();
    await page.locator('#setting-warning').check();
    await page.locator('#setting-warning-percent').fill('50');
    await page.locator('#setting-warning-percent').blur();
    await page.locator('#setting-critical-percent').fill('20');
    await page.locator('#setting-critical-percent').blur();
    await page.locator('#setting-warning-color').fill('#ffff00');
    await page.locator('#setting-critical-color').fill('#00ff00');
    await page.locator('#setting-checkpoints').check();
    await page.locator('#setting-checkpoint-values').fill('50,20');
    await page.locator('#setting-checkpoint-values').blur();
    await page.locator('#done-settings').click();
    assert.equal(await tile(0).locator('.progress-markings line').count(),3);
    assert.equal(await tile(0).locator('.task-symbol').isVisible(),true);
    await setSeconds(10);
    await tile(0).locator('.play-pause').click();
    assert.equal(await tile(0).locator('.time-readout').isVisible(),false);
    await advance(6300);
    assert.equal(await tile(0).locator('.dial').getAttribute('data-color'),'#FFFF00');
    await advance(2400);
    assert.equal(await tile(0).locator('.dial').getAttribute('data-color'),'#00FF00');
    await fileClick('#menu-timer-reset');
    assert.equal(await tile(0).locator('.time-readout').isVisible(),true);
  });
  await step('overtime counts up after zero; persistent alarm requires acknowledgement',async()=>{
    await settings();
    await page.locator('#setting-overtime').check();
    await page.locator('#setting-persistent').check();
    await page.locator('#setting-hide-on-play').uncheck();
    await page.locator('#done-settings').click();
    await setSeconds(2);
    await tile(0).locator('.play-pause').click();
    await advance(3500);
    assert.equal(await tile(0).getAttribute('data-alarm-active'),'true');
    assert.equal(await tile(0).getAttribute('data-running'),'true');
    assert.ok((await tile(0).locator('.time-readout').textContent()).startsWith('+'));
    assert.equal(await tile(0).locator('.ack-alarm').isVisible(),true);
    await tile(0).locator('.ack-alarm').click();
    assert.equal(await tile(0).getAttribute('data-alarm-active'),'false');
    await advance(4000);
    assert.equal(await tile(0).getAttribute('data-alarm-active'),'false');
    await fileClick('#menu-timer-reset');
  });
  await step('layout collection saves multiple clock settings',async()=>{
    await page.locator('#add-clock').click();
    assert.equal(await tiles().count(),2);
    await fileClick('#menu-library');
    await page.locator('#layout-name').fill('Two clock layout');
    await page.locator('#layout-save').click();
    const item=page.locator('#collections-list .library-item').filter({hasText:'Two clock layout'});
    assert.equal(await item.count(),1);
    await page.locator('#library-done').click();
    await tile(1).locator('.tile-remove').click();
    assert.equal(await tiles().count(),1);
    await fileClick('#menu-library');
    await page.locator('#collections-list .library-item').filter({hasText:'Two clock layout'}).getByText('Use',{exact:true}).click();
    assert.equal(await tiles().count(),2);
  });
  await step('drag reordering changes visual order of independent clocks',async()=>{
    const before=await page.locator('.clock-tile').evaluateAll(nodes=>nodes.map(n=>n.dataset.clockId));
    await tile(0).locator('.drag-handle').dragTo(tile(1));
    const after=await page.locator('.clock-tile').evaluateAll(nodes=>nodes.map(n=>n.dataset.clockId));
    assert.deepEqual(after,[before[1],before[0]]);
  });
  await step('control lock blocks edits and native resizing until unlocked',async()=>{
    await fileClick('#menu-lock');
    await page.waitForFunction(()=>document.querySelector('#lock-check').textContent.trim()==='✓');
    assert.equal(await tile(0).locator('.play-pause').isDisabled(),true);
    assert.equal(await tile(0).locator('.minutes-field').isDisabled(),true);
    await page.waitForTimeout(100);
    assert.equal(await win.evaluate(w=>w.isResizable()),false);
    await fileClick('#menu-lock');
    await page.waitForFunction(()=>document.querySelector('#lock-check').textContent.trim()==='');
    assert.equal(await win.evaluate(w=>w.isResizable()),true);
    assert.equal(await tile(0).locator('.minutes-field').isDisabled(),false);
  });
  await step('floating clock opens separate window; controls synchronize',async()=>{
    await tile(0).locator('.detach-clock').click();
    await page.waitForTimeout(450);
    const windows=app.windows();
    assert.ok(windows.length>=2,'expected detached window, got '+windows.length);
    const floating=windows.find(w=>w!==page&&w.url().includes('detached.html'));
    assert.ok(floating,'floating window not found');
    await floating.locator('#float-name').waitFor();
    await floating.waitForFunction(()=>document.querySelector('#float-readout').textContent!=='--:--',{timeout:5000});
    const old=await tile(0).getAttribute('data-running');
    await floating.locator('#float-play').click();
    await page.waitForFunction(([id,expected])=>{
      const el=document.querySelector('[data-clock-id="'+id+'"]');
      return el&&el.dataset.running!==expected;
    },[await tile(0).getAttribute('data-clock-id'),old]);
    await floating.locator('#float-reset').click();
    await page.waitForTimeout(100);
    assert.equal(await tile(0).getAttribute('data-running'),'false');
    await floating.locator('#float-close').click();
  });
  await step('system tray retains timers when main window is hidden',async()=>{
    await fileClick('#menu-tray');
    await page.waitForFunction(()=>document.querySelector('#tray-check').textContent.trim()==='✓');
    await fileClick('#menu-hide-tray');
    await page.waitForTimeout(100);
    assert.equal(await win.evaluate(w=>w.isVisible()),false);
    await page.evaluate(()=>window.clockCounterWindow.action('show-main'));
    await page.waitForFunction(()=>document.visibilityState==='visible');
    assert.equal(await win.evaluate(w=>w.isVisible()),true);
    await fileClick('#menu-tray');
  });
  await step('renderer does not crash during advanced interactions',async()=>{
    assert.deepEqual(errors,[]);
  });
} finally {
  if(app)await app.close().catch(()=>{});
  await fs.rm(profile,{recursive:true,force:true,maxRetries:4}).catch(()=>{});
}
if(failures.length){
  console.error('\nADVANCED TEST FAILURES:\n'+failures.join('\n\n'));
  process.exitCode=1;
}else console.log('\nAll advanced CLOCK COUNTER UI tests passed.');
