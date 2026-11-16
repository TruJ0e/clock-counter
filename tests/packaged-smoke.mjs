// Smoke-test the actual packaged Electron binary (not the development version).
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

const root = path.resolve(import.meta.dirname, '..');
const executablePath = path.join(root, 'dist', 'win-unpacked', 'CLOCK COUNTER.exe');
await fs.access(executablePath);
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'clock-counter-packaged-'));
let app;
try {
  app = await electron.launch({
    executablePath, args: [],
    env: { ...process.env, CLOCK_COUNTER_TEST_PROFILE: profile },
    timeout: 45000
  });
  const page = await app.firstWindow({ timeout: 20000 });
  await page.locator('.clock-tile').first().waitFor();
  assert.equal(await page.title(), 'CLOCK COUNTER');
  const clocks = page.locator('.clock-tile');
  assert.equal(await clocks.count(), 1);
  assert.equal(await clocks.first().locator('.time-readout').textContent(), '30:00');
  await page.locator('#add-clock').click();
  assert.equal(await clocks.count(), 2);
  await clocks.nth(1).locator('.minutes-field').fill('1');
  await clocks.nth(1).locator('.minutes-field').blur();
  assert.equal(await clocks.nth(1).locator('.time-readout').textContent(), '01:00');
  await clocks.nth(1).locator('.tile-settings').click();
  await page.locator('#setting-direction').selectOption('ccw');
  await page.locator('.color-swatch[data-color="#2486F2"]').click();
  await page.locator('#setting-repeat').check();
  await page.locator('#done-settings').click();
  assert.equal(await clocks.nth(1).locator('.dial').getAttribute('data-direction'),'ccw');
  assert.equal(await clocks.nth(1).locator('.dial').getAttribute('data-color'),'#2486F2');
  await clocks.nth(1).locator('.play-pause').click();
  assert.equal(await clocks.nth(1).getAttribute('data-running'),'true');
  assert.equal(await clocks.first().getAttribute('data-running'),'false');
  const drawer = clocks.nth(1).locator('.controls-drawer');
  const arrow = clocks.nth(1).locator('.drawer-toggle');
  assert.equal(await drawer.getAttribute('data-collapsed'), 'true');
  assert.equal(await arrow.getAttribute('aria-label'), 'Show timer controls');
  await arrow.click();
  assert.equal(await drawer.getAttribute('data-collapsed'), 'false');
  assert.equal(await clocks.nth(1).getAttribute('data-running'), 'true');
  await arrow.click();
  assert.equal(await drawer.getAttribute('data-collapsed'), 'true');
  await page.locator('#file-trigger').click();
  await page.locator('#menu-timer-reset').click();
  assert.equal(await clocks.nth(1).getAttribute('data-running'),'false');
  assert.equal(await clocks.nth(1).locator('.time-readout').textContent(),'01:00');
  const second=clocks.nth(1);
  if(await second.locator('.controls-drawer').getAttribute('data-collapsed')==='true')
    await second.locator('.drawer-toggle').click();
  const later=new Date(Date.now()+2*60*60*1000);
  const laterInput=String(later.getHours()).padStart(2,'0')+':'+String(later.getMinutes()).padStart(2,'0');
  await second.locator('.schedule-time').fill(laterInput);
  await second.locator('.schedule-set').click();
  assert.equal(await second.getAttribute('data-scheduled'),'true');
  assert.equal(await second.getAttribute('data-running'),'false');
  assert.equal(await second.locator('.mode-readout').isVisible(),true);
  await second.locator('.drawer-toggle').click();
  await second.locator('.schedule-cancel').click();
  assert.equal(await second.getAttribute('data-scheduled'),'false');
  await page.locator('#clock-only').click();
  assert.equal(await page.locator('.menubar').isVisible(), false);
  assert.equal(await clocks.first().isVisible(), false);
  assert.equal(await clocks.nth(1).isVisible(), true);
  await page.locator('#focus-restore').click();
  assert.equal(await page.locator('.menubar').isVisible(), true);
  await clocks.first().locator('.tile-settings').click();
  await page.locator('#setting-mode').selectOption('stopwatch');
  await page.locator('#done-settings').click();
  assert.equal(await clocks.first().getAttribute('data-mode'),'stopwatch');
  await clocks.first().locator('.detach-clock').click();
  await page.waitForTimeout(350);
  const floating=app.windows().find(w=>w!==page&&w.url().includes('detached.html'));
  assert.ok(floating,'packaged app must include its floating-window resources');
  await floating.locator('#float-readout').waitFor();
  await floating.locator('#float-close').click();
  await page.locator('#file-trigger').click();
  await page.locator('#menu-library').click();
  assert.equal(await page.locator('#library-dialog').isVisible(),true);
  await page.locator('#library-done').click();
  console.log('PASS packaged CLOCK COUNTER.exe launches; multi-clock controls, stopwatch, native floating window, scheduled Start At and preset library work.');
} finally {
  if (app) await app.close().catch(() => {});
  await fs.rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
}
