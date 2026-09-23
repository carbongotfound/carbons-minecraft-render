const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};
const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
export const accountSaveKey=id=>'carbon-save-account:'+id;
export class AccountSaves {
 constructor(game,{apply,onConflict}){this.g=game;this.apply=apply;this.onConflict=onConflict;this.writer=crypto.randomUUID();this.ready=false;this.revision=0;this.pending=null;this.inflight=null;}
 async rpc(op,state=null){
  const s=this.session;
  const {data,error}=await this.g.net.client.rpc('carbon_account_save',{p_id:s.id,p_token:s.token,p_writer:this.writer,p_op:op,p_revision:this.revision,p_state:state});
  if(error)throw Error(error.message);return data;
 }
 async load(session,{legacy=null,allowLegacy=false,chooseLegacy=null}={}){
  clearTimeout(this.timer);this.ready=false;this.pending=null;this.session={...session};
  const result=await this.rpc('load');
  if(result?.owner!==session.id)throw Error('The saved account did not match this login. Please try the code again.');
  this.revision=result.revision;
  const cached=read(accountSaveKey(session.id));
  // Unsynced recovery belongs to this account and may only replace the server
  // version it was based on. A newer server save wins after a device transfer.
  const recovered=cached?.dirty&&cached.revision===result.revision?cached.state:null;
  let state=recovered||result.state||cached?.state||(allowLegacy?legacy:null);
  if(!state&&chooseLegacy&&legacy?.inventory?.some(Boolean)&&await chooseLegacy(legacy,session))state=legacy;
  state||={};
  this.apply(state);this.ready=true;
  sessionStorage.setItem('carbon-account-id',session.id);
  if(recovered)this.queue(state);
  return state;
 }
 queue(state){
  if(!this.ready)return;
  this.pending=structuredClone(state);
  write(accountSaveKey(this.session.id),{state:this.pending,revision:this.revision,dirty:true});
  if(!this.timer)this.timer=setTimeout(()=>{this.timer=null;this.flush().catch(()=>{this.g.accountSaveError='Save pending: reconnecting';});},2000);
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
    write(accountSaveKey(this.session.id),{state:this.pending||state,revision:this.revision,dirty:!!this.pending});
   }catch(error){if(this.ready)this.pending=this.pending||state;throw error;}
  })();
  try{await this.inflight;}finally{this.inflight=null;}
  if(this.pending)return this.flush();
 }
}
