import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const port=10004,base=`http://127.0.0.1:${port}`;await mkdir('artifacts',{recursive:true});
const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port)},stdio:'pipe',windowsHide:true});
let browser;
const accounts=new Map,saves=new Map,options=new Map,errors=[];
try{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
 async function device(){
  const c=await browser.newContext({viewport:{width:1280,height:720}});
  await c.route(/supabase\.(co|in)/,async route=>{
   const req=route.request(),name=new URL(req.url()).pathname.split('/').at(-1);let data=[];const p=req.postDataJSON()||{};
   if(name.startsWith('carbon_login_code_'))return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({code:'PGRST202',message:'RPC not installed; use Render code service'})});
   if(name==='carbon_survival_join_v3'){
    let a=[...accounts.values()].find(a=>a.token===p.p_token);if(!a){a={id:crypto.randomUUID(),token:crypto.randomUUID(),name:p.p_name,color:'#73a4ae'};accounts.set(a.id,a);}data=a;
   }else if(name==='carbon_account_save'){
    assert.equal(accounts.get(p.p_id)?.token,p.p_token);let row=saves.get(p.p_id)||{state:null,revision:0};saves.set(p.p_id,row);
    if(p.p_op==='load'){row.writer=p.p_writer;data={owner:p.p_id,state:row.state,revision:row.revision};}
    else if(row.writer!==p.p_writer)data={ok:false,reason:'account_open_elsewhere'};
    else{assert.equal(p.p_revision,row.revision);row.state=p.p_state;row.revision++;data={ok:true,owner:p.p_id,revision:row.revision};}
   }else if(name==='carbon_object_v6'&&p.p_op==='settings'){
    if(p.p.settings)options.set(p.p_id,p.p.settings);data={settings:options.get(p.p_id)||null};
   }else if(name==='carbon_http_poll_v8')data={clock:{server_ms:Date.now(),world_ms:300000,day_length_ms:1200000},players:[],hosts:[],blocks:[],chat:[],combat:[],presence:[]};
   else if(name==='carbon_progress_v4')data=p.p_op==='boss_read'?{health:200,defeated:false,crystals:[]}:{ok:true};
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  const page=await c.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});
  await page.goto(base+'/?test');await page.waitForFunction(()=>!!window.__survival,null,{timeout:120000});
  await page.evaluate(()=>{const g=__survival.game;g.frontier.auth.openLive=async()=>false;g.upgrade.requestLock=()=>{};});
  return {page,context:c};
 }
 async function join(page,name){await page.locator('#name').fill(name);await page.locator('#join').click();await page.waitForFunction(()=>__survival.game.playing&&document.getElementById('title').hidden,null,{timeout:90000});await page.waitForTimeout(300);}
 const original=await device();await join(original.page,'Account A');
 const a=await original.page.evaluate(async()=>{const a=__survival,g=a.game;g.inv.slots.fill(null);g.inv.add('diamond',7);g.xp=33;g.saturation=9;g.upgrade.settings.resolution='960x540';g.upgrade.settings.aa='none';g.upgrade.settings.maxLights=2;g.upgrade.saveSettings();a.save();await g.accountSaves.flush();await g.graphics.flush();g.upgrade.a.panel='pause';document.getElementById('pause').hidden=false;return g.net.session.id;});
 await original.page.locator('#makeLoginCode').click();await original.page.waitForFunction(()=>document.getElementById('loginCodeShow').textContent.includes('Code '));
 const code=(await original.page.locator('#loginCodeShow').innerText()).match(/Code ([A-Z0-9]{6})/)[1];await original.context.close();
 const second=await device();await join(second.page,'Account B');
 const b=await second.page.evaluate(async()=>{const a=__survival,g=a.game;g.inv.slots.fill(null);g.inv.add('gold',9);g.xp=4;a.save();await g.accountSaves.flush();g.upgrade.a.panel='pause';document.getElementById('pause').hidden=false;return g.net.session.id;});assert.notEqual(a,b);
 await second.page.locator('#leaveBtn').click();await second.page.waitForFunction(()=>!!window.__survival&&!__survival.game.playing&&document.getElementById('title').hidden===false,null,{timeout:120000});
 await second.page.evaluate(()=>{__survival.game.frontier.auth.openLive=async()=>false;__survival.game.upgrade.requestLock=()=>{};});
 await second.page.locator('#name').fill('');await second.page.locator('#loginCode').fill(code);await second.page.locator('#redeemCode').click();
 await second.page.waitForFunction(()=>__survival.game.playing&&document.getElementById('title').hidden,null,{timeout:90000});
 const loaded=await second.page.evaluate(()=>{const g=__survival.game;return{id:g.net.session.id,name:g.net.session.name,diamond:g.inv.count('diamond'),gold:g.inv.count('gold'),xp:g.xp,settings:g.upgrade.settings.resolution,aa:g.upgrade.settings.aa};});
 assert.deepEqual(loaded,{id:a,name:'Account A',diamond:7,gold:0,xp:33,settings:'960x540',aa:'none'});assert.equal(saves.get(b).state.inventory.find(s=>s?.id==='gold').count,9);
 const reuse=await fetch(base+'/api/link-redeem',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code})});assert.equal(reuse.status,400);
 await second.page.screenshot({path:'artifacts/account-transfer.png'});assert.deepEqual(errors,[]);
 console.log('PASS: actual login-code buttons restore account A on a device previously used by B, including inventory, XP, name and settings; B stays unchanged; code reuse rejected. Database HTTP isolated.');
}finally{await browser?.close();server.kill();}
