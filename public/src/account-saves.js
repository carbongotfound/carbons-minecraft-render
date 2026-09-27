import {backupSave} from './save-recovery.js';
const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};
const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
export const accountSaveKey=id=>'carbon-save-account:'+id;
export class AccountSaves {
 constructor(game,{apply,onConflict}){this.g=game;this.apply=apply;this.onConflict=onConflict;this.writer=crypto.randomUUID();this.ready=false;this.revision=0;this.pending=null;this.inflight=null;}
 async rpc(op,state=null,revision=this.revision){
  const s=this.session;
  const {data,error}=await this.g.net.client.rpc('carbon_account_save',{p_id:s.id,p_token:s.token,p_writer:this.writer,p_op:op,p_revision:revision,p_state:state});
  if(error)throw Error(error.message);return data;
 }
 async load(session,{legacy=null,allowLegacy=false,chooseLegacy=null}={}){
  clearTimeout(this.timer);this.ready=false;this.pending=null;this.session={...session};
  const result=await this.rpc('load');
  if(result?.owner!==session.id)throw Error('The saved account did not match this login. Please try the code again.');
  this.revision=result.revision;
  const cached=read(accountSaveKey(session.id));
  backupSave(cached?.state,{owner:session.id,name:session.name,reason:'Before loading cloud progress'});
  // Unsynced recovery belongs to this account and may only replace the server
  // version it was based on. A newer server save wins after a device transfer.
  const recovered=cached?.dirty&&cached.revision===result.revision?cached.state:null;
  // A server revision lower than this device's cache means the saves were reset on the server
  // (for example after a world reset); old device copies must not bring the old inventory back.
  const serverReset=!!cached&&Number(result.revision)<Number(cached.revision||0);
  let state=recovered||result.state||(serverReset?null:cached?.state||(allowLegacy?legacy:null));
  if(!state&&!serverReset&&chooseLegacy&&legacy?.inventory?.some(Boolean)&&await chooseLegacy(legacy,session))state=legacy;
  state||={};
  backupSave(state,{owner:session.id,name:session.name,reason:'Joined account'});
  this.apply(state);this.ready=true;this.lastBackup=Date.now();
  sessionStorage.setItem('carbon-account-id',session.id);
  if(recovered)this.queue(state);
  return state;
 }
 queue(state){
  if(!this.ready)return;
  this.pending=structuredClone(state);
  if(Date.now()-(this.lastBackup||0)>300000){backupSave(this.pending,{owner:this.session.id,name:this.session.name});this.lastBackup=Date.now();}
  write(accountSaveKey(this.session.id),{state:this.pending,revision:this.revision,dirty:true,time:Date.now()});
  if(!this.timer)this.timer=setTimeout(()=>{this.timer=null;this.flush().catch(()=>{this.g.accountSaveError='Save pending: reconnecting';});},2000);
 }
 // Page unload cancels ordinary fetches, so the last save goes out as a keepalive request.
 flushOnExit(){
  if(!this.ready||!this.pending||!this.session)return false;const c=this.g.net?.client,url=c?.supabaseUrl,key=c?.supabaseKey;if(!url||!key)return false;
  const state=this.pending,body=JSON.stringify({p_id:this.session.id,p_token:this.session.token,p_writer:this.writer,p_op:'save',p_revision:this.revision,p_state:state});
  if(body.length>60000)return false;clearTimeout(this.timer);this.timer=null;
  try{fetch(url+'/rest/v1/rpc/carbon_account_save',{method:'POST',keepalive:true,headers:{'content-type':'application/json',apikey:key,authorization:'Bearer '+key},body}).catch(()=>{});return true;}catch{return false;}
 }
 async flush(){
  clearTimeout(this.timer);this.timer=null;
  if(this.inflight){await this.inflight;if(this.pending)return this.flush();return;}
  if(!this.ready||!this.pending)return;
  const state=this.pending;this.pending=null;
  this.inflight=(async()=>{
   try{
    const result=await this.rpc('save',state);
    if(!result?.ok){this.ready=false;this.onConflict?.(result?.reason);throw Error('This account was opened elsewhere. Rejoin to load its latest save.');}
    this.revision=result.revision;this.g.accountSaveError=null;
    write(accountSaveKey(this.session.id),{state:this.pending||state,revision:this.revision,dirty:!!this.pending,time:Date.now()});
   }catch(error){if(this.ready)this.pending=this.pending||state;throw error;}
  })();
  try{await this.inflight;}finally{this.inflight=null;}
  if(this.pending)return this.flush();
 }
}
