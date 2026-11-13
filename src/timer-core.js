// Pure timer helpers, kept independent from Electron and the UI for testing.
export const MAX_HOURS = 99;
export const MAX_MINUTES = 59;
export const MAX_SECONDS = 59;

function wholeInRange(value, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(max, parsed));
}

export function clampParts(parts = {}) {
  return {
    hours: wholeInRange(parts.hours, MAX_HOURS),
    minutes: wholeInRange(parts.minutes, MAX_MINUTES),
    seconds: wholeInRange(parts.seconds, MAX_SECONDS)
  };
}

export function durationFromParts(parts) {
  const clean = clampParts(parts);
  return clean.hours * 3600 + clean.minutes * 60 + clean.seconds;
}

export function partsFromDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return {
    hours: Math.floor(seconds / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60
  };
}

export function formattedRemaining(milliseconds) {
  const wholeSeconds = Math.ceil(Math.max(0, Number(milliseconds) || 0) / 1000);
  const parts = partsFromDuration(wholeSeconds);
  const pad = (value) => String(value).padStart(2, '0');
  if (parts.hours > 0) {
    return pad(parts.hours) + ':' + pad(parts.minutes) + ':' + pad(parts.seconds);
  }
  return pad(parts.minutes) + ':' + pad(parts.seconds);
}

export function elapsedPercentage(remainingMs, totalMs) {
  const duration = Number(totalMs);
  if (!Number.isFinite(duration) || duration <= 0) return 100;
  const remaining = Math.max(0, Math.min(duration, Number(remainingMs) || 0));
  return (1 - remaining / duration) * 100;
}

export function remainingAtDeadline(deadlineMs, nowMs) {
  return Math.max(0, Number(deadlineMs) - Number(nowMs));
}
