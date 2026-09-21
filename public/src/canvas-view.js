import {BlockInfo} from './engine.js';

const MOB_COL = {
  creeper: '#4F8A32', zombie: '#5B8F3C', skeleton: '#E8DFC6', spider: '#3f302b',
  cow: '#71614d', sheep: '#e4e0d6', pig: '#e7a8a0', chicken: '#e6e2d3',
  blaze: '#e6a23c', enderman: '#1a1220', slime: '#6db85a', dragon: '#241018',
  villager: '#b98563', iron_golem: '#9aa3a0', snow_golem: '#e8eef0',
};
const FACE_LIGHT = [0.74, 0.78, 1, 0.5, 0.88, 0.82];
const TEX = 16;
const DIRT = [152, 114, 80];
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const hexRgb = (c) => {
  if (!c || c[0] !== '#') return [125, 121, 113];
  const n = c.length === 4
    ? parseInt(c[1] + c[1] + c[2] + c[2] + c[3] + c[3], 16)
    : parseInt(c.slice(1, 7), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
};
const mix3 = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const hashU = (x, y, s) => {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s + 17, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
};
const fract = (v) => v - Math.floor(v);
const solid = (b) => b && b !== 9 && b !== 14 && b !== 18;

function texelFor(id, face, x, y) {
  const [br, bg, bb] = hexRgb(BlockInfo[id]?.color || '#7d7971');
  const n = hashU(x, y, id * 13 + face * 7);
  const n2 = hashU(x * 3 + 1, y * 5, id + 91);
  const speckle = ((n & 255) - 128) * 0.09;
  let r = br, g = bg, b = bb;
  const top = face === 1, bot = face === 2;
  if (id === 1) {
    if (top) {
      r = 90 + (n & 31); g = 140 + (n2 & 41); b = 55 + (n & 15);
      if ((n & 15) === 0) { r -= 18; g -= 12; }
    } else if (bot) {
      r = DIRT[0] + speckle; g = DIRT[1] + speckle; b = DIRT[2] + speckle;
    } else {
      if (y > 12) { r = 86 + (n & 22); g = 132 + (n2 & 28); b = 52; }
      else { r = DIRT[0] + speckle; g = DIRT[1] + speckle * 0.8; b = DIRT[2]; }
    }
  } else if (id === 2) {
    r = DIRT[0] + speckle * 1.2; g = DIRT[1] + speckle; b = DIRT[2] + speckle * 0.6;
    if ((n & 21) === 0) { r -= 18; g -= 14; }
  } else if (id === 3 || id === 10) {
    const k = id === 10 ? ((x >> 2) ^ (y >> 2)) & 3 : 0;
    r = br + speckle - k * 8; g = bg + speckle - k * 6; b = bb + speckle - k * 7;
    if ((n & 31) < 3) { r -= 28; g -= 24; b -= 22; }
  } else if (id === 4) {
    r = br + speckle * 0.7; g = bg + speckle * 0.5; b = bb + (n & 7);
    if ((n2 & 17) === 0) { r += 12; g += 8; }
  } else if (id === 5) {
    if (top || bot) {
      const dx = x - 7.5, dy = y - 7.5, ring = Math.hypot(dx, dy);
      const band = ((ring * 2) & 1) ? 18 : 0;
      r = 150 - band - (n & 7); g = 116 - band; b = 70 - band * 0.5;
    } else {
      const grain = (x + (n & 1)) % 4 === 0 ? -22 : speckle;
      r = br + grain; g = bg + grain * 0.8; b = bb + grain * 0.4;
    }
  } else if (id === 6) {
    r = 70 + (n & 31); g = 110 + (n2 & 47); b = 48 + (n & 15);
    if ((n & 7) === 0) { r -= 22; g -= 16; }
  } else if (id === 7 || id === 16) {
    const line = y % 4 === 0 ? -26 : speckle;
    r = br + line; g = bg + line * 0.85; b = bb + line * 0.5;
    if (id === 16 && x > 4 && x < 11 && y > 4 && y < 11) { r += 18; g += 8; b -= 8; }
  } else if (id === 8) {
    r = 42 + speckle; g = 42 + speckle; b = 44 + speckle;
    if ((n & 15) < 3) { r = 18; g = 18; b = 20; }
  } else if (id === 9) {
    const edge = x === 0 || y === 0 || x === 15 || y === 15;
    r = edge ? 210 : 170 + speckle; g = edge ? 230 : 210; b = edge ? 225 : 215;
  } else if (id === 11) {
    r = 220 + (n & 15); g = 230 + (n & 15); b = 228 + (n2 & 15);
  } else if (id === 12) {
    r = br + speckle; g = bg + speckle; b = bb + speckle;
    if ((n & 15) < 2) { r = 210; g = 180; b = 150; }
  } else if (id === 13) {
    r = 40 + (n & 31); g = 44 + (n2 & 31); b = 42 + (n & 23);
  } else if (id === 14) {
    r = 55 + (y & 7); g = 110 + (x & 7); b = 150 + (n & 15);
  } else if (id === 15) {
    r = br + speckle; g = bg + speckle; b = bb + speckle;
    if ((n & 15) < 2) { r = 90; g = 220; b = 210; }
  } else if (id === 17) {
    r = 70 + speckle; g = 70 + speckle; b = 72;
    if (!top && !bot && x > 4 && x < 12 && y > 6 && y < 13) { r = 28; g = 22; b = 18; }
  } else if (id === 19) {
    r = 230 + speckle * 0.4; g = 230 + speckle * 0.4; b = 225;
  } else if (id === 20) {
    r = top ? 180 + (n & 15) : 140; g = top ? 50 : 90; b = top ? 50 : 80;
  } else if (id === 21) {
    const row = (y >> 2) & 1;
    const brick = ((x + row * 8) % 8) === 0 || y % 4 === 0;
    r = brick ? 90 : br + speckle; g = brick ? 55 : bg + speckle; b = brick ? 45 : bb;
  } else {
    r = br + speckle; g = bg + speckle; b = bb + speckle;
    if ((n & 31) === 0) { r *= 0.78; g *= 0.78; b *= 0.78; }
  }
  return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255)];
}

class SoftwareRenderer {
  constructor({canvas}) {
    this.domElement = canvas;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', {alpha: false, desynchronized: true});
    this.ctx.imageSmoothingEnabled = false;
    this.pixelRatio = 1.15;
    this.toneMapping = 0;
    this.toneMappingExposure = 1;
    this.outputColorSpace = 'srgb';
    this.shadowMap = {enabled: false, type: 2, autoUpdate: false, needsUpdate: false};
    this.view = null;
    this.buf = document.createElement('canvas');
    this.bctx = this.buf.getContext('2d', {alpha: false});
    this.iw = 320;
    this.ih = 180;
    this.depth = new Float32Array(this.iw * this.ih);
    this.img = null;
    this.lut = new Uint8Array(256 * 3);
    this.tex = new Uint8Array(256 * 3 * TEX_FACE * 3);
    this.lutReady = false;
    this.tier = 1;
    this.maxT = 62;
    this.maxSteps = 110;
    this.useAO = true;
    this.spriteDetail = 1;
  }
  setPixelRatio(v) { this.pixelRatio = Number(v) || 1; this.resizeBuffer(); }
  setSize() { this.resizeBuffer(); }
  qualityTier() {
    const p = this.pixelRatio;
    if (p <= 0.85) return 0;
    if (p >= 1.5) return 2;
    return 1;
  }
  resizeBuffer() {
    const cssW = Math.max(64, innerWidth), cssH = Math.max(48, innerHeight);
    this.canvas.width = cssW;
    this.canvas.height = cssH;
    const tier = this.qualityTier();
    this.tier = tier;
    const scale = [0.48, 0.66, 0.82][tier];
    const maxW = [400, 640, 800][tier];
    this.maxT = [46, 62, 78][tier];
    this.maxSteps = [74, 108, 132][tier];
    this.useAO = tier > 0;
    this.spriteDetail = tier;
    this.iw = clamp(Math.round(cssW * scale), [220, 340, 460][tier], maxW);
    this.ih = clamp(Math.round(this.iw * cssH / cssW), [124, 190, 260][tier], Math.round(maxW * cssH / cssW));
    this.buf.width = this.iw;
    this.buf.height = this.ih;
    this.depth = new Float32Array(this.iw * this.ih);
    this.img = this.bctx.createImageData(this.iw, this.ih);
    this.ctx.imageSmoothingEnabled = tier === 0;
    if (this.ctx.imageSmoothingEnabled) this.ctx.imageSmoothingQuality = 'low';
  }
  refreshLut() {
    for (let i = 0; i < 256; i++) {
      const [r, g, b] = hexRgb(BlockInfo[i]?.color || '#7d7971');
      this.lut[i * 3] = r; this.lut[i * 3 + 1] = g; this.lut[i * 3 + 2] = b;
      for (let face = 0; face < 3; face++) {
        for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
          const [tr, tg, tb] = texelFor(i, face, x, y);
          const o = (((i * 3 + face) * TEX + y) * TEX + x) * 3;
          this.tex[o] = tr; this.tex[o + 1] = tg; this.tex[o + 2] = tb;
        }
      }
    }
    this.lutReady = true;
  }
  sampleTex(id, faceKind, u, v) {
    const x = (u * TEX) & 15, y = (v * TEX) & 15;
    const o = (((id * 3 + faceKind) * TEX + y) * TEX + x) * 3;
    return [this.tex[o], this.tex[o + 1], this.tex[o + 2]];
  }
  skyAt(ndcY, base, night) {
    const t = clamp(ndcY * 0.5 + 0.42, 0, 1);
    const zenith = night ? mix3(base, [8, 12, 28], 0.45) : mix3(base, [40, 90, 180], 0.25);
    const horizon = night ? mix3(base, [18, 22, 40], 0.3) : mix3(base, [255, 214, 168], 0.38);
    const low = night ? mix3(base, [6, 8, 14], 0.4) : mix3(base, [110, 140, 170], 0.2);
    if (t < 0.42) return mix3(low, horizon, t / 0.42);
    return mix3(horizon, zenith, (t - 0.42) / 0.58);
  }
  aoAt(world, vx, vy, vz, fnx, fny, fnz, u, v) {
    let t0x = 0, t0y = 0, t0z = 0, t1x = 0, t1y = 0, t1z = 0;
    if (fnx) { t0y = 1; t1z = 1; }
    else if (fny) { t0x = 1; t1z = 1; }
    else { t0x = 1; t1y = 1; }
    const s0 = u < 0.5 ? -1 : 1, s1 = v < 0.5 ? -1 : 1;
    const px = vx + fnx, py = vy + fny, pz = vz + fnz;
    const a = solid(world.get(px + t0x * s0, py + t0y * s0, pz + t0z * s0)) ? 1 : 0;
    const b = solid(world.get(px + t1x * s1, py + t1y * s1, pz + t1z * s1)) ? 1 : 0;
    const c = solid(world.get(px + t0x * s0 + t1x * s1, py + t0y * s0 + t1y * s1, pz + t0z * s0 + t1z * s1)) ? 1 : 0;
    const occ = a && b ? 3 : a + b + c;
    return 1 - occ * 0.2;
  }
  render(scene, camera) {
    const view = this.view;
    if (!view || !this.ctx) return;
    if (!this.lutReady) this.refreshLut();
    if (!this.img) this.resizeBuffer();
    const w = this.iw, h = this.ih, world = view.world;
    camera.updateMatrixWorld?.(true);
    const e = camera.matrixWorld.elements;
    const rx = e[0], ry = e[1], rz = e[2];
    const ux = e[4], uy = e[5], uz = e[6];
    const fx = -e[8], fy = -e[9], fz = -e[10];
    const ox = camera.position.x, oy = camera.position.y, oz = camera.position.z;
    const fov = (camera.fov || 72) * Math.PI / 180;
    const tan = Math.tan(fov * 0.5);
    const asp = w / h;
    const skyBase = hexRgb(scene?.background?.isColor ? '#' + scene.background.getHexString() : '#77b3ea');
    const night = skyBase[0] + skyBase[1] + skyBase[2] < 160;
    const fogFar = scene?.fog?.far || 70;
    const maxT = Math.min(this.maxT, fogFar * 0.9);
    const maxSteps = this.maxSteps;
    const img = this.img;
    const pix = img.data;
    const depth = this.depth;
    const useAO = this.useAO;
    for (let y = 0; y < h; y++) {
      const ndcY = 1 - (y + 0.5) / h * 2;
      const uyS = ndcY * tan;
      const sky = this.skyAt(ndcY, skyBase, night);
      for (let x = 0; x < w; x++) {
        const ndcX = (x + 0.5) / w * 2 - 1;
        const rxS = ndcX * tan * asp;
        let dx = fx + rx * rxS + ux * uyS;
        let dy = fy + ry * rxS + uy * uyS;
        let dz = fz + rz * rxS + uz * uyS;
        const len = Math.hypot(dx, dy, dz) || 1;
        dx /= len; dy /= len; dz /= len;
        let vx = Math.floor(ox), vy = Math.floor(oy), vz = Math.floor(oz);
        const sx = dx < 0 ? -1 : dx > 0 ? 1 : 0;
        const sy = dy < 0 ? -1 : dy > 0 ? 1 : 0;
        const sz = dz < 0 ? -1 : dz > 0 ? 1 : 0;
        const invX = sx ? Math.abs(1 / dx) : 1e30;
        const invY = sy ? Math.abs(1 / dy) : 1e30;
        const invZ = sz ? Math.abs(1 / dz) : 1e30;
        let tMaxX = sx ? ((sx > 0 ? vx + 1 - ox : ox - vx) * invX) : 1e30;
        let tMaxY = sy ? ((sy > 0 ? vy + 1 - oy : oy - vy) * invY) : 1e30;
        let tMaxZ = sz ? ((sz > 0 ? vz + 1 - oz : oz - vz) * invZ) : 1e30;
        let t = 0, face = 2, hit = 0, steps = 0, axis = 1, fnx = 0, fny = 1, fnz = 0;
        while (t <= maxT && steps++ < maxSteps) {
          const b = world.get(vx, vy, vz);
          if (b) { hit = b; break; }
          if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
            t = tMaxX; tMaxX += invX; vx += sx; face = sx > 0 ? 0 : 1; axis = 0; fnx = -sx; fny = 0; fnz = 0;
          } else if (tMaxY <= tMaxZ) {
            t = tMaxY; tMaxY += invY; vy += sy; face = sy > 0 ? 3 : 2; axis = 1; fnx = 0; fny = -sy; fnz = 0;
          } else {
            t = tMaxZ; tMaxZ += invZ; vz += sz; face = sz > 0 ? 4 : 5; axis = 2; fnx = 0; fny = 0; fnz = -sz;
          }
        }
        const i = y * w + x;
        const o = i * 4;
        if (hit) {
          const hx = ox + dx * t, hy = oy + dy * t, hz = oz + dz * t;
          let u, v, faceKind;
          if (axis === 0) { u = fract(hz); v = 1 - fract(hy); faceKind = 0; }
          else if (axis === 1) { u = fract(hx); v = fract(hz); faceKind = fny > 0 ? 1 : 2; }
          else { u = fract(hx); v = 1 - fract(hy); faceKind = 0; }
          const [tr, tg, tb] = this.sampleTex(hit, faceKind, u, v);
          let shade = FACE_LIGHT[face] * (0.92 + ((vx * 73 ^ vy * 41 ^ vz * 19) & 15) / 220);
          shade *= 0.55 + 0.45 * Math.max(0, fny * 0.85 + fnx * 0.22 + fnz * 0.16);
          if (useAO) shade *= this.aoAt(world, vx, vy, vz, fnx, fny, fnz, u, v);
          const fog = 1 - Math.exp(-(t * t) / (maxT * maxT * 0.62));
          const fogT = fog * fog;
          pix[o] = tr * shade * (1 - fogT) + sky[0] * fogT;
          pix[o + 1] = tg * shade * (1 - fogT) + sky[1] * fogT;
          pix[o + 2] = tb * shade * (1 - fogT) + sky[2] * fogT;
          pix[o + 3] = 255;
          depth[i] = t;
        } else {
          pix[o] = sky[0]; pix[o + 1] = sky[1]; pix[o + 2] = sky[2]; pix[o + 3] = 255;
          depth[i] = maxT + 1;
        }
      }
    }
    this.drawSprites(pix, depth, w, h, {ox, oy, oz, rx, ry, rz, ux, uy, uz, fx, fy, fz, tan, asp, maxT}, view, scene);
    this.bctx.putImageData(img, 0, 0);
    this.ctx.imageSmoothingEnabled = this.tier === 0;
    this.ctx.drawImage(this.buf, 0, 0, this.canvas.width, this.canvas.height);
    if (view.hand?.visible) this.drawHand(view);
  }
  project(p, cam) {
    const dx = p.x - cam.ox, dy = p.y - cam.oy, dz = p.z - cam.oz;
    const z = dx * cam.fx + dy * cam.fy + dz * cam.fz;
    if (z < 0.12) return null;
    const x = dx * cam.rx + dy * cam.ry + dz * cam.rz;
    const y = dx * cam.ux + dy * cam.uy + dz * cam.uz;
    return {
      sx: (x / (z * cam.tan * cam.asp) * 0.5 + 0.5) * this.iw,
      sy: (-y / (z * cam.tan) * 0.5 + 0.5) * this.ih,
      z,
    };
  }
  stamp(pix, depth, w, h, x, y, bw, bh, z, rgb, a = 1) {
    const x0 = Math.max(0, x - bw / 2 | 0), x1 = Math.min(w, x + bw / 2 | 0);
    const y0 = Math.max(0, y - bh / 2 | 0), y1 = Math.min(h, y + bh / 2 | 0);
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) {
      const i = py * w + px;
      if (z >= depth[i]) continue;
      const o = i * 4;
      pix[o] = pix[o] * (1 - a) + rgb[0] * a;
      pix[o + 1] = pix[o + 1] * (1 - a) + rgb[1] * a;
      pix[o + 2] = pix[o + 2] * (1 - a) + rgb[2] * a;
      depth[i] = z;
    }
  }
  stampOutline(pix, depth, w, h, x, y, bw, bh, z, rgb) {
    this.stamp(pix, depth, w, h, x, y, bw + 2, bh + 2, z + 0.03, [18, 16, 12], 0.85);
    this.stamp(pix, depth, w, h, x, y, bw, bh, z, rgb, 1);
  }
  figureParts(kind, color) {
    const c = hexRgb(color || MOB_COL[kind] || '#8aa56a');
    const d = mix3(c, [20, 24, 18], 0.35);
    if (kind === 'spider') return [
      {x: 0, y: 0.32, w: 0.9, h: 0.38, rgb: c},
      {x: 0, y: 0.62, w: 0.5, h: 0.32, rgb: d},
      {x: -0.55, y: 0.22, w: 0.18, h: 0.55, rgb: d},
      {x: 0.55, y: 0.22, w: 0.18, h: 0.55, rgb: d},
    ];
    if (kind === 'chicken') return [
      {x: 0, y: 0.28, w: 0.42, h: 0.32, rgb: c},
      {x: 0, y: 0.62, w: 0.34, h: 0.3, rgb: c},
      {x: 0.18, y: 0.62, w: 0.16, h: 0.1, rgb: [220, 90, 40]},
    ];
    if (kind === 'creeper') return [
      {x: -0.16, y: 0.16, w: 0.2, h: 0.32, rgb: d},
      {x: 0.16, y: 0.16, w: 0.2, h: 0.32, rgb: d},
      {x: 0, y: 0.48, w: 0.5, h: 0.42, rgb: c},
      {x: 0, y: 0.86, w: 0.5, h: 0.32, rgb: c, face: [16, 20, 16]},
    ];
    if (kind === 'player') return [
      {x: -0.12, y: 0.16, w: 0.18, h: 0.34, rgb: [55, 62, 90]},
      {x: 0.12, y: 0.16, w: 0.18, h: 0.34, rgb: [55, 62, 90]},
      {x: 0, y: 0.5, w: 0.42, h: 0.4, rgb: c},
      {x: 0, y: 0.86, w: 0.34, h: 0.3, rgb: [205, 168, 128], face: [40, 32, 28]},
    ];
    return [
      {x: -0.12, y: 0.14, w: 0.18, h: 0.32, rgb: d},
      {x: 0.12, y: 0.14, w: 0.18, h: 0.32, rgb: d},
      {x: 0, y: 0.48, w: 0.46, h: 0.46, rgb: c},
      {x: 0, y: 0.84, w: 0.36, h: 0.3, rgb: mix3(c, [255, 220, 180], kind === 'skeleton' ? 0 : 0.15), face: [24, 20, 18]},
    ];
  }
  drawSprites(pix, depth, w, h, cam, view, scene) {
    const items = [];
    const avatarRoots = new Set();
    for (const a of view.avatars?.values() || []) {
      if (a.root) avatarRoots.add(a.root);
      if (a.root?.visible === false) continue;
      const p = a.root.position;
      items.push({
        x: p.x, y: p.y, z: p.z, h: 1.85,
        c: a.materials?.[0]?.color ? '#' + a.materials[0].color.getHexString() : '#73a4ae',
        kind: 'player', label: a.name,
      });
    }
    const skip = new Set([view.camera, view.clouds, view.outline, view.hand, ...avatarRoots]);
    for (const g of view.chunks?.values() || []) skip.add(g);
    const walk = (obj) => {
      if (!obj || skip.has(obj) || obj.visible === false) return;
      if (obj.isLight || obj.isCamera) return;
      const sp = obj.userData?.sprite;
      if (sp) {
        items.push({x: obj.position.x, y: obj.position.y, z: obj.position.z, h: sp.h || 1.6, c: MOB_COL[sp.kind] || '#8aa56a', kind: sp.kind});
        return;
      }
      const sc = obj.scale?.x || 1;
      if (obj.parent === scene && sc < 3 && obj.position && (obj.isGroup || obj.isMesh)) {
        items.push({x: obj.position.x, y: obj.position.y, z: obj.position.z, h: Math.max(0.35, obj.scale?.y || 0.5), c: '#c2a36a', kind: 'drop'});
        return;
      }
      for (const ch of obj.children || []) walk(ch);
    };
    for (const child of scene?.children || []) walk(child);
    if (view.outline?.visible) {
      const p = view.outline.position;
      items.push({x: p.x, y: p.y - 0.5, z: p.z, h: 1.05, c: '#f4f0c8', kind: 'outline'});
    }
    for (const bit of view.bits || []) {
      const p = bit.m?.position; if (!p) continue;
      items.push({x: p.x, y: p.y, z: p.z, h: 0.2, c: '#cbb89a', kind: 'bit'});
    }
    items.sort((a, b) => b.h - a.h);
    const detail = this.spriteDetail;
    for (const it of items) {
      const pr = this.project({x: it.x, y: it.y + it.h * 0.5, z: it.z}, cam);
      if (!pr || pr.z > cam.maxT) continue;
      const scale = (1 / pr.z) * (this.ih / (2 * cam.tan));
      const fog = clamp(pr.z / cam.maxT, 0, 1);
      if (it.kind === 'outline') {
        const s = Math.max(3, scale);
        this.stamp(pix, depth, w, h, pr.sx, pr.sy, s, s, pr.z, [244, 240, 200], 0.35);
        continue;
      }
      if (it.kind === 'bit' || it.kind === 'drop') {
        const s = Math.max(2, (it.kind === 'drop' ? 0.28 : 0.14) * scale);
        this.stampOutline(pix, depth, w, h, pr.sx, pr.sy, s, s, pr.z, hexRgb(it.c));
        continue;
      }
      const bh = Math.max(3, it.h * scale);
      const rgb = hexRgb(it.c);
      if (detail === 0 || bh < 6) {
        this.stampOutline(pix, depth, w, h, pr.sx, pr.sy, Math.max(3, bh * 0.42), bh, pr.z, mix3(rgb, [30, 30, 30], fog * 0.35));
        continue;
      }
      const parts = this.figureParts(it.kind, it.c);
      const useFace = detail > 1 && bh > 12;
      for (const part of parts) {
        const pw = Math.max(2, part.w * scale);
        const ph = Math.max(2, part.h * it.h * scale);
        const px = pr.sx + part.x * scale;
        const py = pr.sy + (0.5 - part.y) * it.h * scale;
        const col = mix3(part.rgb, [40, 50, 70], fog * 0.28);
        this.stampOutline(pix, depth, w, h, px, py, pw, ph, pr.z - part.y * 0.02, col);
        if (useFace && part.face) {
          this.stamp(pix, depth, w, h, px - pw * 0.16, py - ph * 0.08, Math.max(1, pw * 0.16), Math.max(1, ph * 0.16), pr.z - 0.04, part.face, 1);
          this.stamp(pix, depth, w, h, px + pw * 0.16, py - ph * 0.08, Math.max(1, pw * 0.16), Math.max(1, ph * 0.16), pr.z - 0.04, part.face, 1);
        }
      }
    }
  }
  drawHand(view) {
    const g = this.ctx, W = this.canvas.width, H = this.canvas.height;
    g.save();
    g.imageSmoothingEnabled = false;
    const s = Math.max(10, (H * 0.09) | 0);
    const x = (W * 0.74) | 0, y = (H * 0.78) | 0;
    const cube = (cx, cy, size, top, left, right) => {
      g.fillStyle = left;
      g.fillRect(cx, cy + size * 0.28, size * 0.52, size * 0.72);
      g.fillStyle = right;
      g.fillRect(cx + size * 0.48, cy + size * 0.28, size * 0.52, size * 0.72);
      g.fillStyle = top;
      g.beginPath();
      g.moveTo(cx, cy + size * 0.3);
      g.lineTo(cx + size * 0.5, cy);
      g.lineTo(cx + size, cy + size * 0.3);
      g.lineTo(cx + size * 0.5, cy + size * 0.58);
      g.closePath();
      g.fill();
      g.strokeStyle = '#0008';
      g.lineWidth = Math.max(1, size * 0.04);
      g.strokeRect(cx, cy + size * 0.28, size, size * 0.72);
    };
    g.fillStyle = '#6a4a32';
    g.fillRect(x + s * 0.18, y + s * 0.55, s * 0.9, s * 1.15);
    g.fillStyle = '#cda780';
    g.fillRect(x + s * 0.28, y + s * 0.2, s * 0.7, s * 0.7);
    g.fillStyle = '#b88862';
    g.fillRect(x + s * 0.34, y + s * 0.08, s * 0.22, s * 0.2);
    g.fillRect(x + s * 0.58, y + s * 0.08, s * 0.22, s * 0.2);
    g.fillStyle = '#0003';
    g.fillRect(x + s * 0.28, y + s * 0.72, s * 0.7, s * 0.08);
    if (view.held?.visible) {
      const id = view.heldBlock || 1;
      const [r, gc, b] = hexRgb(BlockInfo[id]?.color || '#85aa56');
      const top = `rgb(${clamp(r + 28, 0, 255)},${clamp(gc + 24, 0, 255)},${clamp(b + 16, 0, 255)})`;
      const left = `rgb(${clamp(r * 0.72, 0, 255)},${clamp(gc * 0.72, 0, 255)},${clamp(b * 0.72, 0, 255)})`;
      const right = `rgb(${clamp(r * 0.88, 0, 255)},${clamp(gc * 0.88, 0, 255)},${clamp(b * 0.88, 0, 255)})`;
      cube(x + s * 0.95, y - s * 0.15, s * 0.95, top, left, right);
    }
    g.restore();
  }
}

export function installCanvasRenderer() {
  globalThis.__carbonMakeRenderer = SoftwareRenderer;
}

export function attachCanvasView(view) {
  if (!view?.renderer) return view;
  view.software = true;
  view.renderer.view = view;
  view.renderer.resizeBuffer();
  const select = view.select.bind(view);
  view.select = function (block) {
    this.heldBlock = block;
    try { select(block); } catch {}
  };
  view.rebuild = function () {};
  view.rebuildDirty = function () { this.world.dirty.clear(); };
  view.renderer.lutReady = false;
  window.addEventListener('resize', () => view.renderer.resizeBuffer());
  return view;
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return false;
    try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch {}
    return true;
  } catch {
    return false;
  }
}

function noteFallback(reason) {
  console.info('[carbons] Canvas2D fallback:', reason || 'WebGL unavailable');
  try {
    document.documentElement.dataset.renderer = 'canvas2d';
    const host = document.querySelector('#title .title-help');
    if (host && !document.getElementById('rendererHint')) {
      const p = document.createElement('p');
      p.id = 'rendererHint';
      p.className = 'renderer-hint';
      p.textContent = 'Canvas2D fallback is active (WebGL is unavailable).';
      host.after(p);
    }
    const btn = document.getElementById('qualityBtn');
    if (btn && !/\(Canvas\)/.test(btn.textContent)) btn.textContent += ' (Canvas)';
  } catch {}
}

function replaceWorldCanvas(canvas) {
  const next = canvas.cloneNode(false);
  canvas.replaceWith(next);
  return next;
}

function forceCanvasFlag() {
  try { return new URLSearchParams(location.search).get('renderer') === 'canvas'; }
  catch { return false; }
}

export function createWorldView(View, canvas, world, touch) {
  const forceCanvas = forceCanvasFlag();
  const probe = !forceCanvas && webglAvailable();
  if (!probe) installCanvasRenderer();
  const build = (el) => {
    const view = new View(el, world, touch);
    if (globalThis.__carbonMakeRenderer) attachCanvasView(view);
    else try { document.documentElement.dataset.renderer = 'webgl'; } catch {}
    return view;
  };
  try {
    const view = build(canvas);
    if (view.software) noteFallback(forceCanvas ? 'forced by ?renderer=canvas' : 'WebGL context unavailable');
    return view;
  } catch (err) {
    if (globalThis.__carbonMakeRenderer) throw err;
    console.warn('[carbons] WebGLRenderer failed, using Canvas2D', err);
    installCanvasRenderer();
    const view = build(replaceWorldCanvas(canvas));
    noteFallback(err?.message || 'WebGLRenderer failed');
    return view;
  }
}
