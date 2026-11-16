// Runs against a real Electron process and isolated user preferences.
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

const root = path.resolve(import.meta.dirname, '..');
const executablePath = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'clock-counter-e2e-'));
const launchOptions = {
  executablePath, args: [root], cwd: root, timeout: 45000,
  env: { ...process.env, CLOCK_COUNTER_TEST_PROFILE: profile }
};
const shotDir = path.join(root, 'tests', 'screenshots');
await fs.mkdir(shotDir, { recursive: true });

let app, page, win;
const errors = [], failures = [];
const clocks = () => page.locator('.clock-tile');
const clock = index => clocks().nth(index);
function parseCountdown(text) {
  return text.split(':').reduce((total, segment) => total * 60 + Number(segment), 0);
}
async function expectRemainingNear(index, expectedSeconds, tolerance = 2) {
  const text = await clock(index).locator('.time-readout').textContent();
  const actual = parseCountdown(text);
  assert.ok(Math.abs(actual - expectedSeconds) <= tolerance,
    'expected about ' + expectedSeconds + ' seconds, found ' + text);
  return actual;
}
async function openControls(index) {
  const tile = clock(index);
  if (await tile.locator('.controls-drawer').getAttribute('data-collapsed') === 'true') {
    await tile.locator('.drawer-toggle').click();
  }
}
async function clickPlay(index) {
  await openControls(index);
  await clock(index).locator('.play-pause').click();
}
async function clickReset(index) {
  await openControls(index);
  await clock(index).locator('.reset').click();
}
async function step(name, task) {
  try { await task(); console.log('PASS ' + name); }
  catch(error) { failures.push(name + ': ' + (error.stack || error)); console.error('FAIL ' + name + ': ' + error.message); }
}
async function start() {
  app = await electron.launch(launchOptions);
  page = await app.firstWindow({timeout: 20000});
  await page.locator('.clock-tile').first().waitFor({timeout: 20000});
  win = await app.browserWindow(page);
  page.on('pageerror', error => errors.push(error.message));
}
async function advance(ms) {
  await page.clock.fastForward(ms);
  // Playwright fastForward may invoke a timer before updating its mocked Date.now.
  // Run one real interval on the advanced clock before reading rendered state.
  await page.clock.runFor(55);
}
async function settingsFor(index) {
  await clock(index).locator('.tile-settings').click();
  await page.locator('#settings-dialog').waitFor({ state: 'visible' });
}

try {
  await start();
  await step('single mini-window starts red and shows 30 minutes', async () => {
    assert.equal(await clocks().count(), 1);
    assert.equal(await clock(0).locator('.time-readout').textContent(), '30:00');
    assert.equal(await clock(0).locator('.dial-markings line').count(), 24);
    assert.equal(await clock(0).locator('.dial').getAttribute('data-direction'), 'cw');
    assert.equal(await clock(0).locator('.dial').getAttribute('data-color'), '#F20B14');
    assert.equal(await page.locator('#clock-board').evaluate(el => el.classList.contains('single')), true);
    const b = await win.evaluate(w=>w.getBounds());
    assert.ok(b.width <= 500 && b.height <= 580);
    const d = await clock(0).locator('.dial').boundingBox();
    assert.ok(d.width > 170 && d.height > 170, 'countdown pie visible');
  });
  await page.screenshot({path:path.join(shotDir,'v0.3-single.png')});

  await step('custom duration starts with full dial and ticks accurately', async () => {
    await clock(0).locator('.minutes-field').fill('10');
    await clock(0).locator('.minutes-field').blur();
    assert.equal(await clock(0).locator('.time-readout').textContent(), '10:00');
    assert.equal(await clock(0).locator('.dial').evaluate(el=>el.style.getPropertyValue('--elapsed')), '0.00000%');
  });

  await page.clock.install();
  await step('pause and resume use correct deadlines', async () => {
    await clickPlay(0);
    await advance(5000);
    const afterFive = await expectRemainingNear(0, 595, 1);
    await clickPlay(0);
    const paused = await clock(0).locator('.time-readout').textContent();
    await advance(3000);
    assert.equal(await clock(0).locator('.time-readout').textContent(), paused);
    await clickPlay(0);
    await advance(2000);
    const afterResume = parseCountdown(await clock(0).locator('.time-readout').textContent());
    assert.ok(afterFive - afterResume >= 2 && afterFive - afterResume <= 4,
      'resume should advance approximately 2 seconds');
    await clickReset(0);
    assert.equal(await clock(0).locator('.time-readout').textContent(),'10:00');
  });

  await step('adding another clock grows window into two side-by-side columns', async () => {
    await page.locator('#add-clock').click();
    assert.equal(await clocks().count(), 2);
    await page.waitForTimeout(250);
    const a=await clock(0).boundingBox(), b=await clock(1).boundingBox();
    assert.ok(b.x > a.x + 100, JSON.stringify({a,b}));
    assert.equal(await clock(1).locator('.time-readout').textContent(),'30:00');
    assert.equal(await page.locator('#clock-board').evaluate(el=>el.classList.contains('single')), false);
  });
  await page.screenshot({path:path.join(shotDir,'v0.3-multiple.png')});

  await step('second clock accepts independent duration, direction, color and alarms', async () => {
    await clock(1).locator('.seconds-field').fill('5');
    await clock(1).locator('.seconds-field').blur();
    await clock(1).locator('.minutes-field').fill('0');
    await clock(1).locator('.minutes-field').blur();
    assert.equal(await clock(1).locator('.time-readout').textContent(), '00:05');
    assert.equal(await clock(0).locator('.time-readout').textContent(), '10:00');
    await settingsFor(1);
    await page.locator('#setting-direction').selectOption('ccw');
    await page.locator('.color-swatch[data-color="#24C45E"]').click();
    await page.locator('#setting-alarm').selectOption('bell');
    await page.locator('#preview-alarm').click();
    await page.locator('#setting-volume').fill('50');
    await page.locator('#setting-repeat').check();
    await page.locator('#setting-show-time').uncheck();
    assert.equal(await clock(1).locator('.time-readout').isVisible(),false);
    await page.locator('#setting-show-time').check();
    await page.locator('#setting-show-ticks').uncheck();
    assert.equal(await clock(1).locator('.dial-markings').isVisible(),false);
    await page.locator('#setting-show-ticks').check();
    await page.locator('#done-settings').click();
    assert.equal(await clock(1).locator('.dial').getAttribute('data-color'),'#24C45E');
    assert.equal(await clock(1).locator('.dial').getAttribute('data-direction'),'ccw');
    assert.equal(await clock(1).getAttribute('data-repeat'),'true');
    assert.equal(await clock(0).locator('.dial').getAttribute('data-direction'),'cw');
    assert.equal(await clock(0).locator('.dial').getAttribute('data-color'),'#F20B14');
  });

  await step('clocks run independently; repeating clock maintains valid visual phase', async () => {
    await clickPlay(0);
    await clickPlay(1);
    const firstStart=parseCountdown(await clock(0).locator('.time-readout').textContent());
    await advance(13000);
    const firstEnd=parseCountdown(await clock(0).locator('.time-readout').textContent());
    assert.ok(firstStart-firstEnd>=12&&firstStart-firstEnd<=16,
      'clock 0 must advance approximately 13 seconds');
    const repeatCycles=Number(await clock(1).getAttribute('data-cycles'));
    assert.ok(repeatCycles>=2,'repeating clock should complete at least two rounds');
    assert.equal(await clock(1).getAttribute('data-running'),'true');
    const percentage=await clock(1).locator('.dial').evaluate(el=>parseFloat(el.style.getPropertyValue('--remaining')));
    assert.ok(percentage>0&&percentage<=100,'repeating pie remains in valid range');
    assert.equal(await clock(1).locator('.cycle-count').textContent(),repeatCycles+'×');
  });

  await step('pausing one clock does not affect the other repeating clock', async () => {
    await clickPlay(0);
    const paused=await clock(0).locator('.time-readout').textContent();
    const cyclesBefore=Number(await clock(1).getAttribute('data-cycles'));
    await advance(7000);
    assert.equal(await clock(0).locator('.time-readout').textContent(),paused);
    assert.ok(Number(await clock(1).getAttribute('data-cycles'))>cyclesBefore);
  });

  await step('global pause, start and reset operate on all clocks', async () => {
    await page.locator('#all-pause').click();
    assert.equal(await clock(1).getAttribute('data-running'),'false');
    const stopped=await clock(1).locator('.time-readout').textContent();
    await advance(7000);
    assert.equal(await clock(1).locator('.time-readout').textContent(),stopped);
    await page.locator('#all-start').click();
    assert.equal(await clock(0).getAttribute('data-running'),'true');
    assert.equal(await clock(1).getAttribute('data-running'),'true');
    await page.locator('#all-reset').click();
    assert.equal(await clock(0).locator('.time-readout').textContent(),'10:00');
    assert.equal(await clock(1).locator('.time-readout').textContent(),'00:05');
    assert.equal(await clock(1).getAttribute('data-cycles'),'0');
  });

  await step('named clocks can be duplicated and removed', async () => {
    await clock(1).locator('.clock-name').fill('Activity');
    await clock(1).locator('.clock-name').blur();
    await settingsFor(1);
    await page.locator('#duplicate-clock').click();
    assert.equal(await clocks().count(), 3);
    assert.equal(await clock(2).locator('.clock-name').inputValue(),'Activity copy');
    assert.equal(await clock(2).locator('.dial').getAttribute('data-direction'),'ccw');
    assert.equal(await clock(2).locator('.dial').getAttribute('data-color'),'#24C45E');
    await clock(2).locator('.tile-remove').click();
    assert.equal(await clocks().count(),2);
  });

  await step('file presets affect only the selected clock', async () => {
    await clock(1).locator('.clock-name').click();
    const previous=await clock(0).locator('.time-readout').textContent();
    await page.locator('#file-trigger').click();
    await page.locator('[data-preset="900"]').click();
    assert.equal(await clock(1).locator('.time-readout').textContent(),'15:00');
    assert.equal(await clock(0).locator('.time-readout').textContent(),previous);
  });

  await step('custom colors, other alarm sounds, and setting changes persist', async () => {
    await settingsFor(0);
    await page.locator('#setting-color').fill('#123abc');
    await page.locator('#setting-alarm').selectOption('digital');
    await page.locator('#setting-show-ticks').uncheck();
    await page.locator('#done-settings').click();
    assert.equal(await clock(0).locator('.dial').getAttribute('data-color'),'#123ABC');
    assert.equal(await clock(0).locator('.dial-markings').isVisible(),false);
    await settingsFor(0);
    assert.equal(await page.locator('#setting-color').inputValue(),'#123abc');
    assert.equal(await page.locator('#setting-alarm').inputValue(),'digital');
    await page.locator('#done-settings').click();
  });

  await step('window can shrink below old minimum and expand freely', async () => {
    await win.evaluate(w=>w.setBounds({width:250,height:260}));
    await page.waitForTimeout(130);
    let b=await win.evaluate(w=>w.getBounds());
    assert.ok(b.width <= 270 && b.height <= 280,JSON.stringify(b));
    assert.equal(await page.locator('#add-clock').isVisible(),true);
    assert.ok(await clock(0).locator('.dial').count()===1);
    const grip = await page.locator('#resize-grip').boundingBox();
    await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);
    await page.mouse.down();
    await page.mouse.move(grip.x+grip.width/2+110,grip.y+grip.height/2+90,{steps:6});
    await page.mouse.up();
    await page.waitForTimeout(120);
    b=await win.evaluate(w=>w.getBounds());
    assert.ok(b.width > 270 && b.height > 280,'resize handle should grow window: '+JSON.stringify(b));
    await win.evaluate(w=>w.setBounds({width:1150,height:800}));
    await page.waitForTimeout(120);
    b=await win.evaluate(w=>w.getBounds());
    assert.ok(b.width>=1000 && b.height>=700,JSON.stringify(b));
    const a=await clock(0).boundingBox(), c=await clock(1).boundingBox();
    assert.ok(c.x>a.x+100,'two columns should appear after resizing');
  });
  await page.screenshot({path:path.join(shotDir,'v0.3-large.png')});

  let expectedTop = false;
  await step('file menu and keyboard shortcuts work in the compact window', async () => {
    await win.evaluate(w=>w.setBounds({width:300,height:350}));
    await page.locator('#file-trigger').click();
    await page.locator('#menu-pause-all').click();
    await win.evaluate(w=>w.show());
    await page.waitForTimeout(80);
    await page.locator('#file-trigger').click();
    const previousTop = await win.evaluate(w=>w.isAlwaysOnTop());
    await page.locator('#menu-top').click();
    await page.waitForTimeout(180);
    expectedTop = await win.evaluate(w=>w.isAlwaysOnTop());
    assert.equal(expectedTop,!previousTop);
    assert.equal((await page.locator('#top-check').textContent()).trim(),expectedTop?'✓':'');
    await page.locator('#file-trigger').click();
    await page.locator('#menu-help').click();
    assert.equal(await page.locator('#help-dialog').isVisible(),true);
    await page.locator('#help-done').click();
    await page.keyboard.press('Control+n');
    assert.equal(await clocks().count(),3);
    await clock(2).locator('.clock-heading').click();
    await clock(2).focus();
    await page.keyboard.press('Space');
    assert.equal(await clock(2).getAttribute('data-running'),'true');
    await page.keyboard.press('r');
    assert.equal(await clock(2).getAttribute('data-running'),'false');
    assert.equal(await clock(2).locator('.time-readout').textContent(),'30:00');
    await clock(2).locator('.tile-remove').click();
  });

  await step('saved preferences restore each clock and window size but not running state', async () => {
    await win.evaluate(w=>w.setBounds({width:825,height:640}));
    await app.close(); app=null;
    await start();
    assert.equal(await clocks().count(),2);
    assert.equal(await clock(0).locator('.time-readout').textContent(),'10:00');
    assert.equal(await clock(0).locator('.dial').getAttribute('data-color'),'#123ABC');
    assert.equal(await clock(1).locator('.time-readout').textContent(),'15:00');
    assert.equal(await clock(1).getAttribute('data-repeat'),'true');
    assert.equal(await clock(1).locator('.dial').getAttribute('data-direction'),'ccw');
    assert.equal(await clock(1).locator('.clock-name').inputValue(),'Activity');
    assert.equal(await clock(1).getAttribute('data-running'),'false');
    const bounds=await win.evaluate(w=>w.getBounds());
    assert.equal(bounds.width,825);
    assert.equal(bounds.height,640);
    assert.equal(await win.evaluate(w=>w.isAlwaysOnTop()),expectedTop);
    const storage=await app.evaluate(({app})=>app.getPath('userData'));
    assert.equal(path.resolve(storage),path.resolve(profile));
  });

  await step('non-repeating completion remains empty and cannot fire again', async () => {
    await page.clock.install();
    await clock(0).locator('.minutes-field').fill('0');
    await clock(0).locator('.minutes-field').blur();
    await clock(0).locator('.seconds-field').fill('2');
    await clock(0).locator('.seconds-field').blur();
    await clickPlay(0);
    await advance(2300);
    assert.equal(await clock(0).locator('.time-readout').textContent(), '00:00');
    assert.equal(await clock(0).getAttribute('data-running'), 'false');
    assert.equal(await clock(0).locator('.time-up').isVisible(), true);
    assert.equal(await clock(0).locator('.dial').evaluate(el => el.style.getPropertyValue('--remaining')), '0.00000%');
    assert.equal(await clock(0).getAttribute('data-cycles'),'1');
    await advance(4000);
    assert.equal(await clock(0).getAttribute('data-cycles'),'1');
    await clickReset(0);
    assert.equal(await clock(0).locator('.time-up').isVisible(), false);
    assert.equal(await clock(0).locator('.time-readout').textContent(), '00:02');
  });

  await step('no uncaught renderer JavaScript errors', async () => {
    assert.deepEqual(errors,[]);
  });
} finally {
  if(app) await app.close().catch(()=>{});
  await fs.rm(profile,{recursive:true,force:true,maxRetries:5}).catch(()=>{});
}
if(failures.length) {
  console.error('\nTEST FAILURES:\n'+failures.join('\n\n'));
  process.exitCode=1;
} else console.log('\nAll multi-clock Electron UI tests passed.');
