# CLOCK COUNTER — Web Lite

**Size:** One self-contained HTML file, approximately 117 KB. ZIP download, approximately 29 KB.

This edition uses the same visual countdown engine, retro interface, and clock layout as the native Windows version, but runs directly in a modern web browser.

## How to use it

1. Extract the ZIP file if you downloaded the ZIP version.
2. Double-click **CLOCK COUNTER WEB LITE.html** to open it in your default browser, or drag the HTML file into Microsoft Edge, Chrome, or another compatible browser.
3. Use Play, the bottom drawer arrows, the gear icon, and **File → Presets & Collections** as usual.

No installer, administrator permissions, Node.js, or internet connection is needed. Everything needed to open the timer is contained in the HTML file.

## Available

- Multiple independent timers, names, colors and countdown directions.
- Clock-only mode, responsive sizing, and collapsing bottom controls.
- Timers that count down or up, overtime, visual progress markers, warning colors and checkpoints.
- Work/break cycles and sequential activity collections.
- Synthesized alarm sounds; small custom audio file imports (maximum 1.2 MB).
- Persistent alarms, task icons, preset collections, drag reordering, and settings lock.
- Local storage for settings and clock preferences.
- Export and import of setups as JSON files, including supported small custom audio.

## Differences from the full Windows application

- No native Windows system tray, always-on-top mode, or detachable Windows clock windows.
- No true Windows application titlebar; clock-only mode hides the app controls inside the browser. Press **F** to request browser fullscreen.
- Browsers may throttle background tabs and may restrict alarm playback until you interact with the page.
- The browser stores preferences for the local HTML file. Different browsers or different file locations may maintain separate storage, and clearing site data can erase preferences. Export a setup backup to keep your configurations.
- Audio storage has much lower limits than the full desktop version.
- The full Windows application remains the recommended option for reliable tray timers, floating windows, and OS-level behavior.

## Building from source

Run **npm run build:web-lite** from the main repository. This writes the HTML file to both **web-lite/** (versioned in Git) and **dist/** (for distribution). Run **npm run test:web-lite** to test the actual local HTML in Microsoft Edge using Playwright. The source files are not forked: the build incorporates the same timer engine and interface used by the Electron application.

This edition does not contain a browser runtime. The user's existing web browser supplies rendering and sound functionality, allowing the download to stay in kilobytes.
