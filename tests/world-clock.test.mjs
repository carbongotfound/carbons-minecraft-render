import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldClock, DAY_MS} from '../public/src/world-clock.js';

const snapshot = (server_ms, world_ms) => ({server_ms, world_ms, day_length_ms: DAY_MS});
test('world time is interpolated from server samples with independent monotonic origins', () => {
  let monoA = 1000, monoB = 900000;
  const a = new WorldClock(() => monoA), b = new WorldClock(() => monoB);
  a.sync(snapshot(1_900_000_000_000, 900000), monoA-100);
  b.sync(snapshot(1_900_000_000_000, 900000), monoB-100);
  assert.equal(a.worldMs(), b.worldMs()); assert.equal(a.isNight(), true);
  const original = Date.now;
  try {
    Date.now = () => 0; monoA += 2000; monoB += 2000;
    assert.equal(a.worldMs(), 902050); assert.equal(a.worldMs(), b.worldMs());
    Date.now = () => 99_000_000_000_000;
    assert.equal(a.worldMs(), 902050);
  } finally { Date.now = original; }
});
test('sleep jumps both players to morning and an older poll cannot undo it', () => {
  const a = new WorldClock(() => 100), b = new WorldClock(() => 300);
  a.sync(snapshot(1000, 900000), 100); b.sync(snapshot(1000, 900000), 300);
  a.sync(snapshot(2000, DAY_MS+90000), 100); b.sync(snapshot(2000, DAY_MS+90000), 300);
  assert.equal(a.isNight(), false); assert.equal(a.worldMs(), b.worldMs()); assert.equal(a.day(), 2);
  assert.equal(a.sync(snapshot(1500, 900500), 100), false); assert.equal(a.day(), 2);
});
test('invalid snapshots never replace authoritative clock state', () => {
  const clock = new WorldClock(() => 0); clock.sync(snapshot(1000, 300000), 0);
  for (const bad of [null, {}, snapshot(NaN, 2), snapshot(2000, -1), snapshot(2000, Infinity), {...snapshot(2000, 10), day_length_ms: 1}])
    assert.equal(clock.sync(bad, 0), false);
  assert.equal(clock.worldMs(), 300000);
  assert.equal(clock.sync(snapshot(2000, 10), 1, 0), false);
});
test('an unsynchronized menu stays at noon and does not read a saved offset', () => {
  let now = 0; const clock = new WorldClock(() => now); now = 5_000_000;
  assert.equal(clock.worldMs(), 300000); assert.equal(clock.synced, false);
  assert.equal(clock.label(), 'Day 1 · 12:00');
});
test('reconnecting catches up after a long gap without changing the 20-minute day', () => {
  let mono = 0; const clock = new WorldClock(() => mono);
  clock.sync(snapshot(1000, 0), mono); mono += 2*DAY_MS;
  assert.equal(clock.day(), 3); assert.equal(clock.fraction(), 0);
  clock.sync(snapshot(1000+3*DAY_MS, 3*DAY_MS), mono);
  assert.equal(clock.day(), 4); assert.equal(clock.label(), 'Day 4 · 06:00');
});
