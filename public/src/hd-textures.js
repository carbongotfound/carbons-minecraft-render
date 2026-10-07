import {hash} from './core.js';

// Original artwork on a native 16px grid. The existing 512px atlas, tile IDs,
// worker UVs and inventory icons stay compatible; each pixel is copied 2×2.
const SIZE = 16, ATLAS_TILE = 32;
const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const palette = colors => colors.map(c => typeof c === 'string' ? rgb(c) : c);
const tone = (color, amount) => color.map(v => Math.max(0, Math.min(255, Math.round(v + amount))));

class PixelTile {
  constructor(alpha = 255) { this.data = new Uint8ClampedArray(SIZE * SIZE * 4); for (let i = 3; i < this.data.length; i += 4) this.data[i] = alpha; }
  set(x, y, color, alpha = 255) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return this;
    const i = ((y | 0) * SIZE + (x | 0)) * 4, c = typeof color === 'string' ? rgb(color) : color;
    this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = alpha; return this;
  }
  rect(x, y, width, height, color, alpha = 255) {
    for (let py = y; py < y + height; py++) for (let px = x; px < x + width; px++) this.set(px, py, color, alpha);
    return this;
  }
  grain(colors, seed = 1) {
    const p = palette(colors);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) this.set(x, y, p[Math.floor(hash(x, y, seed) * p.length) % p.length]);
    return this;
  }
  // Small clusters carry the texture's structure. No blurred or interpolated noise.
  clusters(colors, seed, count = 40, width = 2, height = 2) {
    const p = palette(colors);
    for (let i = 0; i < count; i++) this.rect(hash(i, seed, 1) * 16 | 0, hash(i, seed, 2) * 16 | 0,
      1 + (hash(i, seed, 3) * width | 0), 1 + (hash(i, seed, 4) * height | 0), p[i % p.length]);
    return this;
  }
  frame(dark, light, inset = 0) {
    this.rect(inset, inset, 16 - inset * 2, 1, light).rect(inset, inset, 1, 16 - inset * 2, light);
    this.rect(inset, 15 - inset, 16 - inset * 2, 1, dark).rect(15 - inset, inset, 1, 16 - inset * 2, dark);
    return this;
  }
  write(ctx, tile) {
    const image = ctx.createImageData(ATLAS_TILE, ATLAS_TILE);
    for (let y = 0; y < ATLAS_TILE; y++) for (let x = 0; x < ATLAS_TILE; x++) {
      const from = ((y >> 1) * SIZE + (x >> 1)) * 4, to = (y * ATLAS_TILE + x) * 4;
      image.data.set(this.data.subarray(from, from + 4), to);
    }
    ctx.putImageData(image, tile % 16 * ATLAS_TILE, Math.floor(tile / 16) * ATLAS_TILE);
  }
}
const GRASS = ['#5b9139', '#639b3d', '#6aa442', '#73ad49', '#7ab34e'];
const DIRT = ['#79553b', '#80593d', '#886044', '#92694a', '#9d7351'];
const STONE = ['#747474', '#7b7b7b', '#828282', '#898989'];
const OAK = ['#a07c43', '#aa864c', '#b38e53', '#ba965c', '#c09d64'];
const SPRUCE = ['#62462b', '#6c4e30', '#765636', '#7c5c3b', '#846242'];
const BIRCH = ['#b7a16c', '#c1ac78', '#c9b580', '#d2be89', '#d9c58f'];

function stone(colors = STONE, seed = 41) {
  return new PixelTile().grain(colors, seed).clusters([colors[0], colors[2], colors[1]], seed + 1, 34, 4, 1);
}
function dirt() {
  const t = new PixelTile().grain(DIRT, 21).clusters(['#725039', '#a37a55'], 23, 28, 2, 1);
  for (const [x, y] of [[1, 4], [8, 2], [12, 9], [4, 12], [10, 14]]) t.set(x, y, '#878078').set(x + 1, y, '#9a9080');
  return t;
}
function grassSide() {
  const t = dirt();
  const edge = [3, 3, 4, 3, 3, 2, 3, 5, 4, 3, 3, 4, 3, 2, 3, 4];
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < edge[x]; y++) t.set(x, y, GRASS[Math.floor(hash(x, y, 11) * GRASS.length)]);
    t.set(x, edge[x], '#5b7634');
  }
  return t;
}
function cobble(colors = ['#5b5b57', '#85857f', '#a2a29c', '#6c6c67']) {
  const t = new PixelTile().rect(0, 0, 16, 16, colors[0]);
  for (const [x, y, w, h] of [[0, 0, 5, 4], [6, 0, 6, 3], [13, 0, 3, 5], [0, 5, 3, 5], [4, 4, 6, 5], [11, 4, 5, 5], [0, 11, 5, 5], [6, 10, 5, 6], [12, 10, 4, 6]]) {
    t.rect(x, y, w, h, colors[1]).rect(x + 1, y, w - 1, 1, colors[2]).rect(x, y + 1, 1, h - 2, colors[2]);
    t.rect(x + 1, y + h - 1, w - 1, 1, colors[3]).rect(x + w - 1, y + 1, 1, h - 1, colors[3]);
    t.set(x + Math.max(1, w >> 1), y + (h >> 1), colors[3]);
  }
  return t;
}
function planks(colors = OAK, seed = 111) {
  const t = new PixelTile().grain(colors, seed);
  for (let row = 0; row < 4; row++) {
    const y = row * 4, p = palette(colors), joint = [7, 3, 11, 5][row];
    t.rect(0, y, 16, 1, tone(p[0], -20)).rect(0, y + 1, 16, 1, p[4]);
    t.rect(joint, y, 1, 4, tone(p[0], -14));
    for (let i = 0; i < 4; i++) t.rect((hash(i, row, seed) * 13 | 0), y + 2 + i % 2, 2 + i % 2, 1, p[i % 4]);
  }
  return t;
}
function bark(colors = ['#514025', '#624b2a', '#745834', '#82643c'], seed = 91, birch = false) {
  if (birch) {
    const t = new PixelTile().grain(['#c6c4b7', '#d5d3c6', '#dddbce', '#e6e3d6'], seed);
    for (const [x, y, w] of [[1, 1, 4], [10, 4, 5], [3, 7, 3], [0, 11, 3], [9, 13, 5]])
      t.rect(x, y, w, 1, '#383b35').rect(x + 1, y + 1, w - 1, 1, '#66675e');
    return t;
  }
  const t = new PixelTile().grain(colors, seed);
  for (const x of [0, 3, 7, 10, 14]) {
    t.rect(x, 0, 1, 16, colors[0]);
    for (let y = 0; y < 16; y += 4) {
      const offset = Math.floor(hash(x, y, seed) * 3);
      t.rect(x + 1, y + offset, 1, 3, colors[3]).rect(x - 1, y + offset + 1, 1, 2, colors[1]);
    }
  }
  return t;
}
function logTop(colors = OAK, border = '#66502e') {
  const t = new PixelTile().grain(colors, 103);
  t.rect(0, 0, 16, 1, border).rect(0, 15, 16, 1, border).rect(0, 0, 1, 16, border).rect(15, 0, 1, 16, border);
  for (const n of [2, 4, 6]) t.frame(colors[0], colors[1], n);
  t.rect(7, 7, 2, 2, colors[0]).set(8, 7, colors[3]);
  return t;
}
const LEAF_ART = [
  [7, ['#285720', '#326b26', '#3d7a2c', '#4b8a33', '#59973c'], 121],
  [121, ['#21442f', '#2a5135', '#335f3e', '#3a6a43', '#46784d'], 123],
  [124, ['#4b672b', '#587733', '#64863b', '#759645', '#83a24e'], 127],
];
function leaves(colors = LEAF_ART[0][1], seed = 121, opaque = false) {
  const t = new PixelTile(0);
  // Irregular opaque clusters with real holes; alpha-tested by the leaf material.
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const h = hash(x, y, seed), patch = hash(x >> 1, y >> 1, seed + 1);
    const cutout = h < .18 || patch < .12;
    // Canvas discards hidden RGB when alpha is zero. Fast foliage therefore
    // needs its own fully opaque raster generated from this same source art.
    t.set(x, y, colors[Math.min(colors.length - 1, Math.floor(h * colors.length))], !opaque && cutout ? 0 : 255);
  }
  return t;
}
function ore(colors, seed = 311, base = stone()) {
  const t = base, p = palette(colors), positions = [[1, 2], [9, 1], [5, 6], [12, 8], [2, 11], [9, 13]];
  for (let k = 0; k < positions.length; k++) {
    const [x, y] = positions[(k + seed % 6) % 6];
    t.rect(x, y, 3, 2, p[0]).rect(x + 1, y + 1, 2, 2, p[1]).set(x, y, p[2]).set(x + 2, y + 2, p[0]);
    if (k % 2) t.set(x + 2, y, p[1]);
  }
  return t;
}
function bricks(colors = ['#985645', '#a9604d', '#b56c55', '#c07960'], mortar = '#9d9790', height = 4) {
  const t = new PixelTile().grain(colors, 131);
  for (let y = 0; y < 16; y += height) {
    t.rect(0, y, 16, 1, mortar);
    for (let x = y % (height * 2) ? 0 : 4; x < 16; x += 8) t.rect(x, y, 1, height, mortar);
    t.rect(0, y + 1, 16, 1, colors[2]);
  }
  return t;
}
function stoneBricks(mossy = false, colors = ['#777775', '#81817e', '#898986', '#92928d']) {
  const t = bricks(colors, '#50524e', 8);
  if (mossy) t.clusters(['#57623c', '#697844', '#7d8c53'], 337, 23, 3, 2);
  return t;
}
function glass() {
  const t = new PixelTile(0);
  t.rect(0, 0, 16, 1, '#b6d3db').rect(0, 15, 16, 1, '#b6d3db').rect(0, 0, 1, 16, '#b6d3db').rect(15, 0, 1, 16, '#b6d3db');
  for (const [x, y] of [[3, 10], [4, 9], [5, 8], [6, 7], [10, 13], [11, 12]]) t.set(x, y, '#d9f0f3', 210);
  return t;
}
function smooth(color, seed = 1, spread = 4, frame = false) {
  const c = typeof color === 'string' ? rgb(color) : color;
  const t = new PixelTile().grain([-spread, -spread / 2, 0, spread / 2, spread].map(v => tone(c, v)), seed);
  if (frame) t.frame(tone(c, -23), tone(c, 15));
  return t;
}
function metal(color) { const c = rgb(color); return smooth(c, 151, 3, true).frame(tone(c, -11), tone(c, 25), 1).rect(3, 3, 9, 1, tone(c, 18)); }
function wool(color) {
  const c = typeof color === 'string' ? rgb(color) : color, t = smooth(c, 155, 6);
  for (let y = 0; y < 16; y += 3) for (let x = y % 2; x < 16; x += 3) t.set(x, y, tone(c, 12)).set(x + 1, y + 1, tone(c, -10));
  return t;
}
function sand(red = false) { return new PixelTile().grain(red ? ['#b4652b', '#bd6b2d', '#c87533', '#d1803a'] : ['#d8ce97', '#ddd3a0', '#e2d8a6', '#e8dfb0'], 71).clusters(red ? ['#a75925', '#d2803c'] : ['#cec18d', '#eae1b2'], 72, 18, 2, 1); }
function sandstone(red = false) {
  const t = sand(red), p = red ? ['#ad5724', '#c57232', '#d78a44'] : ['#c6b57c', '#d7c78e', '#e8dca7'];
  for (const y of [3, 7, 11, 15]) { t.rect(0, y, 16, 1, p[0]).rect(0, y - 1, 16, 1, p[2]); }
  return t;
}
function furnace() {
  const t = stone().frame('#555553', '#979795');
  t.rect(2, 2, 12, 4, '#555552').rect(3, 3, 10, 2, '#222221').rect(2, 8, 12, 6, '#575754').rect(3, 9, 10, 4, '#222221');
  t.rect(4, 10, 8, 1, '#333331').rect(4, 13, 8, 1, '#9a9a96');
  return t;
}
function table(top = false) {
  const t = planks();
  if (top) {
    t.frame('#634429', '#775432'); t.rect(2, 2, 12, 12, '#5e422a');
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) t.rect(2 + x * 4, 2 + y * 4, 3, 3, '#ae8551').rect(2 + x * 4, 2 + y * 4, 3, 1, '#c19a63');
  } else {
    t.rect(0, 0, 16, 3, '#72502f').rect(1, 3, 2, 13, '#68492b').rect(13, 3, 2, 13, '#68492b');
    t.rect(5, 5, 1, 8, '#614228').rect(3, 4, 5, 2, '#a9aba1').rect(10, 7, 1, 7, '#614228').rect(9, 6, 3, 2, '#9c7644');
  }
  return t;
}
function chest() {
  return planks().rect(0, 0, 16, 2, '#63462c').rect(0, 14, 16, 2, '#63462c').rect(0, 0, 2, 16, '#63462c').rect(14, 0, 2, 16, '#63462c')
    .rect(1, 5, 14, 2, '#503a25').rect(7, 5, 2, 4, '#c7c7b6').set(8, 7, '#92978b');
}
function bookshelf() {
  const t = new PixelTile().rect(0, 0, 16, 16, '#493826'), books = ['#9d3b30', '#41735b', '#455c84', '#b3994d', '#896394', '#995b38'];
  for (const y of [2, 10]) for (let x = 0; x < 16; x += 3) {
    const c = rgb(books[(x / 3 + (y === 10 ? 2 : 0)) % books.length]);
    t.rect(x, y, 2, 5, c).set(x, y + 1, tone(c, 28)).set(x, y + 4, tone(c, -20));
  }
  for (const y of [0, 8, 15]) t.rect(0, y, 16, 1, '#b58e55');
  return t;
}
function striped(colors, seed, spacing = 4) {
  const t = new PixelTile().grain(colors, seed);
  for (let x = 0; x < 16; x += spacing) t.rect(x, 0, 1, 16, colors[0]).rect(x + 1, 0, 1, 16, colors[colors.length - 1]);
  return t;
}
function lava(magma = false) {
  const t = new PixelTile().grain(magma ? ['#572d22', '#683422', '#7c422a'] : ['#d55108', '#e26609', '#f57b0d', '#ff9019'], 181);
  if (magma) {
    for (const y of [2, 7, 12]) for (let x = 0; x < 16; x++) t.set(x, y + (Math.floor(x / 3) % 2), '#f69228');
    for (const x of [3, 9, 14]) t.rect(x, 0, 1, 16, '#e77415');
  } else t.clusters(['#ffaa25', '#ffc13a', '#ffdc62', '#ba3e05'], 183, 31, 3, 2);
  return t;
}
function glowstone() { return new PixelTile().grain(['#8d6c35', '#a37e41', '#bb9758'], 171).clusters(['#efd185', '#e4bc68', '#ffe6a3', '#77552c'], 172, 53, 2, 2); }
function plantTile(kind) {
  const t = new PixelTile(0), greens = ['#4a852c', '#599b35', '#6da83f', '#7bb44a'];
  const line = (x, y, dx, dy, n, color) => { for (let i = 0; i < n; i++) t.set(Math.round(x + dx * i), Math.round(y + dy * i), color); };
  if (kind === 'grass') {
    for (const [x, h, lean] of [[2, 6, -1], [4, 10, -2], [6, 8, 1], [8, 13, 0], [10, 9, 2], [12, 11, 2], [14, 5, 1]]) {
      for (let j = 0; j < h; j++) t.set(x + Math.round(lean * j / h), 15 - j, greens[j % 4]);
    }
    t.rect(6, 12, 4, 4, greens[1]);
  } else if (kind === 'fern') {
    line(8, 15, 0, -1, 14, greens[1]);
    for (let y = 4; y < 15; y += 2) for (let j = 1; j <= Math.min(5, (y - 1) >> 1); j++) {
      t.set(8 - j, y + (j >> 1), greens[(y + j) % 4]).set(8 + j, y + (j >> 1), greens[(y + j + 1) % 4]);
    }
  } else if (kind === 'deadBush') {
    line(8, 15, 0, -1, 8, '#7b582b'); line(8, 11, -1, -1, 5, '#906837'); line(8, 12, 1, -1, 6, '#906837'); line(8, 8, 0, -1, 4, '#7b582b');
    t.rect(3, 4, 1, 3, '#7b582b').rect(13, 5, 1, 3, '#7b582b');
  } else {
    const flowers = {poppy: ['#c92f20', '#e33b27', '#372013'], dandelion: ['#dfb910', '#f4d82d', '#be9210'], cornflower: ['#3a59af', '#6385e2', '#30477e'], daisy: ['#d8d8cc', '#faf9ea', '#e9bd23']};
    const [dark, light, center] = flowers[kind];
    line(8, 15, 0, -1, 10, greens[1]); line(8, 12, -1, -.5, 4, greens[0]); line(8, 10, 1, -.5, 4, greens[2]);
    t.rect(6, 3, 4, 5, dark).rect(5, 4, 6, 3, light).rect(7, 2, 2, 7, light).rect(7, 4, 2, 2, center);
  }
  return t;
}
const tileColor = (ctx, tile) => {
  const d = ctx.getImageData(tile % 16 * ATLAS_TILE, Math.floor(tile / 16) * ATLAS_TILE, ATLAS_TILE, ATLAS_TILE).data;
  const total = [0, 0, 0]; let count = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { for (let k = 0; k < 3; k++) total[k] += d[i + k]; count++; }
  return count ? total.map(v => Math.round(v / count)) : [128, 128, 128];
};

// Names retained for the terrain shader and chunk streamer.
export const HD_LEAF_TILES = [7, 121, 124];
export const HD_EMISSIVE_TILES = [67, 73, 88, 143];
export const PLANT_TILES = {grass: 240, fern: 241, poppy: 242, dandelion: 243, cornflower: 244, deadBush: 245, daisy: 246};

export function paintOpaqueLeafTextures(atlas) {
  const ctx = atlas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  for (const [tile, colors, seed] of LEAF_ART) leaves(colors, seed, true).write(ctx, tile);
}

export function paintHDTextures(atlas) {
  const ctx = atlas.getContext('2d', {willReadFrequently: true}); ctx.imageSmoothingEnabled = false;
  const put = (tile, texture) => texture.write(ctx, tile);
  const recolor = (tile, fn) => put(tile, fn(tileColor(ctx, tile)));
  const mineral = (colors, seed) => stone(colors, seed).clusters([colors[0], colors[colors.length - 1]], seed + 1, 44, 2, 1);
  put(0, new PixelTile().grain(GRASS, 11).clusters(['#5d9138', '#78ae46'], 12, 34, 2, 1));
  put(1, grassSide()); put(2, dirt()); put(3, stone()); put(4, sand());
  put(5, bark()); put(6, logTop()); put(8, planks()); put(9, bricks()); put(10, glass()); put(11, cobble());
  put(12, smooth('#eef3f5', 81, 5)); put(13, ore(['#927564', '#c2a18b', '#dfc4ac']));
  put(14, mineral(['#292929', '#494949', '#757575', '#969696'], 201));
  put(15, ore(['#208d8b', '#49d6cd', '#a1f8eb'], 313)); put(16, ore(['#272727', '#393939', '#525252'], 317));
  put(17, table(true)); put(18, table()); put(19, furnace()); put(20, smooth('#959591', 301, 5, true)); put(22, wool('#e5e5dd'));
  put(24, chest()); put(25, planks()); put(26, striped(['#5d402c', '#6d4b31', '#7c573a', '#8a6343'], 25, 2));
  put(27, mineral(['#77716b', '#89817a', '#9b948d', '#615c58'], 61)); put(28, ore(['#ad8116', '#e4b934', '#ffe383'], 319));
  put(29, metal('#edcf47')); put(30, metal('#dddeda')); put(31, metal('#62d8ce'));
  put(32, mineral(['#171322', '#211a30', '#2d2341', '#3c2e50'], 191)); put(33, bookshelf());
  put(34, striped(['#aa5c16', '#c47420', '#dc8c2d', '#e7a13a'], 241));
  put(64, mineral(['#622625', '#79302e', '#8b3e39', '#9b4943'], 251));
  put(65, bricks(['#2b151b', '#351a20', '#422129', '#4c2730'], '#180c12'));
  put(66, mineral(['#45362a', '#584536', '#6d5847', '#79614e'], 261).rect(2, 3, 2, 2, '#34271e').rect(6, 3, 2, 2, '#34271e').rect(3, 7, 4, 1, '#3b2c22'));
  put(67, glowstone()); put(68, ore(['#b8aaa0', '#e1d8cf', '#faf4ec'], 337, mineral(['#622625', '#79302e', '#8b3e39', '#9b4943'], 251)));
  put(69, striped(['#38393e', '#4a4b51', '#57585f', '#65666b'], 341));
  put(70, mineral(['#222025', '#302d34', '#3d3940', '#4a454d'], 343)); put(71, mineral(['#c6c598', '#d6d5a7', '#e1dfb1', '#b7b583'], 347));
  put(72, stoneBricks(false, ['#956d9a', '#a37cab', '#b18db9', '#ba99c0'])); put(73, lava());
  put(79, ore(['#991f1b', '#d62d23', '#f55e45'], 351)); put(80, ore(['#254389', '#375eb7', '#688ade'], 353));
  put(81, ore(['#176c35', '#27ae50', '#77dd90'], 357));
  put(88, glowstone().frame('#67422c', '#876044')); put(87, smooth('#795c35', 331, 12, true));
  put(104, planks()); put(105, smooth('#959591', 301, 5, true)); put(106, cobble()); put(107, planks()); put(108, planks());
  put(109, planks().frame('#65492c', '#947242').rect(3, 3, 4, 4, '#4d3824').rect(9, 3, 4, 4, '#4d3824').rect(3, 9, 4, 4, '#4d3824').rect(9, 9, 4, 4, '#4d3824'));
  put(110, planks()); put(111, metal('#c3cbc7')); put(112, metal('#c3cbc7'));
  put(113, smooth('#959591', 301, 5, true)); put(114, stoneBricks()); put(115, stoneBricks(true));
  put(116, sandstone()); put(117, sand(true)); put(118, sandstone(true));
  put(119, bark(['#35281a', '#423221', '#50402a', '#625037'], 93)); put(120, planks(SPRUCE, 113));
  put(122, bark(null, 97, true)); put(123, planks(BIRCH, 117));
  put(128, striped(['#566f23', '#73922a', '#91ac38', '#a0b847'], 231));
  put(129, smooth('#a4c6ef', 211, 8).clusters(['#d0e4fa', '#bed9f5'], 213, 12, 3, 1)); put(130, smooth('#92b7e6', 215, 7));
  put(131, smooth('#9da8b7', 217, 6)); put(132, smooth('#a56e56', 219, 6));
  put(136, striped(['#376721', '#497b29', '#5b8c33', '#75a641'], 221).clusters(['#344322', '#b8c07b'], 223, 12, 1, 2));
  put(137, striped(['#5c4338', '#725345', '#886652', '#a07b60'], 403, 3)); put(138, metal('#4a4548'));
  put(139, ore(['#965638', '#ce8753', '#62a788'], 371)); put(140, metal('#c77c55'));
  put(141, bricks(['#34333a', '#424149', '#4d4c55', '#5a5961'], '#26252b', 4)); put(142, mineral(['#555159', '#625e66', '#706b73', '#49454e'], 373));
  put(143, lava(true)); put(148, glass());
  put(149, new PixelTile(0).rect(0, 4, 16, 1, '#8c9895').rect(0, 12, 16, 1, '#8c9895').rect(1, 0, 1, 16, '#b7bfbc').rect(5, 0, 1, 16, '#b7bfbc').rect(9, 0, 1, 16, '#b7bfbc').rect(13, 0, 1, 16, '#b7bfbc'));
  put(153, mineral(['#bcbfbb', '#d1d2c9', '#dddcd2', '#7d817b'], 377)); put(154, mineral(['#976753', '#ab7965', '#be9180', '#725243'], 379));
  put(155, mineral(['#727575', '#828585', '#969896', '#666967'], 383)); put(156, smooth('#eef3f5', 81, 5));
  put(161, mineral(['#1c1c1c', '#282828', '#343434', '#424242'], 409)); put(162, mineral(['#a9231b', '#bd2e22', '#d4402f', '#962016'], 411));
  put(163, smooth('#78bb62', 413, 8, true)); put(165, mineral(['#7755a1', '#8f67b8', '#a47bc9', '#bb9ae3'], 415)); put(166, mineral(['#dedfd6', '#e7e8df', '#f2f1e7', '#cccec5'], 417));
  for (const tile of [133, 134, 135, ...Array.from({length: 13}, (_, i) => 185 + i)]) recolor(tile, wool);
  for (let tile = 169; tile <= 184; tile++) recolor(tile, color => smooth(color, tile, 3));
  for (let tile = 198; tile <= 208; tile++) recolor(tile, color => smooth(color, tile, 5, true));
  put(209, planks(SPRUCE, 113)); put(210, planks(BIRCH, 117)); put(211, stoneBricks()); put(212, bricks()); put(213, sandstone()); put(214, sandstone(true));
  put(215, smooth('#e2dfd3', 421, 3, true)); put(216, bricks(['#2b151b', '#351a20', '#422129', '#4c2730'], '#180c12')); put(217, bricks(['#34333a', '#424149', '#4d4c55', '#5a5961'], '#26252b'));
  put(254, logTop(SPRUCE, '#35281a')); put(255, logTop(BIRCH, '#ccc9ba'));
  for (const [tile, colors, seed] of LEAF_ART) put(tile, leaves(colors, seed));
  for (const [kind, tile] of Object.entries(PLANT_TILES)) put(tile, plantTile(kind));
}
