import {renderDiscoveries} from './exploration.js';
import {renderBuildBook} from './build-book.js';
import {ITEMS} from './core.js';
import {LANDMARKS} from './realms.js';
import {CONTRACTS, restoreProgress, deliverContract} from './progression-data.js';

const $ = id => document.getElementById(id);
const names = entries => Object.entries(entries).map(([id, count]) => `${count} ${ITEMS[id].name}`).join(' + ');
export function installProgression(upgrade) {
  const {g: game, a: api} = upgrade, expansion = game.expansion;
  const state = restoreProgress(api.saved.progression);
  const progression = game.progression = {state, renderJournal};
  let tab = 'landmarks';
  expansion.updateJournal = renderJournal;
  $('journalButton').textContent = 'Journal [J]';

  function button(text, action, disabled = false) {
    const b = document.createElement('button'); b.textContent = text; b.disabled = disabled; b.onclick = action; return b;
  }
  function renderJournal() {
    if (api.panel !== 'journal') return;
    const root = $('expansionBody'); root.replaceChildren();
    $('expansionTitle').textContent = 'Survival journal';
    const tabs = document.createElement('nav'); tabs.className = 'progress-tabs'; tabs.setAttribute('aria-label', 'Journal sections');
    for (const [id, name] of [['landmarks', 'Exploration'], ['builds', 'Build book'], ['contracts', 'Village requests']]) {
      const b = button(name, () => { tab = id; renderJournal(); }); b.setAttribute('aria-pressed', tab === id); tabs.append(b);
    }
    root.append(tabs);
    if (tab === 'contracts') {
      const intro = document.createElement('p'); intro.textContent = 'Deliver supplies here to earn emeralds, equipment materials and XP. Each request can be completed once. Supplies are consumed when delivered.'; root.append(intro);
      for (const contract of CONTRACTS) {
        const card = document.createElement('article'); card.className = 'progress-card';
        const heading = document.createElement('strong'); heading.textContent = contract.title;
        const needs = document.createElement('p'); needs.textContent = `Supply: ${names(contract.needs)}`;
        const reward = document.createElement('p'); reward.className = 'request-rewards'; reward.textContent = `Receive: ${names(contract.rewards)} + ${contract.xp} XP`;
        const delivered = !!state.contracts[contract.id];
        const detail = document.createElement('small'); detail.textContent = Object.entries(contract.needs).map(([id, n]) => `${Math.min(n, game.inv.count(id))}/${n} ${ITEMS[id].name}`).join(' · ');
        const can = Object.entries(contract.needs).every(([id, n]) => game.inv.count(id) >= n);
        card.append(heading, needs, reward, detail, button(delivered ? 'Delivered' : 'Deliver supplies', () => {
          const result = deliverContract(state, game.inv, contract.id);
          if (!result.ok) { api.toast(result.reason); return; }
          game.xp += result.xp; api.save(); api.renderHUD(); renderJournal(); api.toast(`Request delivered · +${result.xp} XP`);
        }, delivered || !can)); root.append(card);
      }
    } else if (tab === 'builds') {
      renderBuildBook(root);
    } else {
      renderDiscoveries(root, game);
      for (const site of LANDMARKS) {
        const card = document.createElement('article'); card.className = 'progress-card';
        const title = document.createElement('strong'); title.textContent = site.name;
        const hint = document.createElement('p'); hint.textContent = `${site.dim} · X ${site.x}, Z ${site.z} · ${site.hint || ''}`;
        card.append(title, hint); root.append(card);
      }
      const help = document.createElement('p'); help.textContent = 'Use M for the world map and B to mark a waypoint. Keep food, torches and a spare pickaxe with you.'; root.append(help);
    }
  }
  return progression;
}
