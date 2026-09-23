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
