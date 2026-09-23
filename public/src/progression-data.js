export const CONTRACTS = [
  {id: 'timber', title: 'Village construction', needs: {log: 16, cobble: 32}, rewards: {emerald: 3, bread: 4}, xp: 8},
  {id: 'harvest', title: 'Feed the village', needs: {wheat: 24, carrot: 12}, rewards: {emerald: 5, potato: 4}, xp: 12},
  {id: 'masonry', title: 'Restore the watchtower', needs: {stone_bricks: 32, glass: 16}, rewards: {emerald: 6, lapis: 6}, xp: 15},
  {id: 'engineering', title: 'An engineer’s workshop', needs: {copper: 16, iron: 8, redstone: 16}, rewards: {emerald: 10, diamond: 2}, xp: 20},
  {id: 'library', title: 'Expand the library', needs: {book: 8, paper: 24}, rewards: {emerald: 8, lapis: 12}, xp: 25},
  {id: 'nether_supplies', title: 'Supplies from another world', needs: {quartz: 24, glowstone_dust: 16, blaze_rod: 4}, rewards: {emerald: 16, diamond: 3}, xp: 30},
];

const cleanCounts = values => Object.fromEntries(Object.entries(values && typeof values === 'object' ? values : {})
  .filter(([, value]) => Number.isFinite(value) && value > 0).map(([key, value]) => [key, Math.min(1000000, Math.floor(value))]));
export function restoreProgress(saved = {}) {
  if (!saved || typeof saved !== 'object') saved = {};
  return {contracts: cleanCounts(saved.contracts)};
}

// Transactions operate on a clone so full inventories never lose supplies.
export function deliverContract(state, inv, id) {
  const contract = CONTRACTS.find(c => c.id === id);
  if (!contract || state.contracts[id]) return {ok: false, reason: 'This request is unavailable or already delivered.'};
  const copy = inv.clone();
  for (const [item, count] of Object.entries(contract.needs)) if (!copy.remove(item, count)) return {ok: false, reason: 'Gather all the requested supplies first.'};
  for (const [item, count] of Object.entries(contract.rewards)) if (copy.add(item, count)) return {ok: false, reason: 'Make room for the rewards first.'};
  inv.slots = copy.slots;
  state.contracts[id] = 1;
  return {ok: true, xp: contract.xp};
}
