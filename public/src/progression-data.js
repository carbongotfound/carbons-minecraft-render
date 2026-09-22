// Goals record real inventory, crafting, eating and existing world achievements.
const own = (id, count = 1) => ({kind: 'seen', id, count});
const event = id => ({kind: 'advancement', id, count: 1});
const goal = (id, chapter, title, hint, xp, requirements) => ({id, chapter, title, hint, xp, requirements});
export const GOALS = [
  goal('wood', 'First night', 'Punch a tree', 'Hold left click on an oak, birch or spruce trunk. Collect a log.', 2, [own('log')]),
  goal('workbench', 'First night', 'Your first workbench', 'Press E. Turn logs into planks, then use four planks to craft a table.', 3, [own('table')]),
  goal('wood_tools', 'First night', 'Tools of the trade', 'Place the table and right-click it. Craft a wooden pickaxe from three planks and two sticks.', 3, [own('wooden_pickaxe')]),
  goal('stone', 'First night', 'Stone age', 'Mine stone with a pickaxe. Use three cobblestone and two sticks for a stone pickaxe.', 5, [own('stone_pickaxe')]),
  goal('light', 'First night', 'Light the way', 'Craft four torches from coal or charcoal and a stick. Place them around your shelter.', 3, [own('torch', 4)]),
  goal('furnace', 'First night', 'Fire it up', 'Make a furnace with eight cobblestone. Place it to cook food and smelt ore.', 5, [own('furnace')]),
  goal('bed', 'First night', 'A place to call home', 'Gather three wool and three planks, craft a bed, then place it to set your spawn.', 5, [own('bed')]),
  goal('iron', 'Below the surface', 'Acquire hardware', 'Mine iron ore with a stone pickaxe. Smelt raw iron in a furnace with fuel.', 7, [own('iron')]),
  goal('iron_tools', 'Below the surface', 'An iron edge', 'Craft an iron pickaxe. It can harvest diamond and redstone ore.', 7, [own('iron_pickaxe')]),
  goal('armor', 'Below the surface', 'Suit up', 'Craft an iron chestplate from eight iron ingots. Equip it in your inventory.', 8, [own('iron_chestplate')]),
  goal('diamond', 'Below the surface', 'Diamonds!', 'Explore below Y 18. Diamond ore needs an iron pickaxe or better.', 12, [own('diamond')]),
  goal('diamond_tools', 'Below the surface', 'Ready for obsidian', 'Craft a diamond pickaxe from three diamonds and two sticks.', 12, [own('diamond_pickaxe')]),
  goal('farm', 'A lasting home', 'Sow the seeds', 'Break grass for seeds. Craft a stone hoe, till soil near water and plant wheat.', 5, [own('stone_hoe'), own('seeds')]),
  goal('bread', 'A lasting home', 'Daily bread', 'Harvest ripe wheat and craft bread from three wheat in a row.', 8, [own('bread')]),
  goal('meal', 'A lasting home', 'A proper meal', 'Cook beef in a furnace, then eat a steak when hungry. Cooked food gives more saturation.', 8, [{kind: 'eaten', id: 'steak', count: 1}]),
  goal('garden', 'A lasting home', 'Market garden', 'Get carrots and potatoes from village farms or farmer trades. Plant each on farmland.', 8, [own('carrot'), own('potato')]),
  goal('builder', 'A lasting home', 'A better base', 'Craft a chest, a door and 16 stone bricks for a permanent home.', 10, [own('chest'), own('door'), own('stone_bricks', 16)]),
  goal('pantry', 'A lasting home', 'Stock the pantry', 'Craft cookies from wheat and sugar. Sugar comes from sugar cane.', 6, [own('cookie', 8)]),
  goal('angler', 'A lasting home', 'Gone fishing', 'Craft a fishing rod with sticks and string, then right-click water.', 8, [event('fish')]),
  goal('golden_food', 'A lasting home', 'Fuel for an expedition', 'Craft a golden carrot from a carrot and gold. It restores 14.4 saturation.', 10, [own('golden_carrot')]),
  goal('redstone', 'Make it work', 'A spark of an idea', 'Mine redstone with an iron pickaxe. Craft a lever and use it to power a circuit.', 10, [event('redstone')]),
  goal('piston', 'Make it work', 'Moving blocks', 'Craft a piston from planks, cobblestone, iron and redstone. Power it with a lever.', 10, [own('piston')]),
  goal('hopper', 'Make it work', 'Move your supplies', 'Craft a hopper from five iron and a chest. Place it above a chest to transfer items.', 10, [own('hopper')]),
  goal('railway', 'Make it work', 'Ride the rails', 'Craft 16 rails and a minecart. Lay track, place the cart and right-click to ride.', 12, [own('rail', 16), own('minecart')]),
  goal('enchant', 'Beyond diamonds', 'A little extra', 'Craft an enchanting table. Bring lapis, a tool and XP. Bookshelves unlock stronger enchantments.', 15, [event('enchant')]),
  goal('portal', 'Beyond diamonds', 'A different sky', 'Build a 4 by 5 obsidian frame with a 2 by 3 opening. Light it with flint and steel.', 15, [event('portal')]),
  goal('nether', 'Beyond diamonds', 'Into the Nether', 'Step into your lit portal. Bring food, spare tools and armor.', 15, [event('nether')]),
  goal('blaze', 'Beyond diamonds', 'Fortress supplies', 'Visit the Nether fortress at X 42, Z -40. Defeat blazes to collect rods.', 15, [own('blaze_rod')]),
  goal('brew', 'Beyond diamonds', 'A useful bottle', 'Use a brewing stand with water bottles, Nether wart and blaze powder. Collect a finished potion.', 15, [event('brew')]),
  goal('netherite', 'Beyond diamonds', 'Ancient technology', 'Mine ancient debris with a diamond pickaxe. Smelt it, combine four scraps with four gold, and upgrade diamond gear at a smithing table.', 25, [{kind: 'family', id: 'netherite_', count: 1}]),
  goal('eyes', 'The End', 'The way forward', 'Combine ender pearls with blaze powder. Bring 12 Eyes of Ender to the stronghold at X 78, Z 74.', 15, [own('eye_of_ender', 12)]),
  goal('end', 'The End', 'Enter the End', 'Fill all twelve stronghold portal frames with Eyes of Ender, then enter.', 20, [event('end')]),
  goal('crystal', 'The End', 'Break the connection', 'Destroy the crystals on the obsidian pillars so the dragon cannot heal.', 20, [event('crystal')]),
  goal('dragon', 'The End', 'Free the End', 'Defeat the dragon. Prepare armor, a bow, arrows and plenty of food.', 50, [event('dragon')]),
];

export const CONTRACTS = [
  {id: 'timber', title: 'Village construction', unlock: 'workbench', needs: {log: 16, cobble: 32}, rewards: {emerald: 3, bread: 4}, xp: 8},
  {id: 'harvest', title: 'Feed the village', unlock: 'bread', needs: {wheat: 24, carrot: 12}, rewards: {emerald: 5, potato: 4}, xp: 12},
  {id: 'masonry', title: 'Restore the watchtower', unlock: 'iron', needs: {stone_bricks: 32, glass: 16}, rewards: {emerald: 6, lapis: 6}, xp: 15},
  {id: 'engineering', title: 'An engineer’s workshop', unlock: 'piston', needs: {copper: 16, iron: 8, redstone: 16}, rewards: {emerald: 10, diamond: 2}, xp: 20},
  {id: 'library', title: 'Expand the library', unlock: 'enchant', needs: {book: 8, paper: 24}, rewards: {emerald: 8, lapis: 12}, xp: 25},
  {id: 'nether_supplies', title: 'Supplies from another world', unlock: 'nether', needs: {quartz: 24, glowstone_dust: 16, blaze_rod: 4}, rewards: {emerald: 16, diamond: 3}, xp: 30},
];

const cleanCounts = values => Object.fromEntries(Object.entries(values && typeof values === 'object' ? values : {})
  .filter(([, value]) => Number.isFinite(value) && value > 0).map(([key, value]) => [key, Math.min(1000000, Math.floor(value))]));
export function restoreProgress(saved = {}) {
  if (!saved || typeof saved !== 'object') saved = {};
  return {seen: cleanCounts(saved.seen), crafted: cleanCounts(saved.crafted), eaten: cleanCounts(saved.eaten),
    completed: cleanCounts(saved.completed), claimed: cleanCounts(saved.claimed), contracts: cleanCounts(saved.contracts),
    pinned: GOALS.some(g => g.id === saved.pinned) ? saved.pinned : null};
}

export function requirementValue(state, req, advancements = {}) {
  if (req.kind === 'advancement') return advancements[req.id] ? 1 : 0;
  if (req.kind === 'family') return Object.entries(state.seen).some(([id, count]) => count > 0 && id.startsWith(req.id) && /_(pickaxe|axe|shovel|sword|hoe|helmet|chestplate|leggings|boots)(_|$)/.test(id)) ? 1 : 0;
  return state[req.kind]?.[req.id] || 0;
}
export function completeGoals(state, advancements = {}) {
  const completed = [];
  for (const goal of GOALS) if (!state.completed[goal.id] && goal.requirements.every(req => requirementValue(state, req, advancements) >= req.count)) {
    state.completed[goal.id] = 1;
    completed.push(goal);
  }
  return completed;
}

export function claimGoal(state, id) {
  const goal = GOALS.find(g => g.id === id);
  if (!goal || !state.completed[id] || state.claimed[id]) return 0;
  state.claimed[id] = 1;
  return goal.xp;
}

// Transactions operate on a clone so full inventories never lose supplies.
export function deliverContract(state, inv, id) {
  const contract = CONTRACTS.find(c => c.id === id);
  if (!contract || state.contracts[id] || !state.completed[contract.unlock]) return {ok: false, reason: 'This request is locked or already delivered.'};
  const copy = inv.clone();
  for (const [item, count] of Object.entries(contract.needs)) if (!copy.remove(item, count)) return {ok: false, reason: 'Gather all the requested supplies first.'};
  for (const [item, count] of Object.entries(contract.rewards)) if (copy.add(item, count)) return {ok: false, reason: 'Make room for the rewards first.'};
  inv.slots = copy.slots;
  state.contracts[id] = 1;
  return {ok: true, xp: contract.xp};
}
