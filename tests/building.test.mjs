import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILDING_BLOCKS, MAX_BLOCK_ID, PALETTE, DAYLIGHT_SENSOR, NIGHT_SENSOR, SLABS, recipeInCategory} from '../public/src/building-data.js';
import {ITEMS, RECIPES, Inventory, patternFor, matchRecipe, craft} from '../public/src/core.js';
import {B, TILES, blockShape, CARDINAL, keyOf} from '../public/src/expansion-data.js';
import {CIRCUIT_IDS, solveCircuit, pistonEdits} from '../public/src/circuits.js';
import {PROJECTS} from '../public/src/build-book.js';

test('50 craftable blocks and the sensor state fit in the world and texture atlas', () => {
  assert.equal(BUILDING_BLOCKS.length, 51);
  assert.equal(MAX_BLOCK_ID, 195);
  assert.equal(new Set(BUILDING_BLOCKS.map(b => b.id)).size, 51);
  for (const b of BUILDING_BLOCKS) {
    assert.ok(b.id >= 145 && b.id < 256);
    assert.ok(TILES.get(b.id) < 254);
    assert.ok(ITEMS[b.drop]);
  }
  for (const color of Object.keys(PALETTE)) assert.ok(ITEMS[color + '_concrete']);
  assert.equal(new Set(BUILDING_BLOCKS.map(b => TILES.get(b.id))).size, 51);
  assert.equal(SLABS.size, 9);
  for (const id of SLABS) assert.deepEqual(blockShape(id), [0, 0, 0, 1, .5, 1]);
});

test('every new recipe matches the real grid, consumes supplies, and survives inventory reload', () => {
  const recipes = RECIPES.filter(r => ITEMS[r.out].block >= 145 || r.out.endsWith('_dye'));
  for (const r of recipes) {
    const grid = Array(9).fill(null), pattern = patternFor(r);
    for (let y = 0; y < pattern.length; y++) for (let x = 0; x < pattern[y].length; x++)
      if (pattern[y][x]) grid[y * 3 + x] = {id: pattern[y][x], count: 1};
    assert.equal(matchRecipe(grid, 3)?.out, r.out, r.out);
    const inv = new Inventory(); for (const [id, n] of Object.entries(r.need)) inv.add(id, n);
    assert.equal(craft(inv, r, true), true, r.out);
    assert.equal(new Inventory(JSON.parse(JSON.stringify(inv.slots))).count(r.out), r.n, r.out);
  }
});

test('matching wood makes matching slabs, while mixed planks still make generic recipes', () => {
  for (const [wood, result] of [['planks', 'oak_slab'], ['spruce_planks', 'spruce_slab'], ['birch_planks', 'birch_slab']])
    assert.equal(matchRecipe([{id: wood}, {id: wood}, {id: wood}, ...Array(6).fill(null)], 3)?.out, result);
  assert.equal(matchRecipe([{id: 'spruce_planks'}, {id: 'birch_planks'}, {id: 'planks'}, {id: 'planks'}], 2)?.out, 'table');
});

test('build projects and category filters use obtainable game items', () => {
  for (const p of PROJECTS) for (const id of Object.keys(p.materials)) {
    assert.ok(ITEMS[id], id);
    assert.ok(RECIPES.some(r => r.out === id) || ['redstone', 'stone'].includes(id), id);
  }
  assert.ok(recipeInCategory(RECIPES.find(r => r.out === 'daylight_sensor'), 'redstone'));
  assert.ok(recipeInCategory(RECIPES.find(r => r.out === 'flint_and_steel'), 'tools'));
  assert.ok(!recipeInCategory(RECIPES.find(r => r.out === 'white_concrete'), 'food'));
});

function circuit(cells, metas = {}) {
  const blocks = new Map(cells.map(([x, y, z, b]) => [keyOf(x, y, z), b]));
  return {get: (x, y, z) => blocks.get(keyOf(x, y, z)) || 0, metadata: k => metas[k] || {}, nodes: new Set([...blocks].filter(([, b]) => CIRCUIT_IDS.has(b)).map(([k]) => k))};
}
test('day and night sensors control a lamp through dust with proportional power', () => {
  for (const [sensor, light, expected] of [[DAYLIGHT_SENSOR, 15, 14], [DAYLIGHT_SENSOR, 0, 0], [NIGHT_SENSOR, 15, 0], [NIGHT_SENSOR, 0, 14], [DAYLIGHT_SENSOR, 6, 5]]) {
    const c = circuit([[0, 10, 0, sensor], [1, 10, 0, B.WIRE], [2, 10, 0, B.WIRE], [3, 10, 0, B.LAMP]]);
    const s = solveCircuit(c.nodes, c.get, c.metadata, [], 0, new Map(), new Map(), () => light);
    assert.equal(s.outputs.get('3,10,0'), expected);
  }
});
test('a pressure plate opens the adjacent door only while occupied', () => {
  const c = circuit([[0, 10, 0, B.PLATE], [1, 10, 0, B.IRON_DOOR]]);
  assert.equal(solveCircuit(c.nodes, c.get, c.metadata, [{x: .5, y: 10, z: .5}], 0).outputs.get('1,10,0'), 15);
  assert.equal(solveCircuit(c.nodes, c.get, c.metadata, [], 0).outputs.get('1,10,0'), 0);
});
test('repeaters wait for their delay, refresh signals and power only their front', () => {
  const dir = CARDINAL.findIndex(d => d[0] === 1);
  const c = circuit([[-1, 10, 0, B.LEVER_ON], [0, 10, 0, B.REPEATER], [1, 10, 0, B.LAMP], [0, 10, 1, B.LAMP]], {'0,10,0': {dir, delay: 2}});
  const memory = new Map(); let previous = new Map();
  for (const now of [0, 199, 200, 201]) {
    const s = solveCircuit(c.nodes, c.get, c.metadata, [], now, previous, memory);
    assert.equal(s.outputs.get('1,10,0'), now === 201 ? 15 : 0);
    assert.equal(s.outputs.get('0,10,1'), 0); previous = s.powers;
  }
  const off = circuit([[0, 10, 0, B.REPEATER], [1, 10, 0, B.LAMP], [-1, 10, 0, B.LAMP]], {'0,10,0': {dir, delay: 2}});
  assert.equal(solveCircuit(off.nodes, off.get, off.metadata, [], 202, previous, memory).outputs.get('-1,10,0'), 0);
  solveCircuit(off.nodes, off.get, off.metadata, [], 402, previous, memory);
  assert.equal(solveCircuit(off.nodes, off.get, off.metadata, [], 403, previous, memory).outputs.get('1,10,0'), 0);
});
test('pistons work beyond the old spawn area, move up to 12 blocks and respect world edges', () => {
  const dir = CARDINAL.findIndex(d => d[0] === 1);
  const c = circuit([[301, 20, 0, 145]], {'301,20,0': {dir: 2}});
  const edits = pistonEdits(300, 20, 0, B.PISTON, dir, true, c.get, c.metadata);
  assert.deepEqual(edits[0], {x: 302, y: 20, z: 0, block: 145, meta: {dir: 2}});
  assert.equal(pistonEdits(511, 20, 0, B.PISTON, dir, true, () => 0, () => ({})).length, 0);
  for (const [length, works] of [[12, true], [13, false]]) {
    const line = circuit(Array.from({length}, (_, i) => [i + 1, 20, 0, 145]));
    assert.equal(pistonEdits(0, 20, 0, B.PISTON, dir, true, line.get, line.metadata).length > 0, works);
  }
});
test('sticky pistons retract ordinary blocks without pulling portals or containers', () => {
  const dir = CARDINAL.findIndex(d => d[0] === 1);
  for (const block of [145, 22, B.END_EXIT, B.END_FRAME]) {
    const c = circuit([[1, 20, 0, B.PISTON_HEAD], [2, 20, 0, block]]);
    const edits = pistonEdits(0, 20, 0, B.STICKY_EXTENDED, dir, false, c.get, c.metadata);
    assert.equal(edits[1].block, block === 145 ? 145 : 0);
    assert.equal(edits.length, block === 145 ? 3 : 2);
  }
});
