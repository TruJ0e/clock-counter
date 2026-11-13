// Smoke-test the packaged, distributable Windows app (no dev server).
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
    executablePath,
    args: [],
    env: { ...process.env, CLOCK_COUNTER_TEST_PROFILE: profile },
    timeout: 45000
  });
  const page = await app.firstWindow({ timeout: 20000 });
  await page.locator('#countdown').waitFor();
  assert.equal(await page.title(), 'CLOCK COUNTER');
  assert.equal(await page.locator('#countdown').textContent(), '30:00');
  await page.locator('#minutes').fill('1');
  await page.locator('#minutes').blur();
  assert.equal(await page.locator('#countdown').textContent(), '01:00');
  await page.locator('#play-pause').click();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#play-pause').getAttribute('aria-label'), 'Pause timer');
  console.log('PASS packaged CLOCK COUNTER.exe launches and its controls work.');
} finally {
  if (app) await app.close().catch(() => {});
  await fs.rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
}
