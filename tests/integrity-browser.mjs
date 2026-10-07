import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from './browser-runtime.mjs';

// Regression checks for world loading, item pickups and creeper fuses. All network calls are stubbed.
const port = 10007;
const server = spawn(process.execPath, ['server.mjs'], {env: {...process.env, PORT: String(port)}, stdio: 'pipe', windowsHide: true});
let browser;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch({headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']});
  const context = await browser.newContext({viewport: {width: 1024, height: 640}});
  await context.route(/supabase\.(co|in)/, r => r.abort());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/?test`, {waitUntil: 'commit'});
  await page.waitForFunction(() => !!window.__survival, null, {timeout: 180000});
  await page.evaluate(() => {
    const a = window.__survival, g = a.game;
    g.net.tick = () => {}; g.upgrade.frameStart = () => {}; g.expansion.tick = () => {}; g.paper.tick = () => {}; a.mobs.update = () => {};
    g.net.session = {id: '00000000-0000-4000-8000-00000000000a', name: 'Tester', token: 'local-only'}; g.net.connected = true;
    g.net.channel = {send() {}, track: async () => {}}; g.playing = true; g.health = 20;
  });

  // 1. Saved blocks that share a revision (batched edits) are all loaded, across page boundaries.
  const pull = await page.evaluate(async () => {
    const g = window.__survival.game, n = g.net, rows = [];
    for (let i = 0; i < 2500; i++) rows.push({x: -100 + (i % 50), y: 60 + Math.floor(i / 2500), z: -100 + Math.floor(i / 50), block: 7, revision: i < 1500 ? 1 : 2 + Math.floor((i - 1500) / 64), dimension: 'overworld'});
    const q = () => { const f = {gte: 0, lo: 0, hi: 1e9}; const b = {select: () => b, gte: (k, v) => (f.gte = v, b), gt: (k, v) => (f.gte = v + 1e-9, b), eq: () => b, order: () => b, limit: v => (f.hi = v - 1, b), range: (lo, hi) => (f.lo = lo, f.hi = hi, b),
      then: (res, rej) => Promise.resolve({data: rows.filter(r => r.revision >= f.gte).sort((a, c) => a.revision - c.revision || a.x - c.x || a.y - c.y || a.z - c.z).slice(f.lo, f.hi + 1), error: null}).then(res, rej)}; return b; };
    const from = n.client.from.bind(n.client); n.client.from = t => t === 'carbon_survival_blocks' ? q() : from(t);
    n.cursor = 0; n.cursorTie = null; n.syncing = null; await n.pull();
    let loaded = 0; for (const r of rows) if (g.world.get(r.x, r.y, r.z) === 7) loaded++;
    n.client.from = from; return {loaded, total: rows.length};
  });
  assert.equal(pull.loaded, pull.total, 'every saved block loads even when a page ends inside a shared revision');

  // 2. A pickup only enters the inventory once the server confirms it, and stale polls cannot bring it back.
  const pickup = await page.evaluate(async () => {
    const a = window.__survival, g = a.game, u = g.upgrade, p = g.player, sleep = ms => new Promise(r => setTimeout(r, ms));
    g.frontier.auth.forceBeat = async () => {}; u.flushOutbox = async () => {};
    g.inv.slots.fill(null); const row = id => ({id, dimension: 'overworld', item: 'diamond', count: 1, wear: 0, x: p.x, y: p.y + .2, z: p.z, vx: 0, vy: 0, vz: 0, created_at: new Date(g.clock.serverMs() - 10000).toISOString(), expires_at: new Date(g.clock.serverMs() + 200000).toISOString()});
    let release; const rpc = u.rpc.bind(u);
    u.rpc = (op, q) => op === 'claim' ? new Promise(r => { release = () => r({claimed: true, count: 1}); }) : rpc(op, q);
    const A = '11111111-1111-4111-8111-111111111111'; u.makeDrop(row(A)); u.claim(A); await sleep(50);
    const beforeConfirm = g.inv.count('diamond'); release(); await sleep(50);
    const afterConfirm = g.inv.count('diamond');
    // A poll that started before the claim committed still lists the drop.
    const from = g.net.client.from.bind(g.net.client), stale = {select: () => stale, eq: () => stale, gt: () => stale, order: () => stale, limit: () => Promise.resolve({data: [row(A)], error: null})};
    g.net.client.from = t => t === 'carbon_survival_drops' ? stale : from(t); u.pulling = false; await u.pullDrops(); g.net.client.from = from;
    const resurrected = u.drops.has(A);
    // A claim the server keeps rejecting leaves the inventory untouched and the drop back in the world.
    u.rpc = (op, q) => op === 'claim' ? Promise.reject(Error('Move closer to pick this up.')) : rpc(op, q);
    const B = '22222222-2222-4222-8222-222222222222'; u.makeDrop(row(B)); u.claim(B); p.x += 12;
    for (let i = 0; i < 60 && u.pendingClaims[B]; i++) await sleep(50);
    const rejected = {count: g.inv.count('diamond'), dropBack: u.drops.has(B) && !u.drops.get(B).claiming};
    u.rpc = rpc; u.removeDrop(B);
    return {beforeConfirm, afterConfirm, resurrected, rejected};
  });
  assert.equal(pickup.beforeConfirm, 0, 'nothing is added before the server confirms');
  assert.equal(pickup.afterConfirm, 1);
  assert.equal(pickup.resurrected, false, 'a stale poll must not recreate a claimed drop');
  assert.deepEqual(pickup.rejected, {count: 1, dropBack: true});

  // 3. Creepers ignite by true 3D distance: one far below the player does not explode.
  const creeper = await page.evaluate(() => {
    const a = window.__survival, g = a.game, m = a.mobs, p = g.player;
    Object.defineProperty(m, 'host', {configurable: true, get: () => g.net.session.id});
    m.lastSpawn = Infinity; m.started = true; m.seed = () => {}; for (const id of [...m.mobs.keys()]) m.remove(id);
    const exploded = []; m.explode = mob => { exploded.push(mob.id); m.remove(mob.id); };
    const ground = m.ground(p.x + 1.5, p.z), run = seconds => { for (let t = 0; t < seconds; t += .05) m.simulate(.05, performance.now() + t * 1000, true); };
    Object.assign(p, {x: p.x, y: ground + 6, z: p.z}); m.add({id: 'below', kind: 'creeper', x: p.x + 1.5, y: ground, z: p.z, yaw: 0, hp: 20});
    const frozen = {...p}; const stay = () => Object.assign(p, frozen);
    for (let i = 0; i < 60; i++) { m.simulate(.05, performance.now(), true); stay(); }
    const below = {exploded: exploded.includes('below'), fuse: m.mobs.get('below')?.fuse || 0}; m.remove('below');
    Object.assign(p, {y: ground}); m.add({id: 'near', kind: 'creeper', x: p.x + 1.8, y: ground, z: p.z, yaw: 0, hp: 20});
    const near0 = {...p}; for (let i = 0; i < 60 && !exploded.includes('near'); i++) { m.simulate(.05, performance.now(), true); Object.assign(p, near0); }
    return {below, near: exploded.includes('near')};
  });
  assert.equal(creeper.below.exploded, false, 'a creeper 6 blocks below must not explode'); assert.equal(creeper.below.fuse, 0);
  assert.equal(creeper.near, true, 'a creeper beside the player still explodes');
  assert.deepEqual(errors, []);
  console.log('PASS: batched block revisions load across pages; pickups are server-confirmed and never resurrected; creepers use 3D fuse distance.');
} finally { await browser?.close(); server.kill(); }
