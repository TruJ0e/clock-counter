# CLOCK COUNTER

A small, retro-style visual countdown utility for Windows. The **colored portion is the time remaining**. As a clock runs out, the color disappears; the twelve white dashes are optional decorative reference marks, not fixed minute markers. This keeps the timer understandable for people who find abstract time difficult to visualize.

CLOCK COUNTER works offline with no account, telemetry, paid API, or subscription.

## Run

Windows development: install Node.js, open PowerShell in this repository and run:

```powershell
npm install
npm start
```

To create an independent Windows executable (Node.js not required on the recipient's PC):

```powershell
npm run dist:portable
```

The executable is placed in `dist/CLOCK COUNTER 0.3.2.exe`. Windows installer builds are available with `npm run dist:win`. These personal builds are not code-signed; Windows SmartScreen may warn about an unknown publisher.

## Features

- **Clockwise or counterclockwise:** Choose the direction in each clock's settings. The visual always shows the correct fraction remaining for that clock's actual duration.
- **Any color:** Nine built-in color presets plus a custom RGB color picker, independently per clock.
- **Four built-in alarm tones:** Classic chime, beep, bell and retro digital; each clock can also be silent and has a separate volume.
- **Continuous repeating:** Each clock can restart automatically when it reaches zero. The completed-round count is shown by that clock.
- **Multiple clocks:** Add up to 12 independently timed clocks, each with its own title, duration, countdown direction, color, alarm, volume and repeat setting. They lay out in columns when window width allows.
- **Resize:** Drag the lower-right corner to resize the frameless window, or use maximize/fullscreen. The standard minimum size is 250 × 260 pixels; clock-only mode supports 180 × 180. The title bar and File menu automatically shrink to remain proportional in narrow windows. The app widens when new clocks are added, as screen space permits.
- **Clock-only mode:** Click the square button beside **+ Clock**, or choose **File > Hide controls**, to display only the selected clock's dial. The window title, menus, tile settings, and time input controls disappear while the timer keeps running. A small restore button appears in the top-right; **H** and **Escape** also restore the controls.
- **Slide-up bottom controls:** Play/Pause, Reset, and the hours/minutes/seconds setters live in a small sliding drawer at the bottom of every clock. Pressing **Play** starts the timer and automatically slides that clock's controls down, leaving only a small **up arrow (▲)**. Click the arrow to slide the controls back up while the countdown continues; the **down arrow (▼)** hides them manually. Each clock's drawer operates independently. Starting all clocks slides away the drawers for all timers that actually start. The controls do not pop back up automatically when a timer pauses or finishes.
- **Start/pause/reset:** Independently control each clock or use Start All, Pause All and Reset All from the toolbar (or File menu on narrow windows). Keyboard shortcuts and File > Timer remain available when a drawer is hidden.
- **Quick presets:** 2, 5, 10, 15, 20, 30, 45 or 60 minutes via File > Quick Timers, applied only to the selected clock.
- **Accessibility:** High contrast, descriptive labels, optional digital time and decorative marks, no flashing transitions, and keyboard shortcuts.
- **Persistence:** Clock names, durations, colors, directions, alarms, repeat settings, volume, display options, window bounds and always-on-top preference are saved automatically.

Clocks continue counting accurately while the application is **open** and minimized or inactive. Closing CLOCK COUNTER stops all clocks; opening it again restores their saved settings with clocks stopped and reset to their configured durations. Repeating clocks do not generate an unbounded backlog of alarm sounds after a delayed update. At most one alarm is played per clock per update, even if several complete cycles were missed while the PC was asleep.

## Controls

Each card has an editable name, a settings gear, an independently rotating colored countdown pie, and a slide-up bottom drawer containing hours/minutes/seconds fields, Start/Pause and Reset. Clocks can be duplicated or removed from the settings dialog.

- **File > Timer:** Start/pause, reset, and open settings for the selected timer. The File menu remains accessible even when its top bar becomes compact.
- **Space:** Start/pause the selected clock (when not typing).
- **R:** Reset the selected clock.
- **Ctrl+N:** Add another independent clock.
- **F:** Fullscreen.
- **H:** Toggle clock-only mode. **Escape** also restores the controls when they are hidden.
- **Arrow up/down:** Change a focused duration field.
- **File:** Presets, multi-clock controls, always-on-top, fullscreen and exit.
- **Help:** Built-in guide.

Click a card to select it before using keyboard shortcuts or File > Quick Timers. Audio previews are in the clock settings dialog.

## Development and tests

```powershell
npm test               # Pure timer model and sound-pattern tests
npm run test:e2e       # Real Electron UI tests in an isolated profile
npm run test:focus     # Compact-menu and clock-only UI regression tests
npm run test:drawer    # Sliding per-clock bottom drawer UI regression tests
npm run verify         # All suites
npm run dist:portable  # Build Windows portable EXE
npm run test:packaged  # Smoke-test the packaged Electron app
```

End-to-end tests (including compact-window and sliding drawer tests) exercise: independent timers, opposite countdown directions, repeat timing and phase recovery, color/sound preferences, hide/show options, timer duplication/deletion, quick presets, global controls, very small/large windows, manual resize, settings persistence and completion behavior. Test profiles do not touch your regular CLOCK COUNTER settings.

## Architecture

- `main.cjs`: Native Electron window, window state persistence and tightly constrained window-control IPC.
- `preload.cjs`: Isolated, allowlisted bridge for window controls.
- `index.html`, `src/styles.css`: Retro black mini-window UI with responsive side-by-side cards and settings dialogs.
- `src/renderer.js`: Independent card views, input handling, scheduling, sound triggers and preference persistence.
- `src/clocks.js`: Pure, immutable multi-clock state operations and missed-cycle repeat math.
- `src/timer-core.js`: Time math and formatting independent of Electron.
- `src/alarms.js`: Built-in generated offline alarm tones.
- `tests/`: Pure unit tests, Electron UI tests, packaged executable smoke test.
- `assets/icon.ico`, `scripts/generate-icon.ps1`: Application icon and reproducible generator.

## Core design constraints

The original simple red pie, black background and clear countdown have been preserved. Default single-clock mode stays compact; multi-clock features only appear as needed. The clock dashes remain decoration, and **never pretend that an arbitrary-duration timer is a 60-minute clock**.

Version **0.3.0**: Direction, color, alarms, repeating timers, independent multi-clock panels, flexible resizing, visual options and expanded integration tests.

Version **0.3.1**: File > Timer commands, adaptive compact title/menu bars, and clock-only view with a restore button, H/Escape shortcuts, and an extra-small minimum window size. All modes are tested with real Electron windows.

Version **0.3.2**: A compact bottom drawer for Play/Pause, Reset and time setting. Press Play to auto-collapse the drawer; the up-arrow reopens it, the down-arrow hides it. Multi-clock drawers remain independent, full clock-only mode still works, and all behaviors have real Electron regression coverage.
