import {hash} from './core.js';
import {BLOCKS, TILES} from './expansion-data.js';
import {Nearest} from './engine.js';

// Original 16px pixel art. Keep the atlas layout used by workers and held blocks.
function tilePainter(atlas, tile) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
  const g = canvas.getContext('2d');
  const rect = (x, y, w, h, color) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
  const noise = (colors, seed = tile, scale = 1) => {
    for (let y = 0; y < 16; y += scale) for (let x = 0; x < 16; x += scale)
      rect(x, y, scale, scale, colors[Math.min(colors.length - 1, Math.floor(hash(x, y, seed) * colors.length))]);
  };
  return {g, rect, noise, finish() {
    const target = atlas.getContext('2d'); target.imageSmoothingEnabled = false;
    target.clearRect(tile % 16 * 32, Math.floor(tile / 16) * 32, 32, 32);
    target.drawImage(canvas, tile % 16 * 32, Math.floor(tile / 16) * 32, 32, 32);
  }};
}
const stone = ['#777777', '#808080', '#898989', '#919191', '#858585'];
const dirt = ['#795438', '#89603f', '#966b49', '#815a3e', '#a27853'];
const grass = ['#598c34', '#65963c', '#73a448', '#6c9d40', '#609337'];

function paint(atlas, tile, kind, base = '#8a8a82', accent = null) {
  const {g, rect, noise, finish} = tilePainter(atlas, tile);
  noise(kind === 'dirt' || kind === 'grass_side' ? dirt : kind === 'grass' || kind === 'leaves' ? grass : stone);
  if (kind === 'grass_side') {
    for (let x = 0; x < 16; x++) {
      const depth = 2 + Math.floor(hash(x, 0, 17) * 3);
      for (let y = 0; y <= depth; y++) rect(x, y, 1, 1, grass[Math.floor(hash(x, y, 22) * grass.length)]);
      rect(x, depth + 1, 1, 1, '#614c30');
    }
  } else if (kind === 'dirt') {
    for (let i = 0; i < 10; i++) rect(hash(i, 1) * 16 | 0, hash(i, 2) * 16 | 0, 1, 1, '#888078');
  } else if (kind === 'stone' || kind === 'ore') {
    for (let i = 0; i < 15; i++) {
      const x = hash(i, tile, 1) * 16 | 0, y = hash(i, tile, 2) * 16 | 0;
      rect(x, y, 2 + i % 3, 1, i % 2 ? '#737373' : '#939393');
    }
    if (kind === 'ore') for (const [x, y] of [[2, 3], [10, 2], [6, 7], [12, 10], [2, 12]]) {
      rect(x, y, 3, 3, '#575958'); rect(x, y, 2, 2, base);
      rect(x, y, 1, 1, accent || '#dedede'); rect(x + 1, y + 2, 2, 1, base);
    }
  } else if (kind === 'planks' || kind === 'bricks' || kind === 'cobble') {
    rect(0, 0, 16, 16, base);
    for (let y = 0; y < 16; y += 4) {
      rect(0, y, 16, 1, '#00000055'); rect(0, y + 1, 16, 1, '#ffffff18');
      for (let x = -8 + (y % 8 ? 4 : 0); x < 16; x += kind === 'planks' ? 16 : 8) {
        rect(x, y, 1, 4, '#0000004a');
        if (kind === 'cobble') { rect(x + 1, y + 1, 5, 1, '#b1b1aa'); rect(x + 6, y + 1, 1, 2, '#555952'); }
      }
      for (let i = 0; i < 6; i++) rect(hash(i, y, tile) * 16 | 0, y + 2 + i % 2, 2, 1, i % 2 ? '#ffffff10' : '#00000015');
    }
  } else if (kind === 'bark') {
    rect(0, 0, 16, 16, base);
    for (let x = 0; x < 16; x += 3) {
      rect(x, 0, 1, 16, '#00000045'); rect(x + 1, 0, 1, 16, '#ffffff14');
      for (let y = 0; y < 16; y += 4) rect(x + 1, y + (x % 3), 2, 2, '#00000024');
    }
  } else if (kind === 'birch') {
    noise(['#d5d3c1', '#dcdacc', '#c9c8b8', '#e5e3d3']);
    for (const [x, y, w] of [[1, 2, 4], [10, 4, 5], [4, 8, 3], [0, 12, 3], [9, 14, 5]]) { rect(x, y, w, 1, '#46453e'); rect(x + 1, y + 1, w - 1, 1, '#77756c'); }
  } else if (kind === 'log_top') {
    rect(0, 0, 16, 16, '#584127'); rect(1, 1, 14, 14, base);
    for (let i = 2; i <= 6; i += 2) {
      rect(i, i, 16 - 2 * i, 1, '#805d35'); rect(i, 15 - i, 16 - 2 * i, 1, '#805d35');
      rect(i, i, 1, 16 - 2 * i, '#805d35'); rect(15 - i, i, 1, 16 - 2 * i, '#805d35');
    }
    rect(7, 7, 2, 2, '#8d673b');
  } else if (kind === 'leaves') {
    rect(0, 0, 16, 16, base);
    for (let i = 0; i < 48; i++) {
      const x = hash(i, 4, tile) * 16 | 0, y = hash(i, 5, tile) * 16 | 0;
      rect(x, y, 2, 2, i % 3 ? '#00000030' : '#b7d87865'); rect(x, y, 1, 1, '#1e49273d');
    }
  } else if (kind === 'sand') noise(['#d8cc99', '#dfd3a3', '#e5dbae', '#d3c690', '#dbcf9a']);
  else if (kind === 'snow') noise(['#eef4f5', '#e8eff2', '#e1e9ee', '#f4f7f8']);
  else if (kind === 'glass') {
    g.clearRect(0, 0, 16, 16); rect(0, 0, 16, 16, '#b6def021');
    for (const y of [0, 15]) rect(0, y, 16, 1, '#bedce7');
    for (const x of [0, 15]) rect(x, 0, 1, 16, '#bedce7');
    for (let i = 0; i < 4; i++) rect(3 + i, 9 - i, 1, 2, '#e9faffb0');
    rect(10, 11, 2, 1, '#e9faffb0');
  } else if (kind === 'furnace') {
    rect(0, 0, 16, 1, '#555'); rect(0, 15, 16, 1, '#555');
    rect(3, 3, 10, 3, '#303030'); rect(2, 9, 12, 5, '#424242'); rect(3, 10, 10, 3, '#1e1e1e'); rect(4, 13, 8, 1, '#9a9a94');
  } else if (kind === 'table_top') {
    rect(0, 0, 16, 16, '#a27944'); rect(1, 1, 14, 14, '#684a2e');
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) { rect(2 + x * 4, 2 + y * 4, 3, 3, '#b48d57'); rect(2 + x * 4, 2 + y * 4, 3, 1, '#c59c65'); }
  } else if (kind === 'table_side') {
    rect(0, 0, 16, 16, '#ac8450'); rect(0, 0, 16, 3, '#69482d');
    rect(1, 3, 2, 13, '#62462f'); rect(13, 3, 2, 13, '#62462f'); rect(5, 5, 2, 8, '#5a4530'); rect(4, 4, 5, 2, '#a7a7a0'); rect(10, 6, 2, 7, '#866236');
  } else if (kind === 'bedrock') noise(['#353535', '#555555', '#777777', '#484848', '#90908a'], tile, 2);
  else if (kind === 'obsidian') noise(['#191526', '#211b32', '#2a2340', '#352c49', '#1e1a2c'], tile, 2);
  else if (kind === 'wool') {
    rect(0, 0, 16, 16, base);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x + y) % 3 === 0) rect(x, y, 1, 1, '#ffffff18');
  } else if (kind === 'metal') {
    rect(0, 0, 16, 16, base); rect(0, 0, 16, 1, '#ffffff88'); rect(0, 0, 1, 16, '#ffffff55');
    rect(15, 0, 1, 16, '#00000044'); rect(0, 15, 16, 1, '#00000055'); rect(2, 2, 12, 1, '#ffffff33');
  } else if (kind === 'mineral') {
    rect(0, 0, 16, 16, base);
    for (let i = 0; i < 48; i++) rect(hash(i, tile, 9) * 16 | 0, hash(i, tile, 10) * 16 | 0, 2, 1, i % 2 ? '#ffffff1a' : '#00000025');
  }
  finish();
}

export function installVoxelArt(view) {
  const atlas = view.atlas;
  for (const [tile, kind, color, accent] of [
    [0, 'grass'], [1, 'grass_side'], [2, 'dirt'], [3, 'stone'], [4, 'sand'],
    [5, 'bark', '#795b36'], [6, 'log_top', '#b99660'], [7, 'leaves', '#477e36'],
    [8, 'planks', '#b18c54'], [9, 'bricks', '#a45b47'], [10, 'glass'], [11, 'cobble', '#82847e'],
    [12, 'snow'], [13, 'ore', '#bc9377', '#e0bca0'], [14, 'bedrock'],
    [15, 'ore', '#32bbae', '#91f4e5'], [16, 'ore', '#303030', '#555555'],
    [17, 'table_top'], [18, 'table_side'], [19, 'furnace'], [20, 'stone'], [22, 'wool', '#deded7'],
    [28, 'ore', '#dda92e', '#ffe177'], [29, 'metal', '#e9c341'], [30, 'metal', '#cfd3d1'],
    [31, 'metal', '#47cfc1'], [32, 'obsidian'],
  ]) paint(atlas, tile, kind, color, accent);

  for (const [id, block] of BLOCKS) {
    let kind = null, color = block.color, accent;
    if (/ore/.test(block.key)) { kind = 'ore'; [color, accent] = ({44: ['#d9cabb', '#fff2dd'], 55: ['#b52e23', '#f85332'], 56: ['#2c53a3', '#7394ec'], 57: ['#289853', '#70ed94'], 115: ['#b57851', '#59b28e']})[id] || [color, '#eee']; }
    else if (/planks|oak_slab|oak_stairs/.test(block.key)) kind = 'planks';
    else if (/bricks|purpur/.test(block.key)) kind = 'bricks';
    else if (/leaves/.test(block.key)) kind = 'leaves';
    else if (/log/.test(block.key)) kind = id === 98 ? 'birch' : 'bark';
    else if (/wool/.test(block.key)) kind = 'wool';
    else if (/copper_block|netherite_block/.test(block.key)) kind = 'metal';
    else if (/stone_slab|smooth_stone/.test(block.key)) kind = 'stone';
    else if (/cobble_stairs/.test(block.key)) kind = 'cobble';
    else if (/deepslate|basalt|netherrack|blackstone|end_stone|granite|diorite|andesite|calcite/.test(block.key)) kind = 'mineral';
    if (kind) paint(atlas, TILES.get(id), kind, color, accent);
  }
  paint(atlas, 180, 'log_top', '#a38458');
  paint(atlas, 181, 'log_top', '#d7c48e');
  const previous = globalThis.__carbonTile;
  globalThis.__carbonTile = (id, face) => (id === 95 || id === 98) && (face === 2 || face === 3) ? (id === 95 ? 180 : 181) : previous?.(id, face);
  for (const material of [view.material, view.glassMat, view.held?.material].flat()) if (material?.map) {
    material.map.magFilter = material.map.minFilter = Nearest;
    material.map.generateMipmaps = false; material.map.needsUpdate = true;
  }
}
