import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {resolve} from 'node:path';
const port=10003,server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port)},stdio:'pipe',windowsHide:true});
let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/healthz`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});const context=await browser.newContext({viewport:{width:1280,height:720}});
 await context.addInitScript(()=>Object.defineProperty(navigator,'hardwareConcurrency',{value:4}));await context.route(/supabase\.(co|in)/,r=>r.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error'&&!e.text().includes('net::ERR_FAILED'))errors.push(e.text());});
 await page.goto(`http://127.0.0.1:${port}/?test`,{waitUntil:'commit'});await page.waitForFunction(()=>!!window.__survival,null,{timeout:120000});
 assert.equal(await page.evaluate(()=>window.__survival.game.frontier.stream.workers.length),3);
 await page.locator('#titleGraphics').click();assert.equal(await page.locator('#graphicsSettings').isVisible(),true);
 for(const mode of ['none','fxaa','smaa','msaa']){
  await page.locator('#graphics-aa').selectOption(mode);await page.waitForTimeout(250);
  const state=await page.evaluate(()=>{const g=window.__survival.game;return {mode:g.graphics.post.mode,samples:g.graphics.post.sceneTarget?.samples||0,programs:g.view.renderer.info.programs.map(p=>p.diagnostics?.runnable!==false)};});
  console.log('AA',mode);assert.equal(state.mode,mode);assert.ok(state.programs.every(Boolean));if(mode==='msaa')assert.ok(state.samples>=2);
  await page.screenshot({path:resolve(`artifacts/aa-${mode}.png`)});
 }

 // Non-render controls must not resize the canvas or remesh the terrain.
 const churn=await page.evaluate(()=>{const g=__survival.game,r=g.view.renderer,stream=g.frontier.stream;let resized=0,refreshed=0;const size=r.setSize.bind(r),refresh=stream.refresh.bind(stream);r.setSize=(...a)=>{resized++;return size(...a)};stream.refresh=(...a)=>{refreshed++;return refresh(...a)};const before=g.world.dirty.size;g.upgrade.settings.fov=80;g.upgrade.saveSettings();const result={resized,refreshed,dirty:g.world.dirty.size-before};r.setSize=size;stream.refresh=refresh;return result;});
 assert.deepEqual(churn,{resized:0,refreshed:0,dirty:0});
 await page.locator('#graphicsFast').click();assert.equal(await page.locator('#graphics-resolution').inputValue(),'960x540');
 await page.locator('#graphicsUndo').click();assert.equal(await page.locator('#graphics-aa').inputValue(),'msaa');
 await page.locator('#graphicsClassic').click();
 const crisp=await page.evaluate(()=>{const g=__survival.game,p=g.graphics.post;return{aa:p.mode,target:!!p.sceneTarget,color:!!p.colorTarget,smaa:!!p.smaa,lights:g.view.scene.children.filter(c=>c.isPointLight&&c.visible).length};});
 assert.deepEqual(crisp,{aa:'none',target:false,color:false,smaa:false,lights:0});
 await page.screenshot({path:resolve('artifacts/graphics-recovery-presets.png')});
 await page.locator('#graphics-aa').selectOption('fxaa');
 for(const value of ['960x540','1280x720','1920x1080','2560x1440','3840x2160']){
  await page.locator('#graphics-resolution').selectOption(value);const size=await page.evaluate(()=>{const c=document.getElementById('world');return `${c.width}x${c.height}`;});assert.equal(size,value);console.log('Resolution',value);
 }
 await page.locator('#graphics-resolution').selectOption('960x540');await page.locator('#graphicsClose').click();
 await page.evaluate(()=>{
  const a=window.__survival,g=a.game;g.net.session={id:'paper-fixture',token:'test',name:'Paper'};g.net.tick=()=>{};g.net.close=async()=>{};g.upgrade.frameStart=()=>{};g.upgrade.flushOutbox=async()=>{};g.upgrade.requestLock=()=>{};g.expansion.tick=()=>{};g.frontier.map.tick=()=>{};g.frontier.movement=()=>({x:0,z:0});a.mobs.update=()=>{};
  g.clock.sync({server_ms:Date.now(),world_ms:300000,day_length_ms:1200000},performance.now());g.playing=true;document.getElementById('title').hidden=true;document.getElementById('hud').hidden=false;a.openInventory();
 });
 await page.locator('#recipeSearch').fill('bone meal');await page.locator('#recipes button').first().click();assert.match(await page.locator('#recipePreview').innerText(),/3 × Bone meal/);assert.match(await page.locator('#recipePreview').innerText(),/Bone: 0 \/ 1/);
 await page.evaluate(()=>{const a=window.__survival;a.game.inv.add('bone',1);a.renderInventory();});await page.locator('#recipes button').first().click();await page.locator('#craftResult').click();assert.equal(await page.evaluate(()=>window.__survival.carried.id),'bone_meal');
 await page.locator('#recipeSearch').fill('lava');await page.locator('#recipeCategory').selectOption('smelting');await page.locator('#recipes button').first().click();assert.match(await page.locator('#recipePreview').innerText(),/Deepslate/);await page.screenshot({path:resolve('artifacts/lava-recipe.png')});
 const bucket=await page.evaluate(async()=>{
  const a=window.__survival,g=a.game,e=g.expansion;a.closePanel();g.upgrade.a.panel='test';const p=g.player,x=Math.floor(p.x),y=Math.floor(p.y+1.55),z=Math.floor(p.z)-2;
  for(let dz=0;dz<=3;dz++)g.world.set(x,y,Math.floor(p.z)-dz,0);p.x=x+.5;p.z=Math.floor(p.z)+.5;g.direction.set(0,0,-1);g.world.set(x,y,z,14);g.inv.slots.fill(null);g.inv.add('bucket',1);a.select(0);
  e.batch=async edits=>{for(const v of edits)g.world.set(v.x,v.y,v.z,v.block);};e.edit=async(x,y,z,b,meta)=>{g.world.set(x,y,z,b);g.world.metadata.set(`${x},${y},${z}`,{meta,updated_at:new Date(g.clock.serverMs()).toISOString()});};
  await e.useBucket('bucket',null);const water=g.inv.count('water_bucket');await e.useBucket('water_bucket',{x,y:y-1,z,n:[0,1,0]});const placed=g.world.get(x,y,z);
  g.world.set(x,y,z,49);await e.useBucket('bucket',null);return {water,placed,lava:g.inv.count('lava_bucket')};
 });assert.deepEqual(bucket,{water:1,placed:14,lava:1});
 const delay=await page.evaluate(async()=>{const g=window.__survival.game,u=g.upgrade;g.inv.slots[0]={id:'cobble',count:2};u.a.panel=null;const serverMs=g.clock.serverMs.bind(g.clock),now=serverMs();g.clock.serverMs=()=>now;u.dropSelected();const row=u.outbox.at(-1);let requests=0;u.rpc=async()=>{requests++;return{claimed:true,id:'cobble',count:1};};const before=g.inv.count('cobble');await u.claim(row.id);g.clock.serverMs=serverMs;return {flag:row.player_dropped,requests,unchanged:g.inv.count('cobble')===before};});assert.deepEqual(delay,{flag:true,requests:0,unchanged:true});
 const lighting=await page.evaluate(()=>{const g=window.__survival.game,p=g.player;for(let i=0;i<140;i++){const x=Math.floor(p.x)-7+i%14,y=Math.floor(p.y)+5,z=Math.floor(p.z)-5+Math.floor(i/14);g.world.set(x,y,z,18);g.world.versions.set(`${x},${y},${z}`,999);}g.upgrade.settings.maxLights=2;g.lighting.invalidate();g.lighting.tick(performance.now());const low=g.lighting.loaded;g.upgrade.settings.maxLights=128;g.lighting.invalidate();g.lighting.tick(performance.now());return{low,high:g.lighting.loaded};});assert.deepEqual(lighting,{low:2,high:128});
 const meal=await page.evaluate(async()=>{const a=window.__survival,g=a.game,p=g.player,x=Math.floor(p.x)+3,y=Math.floor(p.y)+1,z=Math.floor(p.z);g.world.set(x,y,z,26);g.world.metadata.set(`${x},${y},${z}`,{updated_at:new Date(g.clock.serverMs()).toISOString(),meta:{}});g.inv.slots[0]={id:'bone_meal',count:2};a.select(0);g.expansion.handleUse({x,y,z,b:26,n:[0,1,0]},performance.now());for(let i=0;i<30&&g.expansion.busy;i++)await new Promise(r=>setTimeout(r,10));return{remaining:g.inv.slots[0].count,growth:g.world.metadata.get(`${x},${y},${z}`).meta.growth};});assert.equal(meal.remaining,1);assert.ok(meal.growth>=60);
 await page.keyboard.press('Control+F3');await page.waitForFunction(()=>document.getElementById('frontierDebugV7').textContent.includes('Render 960'));assert.match(await page.locator('#frontierDebugV7').innerText(),/Render 960 × 540/);
 // Account isolation uses the real loading/save path with an isolated RPC store.
 const accounts=await page.evaluate(async()=>{const g=window.__survival.game,gr=g.graphics,store={A:{settings:{resolution:'1920x1080',aa:'smaa',maxLights:32,sound:true,viewMode:2}},B:{settings:{resolution:'960x540',aa:'none',maxLights:2}}};g.net.client.rpc=async(name,args)=>{const id=args.p_id;if(args.p.settings)store[id]={settings:args.p.settings};return{data:store[id]||{settings:null},error:null};};g.net.session.id='A';await gr.loadAccount();const a=g.upgrade.settings.resolution,view=g.upgrade.viewMode,sound=document.getElementById('soundBtn').textContent;g.net.session.id='B';await gr.loadAccount();const b=g.upgrade.settings.resolution;return{a,b,lights:g.upgrade.settings.maxLights,view,sound};});assert.deepEqual(accounts,{a:'1920x1080',b:'960x540',lights:2,view:2,sound:'Sound: ON'});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.__survival.game.graphics.open());assert.ok(await page.locator('#graphicsSettings').isVisible());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:resolve('artifacts/graphics-mobile.png')});
 assert.deepEqual(errors,[]);console.log('PASS: real AA modes, resolution buffers, graphics menu/mobile, 75% workers, visible recipes, bone meal crafting, water/lava buckets, pickup delay, debug display and account isolation. External HTTP isolated.');
}finally{await browser?.close();server.kill();}
