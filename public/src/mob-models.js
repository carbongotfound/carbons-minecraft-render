import {Group,Mesh,BoxGeometry,Material,CanvasTexture,SRGB,Nearest,Color} from './engine.js';
import {hash} from './core.js';

// Minecraft-proportioned mobs. Sizes are in model pixels (1/16 block); every box is
// UV-mapped like a Minecraft skin, and each kind's skin is painted once at 2 texels per
// pixel and shared by every mob of that kind. Only the material is per mob (for hurt flashes).
const D = 2, PX = 1 / 16;
const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
const ramp = (list, t) => { t = Math.max(0, Math.min(.999, t)) * (list.length - 1); const i = t | 0; return mix(list[i], list[i + 1] || list[i], t - i); };
const pal = list => list.map(rgb);
const n2 = (x, y, s) => hash(x | 0, y | 0, s);
// Soft value noise for fur and skin variation.
function vn(x, y, s, cell = 3) { const gx = x / cell, gy = y / cell, ix = Math.floor(gx), iy = Math.floor(gy), u = gx - ix, v = gy - iy, a = n2(ix, iy, s), b = n2(ix + 1, iy, s), c = n2(ix, iy + 1, s), d = n2(ix + 1, iy + 1, s), su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v); return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv; }

// A face painter receives face name, texel size and a pixel setter in face space (y down).
const FACES = ['right', 'left', 'top', 'bottom', 'back', 'front']; // BoxGeometry order: +x,-x,+y,-y,+z,-z (mobs face -z)
function fur(colors, seed, cell = 3, grain = .35) {
  return (f, w, h, set) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let t = vn(x, y, seed + FACES.indexOf(f) * 7, cell) * (1 - grain) + n2(x, y, seed + 3) * grain;
    let c = ramp(colors, t); if (f === 'top') c = mul(c, 1.06); if (f === 'bottom') c = mul(c, .8);
    set(x, y, c); } };
}
const layer = (...painters) => (f, w, h, set, get) => { for (const p of painters) p?.(f, w, h, set, get); };
const on = (face, fn) => (f, w, h, set, get) => { if (f === face) fn(w, h, set, get); };
const rect = (set, x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, typeof c === 'function' ? c(i, j) : c); };
// Scale model-pixel rects to texels.
const R = (set, x, y, w, h, c) => rect(set, x * D, y * D, w * D, h * D, c);

// Eyes drawn in model pixels on a front face of width w texels.
function eyes(set, w, y, color, pupil, gap = 2, size = 2, white = null) {
  const cx = w / D / 2;
  for (const s of [-1, 1]) {
    const x = s < 0 ? cx - gap / 2 - size : cx + gap / 2;
    if (white) R(set, x, y, size, 1, white);
    R(set, x, y, size, 1, color);
    R(set, s < 0 ? x + size - 1 : x, y, 1, 1, pupil);
  }
}

function skinFor(kind, v = {}) {
  const P = {};
  if (kind === 'zombie' || kind === 'skeleton') {
    const zombie = kind === 'zombie';
    const flesh = zombie ? pal(['#3f6b2a', '#4a7c31', '#568a3a', '#62973f', '#6fa147']) : pal(['#bdb7a4', '#cbc5b2', '#d8d2c0', '#e3ddcb', '#eee9d8']);
    const shirt = pal(['#1f6d70', '#277d80', '#2e8b8e', '#379a9c']), pants = pal(['#2a3565', '#303d72', '#37457e', '#3f4d8a']);
    P.head = layer(fur(flesh, 11, 2, .45), on('front', (w, h, set) => {
      if (zombie) { eyes(set, w, 3.5, [26, 36, 22], [8, 12, 8], 2, 2); R(set, 3, 5, 2, 1, mul(flesh[0], .8)); R(set, 5.5, 5, 1, 1.5, mul(flesh[0], .75)); R(set, 2.5, 6.5, 3, 1, [52, 34, 28]); R(set, 3.5, 6.5, 1, 1, [84, 40, 36]); }
      else { R(set, 1.5, 3, 2, 2, [22, 20, 18]); R(set, 4.5, 3, 2, 2, [22, 20, 18]); R(set, 3.5, 5, 1, 1, [70, 66, 58]); for (let i = 0; i < 6; i++) R(set, 1 + i, 6.5, .5, 1, [40, 38, 34]); R(set, 1, 6, 6, .5, [120, 114, 100]); }
    }), on('top', (w, h, set) => { if (zombie) for (let i = 0; i < 26; i++) set(n2(i, 3, 5) * w | 0, n2(i, 4, 5) * h | 0, [48, 70, 34]); }));
    if (zombie) {
      P.body = layer(fur(shirt, 21, 3, .3), on('front', (w, h, set) => { R(set, 3, 0, 2, 1, flesh[2]); for (let i = 0; i < 18; i++) set(n2(i, 1, 21) * w | 0, n2(i, 2, 21) * h | 0, [22, 78, 80]); }));
      P.arm = layer(fur(flesh, 31, 2, .4), (f, w, h, set) => { if (f !== 'bottom') rect(set, 0, 0, w, 4 * D, (x, y) => ramp(shirt, n2(x, y, 33))); });
      P.leg = layer(fur(pants, 41, 3, .3), (f, w, h, set) => { if (f !== 'top') rect(set, 0, h - 2 * D, w, 2 * D, (x, y) => ramp(pal(['#3a3a3a', '#4a4a4a']), n2(x, y, 44))); });
    } else {
      // Ribs and bones; gaps are transparent.
      P.body = (f, w, h, set) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const py = y / D, px = x / D, spine = Math.abs(px - (f === 'front' || f === 'back' ? 4 : 1)) < .75, rib = py < 9 && (py | 0) % 2 === 0 && (f === 'front' || f === 'back' || f === 'left' || f === 'right'), pelvis = py >= 9.5 && py < 11;
        set(x, y, ramp(flesh, n2(x, y, 51) * .6 + .2), spine || rib || pelvis || f === 'top' ? 255 : 0); } };
      P.arm = P.leg = fur(flesh, 61, 2, .5);
    }
  } else if (kind === 'player') {
    const skin = pal(['#9c6b4c', '#aa7757', '#b88463', '#c4916f']), hair = pal(['#2e1d12', '#3a2517', '#47301e', '#553a25']), shirt = rgb(/^#[0-9a-f]{6}$/i.test(v.color || '') ? v.color : '#3f8fa0');
    const shirtPal = [mul(shirt, .72), mul(shirt, .86), shirt, mix(shirt, [255, 255, 255], .12)], pants = pal(['#2c3558', '#343e66', '#3d4874', '#46527f']);
    P.head = layer(fur(skin, 181, 3, .2), (f, w, h, set) => {
      // Hair covers the top, back and upper sides; the face keeps a fringe.
      const fringe = f === 'front' ? 2 : f === 'back' ? 8 : f === 'top' ? 8 : f === 'bottom' ? 0 : 3;
      for (let y = 0; y < Math.min(h, fringe * D); y++) for (let x = 0; x < w; x++) if (f !== 'front' || y < 2 * D || x < D || x >= w - D || (y < 2.5 * D && n2(x, 1, 182) > .5)) set(x, y, ramp(hair, vn(x, y, 183, 2) * .7 + n2(x, y, 184) * .3));
      if (f === 'front') { eyes(set, w, 4, [245, 245, 242], [58, 92, 150], 2, 2); R(set, 3.5, 5.5, 1, 1, mul(skin[1], .85)); R(set, 3, 6.5, 2, .5, [120, 70, 56]); }
    });
    P.body = fur(shirtPal, 185, 3, .25);
    P.arm = layer(fur(skin, 187, 3, .2), (f, w, h, set) => { if (f !== 'bottom') rect(set, 0, 0, w, f === 'top' ? h : 4 * D, (x, y) => ramp(shirtPal, n2(x, y, 188) * .5 + .3)); });
    P.leg = layer(fur(pants, 189, 3, .25), (f, w, h, set) => { if (f !== 'top') rect(set, 0, h - 2 * D, w, 2 * D, (x, y) => ramp(pal(['#2a2a2e', '#3a3a40']), n2(x, y, 190))); });
  } else if (kind === 'bat') {
    const fur_ = pal(['#2a1d15', '#35251a', '#422f21', '#503a28']), membrane = pal(['#1c1410', '#261b15', '#30231b']);
    P.head = layer(fur(fur_, 191, 1.5, .5), on('front', (w, h, set) => { R(set, .5, 1.5, 1, 1, [20, 16, 12]); R(set, 2.5, 1.5, 1, 1, [20, 16, 12]); }));
    P.body = fur(fur_, 193, 1.5, .5); P.ear = fur(fur_, 195, 1, .5); P.wing = fur(membrane, 197, 2, .4);
  } else if (kind === 'cod' || kind === 'salmon') {
    const cod = kind === 'cod', scales = cod ? pal(['#6e5a44', '#85705a', '#9c8870', '#b2a088']) : pal(['#8a2e22', '#a33a2b', '#b8503a', '#c9684d']), belly = cod ? pal(['#c9bca4', '#d8cdb8']) : pal(['#d49480', '#e0a894']);
    P.body = (f, w, h, set) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, f === 'bottom' || (f !== 'top' && y > h * .66) ? ramp(belly, n2(x, y, 201)) : ramp(scales, vn(x, y, 203, 2) * .6 + n2(x, y, 204) * .4)); if (f === 'left' || f === 'right') R(set, f === 'left' ? w / D - 2 : 1, 1, 1, 1, [16, 14, 12]); };
    P.fin = fur(scales, 205, 1, .5);
  } else if (kind === 'creeper') {
    const green = pal(['#1f4d16', '#2d6a1f', '#3f8a2a', '#55a238', '#78bd52', '#a3d27a']);
    const camo = fur(green, 71, 2.2, .55);
    P.body = P.leg = camo;
    P.head = layer(camo, on('front', (w, h, set) => { const k = [12, 14, 12]; R(set, 1, 2, 2, 2, k); R(set, 5, 2, 2, 2, k); R(set, 3, 4, 2, 3, k); R(set, 2, 5, 1, 3, k); R(set, 5, 5, 1, 3, k); R(set, 1.5, 2.5, .5, .5, [40, 44, 40]); R(set, 5.5, 2.5, .5, .5, [40, 44, 40]); }));
  } else if (kind === 'spider') {
    const hair = pal(['#140f0d', '#1f1714', '#2b211c', '#372a23', '#453429']);
    P.body = layer(fur(hair, 81, 1.5, .6), on('top', (w, h, set) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.abs(x - w / 2) < w * .18 && (y / D | 0) % 3 === 0) set(x, y, [70, 34, 26]); }));
    P.neck = fur(hair, 83, 1.5, .6); P.leg = fur(hair, 85, 1, .7);
    P.head = layer(fur(hair, 87, 1.5, .6), on('front', (w, h, set) => { const red = [214, 28, 24], hot = [255, 110, 90];
      for (const [x, y] of [[1, 3], [6, 3], [2.5, 2], [4.5, 2], [2, 4.5], [5, 4.5], [3, 3.2], [4, 3.2]]) { R(set, x, y, 1, 1, red); set(x * D, y * D, hot); } }));
    P.glow = { head: [[1, 3], [6, 3], [2.5, 2], [4.5, 2], [2, 4.5], [5, 4.5], [3, 3.2], [4, 3.2]] };
  } else if (kind === 'cow') {
    const hide = pal(['#2b1f17', '#3b2a1e', '#4b3727', '#5a4330']), white = pal(['#cfcac2', '#ddd8d0', '#e9e5de', '#f4f1eb']);
    const patches = seed => (f, w, h, set) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const white_ = vn(x, y, seed + FACES.indexOf(f), 7) > .6; set(x, y, mul(ramp(white_ ? white : hide, n2(x, y, seed + 9) * .5 + vn(x, y, seed, 2) * .5), f === 'bottom' ? .82 : 1)); } };
    P.body = patches(91); P.leg = layer(patches(93), (f, w, h, set) => { if (f !== 'top') rect(set, 0, h - 3 * D, w, 3 * D, (x, y) => ramp(pal(['#2a2420', '#3a332d']), n2(x, y, 94))); });
    P.head = layer(patches(95), on('front', (w, h, set) => { eyes(set, w, 3, [240, 240, 236], [16, 14, 12], 4, 1.5); rect(set, 2 * D, 5 * D, 4 * D, 3 * D, (x, y) => ramp(pal(['#b98e84', '#c99d92', '#d6aca0']), n2(x, y, 96))); R(set, 2.5, 6, 1, 1, [70, 44, 40]); R(set, 4.5, 6, 1, 1, [70, 44, 40]); }));
    P.horn = fur(pal(['#b8b2a2', '#d4cfc0', '#e8e4d6']), 97, 1, .5); P.udder = fur(pal(['#d99a9a', '#e7aaa8', '#f0bab6']), 98, 1, .4);
  } else if (kind === 'pig') {
    const skin = pal(['#d98a86', '#e59a94', '#eea8a1', '#f5b7ae', '#f9c4bb']);
    P.body = P.leg = layer(fur(skin, 101, 3, .25), (f, w, h, set) => { for (let i = 0; i < 14; i++) set(n2(i, f.length, 102) * w | 0, n2(i, 3, 102) * h | 0, [214, 128, 122]); });
    P.head = layer(fur(skin, 103, 3, .25), on('front', (w, h, set) => { eyes(set, w, 3, [250, 250, 250], [24, 20, 20], 4, 1.5); }));
    P.snout = layer(fur(pal(['#e3928d', '#ec9f98']), 105, 1, .3), on('front', (w, h, set) => { R(set, .5, 1, 1, 1, [150, 70, 70]); R(set, 2.5, 1, 1, 1, [150, 70, 70]); }));
    P.hoof = fur(pal(['#7a4d45', '#8a5a50']), 107, 1, .4);
  } else if (kind === 'sheep') {
    const wool = pal(['#bdb6a9', '#cfc9bd', '#dfdad0', '#ebe7df', '#f6f3ee']), face = pal(['#b69b85', '#c4a993', '#d0b7a2']);
    const curls = (f, w, h, set) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = Math.sin(x * 1.3 + vn(x, y, 111, 2) * 5) * Math.cos(y * 1.3 + vn(x, y, 112, 2) * 5); set(x, y, mul(ramp(wool, c * .35 + .55 + n2(x, y, 113) * .2), f === 'bottom' ? .8 : 1)); } };
    P.wool = curls; P.legWool = curls;
    P.body = fur(face, 115, 2, .4);
    P.head = layer(fur(face, 117, 2, .35), on('front', (w, h, set) => { eyes(set, w, 2.5, [240, 236, 228], [24, 20, 18], 2, 1.5); R(set, 2, 4.5, 2, 1, [90, 64, 56]); }));
    P.headWool = layer(curls, on('front', (w, h, set) => { rect(set, 1 * D, 1.5 * D, (w / D - 2) * D, h - 1.5 * D, null); }));
    P.leg = fur(face, 119, 2, .35);
  } else if (kind === 'chicken') {
    const feathers = pal(['#d3cec4', '#e0dbd2', '#ebe7df', '#f5f2ec', '#ffffff']);
    P.body = P.wing = (f, w, h, set) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, mul(ramp(feathers, (y % 3 === 0 ? .2 : .6) + n2(x, y, 121) * .35), f === 'bottom' ? .82 : 1)); };
    P.head = layer(P.body, on('front', (w, h, set) => { R(set, .5, 2, 1, 1, [18, 16, 14]); R(set, 2.5, 2, 1, 1, [18, 16, 14]); }));
    P.beak = fur(pal(['#d69a22', '#e8b02e', '#f3c443']), 123, 1, .4); P.wattle = fur(pal(['#a31f1c', '#bd2a24', '#d03a30']), 125, 1, .4); P.leg = fur(pal(['#c9951e', '#dca72c']), 127, 1, .4);
  } else if (kind === 'villager') {
    const skin = pal(['#9a6e50', '#a8795a', '#b58665', '#c09270']), robe = pal({armorer: ['#4f5358', '#5b6066', '#686d74'], librarian: ['#d6ccb5', '#e0d7c2', '#ebe3d0'], farmer: ['#6a4f33', '#795c3d', '#876848']}[v.profession] || ['#6a4f33', '#795c3d', '#876848']);
    P.head = layer(fur(skin, 131, 3, .25), on('front', (w, h, set) => { R(set, 1, 4, 6, 1, [52, 38, 30]); eyes(set, w, 5, [250, 250, 248], [36, 110, 60], 2, 2); R(set, 2, 8, 4, 1, [110, 74, 54]); }));
    P.nose = fur(skin, 133, 2, .3); P.robe = layer(fur(robe, 135, 3, .3), on('front', (w, h, set) => { if (v.profession === 'farmer') R(set, 0, 6, w / D, 10, (x, y) => ramp(pal(['#a58c4c', '#b39a58']), n2(x, y, 136))); }));
    P.arms = fur(robe, 137, 3, .3); P.hands = fur(skin, 139, 3, .25); P.leg = fur(pal(['#3d3024', '#493a2c']), 141, 3, .3);
  } else if (kind === 'enderman') {
    const black = pal(['#0c0b0f', '#141218', '#1c1922', '#25212c']);
    P.head = layer(fur(black, 151, 2, .5), on('front', (w, h, set) => { R(set, 0.5, 4.5, 3, 1, [206, 130, 232]); R(set, 4.5, 4.5, 3, 1, [206, 130, 232]); R(set, 1.5, 4.5, 1, 1, [236, 190, 250]); R(set, 5.5, 4.5, 1, 1, [236, 190, 250]); }));
    P.body = P.limb = fur(black, 153, 2, .5); P.glow = { head: 'enderman' };
  } else if (kind === 'blaze') {
    const gold = pal(['#a86a14', '#c98a1f', '#e3aa2e', '#f4c948', '#ffe27a']);
    P.head = layer(fur(gold, 161, 2, .45), on('front', (w, h, set) => { R(set, 1, 3, 2, 1.5, [60, 30, 10]); R(set, 5, 3, 2, 1.5, [60, 30, 10]); R(set, 2, 6, 4, 1, [80, 40, 12]); }));
    P.rod = fur(gold, 163, 1.5, .4); P.glow = { head: 'all', rod: 'all' };
  } else if (kind === 'slime') {
    const green = pal(['#4f9a3a', '#61ad47', '#76c057', '#8ad06a']);
    P.shell = (f, w, h, set) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const edge = x < D || y < D || x >= w - D || y >= h - D; set(x, y, ramp(green, n2(x, y, 171) * .4 + (edge ? .8 : .35)), edge ? 235 : 150); } };
    P.core = layer(fur(pal(['#3c7c2c', '#4a8e38']), 173, 2, .4), on('front', (w, h, set) => { R(set, 0, 1, 2, 2, [26, 44, 22]); R(set, 4, 1, 2, 2, [26, 44, 22]); R(set, 2, 4, 2, 1, [26, 44, 22]); }));
  }
  return P;
}

// Model definitions: [name, painter, size[w,h,d], center[x,y,z] relative to its pivot, pivot key].
// Pivots: root, head (neck), limbs (hips/shoulders), with positions in model pixels.
function spec(kind, v) {
  const h = (w, hh, d, x, y, z, paint, parent = 'root', inflate = 0) => ({w, h: hh, d, x, y, z, paint, parent, inflate});
  const legs4 = (paint, len, x, zf, zb, y = len, w = 4, d = 4) => [
    {pivot: [-x, y, zf], leg: true, part: h(w, len, d, 0, -len / 2, 0, paint)}, {pivot: [x, y, zf], leg: true, part: h(w, len, d, 0, -len / 2, 0, paint)},
    {pivot: [x, y, zb], leg: true, part: h(w, len, d, 0, -len / 2, 0, paint)}, {pivot: [-x, y, zb], leg: true, part: h(w, len, d, 0, -len / 2, 0, paint)}]; // diagonal pairs swing together
  switch (kind) {
    case 'player': case 'zombie': case 'skeleton': { const thin = kind === 'skeleton', lw = thin ? 2 : 4;
      return {head: [0, 24, 0], parts: [h(8, 12, 4, 0, 18, 0, 'body'), h(8, 8, 8, 0, 4, 0, 'head', 'head')],
        limbs: [{pivot: [-2, 12, 0], leg: true, part: h(lw, 12, lw, 0, -6, 0, 'leg')}, {pivot: [2, 12, 0], leg: true, part: h(lw, 12, lw, 0, -6, 0, 'leg')},
          {pivot: [-(4 + lw / 2), 22, 0], arm: true, part: h(lw, 12, lw, 0, -4, 0, 'arm')}, {pivot: [4 + lw / 2, 22, 0], arm: true, part: h(lw, 12, lw, 0, -4, 0, 'arm')}]}; }
    case 'creeper': return {head: [0, 18, 0], parts: [h(8, 12, 4, 0, 12, 0, 'body'), h(8, 8, 8, 0, 4, 0, 'head', 'head')], limbs: legs4('leg', 6, 2, -4, 4, 6)};
    case 'spider': {
      const limbs = [];
      for (let i = 0; i < 8; i++) { const side = i % 2 ? 1 : -1, row = (i >> 1) - 1.5; limbs.push({pivot: [side * 4, 9, row * 1.5], leg: true, spider: {side, row}, part: h(16, 2, 2, side * 8, 0, 0, 'leg')}); }
      return {head: [0, 9, -3], parts: [h(6, 6, 6, 0, 9, 0, 'neck'), h(10, 8, 12, 0, 10, 9, 'body'), h(8, 8, 8, 0, 0, -4, 'head', 'head')], limbs};
    }
    case 'cow': return {head: [0, 20, -8], parts: [h(12, 10, 18, 0, 17, 1, 'body'), h(4, 6, 1, 0, 11, 7, 'udder'), h(8, 8, 6, 0, 0, -3, 'head', 'head'), h(1, 3, 1, -4.5, 4.5, -2, 'horn', 'head'), h(1, 3, 1, 4.5, 4.5, -2, 'horn', 'head')], limbs: legs4('leg', 12, 4, -6, 7)};
    case 'pig': return {head: [0, 12, -8], parts: [h(10, 8, 16, 0, 10, 0, 'body'), h(8, 8, 8, 0, 0, -4, 'head', 'head'), h(4, 3, 1, 0, -1, -8.5, 'snout', 'head')], limbs: legs4('leg', 6, 3, -5, 7)};
    case 'sheep': return {head: [0, 18, -8], parts: [h(8, 6, 16, 0, 16, 0, 'body'), h(8, 6, 16, 0, 16, 0, 'wool', 'root', 1.75), h(6, 6, 8, 0, 1, -3, 'head', 'head'), h(6, 6, 6, 0, 1.5, -1.5, 'headWool', 'head', .6)],
      limbs: legs4('leg', 12, 3, -5, 7).map(l => ({...l, extra: h(4, 6, 4, 0, -3, 0, 'legWool', 'limb', .5)}))};
    case 'chicken': return {head: [0, 9, -4], parts: [h(6, 6, 8, 0, 8, 0, 'body'), h(1, 4, 6, -3.5, 9, 0, 'wing'), h(1, 4, 6, 3.5, 9, 0, 'wing'), h(4, 6, 3, 0, 3, -1.5, 'head', 'head'), h(4, 2, 2, 0, 3, -4, 'beak', 'head'), h(2, 2, 2, 0, 1, -3.5, 'wattle', 'head')],
      limbs: [{pivot: [-1.5, 5, 1], leg: true, part: h(1, 5, 1, 0, -2.5, 0, 'leg'), extra: h(3, .5, 3, 0, -4.75, -1, 'leg', 'limb')}, {pivot: [1.5, 5, 1], leg: true, part: h(1, 5, 1, 0, -2.5, 0, 'leg'), extra: h(3, .5, 3, 0, -4.75, -1, 'leg', 'limb')}]};
    case 'villager': return {head: [0, 24, 0], parts: [h(8, 12, 6, 0, 18, 0, 'robe'), h(8, 18, 6, 0, 15, 0, 'robe', 'root', .5), h(8, 10, 8, 0, 5, 0, 'head', 'head'), h(2, 4, 2, 0, 2, -5, 'nose', 'head'),
      h(8, 4, 4, 0, 18.5, -4, 'arms'), h(4, 8, 4, -6, 20, -3, 'arms'), h(4, 8, 4, 6, 20, -3, 'arms'), h(8, 3, 3, 0, 17, -4.8, 'hands')], limbs: [{pivot: [-2, 12, 0], leg: true, part: h(4, 12, 4, 0, -6, 0, 'leg')}, {pivot: [2, 12, 0], leg: true, part: h(4, 12, 4, 0, -6, 0, 'leg')}]};
    case 'enderman': return {head: [0, 42, 0], parts: [h(8, 12, 4, 0, 36, 0, 'body'), h(8, 8, 8, 0, 4, 0, 'head', 'head')],
      limbs: [{pivot: [-2, 30, 0], leg: true, part: h(2, 30, 2, 0, -15, 0, 'limb')}, {pivot: [2, 30, 0], leg: true, part: h(2, 30, 2, 0, -15, 0, 'limb')}, {pivot: [-5, 41, 0], leg: true, part: h(2, 30, 2, 0, -14, 0, 'limb')}, {pivot: [5, 41, 0], leg: true, part: h(2, 30, 2, 0, -14, 0, 'limb')}]};
    case 'bat': return {head: [0, 10, 0], parts: [h(3, 5, 2, 0, 6, 0, 'body'), h(4, 4, 3, 0, 1, 0, 'head', 'head'), h(1, 2, 1, -1.2, 4, 0, 'ear', 'head'), h(1, 2, 1, 1.2, 4, 0, 'ear', 'head')],
      limbs: [{pivot: [-1.5, 8, 0], arm: true, part: h(8, 5, .5, -4, -1.5, 0, 'wing')}, {pivot: [1.5, 8, 0], arm: true, part: h(8, 5, .5, 4, -1.5, 0, 'wing')}]};
    case 'cod': case 'salmon': { const L = kind === 'cod' ? 7 : 9; return {head: [0, 2.5, -L / 2], parts: [h(2, 4, L, 0, 2.5, 0, 'body'), h(1, 3, 2, 0, 5, -.5, 'fin')], limbs: [{pivot: [0, 2.5, L / 2], leg: true, part: h(.5, 4, 4, 0, 0, 2, 'fin')}]}; }
    case 'blaze': return {head: [0, 20, 0], parts: [h(8, 8, 8, 0, 4, 0, 'head', 'head')], limbs: [], rods: true};
    case 'slime': return {head: [0, 0, 0], parts: [h(6, 6, 6, 0, 5, 0, 'core'), h(16, 16, 16, 0, 8, 0, 'shell')], limbs: [], translucent: true};
  }
  return null;
}
export const SKINNED = new Set(['zombie', 'skeleton', 'creeper', 'spider', 'cow', 'pig', 'sheep', 'chicken', 'villager', 'enderman', 'blaze', 'slime']);

const cache = new Map();
function build(kind, v) {
  const key = kind + (kind === 'villager' ? ':' + (v.profession || 'farmer') : kind === 'player' ? ':' + (v.color || '') : '');
  if (cache.has(key)) return cache.get(key);
  const s = spec(kind, v), paints = skinFor(kind, v), boxes = [];
  const add = b => { b.tw = (2 * b.d + 2 * b.w) * D; b.th = (b.d + b.h) * D; boxes.push(b); return b; };
  for (const p of s.parts) add(p);
  for (const l of s.limbs) { add(l.part); if (l.extra) add(l.extra); }
  if (s.rods) add(s.rod = {w: 2, h: 8, d: 2, paint: 'rod'});
  // Shelf-pack each box's unwrapped strip into one skin.
  const W = 256; let x = 0, y = 0, row = 0;
  for (const b of boxes.sort((a, c) => c.th - a.th)) { const tw = Math.ceil(b.tw), th = Math.ceil(b.th); if (x + tw > W) { x = 0; y += row; row = 0; } b.u = x; b.v = y; x += tw + 1; row = Math.max(row, th + 1); }
  const H = Math.max(16, 2 ** Math.ceil(Math.log2(y + row)));
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(W, H), glowCanvas = paints.glow ? document.createElement('canvas') : null, glow = glowCanvas ? new Uint8ClampedArray(W * H * 4) : null;
  for (const b of boxes) {
    const w = Math.round(b.w * D), hh = Math.round(b.h * D), d = Math.round(b.d * D);
    b.rects = {top: [b.u + d, b.v, w, d], bottom: [b.u + d + w, b.v, w, d], right: [b.u, b.v + d, d, hh], front: [b.u + d, b.v + d, w, hh], left: [b.u + d + w, b.v + d, d, hh], back: [b.u + 2 * d + w, b.v + d, w, hh]};
    const painter = paints[b.paint] || fur(pal(['#777777', '#888888']), 1);
    for (const f of FACES) {
      const [fx, fy, fw, fh] = b.rects[f];
      const set = (px, py, c, a = 255) => { px = Math.round(px); py = Math.round(py); if (px < 0 || py < 0 || px >= fw || py >= fh) return; const o = ((fy + py) * W + fx + px) * 4; if (!c) { img.data[o + 3] = 0; return; } img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = a; };
      painter(f, fw, fh, set);
      // Glowing eyes and blaze bodies use an emissive map with the same layout.
      const gl = paints.glow?.[b.paint];
      if (gl) for (let py = 0; py < fh; py++) for (let px = 0; px < fw; px++) {
        const o = ((fy + py) * W + fx + px) * 4, r = img.data[o], g = img.data[o + 1], bb = img.data[o + 2];
        const lit = gl === 'all' ? .55 : gl === 'enderman' ? (f === 'front' && r > 150 && bb > 150) : (f === 'front' && r > 180 && g < 140);
        if (lit) { const k = lit === true ? 1 : lit; glow[o] = r * k; glow[o + 1] = g * k; glow[o + 2] = bb * k; glow[o + 3] = 255; }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = t => { const x = new CanvasTexture(t); x.colorSpace = SRGB; x.magFilter = x.minFilter = Nearest; x.generateMipmaps = false; x.needsUpdate = true; return x; };
  let glowTex = null;
  if (glowCanvas) { glowCanvas.width = W; glowCanvas.height = H; glowCanvas.getContext('2d').putImageData(new ImageData(glow, W, H), 0, 0); glowTex = tex(glowCanvas); }
  // Geometry per box with Minecraft-style UVs; shared by every mob of this kind.
  for (const b of boxes) {
    const g = new BoxGeometry((b.w + 2 * (b.inflate || 0)) * PX, (b.h + 2 * (b.inflate || 0)) * PX, (b.d + 2 * (b.inflate || 0)) * PX), uv = g.attributes.uv;
    FACES.forEach((f, fi) => { const [fx, fy, fw, fh] = b.rects[f], u0 = fx / W, u1 = (fx + fw) / W, vt = 1 - fy / H, vb = 1 - (fy + fh) / H;
      for (let k = 0; k < 4; k++) { const i = fi * 4 + k, U = uv.getX(i), V = uv.getY(i); uv.setXY(i, u0 + U * (u1 - u0), vb + V * (vt - vb)); } });
    uv.needsUpdate = true; b.geometry = g;
  }
  const entry = {spec: s, map: tex(canvas), glow: glowTex, canvas};
  cache.set(key, entry); return entry;
}

// First-person arm and skin material for a player colour.
export function playerArm(color) {
  const e = build('player', {color}), arm = e.spec.limbs[2].part, material = new Material({map: e.map});
  const mesh = new Mesh(arm.geometry, material); return mesh;
}
export function buildMob(kind, v = {}) {
  const e = build(kind, v), s = e.spec;
  const material = new Material({map: e.map, alphaTest: .5, transparent: !!s.translucent, depthWrite: !s.translucent});
  if (e.glow) { material.emissive = new Color('#ffffff'); material.emissiveMap = e.glow; }
  material.userData.original = material.color.clone();
  const root = new Group, head = new Group, legs = [], arms = [];
  const mesh = (b, parent) => { const m = new Mesh(b.geometry, material); m.position.set(b.x * PX, b.y * PX, b.z * PX); m.castShadow = !s.translucent; m.receiveShadow = true; parent.add(m); return m; };
  head.position.set(...s.head.map(n => n * PX)); root.add(head);
  for (const p of s.parts) mesh(p, p.parent === 'head' ? head : root);
  for (const l of s.limbs) {
    const pivot = new Group; pivot.position.set(...l.pivot.map(n => n * PX));
    let holder = pivot;
    if (l.spider) { holder = new Group; holder.rotation.z = -l.spider.side * .6; holder.rotation.y = -l.spider.side * l.spider.row * .38; pivot.add(holder); }
    mesh(l.part, holder); if (l.extra) mesh(l.extra, holder);
    root.add(pivot); (l.arm ? arms : legs).push(pivot);
  }
  if (s.rods) { const rods = new Group; for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + j * .6, r = (9 - j * 1.5) * PX, m = new Mesh(s.rod.geometry, material); m.position.set(Math.cos(a) * r, (6 + j * 7) * PX, Math.sin(a) * r); m.castShadow = true; rods.add(m); } root.add(rods); root.userData.rods = rods; }
  return {root, head, legs, arms, mats: [material]};
}
