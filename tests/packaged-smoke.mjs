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
  console.log('PASS packaged CLOCK COUNTER.exe launches; multiple clocks, settings and controls work.');
} finally {
  if (app) await app.close().catch(() => {});
  await fs.rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
}
