// End-to-end desktop integration test. Uses Electron itself, not a browser mock.
// Run: npm run test:e2e
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

const projectRoot = path.resolve(import.meta.dirname, '..');
const electronBinary = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'clock-counter-e2e-'));
const launchOptions = {
  executablePath: electronBinary,
  args: [projectRoot],
  cwd: projectRoot,
  timeout: 45000,
  env: { ...process.env, CLOCK_COUNTER_TEST_PROFILE: profile }
};
const screenshotDir = path.join(projectRoot, 'tests', 'screenshots');
await fs.mkdir(screenshotDir, { recursive: true });
let app;
let failures = [];
async function step(title, operation) {
  try {
    await operation();
    console.log('PASS ' + title);
  } catch (error) {
    failures.push(title + ': ' + (error?.stack ?? error));
    console.error('FAIL ' + title + ': ' + error.message);
  }
}

try {
  app = await electron.launch(launchOptions);
  const page = await app.firstWindow({ timeout: 20000 });
  await page.waitForSelector('#countdown', { timeout: 10000 });
  const window = await app.browserWindow(page);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await step('starts as a 30-minute retro timer', async () => {
    assert.equal(await page.locator('#countdown').textContent(), '30:00');
    assert.equal(await page.locator('#minutes').inputValue(), '30');
    assert.equal(await page.locator('#dial-markings line').count(), 24);
    assert.equal(await page.locator('#dial').evaluate(el => el.style.getPropertyValue('--elapsed')), '0.00000%');
    assert.equal(await page.getByRole('button', { name: 'Options' }).count(), 0);
    const dimensions = await window.evaluate(w => w.getBounds());
    assert.ok(dimensions.width <= 510 && dimensions.height <= 590, 'should stay a mini-window');
  });
  await page.screenshot({ path: path.join(screenshotDir, 'clock-counter-default.png') });

  await step('duration controls update live and reset to full red', async () => {
    await page.locator('#minutes').fill('10');
    await page.locator('#minutes').blur();
    assert.equal(await page.locator('#countdown').textContent(), '10:00');
    assert.equal(await page.locator('#dial').evaluate(el => el.style.getPropertyValue('--elapsed')), '0.00000%');
  });

  // Page clock is installed AFTER initial rendering, before timers are started.
  await page.clock.install();
  await step('countdown changes from 10:00 to 09:55 and pie loses 5 seconds', async () => {
    await page.locator('#play-pause').click();
    await page.clock.fastForward(5000);
    assert.equal(await page.locator('#countdown').textContent(), '09:55');
    const elapsed = await page.locator('#dial').evaluate(el => parseFloat(el.style.getPropertyValue('--elapsed')));
    assert.ok(Math.abs(elapsed - 5000/600000*100) < 0.002, 'pie % should be real elapsed fraction, got ' + elapsed);
  });

  await step('pause stays stable regardless of wall-clock advancement', async () => {
    await page.locator('#play-pause').click();
    const paused = await page.locator('#countdown').textContent();
    await page.clock.fastForward(15000);
    assert.equal(await page.locator('#countdown').textContent(), paused);
    await page.locator('#play-pause').click();
    await page.clock.fastForward(1000);
    assert.equal(await page.locator('#countdown').textContent(), '09:54');
  });

  await step('reset restores original duration without changing the fields', async () => {
    await page.locator('#reset').click();
    assert.equal(await page.locator('#countdown').textContent(), '10:00');
    assert.equal(await page.locator('#minutes').inputValue(), '10');
    assert.equal(await page.locator('#dial').evaluate(el => el.style.getPropertyValue('--elapsed')), '0.00000%');
  });

  await step('zero duration prevents starting, time-up remains visually empty', async () => {
    await page.locator('#minutes').fill('0');
    await page.locator('#minutes').blur();
    assert.equal(await page.locator('#countdown').textContent(), '00:00');
    assert.equal(await page.locator('#play-pause').isDisabled(), true);
    await page.locator('#seconds').fill('3');
    await page.locator('#seconds').blur();
    await page.locator('#play-pause').click();
    await page.clock.fastForward(3400);
    assert.equal(await page.locator('#countdown').textContent(), '00:00');
    assert.equal(await page.locator('#dial').evaluate(el => el.style.getPropertyValue('--elapsed')), '100.00000%');
    assert.equal(await page.locator('#play-pause').getAttribute('aria-label'), 'Start timer');
  });

  await step('file menu, end sound toggle, always-on-top, help dialog operate', async () => {
    await page.locator('#file-trigger').click();
    assert.equal(await page.locator('#file-menu').isVisible(), true);
    await page.locator('#menu-sound').click();
    assert.equal(await page.locator('#menu-sound').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.evaluate(() => localStorage.getItem('clock-counter:sound')), 'off');
    await page.locator('#file-trigger').click();
    await page.locator('#menu-top').click();
    await page.waitForFunction(() => document.querySelector('#top-check').textContent === '✓');
    assert.equal(await window.evaluate(w => w.isAlwaysOnTop()), true);
    await page.locator('#help-trigger').click();
    assert.equal(await page.locator('#help-dialog').isVisible(), true);
    await page.locator('#help-close').click();
    assert.equal(await page.locator('#help-dialog').isVisible(), false);
  });

  await step('inputs clamp to valid hours/minutes/seconds', async () => {
    await page.locator('#hours').fill('99');
    await page.locator('#hours').blur();
    await page.locator('#minutes').fill('88');
    await page.locator('#minutes').blur();
    assert.equal(await page.locator('#minutes').inputValue(), '59');
    assert.equal(await page.locator('#hours').inputValue(), '99');
    assert.equal(await page.locator('#countdown').textContent(), '99:59:03');
  });

  await step('quick presets and field arrow keys work', async () => {
    await page.locator('#file-trigger').click();
    await page.locator('[data-preset="900"]').click();
    assert.equal(await page.locator('#countdown').textContent(), '15:00');
    assert.equal(await page.locator('#minutes').inputValue(), '15');
    assert.equal(await page.locator('#file-menu').isVisible(), false);
    await page.locator('#minutes').focus();
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.locator('#minutes').inputValue(), '16');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#minutes').inputValue(), '15');
  });

  await step('window remains usable at minimum allowed dimensions', async () => {
    await window.evaluate(w => w.setBounds({ width: 350, height: 410 }));
    await page.waitForTimeout(200);
    const layout = await page.evaluate(() => {
      const box = (id) => {
        const rect = document.querySelector('#'+id).getBoundingClientRect();
        return { x: rect.x, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      return {
        clientWidth: document.documentElement.clientWidth,
        clientHeight: document.documentElement.clientHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        dial: box('dial'),
        playPause: box('play-pause'),
        reset: box('reset'),
        countdown: box('countdown')
      };
    });
    assert.ok(layout.scrollWidth <= layout.clientWidth + 1, JSON.stringify(layout));
    assert.ok(layout.scrollHeight <= layout.clientHeight + 1, JSON.stringify(layout));
    assert.ok(layout.dial.width >= 140, 'dial should still be visible');
    assert.ok(layout.reset.right <= layout.clientWidth, JSON.stringify(layout));
    assert.ok(layout.playPause.bottom <= layout.clientHeight, JSON.stringify(layout));
    await page.screenshot({ path: path.join(screenshotDir, 'clock-counter-small.png') });
  });

  await step('renderer did not throw JavaScript errors', async () => {
    assert.deepEqual(errors, []);
  });

  await step('window dimensions and preferences persist across a full restart', async () => {
    // Always-on-top was enabled in the menu test above.
    await window.evaluate(w => w.setBounds({ width: 430, height: 510 }));
    const settingsPath = await app.evaluate(({ app }) => app.getPath('userData'));
    assert.equal(path.resolve(settingsPath), path.resolve(profile), 'test settings must be isolated');
    await app.close();
    app = null;
    app = await electron.launch(launchOptions);
    const reopened = await app.firstWindow();
    const newWindow = await app.browserWindow(reopened);
    const bounds = await newWindow.evaluate(w => w.getBounds());
    assert.equal(bounds.width, 430);
    assert.equal(bounds.height, 510);
    assert.equal(await newWindow.evaluate(w => w.isAlwaysOnTop()), true);
    assert.equal(await reopened.locator('#countdown').textContent(), '15:00');
    assert.equal(await reopened.evaluate(() => localStorage.getItem('clock-counter:sound')), 'off');
    const prefs = JSON.parse(await fs.readFile(path.join(profile, 'window-state.json'), 'utf8'));
    assert.equal(prefs.width, 430);
    assert.equal(prefs.height, 510);
    assert.equal(prefs.alwaysOnTop, true);
  });
} finally {
  if (app) await app.close().catch(() => {});
  await fs.rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
}
if (failures.length) {
  console.error('\nFailures:\n' + failures.join('\n\n'));
  process.exitCode = 1;
} else {
  console.log('\nAll Electron UI tests passed.');
}
