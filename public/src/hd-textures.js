import {hash} from './core.js';

// Native 32 × 32 block textures. The atlas keeps its 16 × 16 grid of 32px tiles,
// so UVs, workers and inventory icons are unchanged. Every pattern is tileable.
const S = 32;
const clamp = (v, a = 0, b = 255) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const wrap = (v, p) => ((v % p) + p) % p;
const rgb = hex => { const n = parseInt(hex.slice(1, 7), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };

function vnoise(x, y, p, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), u = smooth(x - xi), v = smooth(y - yi);
  const h = (i, j) => hash(wrap(i, p), wrap(j, p), seed);
  return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
}
// Periodic fractal noise over the 32px tile. px/py are pixel coordinates.
function fbm(px, py, seed, cells = 4, octaves = 3) {
  let sum = 0, amp = 1, norm = 0, p = cells;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(px * p / S, py * p / S, p, seed + o * 31);
    norm += amp; amp *= .5; p *= 2;
  }
  return sum / norm;
}
// Anisotropic periodic noise: separate x/y cell counts (both must divide the tile evenly).
function anoise(px, py, seed, cx, cy) {
  const x = px * cx / S, y = py * cy / S, xi = Math.floor(x), yi = Math.floor(y), u = smooth(x - xi), v = smooth(y - yi);
  const h = (i, j) => hash(wrap(i, cx), wrap(j, cy), seed);
  return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
}
function ramp(colors, t) {
  t = clamp(t, 0, .9999) * (colors.length - 1);
  const i = Math.floor(t), f = t - i, a = colors[i], b = colors[i + 1] || a;
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
}
const pal = list => list.map(rgb);

class Tex {
  constructor() { this.d = new Float32Array(S * S * 4); for (let i = 3; i < this.d.length; i += 4) this.d[i] = 255; }
  i(x, y) { return (wrap(y | 0, S) * S + wrap(x | 0, S)) * 4; }
  set(x, y, c, a = 255) { const i = this.i(x, y); this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a; }
  get(x, y) { const i = this.i(x, y); return [this.d[i], this.d[i + 1], this.d[i + 2]]; }
  alpha(x, y, a) { this.d[this.i(x, y) + 3] = a; }
  mul(x, y, f) { const i = this.i(x, y); this.d[i] *= f; this.d[i + 1] *= f; this.d[i + 2] *= f; }
  mix(x, y, c, t) { const i = this.i(x, y); for (let k = 0; k < 3; k++) this.d[i + k] = lerp(this.d[i + k], c[k], t); }
  fill(fn) { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) this.set(x, y, fn(x, y)); return this; }
  write(ctx, tile) {
    const img = ctx.createImageData(S, S);
    for (let i = 0; i < this.d.length; i++) img.data[i] = clamp(Math.round(this.d[i]));
    ctx.clearRect(tile % 16 * S, Math.floor(tile / 16) * S, S, S);
    ctx.putImageData(img, tile % 16 * S, Math.floor(tile / 16) * S);
  }
}

// Toroidal Worley cells used for cobblestone, gravel, bedrock and glowstone.
function cells(count, seed, jitter = 1) {
  const pts = [];
  for (let k = 0; k < count; k++) pts.push([hash(k, seed, 1) * S, hash(k, seed, 2) * S * jitter + (1 - jitter) * S * ((k + .5) / count), k]);
  return (x, y) => {
    let d1 = 1e9, d2 = 1e9, best = null;
    for (const p of pts) {
      let dx = Math.abs(x + .5 - p[0]), dy = Math.abs(y + .5 - p[1]);
      dx = Math.min(dx, S - dx); dy = Math.min(dy, S - dy);
      const d = Math.hypot(dx, dy);
      if (d < d1) { d2 = d1; d1 = d; best = p; } else if (d < d2) d2 = d;
    }
    let ox = x + .5 - best[0], oy = y + .5 - best[1];
    if (ox > S / 2) ox -= S; if (ox < -S / 2) ox += S; if (oy > S / 2) oy -= S; if (oy < -S / 2) oy += S;
    return {d1, d2, id: best[2], ox, oy};
  };
}

// ---------- Natural materials ----------
const GRASS = pal(['#3d6b21', '#4a7f28', '#568f30', '#62a037', '#71b041', '#80bd4d']);
const DIRT = pal(['#553a24', '#654630', '#735036', '#81593c', '#8f6446', '#9b7052']);
const STONE = pal(['#626364', '#6d6e6f', '#78797a', '#838484', '#8e8f8f', '#9a9a99']);

function grassTop(seed = 11) {
  const t = new Tex().fill((x, y) => ramp(GRASS, fbm(x, y, seed, 4, 4) * 1.15 - .08));
  for (let k = 0; k < 190; k++) {
    const x = hash(k, seed, 3) * S | 0, y = hash(k, seed, 4) * S | 0, len = 1 + (hash(k, seed, 5) * 3 | 0), light = hash(k, seed, 6) > .45;
    for (let j = 0; j < len; j++) t.mul(x, y + j, light ? 1.12 - j * .03 : .84 + j * .04);
  }
  for (let k = 0; k < 14; k++) t.mix(hash(k, seed, 7) * S, hash(k, seed, 8) * S, [150, 190, 80], .35);
  return t;
}
function dirt(seed = 21) {
  const t = new Tex().fill((x, y) => ramp(DIRT, fbm(x, y, seed, 4, 4) * 1.2 - .1));
  for (let k = 0; k < 22; k++) {
    const x = hash(k, seed, 1) * S | 0, y = hash(k, seed, 2) * S | 0, big = hash(k, seed, 3) > .6, c = hash(k, seed, 4) > .5 ? [128, 116, 104] : [104, 88, 74];
    t.set(x, y, c); if (big) { t.set(x + 1, y, c); t.set(x, y + 1, c.map(v => v * .85)); }
    t.mul(x + 1, y + 1 + (big ? 1 : 0), .72);
  }
  for (let k = 0; k < 30; k++) t.mul(hash(k, seed, 9) * S, hash(k, seed, 10) * S, .7);
  return t;
}
function grassSide(seed = 31) {
  const t = dirt(21);
  for (let x = 0; x < S; x++) {
    let depth = 4 + Math.round(anoise(x, 0, seed, 8, 1) * 3);
    if (hash(x, seed, 2) > .86) depth += 1 + (hash(x, seed, 3) * 4 | 0);
    for (let y = 0; y < depth; y++) t.set(x, y, ramp(GRASS, fbm(x, y, 11, 4, 3) * 1.1 - .05 - y * .012));
    t.mul(x, depth - 1, .82); t.mul(x, depth, .66); t.mul(x, depth + 1, .85);
  }
  return t;
}
function stone(seed = 41, colors = STONE, cracks = true) {
  const t = new Tex().fill((x, y) => ramp(colors, fbm(x, y, seed, 4, 4) * .8 + fbm(x, y, seed + 7, 8, 2) * .35 - .12));
  if (cracks) for (let k = 0; k < 7; k++) {
    let x = hash(k, seed, 1) * S, y = hash(k, seed, 2) * S; const len = 3 + (hash(k, seed, 3) * 7 | 0), dir = hash(k, seed, 4) > .5 ? 1 : -1;
    for (let j = 0; j < len; j++) { t.mul(x, y, .78); t.mul(x, y + 1, 1.07); x += dir; if (hash(k, j, seed) > .55) y += 1; }
  }
  for (let k = 0; k < 26; k++) t.mul(hash(k, seed, 7) * S, hash(k, seed, 8) * S, hash(k, seed, 9) > .5 ? 1.12 : .88);
  return t;
}
function cobble(seed = 51, colors = pal(['#5b5c5c', '#6c6d6c', '#7c7d7b', '#8b8c8a', '#9c9d9a']), mortar = [44, 45, 45], count = 11) {
  const f = cells(count, seed), t = new Tex();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const c = f(x, y), edge = c.d2 - c.d1;
    if (edge < 1.25) { t.set(x, y, mortar.map(v => v * (.85 + hash(x, y, seed) * .3))); continue; }
    const tone = hash(c.id, seed, 5), r = Math.max(1, c.d1), lit = -(c.ox + c.oy) / (r * 1.6);
    const col = ramp(colors, tone * .7 + .15 + lit * .22 + (fbm(x, y, seed + 3, 8, 2) - .5) * .35);
    t.set(x, y, col); if (edge < 2.2) t.mul(x, y, .78);
  }
  return t;
}
function gravel() {
  const f = cells(30, 61), t = new Tex(), tones = pal(['#5c5652', '#7a736d', '#8f8882', '#a39c95', '#6e6760', '#86796d']);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const c = f(x, y), edge = c.d2 - c.d1, base = tones[c.id % tones.length], lit = -(c.ox + c.oy) * .06;
    t.set(x, y, base.map(v => v * (1 + lit + (hash(x, y, 62) - .5) * .12)));
    if (edge < 1) t.mul(x, y, .55);
  }
  return t;
}
function sand(colors = pal(['#cdb884', '#d6c38f', '#dccb99', '#e3d4a5', '#eadcb1']), seed = 71) {
  const t = new Tex().fill((x, y) => ramp(colors, fbm(x, y, seed, 4, 3) * .7 + hash(x, y, seed) * .45 - .1 + Math.sin((y + fbm(x, y, seed + 1, 2, 2) * 9) * .8) * .05));
  for (let k = 0; k < 40; k++) t.mul(hash(k, seed, 1) * S, hash(k, seed, 2) * S, hash(k, seed, 3) > .5 ? 1.1 : .86);
  return t;
}
function snow() {
  const t = new Tex().fill((x, y) => ramp(pal(['#cdd9e4', '#dde6ee', '#e9eff4', '#f3f7fa', '#fbfdff']), fbm(x, y, 81, 4, 3) * 1.1 - .02));
  for (let k = 0; k < 16; k++) t.set(hash(k, 81, 1) * S, hash(k, 81, 2) * S, [255, 255, 255]);
  return t;
}
function bark(colors, seed = 91, lenticels = false) {
  const t = new Tex().fill((x, y) => {
    const n = anoise(x, y, seed, 16, 2) * .6 + anoise(x, y, seed + 1, 32, 4) * .4, groove = anoise(x, y, seed + 2, 8, 1);
    return ramp(colors, n * .9 + (groove < .38 ? -.35 : 0) + .05);
  });
  if (lenticels) for (let k = 0; k < 10; k++) {
    const x = hash(k, seed, 5) * S | 0, y = hash(k, seed, 6) * S | 0, w = 2 + (hash(k, seed, 7) * 6 | 0);
    for (let j = 0; j < w; j++) { t.set(x + j, y, [48, 46, 42]); t.set(x + j, y + 1, [92, 88, 80]); }
  }
  return t;
}
function logTop(wood, barkColors, seed = 101) {
  const t = new Tex();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - 15.5, dy = y - 15.5, edge = Math.max(Math.abs(dx), Math.abs(dy));
    if (edge > 13) { t.set(x, y, ramp(barkColors, anoise(x, y, seed, 16, 16) * .8 + .1)); continue; }
    const r = Math.hypot(dx, dy) + fbm(x, y, seed, 4, 2) * 2.2, ring = .5 + .5 * Math.sin(r * 1.55);
    t.set(x, y, ramp(wood, ring * .6 + fbm(x, y, seed + 1, 8, 2) * .3 + .05));
    if (edge > 12) t.mul(x, y, .8);
  }
  return t;
}
function planks(colors, seed = 111) {
  const t = new Tex();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const board = y >> 3, shift = [0, 13, 5, 21][board], grain = anoise(x + board * 7, y, seed + board, 4, 16) * .55 + anoise(x, y, seed + 9, 16, 32) * .3;
    let c = ramp(colors, grain + hash(board, seed, 3) * .25);
    const local = y & 7;
    if (local === 0) c = c.map(v => v * .62); else if (local === 1) c = c.map(v => v * 1.08); else if (local === 7) c = c.map(v => v * .86);
    if ((x + shift) % 32 === 0 && local) c = c.map(v => v * .66);
    t.set(x, y, c);
  }
  for (let k = 0; k < 5; k++) { const x = hash(k, seed, 5) * S | 0, y = (hash(k, seed, 6) * 4 | 0) * 8 + 3; t.mul(x, y, .7); t.mul(x + 1, y, .8); t.mul(x, y + 1, .85); }
  return t;
}
function leaves(colors, seed = 121, holes = .2) {
  const t = new Tex();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = fbm(x, y, seed, 8, 3), m = hash(x, y, seed + 3), leaf = anoise(x, y, seed + 5, 16, 16);
    let c = ramp(colors, n * .8 + leaf * .35 - .1);
    if (leaf > .72) c = c.map(v => v * 1.15); else if (leaf < .25) c = c.map(v => v * .72);
    // Holes come in small clusters; their colour is a dark interior for fast (opaque) leaves.
    const hole = fbm(x, y, seed + 11, 8, 2) < holes + .2 && m > .08;
    t.set(x, y, hole ? c.map(v => v * .38) : c, hole ? 0 : 255);
  }
  return t;
}
function bricks(brick, mortar, seed = 131, rowH = 8, width = 16) {
  const t = new Tex();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const row = Math.floor(y / rowH), lx = wrap(x + (row % 2) * (width / 2), S), col = Math.floor(lx / width), ly = y % rowH, cx = lx % width;
    if (ly >= rowH - 2 || cx >= width - 2) { t.set(x, y, mortar.map(v => v * (.9 + hash(x, y, seed) * .2))); continue; }
    const tone = hash(row, col, seed);
    let c = ramp(brick, tone * .55 + fbm(x, y, seed + 2, 8, 2) * .5 - .05);
    if (ly === 0) c = c.map(v => v * 1.12); if (ly === rowH - 3 || cx === width - 3) c = c.map(v => v * .82);
    t.set(x, y, c);
  }
  return t;
}
function stoneBricks(colors = STONE, mortar = [58, 58, 58], mossy = false, seed = 141) {
  const t = new Tex();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    // Top row: one long brick. Bottom row: two bricks, offset like Minecraft stone bricks.
    const row = y >> 4, lx = wrap(x + row * 8, S), ly = y & 15;
    if (ly >= 14 || (row === 1 && (lx % 16) >= 14) || (row === 0 && lx >= 30)) { t.set(x, y, mortar.map(v => v * (.9 + hash(x, y) * .2))); continue; }
    let c = ramp(colors, fbm(x, y, seed, 4, 3) * .7 + hash(row, lx >> 4, seed) * .25);
    if (ly === 0 || (row === 1 ? lx % 16 : lx) === 0) c = c.map(v => v * 1.14);
    if (ly === 13 || (row === 1 ? lx % 16 === 13 : lx === 29)) c = c.map(v => v * .8);
    t.set(x, y, c);
  }
  if (mossy) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const m = fbm(x, y, seed + 40, 4, 3); if (m > .56) t.mix(x, y, ramp(pal(['#3e5a26', '#4f6f2d', '#628538']), hash(x, y, 9)), Math.min(1, (m - .56) * 6));
  }
  return t;
}
function strata(colors, seed, bands = 8, specks = 0) {
  const t = new Tex().fill((x, y) => ramp(colors, anoise(x, y, seed, 4, bands) * .55 + anoise(x, y, seed + 1, 16, bands * 2) * .3 + hash(x, y, seed) * .15));
  for (let k = 0; k < specks; k++) t.mul(hash(k, seed, 1) * S, hash(k, seed, 2) * S, hash(k, seed, 3) > .5 ? 1.25 : .7);
  return t;
}
function speckled(colors, speck, seed, count = 70) {
  const t = new Tex().fill((x, y) => ramp(colors, fbm(x, y, seed, 4, 3) * .9 + hash(x, y, seed) * .2 - .05));
  for (let k = 0; k < count; k++) {
    const x = hash(k, seed, 1) * S | 0, y = hash(k, seed, 2) * S | 0, c = speck[k % speck.length];
    t.set(x, y, c); if (hash(k, seed, 3) > .6) t.set(x + 1, y, c.map(v => v * .9));
  }
  return t;
}
function ore(host, colors, seed, clusters = 6) {
  for (let k = 0; k < clusters; k++) {
    // Spread clusters over a 3 × 3 grid so veins never pile up in one corner.
    const cell = (k * 4 + (seed & 3)) % 9, cx = (cell % 3) * 10.6 + 2 + hash(k, seed, 1) * 6, cy = Math.floor(cell / 3) * 10.6 + 2 + hash(k, seed, 2) * 6, blobs = 3 + (hash(k, seed, 3) * 4 | 0);
    for (let b = 0; b < blobs; b++) {
      const x = Math.round(cx + (hash(k, b, seed + 4) - .5) * 6), y = Math.round(cy + (hash(k, b, seed + 5) - .5) * 6), w = 2 + (hash(k, b, seed + 6) > .6 ? 1 : 0);
      for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) host.set(x + i, y + j, colors[1]);
      host.set(x, y, colors[2]); host.set(x + w - 1, y + w - 1, colors[0]); host.mul(x + w, y + w, .7);
      if (w > 2) host.set(x + 1, y, colors[2].map(v => (v + 255) / 2));
    }
  }
  return host;
}
function metal(base, seed = 151) {
  const c = rgb(base), t = new Tex().fill((x, y) => {
    const brush = anoise(x, y, seed, 2, 32) * .12 - .06, sheen = ((x + y) % 32 < 10 ? .08 : 0) - ((x - y + 64) % 32 < 3 ? .04 : 0);
    return c.map(v => v * (1 + brush + sheen));
  });
  for (let i = 0; i < S; i++) { t.mul(i, 0, 1.3); t.mul(0, i, 1.2); t.mul(i, S - 1, .7); t.mul(S - 1, i, .75); t.mul(i, 1, 1.1); t.mul(1, i, 1.05); }
  return t;
}
function smoothFrom(base, seed, rough = .07, border = false) {
  const t = new Tex().fill((x, y) => base.map(v => v * (1 + (fbm(x, y, seed, 4, 3) - .5) * rough * 2 + (hash(x, y, seed) - .5) * rough * .5)));
  if (border) for (let i = 0; i < S; i++) { t.mul(i, 0, 1.12); t.mul(0, i, 1.08); t.mul(i, S - 1, .84); t.mul(S - 1, i, .88); }
  return t;
}
function fabric(base, seed) {
  return new Tex().fill((x, y) => {
    const weave = ((x + y) % 4 < 2 ? 1.05 : .95) * ((x - y + 64) % 6 === 0 ? .94 : 1);
    return base.map(v => v * weave * (1 + (fbm(x, y, seed, 4, 3) - .5) * .16));
  });
}
function glowstone() {
  const f = cells(14, 171), t = new Tex(), tones = pal(['#fff3b8', '#fbd66b', '#f0b441', '#d99533', '#ffe28a']);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const c = f(x, y), edge = c.d2 - c.d1;
    t.set(x, y, edge < 1.1 ? [108, 74, 38] : tones[c.id % tones.length].map(v => v * (1.05 - c.d1 * .025)));
  }
  return t;
}
function lava() {
  return new Tex().fill((x, y) => {
    const n = fbm(x, y, 181, 4, 3), m = fbm(x, y, 183, 8, 2);
    let c = ramp(pal(['#8e1f06', '#c83a0a', '#ec6414', '#fb9a26', '#ffd24a', '#fff2a0']), n * 1.1 + m * .3 - .1);
    if (n < .33) c = c.map(v => v * .7);
    return c;
  });
}
function obsidian() {
  return new Tex().fill((x, y) => {
    const n = fbm(x, y, 191, 4, 4), s = anoise(x, y, 193, 16, 8);
    return ramp(pal(['#0e0a17', '#17111f', '#20172e', '#2d2140', '#46325e']), n * .8 + (s > .7 ? .35 : 0) - .05);
  });
}
function bedrock() {
  const f = cells(18, 201), t = new Tex(), tones = pal(['#2b2b2b', '#4a4a4a', '#6d6d6d', '#8a8a8a', '#3b3b3b']);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const c = f(x, y); t.set(x, y, tones[c.id % tones.length].map(v => v * (1 - c.d1 * .03 + hash(x, y, 202) * .15)));
    if (c.d2 - c.d1 < 1) t.mul(x, y, .6);
  }
  return t;
}
function ice(packed = false) {
  const t = new Tex().fill((x, y) => ramp(pal(packed ? ['#7fa6dd', '#8fb3e4', '#a0c1ea', '#b3cff0'] : ['#8cb4f0', '#9dc2f4', '#b0d0f8', '#c8e0fb']), fbm(x, y, packed ? 211 : 213, 4, 3)));
  for (let k = 0; k < (packed ? 4 : 7); k++) {
    let x = hash(k, 214, 1) * S, y = hash(k, 214, 2) * S; const len = 5 + (hash(k, 214, 3) * 9 | 0);
    for (let j = 0; j < len; j++) { t.mix(x, y, [240, 250, 255], .6); x += 1; y += hash(k, j, 215) > .5 ? 1 : 0; }
  }
  return t;
}
function cactus() {
  const t = new Tex().fill((x, y) => ramp(pal(['#2c5a1c', '#3a7224', '#48882d', '#579a36']), anoise(x, y, 221, 8, 2) * .7 + hash(x, y, 222) * .2 + ((x % 8) === 0 ? -.3 : 0)));
  for (let k = 0; k < 14; k++) { const x = (hash(k, 223) * 4 | 0) * 8 + 4, y = hash(k, 224) * S | 0; t.set(x, y, [230, 222, 180]); t.set(x, y + 1, [60, 50, 30]); }
  return t;
}
function melon() {
  return new Tex().fill((x, y) => ramp(pal(['#3f6c16', '#5a8a20', '#7aa82c', '#9cc03a']), anoise(x, y, 231, 4, 2) * .4 + ((x % 8) < 3 ? .5 : 0) + hash(x, y, 232) * .15));
}
function pumpkin() {
  return new Tex().fill((x, y) => ramp(pal(['#9c4f0e', '#c0661a', '#dc8124', '#eea03c']), anoise(x, y, 241, 4, 2) * .35 + .5 * Math.abs(Math.sin((x + .5) * Math.PI / 8)) + hash(x, y, 242) * .1));
}
function netherrack() {
  const t = new Tex().fill((x, y) => ramp(pal(['#4a1613', '#62201b', '#7a2c24', '#8e3a30', '#a24a3c']), fbm(x, y, 251, 8, 3) * 1.1 + hash(x, y, 252) * .25 - .15));
  for (let k = 0; k < 9; k++) { let x = hash(k, 253) * S, y = hash(k, 254) * S; for (let j = 0; j < 5; j++) { t.mul(x, y, .6); x += 1; y += hash(k, j) > .5 ? 1 : -1; } }
  return t;
}
function soulSand() {
  const t = new Tex().fill((x, y) => ramp(pal(['#3b2b20', '#4d3a2b', '#5f4a38', '#6f5946']), fbm(x, y, 261, 8, 3) + hash(x, y, 262) * .2 - .1));
  for (let k = 0; k < 5; k++) { const x = hash(k, 263) * 26 | 0, y = hash(k, 264) * 26 | 0; t.mul(x, y, .5); t.mul(x + 3, y, .5); t.mul(x + 1, y + 3, .55); t.mul(x + 2, y + 3, .55); }
  return t;
}
function furnaceFront(side) {
  const t = side;
  for (let y = 5; y < 13; y++) for (let x = 7; x < 25; x++) t.mul(x, y, .45);
  for (let y = 17; y < 28; y++) for (let x = 5; x < 27; x++) t.set(x, y, [24, 22, 22]);
  for (let x = 5; x < 27; x++) { t.set(x, 16, [150, 150, 146]); t.set(x, 28, [70, 70, 68]); }
  for (let x = 7; x < 25; x += 3) for (let y = 20; y < 27; y++) t.set(x, y, [44, 42, 40]);
  return t;
}
function tableTop(plank) {
  const t = plank;
  for (let i = 0; i < S; i++) for (const e of [0, 1, 30, 31]) { t.mul(i, e, .62); t.mul(e, i, .62); }
  for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 3; gx++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const px = 3 + gx * 9 + x, py = 3 + gy * 9 + y; if (x === 0 || y === 0) t.mul(px, py, .7); else if (x === 7 || y === 7) t.mul(px, py, 1.12);
  }
  return t;
}
function tableSide(plank) {
  const t = plank;
  for (let x = 0; x < S; x++) for (let y = 0; y < 6; y++) t.mul(x, y, .66);
  for (let y = 6; y < S; y++) for (const x of [0, 1, 2, 3, 28, 29, 30, 31]) t.mul(x, y, .7);
  for (let y = 10; y < 26; y++) { t.set(9, y, [110, 80, 44]); t.set(10, y, [90, 64, 36]); }
  for (let x = 6; x < 15; x++) { t.set(x, 9, [150, 150, 146]); t.set(x, 10, [110, 110, 108]); }
  for (let y = 12; y < 26; y++) { t.set(20, y, [168, 170, 172]); t.set(21, y, [120, 122, 124]); }
  for (let x = 17; x < 25; x++) t.set(x, 12, [96, 70, 40]);
  return t;
}
function glass() {
  const t = new Tex();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) t.set(x, y, [200, 228, 236], 34);
  for (let i = 0; i < S; i++) for (const e of [0, 31]) { t.set(i, e, [214, 234, 240], 230); t.set(e, i, [214, 234, 240], 230); }
  for (let i = 0; i < S; i++) { t.set(i, 1, [168, 196, 206], 150); t.set(1, i, [168, 196, 206], 150); }
  for (let k = 0; k < 7; k++) { t.set(6 + k, 17 - k, [255, 255, 255], 170); t.set(7 + k, 17 - k, [255, 255, 255], 110); }
  for (let k = 0; k < 4; k++) t.set(19 + k, 25 - k, [255, 255, 255], 150);
  return t;
}

const OAK_BARK = pal(['#3b2a17', '#4a3520', '#5a4228', '#6a4f31', '#7a5c3a']);
const OAK_WOOD = pal(['#8d6a3c', '#a17d4b', '#b38d58', '#c29d66']);
const OAK_PLANK = pal(['#8e6c3d', '#9e7a47', '#ad8852', '#bb965d', '#c7a268']);
const SPRUCE_BARK = pal(['#2a1c10', '#352415', '#402c1b', '#4c3522', '#583f29']);
const SPRUCE_PLANK = pal(['#5a3d22', '#664629', '#724f2f', '#7e5936', '#8a633d']);
const BIRCH_BARK = pal(['#b8b4a6', '#cbc7b8', '#d9d5c7', '#e6e2d4', '#f0ede1']);
const BIRCH_PLANK = pal(['#b69f6c', '#c3ac78', '#cfb884', '#d9c38e', '#e2cd99']);
const ORE = {
  coal: pal(['#161616', '#2b2b2b', '#4a4a4a']), iron: pal(['#8c5e40', '#c69470', '#ead0b0']),
  gold: pal(['#a8740f', '#eec236', '#fff4a8']), diamond: pal(['#137e7a', '#48dccf', '#c2fff8']),
  redstone: pal(['#6e0a0a', '#cc1c1c', '#ff7060']), lapis: pal(['#122d70', '#2a58c4', '#7aa0f2']),
  emerald: pal(['#0a5e2c', '#1ab456', '#98f7bb']), copper: pal(['#7c4026', '#c6703f', '#5fb39a']),
  quartz: pal(['#b3a49a', '#e9e0d8', '#ffffff']),
};
const tileColor = (ctx, tile) => {
  const d = ctx.getImageData(tile % 16 * S, Math.floor(tile / 16) * S, S, S).data; let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  return n ? [r / n, g / n, b / n] : [128, 128, 128];
};

export const HD_LEAF_TILES = [7, 121, 124];
export const HD_EMISSIVE_TILES = [67, 73, 88, 143];

export function paintHDTextures(atlas) {
  const ctx = atlas.getContext('2d', {willReadFrequently: true}); ctx.imageSmoothingEnabled = false;
  const put = (tile, tex) => tex.write(ctx, tile);
  const stoneT = () => stone(41), oakPlanks = () => planks(OAK_PLANK, 111), sprucePlanks = () => planks(SPRUCE_PLANK, 113), birchPlanks = () => planks(BIRCH_PLANK, 117);
  const smoothStone = () => smoothFrom([158, 158, 158], 301, .06, true);
  const sandstone = (c, seed) => { const t = strata(pal(c), seed, 4); for (let x = 0; x < S; x++) { t.mul(x, 0, 1.1); t.mul(x, 1, 1.05); t.mul(x, 31, .82); } return t; };
  const SANDSTONE = ['#cfbd88', '#d8c793', '#e0d09e', '#e8d9aa'], RED_SANDSTONE = ['#a1501c', '#b45d22', '#c2692a', '#cd7534'];
  // Remember colors of generic tiles before repainting them.
  const generic = new Map(); for (const t of [22, 133, 134, 135, ...Array.from({length: 13}, (_, i) => 185 + i), ...Array.from({length: 16}, (_, i) => 169 + i), 131, 132, 151, 198, 199, 200]) generic.set(t, tileColor(ctx, t));

  put(0, grassTop()); put(1, grassSide()); put(2, dirt()); put(3, stoneT()); put(4, sand());
  put(5, bark(OAK_BARK, 91)); put(6, logTop(OAK_WOOD, OAK_BARK)); put(7, leaves(pal(['#23491a', '#2f5d20', '#3b7027', '#4a832f', '#5b9538']), 121));
  put(8, oakPlanks()); put(9, bricks(pal(['#7e3a2b', '#93452f', '#a45237', '#b05f41']), [166, 158, 148])); put(10, glass());
  put(11, cobble()); put(12, snow()); put(13, ore(stoneT(), ORE.iron, 311)); put(14, bedrock());
  put(15, ore(stoneT(), ORE.diamond, 313, 5)); put(16, ore(stoneT(), ORE.coal, 317, 7));
  put(17, tableTop(oakPlanks())); put(18, tableSide(oakPlanks())); put(20, smoothStone()); put(19, furnaceFront(smoothStone()));
  put(27, gravel()); put(28, ore(stoneT(), ORE.gold, 319, 5)); put(29, metal('#e7bd3a')); put(30, metal('#d8dcdc')); put(31, metal('#5fded2'));
  put(32, obsidian()); put(34, pumpkin());
  put(64, netherrack()); put(65, bricks(pal(['#2c161b', '#361b21', '#402026', '#4a262c']), [22, 12, 15], 331, 8, 16)); put(66, soulSand());
  put(67, glowstone()); put(68, ore(netherrack(), ORE.quartz, 337, 7)); put(69, strata(pal(['#3c3d42', '#4a4b51', '#595a60', '#686970']), 341, 1, 20));
  put(70, speckled(pal(['#252229', '#2e2a33', '#38333d']), pal(['#4d4855', '#18161b']), 343));
  put(71, speckled(pal(['#d4d19c', '#dcd9a6', '#e3e0b0']), pal(['#b8b482', '#c7c393']), 347, 50)); put(73, lava());
  put(79, ore(stoneT(), ORE.redstone, 351)); put(80, ore(stoneT(), ORE.lapis, 353)); put(81, ore(stoneT(), ORE.emerald, 357, 4));
  put(104, oakPlanks()); put(105, smoothStone()); put(106, cobble()); put(107, oakPlanks());
  put(113, smoothStone()); put(114, stoneBricks()); put(115, stoneBricks(STONE, [58, 58, 58], true));
  put(116, sandstone(SANDSTONE, 361)); put(117, sand(pal(['#a3521c', '#b25c21', '#be6727', '#c9732f']), 363)); put(118, sandstone(RED_SANDSTONE, 367));
  put(119, bark(SPRUCE_BARK, 93)); put(120, sprucePlanks()); put(121, leaves(pal(['#1b3320', '#223f27', '#2a4c2e', '#335a35', '#3d6a3e']), 123, .12));
  put(122, bark(BIRCH_BARK, 97, true)); put(123, birchPlanks()); put(124, leaves(pal(['#3e5f22', '#4b712a', '#5a8233', '#6a933c', '#7ba547']), 127));
  put(128, melon()); put(129, ice()); put(130, ice(true)); put(136, cactus());
  put(139, ore(stoneT(), ORE.copper, 371)); put(141, strata(pal(['#35353a', '#3f3f45', '#4a4a50', '#56565c']), 373, 16, 30));
  put(153, speckled(pal(['#cfcfcc', '#d9d9d6', '#e3e3e0']), pal(['#7c7c7c', '#9a9a98', '#5e5e5e']), 377, 90));
  put(154, speckled(pal(['#8f5f4d', '#9c6a56', '#a87561']), pal(['#c49585', '#6d463a', '#b8a09a']), 379, 90));
  put(155, speckled(pal(['#7b7b7b', '#848484', '#8e8e8e']), pal(['#9c9c9c', '#666666']), 383, 80));
  put(156, snow()); put(209, sprucePlanks()); put(210, birchPlanks()); put(211, stoneBricks()); put(212, bricks(pal(['#7e3a2b', '#93452f', '#a45237', '#b05f41']), [166, 158, 148]));
  put(213, sandstone(SANDSTONE, 361)); put(214, sandstone(RED_SANDSTONE, 367)); put(217, strata(pal(['#35353a', '#3f3f45', '#4a4a50', '#56565c']), 373, 16, 30));
  put(254, logTop(pal(['#6f5130', '#7d5c37', '#8a673f', '#977247']), SPRUCE_BARK, 103)); put(255, logTop(pal(['#c3a979', '#ceb586', '#d8c092', '#e0c99c']), BIRCH_BARK, 107));
  put(72, stoneBricks(pal(['#8f6a93', '#9b76a0', '#a782ac', '#b28eb7']), [110, 84, 114], false, 401));
  put(137, speckled(pal(['#5e4337', '#6b4d40', '#775749']), pal(['#9a7a6a', '#3c2a22']), 403, 60));
  put(138, metal('#4b4549')); put(140, metal('#c9744b')); put(208, bricks(pal(['#b8663e', '#c7724a', '#d17e55']), [150, 80, 52], 405, 16, 16));
  put(142, smoothFrom([72, 72, 78], 407, .06)); put(161, speckled(pal(['#151515', '#1c1c1c', '#232323']), pal(['#303030', '#0c0c0c']), 409, 50));
  put(162, speckled(pal(['#a3180e', '#b52114', '#c42a1b']), pal(['#e2422e', '#7a0e08']), 411, 60));
  put(163, smoothFrom([118, 190, 96], 413, .08, true)); put(165, speckled(pal(['#7c56b4', '#8a63c2', '#9870cf']), pal(['#c6a4f2', '#5c3a8c']), 415, 70));
  put(166, speckled(pal(['#dcdcd6', '#e3e3de', '#ebebe6']), pal(['#c4c4bd', '#f6f6f2']), 417, 40));
  for (const [tile, c] of generic) {
    const wool = tile === 22 || (tile >= 133 && tile <= 135) || (tile >= 185 && tile <= 197);
    put(tile, wool ? fabric(c, 400 + tile) : tile === 151 ? speckled([c, c.map(v => v * 1.08), c.map(v => v * .92)], pal(['#8a6f8f', '#5c4a5e']), 391) : smoothFrom(c, 400 + tile, tile >= 169 && tile <= 184 ? .035 : .06, tile >= 198));
  }
}
