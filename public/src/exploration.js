import {biomeAt, frontierSites} from './frontier-gen.js';

export const BIOMES = {
  plains: ['Plains', 'Open grassland. Find animals and room for your first farm.'],
  forest: ['Forest', 'Oak and birch trees, flowers, and plenty of wood.'],
  taiga: ['Taiga', 'Tall spruce trees, snow, and frozen water.'],
  desert: ['Desert', 'Sand and cactus. Bring wood and food before crossing.'],
  swamp: ['Swamp', 'Mushrooms, wet ground, and occasional slimes.'],
  savanna: ['Savanna', 'Scattered trees and open land for traveling.'],
};
const SITES = frontierSites();
export function restoreExploration(saved = {}) {
  return {
    biomes: Object.fromEntries(Object.keys(BIOMES).filter(id => saved?.biomes?.[id] === true).map(id => [id, true])),
    sites: Object.fromEntries(SITES.filter(s => saved?.sites?.[s.id] === true).map(s => [s.id, true])),
  };
}
export function discover(state, player, dimension) {
  const found = [];
  if (dimension !== 'overworld') return found;
  const biome = biomeAt(Math.floor(player.x), Math.floor(player.z));
  if (!state.biomes[biome]) { state.biomes[biome] = true; found.push(BIOMES[biome][0]); }
  for (const site of SITES) if (!state.sites[site.id] && Math.hypot(player.x-site.x,player.z-site.z) < 15 && Math.abs(player.y-site.y) < 8) {
    state.sites[site.id] = true; found.push(site.title);
  }
  return found;
}
export function installExploration(upgrade) {
  const {g: game, a: api} = upgrade;
  const state = restoreExploration(api.saved.exploration);
  game.exploration = {state};
  const banner = document.createElement('div'); banner.id = 'biomeBanner'; banner.hidden = true; banner.setAttribute('role', 'status');
  document.getElementById('hud').append(banner);
  const tick = game.paper.tick.bind(game.paper); let last = 0, biome = '', hideAt = 0;
  game.paper.tick = (dt, now) => {
    tick(dt, now);
    if (now > hideAt) banner.hidden = true;
    if (now-last < 1000 || !game.playing || game.dead) return;
    last = now;
    const next = game.dimension === 'overworld' ? biomeAt(Math.floor(game.player.x), Math.floor(game.player.z)) : game.dimension;
    const found = discover(state, game.player, game.dimension);
    if (next !== biome) {
      biome = next; banner.textContent = BIOMES[next]?.[0] || (next === 'nether' ? 'The Nether' : 'The End');
      banner.hidden = false; hideAt = now + 4000;
    }
    if (found.length) { api.save(); api.toast(`Discovered: ${found.join(' · ')}. Recorded in Progress [J] → Exploration.`); }
  };
}
export function renderDiscoveries(root, game) {
  const state = game.exploration?.state || restoreExploration();
  const add = (tag, text, className) => { const el = document.createElement(tag); el.textContent = text; if(className)el.className=className; root.append(el); return el; };
  add('h3', `Biomes discovered · ${Object.keys(state.biomes).length} / 6`);
  for (const [id, [name, hint]] of Object.entries(BIOMES)) {
    const card = add('article', '', 'progress-card' + (state.biomes[id] ? ' complete' : ''));
    const title = document.createElement('strong'); title.textContent = `${state.biomes[id] ? '✓ ' : ''}${name}`;
    const detail = document.createElement('p'); detail.textContent = hint; card.append(title, detail);
  }
  add('h3', `Underground discoveries · ${Object.keys(state.sites).length} / ${SITES.length}`);
  add('p', 'Look beyond the central valley for cave entrances marked by rails or ladders. Descend into mines, amethyst hollows, and dungeons to record them. Bring torches: dark caves can spawn monsters even at noon.', 'build-intro');
  for (const site of SITES.filter(s => state.sites[s.id])) {
    const card = add('article', `${site.title} · X ${site.x}, Y ${site.y}, Z ${site.z}`, 'progress-card complete');
    const hint = document.createElement('p'); hint.textContent = site.kind === 'geode' ? 'Mine amethyst and calcite for building.' : site.kind === 'dungeon' ? 'Light the spawner area or break the spawner to make this room safe.' : 'Collect rails and timber. Explore nearby caves for ore.'; card.append(hint);
  }
  add('h3', 'Landmark guide');
}
