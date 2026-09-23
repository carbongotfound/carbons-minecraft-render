import {Group,Mesh,meshData,makeGeometry,addFace,FACES} from './engine.js';
import {extendOverworld} from './frontier-gen.js';
const CM_RENDER_CUSTOM=new Set([18,20,22,23,24,25,26,27,34,36,37,38,39]);
function installChunkFallback(g){
  const v=g?.view;
  if(!v||v.__cmOriginFallback)return;
  v.__cmOriginFallback=true;
  v.rebuild=function(cx,cz){
    const key=cx+','+cz,old=this.chunks.get(key);
    if(old){for(const m of old.children)m.geometry?.dispose?.();this.scene.remove(old);}
    const sets=[meshData(),meshData(),meshData()],origin=(g.dimension||'overworld')==='overworld'?512:256,w=this.world;
    const x0=cx*16-origin,z0=cz*16-origin;
    for(let x=x0;x<x0+16;x++)for(let z=z0;z<z0+16;z++)for(let y=0;y<96;y++){
      const b=w.get(x,y,z);
      if(!b||CM_RENDER_CUSTOM.has(b))continue;
      const group=b===9?1:b===14?2:0;
      for(let f=0;f<6;f++){
        const n=FACES[f].n,nb=w.get(x+n[0],y+n[1],z+n[2]);
        if(nb!==0&&!CM_RENDER_CUSTOM.has(nb)&&!((nb===9||nb===14)&&nb!==b))continue;
        addFace(sets[group],x,y,z,b,f);
      }
    }
    const group=new Group;
    for(let i=0;i<3;i++)if(sets[i].p.length){
      const m=new Mesh(makeGeometry(sets[i]),[this.material,this.glassMat,this.waterMat][i]);
      m.receiveShadow=true;m.castShadow=i===0;group.add(m);
    }
    this.chunks.set(key,group);this.scene.add(group);
  };
}
globalThis.__cmRenderHotfix='terrain+origin-v1';
const dims=new Set(['overworld','nether','end']);
const LIVE_TOPIC='carbon-survival-v6';
class HttpChannel{
  constructor(owner){this.owner=owner;this.handlers=new Map()}
  on(type,filter,fn){const k=type+':'+(filter?.event||'');if(!this.handlers.has(k))this.handlers.set(k,[]);this.handlers.get(k).push(fn);return this}
  subscribe(fn){queueMicrotask(()=>fn?.('SUBSCRIBED'));return this}
  track(){return Promise.resolve('ok')}
  send(){return Promise.resolve('ok')}
  presenceState(){const out={};for(const[id,p]of this.owner.n.members)out[id]=[p];return out}
  emit(type,event,msg){for(const fn of this.handlers.get(type+':'+(event||''))||[])try{fn(msg)}catch{}}
}
class RelayChannel extends HttpChannel{
  send(m){const live=this.owner.live;if(this.owner.poseLive&&live&&typeof live.send==='function'){try{return live.send(m)}catch{}}return Promise.resolve('ok')}
  track(p){const live=this.owner.live;if(this.owner.poseLive&&live&&typeof live.track==='function'){try{return live.track(p)}catch{}}return Promise.resolve('ok')}
}
const finite=p=>p&&['x','y','z','yaw','pitch'].every(k=>Number.isFinite(Number(p[k])))&&Math.abs(p.x)<=512&&Math.abs(p.z)<=512&&p.y>=-20&&p.y<=130&&Math.abs(p.pitch)<=1.6;
export const rleEncode=x=>x, rleDecode=x=>x;
export class AuthNetwork{
 constructor(g,u){
  this.g=g;this.u=u;extendOverworld(g.world);installChunkFallback(g);this.n=g.net;
  this.roster=new Map;this.hosts=new Map;this.lastPoll=0;this.pollTask=null;this.failures=0;
  this.chatCursor=0;this.combatCursor=0;this.presenceCursor=0;this.lifecycleReady=false;
  this.remoteSeq=new Map;this.lastMobPublish=0;this.stopped=false;
  this.live=null;this.poseLive=false;this.liveAt=new Map;this.livePose=new Map;this.lastLiveSend=0;this.lastLiveKey='';this.lastLiveTrack=0;
  this.openChannel=null;this.removeOpenChannel=null;
  this.guard={allDirect:()=>this.poseLive,reconcile:()=>{},status:()=>({direct:this.poseLive?1:0,relay:this.poseLive,transport:this.poseLive?'live':'http'})};
  this.install();
 }
 async prepare(){return this}
 pose(){const g=this.g,a=this.u.a,s=a.selected();return{x:g.player.x,y:g.player.y,z:g.player.z,yaw:g.player.yaw,pitch:g.player.pitch,dimension:g.dimension||'overworld',held:s?.id||'',shield:!!g.equipment?.offhand&&a.holdingUse,alive:!g.dead,visible:!document.hidden}}
 livePacket(){const p=this.n.packet();p.dimension=this.g.dimension||'overworld';p.version=8;return p}
 connectedLabel(){return this.poseLive?'Connected · live':'Connected · HTTP'}
 enableRealtime(){
  const rt=this.n.client?.realtime;
  if(!rt)return;
  try{if(rt.params)rt.params.eventsPerSecond=40;else rt.params={eventsPerSecond:40};}catch{}
  try{rt.connect?.()}catch{}
 }
 fanout(type,event,msg){this.n.channel?.emit?.(type,event,msg)}
 ingestPose(p,live){
  const n=this.n;
  if(!p||!n.session||p.id===n.session.id)return;
  if(!n.valid(p))return;
  if(p.dimension&&!dims.has(p.dimension))return;
  if(p.dimension&&p.dimension!==(this.g.dimension||'overworld'))return;
  if(live){
    delete p.t;
    p.transport=9;p.version=8;
    this.liveAt.set(p.id,performance.now());
    this.livePose.set(p.id,{...p});
    const rec=this.roster.get(p.id);
    if(rec){rec.seen_at=new Date(this.g.clock.serverMs()).toISOString();rec.x=p.x;rec.y=p.y;rec.z=p.z;rec.yaw=p.yaw;rec.pitch=p.pitch;if(p.held!==undefined)rec.held=p.held;if(p.alive!==undefined)rec.alive=p.alive;}
    try{n.hooks.move(p)}catch{}
    return;
  }
  if(this.liveAt.has(p.id)&&performance.now()-this.liveAt.get(p.id)<500)return;
  const seq=Number(p.seq)||0,prev=this.remoteSeq.get(p.id)??-1;
  if(seq&&seq<=prev)return;
  if(seq)this.remoteSeq.set(p.id,seq);
  p.transport=8;p.version=8;
  try{n.hooks.move(p)}catch{}
 }
 sendLivePose(t){
  if(!this.n.connected||!this.n.session||!this.poseLive||!this.live||document.hidden)return;
  if(t-(this.lastLiveSend||0)<50)return;
  const pkt=this.livePacket();
  const key=[pkt.x,pkt.y,pkt.z,pkt.yaw,pkt.pitch,pkt.held,pkt.sneak,pkt.swing,pkt.alive,pkt.dimension].join(',');
  if(key===this.lastLiveKey&&t-this.lastLiveSend<180)return;
  this.lastLiveKey=key;this.lastLiveSend=t;
  try{this.live.send({type:'broadcast',event:'move',payload:pkt})}catch{}
  if(t-(this.lastLiveTrack||0)>8000){this.lastLiveTrack=t;try{this.live.track(pkt)}catch{}}
 }
 async closeLive(){
  this.poseLive=false;
  const ch=this.live;this.live=null;
  if(!ch)return;
  try{await ch.unsubscribe()}catch{}
  try{await this.removeOpenChannel?.(ch)}catch{}
 }
 async openLive(){
  if(this.stopped||!this.n.session||!this.openChannel)return false;
  this.enableRealtime();
  await this.closeLive();
  if(this.stopped||!this.n.session)return false;
  const session=this.n.session;
  let ch;
  try{
    ch=this.openChannel(LIVE_TOPIC,{config:{presence:{key:session.id,enabled:true},broadcast:{self:false,ack:false}}});
  }catch(e){console.warn('[live] channel create failed',e);return false;}
  this.live=ch;
  ch.on('broadcast',{event:'move'},({payload})=>this.ingestPose(payload,true));
  ch.on('broadcast',{event:'survival'},msg=>this.fanout('broadcast','survival',msg));
  ch.on('broadcast',{event:'object-change-v3'},msg=>this.fanout('broadcast','object-change-v3',msg));
  const subscribed=await new Promise(resolve=>{
    let done=false;
    const finish=ok=>{if(done)return;done=true;resolve(ok)};
    const timer=setTimeout(()=>finish(false),4000);
    try{
      ch.subscribe(status=>{
        if(status==='SUBSCRIBED'){clearTimeout(timer);if(this.live===ch){this.poseLive=true;try{this.n.hooks.status(true,this.connectedLabel())}catch{}}finish(true)}
        else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){clearTimeout(timer);if(this.live===ch)this.poseLive=false;finish(false)}
      });
    }catch{clearTimeout(timer);finish(false)}
  });
  if(subscribed&&this.live===ch){
    this.poseLive=true;
    try{await ch.track(this.livePacket())}catch{}
    try{this.n.hooks.status(true,this.connectedLabel())}catch{}
    return true;
  }
  if(this.live===ch&&!this.poseLive){
    // Subscribe may still complete after the timeout; keep the socket.
    try{this.n.hooks.status(true,this.connectedLabel())}catch{}
  }
  return this.poseLive;
 }
 install(){
  const n=this.n,client=n.client;
  this.rawRpc=client.rpc.bind(client);
  this.openChannel=client.channel.bind(client);
  this.removeOpenChannel=client.removeChannel?.bind(client);
  const make=()=>new RelayChannel(this);
  client.channel=()=>make();
  client.removeChannel=async()=>'ok';
  this.enableRealtime();
  n.channel=make();n.connected=false;
  n.valid=p=>finite(p)&&typeof p.id==='string'&&/^[0-9a-f-]{36}$/i.test(p.id)&&typeof p.name==='string'&&p.name.length<=18&&/^#[0-9a-f]{6}$/i.test(p.color)&&(!p.dimension||dims.has(p.dimension));
  n.syncPresence=()=>{const members=new Map,now=performance.now();for(const[id,p]of this.roster){if(this.g.clock.serverMs()-Date.parse(p.seen_at)>45000)continue;const live=this.liveAt.has(id)&&now-this.liveAt.get(id)<2000;members.set(id,{...p,t:Date.parse(p.seen_at),transport:live?9:8,version:8})}for(const[id,p]of this.livePose){if(id===n.session?.id)continue;if(now-(this.liveAt.get(id)||0)>4000){this.livePose.delete(id);this.liveAt.delete(id);continue;}if(!members.has(id))members.set(id,{...p,transport:9,version:8})}if(n.session&&n.position){const p=n.packet();p.dimension=this.g.dimension||'overworld';members.set(n.session.id,p)}n.members=members;n.hooks.presence(members,n.session?.id)};
  n.join=async(name,color,position)=>{
    this.stopped=false;clearInterval(this.timer);await this.closeLive();
    const token=(()=>{try{return sessionStorage.getItem('carbon-session-v8')}catch{return null}})();
    console.info('[HTTP] join rpc');let r=null,error=null;
    for(let attempt=0;attempt<4;attempt++){
      const res=await this.rawRpc('carbon_survival_join_v3',{p_name:name,p_color:color,p_token:token});
      r=res.data;error=res.error;if(!error)break;
      if(!/Gateway Timeout|timeout|network|fetch/i.test(error.message||'')||attempt===3)throw Error(error.message);
      await new Promise(done=>setTimeout(done,250*Math.pow(2,attempt)));
    }
    if(error)throw Error(error.message);
    console.info('[HTTP] join rpc ok');
    n.session=r;n.position=position;n.members.clear();n.cursor=0;n.channel=make();n.connected=true;
    try{sessionStorage.setItem('carbon-session-v8',r.token)}catch{}
    n.hooks.status(true,'Syncing over HTTP');
    console.info('[HTTP] initial block pull');await n.pull();console.info('[HTTP] initial block pull ok');
    const hist=await client.from('carbon_survival_chat').select('*').order('id',{ascending:false}).limit(12);
    if(hist.data){for(const row of hist.data.reverse()){n.message(row);this.chatCursor=Math.max(this.chatCursor,Number(row.id)||0)}}
    console.info('[HTTP] initial poll');await this.poll(true);console.info('[HTTP] initial poll ok');
    this.timer=setInterval(()=>this.poll(false).catch(()=>{}),80);
    n.tick=t=>this.sendLivePose(t);
    await this.openLive();
    n.hooks.status(true,this.connectedLabel());
    return r;
  };
  n.tick=()=>{};
  n.edit=async(x,y,z,block)=>{if(!n.session)throw Error('Rejoin the world before building.');if(n.writing)return false;n.writing=true;const key=`${x},${y},${z}`,old=n.world.get(x,y,z),rev=n.world.versions.get(key)||0;n.world.set(x,y,z,block);try{await this.ensureActionState(700);const{data,error}=await this.rawRpc('carbon_edit_v6',{p_id:n.session.id,p_token:n.session.token,p_dimension:this.g.dimension||'overworld',p_edits:[{x,y,z,block,revision:rev}]});if(error)throw Error(error.message);for(const row of data?.blocks||[]){n.world.apply(row);n.cursor=Math.max(n.cursor,Number(row.revision)||0)}return true}catch(e){if((n.world.versions.get(key)||0)===rev)n.world.set(x,y,z,old);throw e}finally{n.writing=false}};
  n.say=async body=>{if(!n.session)throw Error('Rejoin before chatting.');const{data,error}=await this.rawRpc('carbon_survival_say',{p_id:n.session.id,p_token:n.session.token,p_body:body});if(error)throw Error(error.message);n.message(data);this.chatCursor=Math.max(this.chatCursor,Number(data?.id)||0);return data};
  n.close=async(reason='manual')=>{
    const session=n.session;this.stopped=true;clearInterval(this.timer);n.connected=false;await this.closeLive();this.liveAt.clear();
    if(session){const body={p_id:session.id,p_token:session.token};if(reason==='pagehide'){try{const key=client.supabaseKey,url=client.supabaseUrl+'/rest/v1/rpc/carbon_http_leave_v8';fetch(url,{method:'POST',keepalive:true,headers:{'content-type':'application/json',apikey:key,authorization:'Bearer '+key},body:JSON.stringify(body)}).catch(()=>{})}catch{}}else{try{await this.rawRpc('carbon_http_leave_v8',body)}catch{}}}
    n.session=null;n.members.clear();this.roster.clear();this.remoteSeq.clear();this.livePose.clear();this.liveAt.clear();this.lifecycleReady=false;n.hooks.status(false,'Offline');
  };
 }
 mobSnapshot(){const m=this.u.a.mobs;if(!m?.authority||performance.now()-this.lastMobPublish<100)return null;this.lastMobPublish=performance.now();const out=[];for(const v of m.mobs.values()){if(out.length>=64)break;if(!v||!finite({...v,pitch:v.pitch||0})||!Number.isFinite(v.hp))continue;const o={id:String(v.id).slice(0,96),kind:v.kind,x:+v.x.toFixed(3),y:+v.y.toFixed(3),z:+v.z.toFixed(3),yaw:+(v.yaw||0).toFixed(3),pitch:+(v.pitch||0).toFixed(3),hp:+v.hp};for(const k of ['phase','fuse','panic','regrow','vy','babyUntil','breedCooldown','loveUntil','aggro'])if(Number.isFinite(v[k]))o[k]=+v[k];for(const k of ['burning','sheared','profession','crystalIndex'])if(v[k]!==undefined)o[k]=v[k];out.push(o)}return out}
 async poll(force=false){
  const n=this.n;if(!n.session||this.stopped)return;
  const now=performance.now(),min=document.hidden?800:this.poseLive?200:80;
  if(!force&&now-this.lastPoll<min)return;
  if(this.pollTask)return this.pollTask;
  const mob=this.getHost()===n.session.id?this.mobSnapshot():null;
  const run=(async()=>{
    const clockSentAt=performance.now();
    const{data,error}=await this.rawRpc('carbon_http_poll_v8',{p_id:n.session.id,p_token:n.session.token,p_pose:this.pose(),p_block_after:n.cursor||0,p_chat_after:this.chatCursor,p_combat_after:this.combatCursor,p_mob_state:mob,p_presence_after:this.presenceCursor||0});
    if(error)throw Error(error.message);
    this.g.clock.sync(data.clock,clockSentAt,performance.now());
    this.lastPoll=performance.now();this.lastPose=this.pose();this.failures=0;n.connected=true;
    this.roster=new Map((data.players||[]).map(p=>[p.id,p]));
    for(const[id,p]of this.livePose){const rec=this.roster.get(id);if(rec&&this.liveAt.has(id)&&performance.now()-this.liveAt.get(id)<500){rec.x=p.x;rec.y=p.y;rec.z=p.z;rec.yaw=p.yaw;rec.pitch=p.pitch;if(p.held!==undefined)rec.held=p.held;if(p.alive!==undefined)rec.alive=p.alive;rec.seen_at=new Date(this.g.clock.serverMs()).toISOString();}}
    this.hosts=new Map((data.hosts||[]).map(h=>[h.dimension,h]));
    for(const row of data.blocks||[]){n.world.apply(row);n.cursor=Math.max(n.cursor,Number(row.revision)||0)}
    for(const row of data.chat||[]){n.message(row);this.chatCursor=Math.max(this.chatCursor,Number(row.id)||0)}
    for(const row of data.combat||[]){this.g.frontier?.combat(row);this.combatCursor=Math.max(this.combatCursor,Number(row.id)||0)}
    for(const[id,p]of this.roster){
      if(id===n.session.id)continue;
      const stamp=Date.parse(p.seen_at)||this.g.clock.serverMs();
      this.ingestPose({...p,t:stamp},false);
    }
    for(const id of [...this.remoteSeq.keys()])if(!this.roster.has(id))this.remoteSeq.delete(id);
    const stale=performance.now();
    for(const id of [...this.liveAt.keys()])if(stale-this.liveAt.get(id)>8000){this.liveAt.delete(id);this.livePose.delete(id);}
    n.syncPresence();
    const cursor=Number(data.presence_cursor)||0;
    if(!this.lifecycleReady){this.presenceCursor=cursor;this.lifecycleReady=true}
    else{
      for(const ev of data.presence_events||[]){const eid=Number(ev.id)||0;if(eid<=this.presenceCursor)continue;window.dispatchEvent(new CustomEvent('carbon-presence-event',{detail:ev}));this.presenceCursor=Math.max(this.presenceCursor,eid)}
      this.presenceCursor=Math.max(this.presenceCursor,cursor);
    }
    const host=this.getHost();
    if(host&&host!==n.session.id&&Array.isArray(data.mobs)&&data.mobs.length){
      this.u.a.mobs?.receive({kind:'mob-state',version:3,from:host,dimension:this.g.dimension||'overworld',stamp:Date.parse(data.mob_updated_at)||this.g.clock.serverMs(),generation:Number(data.mob_generation)||0,mobs:data.mobs});
    }
    n.hooks.status(true,this.connectedLabel());
    return data;
  })();
  this.pollTask=run;
  try{return await run}
  catch(e){this.failures++;n.connected=!!n.session;n.hooks.status(!!n.session,this.failures<12?'HTTP retrying':'Server connection weak');throw e}
  finally{if(this.pollTask===run)this.pollTask=null}
 }
 async beat(fresh=false){return this.poll(fresh&&performance.now()-this.lastPoll>90)}
 async forceBeat(){return this.poll(true)}
 async ensureActionState(maxAge=280){if(!this.n.session)throw Error('Rejoin before acting.');const p=this.g.player,l=this.lastPose,moved=!l||l.dimension!==(this.g.dimension||'overworld')||Math.hypot(p.x-l.x,p.y-l.y,p.z-l.z)>.35;if(moved||performance.now()-this.lastPoll>maxAge)await this.poll(true)}
 getHost(dim=this.g.dimension||'overworld'){const h=this.hosts.get(dim);return h&&Date.parse(h.expires_at)>this.g.clock.serverMs()-2000?h.owner:null}
 status(){return{transport:this.poseLive?'live':'http',websocket:!!this.poseLive,players:this.n.members.size,host:this.getHost(),failures:this.failures,direct:this.poseLive?1:0,relay:!!this.poseLive}}
}
