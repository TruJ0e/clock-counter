# CLOCK COUNTER

A compact, retro-looking visual countdown timer for Windows. The **red pie is the time left**; as time runs out, the red disappears. It is intentionally easy to understand even without interpreting a conventional clock.

The design is based on the small black utility window we selected: white pixel-like borders, a red timer face, a large central readout, and only a few controls. The twelve white tick marks are **decorative only**. They do not claim to represent fixed minutes; the countdown and shrinking red wedge always correspond to the configured duration.

## Run on Windows

Requires Node.js for development, but **no Node.js installation** for a packaged app.

1. Open PowerShell in this repository.
2. Run **npm install**.
3. Run **npm start**.

To package a standalone portable Windows executable, run **npm run dist:portable**.
To build a Windows installer, run **npm run dist:win**.
To rebuild the old-school stopwatch icon, run **npm run icon:build**.
The output is placed in the **dist** directory.

## Controls

- **Bottom three fields:** Set hours, minutes, and seconds, in that order. Changes reset the countdown.
- **Play / Pause:** Start or pause the countdown.
- **Reset:** Reset to the duration shown in the fields.
- **File:** Quick timer presets (2, 5, 10, 15, 20, 30, 45 or 60 minutes), restart, toggle always-on-top, toggle the end sound, toggle fullscreen, or exit.
- **Help:** Built-in explanation of the visual timer and shortcuts.
- **Space:** Start or pause when not editing a field.
- **R:** Reset.
- **F:** Toggle fullscreen.

Hours, minutes, and seconds can also be adjusted with the up/down arrow keys. The last chosen duration, sound preference, window size, window position, and always-on-top setting persist across restarts. When the timer finishes, the empty dial shows a high-contrast completion indicator.

This app runs offline. No account, tracking, APIs, or subscriptions.

## How the timer works

The countdown uses an absolute deadline (current time plus remaining time) instead of subtracting fixed amounts per animation frame. This means the timer doesn't gradually drift if rendering pauses or the window is minimized. The pie measures remaining divided by initial duration for *any* selected duration, not a permanent 60-minute dial.

All time conversion math is in src/timer-core.js, independently testable with **npm test**. Run **npm run verify** to execute both pure logic tests and automated end-to-end UI tests against a real Electron window using Playwright. The UI suite checks timing, sound toggles, presets, input validation, size constraints, persistent settings and JavaScript errors. Test profiles are isolated from your personal settings.

## Code structure

- main.cjs — Electron window and constrained window-management IPC
- preload.cjs — minimal renderer bridge
- index.html — retro mini-window UI
- src/styles.css — black background, white borders, red circle, responsive layout
- src/renderer.js — controls, display, timer lifecycle, optional sound
- src/timer-core.js — pure countdown calculations
- tests/timer-core.test.js — built-in Node tests
- tests/electron-e2e.mjs — automated real-desktop Electron interaction tests
- assets/icon.ico — custom retro app icon
- scripts/generate-icon.ps1 — rebuildable icon generator

## Design constraints

- No minute numbers outside the dial.
- No Options menu or complex sidebar.
- Tick marks remain fixed decoration, unrelated to duration.
- Red sector is always proportional to **time remaining**.
- The timer starts as a modest floating mini-window, not a full dashboard.

## Version

Version 0.2.0 adds quick presets, keyboard spinner controls, saved window preferences, an end-of-time visual indicator, a custom application icon, and real Electron integration testing.
