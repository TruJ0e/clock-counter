// Synthetic, offline alarm sounds. No audio files, subscriptions, or permissions required.
// Profiles are also exposed for deterministic unit testing.
export function alarmNotes(name) {
  switch (name) {
    case 'beep':
      return [{ at: 0, frequency: 880, duration: 0.32, wave: 'sine' }];
    case 'bell':
      return [
        { at: 0, frequency: 1046.5, duration: 0.78, wave: 'triangle' },
        { at: 0.03, frequency: 1568, duration: 0.64, wave: 'sine' }
      ];
    case 'digital':
      return [
        { at: 0, frequency: 740, duration: 0.10, wave: 'square' },
        { at: 0.16, frequency: 740, duration: 0.10, wave: 'square' },
        { at: 0.32, frequency: 988, duration: 0.21, wave: 'square' }
      ];
    case 'chime':
      return [
        { at: 0, frequency: 660, duration: 0.31, wave: 'sine' },
        { at: 0.30, frequency: 880, duration: 0.31, wave: 'sine' },
        { at: 0.61, frequency: 1108.73, duration: 0.48, wave: 'sine' }
      ];
    case 'off':
    default:
      return [];
  }
}

let context;
function getContext() {
  if (context) return context;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  try { context = new AudioCtor(); } catch { return null; }
  return context;
}

export function primeAudio() {
  const ctx = getContext();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export function playAlarm(name, volume = 70) {
  const notes = alarmNotes(name);
  if (!notes.length) return false;
  const ctx = getContext();
  if (!ctx) return false;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const level = Math.max(0, Math.min(100, Number(volume) || 0)) / 100;
  if (level <= 0) return false;
  const peak = Math.min(0.17, 0.18 * level / Math.sqrt(notes.length));
  for (const note of notes) {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = ctx.currentTime + note.at + 0.02;
      osc.type = note.wave;
      osc.frequency.value = note.frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + note.duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + note.duration + 0.02);
    } catch {
      // Sound errors must never interfere with countdown accuracy.
    }
  }
  return true;
}
