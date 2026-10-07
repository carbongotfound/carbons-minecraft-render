import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {chromium} from './browser-runtime.mjs';

const port=10008;await mkdir('artifacts',{recursive:true});
const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port)},stdio:'pipe'});
let browser,page;
try{
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/healthz`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
  const context=await browser.newContext({viewport:{width:1366,height:768}});
  await context.route(/supabase\.(co|in)/,r=>r.abort());
  page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/?test`,{waitUntil:'commit'});
  await page.waitForFunction(()=>!!window.__survival,null,{timeout:180000});
  await page.screenshot({path:'artifacts/classic-title-desktop.png'});
  assert.equal(await page.locator('#loginCode').isVisible(),true);
  assert.equal(await page.locator('#redeemCode').isEnabled(),true);
  assert.equal(await page.locator('#titleFullscreen').isVisible(),true);
  const titleLayout=await page.locator('#title footer').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=document.querySelector('.title-help').getBoundingClientRect().bottom&&r.bottom<=innerHeight;});
  assert.equal(titleLayout,true,'desktop title/footer must fit without overlap');

  await page.evaluate(()=>{
    const a=window.__survival,g=a.game;
    g.net.tick=()=>{};g.net.close=async()=>{};g.net.session={id:'classic-fixture',name:'Explorer',token:'local-only'};
    g.net.edit=async(x,y,z,b)=>{g.world.set(x,y,z,b);return true;};g.net.connected=true;
    g.upgrade.frameStart=()=>{};g.upgrade.flushOutbox=async()=>{};g.upgrade.requestLock=()=>{};g.upgrade.outbox.length=0;
    g.expansion.tick=()=>{};g.paper.tick=()=>{};g.frontier.movement=()=>({x:0,z:0});g.frontier.melee=()=>false;g.frontier.map.tick=()=>{};a.mobs.update=()=>{};
    g.clock.sync({server_ms:Math.max(Date.now(),g.clock.lastServer+1),world_ms:300000,day_length_ms:1200000},performance.now());
    g.playing=true;document.getElementById('title').hidden=true;document.getElementById('hud').hidden=false;
    document.getElementById('connection').textContent='Local visual test';
    g.inv.slots.fill(null);for(const[id,n]of [['grass',32],['log',16],['planks',32],['cobble',32],['table',1],['furnace',1],['diamond_pickaxe',1],['steak',8],['torch',16]])g.inv.add(id,n);
    g.player.yaw=-.4;g.player.pitch=-.08;a.select(0);a.renderHUD();
  });
  await page.waitForTimeout(1500);await page.screenshot({path:'artifacts/classic-world-desktop.png'});
  assert.equal(await page.locator('#worldMapMini').isVisible(),false);
  await page.keyboard.press('F1');assert.equal(await page.locator('#hud').isVisible(),false);
  await page.keyboard.press('F1');assert.equal(await page.locator('#hud').isVisible(),true);
  await page.keyboard.press('e');assert.equal(await page.locator('#inventory').isVisible(),true);
  await page.screenshot({path:'artifacts/classic-inventory-desktop.png'});
  await page.locator('#closeInventory').click();

  const physics=await page.evaluate(()=>{
    const a=window.__survival,g=a.game,p=g.player,w=g.world,keys=g.upgrade.a.keys;
    Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>document.getElementById('world')});
    for(let x=-4;x<=4;x++)for(let z=-7;z<=4;z++){w.set(x,79,z,1);for(let y=80;y<85;y++)w.set(x,y,z,0);}
    const reset=()=>{keys.clear();a.closePanel();Object.assign(p,{x:.5,y:80.02,z:.5,yaw:0,pitch:0});g.health=20;g.hunger=20;g.upgrade.a.setVertical(0);for(let i=0;i<10;i++)a.physics(.01,performance.now()+i*10);};
    reset();keys.add('Space');let peak=p.y;for(let i=0;i<70;i++){a.physics(.01,performance.now()+i*10);peak=Math.max(peak,p.y);if(i===0)keys.delete('Space');}
    const jumpHeight=peak-80;
    reset();keys.add('KeyW');for(let i=0;i<40;i++)a.physics(.01,performance.now()+i*10);keys.clear();const walkingZ=p.z;a.openInventory();for(let i=0;i<40;i++)a.physics(.01,performance.now()+i*10);const menuDrift=Math.abs(p.z-walkingZ);
    reset();for(let z=-7;z<0;z++)w.set(0,79,z,0);keys.add('KeyW');keys.add('ShiftLeft');for(let i=0;i<130;i++)a.physics(.01,performance.now()+i*10);const sneakZ=p.z;
    reset();for(let z=-7;z<0;z++)w.set(0,79,z,1);w.set(0,80,-1,82);w.metadata.set('0,80,-1',{meta:{dir:0}});keys.add('KeyW');let stepPeak=p.y;for(let i=0;i<45;i++){a.physics(.01,performance.now()+i*10);stepPeak=Math.max(stepPeak,p.y);}keys.clear();delete document.pointerLockElement;
    return {jumpHeight,menuDrift,sneakZ,stepPeak};
  });
  assert.ok(physics.jumpHeight>1&&physics.jumpHeight<1.35,JSON.stringify(physics));
  assert.equal(physics.menuDrift,0,'inventory must stop movement');
  assert.ok(physics.sneakZ>-.35,'sneaking must stop at an unsupported edge');
  assert.ok(physics.stepPeak>80.8&&physics.stepPeak<81.6,'stairs must be walkable');

  const mining=await page.evaluate(async()=>{
    const a=window.__survival,g=a.game,w=g.world;
    Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>document.getElementById('world')});
    Object.assign(g.player,{x:.5,y:80.02,z:.5,yaw:0,pitch:0});g.upgrade.a.setVertical(0);
    w.set(0,80,-1,0);w.set(0,81,-2,3);a.select(6);a.physics(.01,performance.now());
    const target=a.target?.b;
    for(let i=0;i<50&&w.get(0,81,-2);i++)await a.mine(.04,performance.now()+i*50);
    const result={target,block:w.get(0,81,-2),wear:g.inv.slots[6]?.wear,drops:g.upgrade.outbox.map(x=>x.item)};
    delete document.pointerLockElement;return result;
  });
  assert.equal(mining.target,3);assert.equal(mining.block,0);assert.equal(mining.wear,1);assert.ok(mining.drops.includes('cobble'));

  await page.setViewportSize({width:1024,height:600});
  await page.evaluate(()=>window.__survival.openInventory());
  assert.equal(await page.locator('.inventory-window').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}),true);
  await page.screenshot({path:'artifacts/classic-inventory-laptop.png'});
  await page.evaluate(()=>window.__survival.closePanel());
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.__survival.openInventory());
  assert.equal(await page.locator('#slots').evaluate(el=>el.getBoundingClientRect().right<=innerWidth),true);
  await page.screenshot({path:'artifacts/classic-inventory-mobile.png'});
  await page.evaluate(()=>window.__survival.closePanel());
  await page.screenshot({path:'artifacts/classic-world-mobile.png'});

  const touchContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await touchContext.route(/supabase\.(co|in)/,r=>r.abort());const touchPage=await touchContext.newPage();
  touchPage.on('pageerror',e=>errors.push(e.message));
  await touchPage.goto(`http://127.0.0.1:${port}/?test`,{waitUntil:'commit'});await touchPage.waitForFunction(()=>!!window.__survival,null,{timeout:180000});
  assert.equal(await touchPage.locator('#touchSprint').count(),1);assert.equal(await touchPage.locator('#touchSneak').count(),1);
  await touchPage.screenshot({path:'artifacts/classic-title-mobile.png'});
  await touchPage.evaluate(()=>{const g=window.__survival.game;g.net.tick=()=>{};g.upgrade.frameStart=()=>{};g.expansion.tick=()=>{};g.paper.tick=()=>{};window.__survival.mobs.update=()=>{};g.playing=true;document.getElementById('title').hidden=true;document.getElementById('hud').hidden=false;document.getElementById('touch').hidden=false;window.__survival.renderHUD();});
  await touchPage.locator('#touchSprint').tap();assert.equal(await touchPage.evaluate(()=>window.__survival.game.browser.sprint),true);
  await touchPage.screenshot({path:'artifacts/classic-touch-controls.png'});
  await touchPage.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await touchPage.locator('#touchSprint').getAttribute('aria-pressed'),'false');
  assert.deepEqual(errors,[]);
  console.log('PASS: title/login layout, compact HUD, F1, inventory controls, jump height, menu input release, ledge sneaking, stair walking, mining/drops/tool wear, laptop/mobile layout and touch sprint/sneak.');
  console.log(JSON.stringify(physics));
}catch(error){await page?.screenshot({path:'artifacts/classic-failure.png'}).catch(()=>{});throw error;}
finally{await browser?.close();server.kill();}
