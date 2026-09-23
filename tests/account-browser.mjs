import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const port=10004,base=`http://127.0.0.1:${port}`;await mkdir('artifacts',{recursive:true});
const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port)},stdio:'pipe',windowsHide:true});
let browser,latestPage,failLoad=false;
const accounts=new Map,saves=new Map,options=new Map,histories=new Map,errors=[];
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
    if(failLoad&&p.p_op==='load'){failLoad=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Temporary save failure'})});}
    assert.equal(accounts.get(p.p_id)?.token,p.p_token);let row=saves.get(p.p_id)||{state:null,revision:0};saves.set(p.p_id,row);
    const history=histories.get(p.p_id)||[];histories.set(p.p_id,history);
    const checkpoint=reason=>{if(row.state&&!history.some(h=>h.revision===row.revision))history.unshift({revision:row.revision,state:structuredClone(row.state),inventory:row.state.inventory,xp:row.state.xp,reason,time:new Date().toISOString()});};
    if(p.p_op==='history')data={owner:p.p_id,history};
    else if(p.p_op==='read')data={owner:p.p_id,state:history.find(h=>h.revision===p.p_revision)?.state};
    else if(p.p_op==='load'){checkpoint('Before joining');row.writer=p.p_writer;data={owner:p.p_id,state:row.state,revision:row.revision};}
    else if(row.writer!==p.p_writer)data={ok:false,reason:'account_open_elsewhere'};
    else if(p.p_revision!==row.revision){console.log('REVISION CONFLICT',p.p_op,accounts.get(p.p_id).name,p.p_revision,row.revision);data={ok:false,reason:'save_conflict'};}
    else{checkpoint(p.p_op==='restore'?'Before restoring progress':'Checkpoint');if(p.p_op!=='checkpoint'){row.state=p.p_state;row.revision++;}data={ok:true,owner:p.p_id,revision:row.revision};}
   }else if(name==='carbon_object_v6'&&p.p_op==='settings'){
    if(p.p.settings)options.set(p.p_id,p.p.settings);data={settings:options.get(p.p_id)||null};
   }else if(name==='carbon_http_poll_v8')data={clock:{server_ms:Date.now(),world_ms:300000,day_length_ms:1200000},players:[],hosts:[],blocks:[],chat:[],combat:[],presence:[]};
   else if(name==='carbon_progress_v4')data=p.p_op==='boss_read'?{health:200,defeated:false,crystals:[]}:{ok:true};
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  const page=await c.newPage();latestPage=page;page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});
  await page.addInitScript(()=>{window.addEventListener('load',()=>{const timer=setInterval(()=>{if(window.__survival){__survival.game.frontier.auth.openLive=async()=>false;__survival.game.upgrade.requestLock=()=>{};clearInterval(timer);}},10);});});
  await page.goto(base+'/?test');await page.waitForFunction(()=>!!window.__survival,null,{timeout:120000});
  await page.evaluate(()=>{const g=__survival.game;g.frontier.auth.openLive=async()=>false;g.upgrade.requestLock=()=>{};});
  return {page,context:c};
 }
 async function join(page,name){await page.locator('#name').fill(name);await page.locator('#join').click();await page.waitForFunction(()=>__survival.game.playing&&!__survival.game.joining&&document.getElementById('title').hidden,null,{timeout:90000});await page.waitForTimeout(300);}
 console.log('Testing code transfer');
 const original=await device();await join(original.page,'Account A');
 const a=await original.page.evaluate(async()=>{const a=__survival,g=a.game;g.inv.slots.fill(null);g.inv.add('diamond',7);g.xp=33;g.saturation=9;g.upgrade.settings.resolution='960x540';g.upgrade.settings.aa='none';g.upgrade.settings.maxLights=2;g.upgrade.saveSettings();a.save();await g.accountSaves.flush();await g.graphics.flush();g.upgrade.a.panel='pause';document.getElementById('pause').hidden=false;return g.net.session.id;});
 await original.page.locator('#makeLoginCode').click();await original.page.waitForFunction(()=>document.getElementById('loginCodeShow').textContent.includes('Code '));
 const code=(await original.page.locator('#loginCodeShow').innerText()).match(/Code ([A-Z0-9]{6})/)[1];await original.context.close();
 const second=await device();await join(second.page,'Account B');
 const b=await second.page.evaluate(async()=>{const a=__survival,g=a.game;g.inv.slots.fill(null);g.inv.add('gold',9);g.xp=4;a.save();await g.accountSaves.flush();g.upgrade.a.panel='pause';document.getElementById('pause').hidden=false;return g.net.session.id;});assert.notEqual(a,b);
 await second.page.locator('#leaveBtn').click();await second.page.waitForFunction(()=>!!window.__survival&&!__survival.game.playing&&!__survival.game.joining&&document.getElementById('title').hidden===false,null,{timeout:120000});
 await second.page.evaluate(()=>{__survival.game.frontier.auth.openLive=async()=>false;__survival.game.upgrade.requestLock=()=>{};});
 await second.page.locator('#name').fill('');await second.page.locator('#loginCode').fill(code);await second.page.locator('#redeemCode').click();
 await second.page.waitForFunction(()=>__survival.game.playing&&!__survival.game.joining&&document.getElementById('title').hidden,null,{timeout:90000});
 const loaded=await second.page.evaluate(()=>{const g=__survival.game;return{id:g.net.session.id,name:g.net.session.name,diamond:g.inv.count('diamond'),gold:g.inv.count('gold'),xp:g.xp,settings:g.upgrade.settings.resolution,aa:g.upgrade.settings.aa};});
 assert.deepEqual(loaded,{id:a,name:'Account A',diamond:7,gold:0,xp:33,settings:'960x540',aa:'none'});assert.equal(saves.get(b).state.inventory.find(s=>s?.id==='gold').count,9);
 const reuse=await fetch(base+'/api/link-redeem',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code})});assert.equal(reuse.status,400);

 console.log('Testing account undo');
 // Undo the mistaken login from the actual pause-menu recovery controls.
 await second.page.evaluate(()=>{__survival.game.upgrade.a.panel='pause';document.getElementById('pause').hidden=false;});
 await second.page.locator('#pauseRecovery').click();
 await second.page.locator('#undoAccountSwitch').click();
 await second.page.waitForFunction(id=>window.__survival?.game.playing&&__survival.game.net.session?.id===id,b,{timeout:120000});
 const restoredB=await second.page.evaluate(()=>{const g=__survival.game;return {name:g.net.session.name,gold:g.inv.count('gold'),diamond:g.inv.count('diamond'),xp:g.xp};});
 assert.deepEqual(restoredB,{name:'Account B',gold:9,diamond:0,xp:4});
 assert.equal(saves.get(a).state.inventory.find(s=>s?.id==='diamond').count,7);
 console.log('Testing local restore');
 // An old local save remains discoverable even if its old login token was lost.
 await second.page.evaluate(()=>{localStorage.setItem('carbon-survival-v1',JSON.stringify({inventory:[{id:'emerald',count:11}],xp:55}));__survival.game.upgrade.a.panel='pause';document.getElementById('pause').hidden=false;});
 await second.page.locator('#leaveBtn').click();
 await second.page.waitForFunction(()=>!!window.__survival&&!__survival.game.playing&&!__survival.game.joining,null,{timeout:120000});
 await second.page.locator('#titleRecovery').click();
 const legacyRestore=second.page.locator('.recovery-row').filter({hasText:'Old device save'}).filter({hasText:'Before account saves'}).getByRole('button');
 assert.equal(await legacyRestore.isEnabled(),true);
 await legacyRestore.click();assert.ok(await second.page.getByRole('heading',{name:'Where should this backup be restored?'}).isVisible());
 await second.page.locator('#recoveryConfirm').getByRole('button',{name:'Cancel',exact:true}).click();
 assert.equal(saves.get(b).state.inventory.find(s=>s?.id==='gold').count,9);
 await legacyRestore.click();await second.page.locator('#recoveryConfirm').getByRole('button',{name:'Continue with Account B',exact:true}).click();
 await second.page.waitForFunction(()=>window.__survival?.game.playing&&!__survival.game.joining&&!document.getElementById('saveRecovery').hidden&&!document.getElementById('recoveryConfirm').hidden,null,{timeout:120000});
 assert.match(await second.page.locator('#recoveryConfirm').innerText(),/Restore this backup into Account B/);
 assert.equal(await second.page.evaluate(()=>__survival.game.inv.count('gold')),9);
 assert.equal(await second.page.evaluate(()=>document.pointerLockElement),null);
 await second.page.screenshot({path:'artifacts/restore-from-title-confirm.png'});
 await second.page.locator('#confirmRestore').click();
 await second.page.waitForFunction(()=>window.__survival?.game.playing&&__survival.game.inv.count('emerald')===11,null,{timeout:120000});
 assert.equal(saves.get(b).state.xp,55);assert.ok(histories.get(b).some(h=>h.state.inventory.some(s=>s?.id==='gold'&&s.count===9)));
 console.log('Testing cloud restore');
 // Undo the progress restore using the previous cloud checkpoint, also via UI.
 await second.page.evaluate(()=>{__survival.game.upgrade.a.panel='pause';document.getElementById('pause').hidden=false;});
 await second.page.locator('#pauseRecovery').click();
 await second.page.locator('.recovery-row').filter({hasText:'Cloud:'}).filter({hasText:'9 gold'}).first().getByRole('button').click();
 await second.page.locator('#confirmRestore').click();
 await second.page.waitForFunction(()=>window.__survival?.game.playing&&__survival.game.inv.count('gold')===9,null,{timeout:120000});
 assert.equal(saves.get(b).state.xp,4);
 console.log('Testing browser restart');
 // Browser restart: persistent account credentials find B without making C.
 await second.page.evaluate(()=>sessionStorage.clear());await second.page.reload();
 await second.page.waitForFunction(()=>!!window.__survival,null,{timeout:120000});await join(second.page,'Account B');
 assert.equal(await second.page.evaluate(()=>__survival.game.net.session.id),b);assert.equal(accounts.size,2);

 console.log('Testing failed login rollback');
 // A consumed login code followed by a failed save load must preserve both logins.
 const issued=await (await fetch(base+'/api/link-code',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(accounts.get(a))})).json();
 await second.page.evaluate(()=>{__survival.game.upgrade.a.panel='pause';document.getElementById('pause').hidden=false;});
 await second.page.locator('#leaveBtn').click();await second.page.waitForFunction(()=>!!window.__survival&&!__survival.game.playing,null,{timeout:120000});
 failLoad=true;await second.page.locator('#loginCode').fill(issued.code);await second.page.locator('#redeemCode').click();
 await second.page.waitForFunction(()=>!__survival.game.joining&&document.getElementById('joinError').textContent.includes('Temporary save failure'),null,{timeout:120000});
 const failure=await second.page.evaluate(()=>({token:sessionStorage.getItem('carbon-session-v8'),accounts:JSON.parse(localStorage.getItem('carbon-accounts-v1')).length}));assert.equal(failure.token,accounts.get(b).token);assert.equal(failure.accounts,2);
 await second.page.locator('#titleRecovery').click();assert.ok(await second.page.getByRole('button',{name:'Open Account A',exact:true}).isVisible());

 // A lost credential can be rescued into a separate account without overwriting
 // the account from the mistaken code. The original credentials stay available.
 await second.page.locator('.recovery-row').filter({hasText:'Old device save'}).filter({hasText:'Before account saves'}).getByRole('button').click();
 await second.page.locator('#restoreAccountName').fill('Rescued survivor');await second.page.locator('#restoreNewAccount').click();
 await second.page.waitForFunction(()=>window.__survival?.game.playing&&!__survival.game.joining&&__survival.game.net.session?.name==='Rescued survivor',null,{timeout:120000});
 const c=await second.page.evaluate(()=>__survival.game.net.session.id);assert.notEqual(c,a);assert.notEqual(c,b);
 await second.page.waitForFunction(()=>!document.getElementById('recoveryConfirm').hidden);
 assert.match(await second.page.locator('#recoveryConfirm').innerText(),/Restore this backup into Rescued survivor/);
 assert.equal(await second.page.evaluate(()=>__survival.game.inv.count('emerald')),0);
 await second.page.locator('#confirmRestore').click();
 await second.page.waitForFunction(()=>window.__survival?.game.playing&&!__survival.game.joining&&__survival.game.inv.count('emerald')===11,null,{timeout:120000});
 assert.equal(saves.get(a).state.inventory.find(s=>s?.id==='diamond').count,7);assert.equal(saves.get(b).state.inventory.find(s=>s?.id==='gold').count,9);assert.equal(saves.get(c).state.xp,55);
 await second.page.screenshot({path:'artifacts/account-transfer.png'});assert.deepEqual(errors,[]);
 console.log('PASS: actual login-code buttons restore account A on a device previously used by B, including inventory, XP, name and settings; B stays unchanged; undo account switch, local rescue, undo progress restore and browser restart all retrieve the right data; code reuse rejected; title-screen restore is clickable and retains the selected backup across existing/new account sign-in; no restore occurs before confirmation. Database HTTP isolated.');
}catch(error){if(latestPage&&!latestPage.isClosed()){console.log(await latestPage.evaluate(()=>({toast:document.getElementById('toast')?.textContent,join:document.getElementById('joinError')?.textContent,code:document.getElementById('loginCodeShow')?.textContent,playing:window.__survival?.game.playing,saveError:window.__survival?.game.accountSaveError})));await latestPage.screenshot({path:'artifacts/account-recovery-failure.png'});}throw error;}finally{await browser?.close();server.kill();}
