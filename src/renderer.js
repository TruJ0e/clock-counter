import {
  clampParts, durationFromParts, partsFromDuration, formattedRemaining,
  elapsedPercentage, remainingAtDeadline
} from './timer-core.js';

const $ = (id) => document.getElementById(id);
const elements = {
  dial: $('dial'),
  markings: $('dial-markings'),
  countdown: $('countdown'),
  status: $('status'),
  playPause: $('play-pause'),
  playIcon: $('play-icon'),
  pauseIcon: $('pause-icon'),
  reset: $('reset'),
  fields: {
    hours: $('hours'),
    minutes: $('minutes'),
    seconds: $('seconds')
  }
};

const savedDuration = Number.parseInt(localStorage.getItem('clock-counter:duration') || '1800', 10);
const initialSeconds = Number.isInteger(savedDuration) && savedDuration >= 0 && savedDuration <= 359999
  ? savedDuration : 1800;

const state = {
  durationSeconds: initialSeconds,
  remainingMs: initialSeconds * 1000,
  running: false,
  deadlineMs: 0,
  intervalId: null,
  ended: false,
  soundEnabled: localStorage.getItem('clock-counter:sound') !== 'off',
  audioContext: null
};

const desktop = window.clockCounterWindow;

// The twelve dashes are deliberately static and decorative. They never
// imply that a full rotation is necessarily sixty minutes.
function drawDecoration() {
  const ns = 'http://www.w3.org/2000/svg';
  for (let i = 0; i < 12; i += 1) {
    const cardinal = i % 3 === 0;
    const start = cardinal ? 2 : 8;
    const end = cardinal ? 32 : 24;
    for (const [color, width] of [['#050505', cardinal ? 13 : 9], ['#f7f7f4', cardinal ? 8 : 5]]) {
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', '200');
      line.setAttribute('y1', String(start));
      line.setAttribute('x2', '200');
      line.setAttribute('y2', String(end));
      line.setAttribute('transform', 'rotate(' + (i * 30) + ' 200 200)');
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-width', String(width));
      line.setAttribute('stroke-linecap', 'square');
      elements.markings.appendChild(line);
    }
  }
}

function render() {
  const text = formattedRemaining(state.remainingMs);
  const elapsed = elapsedPercentage(state.remainingMs, state.durationSeconds * 1000);
  elements.countdown.textContent = text;
  elements.countdown.setAttribute('aria-label', text + ' remaining');
  elements.countdown.classList.toggle('is-long', text.length > 5);
  elements.dial.style.setProperty('--elapsed', elapsed.toFixed(5) + '%');
  elements.dial.setAttribute('aria-label', Math.round(100 - elapsed) + ' percent of the timer remaining');
  elements.playPause.setAttribute('aria-label', state.running ? 'Pause timer' : 'Start timer');
  elements.playPause.title = state.running ? 'Pause (Space)' : 'Start (Space)';
  elements.playIcon.hidden = state.running;
  elements.pauseIcon.hidden = !state.running;
  elements.playPause.disabled = state.durationSeconds === 0;
}

function announce(message) {
  elements.status.textContent = message;
}

function keepFieldsInSync() {
  const parts = partsFromDuration(state.durationSeconds);
  for (const name of ['hours', 'minutes', 'seconds']) {
    elements.fields[name].value = String(parts[name]);
  }
}

function clearTicking() {
  if (state.intervalId !== null) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
}

function pause() {
  if (!state.running) return;
  state.remainingMs = remainingAtDeadline(state.deadlineMs, Date.now());
  state.running = false;
  clearTicking();
  if (state.remainingMs === 0) finish();
  else { announce('Timer paused'); render(); }
}

function prepareSound() {
  if (!state.soundEnabled) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!state.audioContext) state.audioContext = new AudioContext();
    if (state.audioContext.state === 'suspended') state.audioContext.resume().catch(() => {});
  } catch { /* sound is optional; counting must always work */ }
}

function completedSound() {
  if (!state.soundEnabled || !state.audioContext) return;
  try {
    const ctx = state.audioContext;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    [0, 0.24, 0.48].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 784;
      const start = ctx.currentTime + offset;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.19, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.17);
    });
  } catch { /* browser audio permissions do not affect the timer */ }
}

function finish() {
  if (state.ended) return;
  state.running = false;
  state.remainingMs = 0;
  state.ended = true;
  clearTicking();
  render();
  announce('Time is up');
  completedSound();
}

function tick() {
  if (!state.running) return;
  state.remainingMs = remainingAtDeadline(state.deadlineMs, Date.now());
  if (state.remainingMs <= 0) finish();
  else render();
}

function start() {
  if (state.running || state.durationSeconds === 0) return;
  if (state.remainingMs <= 0) state.remainingMs = state.durationSeconds * 1000;
  prepareSound();
  state.running = true;
  state.ended = false;
  state.deadlineMs = Date.now() + state.remainingMs;
  clearTicking();
  state.intervalId = setInterval(tick, 50);
  tick();
  announce('Timer running');
}

function togglePlay() {
  if (state.running) pause();
  else start();
}

function reset() {
  state.running = false;
  state.ended = false;
  clearTicking();
  state.remainingMs = state.durationSeconds * 1000;
  render();
  announce('Timer reset');
}

function applyFields() {
  const clean = clampParts({
    hours: elements.fields.hours.value,
    minutes: elements.fields.minutes.value,
    seconds: elements.fields.seconds.value
  });
  state.durationSeconds = durationFromParts(clean);
  localStorage.setItem('clock-counter:duration', String(state.durationSeconds));
  keepFieldsInSync();
  reset();
}

function spin(fieldName, step) {
  const field = elements.fields[fieldName];
  const current = Number.parseInt(field.value, 10) || 0;
  const max = fieldName === 'hours' ? 99 : 59;
  field.value = String(Math.max(0, Math.min(max, current + step)));
  applyFields();
}

function windowAction(action) {
  if (desktop) desktop.action(action);
}

function closeFileMenu() {
  $('file-menu').hidden = true;
  $('file-trigger').setAttribute('aria-expanded', 'false');
}

function toggleFileMenu() {
  const menu = $('file-menu');
  menu.hidden = !menu.hidden;
  $('file-trigger').setAttribute('aria-expanded', String(!menu.hidden));
}

for (const [button, action] of [
  ['window-minimize', 'minimize'],
  ['window-maximize', 'maximize'],
  ['window-close', 'close']
]) {
  $(button).addEventListener('click', () => windowAction(action));
}
elements.playPause.addEventListener('click', togglePlay);
elements.reset.addEventListener('click', reset);

for (const [name, input] of Object.entries(elements.fields)) {
  input.addEventListener('change', applyFields);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
  });
  input.addEventListener('focus', () => input.select());
  // Guard against accidental scroll-wheel edits and stray characters.
  input.addEventListener('input', () => {
    const cleaned = input.value.replace(/[^0-9]/g, '').slice(0, 2);
    if (input.value !== cleaned) input.value = cleaned;
  });
}

document.querySelectorAll('[data-field][data-step]').forEach((button) => {
  button.addEventListener('click', () => {
    spin(button.dataset.field, Number(button.dataset.step));
  });
});

$('file-trigger').addEventListener('click', toggleFileMenu);
document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('.menu-wrap')) closeFileMenu();
});
$('menu-restart').addEventListener('click', () => { reset(); closeFileMenu(); });
$('menu-exit').addEventListener('click', () => windowAction('close'));
$('menu-top').addEventListener('click', () => { windowAction('toggle-always-on-top'); closeFileMenu(); });
$('menu-fullscreen').addEventListener('click', () => { windowAction('toggle-fullscreen'); closeFileMenu(); });
$('menu-sound').addEventListener('click', () => {
  state.soundEnabled = !state.soundEnabled;
  localStorage.setItem('clock-counter:sound', state.soundEnabled ? 'on' : 'off');
  $('sound-check').textContent = state.soundEnabled ? '✓' : '';
  $('menu-sound').setAttribute('aria-pressed', String(state.soundEnabled));
  closeFileMenu();
});

if (desktop) {
  desktop.onAlwaysOnTop((onTop) => {
    $('top-check').textContent = onTop ? '✓' : '';
    $('menu-top').setAttribute('aria-pressed', String(onTop));
  });
}

$('help-trigger').addEventListener('click', () => { closeFileMenu(); $('help-dialog').showModal(); });
$('help-close').addEventListener('click', () => $('help-dialog').close());
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { closeFileMenu(); return; }
  if ($('help-dialog').open) return;
  const target = event.target;
  if (target instanceof HTMLElement && target.closest('input,button,select,textarea')) return;
  if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
  if (event.key.toLowerCase() === 'r' && !event.ctrlKey && !event.metaKey) reset();
  if (event.key.toLowerCase() === 'f' && !event.ctrlKey && !event.metaKey) windowAction('toggle-fullscreen');
});
document.addEventListener('visibilitychange', tick);

drawDecoration();
keepFieldsInSync();
$('sound-check').textContent = state.soundEnabled ? '✓' : '';
$('menu-sound').setAttribute('aria-pressed', String(state.soundEnabled));
render();
