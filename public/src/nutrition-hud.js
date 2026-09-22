import {foodDescription} from './nutrition.js';

export function renderNutritionHUD(game, food) {
  let meter = document.getElementById('saturationMeter');
  if (!meter) {
    meter = document.createElement('div'); meter.id = 'saturationMeter';
    meter.setAttribute('role', 'meter'); meter.setAttribute('aria-valuemin', '0'); meter.setAttribute('aria-valuemax', '20');
    const label = document.createElement('span'); label.id = 'nutritionStatus'; meter.append(label);
    for (let i = 0; i < 10; i++) { const segment = document.createElement('i'); segment.append(document.createElement('b')); meter.append(segment); }
    document.querySelector('#vitals .bars').after(meter);
  }
  const saturation = Number(game.saturation || 0);
  meter.setAttribute('aria-label', 'Saturation: stored energy used before hunger');
  meter.setAttribute('aria-valuenow', saturation.toFixed(1));
  meter.title = 'Saturation is used before hunger. Cooked meals keep you full longer.';
  for (const [i, segment] of [...meter.querySelectorAll('i b')].entries()) segment.style.width = Math.max(0, Math.min(100, (saturation - i * 2) / 2 * 100)) + '%';
  document.getElementById('nutritionStatus').textContent = `Saturation ${saturation.toFixed(1)} / 20`;
  if (food?.food) {
    const info = document.createElement('div'); info.id = 'foodStats';
    info.textContent = `+${food.food} hunger · +${food.saturation || 0} saturation`;
    document.getElementById('itemName').append(info);
  }
  document.getElementById('itemName').title = foodDescription(food);
}
