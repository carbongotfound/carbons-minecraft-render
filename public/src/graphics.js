import {cleanOptions,RESOLUTIONS,AA_MODES,renderSize} from './graphics-options.js';
import {PostProcessing} from './post-processing.js';
const $=id=>document.getElementById(id);
export function installGraphics(u){return u.g.graphics=new Graphics(u);}
class Graphics {
 constructor(u){
  this.u=u;this.g=u.g;this.v=this.g.view;this.loading=false;this.revision=0;
  u.settings=cleanOptions(u.settings);this.post=this.v.software?null:new PostProcessing(this.v.renderer);
  this.installUI();const save=u.saveSettings.bind(u);
  u.saveSettings=()=>{u.settings.viewMode=u.viewMode;save();this.revision++;this.apply();this.queueSave();};
  this.v.resize=()=>this.resize();window.addEventListener('resize',()=>this.resize());
  const join=this.g.net.join.bind(this.g.net);this.g.net.join=async(...args)=>{const result=await join(...args);await this.loadAccount();return result;};
  this.apply();
 }
 installUI(){
  const panel=document.createElement('section');panel.id='graphicsSettings';panel.className='cover';panel.hidden=true;
  panel.innerHTML='<div class="graphics-window"><header><h2>Graphics settings</h2><button id="graphicsClose" aria-label="Close graphics settings">×</button></header><p id="graphicsAccount">Settings save to your account after joining.</p><div id="graphicsControls"></div><p id="graphicsActual"></p><small>Resolution is fitted to your screen shape. Higher resolutions and more lights use more GPU power.</small></div>';
  document.body.append(panel);const controls=$('graphicsControls');
  const select=(key,label,values)=>{const row=document.createElement('label');row.textContent=label;const input=document.createElement('select');input.id='graphics-'+key;input.setAttribute('aria-label',label);for(const [value,title]of values){const option=document.createElement('option');option.value=value;option.textContent=title;input.append(option);}input.onchange=()=>{this.u.settings[key]=input.value;this.u.saveSettings();};row.append(input);controls.append(row);};
  select('resolution','Render resolution',RESOLUTIONS.map(v=>[v,v.replace('x',' × ')]));
  select('aa','Anti-aliasing',AA_MODES.map(v=>[v,v==='none'?'None':v==='msaa'?'MSAA (up to 4×)':v.toUpperCase()]));
  const row=document.createElement('label');row.innerHTML='Maximum loaded lights <input id="graphics-maxLights" aria-label="Maximum loaded lights" type="range" min="2" max="128" step="1"><output id="graphics-lightCount"></output>';controls.append(row);
  $('graphics-maxLights').oninput=e=>{this.u.settings.maxLights=Number(e.target.value);this.u.saveSettings();};
  const smooth=document.createElement('button');smooth.id='graphics-smoothLighting';smooth.onclick=()=>{this.u.settings.smoothLighting=!this.u.settings.smoothLighting;this.u.saveSettings();};controls.append(smooth);
  // Move the existing controls, preserving their handlers.
  for(const node of [$('fieldOfView')?.closest('label'),$('viewBob'),$('shadows'),$('viewMode'),$('frontierOptionsV7')])if(node)controls.append(node);
  $('frontierOptionsV7').open=true;
  $('qualityBtn').textContent='Graphics settings';$('qualityBtn').onclick=()=>this.open();
  const titleButton=document.createElement('button');titleButton.id='titleGraphics';titleButton.textContent='Graphics settings';titleButton.onclick=()=>this.open();$('joinForm').after(titleButton);
  $('graphicsClose').onclick=()=>this.close();
  window.addEventListener('keydown',e=>{if(!panel.hidden&&e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();this.close();}},true);
 }
 open(){this.fromTitle=!this.g.playing;if(!this.fromTitle){this.u.a.panel='graphics';this.u.a.release();$('pause').hidden=true;}$('graphicsSettings').hidden=false;}
 close(){$('graphicsSettings').hidden=true;if(!this.fromTitle){this.u.a.panel='pause';$('pause').hidden=false;}}
 resize(){
  const r=this.v.renderer,[w,h]=renderSize(this.u.settings.resolution,innerWidth,innerHeight,r.capabilities?.maxTextureSize||4096);
  this.v.camera.aspect=innerWidth/innerHeight;this.v.camera.updateProjectionMatrix();
  r.setPixelRatio(1);r.setSize(w,h,false);r.domElement.style.width='100%';r.domElement.style.height='100%';
  this.post?.configure(this.u.settings.aa,w,h);this.width=r.domElement.width;this.height=r.domElement.height;
  $('graphicsActual').textContent=`Rendering ${this.width} × ${this.height} · ${this.post?this.post.mode.toUpperCase():'Canvas fallback (AA unavailable)'}`;
 }
 apply(){
  const s=this.u.settings;this.u.viewMode=s.viewMode;this.u.a.setSound(s.sound);$('viewMode').textContent=['First person [F5]','Third person [F5]','Front view [F5]'][s.viewMode];this.u.look.sensitivity=.0022*s.sensitivity;
  for(const [id,key]of [['mouseSensitivity','sensitivity'],['fieldOfView','fov'],['renderDistance','renderDistance'],['shadowDistance','shadowDistance'],['graphics-resolution','resolution'],['graphics-aa','aa'],['graphics-maxLights','maxLights']])if($(id))$(id).value=s[key];
  $('graphics-lightCount').textContent=String(s.maxLights);$('graphics-smoothLighting').textContent='Smooth lighting: '+(s.smoothLighting?'ON':'OFF');
  $('viewBob').textContent='View bobbing: '+(s.bob?'ON':'OFF');$('shadows').textContent='Shadows: '+(s.shadows?'ON':'OFF');
  $('renderDistanceValue').textContent=s.renderDistance+' chunks';$('shadowDistanceValue').textContent=s.shadowDistance+' blocks';
  this.v.renderer.shadowMap.enabled=s.shadows;if(this.u.sun){this.u.sun.castShadow=s.shadows;const d=s.shadowDistance;Object.assign(this.u.sun.shadow.camera,{left:-d,right:d,top:d,bottom:-d});this.u.sun.shadow.camera.updateProjectionMatrix();}
  this.resize();const stamp=s.smoothLighting+':'+s.maxLights;if(stamp!==this.lightStamp){this.lightStamp=stamp;this.g.lighting?.invalidate();for(const key of this.v.chunks.keys())this.g.world.dirty.add(key);}
  this.g.frontier.stream.refresh(true);
 }
 async rpc(settings){const n=this.g.net;const {data,error}=await n.client.rpc('carbon_object_v6',{p_id:n.session.id,p_token:n.session.token,p_op:'settings',p:{settings:settings??null}});if(error)throw Error(error.message);return data;}
 async loadAccount(){
  clearTimeout(this.saveTimer);this.loading=true;const revision=this.revision;
  try{const data=await this.rpc();if(data?.settings&&revision===this.revision){this.u.settings=cleanOptions(data.settings);this.apply();}else if(!data?.settings){await this.rpc(cleanOptions(this.u.settings));}
   localStorage.setItem('carbon-options-account:'+this.g.net.session.id,JSON.stringify(this.u.settings));$('graphicsAccount').textContent='Settings saved with this account.';
  }catch{try{const cached=JSON.parse(localStorage.getItem('carbon-options-account:'+this.g.net.session.id));if(cached){this.u.settings=cleanOptions(cached);this.apply();}}catch{}$('graphicsAccount').textContent='Account settings unavailable. Changes stay on this device until reconnected.';}
  finally{this.loading=false;if(revision!==this.revision)this.queueSave();}
 }
 async flush(){clearTimeout(this.saveTimer);if(this.g.net.session)await this.rpc(cleanOptions(this.u.settings));}
 queueSave(){
  const session=this.g.net.session;if(!session||this.loading)return;
  localStorage.setItem('carbon-options-account:'+session.id,JSON.stringify(this.u.settings));clearTimeout(this.saveTimer);
  this.saveTimer=setTimeout(async()=>{try{await this.rpc(cleanOptions(this.u.settings));$('graphicsAccount').textContent='Settings saved with this account.';}catch{$('graphicsAccount').textContent='Settings saved locally. Server sync will retry.';this.saveTimer=setTimeout(()=>this.queueSave(),5000);}},500);
 }
}
