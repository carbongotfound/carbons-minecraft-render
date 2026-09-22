import './frontier-data.js';
import {ITEMS, SMELTING} from './core.js';
import {recipe} from './expansion-data.js';

ITEMS.raw_porkchop ??= {name: 'Raw porkchop', food: 3};
ITEMS.cooked_porkchop ??= {name: 'Cooked porkchop', food: 8};
SMELTING.raw_porkchop = 'cooked_porkchop';

// Values are total saturation restored, capped at the player's food level.
const saturation = {
  apple: 2.4, raw_beef: 1.8, steak: 12.8, raw_mutton: 1.2, cooked_mutton: 9.6,
  raw_porkchop: 1.8, cooked_porkchop: 12.8, rotten_flesh: .8, bread: 6,
  raw_chicken: 1.2, cooked_chicken: 7.2, golden_apple: 9.6, golden_carrot: 14.4,
  melon_slice: 1.2, baked_potato: 6, raw_cod: .4, cooked_cod: 6,
  cookie: .4, mushroom_stew: 7.2, carrot: 3.6, potato: .6, beetroot: 1.2,
};
ITEMS.golden_carrot.food = 6;
for (const [id, value] of Object.entries(saturation)) ITEMS[id].saturation = value;

// Recipes use items supported by the existing shared-world inventory.
// Biscuits use sugar here because this world has no cocoa crop.
recipe('cookie', 8, [['wheat', 'sugar', 'wheat']]);
recipe('mossy_bricks', 1, [['stone_bricks', 'leaves']]);
recipe('chiseled_bricks', 1, [['stone_slab'], ['stone_slab']]);
recipe('packed_ice', 1, Array.from({length: 3}, () => ['ice', 'ice', 'ice']));
recipe('clay', 1, [['clay_ball', 'clay_ball'], ['clay_ball', 'clay_ball']]);
recipe('snow', 1, [['snowball', 'snowball'], ['snowball', 'snowball']]);
recipe('melon', 1, Array.from({length: 3}, () => ['melon_slice', 'melon_slice', 'melon_slice']));
recipe('magma_block', 1, [['magma_cream', 'magma_cream'], ['magma_cream', 'magma_cream']]);
recipe('diorite', 2, [['cobble', 'quartz'], ['quartz', 'cobble']]);
recipe('granite', 1, [['diorite', 'quartz']]);
recipe('andesite', 2, [['diorite', 'cobble']]);
recipe('campfire', 1, [[null, 'stick', null], ['stick', 'charcoal', 'stick'], ['log', 'log', 'log']]);

export const SURVIVAL_RECIPE_COUNT = 12;
