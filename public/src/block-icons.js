import {ITEMS} from './core.js';
const cubes = new Set([1,2,3,4,5,6,7,8,9,10,11,12,13,15,16,17,19,21,28,29,30,31,32,33,34,35,
  40,41,42,43,44,45,46,47,48,55,56,57,63,64,65,68,70,89,90,91,92,93,94,95,96,97,98,99,100,
  104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,121,122,127,129,130,131,134,135,137,138,139,140,141,142]);
const caches = new WeakMap();
export function blockInventoryIcon(id, atlas) {
  const item = ITEMS[id];
  if (!item || !cubes.has(item.block) || !atlas) return null;
  let cache = caches.get(atlas); if (!cache) { cache = new Map(); caches.set(atlas, cache); }
  if (cache.has(id)) return cache.get(id);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
  const g = canvas.getContext('2d'); g.imageSmoothingEnabled = false;
  const tile = face => globalThis.__carbonTile?.(item.block, face) ?? (item.block === 1 ? (face === 2 ? 0 : 1)
    : item.block === 5 ? (face === 2 ? 6 : 5) : item.block === 16 ? (face === 2 ? 17 : 18)
    : item.block === 17 ? (face === 5 ? 19 : 20) : item.tile || 0);
  const face = (index, matrix, shadow) => {
    const t = tile(index); g.save(); g.transform(...matrix);
    g.drawImage(atlas, t % 16 * 32, Math.floor(t / 16) * 32, 32, 32, 0, 0, 16, 16);
    if (shadow) { g.fillStyle = `rgba(0,0,0,${shadow})`; g.fillRect(0, 0, 16, 16); }
    g.restore();
  };
  face(2, [14/16,7/16,-14/16,7/16,16,1], 0);
  face(4, [14/16,7/16,0,15/16,2,8], .15);
  face(5, [14/16,-7/16,0,15/16,16,15], .3);
  const url = canvas.toDataURL(); cache.set(id, url); return url;
}
