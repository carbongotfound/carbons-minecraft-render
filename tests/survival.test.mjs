import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/src/survival-data.js';
import {ITEMS, Inventory, RECIPES, patternFor, matchRecipe, craft} from '../public/src/core.js';
import {restoreNutrition, eatFood, spendExhaustion, tickNutrition} from '../public/src/nutrition.js';
import {CONTRACTS, restoreProgress, deliverContract} from '../public/src/progression-data.js';

test('old saves receive five saturation, capped by hunger; malformed saves stay finite', () => {
  assert.deepEqual(restoreNutrition({hunger: 3}), {hunger: 3, saturation: 3, exhaustion: 0});
  assert.equal(restoreNutrition({hunger: 0, saturation: 8}).saturation, 0);
  assert.deepEqual(restoreNutrition({hunger: 'bad', saturation: Infinity, exhaustion: -10}), {hunger: 20, saturation: 5, exhaustion: 0});
  assert.deepEqual(restoreNutrition({hunger: 17, saturation: 2.4, exhaustion: 3.9}), {hunger: 17, saturation: 2.4, exhaustion: 3.9});
});
test('exhaustion uses saturation before hunger, including a fractional last point', () => {
  const p = {hunger: 20, saturation: .4, exhaustion: 8.3};
  assert.equal(spendExhaustion(p), true);
  assert.equal(p.hunger, 19); assert.equal(p.saturation, 0); assert.ok(Math.abs(p.exhaustion - .3) < 1e-9);
});
test('cooked food lasts longer; golden carrots are edible', () => {
  const p = {hunger: 10, saturation: 0};
  assert.equal(eatFood(p, ITEMS.steak), true);
  assert.deepEqual(p, {hunger: 18, saturation: 12.8});
  assert.equal(ITEMS.golden_carrot.food, 6);
  assert.equal(ITEMS.golden_carrot.saturation, 14.4);
  for (const food of Object.values(ITEMS).filter(i => i.food)) assert.ok(Number.isFinite(food.saturation), `${food.name} has nutrition`);
});
test('saturation caps at hunger and normal food cannot be eaten when full', () => {
  const p = {hunger: 19, saturation: 18}; eatFood(p, ITEMS.steak);
  assert.deepEqual(p, {hunger: 20, saturation: 20});
  assert.equal(eatFood(p, ITEMS.bread), false);
  assert.equal(eatFood(p, ITEMS.golden_apple), true);
});
test('fast healing consumes food energy and never exceeds maximum health', () => {
  const p = {hunger: 20, saturation: 6, exhaustion: 0, health: 19.75};
  tickNutrition(p, .5);
  assert.equal(p.health, 20); assert.equal(p.exhaustion, 1.5);
  tickNutrition(p, 50); assert.equal(p.health, 20);
});
test('slow healing needs eight seconds and starvation preserves the existing one-health floor', () => {
  const p = {hunger: 18, saturation: 0, exhaustion: 0, health: 16};
  tickNutrition(p, 7.9); assert.equal(p.health, 16);
  tickNutrition(p, .1); assert.equal(p.health, 17); assert.equal(p.hunger, 17);
  const starving = {hunger: 0, saturation: 0, exhaustion: 0, health: 2};
  tickNutrition(starving, 8, amount => starving.health -= amount); assert.equal(starving.health, 1);
  tickNutrition(starving, 8, () => assert.fail('must not starve below 1'));
});
test('switching healing modes resets the timer', () => {
  const p = {hunger: 18, saturation: 0, exhaustion: 0, health: 16}; tickNutrition(p, 7);
  p.hunger = 20; p.saturation = 6; tickNutrition(p, .1); assert.equal(p.health, 16);
});
test('oak, spruce and birch logs yield their own planks in a hand grid', () => {
  for (const [id, out] of [['log', 'planks'], ['spruce_log', 'spruce_planks'], ['birch_log', 'birch_planks']])
    assert.equal(matchRecipe([{id, count: 1}, null, null, null], 2)?.out, out);
});
test('all added recipes match their real grid and consume ingredients', () => {
  for (const r of RECIPES.slice(-12)) {
    const grid = Array(9).fill(null);
    for (const [y, row] of patternFor(r).entries()) for (const [x, id] of row.entries()) if (id) grid[y * 3 + x] = {id, count: 1};
    assert.equal(matchRecipe(grid, 3)?.out, r.out, r.out);
    const inv = new Inventory(); for (const [id, n] of Object.entries(r.need)) inv.add(id, n);
    assert.equal(craft(inv, r, true), true); assert.equal(inv.count(r.out), r.n);
  }
});
test('mixed wood remains valid for tools', () => {
  const r = RECIPES.find(r => r.out === 'wooden_pickaxe');
  const inv = new Inventory(); inv.add('spruce_planks', 1); inv.add('birch_planks', 2); inv.add('stick', 2);
  assert.equal(craft(inv, r, true), true); assert.equal(inv.count('wooden_pickaxe'), 1);
});
test('village requests reference existing supplies and rewards', () => {
  for (const c of CONTRACTS) for (const id of [...Object.keys(c.needs), ...Object.keys(c.rewards)]) assert.ok(ITEMS[id], id);
});
test('old goal data is discarded while completed deliveries are preserved', () => {
  assert.deepEqual(restoreProgress({seen:{log:3},completed:{wood:1},claimed:{wood:1},pinned:'stone',contracts:{timber:1}}), {contracts:{timber:1}});
});
test('contracts require supplies and award only once across reloads', () => {
  const state = restoreProgress(), inv = new Inventory(); inv.add('log', 16); inv.add('cobble', 32);
  assert.deepEqual(deliverContract(state, inv, 'timber'), {ok: true, xp: 8});
  assert.equal(inv.count('log'), 0); assert.equal(inv.count('emerald'), 3); assert.equal(inv.count('bread'), 4);
  assert.equal(deliverContract(restoreProgress(JSON.parse(JSON.stringify(state))), inv, 'timber').ok, false);
});
test('a full inventory never loses contract supplies or the reward', () => {
  const state = restoreProgress();
  const inv = new Inventory(); inv.add('log', 64); inv.add('cobble', 64); inv.add('dirt', 34 * 64);
  const before = JSON.stringify(inv.slots);
  assert.equal(deliverContract(state, inv, 'timber').ok, false);
  assert.equal(JSON.stringify(inv.slots), before); assert.equal(state.contracts.timber, undefined);
});
test('missing supplies never partially consume a contract', () => {
  const state = restoreProgress();
  const inv = new Inventory(); inv.add('log', 16);
  assert.equal(deliverContract(state, inv, 'timber').ok, false); assert.equal(inv.count('log'), 16);
});
