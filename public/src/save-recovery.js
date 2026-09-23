const ACCOUNTS='carbon-accounts-v1', BACKUPS='carbon-recovery-v1', ACTIVE='carbon-active-account';
export const readLocal=key=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};
const put=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
export const savedAccounts=()=>readLocal(ACCOUNTS)||[];
export function rememberAccount(account){
 if(!account?.token)return;
 const entries=savedAccounts().filter(a=>a.token!==account.token&&(!account.id||a.id!==account.id));
 entries.unshift({id:account.id||null,token:account.token,name:account.name||'Previous device account',time:Date.now()});
 put(ACCOUNTS,entries);
}
export function backupSave(state,{owner=null,name='',reason='Local checkpoint',time=Date.now()}={}){
 if(!state||!Array.isArray(state.inventory))return;
 const list=readLocal(BACKUPS)||[],json=JSON.stringify(state);
 if(list.some(b=>b.owner===owner&&JSON.stringify(b.state)===json))return;
 list.unshift({id:crypto.randomUUID(),owner:owner||state.owner||null,name,time,reason,state:structuredClone(state)});
 // Preserve the earliest snapshot for every account as well as recent backups.
 const anchors=new Set;for(let i=list.length-1;i>=0;i--)if(!anchors.has(list[i].owner)){anchors.add(list[i].owner);list[i].anchor=true;}else list[i].anchor=false;
 while(list.length>20||JSON.stringify(list).length>2200000){let i=list.findLastIndex((b,i)=>i>0&&!b.anchor);if(i<0)throw Error('Backup storage is full. Download backups before changing accounts.');list.splice(i,1);}
 put(BACKUPS,list);
}
export function localBackups(){
 const list=[...(readLocal(BACKUPS)||[])];
 const legacy=readLocal('carbon-survival-v1');if(legacy?.inventory)list.unshift({id:'legacy',owner:legacy.owner||null,name:'Old device save',reason:'Before account saves',state:legacy});
 for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key?.startsWith('carbon-save-account:'))continue;const cached=readLocal(key),owner=key.slice(20);if(cached?.state?.inventory)list.unshift({id:key,owner,name:savedAccounts().find(a=>a.id===owner)?.name||'Saved account '+owner.slice(0,8),reason:cached.dirty?'Unsynced device save':'Latest device save',time:cached.time,state:cached.state});}
 return list;
}
export function restoreDeviceLogin(){
 if(sessionStorage.getItem('carbon-session-v8'))return;
 // A deliberate new account must not silently reopen the previous one.
 if(JSON.parse(sessionStorage.getItem('carbon-pending-switch')||'null')?.target?.fresh)return;
 const active=localStorage.getItem(ACTIVE),account=savedAccounts().find(a=>a.id===active);
 if(account){sessionStorage.setItem('carbon-session-v8',account.token);sessionStorage.setItem('carbon-account-id',account.id);sessionStorage.setItem('carbon-expected-account',account.id);}
}
export function installSaveRecovery(game){return game.recovery=new SaveRecovery(game);}
class SaveRecovery {
 constructor(game){
  this.g=game;this.installUI();
  const expected=sessionStorage.getItem('carbon-expected-account')||sessionStorage.getItem('carbon-account-id');if(expected)game.net.expectedAccountId=expected;
 }
 current(){const token=sessionStorage.getItem('carbon-session-v8');if(!token)return null;return this.g.net.session?.token===token?this.g.net.session:{token,id:sessionStorage.getItem('carbon-account-id'),name:localStorage.getItem('carbon-survival-name')||'Previous device account'};}
 stage(target){
  const previous=this.current();if(previous)rememberAccount(previous);
  for(const b of localBackups())if(b.id==='legacy'||b.id.startsWith('carbon-save-account:'))backupSave(b.state,{...b,reason:'Before account switch'});
  rememberAccount(target); // Keep a redeemed code usable if the following join fails.
  sessionStorage.setItem('carbon-pending-switch',JSON.stringify({previous,target}));
  if(target.token)sessionStorage.setItem('carbon-session-v8',target.token);else sessionStorage.removeItem('carbon-session-v8');
  if(target.id)sessionStorage.setItem('carbon-expected-account',target.id);else sessionStorage.removeItem('carbon-expected-account');
  sessionStorage.removeItem('carbon-account-id');this.g.net.expectedAccountId=target.id||null;
  localStorage.setItem('carbon-survival-name',target.name||'Survivor');document.getElementById('name').value=target.name||'Survivor';
 }
 joined(account){
  rememberAccount(account);localStorage.setItem(ACTIVE,account.id);
  const pending=JSON.parse(sessionStorage.getItem('carbon-pending-switch')||'null');
  if(pending?.previous&&pending.previous.token!==account.token)put('carbon-previous-account',pending.previous);
  sessionStorage.removeItem('carbon-pending-switch');sessionStorage.removeItem('carbon-expected-account');
 }
 failed(){
  const pending=JSON.parse(sessionStorage.getItem('carbon-pending-switch')||'null');if(!pending)return;
  const p=pending.previous;
  if(p){sessionStorage.setItem('carbon-session-v8',p.token);if(p.id)sessionStorage.setItem('carbon-account-id',p.id);else sessionStorage.removeItem('carbon-account-id');document.getElementById('name').value=p.name;localStorage.setItem('carbon-survival-name',p.name);}
  else{sessionStorage.removeItem('carbon-session-v8');sessionStorage.removeItem('carbon-account-id');}
  sessionStorage.removeItem('carbon-pending-switch');sessionStorage.removeItem('carbon-expected-account');this.g.net.expectedAccountId=null;
 }
 async preserve(){
  if(!this.g.playing)return;
  this.g.upgrade.a.save();this.g.playing=false;
  await this.g.accountSaves.flush();await this.g.graphics.flush();
  const r=await this.g.accountSaves.rpc('checkpoint');if(!r?.ok)throw Error('Account changed on another device. Rejoin before switching.');
 }
 async activate(account){
  const playing=this.g.playing;
  try{await this.preserve();this.stage(account);this.g.playing=false;this.g.accountSaves.ready=false;
   await this.g.net.close('account-switch');sessionStorage.setItem('carbon-resume-account','1');location.reload();
  }catch(error){this.failed();this.g.playing=playing&&this.g.accountSaves.ready;throw error;}
 }
 async restore(entry){
  const g=this.g;if(!g.playing||!g.accountSaves.ready)throw Error('Join the account you want to restore first.');
  let state=entry.state;
  if(!state){const r=await g.accountSaves.rpc('read',null,entry.revision);if(r.owner!==g.net.session.id)throw Error('Backup account mismatch.');state=r.state;}
  if(!state||!Array.isArray(state.inventory))throw Error('This backup does not contain inventory.');
  g.upgrade.a.save();await g.accountSaves.flush();g.playing=false;
  try{
   backupSave(readLocal('carbon-save-account:'+g.net.session.id)?.state,{owner:g.net.session.id,name:g.net.session.name,reason:'Before restoring progress'});
   const copy={...structuredClone(state),owner:g.net.session.id};
   const r=await g.accountSaves.rpc('restore',copy);
   if(!r?.ok||r.owner!==g.net.session.id){g.accountSaves.ready=false;g.accountSaves.onConflict?.(r?.reason);throw Error('Your account changed on another device. Rejoin before restoring.');}
   g.accountSaves.ready=false;
   // The cloud restore has committed. A full device cache must not resume the
   // old inventory or prevent loading that committed version after the reload.
   try{put('carbon-save-account:'+g.net.session.id,{state:copy,revision:r.revision,dirty:false,time:Date.now()});}catch{}
   await g.net.close('menu');sessionStorage.setItem('carbon-resume-account','1');location.reload();
  }catch(error){g.playing=g.accountSaves.ready;throw error;}
 }
 installUI(){
  const $=id=>document.getElementById(id),panel=document.createElement('section');panel.id='saveRecovery';panel.className='cover';panel.hidden=true;
  panel.innerHTML='<div class="graphics-window"><header><h2>Accounts & recovery</h2><button id="recoveryClose" aria-label="Close recovery">×</button></header><p id="recoveryStatus" role="status"></p><div id="recoveryConfirm" hidden></div><div id="recoveryAccounts"></div><h3>Progress backups</h3><p>Restore inventory, equipment, XP and exploration progress. Shared builds and chest contents stay in the world. Your current progress is backed up before restoring.</p><button id="downloadBackups">Download device backups</button><div id="recoveryBackups"></div></div>';
  document.body.append(panel);
  const fresh=document.createElement('div');fresh.className='recovery-row';
  const explanation=document.createElement('p');explanation.textContent='Lost the old login? Create a separate account, then restore the old device backup into it. Existing accounts stay saved here.';
  const name=document.createElement('input');name.id='recoveryNewName';name.maxLength=18;name.placeholder='New account name';name.setAttribute('aria-label','New account name');
  const create=document.createElement('button');create.id='recoveryNewAccount';create.textContent='Create separate account';create.onclick=()=>{const value=name.value.trim();if(value.length<2){$('recoveryStatus').textContent='Enter a name with 2 to 18 characters.';name.focus();return;}this.run(()=>this.activate({name:value,fresh:true}));};
  fresh.append(explanation,name,create);$('recoveryAccounts').after(fresh);
  for(const [id,before]of [['titleRecovery','titleGraphics'],['pauseRecovery','leaveBtn']]){const b=document.createElement('button');b.id=id;b.className='wide';b.textContent='Accounts & recovery';b.onclick=()=>this.open();$(before).before(b);}
  $('recoveryClose').onclick=()=>this.close();
  $('downloadBackups').onclick=()=>{const blob=new Blob([JSON.stringify({format:'carbon-progress-backups-v1',backups:localBackups()},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='carbon-progress-backups.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  window.addEventListener('keydown',e=>{if(!panel.hidden){e.stopImmediatePropagation();if(e.code==='Escape'){e.preventDefault();if(!this.busy)this.close();}}},true);
 }
 close(){if(this.busy)return;document.getElementById('saveRecovery').hidden=true;if(this.g.playing){this.g.upgrade.a.panel='pause';document.getElementById('pause').hidden=false;}}
 async run(action){if(this.busy)return;this.busy=true;const s=document.getElementById('recoveryStatus');s.textContent='Saving and loading account data…';try{await action();}catch(e){s.textContent=e.message;}finally{this.busy=false;}}
 confirm(entry){
  const node=document.getElementById('recoveryConfirm');node.hidden=false;node.replaceChildren();
  const p=document.createElement('p');p.textContent=`Restore this backup into ${this.g.net.session.name}? Their current progress will be backed up first.`;node.append(p);
  const yes=document.createElement('button');yes.id='confirmRestore';yes.textContent='Back up current progress and restore';yes.onclick=()=>this.run(()=>this.restore(entry));node.append(yes);
  const no=document.createElement('button');no.textContent='Cancel';no.onclick=()=>node.hidden=true;node.append(no);node.scrollIntoView({block:'nearest'});
 }
 async open(){
  const $=id=>document.getElementById(id),g=this.g;if(g.playing){g.upgrade.a.panel='recovery';g.upgrade.a.release();$('pause').hidden=true;}
  $('saveRecovery').hidden=false;$('recoveryConfirm').hidden=true;$('recoveryStatus').textContent=g.playing?'Current account: '+g.net.session.name:'Choose a saved account, or join first to restore a progress backup.';
  const accounts=$('recoveryAccounts');accounts.replaceChildren();
  const previous=readLocal('carbon-previous-account'),current=this.current();
  const button=(label,account,id)=>{const b=document.createElement('button');b.className='wide';if(id)b.id=id;b.textContent=label;b.onclick=()=>this.run(()=>this.activate(account));accounts.append(b);};
  if(previous&&previous.token!==current?.token)button('Undo account switch — return to '+previous.name,previous,'undoAccountSwitch');
  for(const a of savedAccounts())if(a.token!==current?.token)button('Open '+a.name,a);
  const rows=$('recoveryBackups');rows.replaceChildren();
  const row=entry=>{const card=document.createElement('div');card.className='recovery-row';const state=entry.state||entry,items=(state.inventory||[]).filter(Boolean),p=document.createElement('p');p.textContent=`${entry.name||g.net.session?.name||'Account backup'} · ${entry.reason} · ${entry.time?new Date(entry.time).toLocaleString():'date unknown'}\n${items.length} stacks · ${Number(state.xp)||0} XP · ${items.slice(0,4).map(i=>i.count+' '+i.id).join(', ')}`;card.append(p);const b=document.createElement('button');b.textContent='Restore this backup';b.disabled=!g.playing;b.onclick=()=>this.confirm(entry);card.append(b);rows.append(card);};
  localBackups().forEach(row);
  if(g.playing)try{const data=await g.accountSaves.rpc('history');if(data.owner!==g.net.session.id)throw Error('Backup account mismatch.');for(const b of data.history||[])row({...b,reason:'Cloud: '+b.reason});}catch(e){$('recoveryStatus').textContent='Local backups are available. Cloud backups: '+e.message;}
  if(!rows.children.length){const p=document.createElement('p');p.textContent='No backups found in this browser. Open recovery on the original device, or use a login code from a device still signed in to that account.';rows.append(p);}
 }
}
