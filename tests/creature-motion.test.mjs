import test from 'node:test';
import assert from 'node:assert/strict';
import {mobDimensions, sheepGrazing, moveMob} from '../public/src/mob-rules.js';

function voxelWorld(cell = (x, y) => y < 1 ? 3 : 0) {
  return {
    get: cell,
    collide({x, y, z}, height, radius) {
      for (let bx = Math.floor(x - radius); bx <= Math.floor(x + radius); bx++)
        for (let by = Math.floor(y + .001); by <= Math.floor(y + height - .001); by++)
          for (let bz = Math.floor(z - radius); bz <= Math.floor(z + radius); bz++) {
            const block = cell(bx, by, bz);
            if (block && block !== 14) return true;
          }
      return false;
    },
  };
}
const cow = {h: 1.4, r: .45};
const animal = (extra = {}) => ({kind: 'cow', x: .5, y: 1.002, z: .5, yaw: -Math.PI / 2, phase: 0, ...extra});
function advance(world, mob, definition, count, speed = 1, state = {}) {
  for (let i = 0; i < count; i++) { mob.phase += .05; moveMob(world, mob, definition, speed, .05, {state}); }
}

test('babies have half-size collisions until the server growth deadline', () => {
  assert.deepEqual(mobDimensions({babyUntil: 2000}, cow, 1000), {height: .7, radius: .225});
  assert.deepEqual(mobDimensions({babyUntil: 2000}, cow, 2000), {height: 1.4, radius: .45});
  assert.deepEqual(mobDimensions({}, {h: 1.95}, 1000), {height: 1.95, radius: .3});
});

test('walking stays on the floor without oscillation or drifting while stopped', () => {
  const world = voxelWorld(), mob = animal(); advance(world, mob, cow, 40);
  assert.ok(Math.abs(mob.x - 2.5) < .01); assert.ok(Math.abs(mob.y - 1) < .004);
  const x = mob.x; advance(world, mob, cow, 40, 0);
  assert.equal(mob.x, x); assert.ok(Math.abs(mob.y - 1) < .004);
});

test('a one-block step is climbed by a gradual jump and lands on top', () => {
  const world = voxelWorld((x, y) => y < 1 || (x === 1 && y === 1) ? 3 : 0), mob = animal();
  let maximumRise = 0, priorY = mob.y, peak = mob.y;
  const state = {};
  for (let i = 0; i < 30; i++) {
    mob.phase += .05; moveMob(world, mob, cow, 1, .05, {state});
    maximumRise = Math.max(maximumRise, mob.y - priorY); peak = Math.max(peak, mob.y); priorY = mob.y;
    assert.equal(world.collide(mob, cow.h, cow.r), false);
  }
  assert.ok(maximumRise < .35, `largest frame rise: ${maximumRise}`);
  assert.ok(peak >= 2); assert.ok(mob.x > 1); assert.ok(mob.y > 1.99);
});

test('tall walls and low ceilings trigger stable side steering instead of clipping', () => {
  for (const world of [
    voxelWorld((x, y) => y < 1 || (x === 1 && y <= 3) ? 3 : 0),
    voxelWorld((x, y) => y < 1 || y === 3 || (x === 1 && y === 1) ? 3 : 0),
  ]) {
    const mob = animal(), state = {};
    for (let i = 0; i < 10; i++) {
      mob.yaw = -Math.PI / 2; mob.phase += .05;
      moveMob(world, mob, cow, 1, .05, {state});
      assert.equal(world.collide(mob, cow.h, cow.r), false);
    }
    assert.ok(mob.x < .6); assert.ok(mob.z < .15); assert.ok(mob.y < 1.01);
  }
});

test('passive animals avoid deep ledges and water while already submerged animals float', () => {
  const ledge = voxelWorld((x, y) => y < 1 && x < 1 ? 3 : 0), mob = animal();
  advance(ledge, mob, cow, 60);
  assert.ok(mob.y >= .99); assert.ok(mob.x < 1.5);
  const lake = voxelWorld((x, y) => y < 1 ? (x >= 1 ? 14 : 3) : x >= 1 && y === 1 ? 14 : 0);
  const wary = animal(); advance(lake, wary, cow, 60); assert.ok(wary.x < 1);
  const swimming = animal({x: 2, y: 1, vy: -1}); advance(lake, swimming, cow, 6, 0);
  assert.ok(swimming.y > 1); assert.ok(swimming.vy > 0);
});

test('chickens descend gently while heavier creatures fall faster', () => {
  const world = voxelWorld(), chicken = animal({kind: 'chicken', y: 8}), heavy = animal({y: 8});
  advance(world, chicken, {h: .7, r: .2}, 20, 0); advance(world, heavy, cow, 20, 0);
  assert.equal(chicken.vy, -2.1); assert.ok(chicken.y > 6); assert.ok(heavy.y < chicken.y - 3);
});

test('sheep graze only during their eating window, on grass, without panic', () => {
  const world = voxelWorld((x, y) => y < 1 ? 1 : 0);
  const sheep = animal({kind: 'sheep', phase: 18, regrow: 20});
  assert.equal(sheepGrazing(sheep, world), true);
  assert.equal(sheepGrazing({...sheep, phase: 20}, world), false);
  assert.equal(sheepGrazing({...sheep, phase: 17.9}, world), false);
  assert.equal(sheepGrazing({...sheep, panic: 1}, world), false);
  assert.equal(sheepGrazing(sheep, voxelWorld()), false);
});
