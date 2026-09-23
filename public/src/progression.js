import {renderDiscoveries} from './exploration.js';
import {renderBuildBook} from './build-book.js';
import {ITEMS} from './core.js';
import {LANDMARKS} from './realms.js';
import {GOALS, CONTRACTS, restoreProgress, requirementValue, completeGoals, claimGoal, deliverContract} from './progression-data.js';

const $ = id => document.getElementById(id);
const names = entries => Object.entries(entries).map(([id, count]) => `${count} ${ITEMS[id].name}`).join(' + ');
export function installProgression(upgrade) {
  const {g: game, a: api} = upgrade, expansion = game.expansion;
  const state = restoreProgress(api.saved.progression);
  // Preserve achievements already earned before the journal upgrade.
  for (const id of ['wood', 'stone', 'iron', 'diamond', 'portal', 'nether', 'blaze', 'end', 'crystal', 'dragon', 'enchant', 'redstone', 'brew']) {
    if (expansion.advancements[id]) state.completed[id] = 1;
  }
  if (expansion.advancements.fish) state.completed.angler = 1;
  const progression = game.progression = {state, observe, record, renderJournal, renderGuide};
  let tab = 'goals';
  const legacyCheck = expansion.checkProgress.bind(expansion);
  expansion.checkProgress = () => { legacyCheck(); observe(); renderGuide(); };
  expansion.updateJournal = renderJournal;
  $('journalButton').textContent = 'Progress [J]';
  $('guide').setAttribute('role', 'button');
  $('guide').setAttribute('tabindex', '0');
  $('guide').title = 'Open progression journal [J]';
  $('guide').onclick = () => expansion.openJournal();
  $('guide').onkeydown = event => { if (event.code === 'Enter' || event.code === 'Space') { event.preventDefault(); expansion.openJournal(); } };

  function record(kind, id, count = 1) {
    if (!ITEMS[id] || !['crafted', 'eaten'].includes(kind)) return;
    state[kind][id] = (state[kind][id] || 0) + count;
    if (kind === 'crafted') state.seen[id] = Math.max(state.seen[id] || 0, count);
    observe();
  }
  function observe() {
    if (!game.playing) return;
    const counts = {};
    for (const stack of [...game.inv.slots, api.carried, ...Object.values(game.equipment || {})]) {
      if (!stack || !ITEMS[stack.id]) continue;
      const id = ITEMS[stack.id].baseItem || stack.id;
      counts[id] = (counts[id] || 0) + stack.count;
    }
    for (const [id, count] of Object.entries(counts)) state.seen[id] = Math.max(state.seen[id] || 0, count);
    state.seen.log = Math.max(state.seen.log || 0, (counts.log || 0) + (counts.spruce_log || 0) + (counts.birch_log || 0));
    const completed = completeGoals(state, expansion.advancements);
    if (completed.length) {
      api.toast(completed.length === 1 ? `Goal complete: ${completed[0].title}. Collect ${completed[0].xp} XP in Progress [J].` : `${completed.length} goals complete. Collect your XP in Progress [J].`);
      api.save();
      renderJournal();
    }
  }
  function renderGuide() {
    const next = GOALS.find(g => g.id === state.pinned && !state.completed[g.id]) || GOALS.find(g => !state.completed[g.id]);
    const pending = GOALS.filter(g => state.completed[g.id] && !state.claimed[g.id]).length;
    $('guide').replaceChildren();
    const label = document.createElement('small');
    label.textContent = pending ? `${pending} XP reward${pending === 1 ? '' : 's'} ready · J` : 'YOUR NEXT GOAL · J';
    const title = document.createElement('strong'); title.textContent = next?.title || 'A world of your own';
    const hint = document.createElement('span'); hint.textContent = next?.hint || 'All goals complete. Keep building, explore, or finish your village supply requests.';
    $('guide').append(label, title, hint);
  }
  function button(text, action, disabled = false) {
    const b = document.createElement('button'); b.textContent = text; b.disabled = disabled; b.onclick = action; return b;
  }
  function renderJournal() {
    if (api.panel !== 'journal') return;
    const root = $('expansionBody'); root.replaceChildren();
    $('expansionTitle').textContent = 'Survival progress';
    const done = GOALS.filter(g => state.completed[g.id]).length;
    const summary = document.createElement('p'); summary.className = 'progress-summary';
    summary.textContent = `${done} / ${GOALS.length} goals · ${Math.floor(game.xp)} XP · Rewards help you enchant and repair gear.`;
    const meter = document.createElement('progress'); meter.max = GOALS.length; meter.value = done; meter.setAttribute('aria-label', `${done} of ${GOALS.length} goals complete`);
    const tabs = document.createElement('nav'); tabs.className = 'progress-tabs'; tabs.setAttribute('aria-label', 'Journal sections');
    for (const [id, name] of [['goals', 'Goals'], ['contracts', 'Village requests'], ['landmarks', 'Exploration'], ['builds', 'Build book']]) {
      const b = button(name, () => { tab = id; renderJournal(); }); b.setAttribute('aria-pressed', tab === id); tabs.append(b);
    }
    root.append(summary, meter, tabs);
    if (tab === 'goals') {
      let chapter;
      for (const goal of GOALS) {
        if (chapter !== goal.chapter) { chapter = goal.chapter; const h = document.createElement('h3'); h.textContent = chapter; root.append(h); }
        const card = document.createElement('article'); card.className = 'progress-card' + (state.completed[goal.id] ? ' complete' : '');
        const heading = document.createElement('strong'); heading.textContent = `${state.completed[goal.id] ? '✓ ' : ''}${goal.title}`;
        const hint = document.createElement('p'); hint.textContent = goal.hint;
        const detail = document.createElement('small');
        detail.textContent = goal.requirements.map(req => `${Math.min(req.count, requirementValue(state, req, expansion.advancements))}/${req.count} ${ITEMS[req.id]?.name || (req.kind === 'family' ? 'Netherite equipment' : 'completed')}`).join(' · ');
        const action = state.completed[goal.id]
          ? button(state.claimed[goal.id] ? 'XP collected' : `Collect ${goal.xp} XP`, () => {
            const xp = claimGoal(state, goal.id); game.xp += xp; api.save(); api.renderHUD(); renderJournal(); api.toast(`+${xp} XP · ${goal.title}`);
          }, !!state.claimed[goal.id])
          : button(state.pinned === goal.id ? 'Tracking' : 'Track goal', () => { state.pinned = goal.id; api.save(); renderGuide(); renderJournal(); });
        card.append(heading, hint, detail, action); root.append(card);
      }
    } else if (tab === 'contracts') {
      const intro = document.createElement('p'); intro.textContent = 'Deliver supplies here to earn emeralds, equipment materials and XP. Each request can be completed once. Supplies are consumed when delivered.'; root.append(intro);
      for (const contract of CONTRACTS) {
        const card = document.createElement('article'); card.className = 'progress-card';
        const heading = document.createElement('strong'); heading.textContent = contract.title;
        const needs = document.createElement('p'); needs.textContent = `Supply: ${names(contract.needs)}`;
        const reward = document.createElement('p'); reward.className = 'request-rewards'; reward.textContent = `Receive: ${names(contract.rewards)} + ${contract.xp} XP`;
        const locked = !state.completed[contract.unlock], delivered = !!state.contracts[contract.id];
        const detail = document.createElement('small'); detail.textContent = locked ? `Unlock: ${GOALS.find(g => g.id === contract.unlock).title}` : Object.entries(contract.needs).map(([id, n]) => `${Math.min(n, game.inv.count(id))}/${n} ${ITEMS[id].name}`).join(' · ');
        const can = Object.entries(contract.needs).every(([id, n]) => game.inv.count(id) >= n);
        card.append(heading, needs, reward, detail, button(delivered ? 'Delivered' : locked ? 'Locked' : 'Deliver supplies', () => {
          const result = deliverContract(state, game.inv, contract.id);
          if (!result.ok) { api.toast(result.reason); return; }
          game.xp += result.xp; observe(); api.save(); api.renderHUD(); renderJournal(); api.toast(`Request delivered · +${result.xp} XP`);
        }, locked || delivered || !can)); root.append(card);
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
