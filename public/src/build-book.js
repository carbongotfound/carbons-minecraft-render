import {ITEMS, RECIPES, SMELTING} from './core.js';
import {BUILDING_BLOCKS} from './building-data.js';

export const PROJECTS = [
  {title: 'Switchable room lights', materials: {lever: 1, redstone: 2, redstone_lamp: 1}, diagram: 'Lever — Dust — Dust — Lamp', steps: 'Place everything in one row on a solid floor. Use the lever to switch the lamp. Continue the dust trail to put your switch beside the entrance.'},
  {title: 'Automatic iron door', materials: {pressure_plate: 2, iron_door: 1}, diagram: 'Plate — Door — Plate', steps: 'Place an iron door, then a pressure plate directly beside it on each side of the doorway. Keep all three bases at the same height. Step on a plate to open it; walk away to close it.'},
  {title: 'Sticky piston gate', materials: {sticky_piston: 1, stone: 1, lever: 1, redstone: 2}, diagram: 'Lever — Dust — Dust\n                |\n             Piston → Stone → gap', steps: 'Face the opening when placing the sticky piston: it pushes away from you. Place a stone block in front, then run dust beside the piston, as shown. Switching on pushes the block one space; switching off pulls it back. Stack two copies for a two-block-high gate.'},
  {title: 'Automatic night lights', materials: {daylight_sensor: 1, redstone: 2, redstone_lamp: 1}, diagram: 'Sensor — Dust — Dust — Lamp', steps: 'Keep the sensor under open sky in the Overworld. Use it once to turn its blue night mode on. Connect dust to your lamp. The light turns on after sunset and switches off in daylight. Use the sensor again to return to daylight mode.'},
  {title: 'Long-distance signal', materials: {lever: 1, redstone: 20, repeater: 1, redstone_lamp: 1}, diagram: 'Lever — 10 Dust — Repeater → 10 Dust — Lamp', steps: 'Build a straight line on a solid floor. Face the lamp when placing the repeater so its output points along the line. It refreshes the signal to full power. Use the repeater to cycle its delay from 0.1 to 0.4 seconds.'},
  {title: 'Hopper storage column', materials: {chest: 2, hopper: 1}, diagram: 'Input chest\n     ↓\n   Hopper\n     ↓\nStorage chest', steps: 'Stack these vertically. Sneak while placing against a chest to avoid opening it. Open both chests once to initialize their storage. Put items in the top chest: the hopper transfers them into the bottom chest. Leave the hopper unpowered; adjacent redstone power pauses it. This transports items without sorting them.'},
];

const element = (tag, text, className) => { const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el; };
const ingredients = need => Object.entries(need).map(([id, n]) => `${n} ${ITEMS[id].name}`).join(' + ');
export function renderBuildBook(root) {
  root.append(element('p', 'Build a home, decorate it, then automate it. Open E → Recipe book to find and fill recipes. Recipes marked Table need a placed crafting table.', 'build-intro'));
  const guide = element('details'); guide.className = 'build-projects'; guide.open = true;
  guide.append(element('summary', '6 redstone projects'));
  for (const project of PROJECTS) {
    const card = element('article', null, 'progress-card');
    card.append(element('strong', project.title), element('small', ingredients(project.materials)), element('pre', project.diagram), element('p', project.steps));
    guide.append(card);
  }
  const ignition = element('article', null, 'progress-card');
  ignition.append(element('strong', 'Flint and steel'), element('p', 'Craft with one iron ingot in the upper-left and one flint in the lower-right of a 2×2 grid. Flint drops from gravel. Use it on an obsidian portal frame or TNT. Ordinary blocks do not catch fire in this game.'));
  root.append(guide, ignition, element('h3', 'Building block catalog'));
  root.append(element('p', '50 new placeable blocks: 16 concrete colors, 13 wool colors, 11 stone finishes, 9 slabs, and a daylight sensor. Concrete crafts directly from sand, gravel and dye. Farmers sell yellow dye; mix dyes for the other colors.', 'build-intro'));
  const search = element('input'); search.type = 'search'; search.placeholder = 'Search blocks…'; search.setAttribute('aria-label', 'Search building blocks'); search.className = 'build-search';
  const count = element('small', null, 'build-count'), list = element('div', null, 'build-catalog');
  const added = new Set(BUILDING_BLOCKS.map(b => b.key));
  const blocks = Object.entries(ITEMS).filter(([, item]) => item.block && !item.food).sort(([a], [b]) => Number(added.has(b)) - Number(added.has(a)) || ITEMS[a].name.localeCompare(ITEMS[b].name));
  function render() {
    list.replaceChildren(); const term = search.value.trim().toLowerCase();
    for (const [id, item] of blocks) {
      if (!item.name.toLowerCase().includes(term)) continue;
      const card = element('article', null, 'build-material');
      const title = element('strong', item.name + (added.has(id) ? ' · NEW' : ''));
      const recipe = RECIPES.find(r => r.out === id), smelt = Object.entries(SMELTING).find(([, out]) => out === id);
      const method = recipe ? `${recipe.size > 2 ? 'Table' : 'Craft'} → ${recipe.n}: ${ingredients(recipe.need)}` : smelt ? `Smelt ${ITEMS[smelt[0]].name} in a furnace.` : 'Gather in the world or obtain through exploration.';
      card.append(title, element('small', method)); list.append(card);
    }
    count.textContent = `${list.childElementCount} blocks`;
  }
  search.oninput = render; root.append(search, count, list); render();
}
