import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

const root=path.resolve(import.meta.dirname,'..');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'ttc-schedule-ui-'));
const app=await electron.launch({
  executablePath:path.join(root,'node_modules','electron','dist','electron.exe'),
  args:[root],cwd:root,timeout:45000,
  env:{...process.env,CLOCK_COUNTER_TEST_PROFILE:profile}
});
const failures=[];
async function step(name,fn){
  try{await fn();console.log('PASS '+name);}
  catch(error){failures.push(name+': '+(error.stack||error));console.error('FAIL '+name+': '+error.message);}
}
try{
  const page=await app.firstWindow({timeout:20000});
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  const tile=i=>page.locator('.clock-tile').nth(i);
  const initial=new Date(2026,10,16,16,56);
  await page.locator('.clock-tile').first().waitFor();
  await page.clock.install({time:initial});
  async function openDrawer(i=0){
    if(await tile(i).locator('.controls-drawer').getAttribute('data-collapsed')==='true')
      await tile(i).locator('.drawer-toggle').click();
  }
  async function schedule(i,time){
    await openDrawer(i);
    await tile(i).locator('.schedule-time').fill(time);
    await tile(i).locator('.schedule-set').click();
  }
  async function advance(ms) {
    await page.clock.fastForward(ms);
    await page.clock.runFor(350);
  }
  await step('Start At lives in the original sliding bottom drawer; defaults to top of hour',async()=>{
    assert.equal(await tile(0).locator('.schedule-time').count(),1);
    const nextHour=await tile(0).locator('.schedule-time').inputValue();
    assert.match(nextHour,/^(?:[01][0-9]|2[0-3]):00$/,'picker should default to the next full hour');
    assert.equal(await tile(0).locator('.schedule-cancel').isVisible(),false);
    await tile(0).locator('.minutes-field').fill('10');
    await tile(0).locator('.minutes-field').blur();
  });
  await step('at 4:56, schedule 5:00 and keep full duration until the target',async()=>{
    await schedule(0,'17:00');
    assert.equal(await tile(0).getAttribute('data-scheduled'),'true');
    assert.equal(await tile(0).getAttribute('data-running'),'false');
    assert.equal(await tile(0).locator('.time-readout').textContent(),'10:00');
    assert.match(await tile(0).locator('.mode-readout').textContent(),/START.*5:00\s*PM/);
    assert.equal(await tile(0).locator('.controls-drawer').getAttribute('data-collapsed'),'true');
    await advance(3*60000);
    assert.equal(await tile(0).getAttribute('data-running'),'false');
    assert.equal(await tile(0).locator('.time-readout').textContent(),'10:00');
  });
  await step('the schedule is visible in clock-only mode',async()=>{
    await page.locator('#clock-only').click();
    assert.equal(await page.locator('#app-shell').evaluate(el=>el.classList.contains('clock-only')),true);
    assert.equal(await tile(0).locator('.mode-readout').isVisible(),true);
    await page.locator('#focus-restore').click();
  });
  await step('at 5:00 it begins automatically and counts from that exact time',async()=>{
    await advance(61000);
    assert.equal(await tile(0).getAttribute('data-scheduled'),'false');
    assert.equal(await tile(0).getAttribute('data-running'),'true');
    const value=await tile(0).locator('.time-readout').textContent();
    assert.ok(value==='09:59'||value==='09:58','expected 09:59 after 1 second, got '+value);
  });
  await step('Cancel prevents a future automatic start and Play overrides it',async()=>{
    await openDrawer();
    await tile(0).locator('.reset').click();
    await schedule(0,'17:10');
    await openDrawer();
    await tile(0).locator('.schedule-cancel').click();
    assert.equal(await tile(0).getAttribute('data-scheduled'),'false');
    await schedule(0,'17:10');
    await openDrawer();
    await tile(0).locator('.play-pause').click();
    assert.equal(await tile(0).getAttribute('data-scheduled'),'false');
    assert.equal(await tile(0).getAttribute('data-running'),'true');
  });
  await step('two clocks can each have separate scheduled starts',async()=>{
    await openDrawer();
    await tile(0).locator('.reset').click();
    await schedule(0,'17:04');
    await page.locator('#add-clock').click();
    await schedule(1,'17:06');
    assert.equal(await tile(0).getAttribute('data-scheduled'),'true');
    assert.equal(await tile(1).getAttribute('data-scheduled'),'true');
    await advance(4*60000);
    assert.equal(await tile(0).getAttribute('data-running'),'true');
    assert.equal(await tile(1).getAttribute('data-running'),'false');
  });
  await step('Pause All cancels pending schedules, while running timers pause',async()=>{
    await page.locator('#all-pause').click();
    assert.equal(await tile(0).getAttribute('data-running'),'false');
    assert.equal(await tile(1).getAttribute('data-scheduled'),'false');
  });
  await step('schedules persist across reload if the deadline is still in the future',async()=>{
    await schedule(0,'17:20');
    const future=await tile(0).locator('.mode-readout').textContent();
    await page.reload();
    await tile(0).locator('.mode-readout').waitFor();
    assert.equal(await tile(0).getAttribute('data-scheduled'),'true');
    assert.equal(await tile(0).locator('.mode-readout').textContent(),future);
    assert.equal(await tile(0).getAttribute('data-running'),'false');
  });
  await step('no uncaught renderer errors',async()=>assert.deepEqual(errors,[]));
}finally{
  await app.close().catch(()=>{});
  await fs.rm(profile,{recursive:true,force:true,maxRetries:3}).catch(()=>{});
}
if(failures.length){console.error('\nSCHEDULE UI FAILURES:\n'+failures.join('\n\n'));process.exitCode=1;}
else console.log('\nAll scheduled-start desktop integration tests passed.');
