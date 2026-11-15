import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CLOCKS, COLOR_PALETTE, newClock, restoreClocks, exportClocks,
  setDuration, setDurationParts, setOptions, startClock, tickClock,
  pauseClock, resetClock, proportionRemaining
} from '../src/clocks.js';
import { alarmNotes } from '../src/alarms.js';

test('default timer is thirty minutes, red, clockwise and not repeating', () => {
  const clock = newClock();
  assert.equal(clock.durationSeconds, 1800);
  assert.equal(clock.remainingMs, 1800000);
  assert.equal(clock.color, '#F20B14');
  assert.equal(clock.direction, 'cw');
  assert.equal(clock.repeat, false);
  assert.equal(clock.running, false);
  assert.equal(clock.volume, 70);
  assert.equal(clock.showTime, true);
  assert.equal(clock.showTicks, true);
});

test('independent deadlines maintain separate runtimes', () => {
  const a = startClock(newClock({ durationSeconds: 10, id: 'a' }), 1000);
  const b = startClock(newClock({ durationSeconds: 20, id: 'b' }), 2500);
  const first = tickClock(a, 5000);
  const second = tickClock(b, 5000);
  assert.equal(first.clock.remainingMs, 6000);
  assert.equal(second.clock.remainingMs, 17500);
  assert.equal(a.remainingMs, 10000); // immutable model
  assert.equal(first.completed, 0);
  assert.equal(second.completed, 0);
});

test('pausing one clock leaves another clock running', () => {
  const a = startClock(newClock({ durationSeconds: 30 }), 0);
  const b = startClock(newClock({ durationSeconds: 30 }), 0);
  const paused = pauseClock(a, 7000);
  const bAdvanced = tickClock(b, 15000);
  assert.equal(paused.clock.running, false);
  assert.equal(paused.clock.remainingMs, 23000);
  assert.equal(bAdvanced.clock.running, true);
  assert.equal(bAdvanced.clock.remainingMs, 15000);
  assert.equal(tickClock(paused.clock, 30000).clock.remainingMs, 23000);
});

test('non-repeating alarm fires once and clock finishes empty', () => {
  const start = startClock(newClock({ durationSeconds: 2 }), 1000);
  const finish = tickClock(start, 3000);
  assert.equal(finish.completed, 1);
  assert.equal(finish.clock.ended, true);
  assert.equal(finish.clock.running, false);
  assert.equal(finish.clock.remainingMs, 0);
  assert.equal(proportionRemaining(finish.clock), 0);
  assert.equal(tickClock(finish.clock, 90000).completed, 0);
});

test('repeat every 3 seconds preserves phase after background delays', () => {
  const start = startClock(newClock({ durationSeconds: 3, repeat: true }), 0);
  const first = tickClock(start, 3000);
  assert.equal(first.completed, 1);
  assert.equal(first.clock.cycles, 1);
  assert.equal(first.clock.remainingMs, 3000);
  const lag = tickClock(first.clock, 10750);
  assert.equal(lag.completed, 2);
  assert.equal(lag.clock.cycles, 3);
  assert.equal(lag.clock.remainingMs, 1250);
  assert.equal(lag.clock.deadlineMs, 12000);
  assert.equal(proportionRemaining(lag.clock), 1250 / 3000 * 100);
});

test('zero-duration timer never runs or loops forever', () => {
  const zero = setDuration(newClock(), 0);
  assert.equal(startClock(zero, 100).running, false);
  assert.equal(tickClock(zero, 100000).completed, 0);
  assert.equal(zero.remainingMs, 0);
});

test('changing settings retains runtime; changing duration resets only that clock', () => {
  const running = startClock(newClock({ durationSeconds: 12 }), 1000);
  const configured = setOptions(running, { direction: 'ccw', repeat: true, color: '#22dd55', alarm: 'digital', volume: 22, showTime: false, showTicks: false });
  assert.equal(configured.deadlineMs, 13000);
  assert.equal(configured.running, true);
  assert.equal(configured.color, '#22DD55');
  assert.equal(configured.volume, 22);
  assert.equal(configured.showTime, false);
  assert.equal(configured.showTicks, false);
  assert.equal(configured.direction, 'ccw');
  const resetDuration = setDurationParts(configured, { hours: 0, minutes: 1, seconds: 4 });
  assert.equal(resetDuration.durationSeconds, 64);
  assert.equal(resetDuration.remainingMs, 64000);
  assert.equal(resetDuration.running, false);
  assert.equal(resetDuration.cycles, 0);
});

test('invalid configuration and malicious stored values are sanitized', () => {
  const invalid = setOptions(newClock(), { color: 'url(https://bad.example/)', alarm: 'honk', direction: 'right', volume: Infinity, name: '\u0000A\nB' });
  assert.equal(invalid.color, '#F20B14');
  assert.equal(invalid.alarm, 'chime');
  assert.equal(invalid.direction, 'cw');
  assert.equal(invalid.volume, 70);
  assert.equal(invalid.name, 'AB');
  const restored = restoreClocks([
    { id: '__proto__', name: 'One', durationSeconds: 100 },
    { id: 'clock-2', durationSeconds: 200 },
    { id: 'clock-2', durationSeconds: 300 },
    { id: 'other', durationSeconds: 400, color: '#ffffff', repeat: true }
  ]);
  assert.equal(new Set(restored.map(x => x.id)).size, 4);
  assert.equal(restored[3].repeat, true);
  assert.equal(restored[3].color, '#FFFFFF');
  assert.equal(restored[3].running, false);
  assert.equal(restored[3].remainingMs, 400000);
});

test('saved clocks restore configurations but never resume silently', () => {
  const saved = exportClocks([
    startClock(newClock({ id: 'one', name: 'Reading', durationSeconds: 45, direction: 'ccw', repeat: true, alarm: 'bell' }), 500),
    startClock(newClock({ id: 'two', name: 'Break', durationSeconds: 60, color: '#00B9B0' }), 300)
  ]);
  const restored = restoreClocks(saved);
  assert.equal(restored.length, 2);
  assert.equal(restored[0].name, 'Reading');
  assert.equal(restored[0].direction, 'ccw');
  assert.equal(restored[0].running, false);
  assert.equal(restored[0].deadlineMs, null);
  assert.equal(restored[1].color, '#00B9B0');
});

test('saving excessive number of clocks clamps to limit', () => {
  const many = Array.from({ length: 45 }, (_, i) => ({ id: 'clock-' + i, durationSeconds: i + 1 }));
  assert.equal(restoreClocks(many).length, MAX_CLOCKS);
  assert.ok(COLOR_PALETTE.length >= 8);
});

test('all configured alarm names have distinct offline sound patterns', () => {
  const profiles = ['chime', 'beep', 'bell', 'digital'];
  const serialized = profiles.map(name => JSON.stringify(alarmNotes(name)));
  assert.equal(new Set(serialized).size, 4);
  for (const name of profiles) {
    for (const event of alarmNotes(name)) {
      assert.ok(event.frequency > 100);
      assert.ok(event.duration > 0);
      assert.ok(['sine', 'triangle', 'square'].includes(event.wave));
    }
  }
  assert.deepEqual(alarmNotes('off'), []);
  assert.deepEqual(alarmNotes('bad'), []);
});

test('reset after completed cycles resets count but retains direction and sound', () => {
  const repeating = startClock(newClock({ durationSeconds: 5, repeat: true, direction: 'ccw', alarm: 'bell' }), 0);
  const done = tickClock(repeating, 15300).clock;
  assert.equal(done.cycles, 3);
  const reset = resetClock(done);
  assert.equal(reset.cycles, 0);
  assert.equal(reset.remainingMs, 5000);
  assert.equal(reset.running, false);
  assert.equal(reset.direction, 'ccw');
  assert.equal(reset.alarm, 'bell');
});
