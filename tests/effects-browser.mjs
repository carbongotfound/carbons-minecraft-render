import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

// Sky, water, block light, leaves, weather and the Fancy/Fast switch on the real WebGL renderer.
const port = 10006; await mkdir('artifacts', {recursive: true});
const server = spawn(process.execPath, ['server.mjs'], {env: {...process.env, PORT: String(port)}, stdio: 'pipe', windowsHide: true});
let browser;
const ignored = text => text.includes('net::ERR_FAILED') || text.includes('WebSocket connection');
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch({headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']});
  const context = await browser.newContext({viewport: {width: 1280, height: 720}});
  await context.route(/supabase\.(co|in)/, r => r.abort());
  await context.addInitScript(() => { try { if (!sessionStorage.getItem('effects-test')) { localStorage.setItem('carbon-effects-v1', 'fancy'); sessionStorage.setItem('effects-test', '1'); } } catch {} });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !ignored(m.text())) errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/?test`, {waitUntil: 'commit'});
  await page.waitForFunction(() => !!window.__survival, null, {timeout: 180000});
  await page.evaluate(() => {
    const a = window.__survival, g = a.game;
    g.net.tick = () => {}; g.upgrade.frameStart = () => {}; g.expansion.tick = () => {}; g.paper.tick = () => {}; a.mobs.update = () => {};
    g.playing = true; document.getElementById('title').hidden = true; document.getElementById('hud').hidden = false;
    g.clock.sync({server_ms: Math.max(Date.now(), g.clock.lastServer + 1), world_ms: 300000, day_length_ms: 1200000}, performance.now());
    g.player.yaw = .6; g.player.pitch = .1;
  });
  await page.waitForTimeout(5000);

  const fancy = await page.evaluate(() => {
    const g = window.__survival.game, v = g.view, r = g.realism;
    let leafMeshes = 0, encoded = 0, vertices = 0;
    for (const chunk of v.chunks.values()) for (const m of chunk.children) {
      if (m.material === v.leafMat) leafMeshes++;
      const c = m.geometry.attributes.color?.array; if (!c) continue;
      for (let i = 2; i < c.length; i += 3) { vertices++; if (c[i] > 1.5) encoded++; }
    }
    const atlas = v.atlas.getContext('2d').getImageData(7 * 32, 0, 32, 32).data; let holes = 0;
    for (let i = 3; i < atlas.length; i += 4) if (atlas[i] === 0) holes++;
    return {installed: !!r, sky: v.scene.children.includes(r.sky), leafMeshes, encoded, vertices, holes, leafAlphaTest: v.leafMat.alphaTest,
      solidAlphaTest: v.material.alphaTest, mipmaps: v.material.map.generateMipmaps, pointLights: v.scene.children.filter(o => o.isPointLight && o.visible).length,
      oldClouds: v.clouds.visible, label: document.getElementById('graphics-effects')?.textContent};
  });
  assert.equal(fancy.installed, true); assert.equal(fancy.sky, true);
  assert.ok(fancy.leafMeshes > 0, 'fancy leaves use the cutout material');
  assert.ok(fancy.encoded > fancy.vertices * .9, 'terrain vertices carry separate sky and torch light');
  assert.ok(fancy.holes > 40 && fancy.holes < 600, 'leaf texture has see-through gaps');
  assert.equal(fancy.leafAlphaTest, .5); assert.equal(fancy.solidAlphaTest, 0, 'solid terrain keeps early depth rejection');
  assert.equal(fancy.mipmaps, true); assert.equal(fancy.pointLights, 0); assert.equal(fancy.oldClouds, false);
  assert.match(fancy.label, /FANCY/);
  await page.screenshot({path: 'artifacts/effects-fancy-day.png'});

  // Torches: baked block light reaches nearby vertices at night.
  const torch = await page.evaluate(async () => {
    const g = window.__survival.game, w = g.world, p = g.player, x = Math.floor(p.x) + 2, z = Math.floor(p.z) - 3;
    let y = 95; while (y > 0 && !w.get(x, y, z)) y--; w.set(x, y + 1, z, 18); w.versions.set(`${x},${y + 1},${z}`, 1); g.lighting.invalidate();
    g.clock.sync({server_ms: Math.max(Date.now(), g.clock.lastServer + 1), world_ms: 760000, day_length_ms: 1200000}, performance.now());
    await new Promise(r => setTimeout(r, 4000));
    let lit = 0; for (const chunk of g.view.chunks.values()) for (const m of chunk.children) { const c = m.geometry.attributes.color?.array; if (c) for (let i = 2; i < c.length; i += 3) if (c[i] > 2.3) lit++; }
    return {lit, stars: g.realism.skyUniforms.uStars.value, hemi: g.view.scene.children.find(o => o.isHemisphereLight).intensity};
  });
  assert.ok(torch.lit > 20, 'torch light is baked into nearby terrain'); assert.ok(torch.stars > .9); assert.ok(torch.hemi < .5);
  await page.screenshot({path: 'artifacts/effects-torch-night.png'});

  // Weather drives GPU precipitation, and a storm eventually flashes lightning.
  const weather = await page.evaluate(async () => {
    const g = window.__survival.game, r = g.realism;
    g.clock.sync({server_ms: Math.max(Date.now(), g.clock.lastServer + 1), world_ms: 330000, day_length_ms: 1200000}, performance.now());
    g.frontier.requested.weather = 'storm'; r.nextFlash = 1; await new Promise(res => setTimeout(res, 2500));
    r.nextFlash = 1; await new Promise(res => setTimeout(res, 150));
    return {rain: r.rain, amount: r.weatherUniforms.uAmount.value, flashed: r.flash > 0 || r.skyUniforms.uFlash.value > 0 || !!r.thunder};
  });
  assert.ok(weather.rain > .5); assert.ok(weather.amount > .4); assert.equal(weather.flashed, true);
  await page.evaluate(() => { window.__survival.game.frontier.requested.weather = 'clear'; });

  // Graphics switch: Fast rebuilds leaves as opaque blocks and remembers the choice on this device.
  await page.evaluate(() => { document.getElementById('graphicsSettings').hidden = false; });
  await page.locator('#graphics-effects').click();
  await page.waitForTimeout(6000);
  const fast = await page.evaluate(() => {
    const g = window.__survival.game, v = g.view; let leafMeshes = 0;
    for (const chunk of v.chunks.values()) for (const m of chunk.children) if (m.material === v.leafMat) leafMeshes++;
    return {leafMeshes, stored: localStorage.getItem('carbon-effects-v1'), label: document.getElementById('graphics-effects').textContent, steps: g.realism.skyUniforms.uCloudSteps.value, sway: g.realism.sway.value};
  });
  assert.equal(fast.leafMeshes, 0); assert.equal(fast.stored, 'fast'); assert.match(fast.label, /FAST/); assert.equal(fast.steps, 1); assert.equal(fast.sway, 0);
  await page.reload({waitUntil: 'commit'}); await page.waitForFunction(() => !!window.__survival, null, {timeout: 180000});
  assert.equal(await page.evaluate(() => window.__survival.game.realism.level), 'fast');

  // The Canvas2D fallback keeps working without any of the WebGL effects.
  const canvas = await context.newPage(), canvasErrors = [];
  canvas.on('pageerror', e => canvasErrors.push(e.message));
  await canvas.goto(`http://127.0.0.1:${port}/?test&renderer=canvas`, {waitUntil: 'commit'});
  await canvas.waitForFunction(() => !!window.__survival, null, {timeout: 180000});
  assert.equal(await canvas.evaluate(() => window.__survival.game.realism ?? null), null);
  assert.deepEqual(canvasErrors, []);
  assert.deepEqual(errors, []);
  console.log('PASS: sky dome, cutout leaves, separate torch/sky light, night sky, storm precipitation and lightning, Fancy/Fast rebuild and persistence, Canvas fallback.');
} finally { await browser?.close(); server.kill(); }
