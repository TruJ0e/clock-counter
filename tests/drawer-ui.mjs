import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

const root = path.resolve(import.meta.dirname, '..');
const electronExe = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'clock-counter-drawer-'));
let app;
const errors = [];
const failures = [];

async function step(label, fn) {
  try {
    await fn();
    console.log('PASS ' + label);
  } catch (error) {
    failures.push(label + ': ' + (error?.stack || error));
    console.error('FAIL ' + label + ': ' + error.message);
  }
}

try {
  app = await electron.launch({
    executablePath: electronExe,
    args: [root],
    cwd: root,
    env: {...process.env, CLOCK_COUNTER_TEST_PROFILE: profile},
    timeout: 45000
  });
  const page = await app.firstWindow({timeout: 20000});
  const win = await app.browserWindow(page);
  const tiles = () => page.locator('.clock-tile');
  const tile = n => tiles().nth(n);
  const drawer = n => tile(n).locator('.controls-drawer');
  const arrow = n => tile(n).locator('.drawer-toggle');
  const controls = n => tile(n).locator('.timer-controls');
  page.on('pageerror', e => errors.push(e.message));
  await tiles().first().waitFor({timeout: 10000});

  await step('drawer starts open with a centered down arrow', async () => {
    assert.equal(await tiles().count(),1);
    assert.equal(await drawer(0).getAttribute('data-collapsed'),'false');
    assert.equal(await arrow(0).getAttribute('aria-expanded'),'true');
    assert.equal(await arrow(0).getAttribute('aria-label'),'Hide timer controls');
    assert.equal(await tile(0).locator('.drawer-arrow').textContent(),'▼');
    assert.equal(await controls(0).isVisible(),true);
    assert.equal(await controls(0).evaluate(el=>el.inert),false);
    assert.equal(await arrow(0).getAttribute('aria-controls'),
      await controls(0).getAttribute('id'));
  });

  await page.clock.install();
  await step('pressing Play auto-minimizes only the bottom drawer', async () => {
    await tile(0).locator('.seconds-field').fill('20');
    await tile(0).locator('.seconds-field').blur();
    await tile(0).locator('.minutes-field').fill('0');
    await tile(0).locator('.minutes-field').blur();
    await tile(0).locator('.play-pause').click();
    assert.equal(await tile(0).getAttribute('data-running'),'true');
    assert.equal(await drawer(0).getAttribute('data-collapsed'),'true');
    assert.equal(await arrow(0).getAttribute('aria-label'),'Show timer controls');
    assert.equal(await arrow(0).getAttribute('aria-expanded'),'false');
    assert.equal(await tile(0).locator('.drawer-arrow').textContent(),'▲');
    assert.equal(await controls(0).evaluate(el=>el.inert),true);
    await page.waitForTimeout(250);
    const buttonBox=await arrow(0).boundingBox();
    assert.ok(buttonBox.height <= 24,JSON.stringify(buttonBox));
    assert.equal(await tile(0).locator('.dial').isVisible(),true);
  });

  await step('timer keeps counting while the bottom drawer is tucked away', async () => {
    await page.clock.fastForward(3300);
    await page.clock.runFor(60);
    const label=await tile(0).locator('.time-readout').textContent();
    assert.ok(['00:16','00:17'].includes(label),'unexpected time '+label);
    assert.equal(await drawer(0).getAttribute('data-collapsed'),'true');
    assert.equal(await tile(0).getAttribute('data-running'),'true');
  });

  await step('up arrow slides controls up without pausing the clock', async () => {
    await arrow(0).click();
    await page.waitForTimeout(250);
    assert.equal(await arrow(0).getAttribute('aria-expanded'),'true');
    assert.equal(await tile(0).locator('.drawer-arrow').textContent(),'▼');
    assert.equal(await controls(0).evaluate(el=>el.inert),false);
    assert.equal(await controls(0).isVisible(),true);
    assert.equal(await tile(0).getAttribute('data-running'),'true');
    await tile(0).locator('.play-pause').click();
    assert.equal(await tile(0).getAttribute('data-running'),'false');
    assert.equal(await drawer(0).getAttribute('data-collapsed'),'false');
  });

  await step('down arrow manually minimizes and restores the stopped timer controls', async () => {
    await arrow(0).click();
    assert.equal(await drawer(0).getAttribute('data-collapsed'),'true');
    assert.equal(await tile(0).getAttribute('data-running'),'false');
    await arrow(0).click();
    assert.equal(await drawer(0).getAttribute('data-collapsed'),'false');
    await tile(0).locator('.reset').click();
    assert.equal(await tile(0).locator('.time-readout').textContent(),'00:20');
  });

  await step('each clock has a separate drawer with independent state', async () => {
    await page.locator('#add-clock').click();
    assert.equal(await tiles().count(),2);
    assert.equal(await drawer(1).getAttribute('data-collapsed'),'false');
    await tile(1).locator('.play-pause').click();
    assert.equal(await drawer(1).getAttribute('data-collapsed'),'true');
    assert.equal(await drawer(0).getAttribute('data-collapsed'),'false');
    await arrow(1).click();
    assert.equal(await drawer(1).getAttribute('data-collapsed'),'false');
    assert.equal(await tile(1).getAttribute('data-running'),'true');
    await page.locator('#all-pause').click();
    await tile(1).locator('.reset').click();
  });

  await step('global Start All hides the controls for every timer it starts', async () => {
    await page.locator('#all-start').click();
    assert.equal(await tile(0).getAttribute('data-running'),'true');
    assert.equal(await tile(1).getAttribute('data-running'),'true');
    assert.equal(await drawer(0).getAttribute('data-collapsed'),'true');
    assert.equal(await drawer(1).getAttribute('data-collapsed'),'true');
    await page.locator('#all-pause').click();
  });

  await step('File menu controls still pause and reset a hidden drawer clock', async () => {
    await tile(1).locator('.clock-heading').click();
    await page.locator('#file-trigger').click();
    await page.locator('#menu-timer-reset').click();
    assert.equal(await tile(1).getAttribute('data-running'),'false');
    assert.equal(await drawer(1).getAttribute('data-collapsed'),'true');
    assert.equal(await tile(1).locator('.time-readout').textContent(),'30:00');
  });

  await step('small and wide windows keep arrow visible and usable', async () => {
    await win.evaluate(w=>w.setBounds({width:250,height:260}));
    await page.waitForTimeout(200);
    assert.equal(await arrow(0).isVisible(),true);
    await arrow(0).click();
    assert.equal(await controls(0).evaluate(el=>el.inert),false);
    await arrow(0).click();
    assert.equal(await controls(0).evaluate(el=>el.inert),true);
    await win.evaluate(w=>w.setBounds({width:960,height:720}));
    await page.waitForTimeout(200);
    assert.equal(await arrow(1).isVisible(),true);
    assert.ok((await tile(1).locator('.dial').boundingBox()).width>120);
  });

  await step('clock-only full view still restores correctly with drawers', async () => {
    await tile(0).locator('.clock-heading').click();
    await page.locator('#clock-only').click();
    assert.equal(await drawer(0).isVisible(),false);
    await page.locator('#focus-restore').click();
    assert.equal(await arrow(0).isVisible(),true);
    assert.equal(await drawer(0).getAttribute('data-collapsed'),'true');
  });

  await step('no uncaught renderer errors during drawer transitions', async () => {
    assert.deepEqual(errors,[]);
  });
} finally {
  if(app) await app.close().catch(()=>{});
  await fs.rm(profile,{recursive:true,force:true,maxRetries:3}).catch(()=>{});
}
if(failures.length) {
  console.error('\nDRAWER TEST FAILURES:\n'+failures.join('\n\n'));
  process.exitCode=1;
} else {
  console.log('\nAll bottom-drawer Electron tests passed.');
}
