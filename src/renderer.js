import {
  MAX_CLOCKS, COLOR_PALETTE, newClock, restoreClocks, exportClocks,
  setDurationParts, setDuration, setOptions, startClock, tickClock,
  pauseClock, resetClock, proportionRemaining
} from './clocks.js';
import { clampParts, partsFromDuration, formattedRemaining, elapsedPercentage } from './timer-core.js';
import { primeAudio, playAlarm } from './alarms.js';

const $ = id => document.getElementById(id);
const board = $('clock-board');
const tileTemplate = $('clock-template');
const settings = $('settings-dialog');
const desktop = window.clockCounterWindow;
const storageKey = 'clock-counter:clocks:v3';
const tileRefs = new Map();
let tickingHandle = null;

// Idle clocks do not need a running interval. This also keeps countdown
// timing independent from window animations and tests that mock the clock.
function syncTicker() {
  const needed = state.clocks.some(clock => clock.running);
  if (needed && tickingHandle === null) tickingHandle = setInterval(() => advanceAll(), 50);
  if (!needed && tickingHandle !== null) {
    clearInterval(tickingHandle);
    tickingHandle = null;
  }
}

function loadSavedClocks() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (Array.isArray(stored)) return restoreClocks(stored);
  } catch { /* corrupt preferences must not block startup */ }
  const legacyDuration = Number.parseInt(localStorage.getItem('clock-counter:duration') || '1800', 10);
  const legacySoundOff = localStorage.getItem('clock-counter:sound') === 'off';
  return [newClock({
    durationSeconds: Number.isFinite(legacyDuration) ? legacyDuration : 1800,
    alarm: legacySoundOff ? 'off' : 'chime'
  }, 1)];
}

const state = {
  clocks: loadSavedClocks(),
  activeId: '',
  settingsClockId: null,
  sequence: 0
};
state.activeId = state.clocks[0].id;
let clockOnly = false;

function updateFocusTarget() {
  for (const [id, refs] of tileRefs) {
    refs.root.classList.toggle('focus-clock', id === state.activeId);
  }
}

function setClockOnly(enabled) {
  clockOnly = Boolean(enabled);
  if (clockOnly) closeFileMenu();
  $('app-shell').classList.toggle('clock-only', clockOnly);
  $('focus-restore').hidden = !clockOnly;
  $('clock-only').setAttribute('aria-pressed', String(clockOnly));
  updateFocusTarget();
  try { localStorage.setItem('clock-counter:clock-only', clockOnly ? 'true' : 'false'); } catch { /* optional preference */ }
  action('set-focus-mode', { enabled: clockOnly });
}

function nextId() {
  let id;
  do { id = 'clock-' + Date.now().toString(36) + '-' + (++state.sequence).toString(36); }
  while (state.clocks.some(clock => clock.id === id));
  return id;
}

function getClock(id) {
  return state.clocks.find(clock => clock.id === id);
}

function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(exportClocks(state.clocks))); }
  catch { updateStatus('Unable to save settings (storage unavailable)'); }
}

function updateStatus(message) {
  $('global-status').textContent = message;
}

function action(name, payload) {
  desktop?.action?.(name, payload);
}

function selectClock(id) {
  if (!getClock(id)) return;
  state.activeId = id;
  for (const [clockId, refs] of tileRefs) refs.root.classList.toggle('selected', clockId === id);
  updateFocusTarget();
}

// Each timer has its own bottom control drawer, independent of its countdown.
function setDrawerCollapsed(id, collapsed) {
  const refs = tileRefs.get(id);
  if (!refs) return;
  const next = Boolean(collapsed);
  refs.drawer.classList.toggle('collapsed', next);
  refs.drawer.dataset.collapsed = String(next);
  refs.drawerToggle.setAttribute('aria-expanded', String(!next));
  refs.drawerToggle.setAttribute('aria-label', next ? 'Show timer controls' : 'Hide timer controls');
  refs.drawerToggle.title = next ? 'Slide timer controls up' : 'Slide timer controls down';
  refs.drawerArrow.textContent = next ? '▲' : '▼';

  // Hidden controls must not remain keyboard focus targets or receive clicks.
  refs.controls.inert = next;
  if (next && refs.controls.contains(document.activeElement)) {
    refs.root.focus({ preventScroll: true });
  }
}

function changeClock(id, update, persist = false) {
  const index = state.clocks.findIndex(clock => clock.id === id);
  if (index < 0) return null;
  const next = update(state.clocks[index]);
  state.clocks[index] = next;
  renderClock(next);
  syncTicker();
  if (persist) save();
  return next;
}

function paintMarkers(svg) {
  const ns = 'http://www.w3.org/2000/svg';
  for (let i = 0; i < 12; i += 1) {
    const cardinal = i % 3 === 0;
    for (const [color, width] of [['#050505', cardinal ? 13 : 9], ['#f7f7f4', cardinal ? 8 : 5]]) {
      const mark = document.createElementNS(ns, 'line');
      mark.setAttribute('x1', '200');
      mark.setAttribute('y1', cardinal ? '3' : '9');
      mark.setAttribute('x2', '200');
      mark.setAttribute('y2', cardinal ? '34' : '25');
      mark.setAttribute('stroke', color);
      mark.setAttribute('stroke-width', String(width));
      mark.setAttribute('stroke-linecap', 'square');
      mark.setAttribute('transform', 'rotate(' + i * 30 + ' 200 200)');
      svg.append(mark);
    }
  }
}

function syncFields(clock) {
  const refs = tileRefs.get(clock.id);
  if (!refs) return;
  const parts = partsFromDuration(clock.durationSeconds);
  for (const name of ['hours', 'minutes', 'seconds']) refs.fields[name].value = String(parts[name]);
}

function renderClock(clock) {
  const refs = tileRefs.get(clock.id);
  if (!refs) return;
  const ratio = proportionRemaining(clock);
  const elapsed = elapsedPercentage(clock.remainingMs, clock.durationSeconds * 1000);
  const remaining = ratio.toFixed(5);
  const spent = elapsed.toFixed(5);

  refs.dial.style.setProperty('--remaining', remaining + '%');
  refs.dial.style.setProperty('--elapsed', spent + '%');
  refs.dial.style.setProperty('--fill', clock.color);
  // conic gradients run clockwise; swapping fill/empty makes time
  // disappear from the top counterclockwise when requested.
  refs.dial.style.background = clock.direction === 'cw'
    ? 'conic-gradient(from 0deg, #050505 0% ' + spent + '%, ' + clock.color + ' ' + spent + '% 100%)'
    : 'conic-gradient(from 0deg, ' + clock.color + ' 0% ' + remaining + '%, #050505 ' + remaining + '% 100%)';
  refs.dial.dataset.direction = clock.direction;
  refs.dial.dataset.color = clock.color;
  refs.dial.setAttribute('aria-label', clock.name + ': ' + Math.round(ratio) + ' percent of time remaining');
  refs.dial.classList.toggle('ended', clock.ended);

  const timeText = formattedRemaining(clock.remainingMs);
  refs.readout.textContent = timeText;
  refs.readout.setAttribute('aria-label', timeText + ' remaining');
  refs.readout.classList.toggle('long', timeText.length > 5);
  refs.readout.hidden = !clock.showTime;
  refs.markings.toggleAttribute('hidden', !clock.showTicks);
  refs.timeUp.hidden = !clock.ended;

  if (document.activeElement !== refs.name) refs.name.value = clock.name;
  refs.play.setAttribute('aria-label', clock.running ? 'Pause clock' : 'Start clock');
  refs.play.title = clock.running ? 'Pause clock (Space)' : 'Start clock (Space)';
  refs.play.querySelector('.play-icon').hidden = clock.running;
  refs.play.querySelector('.pause-icon').hidden = !clock.running;
  refs.play.disabled = clock.durationSeconds === 0;
  refs.root.dataset.running = String(clock.running);
  refs.root.dataset.repeat = String(clock.repeat);
  refs.root.dataset.cycles = String(clock.cycles);
  refs.root.dataset.duration = String(clock.durationSeconds);
  refs.cycleCount.hidden = !(clock.repeat && clock.cycles > 0);
  refs.cycleCount.textContent = clock.cycles + '×';
}

function setClockDurationFromFields(id) {
  const refs = tileRefs.get(id);
  if (!refs) return;
  const clock = getClock(id);
  if (!clock) return;
  const parts = clampParts({
    hours: refs.fields.hours.value,
    minutes: refs.fields.minutes.value,
    seconds: refs.fields.seconds.value
  });
  const updated = changeClock(id, old => setDurationParts(old, parts), true);
  syncFields(updated);
  updateStatus(updated.name.toUpperCase() + ' — TIMER SET');
}

function spinField(id, field, step) {
  const refs = tileRefs.get(id);
  if (!refs) return;
  const input = refs.fields[field];
  const max = field === 'hours' ? 99 : 59;
  input.value = String(Math.max(0, Math.min(max, (Number.parseInt(input.value,10) || 0) + step)));
  setClockDurationFromFields(id);
}

function prepareStart() {
  primeAudio();
}

function announceCompletion(clock, completed) {
  playAlarm(clock.alarm, clock.volume);
  updateStatus(clock.name.toUpperCase() + ' — ' +
    (clock.repeat ? 'ROUND ' + clock.cycles + ' (REPEATING)' : 'TIME UP'));
}

function advanceAll(now = Date.now()) {
  for (const old of state.clocks) {
    if (!old.running) continue;
    const { clock, completed } = tickClock(old, now);
    changeClock(old.id, () => clock);
    if (completed) announceCompletion(clock, completed);
  }
}

function toggleClock(id) {
  const clock = getClock(id);
  if (!clock) return;
  selectClock(id);
  if (clock.running) {
    const { clock: paused, completed } = pauseClock(clock, Date.now());
    changeClock(id, () => paused);
    if (completed) announceCompletion(paused, completed);
    else updateStatus(clock.name.toUpperCase() + ' — PAUSED');
  } else {
    prepareStart();
    const started = changeClock(id, old => startClock(old, Date.now()));
    if (started?.running) setDrawerCollapsed(id, true);
    updateStatus(clock.name.toUpperCase() + ' — RUNNING');
  }
}

function resetOne(id) {
  const clock = changeClock(id, resetClock);
  if (clock) updateStatus(clock.name.toUpperCase() + ' — RESET');
}

function applyPreset(id, seconds) {
  const clock = changeClock(id, old => setDuration(old, seconds), true);
  if (clock) {
    syncFields(clock);
    updateStatus(clock.name.toUpperCase() + ' — ' + (seconds/60) + ' MINUTES');
  }
  closeFileMenu();
}

function createTile(clock) {
  const tile = tileTemplate.content.firstElementChild.cloneNode(true);
  tile.dataset.clockId = clock.id;
  tile.setAttribute('aria-label', clock.name);
  const refs = {
    root: tile,
    name: tile.querySelector('.clock-name'),
    dial: tile.querySelector('.dial'),
    markings: tile.querySelector('.dial-markings'),
    readout: tile.querySelector('.time-readout'),
    timeUp: tile.querySelector('.time-up'),
    cycleCount: tile.querySelector('.cycle-count'),
    drawer: tile.querySelector('.controls-drawer'),
    drawerToggle: tile.querySelector('.drawer-toggle'),
    drawerArrow: tile.querySelector('.drawer-arrow'),
    controls: tile.querySelector('.timer-controls'),
    play: tile.querySelector('.play-pause'),
    reset: tile.querySelector('.reset'),
    fields: {
      hours: tile.querySelector('.hours-field'),
      minutes: tile.querySelector('.minutes-field'),
      seconds: tile.querySelector('.seconds-field')
    }
  };
  refs.controls.id = 'timer-controls-' + clock.id;
  refs.drawerToggle.setAttribute('aria-controls', refs.controls.id);
  tileRefs.set(clock.id, refs);
  paintMarkers(refs.markings);

  tile.addEventListener('focusin', () => selectClock(clock.id));
  tile.addEventListener('pointerdown', () => selectClock(clock.id));

  refs.name.addEventListener('change', () => {
    const current = changeClock(clock.id, old => setOptions(old, { name: refs.name.value }), true);
    if (current) {
      refs.name.value = current.name;
      tile.setAttribute('aria-label', current.name);
    }
  });
  refs.name.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); refs.name.blur(); }
  });

  for (const [field, input] of Object.entries(refs.fields)) {
    input.setAttribute('aria-label', field[0].toUpperCase() + field.slice(1) + ' for ' + clock.name);
    input.addEventListener('input', () => {
      const cleaned = input.value.replace(/[^0-9]/g, '').slice(0,2);
      if (input.value !== cleaned) input.value = cleaned;
    });
    input.addEventListener('change', () => setClockDurationFromFields(clock.id));
    input.addEventListener('focus', () => input.select());
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        spinField(clock.id, field, event.key === 'ArrowUp' ? 1 : -1);
      }
    });
  }
  tile.querySelectorAll('[data-field][data-step]').forEach(button => {
    button.addEventListener('click', () => spinField(clock.id, button.dataset.field, Number(button.dataset.step)));
  });

  refs.drawerToggle.addEventListener('click', () => {
    setDrawerCollapsed(clock.id, !refs.drawer.classList.contains('collapsed'));
  });
  refs.play.addEventListener('click', () => toggleClock(clock.id));
  refs.reset.addEventListener('click', () => resetOne(clock.id));
  tile.querySelector('.tile-settings').addEventListener('click', () => openSettings(clock.id));
  tile.querySelector('.tile-remove').addEventListener('click', () => removeClock(clock.id));
  board.append(tile);
  syncFields(clock);
  renderClock(clock);
}

function refreshBoard() {
  const single = state.clocks.length === 1;
  board.classList.toggle('single', single);
  document.querySelectorAll('.menubar .multi-only').forEach(button => button.hidden = single);
  $('add-clock').disabled = state.clocks.length >= MAX_CLOCKS;
  $('duplicate-clock').disabled = state.clocks.length >= MAX_CLOCKS;
  $('delete-clock').disabled = single;

  for (const id of tileRefs.keys()) {
    if (!getClock(id)) {
      tileRefs.get(id).root.remove();
      tileRefs.delete(id);
    }
  }
  for (const clock of state.clocks) {
    if (!tileRefs.has(clock.id)) createTile(clock);
    else renderClock(clock);
  }
  selectClock(state.activeId);
}

function addClock(source = null) {
  if (clockOnly) setClockOnly(false);
  if (state.clocks.length >= MAX_CLOCKS) { updateStatus('LIMIT: ' + MAX_CLOCKS + ' CLOCKS'); return; }
  const id = nextId();
  const options = source ? {
    ...source, id,
    name: (source.name + ' copy').slice(0,36)
  } : { id, name: 'Clock ' + (state.clocks.length + 1) };
  const clock = newClock(options, state.clocks.length + 1);
  state.clocks.push(clock);
  state.activeId = id;
  refreshBoard();
  save();
  // Grow automatically so the second clock can appear next to the first.
  action('fit-clocks', { count: state.clocks.length });
  updateStatus(clock.name.toUpperCase() + ' — ADDED');
}

function removeClock(id) {
  if (state.clocks.length <= 1) return;
  const clock = getClock(id);
  if (!clock) return;
  if (clock.running && !window.confirm('Remove the running timer "' + clock.name + '"?')) return;
  state.clocks = state.clocks.filter(t => t.id !== id);
  syncTicker();
  if (state.settingsClockId === id) closeSettings();
  if (state.activeId === id) state.activeId = state.clocks[0].id;
  refreshBoard();
  save();
  updateStatus(clock.name.toUpperCase() + ' — REMOVED');
}

function startAll() {
  prepareStart();
  const now = Date.now();
  state.clocks = state.clocks.map(clock => startClock(clock, now));
  syncTicker();
  for (const clock of state.clocks) {
    renderClock(clock);
    if (clock.running) setDrawerCollapsed(clock.id, true);
  }
  updateStatus('ALL TIMERS STARTED');
}

function pauseAll() {
  const now = Date.now();
  for (const old of state.clocks) {
    if (!old.running) continue;
    const { clock, completed } = pauseClock(old, now);
    changeClock(old.id, () => clock);
    if (completed) announceCompletion(clock, completed);
  }
  updateStatus('ALL TIMERS PAUSED');
}

function resetAll() {
  state.clocks = state.clocks.map(resetClock);
  syncTicker();
  for (const clock of state.clocks) renderClock(clock);
  updateStatus('ALL TIMERS RESET');
}

function syncColorSwatches() {
  const clock = getClock(state.settingsClockId);
  if (!clock) return;
  $('color-swatches').querySelectorAll('.color-swatch').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.color === clock.color));
  });
}

function openSettings(id) {
  if (clockOnly) setClockOnly(false);
  if (!getClock(id)) return;
  closeFileMenu();
  state.settingsClockId = id;
  selectClock(id);
  const clock = getClock(id);
  $('settings-heading').textContent = clock.name.toUpperCase() + ' SETTINGS';
  $('setting-direction').value = clock.direction;
  $('setting-color').value = clock.color.toLowerCase();
  $('setting-alarm').value = clock.alarm;
  $('setting-volume').value = String(clock.volume);
  $('setting-repeat').checked = clock.repeat;
  $('setting-show-time').checked = clock.showTime;
  $('setting-show-ticks').checked = clock.showTicks;
  syncColorSwatches();
  settings.showModal();
}

function closeSettings() {
  if (settings.open) settings.close();
  state.settingsClockId = null;
}

function applySetting(changes) {
  const clock = changeClock(state.settingsClockId, old => setOptions(old, changes), true);
  if (clock) syncColorSwatches();
}

for (const color of COLOR_PALETTE) {
  const button = document.createElement('button');
  button.className = 'color-swatch';
  button.dataset.color = color;
  button.style.setProperty('--swatch', color);
  button.title = color;
  button.setAttribute('aria-label', 'Color ' + color);
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => {
    applySetting({ color });
    $('setting-color').value = color.toLowerCase();
  });
  $('color-swatches').append(button);
}

$('setting-direction').addEventListener('change', event => applySetting({ direction: event.target.value }));
$('setting-color').addEventListener('input', event => applySetting({ color: event.target.value }));
$('setting-alarm').addEventListener('change', event => applySetting({ alarm: event.target.value }));
$('setting-volume').addEventListener('input', event => applySetting({ volume: Number(event.target.value) }));
$('setting-repeat').addEventListener('change', event => applySetting({ repeat: event.target.checked }));
$('setting-show-time').addEventListener('change', event => applySetting({ showTime: event.target.checked }));
$('setting-show-ticks').addEventListener('change', event => applySetting({ showTicks: event.target.checked }));
$('preview-alarm').addEventListener('click', () => {
  primeAudio();
  const clock = getClock(state.settingsClockId);
  if (clock) playAlarm(clock.alarm, clock.volume);
});
$('settings-close').addEventListener('click', closeSettings);
$('done-settings').addEventListener('click', closeSettings);
$('duplicate-clock').addEventListener('click', () => {
  const source = getClock(state.settingsClockId);
  closeSettings();
  if (source) addClock(source);
});
$('delete-clock').addEventListener('click', () => removeClock(state.settingsClockId));
settings.addEventListener('close', () => { state.settingsClockId = null; });

function closeFileMenu() {
  $('file-menu').hidden = true;
  $('file-trigger').setAttribute('aria-expanded', 'false');
}
function toggleFileMenu() {
  const menu = $('file-menu');
  menu.hidden = !menu.hidden;
  $('file-trigger').setAttribute('aria-expanded', String(!menu.hidden));
}

$('clock-only').addEventListener('click', () => setClockOnly(true));
$('focus-restore').addEventListener('click', () => setClockOnly(false));
$('menu-clock-only').addEventListener('click', () => setClockOnly(true));
$('menu-timer-toggle').addEventListener('click', () => { closeFileMenu(); toggleClock(state.activeId); });
$('menu-timer-reset').addEventListener('click', () => { closeFileMenu(); resetOne(state.activeId); });
$('menu-timer-settings').addEventListener('click', () => { closeFileMenu(); openSettings(state.activeId); });
$('file-trigger').addEventListener('click', toggleFileMenu);
document.addEventListener('pointerdown', event => {
  if (!event.target.closest('.menu-wrap')) closeFileMenu();
});
$('add-clock').addEventListener('click', () => addClock());
$('menu-new').addEventListener('click', () => { closeFileMenu(); addClock(); });
$('all-start').addEventListener('click', startAll);
$('all-pause').addEventListener('click', pauseAll);
$('all-reset').addEventListener('click', resetAll);
$('menu-start-all')?.addEventListener('click', () => { startAll(); closeFileMenu(); });
$('menu-pause-all')?.addEventListener('click', () => { pauseAll(); closeFileMenu(); });
$('menu-reset-all')?.addEventListener('click', () => { resetAll(); closeFileMenu(); });
document.querySelectorAll('[data-preset]').forEach(button => {
  button.addEventListener('click', () => applyPreset(state.activeId, Number(button.dataset.preset)));
});
$('menu-top').addEventListener('click', () => { action('toggle-always-on-top'); closeFileMenu(); });
$('menu-fullscreen').addEventListener('click', () => { action('toggle-fullscreen'); closeFileMenu(); });
$('menu-exit').addEventListener('click', () => action('close'));
desktop?.onAlwaysOnTop?.(value => {
  $('top-check').textContent = value ? '✓' : '';
  $('menu-top').setAttribute('aria-pressed', String(value));
});
for (const [id, command] of [
  ['window-minimize','minimize'], ['window-maximize','maximize'],['window-close','close']
]) $(id).addEventListener('click', () => action(command));

$('menu-help').addEventListener('click', () => { closeFileMenu(); $('help-dialog').showModal(); });
$('help-trigger').addEventListener('click', () => { closeFileMenu(); $('help-dialog').showModal(); });
$('help-close').addEventListener('click', () => $('help-dialog').close());
$('help-done').addEventListener('click', () => $('help-dialog').close());

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (clockOnly && !$('help-dialog').open && !settings.open) {
      event.preventDefault();
      setClockOnly(false);
    } else closeFileMenu();
    return;
  }
  if ($('help-dialog').open || settings.open) return;
  if (event.ctrlKey && event.key.toLowerCase() === 'n') { event.preventDefault(); addClock(); return; }
  const target = event.target;
  if (target instanceof HTMLElement && target.closest('input,select,textarea,[contenteditable="true"]')) return;
  if (event.key.toLowerCase() === 'h' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    setClockOnly(!clockOnly);
    return;
  }
  if (event.code === 'Space' && !(target instanceof HTMLElement && target.closest('button'))) {
    event.preventDefault(); toggleClock(state.activeId);
  }
  if (event.key.toLowerCase() === 'r' && !event.ctrlKey && !event.metaKey) {
    event.preventDefault(); resetOne(state.activeId);
  }
  if (event.key.toLowerCase() === 'f' && !event.ctrlKey && !event.metaKey) {
    event.preventDefault(); action('toggle-fullscreen');
  }
});
document.addEventListener('visibilitychange', () => advanceAll());

const grip = $('resize-grip');
let resizing = null;
grip.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  event.preventDefault();
  resizing = {
    x: event.screenX, y: event.screenY,
    width: window.innerWidth, height: window.innerHeight
  };
  grip.setPointerCapture(event.pointerId);
});
grip.addEventListener('pointermove', event => {
  if (!resizing) return;
  action('resize-to', {
    width: resizing.width + event.screenX - resizing.x,
    height: resizing.height + event.screenY - resizing.y
  });
});
grip.addEventListener('pointerup', () => { resizing = null; });
grip.addEventListener('pointercancel', () => { resizing = null; });
grip.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  action('resize-to', { width: window.innerWidth + 100, height: window.innerHeight + 70 });
});

refreshBoard();
if (localStorage.getItem('clock-counter:clock-only') === 'true') setClockOnly(true);
updateStatus('READY — ' + state.clocks.length + ' CLOCK' + (state.clocks.length === 1 ? '' : 'S'));
