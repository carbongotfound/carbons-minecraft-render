import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const port = '10002', output = resolve('artifacts');
await mkdir(output, {recursive:true});
const server = spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:port},stdio:'pipe',windowsHide:true});
let browser;
try {
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/healthz`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser = await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
  let worldBase = 900000, serverBase = Date.now();
  const sample = () => ({server_ms:Date.now(),world_ms:worldBase+Date.now()-serverBase,day_length_ms:1200000});
  const pages=[], errors=[];
  for(const skew of [-7*86400000,9*86400000]){
    const context=await browser.newContext({viewport:{width:1280,height:800}});
    await context.route(/supabase\.(co|in)/,route=>route.abort());
    await context.addInitScript(skew=>{const real=Date.now;Date.now=()=>real()+skew;localStorage.setItem('carbon-survival-v1',JSON.stringify({clockOffset:skew}));},skew);
    await context.exposeFunction('__clockPoll',()=>({data:{clock:sample(),players:[],hosts:[],blocks:[],chat:[],combat:[]},error:null}));
    await context.exposeFunction('__clockSleep',()=>{worldBase=1290000;serverBase=Date.now();return{clock:sample(),slept:true};});
    const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/?test`,{waitUntil:'commit'});
    await page.waitForFunction(()=>!!window.__survival,null,{timeout:120000});
    await page.evaluate(()=>{
      const a=window.__survival,g=a.game;
      g.net.session={id:crypto.randomUUID(),name:'Clock fixture',color:'#ffffff',token:'fixture'};
      g.net.position=()=>g.player;g.net.tick=()=>{};g.upgrade.frameStart=()=>{};g.upgrade.requestLock=()=>{};
      g.expansion.tick=()=>{};g.paper.tick=()=>{};a.mobs.update=()=>{};g.frontier.melee=()=>false;
      g.frontier.movement=()=>({x:0,z:0});g.frontier.map.tick=()=>{};
      g.frontier.auth.rawRpc=()=>window.__clockPoll();g.upgrade.rpc=()=>window.__clockSleep();
      g.playing=true;document.getElementById('title').hidden=true;document.getElementById('hud').hidden=false;
    });
  }
  const poll=page=>page.evaluate(()=>window.__survival.game.frontier.auth.poll(true));
  await Promise.all(pages.map(poll));
  for(const page of pages)await page.waitForFunction(()=>window.__survival.night===true);
  const state=page=>page.evaluate(()=>{
    const a=window.__survival,g=a.game;g.paper.updateWeather();
    return{ms:g.clock.worldMs(),night:a.night,sky:g.view.scene.background.getHexString(),weather:g.paper.weatherState(),label:g.clock.label()};
  });
  const night=await Promise.all(pages.map(state));
  assert.ok(Math.abs(night[0].ms-night[1].ms)<1000);
  assert.equal(night[0].sky,night[1].sky);assert.equal(night[0].weather,night[1].weather);
  await pages[0].screenshot({path:resolve(output,'shared-night.png')});
  // Real bed interaction consumes a server sleep response; the second player
  // learns about the new morning through the regular HTTP poll path.
  await pages[0].evaluate(()=>window.__survival.game.upgrade.handleUse({x:0,y:30,z:0,b:20,n:[0,1,0]},performance.now()));
  await pages[0].waitForFunction(()=>window.__survival.game.clock.day()===2);
  await poll(pages[1]);
  for(const page of pages)await page.waitForFunction(()=>window.__survival.night===false);
  const morning=await Promise.all(pages.map(state));
  assert.ok(Math.abs(morning[0].ms-morning[1].ms)<1000);assert.equal(morning[0].sky,morning[1].sky);
  assert.match(morning[1].label,/Day 2/);
  await pages[1].evaluate(()=>{Date.now=()=>1;});await poll(pages[1]);
  assert.equal((await state(pages[1])).night,false);
  await pages[0].screenshot({path:resolve(output,'shared-morning.png')});

  const mobs=await pages[0].evaluate(async()=>{
    const a=window.__survival,g=a.game,m=a.mobs,{TYPES}=await import('/src/mobs.js');
    const oldWorld=g.world,oldPlayer={...g.player},oldSeed=m.seed,oldSpawn=m.lastSpawn;
    const authority=Object.getOwnPropertyDescriptor(m,'authority');
    Object.defineProperty(m,'authority',{configurable:true,value:true});
    g.world={get:(_x,y)=>y===19?3:0,collide:()=>false,ray:()=>null};m.seed=()=>{};m.lastSpawn=Infinity;
    Object.assign(g.player,{x:0,y:20,z:0});g.paper.weather='clear';g.health=20;a.setInvulnerable(0);
    m.add({id:'fixture-spider',kind:'spider',x:1,y:20,z:0,hp:16,yaw:0,phase:10});
    m.simulate(.05,performance.now(),false);const calmHealth=g.health;
    m.add({id:'fixture-creeper',kind:'creeper',x:5,y:20,z:0,hp:TYPES.creeper.hp,yaw:0,phase:0});
    m.hurtMob(m.mobs.get('fixture-creeper'),1,g.net.session.id,g.player);const creeperHP=m.mobs.get('fixture-creeper').hp;
    for(const [id,x]of [['fixture-cow-a',2],['fixture-cow-b',3]])m.add({id,kind:'cow',x,y:20,z:0,hp:10,yaw:0,phase:0});
    const first=g.parity.breed(g.net.session.id,'fixture-cow-a','wheat'),second=g.parity.breed(g.net.session.id,'fixture-cow-b','wheat');
    const baby=[...m.mobs.values()].find(v=>v.id.startsWith('baby-'));
    g.frontier.auth.lastMobPublish=-Infinity;const published=g.frontier.auth.mobSnapshot()?.find(v=>v.id===baby?.id);
    const grownIn=baby?baby.babyUntil-g.clock.serverMs():0;
    for(const id of [...m.mobs.keys()])m.remove(id);
    g.world=oldWorld;Object.assign(g.player,oldPlayer);m.seed=oldSeed;m.lastSpawn=oldSpawn;
    if(authority)Object.defineProperty(m,'authority',authority);else delete m.authority;
    return{calmHealth,creeperHP,first,second,hasBaby:!!baby,grownIn,publishedAge:published?.babyUntil};
  });
  assert.equal(mobs.calmHealth,20);assert.equal(mobs.creeperHP,19);
  assert.equal(mobs.first,true);assert.equal(mobs.second,true);assert.equal(mobs.hasBaby,true);
  assert.ok(mobs.grownIn>1199000&&mobs.grownIn<=1200000);assert.ok(mobs.publishedAge>0);
  await pages[0].evaluate(async()=>{
    const a=window.__survival,{discover}=await import('/src/exploration.js'),{frontierSites}=await import('/src/frontier-gen.js');
    discover(a.game.exploration.state,frontierSites()[0],'overworld');a.save();a.game.expansion.openJournal();
  });
  await pages[0].getByRole('button',{name:'Exploration',exact:true}).click();
  assert.match(await pages[0].locator('#expansionBody').innerText(),/Underground discoveries · 1 \/ 20/);
  const saved=await pages[0].evaluate(()=>JSON.parse(localStorage.getItem('carbon-survival-v1')));
  assert.equal(saved.clockOffset,undefined);assert.equal(saved.exploration.sites['frontier-0'],true);
  await pages[0].screenshot({path:resolve(output,'exploration-journal.png')});
  assert.deepEqual(errors,[]);
  console.log('PASS: two real game clients with 16-day device-clock disagreement share night, morning, weather and sleep; daylight spiders, creeper health, breeding, replicated baby age and exploration saves. HTTP payloads isolated; live SQL RPCs tested separately.');
}finally{await browser?.close();server.kill();}
