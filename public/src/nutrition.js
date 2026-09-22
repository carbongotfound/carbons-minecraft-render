// Food points and saturation are separate: exhaustion spends saturation first.
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function restoreNutrition(saved = {}) {
  const hunger = clamp(finite(saved.hunger ?? 20, 20), 0, 20);
  return {
    hunger,
    saturation: clamp(finite(saved.saturation ?? 5, 5), 0, hunger),
    exhaustion: clamp(finite(saved.exhaustion ?? 0, 0), 0, 40),
  };
}

export function eatFood(player, food) {
  if (!food?.food || (player.hunger >= 20 && !food.specialFood)) return false;
  player.hunger = Math.min(20, player.hunger + food.food);
  player.saturation = Math.min(player.hunger, (player.saturation || 0) + (food.saturation || 0));
  return true;
}

export function spendExhaustion(player) {
  let changed = false;
  while (player.exhaustion >= 4) {
    player.exhaustion -= 4;
    if (player.saturation > 0) player.saturation = Math.max(0, player.saturation - 1);
    else player.hunger = Math.max(0, player.hunger - 1);
    changed = true;
  }
  return changed;
}

export function tickNutrition(player, dt, damage = () => {}) {
  let changed = spendExhaustion(player);
  const mode = player.health < 20 && player.hunger === 20 && player.saturation > 0 ? 'fast'
    : player.health < 20 && player.hunger >= 18 ? 'slow'
    : player.hunger === 0 && player.health > 1 ? 'starve' : null;
  if (mode !== player.nutritionMode) player.nutritionTimer = 0;
  player.nutritionMode = mode;
  if (!mode) { player.nutritionTimer = 0; return changed; }
  player.nutritionTimer = (player.nutritionTimer || 0) + Math.max(0, dt);
  const interval = mode === 'fast' ? .5 : 8;
  if (player.nutritionTimer >= interval) {
    player.nutritionTimer -= interval;
    if (mode === 'starve') damage(1, 'You starved.');
    else {
      const amount = mode === 'fast' ? Math.min(player.saturation, 6) / 6 : 1;
      const healed = Math.min(20 - player.health, amount);
      player.health += healed;
      player.exhaustion += healed * 6;
      spendExhaustion(player);
    }
    changed = true;
  }
  return changed;
}

export function foodDescription(food) {
  return food?.food ? `${food.name} · +${food.food} hunger · +${food.saturation || 0} saturation` : food?.name || '';
}
