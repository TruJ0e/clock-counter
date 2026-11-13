import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampParts, durationFromParts, partsFromDuration,
  formattedRemaining, elapsedPercentage, remainingAtDeadline
} from '../src/timer-core.js';

test('input fields clamp negative, malformed, and excessive values', () => {
  assert.deepEqual(clampParts({ hours: -2, minutes: '74', seconds: 'bad' }), {
    hours: 0, minutes: 59, seconds: 0
  });
  assert.deepEqual(clampParts({ hours: 999, minutes: 2, seconds: 80 }), {
    hours: 99, minutes: 2, seconds: 59
  });
});

test('duration converts correctly for zero and mixed units', () => {
  assert.equal(durationFromParts({ hours: 0, minutes: 30, seconds: 0 }), 1800);
  assert.equal(durationFromParts({ hours: 1, minutes: 2, seconds: 3 }), 3723);
  assert.equal(durationFromParts({ hours: 0, minutes: 0, seconds: 0 }), 0);
  assert.deepEqual(partsFromDuration(3723), { hours: 1, minutes: 2, seconds: 3 });
});

test('time label rounds up so a running second is not skipped', () => {
  assert.equal(formattedRemaining(1800000), '30:00');
  assert.equal(formattedRemaining(1772000), '29:32');
  assert.equal(formattedRemaining(999), '00:01');
  assert.equal(formattedRemaining(0), '00:00');
  assert.equal(formattedRemaining(3600500), '01:00:01');
});

test('percentage matches actual chosen duration, not a 60-minute clock', () => {
  assert.equal(elapsedPercentage(300000, 600000), 50); // half of 10 minutes
  assert.equal(elapsedPercentage(900000, 1800000), 50); // half of 30 minutes
  assert.equal(elapsedPercentage(1800000, 1800000), 0);
  assert.equal(elapsedPercentage(0, 1800000), 100);
  assert.equal(elapsedPercentage(-50, 1800000), 100);
  assert.equal(elapsedPercentage(5000, 0), 100);
});

test('deadline countdown remains accurate even after delayed rendering', () => {
  assert.equal(remainingAtDeadline(10000, 2500), 7500);
  assert.equal(remainingAtDeadline(10000, 15000), 0);
});
