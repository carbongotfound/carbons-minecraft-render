import {Mesh,Material,CanvasTexture,SRGB,Nearest,makeGeometry,cubeGeometry} from './engine.js';
import {ITEMS} from './core.js';
import {icon} from './art.js';

// Minecraft-style 3D items: the 32px icon is extruded into a one-pixel-thick solid whose edges
// take the colour of the pixel they border. Geometry and materials are cached per item.
const S = 32, T = 1 / 32;
const NOT_CUBES = new Set([18, 20, 22, 23, 24, 25, 26, 27, 34, 36, 37, 38, 39, 58, 59, 60, 61, 62, 71, 72, 74, 75, 76, 77, 78, 79, 84, 101, 102, 103, 120, 123, 124, 125, 126, 128, 133, 136]);
const SPRITES = new Set(['torch', 'seeds', 'sapling', 'sugar_cane']);
const geometries = new Map(), materials = new Map(), cubes = new Map(), waiting = new Map();
const flat = shared(makeGeometry(quadSet()));

function shared(g) { g.userData.shared = true; return g; }
function quadSet() { const d = {p: [], n: [], uv: [], col: [], idx: []}; quad(d, [-.5, -.5, 0], [.5, -.5, 0], [-.5, .5, 0], [.5, .5, 0], [0, 0, 1], [0, 0], [1, 1]); return d; }
function quad(d, bl, br, tl, tr, n, uv0, uv1) {
  const o = d.p.length / 3;
  d.p.push(...bl, ...br, ...tl, ...tr);
  for (let i = 0; i < 4; i++) { d.n.push(...n); d.col.push(1, 1, 1); }
  d.uv.push(uv0[0], uv0[1], uv1[0], uv0[1], uv0[0], uv1[1], uv1[0], uv1[1]);
  d.idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3);
}
function extrude(alpha) {
  const d = {p: [], n: [], uv: [], col: [], idx: []}, t = T / 2, solid = (x, y) => x >= 0 && y >= 0 && x < S && y < S && alpha[y * S + x] > 127;
  quad(d, [-.5, -.5, t], [.5, -.5, t], [-.5, .5, t], [.5, .5, t], [0, 0, 1], [0, 0], [1, 1]);
  quad(d, [.5, -.5, -t], [-.5, -.5, -t], [.5, .5, -t], [-.5, .5, -t], [0, 0, -1], [1, 0], [0, 1]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!solid(x, y)) continue;
    const x0 = -.5 + x * T, x1 = x0 + T, yt = .5 - y * T, yb = yt - T, u = [(x + .5) / S, 1 - (y + .5) / S];
    if (!solid(x - 1, y)) quad(d, [x0, yb, -t], [x0, yb, t], [x0, yt, -t], [x0, yt, t], [-1, 0, 0], u, u);
    if (!solid(x + 1, y)) quad(d, [x1, yb, t], [x1, yb, -t], [x1, yt, t], [x1, yt, -t], [1, 0, 0], u, u);
    if (!solid(x, y - 1)) quad(d, [x0, yt, t], [x1, yt, t], [x0, yt, -t], [x1, yt, -t], [0, 1, 0], u, u);
    if (!solid(x, y + 1)) quad(d, [x0, yb, -t], [x1, yb, -t], [x0, yb, t], [x1, yb, t], [0, -1, 0], u, u);
  }
  return shared(makeGeometry(d));
}
function load(id, atlas) {
  if (materials.has(id)) return materials.get(id);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = S;
  const map = new CanvasTexture(canvas); map.colorSpace = SRGB; map.magFilter = map.minFilter = Nearest; map.generateMipmaps = false;
  const material = new Material({map, alphaTest: .5}); material.userData.shared = true; materials.set(id, material);
  const img = new Image(); waiting.set(id, []);
  img.onload = () => {
    const g = canvas.getContext('2d', {willReadFrequently: true}); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, S, S); map.needsUpdate = true;
    const data = g.getImageData(0, 0, S, S).data, alpha = new Uint8Array(S * S); for (let i = 0; i < S * S; i++) alpha[i] = data[i * 4 + 3];
    const geo = extrude(alpha); geometries.set(id, geo);
    for (const mesh of waiting.get(id) || []) mesh.geometry = geo; waiting.delete(id);
  };
  img.src = icon(id, atlas);
  return material;
}
export const isCubeItem = id => { const def = ITEMS[id]; return !!def?.block && !SPRITES.has(id) && !NOT_CUBES.has(def.block); };
// A 1 × 1 extruded sprite centred on the origin (front faces +z).
export function itemMesh(id, atlas) {
  const material = load(id, atlas), mesh = new Mesh(geometries.get(id) || flat, material);
  if (!geometries.has(id)) waiting.get(id)?.push(mesh);
  mesh.castShadow = true; return mesh;
}
// A textured 1 × 1 × 1 block using the terrain material.
export function cubeMesh(block, view) {
  if (!cubes.has(block)) cubes.set(block, shared(cubeGeometry(block)));
  const mesh = new Mesh(cubes.get(block), view.material); mesh.castShadow = true; return mesh;
}
export function dropMesh(id, view) {
  if (isCubeItem(id)) { const m = cubeMesh(ITEMS[id].block, view); m.scale.setScalar(.25); return m; }
  const m = itemMesh(id, view.atlas); m.scale.setScalar(.42); return m;
}
