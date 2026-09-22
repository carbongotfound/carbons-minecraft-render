import './frontier-data.js';
import {ITEMS, BLOCK_ITEMS, FUEL} from './core.js';
import {BLOCKS, TILES, recipe} from './expansion-data.js';
import {EXTRA_BLOCKS} from './extra-data.js';

export const PALETTE = {
  white: '#dbded5', orange: '#df7826', magenta: '#b842ae', light_blue: '#55a7ca',
  yellow: '#e8c235', lime: '#78b438', pink: '#d984a2', gray: '#454b4e',
  light_gray: '#979a91', cyan: '#248993', purple: '#753aa5', blue: '#354b9b',
  brown: '#785237', green: '#536b2b', red: '#a8372c', black: '#24282b',
};
const label = s => s.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
export const BUILDING_BLOCKS = [];
let nextId = 145;
function block(key, color, style, options = {}) {
  const id = nextId++;
  const def = {id, key, name: label(key), color, style, hardness: 1.8, tool: 'pickaxe', tier: 1, drop: key, ...options};
  BLOCKS.set(id, def); TILES.set(id, id + 24); EXTRA_BLOCKS[id] = {name: def.name, color, item: key};
  ITEMS[key] = {name: def.name, block: id, tile: id + 24}; BLOCK_ITEMS[id] = key;
  BUILDING_BLOCKS.push(def); return id;
}
for (const [color, hex] of Object.entries(PALETTE)) {
  ITEMS[color + '_dye'] ??= {name: label(color + '_dye')};
  block(color + '_concrete', hex, 'concrete');
  recipe(color + '_concrete', 8, [['sand', 'sand', 'gravel'], ['sand', color + '_dye', 'gravel'], ['sand', 'gravel', 'gravel']]);
}
for (const [color, hex] of Object.entries(PALETTE)) if (!['white', 'red', 'blue'].includes(color)) {
  block(color + '_wool', hex, 'wool', {tool: null, tier: 0, hardness: .8});
  recipe(color + '_wool', 1, [['wool', color + '_dye']]);
}
for (const [key, color, style, resource] of [
  ['quartz_block', '#e2ded1', 'quartz', 'quartz'],
  ['chiseled_quartz', '#d9d5c9', 'chiseled', 'quartz_block'],
  ['quartz_pillar', '#dedad0', 'pillar', 'quartz_block'],
  ['polished_granite', '#a97762', 'polished', 'granite'],
  ['polished_diorite', '#c8c7bd', 'polished', 'diorite'],
  ['polished_andesite', '#8c928b', 'polished', 'andesite'],
  ['smooth_sandstone', '#dbcb96', 'polished', 'sandstone'],
  ['cut_sandstone', '#d1bf89', 'cut', 'sandstone'],
  ['smooth_red_sandstone', '#b57843', 'polished', 'red_sandstone'],
  ['cut_red_sandstone', '#b17643', 'cut', 'red_sandstone'],
  ['cut_copper', '#be805d', 'cut', 'copper_block'],
]) {
  block(key, color, style);
  if (key === 'quartz_pillar') recipe(key, 2, [[resource], [resource]]);
  else if (key.startsWith('smooth_')) recipe(key, 1, [[resource]]);
  else recipe(key, key === 'quartz_block' ? 1 : 4, [[resource, resource], [resource, resource]]);
}
export const SLABS = new Set();
for (const [key, resource, color, style] of [
  ['spruce_slab', 'spruce_planks', '#775a38', 'planks'],
  ['birch_slab', 'birch_planks', '#c5b077', 'planks'],
  ['stone_brick_slab', 'stone_bricks', '#92958e', 'bricks'],
  ['brick_slab', 'brick', '#a45b47', 'bricks'],
  ['sandstone_slab', 'sandstone', '#d4c591', 'cut'],
  ['red_sandstone_slab', 'red_sandstone', '#b7834c', 'cut'],
  ['quartz_slab', 'quartz_block', '#e2ded1', 'quartz'],
  ['nether_brick_slab', 'nether_bricks', '#432b35', 'bricks'],
  ['deepslate_slab', 'deepslate', '#50535a', 'cut'],
]) {
  const wooden = style === 'planks';
  SLABS.add(block(key, color, style, {tool: wooden ? 'axe' : 'pickaxe', tier: wooden ? 0 : 1, shape: [0, 0, 0, 1, .5, 1]}));
  recipe(key, 6, [[resource, resource, resource]]);
  if (wooden) FUEL[key] = 7;
}
export const DAYLIGHT_SENSOR = block('daylight_sensor', '#ad9774', 'sensor', {tool: 'axe', tier: 0, shape: [0, 0, 0, 1, .375, 1]});
export const NIGHT_SENSOR = block('night_sensor', '#75859d', 'sensor', {tool: 'axe', tier: 0, drop: 'daylight_sensor', shape: [0, 0, 0, 1, .375, 1]});
// The inverted state is toggled in-world, not a second craftable item.
delete ITEMS.night_sensor; BLOCK_ITEMS[NIGHT_SENSOR] = 'daylight_sensor';
recipe('daylight_sensor', 1, [['glass', 'glass', 'glass'], ['quartz', 'quartz', 'quartz'], ['oak_slab', 'oak_slab', 'oak_slab']]);
export const MAX_BLOCK_ID = nextId - 1;

recipe('white_dye', 3, [['bone']]);
recipe('black_dye', 1, [['coal']]);
recipe('green_dye', 1, [['cactus']]);
for (const [color, a, b] of [
  ['orange', 'red', 'yellow'], ['purple', 'red', 'blue'], ['pink', 'red', 'white'],
  ['light_blue', 'blue', 'white'], ['lime', 'green', 'white'], ['cyan', 'green', 'blue'],
  ['gray', 'black', 'white'], ['light_gray', 'gray', 'white'], ['magenta', 'purple', 'pink'],
  ['brown', 'red', 'green'],
]) recipe(color + '_dye', 2, [[a + '_dye', b + '_dye']]);

export const REDSTONE_ITEMS = new Set(['redstone', 'redstone_torch', 'redstone_block', 'redstone_lamp', 'lever', 'button', 'stone_button',
  'pressure_plate', 'repeater', 'piston', 'sticky_piston', 'hopper', 'iron_door', 'rail', 'powered_rail', 'minecart', 'tnt', 'note_block', 'daylight_sensor']);
export function recipeInCategory(recipe, category) {
  const item = ITEMS[recipe.out];
  if (category === 'building') return !!item.block && !item.food && !['seeds', 'sapling', 'sugar_cane', 'redstone'].includes(recipe.out);
  if (category === 'redstone') return REDSTONE_ITEMS.has(recipe.out);
  if (category === 'tools') return !!item.tool || ['flint_and_steel', 'bucket', 'compass', 'clock', 'spyglass', 'fishing_rod'].includes(recipe.out);
  if (category === 'food') return !!item.food;
  if (category === 'colors') return /_dye$|_wool$|_concrete$/.test(recipe.out) || recipe.out === 'wool';
  return true;
}
