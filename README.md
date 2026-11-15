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

The executable is placed in `dist/CLOCK COUNTER 0.3.0.exe`. Windows installer builds are available with `npm run dist:win`. These personal builds are not code-signed; Windows SmartScreen may warn about an unknown publisher.

## Features

- **Clockwise or counterclockwise:** Choose the direction in each clock's settings. The visual always shows the correct fraction remaining for that clock's actual duration.
- **Any color:** Nine built-in color presets plus a custom RGB color picker, independently per clock.
- **Four built-in alarm tones:** Classic chime, beep, bell and retro digital; each clock can also be silent and has a separate volume.
- **Continuous repeating:** Each clock can restart automatically when it reaches zero. The completed-round count is shown by that clock.
- **Multiple clocks:** Add up to 12 independently timed clocks, each with its own title, duration, countdown direction, color, alarm, volume and repeat setting. They lay out in columns when window width allows.
- **Resize:** Drag the lower-right corner to resize the frameless window, or use maximize/fullscreen. The minimum practical size is 250 × 260 pixels; smaller windows may scroll to show all controls. The app automatically widens when clocks are added, as screen space permits.
- **Start/pause/reset:** Independently control each clock or use Start All, Pause All and Reset All from the toolbar (or File menu on narrow windows).
- **Quick presets:** 2, 5, 10, 15, 20, 30, 45 or 60 minutes via File > Quick Timers, applied only to the selected clock.
- **Accessibility:** High contrast, descriptive labels, optional digital time and decorative marks, no flashing transitions, and keyboard shortcuts.
- **Persistence:** Clock names, durations, colors, directions, alarms, repeat settings, volume, display options, window bounds and always-on-top preference are saved automatically.

Clocks continue counting accurately while the application is **open** and minimized or inactive. Closing CLOCK COUNTER stops all clocks; opening it again restores their saved settings with clocks stopped and reset to their configured durations. Repeating clocks do not generate an unbounded backlog of alarm sounds after a delayed update. At most one alarm is played per clock per update, even if several complete cycles were missed while the PC was asleep.

## Controls

Each card has an editable name, a settings gear, an independently rotating colored countdown pie, hours/minutes/seconds fields, Start/Pause and Reset. Clocks can be duplicated or removed from the settings dialog.

- **Space:** Start/pause the selected clock (when not typing).
- **R:** Reset the selected clock.
- **Ctrl+N:** Add another independent clock.
- **F:** Fullscreen.
- **Arrow up/down:** Change a focused duration field.
- **File:** Presets, multi-clock controls, always-on-top, fullscreen and exit.
- **Help:** Built-in guide.

Click a card to select it before using keyboard shortcuts or File > Quick Timers. Audio previews are in the clock settings dialog.

## Development and tests

```powershell
npm test               # Pure timer model and sound-pattern tests
npm run test:e2e       # Real Electron UI tests in an isolated profile
npm run verify         # Both suites
npm run dist:portable  # Build Windows portable EXE
npm run test:packaged  # Smoke-test the packaged Electron app
```

End-to-end tests exercise: independent timers, opposite countdown directions, repeat timing and phase recovery, color/sound preferences, hide/show options, timer duplication/deletion, quick presets, global controls, very small/large windows, manual resize, settings persistence and completion behavior. Test profiles do not touch your regular CLOCK COUNTER settings.

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
