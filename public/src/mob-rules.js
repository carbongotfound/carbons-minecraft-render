import {shape} from './extra-data.js';
import {blockShape} from './expansion-data.js';

export const ANIMAL_FOOD = {cow: ['wheat'], sheep: ['wheat'], pig: ['carrot', 'potato', 'beetroot'], chicken: ['seeds']};
export function skyExposed(world, x, y, z) {
  for (let above = Math.floor(y) + 2; above < 96; above++) {
    const block = world.get(Math.floor(x), above, Math.floor(z));
    if (block && ![18, 26, 27, 38, 39, 58, 126, 128].includes(block)) return false;
  }
  return true;
}
export function canSpawnHostile(world, point, players, {night, dimension = 'overworld', lit = () => false, height = 1.95}) {
  const {x, y, z} = point, half = dimension === 'overworld' ? 512 : 256;
  if (Math.abs(x) >= half - 2 || Math.abs(z) >= half - 2 || y < 2 || y > 92) return false;
  if (players.some(p => Math.hypot(x - p.x, y - p.y, z - p.z) < 24)) return false;
  const floor = world.get(Math.floor(x), Math.floor(y) - 1, Math.floor(z)), support = floor >= 40 ? blockShape(floor) : shape(floor);
  if (!support || support[4] !== 1 || [6, 9, 14, 49, 97, 100, 105].includes(floor)) return false;
  if (world.get(Math.floor(x), Math.floor(y), Math.floor(z)) || world.get(Math.floor(x), Math.floor(y) + 1, Math.floor(z))) return false;
  if (world.collide({...point, y: y + .02}, height, .4) || lit(x, y, z, 10)) return false;
  return dimension !== 'overworld' || night || !skyExposed(world, x, y, z);
}
export function findHostileSpawn(world, player, players, options, ground, random = Math.random) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const angle = random() * Math.PI * 2, distance = 24 + random() * 24;
    const x = Math.floor(player.x + Math.cos(angle) * distance) + .5, z = Math.floor(player.z + Math.sin(angle) * distance) + .5;
    // Search around the explorer's elevation as well as the surface. This lets
    // caves stay dangerous during daytime without spawning inside solid stone.
    const levels = [ground(x, z)];
    for (let y = Math.min(92, Math.floor(player.y) + 10); y >= Math.max(2, Math.floor(player.y) - 18); y--) levels.push(y);
    if (player.y < levels[0] - 5) levels.reverse();
    for (const y of levels) {
      const point = {x, y, z};
      if (canSpawnHostile(world, point, players, options)) return point;
    }
  }
  return null;
}
export function animalLure(mob, players, visible) {
  return players.filter(p => ANIMAL_FOOD[mob.kind]?.includes(p.held) && Math.hypot(p.x-mob.x,p.y-mob.y,p.z-mob.z) < 8
    && visible({x:mob.x,y:mob.y+.8,z:mob.z},{x:p.x,y:p.y+1,z:p.z}))
    .sort((a,b) => Math.hypot(a.x-mob.x,a.z-mob.z)-Math.hypot(b.x-mob.x,b.z-mob.z))[0] || null;
}
export function canBreed(mob, now) {
  return !!ANIMAL_FOOD[mob.kind] && Number(mob.babyUntil || 0) <= now && Number(mob.breedCooldown || 0) <= now;
}

export function mobDimensions(mob, definition, now = 0) {
  const scale = Number(mob.babyUntil || 0) > now ? .5 : 1;
  return {height: definition.h * scale, radius: (definition.r || .3) * scale};
}

export function sheepGrazing(mob, world) {
  return mob.kind === 'sheep' && !mob.panic && Number.isFinite(mob.regrow)
    && mob.phase >= mob.regrow - 2 && mob.phase < mob.regrow
    && world.get(Math.floor(mob.x), Math.floor(mob.y) - 1, Math.floor(mob.z)) === 1;
}

// Host-only collision movement. A jump follows a ballistic arc instead of moving
// the animal a whole block upward in one frame. Steering memory stays outside
// the wire snapshot, so older clients can still receive these mobs.
export function moveMob(world, mob, definition, speed, dt, {now = 0, bounds = 508, state = {}} = {}) {
  const {height, radius} = mobDimensions(mob, definition, now);
  const collide = (x, y, z, h = height) => world.collide({x, y, z}, h, radius);
  const before = {x: mob.x, y: mob.y, z: mob.z};
  const grounded = collide(mob.x, mob.y - .045, mob.z);
  const phase = mob.phase || 0;
  const water = world.get(Math.floor(mob.x), Math.floor(mob.y + height * .4), Math.floor(mob.z)) === 14;
  const animal = !!ANIMAL_FOOD[mob.kind];
  const safe = (x, z) => !animal || water || (
    ![14, 49].includes(world.get(Math.floor(x), Math.floor(mob.y + .2), Math.floor(z)))
    && ![14, 49].includes(world.get(Math.floor(x), Math.floor(mob.y) - 1, Math.floor(z)))
    && collide(x, mob.y - 1.6, z, 1.5));
  let blocked = false;
  if (speed) {
    const avoiding = Number(state.avoidUntil) > phase;
    const yaw = avoiding ? state.avoidYaw : mob.yaw;
    const nx = Math.max(-bounds, Math.min(bounds, mob.x - Math.sin(yaw) * speed * dt));
    const nz = Math.max(-bounds, Math.min(bounds, mob.z - Math.cos(yaw) * speed * dt));
    if (!collide(nx, mob.y, nz) && (!grounded || safe(nx, nz))) {
      mob.x = nx; mob.z = nz; if (avoiding) mob.yaw = yaw;
    } else {
      blocked = true;
      if (grounded && safe(nx, nz) && !collide(nx, mob.y + 1.05, nz) && !collide(mob.x, mob.y + 1.05, mob.z)) {
        mob.vy = 7.2;
      } else if (!(mob.vy > 0)) {
        // Prefer a clear side once, then retain that heading long enough to get
        // around the obstacle instead of alternating left/right every tick.
        const turns = [Math.PI / 2, -Math.PI / 2, Math.PI];
        for (const turn of turns) {
          const side = mob.yaw + turn, sx = mob.x - Math.sin(side) * speed * dt, sz = mob.z - Math.cos(side) * speed * dt;
          if (Math.abs(sx) > bounds || Math.abs(sz) > bounds || collide(sx, mob.y, sz) || (grounded && !safe(sx, sz))) continue;
          state.avoidYaw = side; state.avoidUntil = phase + .8; mob.yaw = side; mob.x = sx; mob.z = sz; break;
        }
      }
    }
  }
  mob.vy = water ? Math.min(2.4, (mob.vy || 0) + 12 * dt)
    : Math.max(mob.kind === 'chicken' ? -2.1 : -20, (mob.vy || 0) - (mob.kind === 'chicken' ? 8 : 22) * dt);
  const targetY = mob.y + mob.vy * dt;
  if (!collide(mob.x, targetY, mob.z)) mob.y = targetY;
  else {
    let clear = mob.y, solid = targetY;
    for (let i = 0; i < 8; i++) { const mid = (clear + solid) / 2; if (collide(mob.x, mid, mob.z)) solid = mid; else clear = mid; }
    mob.y = clear; mob.vy = 0;
  }
  return {blocked, grounded, water, distance: Math.hypot(mob.x - before.x, mob.z - before.z)};
}
