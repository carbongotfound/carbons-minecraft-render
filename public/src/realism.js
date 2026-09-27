import {Mesh,BoxGeometry,ShaderMaterial,Color,Vector3,CanvasTexture,makeGeometry} from './engine.js';
import {HD_LEAF_TILES,HD_EMISSIVE_TILES} from './hd-textures.js';

// Sky, water, block light and weather. Everything here is GPU-side and costs a
// handful of draw calls: one sky/cloud pass, one precipitation mesh and shader
// changes on the existing terrain and water materials.
const EFFECTS_KEY='carbon-effects-v1';
const NEAREST_MIPMAP_LINEAR=1005,BACK_SIDE=1;
const smoothstep=(a,b,v)=>{const t=Math.min(1,Math.max(0,(v-a)/(b-a)));return t*t*(3-2*t);};
// Phones and low-core machines start on Fast; everyone can switch in Graphics settings.
const defaultLevel=()=>matchMedia?.('(pointer:coarse)').matches||(navigator.hardwareConcurrency||4)<=4?'fast':'fancy';
export function effectsLevel(){try{const v=localStorage.getItem(EFFECTS_KEY);return v==='fast'||v==='fancy'?v:defaultLevel();}catch{return defaultLevel();}}
export function setEffectsLevel(level){try{localStorage.setItem(EFFECTS_KEY,level==='fast'?'fast':'fancy');}catch{}}
export function installRealism(g){if(g.view.software)return null;return g.realism=new Realism(g);}

const NOISE=`
float rHash2(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
float rHash3(vec3 p){p=fract(p*.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}`;

const SKY_VERTEX=`varying vec3 vDir;void main(){vDir=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=vec4(p.xy,p.w*.99999,p.w);}`;
const SKY_FRAGMENT=`
uniform sampler2D uCloudMap;
uniform vec3 uZenith,uHorizon,uSunset,uSunColor,uFogColor,uCloudLit,uCloudDark,uSunDir,uCam;
uniform float uSunsetAmt,uStars,uTime,uCloudCover,uCloudSteps,uUnder,uMoonPhase,uRain,uFlash,uCloudY,uStarAngle;
varying vec3 vDir;
${NOISE}
bool cloudAt(vec2 c){return texture(uCloudMap,(c+.5)/64.).r>uCloudCover;}
vec4 clouds(vec3 ro,vec3 rd){
 if(abs(rd.y)<.0005)return vec4(0.);
 float y0=uCloudY,y1=uCloudY+4.,ta=(y0-ro.y)/rd.y,tb=(y1-ro.y)/rd.y,t0=max(min(ta,tb),0.),t1=max(ta,tb);
 if(t1<=0.||t0>1400.)return vec4(0.);
 const float CELL=12.;vec2 off=vec2(uTime*.8,0.);
 vec2 p=(ro.xz+rd.xz*t0+off)/CELL,cell=floor(p),dir=rd.xz;
 vec2 stepv=vec2(dir.x>=0.?1.:-1.,dir.y>=0.?1.:-1.),inv=1./max(abs(dir),vec2(1e-5));
 vec2 tMax=t0+abs((cell+max(stepv,0.)-p)*CELL)*inv;
 vec2 tDelta=CELL*inv;float t=t0,face=0.;
 for(int i=0;i<24;i++){
  if(float(i)>=uCloudSteps)break;
  if(cloudAt(cell)){
   float shade=face==0.?(ro.y>y1?1.:.62):face==1.?.84:.76;
   vec3 col=mix(uCloudDark,uCloudLit,shade);
   col=mix(col,uHorizon,smoothstep(120.,1100.,t)*.75);
   return vec4(col,.9*(1.-smoothstep(700.,1400.,t)));
  }
  if(tMax.x<tMax.y){t=tMax.x;tMax.x+=tDelta.x;cell.x+=stepv.x;face=1.;}else{t=tMax.y;tMax.y+=tDelta.y;cell.y+=stepv.y;face=2.;}
  if(t>t1)break;
 }
 return vec4(0.);
}
void main(){
 vec3 d=normalize(vDir);
 if(uUnder>.5){gl_FragColor=vec4(uFogColor,1.);
  #include <colorspace_fragment>
  return;}
 float up=max(d.y,0.);
 vec3 sky=mix(uHorizon,uZenith,pow(up,.45));
 if(d.y<0.)sky=mix(uHorizon,uHorizon*vec3(.62,.66,.74),clamp(-d.y*3.,0.,1.));
 float sd=dot(d,uSunDir),toward=pow(sd*.5+.5,5.),band=exp(-abs(d.y)*5.5);
 sky=mix(sky,uSunset,clamp(uSunsetAmt*band*(.35+toward),0.,1.));
 float clear=1.-uRain;
 // Stars rotate with the sky.
 if(uStars>.01){vec3 s=d;float c=cos(uStarAngle),n=sin(uStarAngle);s.xy=mat2(c,-n,n,c)*s.xy;vec3 gp=s*150.,cell=floor(gp);float h=rHash3(cell);
  if(h>.9955){vec3 f=fract(gp)-.5-(vec3(rHash3(cell+1.),rHash3(cell+2.),rHash3(cell+3.))-.5)*.5;float star=smoothstep(.13,.02,length(f))*(.45+.55*rHash3(cell+4.))*(.8+.2*sin(uTime*2.+h*90.));sky+=vec3(star)*uStars*clear*smoothstep(-.05,.15,d.y);}}
 // Square sun and moon, as in Minecraft, with a soft halo.
 vec3 right=normalize(cross(uSunDir,vec3(0.,0.,1.))),upv=cross(right,uSunDir);
 if(sd>0.){vec2 q=vec2(dot(d,right),dot(d,upv))/sd;float m=max(abs(q.x),abs(q.y));float disk=1.-smoothstep(.058,.062,m);
  sky=mix(sky,uSunColor*mix(1.6,2.2,1.-m/.06),disk*clear);
  sky+=uSunColor*(pow(sd,380.)*.9+pow(sd,24.)*.22)*clear;}
 else{float md=-sd;vec2 q=vec2(dot(d,-right),dot(d,upv))/md;float m=max(abs(q.x),abs(q.y));
  if(m<.045){vec2 px=floor((q/.045*.5+.5)*8.);float crater=.78+.22*rHash2(px+3.);float k=q.x/.045,side=uMoonPhase<=4.?1.:-1.,edge=-1.01+min(uMoonPhase,8.-uMoonPhase)*.5;
   float lit=k*side>edge?1.:.12;sky=mix(sky,vec3(.86,.88,.95)*crater*lit*1.2,clear*smoothstep(-.04,.02,d.y+.02));}
  sky+=vec3(.55,.62,.8)*pow(md,90.)*.25*uStars*clear;}
 vec4 cl=clouds(uCam,d);sky=mix(sky,cl.rgb,cl.a);
 sky+=uFlash*vec3(.55,.6,.75);
 gl_FragColor=vec4(sky,1.);
 #include <colorspace_fragment>
}`;

const RAIN_VERTEX=`uniform float uTime,uSnow,uAmount;uniform vec3 uCam;varying float vA;varying vec2 vQ;
void main(){vec3 box=vec3(26.,22.,26.);float speed=mix(17.,2.1,uSnow);vec3 p=position*box;p.y-=uTime*speed*(.85+uv.x*.3);
 p.x+=uSnow*sin(uTime*1.1+uv.y*40.)*.7;p.z+=uSnow*cos(uTime*.9+uv.x*40.)*.7;
 p=mod(p-uCam+box*.5,box)-box*.5+uCam;
 if(uv.y>uAmount){gl_Position=vec4(2.,2.,2.,1.);return;}
 vec3 toCam=vec3(uCam.x-p.x,0.,uCam.z-p.z);toCam=normalize(toCam+vec3(1e-4,0.,0.));vec3 right=vec3(toCam.z,0.,-toCam.x);
 float w=mix(.03,.075,uSnow),h=mix(.95,.075,uSnow);vec3 wp=p+right*normal.x*w*2.+vec3(0.,(normal.y-.5)*h*2.,0.);
 gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);float dist=length(p-uCam);vA=(1.-smoothstep(8.,13.,dist))*smoothstep(.9,2.6,dist);vQ=vec2(normal.x,normal.y*2.-1.);}`;
const RAIN_FRAGMENT=`uniform float uSnow,uBright;varying float vA;varying vec2 vQ;void main(){float a=uSnow>.5?(1.-smoothstep(.55,1.,length(vQ)))*.85:(.42*(1.-abs(vQ.x)));gl_FragColor=vec4(mix(vec3(.62,.7,.82),vec3(1.),uSnow)*uBright,a*vA);if(gl_FragColor.a<.01)discard;
 #include <colorspace_fragment>
}`;

class Realism {
 constructor(g){
  this.g=g;const v=this.v=g.view;this.level=effectsLevel();
  this.time={value:0};this.sway={value:1};this.fancyLeaves={value:1};
  this.sunDir=new Vector3(0,1,0);this.cam=new Vector3;
  this.torch={value:new Color(1,.6,.28)};
  this.colors=Object.fromEntries(Object.entries({dayZenith:'#3d74d6',dayHorizon:'#a9cbee',nightZenith:'#03060f',nightHorizon:'#0d1628',sunset:'#f0864a',sunsetHorizon:'#e7a578',rainZenith:'#5d6873',rainHorizon:'#8e979f',underwater:'#0f3563',lava:'#c24a08',sunDay:'#fff4d8',sunLow:'#ffb35c',moon:'#b4c6f0',hemiDay:'#eef4ff',hemiNight:'#a3b2dc',groundDay:'#77705e',groundNight:'#4a5264',cloudDay:'#ffffff',cloudNight:'#2a3040',cloudSunset:'#f3b48d'}).map(([k,h])=>[k,new Color(h)]));
  this.tmp=new Color;this.zen=new Color;this.hor=new Color;this.lastRoof=0;this.roofed=false;this.flash=0;this.nextFlash=0;
  this.flagsTexture=this.makeFlags();
  v.leafMat=v.material.clone();v.leafMat.alphaTest=.5;v.leafMat.side=2;
  this.setupTextures();this.patchTerrain(v.material);this.patchTerrain(v.leafMat);this.patchTerrain(v.glassMat);this.patchWater(v.waterMat,true);
  // The old flat sea plane sat just under the surface and hid lake beds; distance fog now covers the horizon.
  this.sea=v.scene.children.find(o=>o.isMesh&&o.geometry?.parameters?.width===700);this.waterColor=new Color('#2f6497');
  this.oldSun=v.scene.children.find(o=>o.isMesh&&o.geometry?.parameters?.width===10);this.makeSky();this.makeWeather();this.makeVignette();
  v.encodeLight=true;v.fancyLeaves=this.level==='fancy';this.applyLevel(true);
  const update=v.update.bind(v);v.update=(dt,t)=>{try{this.frame(dt,t);}catch(e){if(!this.warned){this.warned=true;console.warn('Visual effects paused:',e);}}update(dt,t);};
 }
 makeFlags(){const c=document.createElement('canvas');c.width=256;c.height=1;const x=c.getContext('2d');x.fillStyle='#000';x.fillRect(0,0,256,1);
  for(const t of HD_LEAF_TILES){x.fillStyle='#ff0000';x.fillRect(t,0,1,1);}for(const t of HD_EMISSIVE_TILES){x.fillStyle='#00ff00';x.fillRect(t,0,1,1);}
  const tex=new CanvasTexture(c);tex.magFilter=tex.minFilter=1003;tex.generateMipmaps=false;tex.flipY=false;tex.needsUpdate=true;return tex;}
 setupTextures(){
  // Mipmaps stop distant blocks shimmering; the shader clamps the level so tiles never bleed.
  const renderer=this.v.renderer;for(const m of [this.v.material,this.v.glassMat,this.v.leafMat])if(m?.map){m.map.generateMipmaps=true;m.map.minFilter=NEAREST_MIPMAP_LINEAR;m.map.magFilter=1003;m.map.anisotropy=Math.min(4,renderer.capabilities?.getMaxAnisotropy?.()||1);m.map.needsUpdate=true;}
 }
 patchTerrain(material){
  if(!material)return;const self=this;
  material.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,{uTime:self.time,uSway:self.sway,uFlags:{value:self.flagsTexture},uTorch:self.torch,uFancyLeaves:self.fancyLeaves});
   shader.vertexShader=shader.vertexShader
    .replace('#include <common>','#include <common>\nuniform float uTime,uSway;uniform sampler2D uFlags;varying float vBlockLight,vEmissive,vLeaf,vEncoded;')
    .replace('#include <color_vertex>',`#include <color_vertex>
     vBlockLight=0.;vEncoded=0.;
     #ifdef USE_COLOR
     if(color.b>1.5){vBlockLight=color.b-2.;vColor.rgb=vec3(color.g);vEncoded=1.;}
     #endif`)
    .replace('#include <begin_vertex>',`#include <begin_vertex>
     vEmissive=0.;vLeaf=0.;
     #ifdef USE_MAP
     float tileId=floor(uv.x*16.)+floor((1.-uv.y)*16.)*16.;vec4 tileFlags=texture(uFlags,vec2((tileId+.5)/256.,.5));vEmissive=tileFlags.g;vLeaf=tileFlags.r;
     if(vLeaf>.5&&uSway>0.){float ph=uTime*1.6+position.x*.63+position.z*.41+position.y*.27;transformed.x+=sin(ph)*.032*uSway;transformed.z+=cos(ph*1.13)*.028*uSway;transformed.y+=sin(ph*.71)*.012*uSway;}
     #endif`)
    .replace('#include <fog_vertex>','#ifdef USE_FOG\nvFogDepth=length(mvPosition.xyz);\n#endif');
   shader.fragmentShader=shader.fragmentShader
    .replace('#include <common>','#include <common>\nuniform float uTime,uFancyLeaves;uniform vec3 uTorch;varying float vBlockLight,vEmissive,vLeaf,vEncoded;')
    .replace('#include <map_fragment>',`#ifdef USE_MAP
     vec2 texel=vMapUv*512.;vec2 ddx=dFdx(texel),ddy=dFdy(texel);float lod=clamp(.5*log2(max(max(dot(ddx,ddx),dot(ddy,ddy)),1e-6)),0.,4.);
     vec4 sampledDiffuseColor=textureLod(map,vMapUv,lod);
     if(vLeaf>.5&&(uFancyLeaves<.5||vEncoded<.5))sampledDiffuseColor.a=1.;
     diffuseColor*=sampledDiffuseColor;
     #endif
     vec3 albedo=diffuseColor.rgb;`)
    .replace('#include <opaque_fragment>',`// Minecraft's light curve: level/(4-3·level). Daylight Lambert tops out near 0.6 × albedo.
     float bl=clamp(vBlockLight,0.,1.);bl=bl/(4.-3.*bl);
     outgoingLight=max(outgoingLight,albedo*uTorch*bl*.72);
     outgoingLight=mix(outgoingLight,albedo*(.86+.06*sin(uTime*1.7+vViewPosition.x*.3)),vEmissive);
     float luma=dot(outgoingLight,vec3(.2126,.7152,.0722));outgoingLight=max(mix(vec3(luma),outgoingLight,1.12),0.);
     #include <opaque_fragment>`);
  };
  material.needsUpdate=true;
 }
 patchWater(material,vertexColors){
  if(!material)return;const self=this;material.vertexColors=vertexColors;material.transparent=true;
  material.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,{uTime:self.time,uSunDir:{value:self.sunDir},uZenithW:{value:self.colors.dayZenith.clone()},uHorizonW:{value:self.colors.dayHorizon.clone()},uSunW:{value:new Color(1,1,1)},uSunVis:{value:1},uTorch:self.torch,uLower:{value:vertexColors?.1:0}});
   self.waterUniforms=self.waterUniforms||[];self.waterUniforms.push(shader.uniforms);
   shader.vertexShader=shader.vertexShader
    .replace('#include <common>','#include <common>\nuniform float uTime,uLower;varying vec3 vWorldPos,vWorldNormal;varying float vBlockLight;')
    .replace('#include <color_vertex>',`#include <color_vertex>
     vBlockLight=0.;
     #ifdef USE_COLOR
     if(color.b>1.5){vBlockLight=color.b-2.;vColor.rgb=vec3(color.g);}
     #endif`)
    .replace('#include <begin_vertex>',`#include <begin_vertex>
     vec3 wpos=(modelMatrix*vec4(transformed,1.)).xyz;
     float wave=sin(wpos.x*.8+uTime*1.3)*.5+sin(wpos.z*1.1-uTime*1.05)*.35+sin((wpos.x+wpos.z)*1.9+uTime*2.1)*.15;
     transformed.y+=-uLower+wave*.035;
     vWorldPos=(modelMatrix*vec4(transformed,1.)).xyz;vWorldNormal=normalize(mat3(modelMatrix)*objectNormal);`)
    .replace('#include <fog_vertex>','#ifdef USE_FOG\nvFogDepth=length(mvPosition.xyz);\n#endif');
   shader.fragmentShader=shader.fragmentShader
    .replace('#include <common>',`#include <common>\nuniform float uTime,uSunVis;uniform vec3 uSunDir,uZenithW,uHorizonW,uSunW,uTorch;varying vec3 vWorldPos,vWorldNormal;varying float vBlockLight;`)
    .replace('#include <opaque_fragment>',`
     vec2 wp=vWorldPos.xz;float wt=uTime;
     vec2 slope=vec2(cos(wp.x*1.7+wt*1.9)*.5+cos((wp.x+wp.y)*2.9+wt*2.3)*.3+cos(wp.x*5.3-wp.y*3.7+wt*3.4)*.2,
                     cos(wp.y*1.9-wt*1.6)*.5+cos((wp.x+wp.y)*2.9+wt*2.3)*.3+cos(wp.y*5.9+wp.x*2.9-wt*3.1)*.2);
     vec3 wn=normalize(vec3(-slope.x*.14,1.,-slope.y*.14));
     vec3 V=normalize(cameraPosition-vWorldPos);
     float skyVis=1.;
     #ifdef USE_COLOR
     skyVis=clamp(vColor.g*1.25,0.,1.);
     #endif
     float bl=clamp(vBlockLight,0.,1.);bl=bl/(4.-3.*bl);outgoingLight=max(outgoingLight,diffuse*uTorch*bl*.7);
     float alpha=diffuseColor.a;
     if(vWorldNormal.y>.5){
      float fres=.02+.98*pow(1.-max(dot(wn,V),0.),5.);
      vec3 R=reflect(-V,wn);vec3 refl=mix(uHorizonW,uZenithW,pow(clamp(R.y,0.,1.),.6))*skyVis;
      float spec=pow(max(dot(R,uSunDir),0.),260.)*uSunVis*skyVis;
      outgoingLight*=1.+(slope.x+slope.y)*.07;
      outgoingLight=mix(outgoingLight,refl,clamp(fres*.62,0.,.6))+uSunW*spec*2.2;
      alpha=clamp(alpha+fres*.25+spec,0.,.94);
     }
     gl_FragColor=vec4(outgoingLight,alpha);`);
  };
  material.needsUpdate=true;
 }
 makeSky(){
  const u=this.skyUniforms={uZenith:{value:new Color},uHorizon:{value:new Color},uSunset:{value:new Color},uSunColor:{value:new Color},uFogColor:{value:new Color},uCloudLit:{value:new Color},uCloudDark:{value:new Color},uSunDir:{value:this.sunDir},uCam:{value:this.cam},uSunsetAmt:{value:0},uStars:{value:0},uTime:this.time,uCloudCover:{value:.5},uCloudSteps:{value:24},uUnder:{value:0},uMoonPhase:{value:0},uRain:{value:0},uFlash:{value:0},uCloudY:{value:108},uStarAngle:{value:0},uCloudMap:{value:this.cloudMap()}};
  const m=new ShaderMaterial({uniforms:u,vertexShader:SKY_VERTEX,fragmentShader:SKY_FRAGMENT,side:BACK_SIDE,depthWrite:false,fog:false});
  this.sky=new Mesh(new BoxGeometry(2,2,2),m);this.sky.scale.setScalar(150);this.sky.frustumCulled=false;this.sky.renderOrder=1e6;this.v.scene.add(this.sky);
 }
 cloudMap(){
  // 64 × 64 repeating cloud cells (12 blocks each), shaped by two octaves of value noise.
  const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),img=x.createImageData(64,64),h=(i,j,s)=>{let n=Math.imul(((i%64)+64)%64,374761393)^Math.imul(((j%64)+64)%64,668265263)^Math.imul(s+17,1274126177);n=Math.imul(n^n>>>13,1274126177);return((n^n>>>16)>>>0)/4294967295;};
  const noise=(px,py,cells,s)=>{const f=64/cells,gx=px/f,gy=py/f,ix=Math.floor(gx),iy=Math.floor(gy),u=gx-ix,v=gy-iy,su=u*u*(3-2*u),sv=v*v*(3-2*v),w=k=>((k%cells)+cells)%cells,a=h(w(ix),w(iy),s),b=h(w(ix+1),w(iy),s),cc=h(w(ix),w(iy+1),s),d=h(w(ix+1),w(iy+1),s);return a+(b-a)*su+(cc-a)*sv+(a-b-cc+d)*su*sv;};
  for(let y=0;y<64;y++)for(let i=0;i<64;i++){const n=noise(i,y,8,5)*.62+noise(i,y,32,9)*.38,o=(y*64+i)*4;img.data[o]=img.data[o+1]=img.data[o+2]=Math.round(n*255);img.data[o+3]=255;}
  x.putImageData(img,0,0);const tex=new CanvasTexture(c);tex.magFilter=tex.minFilter=1003;tex.wrapS=tex.wrapT=1000;tex.generateMipmaps=false;tex.flipY=false;return tex;
 }
 makeWeather(){
  const count=3200,d={p:[],n:[],uv:[],col:[],idx:[]};
  for(let i=0;i<count;i++){const x=Math.random(),y=Math.random(),z=Math.random(),a=Math.random(),b=Math.random(),o=i*4;
   for(const [cx,cy] of [[-1,0],[1,0],[-1,1],[1,1]]){d.p.push(x,y,z);d.n.push(cx,cy,0);d.uv.push(a,b);d.col.push(1,1,1);}
   d.idx.push(o,o+1,o+2,o+2,o+1,o+3);}
  this.weatherUniforms={uTime:this.time,uSnow:{value:0},uAmount:{value:0},uCam:{value:this.cam},uBright:{value:1}};
  const m=new ShaderMaterial({uniforms:this.weatherUniforms,vertexShader:RAIN_VERTEX,fragmentShader:RAIN_FRAGMENT,transparent:true,depthWrite:false,fog:false});
  this.weather=new Mesh(makeGeometry(d),m);this.weather.frustumCulled=false;this.weather.visible=false;this.weather.renderOrder=5;this.v.scene.add(this.weather);
 }
 makeVignette(){if(document.getElementById('vignette'))return;const el=document.createElement('div');el.id='vignette';el.setAttribute('aria-hidden','true');document.getElementById('world')?.after(el);}
 setLevel(level){this.level=level==='fast'?'fast':'fancy';setEffectsLevel(this.level);this.applyLevel(false);}
 applyLevel(initial){
  const fancy=this.level==='fancy';this.sway.value=fancy?1:0;this.fancyLeaves.value=fancy?1:0;this.skyUniforms.uCloudSteps.value=fancy?24:1;
  const changed=this.v.fancyLeaves!==fancy;this.v.fancyLeaves=fancy;
  if(changed&&!initial){const stream=this.g.frontier?.stream;stream?.tables();for(const key of this.v.chunks.keys())this.g.world.dirty.add(key);}
 }
 weatherState(){const r=this.g.frontier?.requested;return this.g.dimension==='overworld'?(r?.weather||'clear'):'clear';}
 frame(dt,t){
  const g=this.g,v=this.v,c=this.colors,cam=v.camera.position,u=this.skyUniforms;
  // Weather fades use real elapsed time so slow frames do not stretch them out.
  const rdt=Math.min(.5,Math.max(0,(t-(this.lastT??t))/1000));this.lastT=t;
  this.time.value=t/1000;this.cam.copy(cam);this.sky.position.copy(cam);
  const overworld=g.dimension==='overworld'||!g.dimension;
  const fraction=g.clock?.fraction?.()??.3,a=fraction*Math.PI*2;
  this.sunDir.set(-Math.cos(a),Math.sin(a),.18).normalize();
  const elev=this.sunDir.y,day=smoothstep(-.18,.2,elev),sunset=Math.exp(-(((elev-.02)/.17)**2));
  // Weather
  const state=this.weatherState(),wet=state!=='clear'?1:0;this.rain=(this.rain??wet)+(wet-(this.rain??wet))*Math.min(1,rdt*.5);
  const rain=this.rain,storm=state==='storm'||state==='snowstorm';
  if(t-this.lastRoof>250){this.lastRoof=t;this.roofed=false;if(g.playing){const px=Math.floor(cam.x),pz=Math.floor(cam.z);for(let y=Math.floor(cam.y)+1;y<96;y++){const b=g.world.get(px,y,pz);if(b&&b!==14){this.roofed=true;break;}}}}
  const zen=this.zen.lerpColors(c.nightZenith,c.dayZenith,day),hor=this.hor.lerpColors(c.nightHorizon,c.dayHorizon,day);
  hor.lerp(c.sunsetHorizon,sunset*.55);
  if(rain>0){const k=rain*.8;zen.lerp(this.tmp.copy(c.rainZenith).multiplyScalar(.25+day*.75),k);hor.lerp(this.tmp.copy(c.rainHorizon).multiplyScalar(.2+day*.8),k);}
  // Lightning
  if(storm&&overworld&&t>this.nextFlash){const first=!this.nextFlash;this.nextFlash=t+7000+Math.random()*16000;if(!first){this.flash=1;this.thunder=t+500+Math.random()*1800;}}
  if(this.thunder&&t>this.thunder){this.thunder=0;g.sfx?.thunder?.();}
  this.flash=Math.max(0,this.flash-rdt*4);const flash=this.flash>0?(Math.sin(this.flash*20)>0?this.flash:this.flash*.3):0;
  u.uZenith.value.copy(zen);u.uHorizon.value.copy(hor);u.uSunset.value.copy(c.sunset);u.uSunsetAmt.value=sunset*(1-rain*.8);
  u.uSunColor.value.lerpColors(c.sunLow,c.sunDay,smoothstep(0,.35,elev));u.uStars.value=1-smoothstep(-.2,.05,elev);u.uRain.value=rain;u.uFlash.value=flash;
  u.uCloudLit.value.lerpColors(c.cloudNight,c.cloudDay,day).lerp(c.cloudSunset,sunset*.5).multiplyScalar(1-rain*.45);u.uCloudDark.value.copy(u.uCloudLit.value).multiplyScalar(.72);
  u.uCloudCover.value=.5-rain*.28;u.uStarAngle.value=a;
  const dayLength=1200000,worldMs=g.clock?.worldMs?.()??0;u.uMoonPhase.value=Math.floor(worldMs/dayLength)%8;
  // Camera medium
  const head=g.world.get(Math.floor(cam.x),Math.floor(cam.y),Math.floor(cam.z)),under=head===14?1:head===49?2:0;u.uUnder.value=under?1:0;
  this.sky.visible=overworld;this.weather.visible=overworld&&rain>.02&&!this.roofed&&!under;
  // Torch light is baked per vertex (it respects walls and never forces shader recompiles), so the old point lights stay off.
  for(const l of this.pointLights||(this.pointLights=v.scene.children.filter(o=>o.isPointLight)))l.visible=false;
  if(v.clouds)v.clouds.visible=false;if(this.sea)this.sea.visible=false;v.waterMat.color.copy(this.waterColor);
  if(this.oldSun)this.oldSun.visible=false;
  const fog=v.scene.fog,rd=Number(g.upgrade?.settings?.renderDistance)||4;
  if(overworld){
   const far=Math.max(40,rd*16+6)*(1-rain*.25);fog.near=far*(.6-rain*.3);fog.far=far;
   fog.color.copy(hor);if(flash)fog.color.lerp(this.tmp.set('#c8d2ff'),flash*.35);
   // Lights follow the sun or the moon.
   const hemi=this.hemi||(this.hemi=v.scene.children.find(o=>o.isHemisphereLight)),sun=g.upgrade?.sun||v.scene.children.find(o=>o.isDirectionalLight);
   if(hemi){hemi.color.lerpColors(c.hemiNight,c.hemiDay,day);hemi.groundColor.lerpColors(c.groundNight,c.groundDay,day);hemi.intensity=(.34+day*.6)*(1-rain*.4)+flash*.8;}
   if(sun){const moon=elev<-.04,dir=moon?this.sunDir.clone().negate():this.sunDir;const tx=Math.round(cam.x),tz=Math.round(cam.z);sun.target.position.set(tx,Math.round(cam.y),tz);sun.position.set(tx+dir.x*90,cam.y+Math.max(.15,dir.y)*90,tz+dir.z*90);sun.target.updateMatrixWorld();
    if(moon){sun.color.copy(c.moon);sun.intensity=.3*(1-rain*.6);}else{sun.color.copy(u.uSunColor.value);sun.intensity=1.2*smoothstep(-.04,.18,elev)*(1-rain*.65);}}
  }
  if(under===1){fog.color.copy(c.underwater).multiplyScalar(.25+day*.75);fog.near=.5;fog.far=18;}
  else if(under===2){fog.color.copy(c.lava);fog.near=0;fog.far=2.5;}
  u.uFogColor.value.copy(fog.color);
  // Water reflection follows the sky.
  if(this.waterUniforms)for(const w of this.waterUniforms){w.uZenithW.value.copy(overworld?zen:fog.color);w.uHorizonW.value.copy(overworld?hor:fog.color);w.uSunW.value.copy(u.uSunColor.value);w.uSunVis.value=overworld?smoothstep(-.02,.1,elev)*(1-rain):0;}
  this.torch.value.setRGB(1,.6,.28);
  const snow=state==='snow'||state==='snowstorm';this.weatherUniforms.uSnow.value=snow?1:0;this.weatherUniforms.uAmount.value=rain*(storm?1:.6)*(this.level==='fancy'?1:.45);this.weatherUniforms.uBright.value=.35+day*.65;
 }
}
