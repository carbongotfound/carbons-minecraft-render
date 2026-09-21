import {BlockInfo} from './engine.js';

const MOB_COL = {
  creeper: '#4F8A32', zombie: '#5B8F3C', skeleton: '#E8DFC6', spider: '#3f302b',
  cow: '#71614d', sheep: '#e4e0d6', pig: '#e7a8a0', chicken: '#e6e2d3',
  blaze: '#e6a23c', enderman: '#1a1220', slime: '#6db85a', dragon: '#241018',
  villager: '#b98563', iron_golem: '#9aa3a0', snow_golem: '#e8eef0',
};
const FACE = [0.72, 0.78, 1, 0.48, 0.86, 0.8];
const hexRgb = (c) => {
  if (!c || c[0] !== '#') return [125, 121, 113];
  const n = c.length === 4
    ? parseInt(c[1] + c[1] + c[2] + c[2] + c[3] + c[3], 16)
    : parseInt(c.slice(1, 7), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
};

class SoftwareRenderer {
  constructor({canvas}) {
    this.domElement = canvas;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', {alpha: false, desynchronized: true});
    this.ctx.imageSmoothingEnabled = false;
    this.pixelRatio = 1;
    this.toneMapping = 0;
    this.toneMappingExposure = 1;
    this.outputColorSpace = 'srgb';
    this.shadowMap = {enabled: false, type: 2, autoUpdate: false, needsUpdate: false};
    this.view = null;
    this.buf = document.createElement('canvas');
    this.bctx = this.buf.getContext('2d', {alpha: false});
    this.iw = 160;
    this.ih = 90;
    this.depth = new Float32Array(this.iw * this.ih);
    this.lut = new Uint8Array(256 * 3);
    this.lutReady = false;
  }
  setPixelRatio(v) { this.pixelRatio = Number(v) || 1; this.resizeBuffer(); }
  setSize() { this.resizeBuffer(); }
  resizeBuffer() {
    const cssW = Math.max(64, innerWidth), cssH = Math.max(48, innerHeight);
    this.canvas.width = cssW;
    this.canvas.height = cssH;
    const q = this.pixelRatio <= .8 ? .28 : this.pixelRatio >= 1.5 ? .48 : .36;
    this.iw = Math.max(96, Math.min(280, Math.round(cssW * q)));
    this.ih = Math.max(54, Math.min(160, Math.round(this.iw * cssH / cssW)));
    this.buf.width = this.iw;
    this.buf.height = this.ih;
    this.depth = new Float32Array(this.iw * this.ih);
    this.ctx.imageSmoothingEnabled = false;
  }
  refreshLut() {
    for (let i = 0; i < 256; i++) {
      const [r, g, b] = hexRgb(BlockInfo[i]?.color || '#7d7971');
      this.lut[i * 3] = r; this.lut[i * 3 + 1] = g; this.lut[i * 3 + 2] = b;
    }
    this.lutReady = true;
  }
  render(scene, camera) {
    const view = this.view;
    if (!view || !this.ctx) return;
    if (!this.lutReady) this.refreshLut();
    const w = this.iw, h = this.ih, world = view.world;
    camera.updateMatrixWorld?.(true);
    const e = camera.matrixWorld.elements;
    const rx = e[0], ry = e[1], rz = e[2];
    const ux = e[4], uy = e[5], uz = e[6];
    const fx = -e[8], fy = -e[9], fz = -e[10];
    const ox = camera.position.x, oy = camera.position.y, oz = camera.position.z;
    const fov = (camera.fov || 72) * Math.PI / 180;
    const tan = Math.tan(fov * .5);
    const asp = w / h;
    const sky = hexRgb(scene?.background?.isColor ? '#' + scene.background.getHexString() : '#77b3ea');
    const fogFar = scene?.fog?.far || 70;
    const maxT = Math.min(52, fogFar * .72);
    const img = this.bctx.createImageData(w, h);
    const pix = img.data;
    const depth = this.depth;
    const lut = this.lut;
    for (let y = 0; y < h; y++) {
      const ndcY = 1 - (y + .5) / h * 2;
      const uyS = ndcY * tan;
      for (let x = 0; x < w; x++) {
        const ndcX = (x + .5) / w * 2 - 1;
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
        let t = 0, face = 2, hit = 0, steps = 0;
        while (t <= maxT && steps++ < 96) {
          const b = world.get(vx, vy, vz);
          if (b) { hit = b; break; }
          if (tMaxX <= tMaxY && tMaxX <= tMaxZ) { t = tMaxX; tMaxX += invX; vx += sx; face = sx > 0 ? 0 : 1; }
          else if (tMaxY <= tMaxZ) { t = tMaxY; tMaxY += invY; vy += sy; face = sy > 0 ? 2 : 3; }
          else { t = tMaxZ; tMaxZ += invZ; vz += sz; face = sz > 0 ? 4 : 5; }
        }
        const i = (y * w + x);
        const o = i * 4;
        if (hit) {
          const shade = FACE[face] * (0.82 + ((vx * 73 ^ vy * 41 ^ vz * 19) & 31) / 180);
          const fog = Math.min(1, t / maxT);
          const li = hit * 3;
          pix[o] = lut[li] * shade * (1 - fog) + sky[0] * fog;
          pix[o + 1] = lut[li + 1] * shade * (1 - fog) + sky[1] * fog;
          pix[o + 2] = lut[li + 2] * shade * (1 - fog) + sky[2] * fog;
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
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.buf, 0, 0, this.canvas.width, this.canvas.height);
    if (view.hand?.visible) this.drawHand(view);
  }
  project(p, cam) {
    const dx = p.x - cam.ox, dy = p.y - cam.oy, dz = p.z - cam.oz;
    const z = dx * cam.fx + dy * cam.fy + dz * cam.fz;
    if (z < .12) return null;
    const x = dx * cam.rx + dy * cam.ry + dz * cam.rz;
    const y = dx * cam.ux + dy * cam.uy + dz * cam.uz;
    return {
      sx: (x / (z * cam.tan * cam.asp) * .5 + .5) * this.iw,
      sy: (-y / (z * cam.tan) * .5 + .5) * this.ih,
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
  drawSprites(pix, depth, w, h, cam, view, scene) {
    const items = [];
    const avatarRoots = new Set();
    for (const a of view.avatars?.values() || []) {
      if (a.root) avatarRoots.add(a.root);
      if (a.root?.visible === false) continue;
      const p = a.root.position;
      items.push({x: p.x, y: p.y + 0.9, z: p.z, h: 1.85, c: a.materials?.[0]?.color ? '#' + a.materials[0].color.getHexString() : '#73a4ae', label: a.name});
    }
    const skip = new Set([view.camera, view.clouds, view.outline, view.hand, ...avatarRoots]);
    for (const g of view.chunks?.values() || []) skip.add(g);
    const walk = (obj) => {
      if (!obj || skip.has(obj) || obj.visible === false) return;
      if (obj.isLight || obj.isCamera) return;
      const sp = obj.userData?.sprite;
      if (sp) {
        items.push({x: obj.position.x, y: obj.position.y + (sp.h || 1) * .5, z: obj.position.z, h: sp.h || 1.6, c: MOB_COL[sp.kind] || '#8aa56a'});
        return;
      }
      const sc = obj.scale?.x || 1;
      if (obj.parent === scene && sc < 3 && obj.position && (obj.isGroup || obj.isMesh)) {
        items.push({x: obj.position.x, y: obj.position.y + .35, z: obj.position.z, h: Math.max(.35, obj.scale?.y || .5), c: '#c2a36a'});
        return;
      }
      for (const ch of obj.children || []) walk(ch);
    };
    for (const child of scene?.children || []) walk(child);
    if (view.outline?.visible) {
      const p = view.outline.position;
      items.push({x: p.x, y: p.y, z: p.z, h: 1.05, c: '#f4f0c8', thin: true});
    }
    for (const bit of view.bits || []) {
      const p = bit.m?.position; if (!p) continue;
      items.push({x: p.x, y: p.y, z: p.z, h: .2, c: '#cbb89a'});
    }
    for (const it of items) {
      const pr = this.project(it, cam);
      if (!pr || pr.z > cam.maxT) continue;
      const scale = (1 / pr.z) * (this.ih / (2 * cam.tan));
      const bh = Math.max(2, (it.thin ? .2 : it.h) * scale);
      const bw = Math.max(2, bh * (it.thin ? 1 : .45));
      this.stamp(pix, depth, w, h, pr.sx, pr.sy, bw, bh, pr.z, hexRgb(it.c), it.thin ? .55 : 1);
    }
  }
  drawHand(view) {
    const g = this.ctx, W = this.canvas.width, H = this.canvas.height;
    g.save();
    g.fillStyle = '#cda780';
    g.fillRect(W * .78, H * .84, W * .14, H * .14);
    g.fillStyle = '#8a6a4c';
    g.fillRect(W * .80, H * .86, W * .04, H * .09);
    if (view.held?.visible) {
      const id = view.heldBlock || 1;
      g.fillStyle = BlockInfo[id]?.color || '#85aa56';
      g.fillRect(W * .84, H * .80, W * .09, W * .09);
      g.fillStyle = '#0003';
      g.fillRect(W * .84, H * .80 + W * .07, W * .09, W * .02);
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
