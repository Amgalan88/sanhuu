import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easeOutCubic, interpolate, sampleTween, retargetTween } from '../js/anim.js';

test('easeOutCubic төгсгөлүүд', () => {
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.equal(easeOutCubic(0.5), 1 - 0.5 ** 3);
  assert.equal(easeOutCubic(-2), 0);
  assert.equal(easeOutCubic(4), 1);
});

test('interpolate: эхлэл, төгсгөл, дунд цэг', () => {
  assert.equal(interpolate(0, 100, 0), 0);
  assert.equal(interpolate(0, 100, 1), 100);
  assert.equal(interpolate(0, 100, 0.5), 87.5);
  assert.equal(interpolate(40, 10, 0), 40);
});

test('дундаас шинэ зорилт — одоогийн харагдацаас, тэгээс биш', () => {
  const start = { from: { household: 0, goal: 0, risk: 0 }, to: { household: 100, goal: 40, risk: 40 }, duration: 1000 };
  const elapsed = 500;
  const seen = sampleTween(start, elapsed);
  assert.equal(seen.household, 87.5);
  assert.equal(seen.goal, 35);

  const next = retargetTween(start, { household: 10, goal: 80, risk: 5 }, elapsed);
  assert.equal(next.from.household, 87.5);
  assert.equal(next.from.goal, 35);
  assert.equal(next.from.risk, 35);
  assert.deepEqual(next.to, { household: 10, goal: 80, risk: 5 });
  assert.notEqual(next.from.household, 0);
  assert.notEqual(next.from.household, 100);

  const resumed = sampleTween(next, 0);
  assert.equal(resumed.household, 87.5);
  assert.equal(sampleTween(next, 1000).household, 10);
  assert.equal(sampleTween(next, 1000).goal, 80);
  assert.equal(sampleTween(next, 1000).risk, 5);
});

test('хөдөлгөөн хаалттай бол шууд зорилт (duration 0)', () => {
  const tween = { from: { household: 12 }, to: { household: 60 }, duration: 0 };
  assert.deepEqual(sampleTween(tween, 0), { household: 60 });
  assert.deepEqual(sampleTween(tween, 400), { household: 60 });
  const next = retargetTween(tween, { household: 20 }, 100);
  assert.equal(next.from.household, 60);
  assert.equal(sampleTween({ ...next, duration: 0 }, 0).household, 20);
});
