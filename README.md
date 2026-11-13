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
The output is placed in the **dist** directory.

## Controls

- **Bottom three fields:** Set hours, minutes, and seconds, in that order. Changes reset the countdown.
- **Play / Pause:** Start or pause the countdown.
- **Reset:** Reset to the duration shown in the fields.
- **File:** Restart, toggle always-on-top, toggle the end sound, toggle fullscreen, or exit.
- **Help:** Built-in explanation of the visual timer and shortcuts.
- **Space:** Start or pause when not editing a field.
- **R:** Reset.
- **F:** Toggle fullscreen.

This app runs offline. No account, tracking, APIs, or subscriptions.

## How the timer works

The countdown uses an absolute deadline (current time plus remaining time) instead of subtracting fixed amounts per animation frame. This means the timer doesn't gradually drift if rendering pauses or the window is minimized. The pie measures remaining divided by initial duration for *any* selected duration, not a permanent 60-minute dial.

All time conversion math is in src/timer-core.js, independently testable with **npm test**.

## Code structure

- main.cjs — Electron window and constrained window-management IPC
- preload.cjs — minimal renderer bridge
- index.html — retro mini-window UI
- src/styles.css — black background, white borders, red circle, responsive layout
- src/renderer.js — controls, display, timer lifecycle, optional sound
- src/timer-core.js — pure countdown calculations
- tests/timer-core.test.js — built-in Node tests

## Design constraints

- No minute numbers outside the dial.
- No Options menu or complex sidebar.
- Tick marks remain fixed decoration, unrelated to duration.
- Red sector is always proportional to **time remaining**.
- The timer starts as a modest floating mini-window, not a full dashboard.
