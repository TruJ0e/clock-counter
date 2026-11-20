# CLOCK COUNTER

A retro Windows visual timer for people who benefit from **seeing** time instead of calculating it. The colored area of the round dial shows the amount of time remaining and disappears as time runs out. White clock dashes remain decorative; optional quarter-progress markers correspond to the actual duration. Black background, white outlines, red default face and sliding bottom controls remain the default appearance.

Version **0.6.0** adds Start At scheduling to the desktop and website, on top of automatic updates and configurable timer modes, visual accessibility tools, offline alarms, saved presets and collections, floating clocks, system tray, backup/restore and optimized packaging. No account, telemetry, paid API or internet access is required.

## TruTimeClock public website

The static website version of CLOCK COUNTER is served at **https://ttc.trujoedigital.com/** from Cloudflare Pages under the project **trutimeclock**. Only the static files in `site/` are deployed: HTML, CSS, app JavaScript, the PWA manifest, same-origin service worker, brand icons, security headers, a 404 page, robots.txt and sitemap.xml. The public website needs no account, database, API, or application server and does **not** create a connection to your local computer.

The site's content-security policy forbids network connections from timer scripts and disallows third-party scripts, inline JavaScript and iframes. Only the audited same-origin service worker may make same-origin requests to cache the site's explicitly listed static assets for offline installation. The Cloudflare Pages response headers also deny framing, limit browser permissions and require HTTPS where supported. User timer settings stay in the visitor's browser local storage; the only access to local files is through a user-initiated file picker for import and export. **No website can guarantee zero security risk**, but this design minimizes exposed functionality.

To refresh the static site from the tested browser edition, run `npm run build:ttc`, then `npm run test:ttc`. After deployment, `npm run test:ttc:live` checks the public custom domain and HTTP 404 behavior. Commit updated `site/` assets to `main`. Cloudflare Pages Git deployments publish those assets, without running Node.js or Electron in the hosted app.

## Ultra-small Browser Edition (new)

For sharing with someone who just needs the timer, **CLOCK COUNTER Web Lite** is available as one self-contained HTML file (about 117 KB), or a ZIP download of about **29 KB**. It opens in an existing browser, requires no installation, works offline, and preserves the retro timer UI and most timer features. It cannot provide native Windows tray, always-on-top, or separate native floating-window functionality.

Build it with npm run build:web-lite, test it with npm run test:web-lite, or open web-lite/CLOCK COUNTER WEB LITE.html directly. Full usage details and limitations are in web-lite/README.md. The full-featured Windows executable is still the best choice for system-tray operation and native desktop behavior.

## macOS Always on Top fix (v0.6.1)

**File → Always on top** on the downloadable Mac app now enables both Electron's floating window level and visibility across macOS Spaces, including full-screen Spaces where supported by macOS. Turning it off restores normal window stacking and Space behavior. The preference survives a normal app restart. The change is macOS-specific; Windows retains its existing Always on Top behavior.

The iPhone/iPad browser-installed version cannot force Always on Top over other apps because iOS does not expose desktop window-stacking controls to web apps. Mac downloads remain unsigned and unnotarized. The Mac app's Update button links to the website for manual download; automatic native update installation remains Windows-only.

## TruTimeClock Mobile developer beta

Native mobile projects are available under **mobile/** and documented in **mobile/README.md**. Both bundle the existing offline timer engine.

- **Android:** A native Kotlin WebView app with an explicit FLOAT button starts a draggable, collapsible overlay above other apps. A foreground-service notification remains visible. The testing APK is under the GitHub prerelease **mobile-v0.1.0-beta.2**. Android requires user approval for Display over other apps, and the beta has not yet been verified on a physical Android device.
- **iPhone/iPad:** A native SwiftUI app with an ActivityKit Live Activity extension compiles and is available as an **unsigned iOS Simulator artifact** in GitHub Actions. A directly installable iPhone build still needs the owner's Apple Developer certificate, provisioning and physical device testing. Dynamic Island and Lock Screen countdowns are supported where hardware allows; an iPhone cannot display an arbitrary always-on-top floating timer above other apps using public APIs.
- The mobile app bundle is generated via **npm run build:mobile** and checked with **npm run test:mobile**. Neither native app connects back to a personal computer or a remote-control service.

## Apple downloads and installation

TruTimeClock is available on Apple devices as a standalone web app and on Mac computers as an Electron desktop application.

**iPhone or iPad:** Open https://ttc.trujoedigital.com/ in Safari, select **Download** beside Help, then follow the **Add to Home Screen** instructions. In supported iOS/iPadOS versions, enable **Open as Web App**. The installed icon opens TruTimeClock in its own app-style window, with the retro clock and locally saved settings. After the first online load, core clock features are cached for offline use. iOS may suspend timers or alarms while the web app is closed or in the background; this is not a system-level alarm app or an App Store IPA.

**macOS:** Open the website, select Download, then pick the DMG for **Apple Silicon (M1–M-series)** or **Intel Mac**. Open the DMG and drag **CLOCK COUNTER.app** to Applications. Alternatively, in macOS Sonoma or later use Safari > File > Add to Dock to install the website version.

The standalone macOS DMGs are not signed or notarized with an Apple Developer ID. Gatekeeper may block opening until explicitly authorized in System Settings > Privacy & Security > Open Anyway. The Mac app's Update button opens the website to get the latest Mac build; **automatic native updates currently run only for the Windows installer**.

The public website Download dialog also offers the Windows installer. The website footer and Help dialog both link to https://trujoedigital.com/. The public PWA remains static and does not connect to any local desktop or agent. Its service worker caches only same-origin, explicitly enumerated assets.

Build macOS DMGs using `npm run build:mac` on macOS after generating the native icon with `bash scripts/generate-mac-icon.sh`. GitHub Actions builds and validates both CPU architectures, then publishes their DMGs to the existing public versioned GitHub release.

## Start At: scheduled clock starts (v0.6.0)

Every clock has its own **START AT** row below the Play/Pause and duration controls. Set the clock's duration, choose a local time (for example, **5:00 PM** when it is **4:56 PM**), and press **Set**. The controls slide down and the clock face displays its scheduled start time. It stays on a full dial until the scheduled moment, then runs the selected countdown, stopwatch, work/break sequence, or activity routine.

- If a chosen time has already passed today, the next occurrence is **tomorrow**. This is a one-time start, not an automatically repeating daily appointment.
- **Cancel** cancels the scheduled start. **Reset** also cancels it. **Play** starts immediately rather than waiting. **Pause All** cancels all pending scheduled starts.
- Each clock can wait for its own different time. The schedule survives an app or tab restart **only if it is still in the future**; past start times are not automatically replayed on launch.
- The **Windows app must remain running** (the tray can keep it running). On the website, leave the tab open; browsers may throttle background tabs. If a tick arrives late, the timer catches up using the original scheduled start time rather than incorrectly starting a full countdown late.
- Uses the computer or phone's local clock time and timezone, with no remote time service.

## Website download and desktop updates (v0.5.0)

Visit **https://ttc.trujoedigital.com/** and select **Download** directly to the right of **Help** to download the Windows x64 desktop installer from an official, public GitHub release. The link points directly to the installer executable, not a page requiring a GitHub account.

In the **installed Windows app**, this top-menu control reads **Update**. Clicking it forces an immediate check of the official **TruJ0e/clock-counter** GitHub releases, even if an automatic check ran recently. The status bar reports whether it is up to date, downloading, ready, or could not connect. The update check also runs automatically at startup when due, and every seven days while the app is running. A failed scheduled check is retried after one hour if the app remains open.

Updates are downloaded automatically and verified against SHA-512 metadata from the same GitHub release. The updater applies the downloaded installer **when you quit the app normally**, preserving active countdowns rather than forcibly restarting the application. If it is hidden in the system tray, use the tray's **Quit** command; just closing the window may hide the app instead. You can then reopen it with the newest version installed.

**The installed NSIS app is required for automatic installation.** Existing v0.4.0 portable copies and the stand-alone browser/HTML versions do not become self-updating; install v0.5.0 from the website to get the integrated updater. Updates can only be checked while the desktop application is running.

**Signing and trust:** The installer is not yet Authenticode-signed, so Windows may warn about an unknown publisher. GitHub HTTPS and SHA-512 metadata integrity checks help detect transfer corruption or substitution, but they are not a replacement for a trusted Windows code-signing certificate. Automatic updates trust the configured GitHub release publisher account; protect that account with strong multi-factor authentication. The website itself exposes no API to the local computer, and browser-page scripts still cannot make network connections.

## Run on Windows

Build the portable executable using Node.js:

~~~powershell
npm install
npm run dist:portable
~~~

Open dist/CLOCK COUNTER 0.4.0.exe. Recipients do not need Node.js. The unsigned build may prompt a Windows SmartScreen warning. Development: npm start. Installer build: npm run dist:win.

## Standard timer controls

Click Play to start. The bottom controls automatically slide down, leaving a small up-arrow tab. Click the arrow to reveal Play/Pause, Reset and hours/minutes/seconds; the down arrow hides them. Each clock has its own drawer.

Click the small square button near the top, or press H, for full clock-only mode; restore with the top-right button, H or Escape. Space starts/pauses the selected clock, R resets, Ctrl+N adds a clock and F toggles fullscreen. File > Timer includes these actions even with the bottom controls hidden.

## All eighteen requested additions

1. **Custom duration presets** — File > Presets & Collections saves named durations; they appear in File for quick use.
2. **Preset collections** — Save multi-stage activity routines and complete multi-clock layouts with settings; reload them later.
3. **Meaningful progress markers** — Optional marks at 75%, 50% and 25% remaining, with actual time values in tooltips.
4. **Auto-hide numeric countdown** — Hide the digits while Play is active; leave the time pie visible.
5. **Warning color transitions** — Independent warning/critical thresholds and colors for each clock.
6. **Checkpoint alerts** — Optional sound and desktop notification when remaining time crosses selected percentages.
7. **Custom audio imports** — Choose a local MP3, WAV or OGG file (up to 8 MB) as the clock alarm.
8. **Persistent alarms** — Repeat alarms approximately every 3.5 seconds after the timer finishes until ACK or Reset.
9. **Visual task labels** — Optional monochrome icons for reading, work, break, cleanup, study and movement.
10. **Sequential activities** — Automatically progress through saved stages with names, durations, colors and pictograms; optionally loop.
11. **Work/break schedule** — Configurable work minutes, short/long breaks and rounds; optionally repeat.
12. **Overtime counter** — At zero, optionally count upward with a leading plus sign.
13. **Stopwatch mode** — Count upward instead of down with an optional visual progress goal.
14. **Floating clock windows** — Detach individual clocks into separate native Windows views; Play/Pause, Reset and ACK synchronize with the master timer.
15. **Drag to reorder** — Drag each clock's handle to arrange multi-clock layouts.
16. **Lock controls and layout** — File > Lock controls & layout prevents accidental edits and resizing until unlocked.
17. **System tray** — Enable from File. Hide the main window while timers continue running; the tray menu can show, start all, pause all or quit.
18. **Export/import setups** — Save a versioned JSON backup containing timers, presets, layouts, advanced settings and imported audio data. Import confirms before replacing active clocks and creates new audio IDs instead of overwriting existing files.

## Timer modes

Open the gear button on a clock. The Timer type menu offers Countdown, Stopwatch, Activity sequence or Work/break schedule. In Activity sequence mode, select a collection saved under File > Presets & Collections. Work/break mode has its own minutes and rounds fields.

Timers use absolute deadlines while the app remains open, including when hidden in the tray. System sleep or delayed rendering does not accumulate drift. Closing the app entirely stops timers, and reopening restores settings but does not automatically restart countdowns.

## Privacy and security

All activity runs locally. Native operations are exposed through a restricted, sandboxed Electron bridge. Imported setup JSON is validated before replacing clocks. Audio IDs, extensions and file sizes are checked. Setups are limited to 34 MB with up to 24 MB decoded audio. The backup embeds imported audio if present, so restored presets and custom sounds can be moved to another Windows computer. Untrusted audio cannot run code in this application; it is passed to the local media decoder. No data is uploaded unless you explicitly share it.

## Build optimization

The Windows portable build uses maximum executable compression and removes unused Electron locale resources, retaining English locale packs. Required runtime libraries, graphics code, media codecs, ICU data, and license files are preserved. Electron still has a significant base size. A separate Tauri/WebView2 migration could reduce it further, but would require retesting native tray, audio, file dialogs and floating windows.

## Automated verification

~~~powershell
npm test                # Pure timer, sequence, stopwatch, checkpoint and backup tests
npm run test:e2e        # Existing multi-clock desktop integration tests
npm run test:focus      # Tiny window and clock-only interface
npm run test:drawer     # Slide-down controls and independent drawers
npm run test:advanced   # Presets, activities, warnings, floating clocks, tray, lock
npm run test:files      # Native audio import and setup export/import dialogs
npm run verify          # Every source and Electron test suite
npm run dist:portable   # Build optimized portable executable
npm run test:packaged   # Test the actual packaged Windows binary
~~~

Test profiles are isolated from everyday CLOCK COUNTER settings.

## Project structure

- main.cjs — secure native window management, tray, dialogs, sound storage and backup integration.
- preload.cjs — allowlisted renderer bridge.
- index.html, src/styles.css — retro interface and settings.
- src/renderer.js — UI interactions, alerts, presets, schedules, locking and synchronization.
- src/clocks.js — immutable countdown, stopwatch, overtime, work/break and sequence logic.
- src/library.js — presets, collections and versioned backup validation.
- src/timer-core.js, src/alarms.js — formatting, math and synthesized local tones.
- detached.html, src/detached.js — independent floating clock views.
- scripts/after-pack.cjs — package locale pruning.
- tests — unit, end-to-end UI, native-file and packaged-app smoke tests.
