// Pure model for independent countdown clocks. All time values are milliseconds.
import { durationFromParts, elapsedPercentage } from './timer-core.js';

export const MAX_CLOCKS = 12;
export const DEFAULT_COLOR = '#F20B14';
export const COLOR_PALETTE = Object.freeze([
  '#F20B14', '#FF7A00', '#FFD23F', '#24C45E', '#00B9B0',
  '#2486F2', '#9B5DE5', '#F15BB5', '#F8F8F8'
]);
export const DIRECTIONS = Object.freeze(['cw', 'ccw']);
export const ALARMS = Object.freeze(['chime', 'beep', 'bell', 'digital', 'off']);

export function validColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function newClock(options = {}, id = 1) {
  const durationSeconds = boundedDuration(options.durationSeconds);
  const seconds = durationSeconds;
  return {
    id: String(options.id || id),
    name: safeName(options.name) || 'Clock ' + id,
    durationSeconds: seconds,
    remainingMs: seconds * 1000,
    running: false,
    deadlineMs: null,
    ended: false,
    direction: DIRECTIONS.includes(options.direction) ? options.direction : 'cw',
    color: validColor(options.color) ? options.color.toUpperCase() : DEFAULT_COLOR,
    alarm: ALARMS.includes(options.alarm) ? options.alarm : 'chime',
    repeat: options.repeat === true,
    showTime: options.showTime !== false,
    showTicks: options.showTicks !== false,
    volume: boundedVolume(options.volume),
    cycles: 0
  };
}

function boundedDuration(input) {
  const n = Number(input);
  return Number.isFinite(n) ? Math.max(0, Math.min(359999, Math.trunc(n))) : 1800;
}

function boundedVolume(n) {
  if (n === undefined || n === null) return 70;
  const value = Number(n);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.trunc(value))) : 70;
}

function safeName(name) {
  return typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 36) : '';
}

export function exportClocks(clocks) {
  return clocks.map(clock => ({
    id: String(clock.id),
    name: clock.name,
    durationSeconds: clock.durationSeconds,
    direction: clock.direction,
    color: clock.color,
    alarm: clock.alarm,
    repeat: clock.repeat,
    showTime: clock.showTime,
    showTicks: clock.showTicks,
    volume: clock.volume
  }));
}

export function restoreClocks(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [newClock()];
  const seen = new Set();
  const result = [];
  for (const entry of raw.slice(0, MAX_CLOCKS)) {
    const clock = newClock(entry, result.length + 1);
    // Reject duplicate/unknown IDs, including e.g. "__proto__".
    if (!/^[a-z0-9_-]{1,40}$/i.test(clock.id) || seen.has(clock.id)) {
      clock.id = 'clock-' + (result.length + 1);
    }
    while (seen.has(clock.id)) clock.id += '-x';
    seen.add(clock.id);
    result.push(clock);
  }
  return result;
}

export function setDuration(clock, seconds) {
  const durationSeconds = boundedDuration(seconds);
  return {
    ...clock,
    durationSeconds,
    remainingMs: durationSeconds * 1000,
    running: false,
    deadlineMs: null,
    ended: false,
    cycles: 0
  };
}

export function setDurationParts(clock, parts) {
  return setDuration(clock, durationFromParts(parts));
}

export function setOptions(clock, options) {
  return {
    ...clock,
    ...(options.name !== undefined ? { name: safeName(options.name) || clock.name } : {}),
    ...(options.direction !== undefined && DIRECTIONS.includes(options.direction) ? { direction: options.direction } : {}),
    ...(options.alarm !== undefined && ALARMS.includes(options.alarm) ? { alarm: options.alarm } : {}),
    ...(options.color !== undefined && validColor(options.color) ? { color: options.color.toUpperCase() } : {}),
    ...(typeof options.repeat === 'boolean' ? { repeat: options.repeat } : {}),
    ...(typeof options.showTime === 'boolean' ? { showTime: options.showTime } : {}),
    ...(typeof options.showTicks === 'boolean' ? { showTicks: options.showTicks } : {}),
    ...(options.volume !== undefined ? { volume: boundedVolume(options.volume) } : {})
  };
}

export function startClock(clock, nowMs) {
  if (clock.running || clock.durationSeconds === 0) return clock;
  const remainingMs = clock.remainingMs > 0 ? clock.remainingMs : clock.durationSeconds * 1000;
  return {
    ...clock,
    remainingMs,
    deadlineMs: nowMs + remainingMs,
    ended: false,
    running: true
  };
}

export function tickClock(clock, nowMs) {
  if (!clock.running) return { clock, completed: 0 };
  const left = clock.deadlineMs - nowMs;
  if (left > 0) return { clock: { ...clock, remainingMs: left }, completed: 0 };
  const durationMs = clock.durationSeconds * 1000;
  if (!clock.repeat || durationMs <= 0) {
    return {
      clock: { ...clock, remainingMs: 0, running: false, deadlineMs: null, ended: true, cycles: clock.cycles + 1 },
      completed: 1
    };
  }
  // Catch up after a throttled or sleeping window without looping thousands of times.
  const completed = Math.max(1, Math.floor((nowMs - clock.deadlineMs) / durationMs) + 1);
  const nextDeadline = clock.deadlineMs + completed * durationMs;
  return {
    clock: {
      ...clock,
      remainingMs: Math.max(0, nextDeadline - nowMs),
      deadlineMs: nextDeadline,
      running: true,
      ended: false,
      cycles: clock.cycles + completed
    },
    completed
  };
}

export function pauseClock(clock, nowMs) {
  const result = tickClock(clock, nowMs);
  return { ...result, clock: { ...result.clock, running: false, deadlineMs: null } };
}

export function resetClock(clock) {
  return {
    ...clock, remainingMs: clock.durationSeconds * 1000,
    running: false, deadlineMs: null, ended: false, cycles: 0
  };
}

export function proportionRemaining(clock) {
  return Math.max(0, 100 - elapsedPercentage(clock.remainingMs, clock.durationSeconds * 1000));
}
