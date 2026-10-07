// Shared local-space geometry for rendering, picking and player collision.
// Existing block IDs and saved orientation metadata remain unchanged.
const CUBE = [0, 0, 0, 1, 1, 1];
const STAIR_IDS = new Set([82, 83]);
const CARDINAL = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]];
const NON_CONNECTING = new Set([0, 6, 9, 14, 18, 20, 23, 24, 26, 27, 36, 37, 38, 39,
  49, 50, 51, 52, 53, 54, 58, 59, 60, 61, 62, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83,
  84, 85, 86, 87, 88, 101, 102, 103, 112, 120, 123, 124, 125, 126, 128, 132, 133, 136,
  185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195]);
export const COMPOSITE_BLOCKS = new Set([82, 83, 84, 124, 125]);
export const fullCube = box => !!box && box.every((n, i) => n === CUBE[i]);
const direction = meta => {
  const value = Number(meta?.dir);
  return Number.isFinite(value) ? ((Math.round(value) % 4) + 4) % 4 : 0;
};

function stairHalf(dir, y0 = .5, y1 = 1) {
  return [[0, y0, 0, 1, y1, .5], [.5, y0, 0, 1, y1, 1], [0, y0, .5, 1, y1, 1], [0, y0, 0, .5, y1, 1]][dir];
}
function intersection(a, b) {
  const box = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2]), Math.min(a[3], b[3]), Math.min(a[4], b[4]), Math.min(a[5], b[5])];
  return box[0] < box[3] && box[1] < box[4] && box[2] < box[5] ? box : null;
}

export function blockBoxes(id, {neighbor = () => 0, neighborMeta = () => ({}), meta = {}, fallback = CUBE,
  solidNeighbor = b => !!b && !NON_CONNECTING.has(b), collision = false} = {}) {
  if (!id || !fallback) return [];
  if (STAIR_IDS.has(id)) {
    const dir = direction(meta), top = meta.half === 'top' || meta.upsideDown === true;
    const base = [0, top ? .5 : 0, 0, 1, top ? 1 : .5, 1];
    const upper = stairHalf(dir, top ? 0 : .5, top ? .5 : 1), front = CARDINAL[dir], back = CARDINAL[(dir + 2) % 4];
    const compatible = d => {
      const m = neighborMeta(...d);
      return STAIR_IDS.has(neighbor(...d)) && (m.half === 'top' || m.upsideDown === true) === top && direction(m) % 2 !== dir % 2;
    };
    if (compatible(front)) return [base, intersection(upper, stairHalf(direction(neighborMeta(...front)), upper[1], upper[4]))].filter(Boolean);
    if (compatible(back)) return [base, upper, stairHalf(direction(neighborMeta(...back)), upper[1], upper[4])];
    return [base, upper];
  }
  if (id === 84) {
    const boxes = [[.375, 0, .375, .625, collision ? 1.5 : 1, .625]];
    for (const [dx, dy, dz] of CARDINAL) {
      const b = neighbor(dx, dy, dz);
      if (b !== id && !solidNeighbor(b)) continue;
      const arm = dx ? [dx < 0 ? 0 : .625, 0, .4375, dx < 0 ? .375 : 1, 0, .5625]
        : [.4375, 0, dz < 0 ? 0 : .625, .5625, 0, dz < 0 ? .375 : 1];
      if (collision) { arm[4] = 1.5; boxes.push(arm); }
      else for (const y of [.375, .75]) { const rail = arm.slice(); rail[1] = y; rail[4] = y + .1875; boxes.push(rail); }
    }
    return boxes;
  }
  if (id === 124 || id === 125) {
    const boxes = [[.4375, 0, .4375, .5625, 1, .5625]];
    const connected = CARDINAL.filter(d => { const b = neighbor(...d); return b === id || b === 9 || solidNeighbor(b); });
    // A lone pane has a small cross, matching the classic glass-pane silhouette.
    for (const [dx, , dz] of connected.length ? connected : CARDINAL) boxes.push(dx
      ? [dx < 0 ? 0 : .5625, 0, .4375, dx < 0 ? .4375 : 1, 1, .5625]
      : [.4375, 0, dz < 0 ? 0 : .5625, .5625, 1, dz < 0 ? .4375 : 1]);
    return boxes;
  }
  return [fallback];
}

export function collisionBoxes(world, x, y, z, shapeResolver) {
  const id = world.get(x, y, z), shape = shapeResolver(id);
  if (!id || !shape) return [];
  if (!COMPOSITE_BLOCKS.has(id)) return [shape];
  return blockBoxes(id, {
    fallback: shape, collision: true,
    neighbor: (dx, dy, dz) => world.get(x + dx, y + dy, z + dz),
    meta: world.metadata?.get(`${x},${y},${z}`)?.meta || {},
    neighborMeta: (dx, dy, dz) => world.metadata?.get(`${x + dx},${y + dy},${z + dz}`)?.meta || {},
    solidNeighbor: b => fullCube(shapeResolver(b)) && !NON_CONNECTING.has(b),
  });
}

const inside = (p, b) => p.every((n, i) => n > b[i] + 1e-7 && n < b[i + 3] - 1e-7);

// Exposed quads of a union of boxes. Splitting at neighboring box edges prevents
// hidden stair/fence faces and lets their texture UVs stay on the full block grid.
export function surfaceQuads(boxes, faces) {
  if (boxes.length === 1) {
    const box = boxes[0];
    return faces.map((face, f) => ({f, n: face.n, v: face.v.map(p => p.map((n, i) => box[i] + n * (box[i + 3] - box[i])))}));
  }
  const result = [], seen = new Set();
  for (const box of boxes) for (let f = 0; f < faces.length; f++) {
    const {n, v} = faces[f], axis = n.findIndex(Boolean), axes = [0, 1, 2].filter(i => i !== axis);
    const plane = box[axis + (n[axis] > 0 ? 3 : 0)];
    const cuts = axes.map(a => [...new Set([box[a], box[a + 3], ...boxes.flatMap(b => [b[a], b[a + 3]])])]
      .filter(c => c >= box[a] && c <= box[a + 3]).sort((a, b) => a - b));
    for (let a = 0; a < cuts[0].length - 1; a++) for (let b = 0; b < cuts[1].length - 1; b++) {
      const lo = box.slice(0, 3), hi = box.slice(3), probe = [0, 0, 0];
      lo[axes[0]] = cuts[0][a]; hi[axes[0]] = cuts[0][a + 1];
      lo[axes[1]] = cuts[1][b]; hi[axes[1]] = cuts[1][b + 1];
      lo[axis] = hi[axis] = plane;
      for (let i = 0; i < 3; i++) probe[i] = (lo[i] + hi[i]) / 2 + n[i] * 1e-5;
      if (boxes.some(other => inside(probe, other))) continue;
      const key = `${f}:${lo.join(',')}:${hi.join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({f, n, v: v.map(p => p.map((value, i) => lo[i] + value * (hi[i] - lo[i])))});
    }
  }
  return result;
}

export function faceUV(face, p) {
  return [[1 - p[2], p[1]], [p[2], p[1]], [p[0], 1 - p[2]], [p[0], p[2]], [p[0], p[1]], [1 - p[0], p[1]]][face];
}

export function chunkShapeMetadata(world, cells, overrides, ox, oz) {
  if (!world.metadata?.size) return [];
  const result = [], capture = (index, id) => {
    if (!STAIR_IDS.has(id)) return;
    const y = Math.floor(index / 324), z = Math.floor(index / 18) % 18, x = index % 18;
    const meta = world.metadata.get(`${ox + x},${y},${oz + z}`)?.meta;
    if (meta) result.push([index, {dir: direction(meta), half: meta.half, upsideDown: meta.upsideDown}]);
  };
  if (cells) { for (let i = 0; i < cells.length; i++) capture(i, cells[i]); }
  else for (const [index, id] of overrides || []) capture(index, id);
  return result;
}
