import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

// Exercise the real renderer, UI, inventory and physics in an isolated world.
// No multiplayer account is created and no edits are sent to the shared world.
const port = process.env.TEST_PORT || '10001';
const output = resolve(process.env.ARTIFACT_DIR || 'artifacts');
await mkdir(output, {recursive: true});
const server = spawn(process.execPath, ['server.mjs'], {env: {...process.env, PORT: port}, stdio: 'pipe', windowsHide: true});
let browser, page;
try {
  for (let n = 0; n < 100; n++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  browser = await chromium.launch({headless: true, args: ['--enable-unsafe-swiftshader']});
  const context = await browser.newContext({viewport: {width: 1440, height: 900}});
  await context.route(/supabase\.(co|in)/, route => route.abort());
  page = await context.newPage(); const errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.error('Browser error:', e.message); });
  page.on('console', message => { if(message.type() === 'error' && !message.text().includes('net::ERR_FAILED')) console.error('Browser console:', message.text()); });
  await page.goto(`http://127.0.0.1:${port}/?test`, {waitUntil: 'commit'});
  await page.waitForFunction(() => !!window.__survival, null, {timeout: 120000});
  assert.equal(await page.locator('#title').isVisible(), true);

  async function startFixture() {
    await page.evaluate(async () => {
      const a = window.__survival, g = a.game;
      g.net.tick = () => {}; g.net.close = async () => {};
      g.net.session = {id: 'browser-test', name: 'Survivor', token: 'local-only'};
      g.net.edit = async (x, y, z, b) => { g.world.set(x, y, z, b); return true; };
      g.upgrade.frameStart = () => {}; g.upgrade.flushOutbox = async () => {};
      g.upgrade.requestLock = () => {};
      g.upgrade.outbox.length = 0; g.expansion.tick = () => {}; g.paper.tick = () => {};
      g.frontier.movement = () => ({x: 0, z: 0}); g.frontier.melee = () => false;
      g.frontier.map.tick = () => {}; a.mobs.update = () => {};
      g.clock.sync({server_ms:Math.max(Date.now(),g.clock.lastServer+1),world_ms:300000,day_length_ms:1200000},performance.now());
      g.playing = true; g.health = 20;
      document.getElementById('title').hidden = true;
      document.getElementById('hud').hidden = false;
      document.getElementById('connection').textContent = 'Local test world';
      g.view.hand.visible = true;
      a.renderHUD();
      g.frontier.map.draw(document.querySelector('#worldMapMini canvas'), true);
    });
  }
  await startFixture();

  // Use the actual recipe autofill and craft-result button.
  await page.evaluate(async () => {
    const {RECIPES} = await import('/src/core.js');
    const a = window.__survival; a.game.inv.slots.fill(null);
    a.game.inv.add('spruce_log', 2); a.openInventory();
    a.fillRecipe(RECIPES.find(r => r.out === 'planks'));
  });
  await page.locator('#craftResult').click();
  assert.equal(await page.evaluate(() => window.__survival.carried?.id), 'spruce_planks');
  await page.evaluate(() => window.__survival.closePanel());
  assert.equal(await page.evaluate(() => window.__survival.game.inv.count('spruce_planks')), 4);

  await page.evaluate(async () => {
    const {RECIPES} = await import('/src/core.js');
    const a = window.__survival; a.game.inv.add('wheat', 2); a.game.inv.add('sugar', 1);
    a.openInventory('table'); a.fillRecipe(RECIPES.find(r => r.out === 'cookie'));
  });
  await page.locator('#craftResult').click();
  assert.equal(await page.evaluate(() => window.__survival.carried?.count), 8);
  await page.evaluate(() => window.__survival.closePanel());

  // Eating goes through the real 1.6 second holding-use path in physics().
  await page.evaluate(() => {
    const a = window.__survival, g = a.game;
    g.inv.slots[0] = {id: 'steak', count: 2}; g.hunger = 10; g.saturation = 0;
    a.select(0); g.upgrade.a.panel = null;
    Object.defineProperty(document, 'pointerLockElement', {configurable: true, get: () => document.getElementById('world')});
    a.setHolding(false, true);
    for (let n = 0; n < 33; n++) a.physics(.05, performance.now() + n * 50);
    a.setHolding(false, false); a.renderHUD();
  });
  const eaten = await page.evaluate(() => ({hunger: window.__survival.game.hunger, saturation: window.__survival.game.saturation, count: window.__survival.game.inv.slots[0].count}));
  assert.deepEqual(eaten, {hunger: 18, saturation: 12.8, count: 1});
  assert.match(await page.locator('#foodStats').innerText(), /12.8 saturation/);
  assert.equal(await page.locator('#saturationMeter').getAttribute('aria-valuenow'), '12.8');

  // Give the fixture supplies and inspect the actual progression controls.
  await page.evaluate(() => {
    const a = window.__survival;
    delete document.pointerLockElement;
    for (const [id, n] of [['table', 1], ['log', 16], ['cobble', 32]]) a.game.inv.add(id, n);
    a.renderHUD();
  });
  await page.locator('#journalButton').click();
  assert.equal(await page.locator('.progress-card').count(), 34);
  const xp = await page.evaluate(() => window.__survival.game.xp);
  await page.getByRole('button', {name: 'Collect 2 XP', exact: true}).click();
  assert.equal(await page.evaluate(() => window.__survival.game.xp), xp + 2);
  await page.getByRole('button', {name: 'Track goal', exact: true}).first().click();
  assert.ok(await page.evaluate(() => window.__survival.game.progression.state.pinned));
  await page.screenshot({path: resolve(output, 'progression.png')});

  await page.getByRole('button', {name: 'Village requests', exact: true}).click();
  await page.getByRole('button', {name: 'Deliver supplies', exact: true}).first().click();
  assert.equal(await page.evaluate(() => window.__survival.game.inv.count('emerald')), 3);
  assert.equal(await page.getByRole('button', {name: 'Delivered', exact: true}).isDisabled(), true);
  await page.screenshot({path: resolve(output, 'village-requests.png')});

  await page.getByRole('button', {name: 'Build book', exact: true}).click();
  assert.equal(await page.locator('.build-projects .progress-card').count(), 6);
  await page.getByRole('searchbox', {name: 'Search building blocks'}).fill('concrete');
  assert.equal(await page.locator('.build-material').count(), 16);
  await page.screenshot({path: resolve(output, 'build-book.png')});
  await page.locator('#expansionClose').click();

  // Craft the new materials through recipe filters and actual result slots.
  await page.evaluate(() => { const a = window.__survival; a.game.inv.add('sand', 4); a.game.inv.add('gravel', 4); a.game.inv.add('white_dye', 1); a.openInventory('table'); });
  await page.locator('#recipeCategory').selectOption('colors');
  await page.locator('#recipeSearch').fill('white concrete');
  assert.equal(await page.locator('#recipes button').count(), 1);
  await page.locator('#recipes button').click();
  await page.locator('#craftResult').click();
  assert.equal(await page.evaluate(() => window.__survival.carried?.id), 'white_concrete');
  assert.equal(await page.evaluate(() => window.__survival.carried?.count), 8);
  await page.evaluate(() => window.__survival.closePanel());
  await page.evaluate(() => { const a = window.__survival; a.game.inv.add('birch_planks', 3); a.openInventory('table'); });
  await page.locator('#recipeCategory').selectOption('building');
  await page.locator('#recipeSearch').fill('birch slab');
  await page.locator('#recipes button').click(); await page.locator('#craftResult').click();
  assert.equal(await page.evaluate(() => window.__survival.carried?.id), 'birch_slab');
  await page.evaluate(() => window.__survival.closePanel());

  // Keep edits local but exercise placement, sensor use and the real circuit tick.
  const building = await page.evaluate(async () => {
    const a = window.__survival, g = a.game, e = g.expansion;
    const {ITEMS} = await import('/src/core.js');
    const {DAYLIGHT_SENSOR, NIGHT_SENSOR} = await import('/src/building-data.js');
    const {B} = await import('/src/expansion-data.js');
    const originalEdit = e.edit, originalBatch = e.batch, originalAuthority = Object.getOwnPropertyDescriptor(a.mobs, 'authority');
    let revision = 1000000000;
    e.edit = async (x,y,z,block,meta={}) => { g.world.apply({x,y,z,block,meta,revision:++revision}); return true; };
    e.batch = async edits => { for (const edit of edits) await e.edit(edit.x,edit.y,edit.z,edit.block,edit.meta); return true; };
    const wait = async () => { for(let i=0;i<50&&e.busy;i++) await new Promise(r=>setTimeout(r,10)); };
    const placed = [];
    for (const [i, id] of ['white_concrete','quartz_pillar','birch_slab','daylight_sensor'].entries()) {
      g.inv.slots[0] = {id,count:2}; a.select(0); g.world.set(i*2,81,0,0);
      e.handleUse({x:i*2,y:80,z:0,b:3,n:[0,1,0]},performance.now()); await wait();
      placed.push([g.world.get(i*2,81,0),g.inv.slots[0]?.count]);
    }
    const expected = ['white_concrete','quartz_pillar','birch_slab','daylight_sensor'].map(id=>[ITEMS[id].block,1]);
    e.handleUse({x:6,y:81,z:0,b:DAYLIGHT_SENSOR,n:[0,1,0]},performance.now()); await wait();
    const inverted = g.world.get(6,81,0) === NIGHT_SENSOR;
    g.inv.slots[0] = {id:'flint_and_steel',count:1,wear:0};
    let explosions = 0; const oldExplode = e.explode; e.explode = async () => { explosions++; };
    e.handleUse({x:0,y:81,z:0,b:ITEMS.white_concrete.block,n:[0,1,0]},performance.now()); await wait();
    e.explode = oldExplode;
    // A roof blocks sunlight. Night mode then powers a lamp through two dust tiles.
    for (const [x,b] of [[6,NIGHT_SENSOR],[7,B.WIRE],[8,B.WIRE],[9,B.LAMP]]) await e.edit(x,81,0,b);
    const oldNodes = e.circuitNodes; e.circuitNodes = new Set(['6,81,0','7,81,0','8,81,0','9,81,0']);
    Object.defineProperty(a.mobs, 'authority', {configurable:true, value:true}); e.nextCircuit = 0;
    g.clock.sync({server_ms:Math.max(Date.now(),g.clock.lastServer+1),world_ms:900000,day_length_ms:1200000},performance.now()); e.runCircuits(performance.now()); await wait();
    const atNight = g.world.get(9,81,0);
    g.clock.sync({server_ms:Math.max(Date.now(),g.clock.lastServer+1),world_ms:300000,day_length_ms:1200000},performance.now()); e.nextCircuit = 0; e.runCircuits(performance.now()); await wait();
    const atDay = g.world.get(9,81,0);
    g.world.set(6,82,0,3); g.upgrade.updateColumn(6,0); e.nextCircuit = 0; e.runCircuits(performance.now()); await wait();
    const roofed = g.world.get(9,81,0); g.world.set(6,82,0,0); g.upgrade.updateColumn(6,0);
    e.circuitNodes = oldNodes; if(originalAuthority)Object.defineProperty(a.mobs,'authority',originalAuthority);else delete a.mobs.authority; e.edit = originalEdit; e.batch = originalBatch;
    return {placed,expected,inverted,explosions,atNight,atDay,roofed,lamp:B.LAMP,lit:B.LAMP_ON};
  });
  assert.deepEqual(building.placed, building.expected);
  assert.equal(building.inverted, true); assert.equal(building.explosions, 0);
  assert.equal(building.atNight, building.lit); assert.equal(building.atDay, building.lamp); assert.equal(building.roofed, building.lit);

  // Send a new slab through the actual meshing worker and inspect its bounds.
  const mesh = await page.evaluate(async () => {
    const {FACES} = await import('/src/engine.js');
    const {ITEMS} = await import('/src/core.js');
    const stream = window.__survival.game.frontier.stream;
    const cells = new Uint8Array(18*18*96); cells[1+18*(1+18*80)] = ITEMS.quartz_slab.block;
    const worker = new Worker('/src/mesh-worker.js',{type:'module'});
    try {
      const r = await new Promise((resolve,reject)=>{ const timeout=setTimeout(()=>reject(Error('Slab worker timed out')),15000); worker.onmessage=e=>{clearTimeout(timeout);resolve(e.data);}; worker.onerror=e=>{clearTimeout(timeout);reject(Error(e.message));}; worker.postMessage({job:1,cx:32,cz:32,origin:512,cells,sky:new Uint8Array(18*18),faces:FACES,tiles:stream.tiles,shapes:stream.shapes,flags:stream.flags}); });
      if(r.error)throw Error(r.error); const ys=Array.from(r.sets[0].p).filter((_,i)=>i%3===1);
      return {vertices:ys.length,min:Math.min(...ys),max:Math.max(...ys)};
    } finally { worker.terminate(); }
  });
  assert.deepEqual(mesh,{vertices:24,min:80,max:80.5});

  // Persist both systems, then load the same browser save in a fresh game.
  await page.evaluate(() => window.__survival.save());
  await page.reload(); await page.waitForFunction(() => !!window.__survival, null, {timeout: 120000});
  assert.equal(await page.evaluate(() => window.__survival.game.saturation), 12.8);
  assert.equal(await page.evaluate(() => window.__survival.game.progression.state.claimed.wood), 1);
  assert.equal(await page.evaluate(() => window.__survival.game.progression.state.contracts.timber), 1);
  await startFixture();

  await page.evaluate(() => {
    const a = window.__survival, g = a.game;
    g.inv.slots.fill(null);
    for (const [id, count] of [['grass', 32], ['log', 16], ['planks', 32], ['cobble', 32], ['table', 1], ['furnace', 1], ['diamond_pickaxe', 1], ['steak', 8], ['torch', 16]]) g.inv.add(id, count);
    a.select(7); g.player.pitch = -.12; a.renderHUD();
  });
  await page.waitForTimeout(700);
  await page.screenshot({path: resolve(output, 'survival-world.png')});
  const atlas = await page.evaluate(() => window.__survival.game.view.atlas.toDataURL().split(',')[1]);
  await writeFile(resolve(output, 'block-atlas.png'), Buffer.from(atlas, 'base64'));

  // Reach the journal using the normal keyboard shortcut, then check a phone viewport.
  await page.keyboard.press('j');
  assert.equal(await page.locator('#expansionPanel').isVisible(), true);
  await page.setViewportSize({width: 390, height: 844});
  await page.screenshot({path: resolve(output, 'progression-mobile.png')});
  assert.ok(await page.locator('.expansion-window').evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }));
  await page.locator('#expansionClose').click();
  await page.screenshot({path: resolve(output, 'survival-mobile.png')});
  const layout = await page.evaluate(() => {
    const rect = id => document.getElementById(id).getBoundingClientRect();
    const guide = rect('guide'), map = rect('worldMapMini');
    return {guideClear: guide.right <= map.left || guide.top >= map.bottom,
      nutritionClear: rect('nutritionStatus').top >= rect('hunger').bottom};
  });
  assert.deepEqual(layout, {guideClear: true, nutritionClear: true});
  assert.deepEqual(errors, []);
  console.log('PASS: renderer, crafting, eating, saturation HUD, goals, contracts, save/reload, building catalog, block placement, sensor circuits, slab mesh, keyboard journal and mobile layout.');
  console.log(`Screenshots: ${output}`);
} catch (error) {
  await page?.screenshot({path: resolve(output, 'failure.png')}).catch(() => {});
  throw error;
} finally {
  await browser?.close(); server.kill();
}
