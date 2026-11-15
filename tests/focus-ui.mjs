import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

// Dedicated regression coverage for compact title/menu bars, File > Timer,
// hiding everything but one clock, and restoring the controls.
const root = path.resolve(import.meta.dirname, '..');
const executablePath = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'clock-counter-focus-'));
const launchOptions = {
  executablePath, args: [root], cwd: root, timeout: 45000,
  env: { ...process.env, CLOCK_COUNTER_TEST_PROFILE: profile }
};

let app, page, win;
const failures = [], pageErrors = [];
async function launch() {
  app = await electron.launch(launchOptions);
  page = await app.firstWindow({ timeout: 20000 });
  win = await app.browserWindow(page);
  page.on('pageerror', err => pageErrors.push(err.message));
  await page.locator('.clock-tile').first().waitFor({ timeout: 20000 });
}
async function step(label, fn) {
  try {
    await fn();
    console.log('PASS ' + label);
  } catch (err) {
    failures.push(label + ': ' + (err?.stack || err));
    console.error('FAIL ' + label + ': ' + err.message);
  }
}
async function menuButton(id) {
  await page.locator('#file-trigger').click();
  await page.locator(id).click();
}
async function advance(ms) {
  await page.clock.fastForward(ms);
  await page.clock.runFor(55);
}
const tiles = () => page.locator('.clock-tile');

try {
  await launch();

  await step('File contains a Timer section with start, pause, reset and settings', async () => {
    await page.locator('#file-trigger').click();
    assert.equal(await page.locator('.menu-heading').first().textContent(), 'TIMER');
    for (const id of ['#menu-timer-toggle', '#menu-timer-reset', '#menu-timer-settings']) {
      assert.equal(await page.locator(id).isVisible(), true);
    }
    await page.locator('#menu-timer-settings').click();
    assert.equal(await page.locator('#settings-dialog').isVisible(), true);
    await page.locator('#done-settings').click();
    await menuButton('#menu-timer-toggle');
    assert.equal(await tiles().first().getAttribute('data-running'), 'true');
    await menuButton('#menu-timer-toggle');
    assert.equal(await tiles().first().getAttribute('data-running'), 'false');
    await menuButton('#menu-timer-reset');
    assert.equal(await tiles().first().locator('.time-readout').textContent(), '30:00');
  });

  await step('top chrome shrinks at narrow widths without overflowing', async () => {
    const inspect = () => page.evaluate(() => {
      const title = document.querySelector('.titlebar').getBoundingClientRect();
      const menu = document.querySelector('.menubar').getBoundingClientRect();
      const file = document.querySelector('#file-trigger').getBoundingClientRect();
      const hide = document.querySelector('#clock-only').getBoundingClientRect();
      return {
        titleHeight: title.height,
        menuHeight: menu.height,
        screenWidth: document.documentElement.clientWidth,
        contentWidth: document.documentElement.scrollWidth,
        fileRight: file.right,
        hideRight: hide.right
      };
    });
    async function resizeAndWait(width, height) {
      await win.evaluate((w, dims) => w.setBounds(dims), { width, height });
      await page.waitForFunction(target => window.innerWidth === target, width, { timeout: 6000 });
    }
    await resizeAndWait(490, 570);
    const large = await inspect();
    await resizeAndWait(350, 410);
    const medium = await inspect();
    await resizeAndWait(250, 260);
    const small = await inspect();
    assert.ok(medium.titleHeight < large.titleHeight, JSON.stringify({large,medium}));
    assert.ok(medium.menuHeight < large.menuHeight, JSON.stringify({large,medium}));
    assert.ok(small.titleHeight < medium.titleHeight, JSON.stringify({small,medium}));
    assert.ok(small.menuHeight < medium.menuHeight, JSON.stringify({small,medium}));
    assert.ok(small.contentWidth <= small.screenWidth + 1, JSON.stringify(small));
    assert.ok(small.hideRight <= small.screenWidth + 1, JSON.stringify(small));
    assert.ok(small.fileRight <= small.screenWidth + 1, JSON.stringify(small));
    assert.equal(await page.locator('#help-trigger').isVisible(), false);
    await menuButton('#menu-help');
    assert.equal(await page.locator('#help-dialog').isVisible(), true);
    await page.locator('#help-done').click();
  });

  await page.clock.install();
  await step('clock-only button hides all chrome without pausing timer', async () => {
    if (await tiles().first().locator('.controls-drawer').getAttribute('data-collapsed') === 'true') {
      await tiles().first().locator('.drawer-toggle').click();
    }
    await tiles().first().locator('.minutes-field').fill('0');
    await tiles().first().locator('.minutes-field').blur();
    await tiles().first().locator('.seconds-field').fill('20');
    await tiles().first().locator('.seconds-field').blur();
    await tiles().first().locator('.play-pause').click();
    await advance(1500);
    const prior = await tiles().first().locator('.time-readout').textContent();
    await page.locator('#clock-only').click();
    assert.equal(await page.locator('#app-shell').evaluate(el=>el.classList.contains('clock-only')), true);
    assert.equal(await page.locator('.titlebar').isVisible(), false);
    assert.equal(await page.locator('.menubar').isVisible(), false);
    assert.equal(await page.locator('.statusbar').isVisible(), false);
    assert.equal(await tiles().first().locator('.clock-heading').isVisible(), false);
    assert.equal(await tiles().first().locator('.timer-controls').isVisible(), false);
    assert.equal(await page.locator('#focus-restore').isVisible(), true);
    const dial = await tiles().first().locator('.dial').boundingBox();
    assert.ok(dial.width > 140 && dial.height > 140, JSON.stringify(dial));
    await advance(2200);
    const after = await tiles().first().locator('.time-readout').textContent();
    assert.notEqual(after, prior);
    assert.equal(await tiles().first().getAttribute('data-running'), 'true');
  });

  await step('clock-only window can shrink to 180px and restore controls by button', async () => {
    await win.evaluate(w => w.setBounds({ width: 180, height: 180 }));
    const bounds = await win.evaluate(w => w.getBounds());
    assert.ok(bounds.width <= 190 && bounds.height <= 190, JSON.stringify(bounds));
    assert.equal(await page.locator('#focus-restore').isVisible(), true);
    const display = await tiles().first().locator('.dial').boundingBox();
    assert.ok(display.width >= 155, JSON.stringify(display));
    await page.locator('#focus-restore').click();
    assert.equal(await page.locator('#app-shell').evaluate(el=>el.classList.contains('clock-only')), false);
    assert.equal(await page.locator('.titlebar').isVisible(), true);
    assert.equal(await page.locator('.menubar').isVisible(), true);
    const restored = await win.evaluate(w => w.getBounds());
    assert.ok(restored.width >= 250 && restored.height >= 260, JSON.stringify(restored));
  });

  await step('H and Escape toggle clock-only mode without trapping controls', async () => {
    await tiles().first().focus();
    await page.keyboard.press('h');
    assert.equal(await page.locator('#app-shell').evaluate(el=>el.classList.contains('clock-only')), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#app-shell').evaluate(el=>el.classList.contains('clock-only')), false);
    await menuButton('#menu-clock-only');
    assert.equal(await page.locator('#app-shell').evaluate(el=>el.classList.contains('clock-only')), true);
    await page.keyboard.press('h');
    assert.equal(await page.locator('#app-shell').evaluate(el=>el.classList.contains('clock-only')), false);
  });

  await step('clock-only mode shows only selected clock when several exist', async () => {
    await win.evaluate(w => w.setBounds({ width: 760, height: 550 }));
    await page.locator('#add-clock').click();
    assert.equal(await tiles().count(), 2);
    await tiles().nth(1).locator('.clock-heading').click();
    await page.locator('#clock-only').click();
    assert.equal(await tiles().nth(0).isVisible(), false);
    assert.equal(await tiles().nth(1).isVisible(), true);
    assert.ok((await tiles().nth(1).locator('.dial').boundingBox()).width > 250);
    const firstBefore = await tiles().nth(0).locator('.time-readout').textContent();
    await advance(1200);
    assert.notEqual(await tiles().nth(0).locator('.time-readout').textContent(), firstBefore);
    await page.locator('#focus-restore').click();
    assert.equal(await tiles().nth(0).isVisible(), true);
    assert.equal(await tiles().nth(1).isVisible(), true);
  });

  await step('clock-only preference survives restart and remains easy to exit', async () => {
    await page.locator('#clock-only').click();
    await app.close();
    app = null;
    await launch();
    assert.equal(await page.locator('#app-shell').evaluate(el=>el.classList.contains('clock-only')), true);
    assert.equal(await page.locator('#focus-restore').isVisible(), true);
    await page.locator('#focus-restore').click();
    assert.equal(await page.locator('.menubar').isVisible(), true);
    assert.equal(await page.evaluate(()=>localStorage.getItem('clock-counter:clock-only')), 'false');
  });

  await step('no renderer errors', async () => assert.deepEqual(pageErrors, []));
} finally {
  if (app) await app.close().catch(() => {});
  await fs.rm(profile, {recursive:true,force:true,maxRetries:5}).catch(() => {});
}
if (failures.length) {
  console.error('\nTEST FAILURES:\n' + failures.join('\n\n'));
  process.exitCode = 1;
} else console.log('\nAll compact and clock-only Electron tests passed.');
