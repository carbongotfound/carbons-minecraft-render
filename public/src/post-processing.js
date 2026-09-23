import {WebGLRenderTarget,ShaderMaterial,cloneUniforms,Vector2} from './engine.js';
import {FXAAShader} from '../vendor/three/FXAAShader.js';
import {SMAAPass} from '../vendor/three/SMAAPass.js';
import {FullScreenQuad} from '../vendor/three/Pass.js';
const vertexShader='varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
export class PostProcessing {
 constructor(renderer){
  this.renderer=renderer;this.render=renderer.render.bind(renderer);this.mode='none';
  this.sceneTarget=null;
  this.colorTarget=null;
  this.output=new ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{tDiffuse:{value:null}},vertexShader,fragmentShader:'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){vec4 c=texture2D(tDiffuse,vUv);vec3 lo=c.rgb*12.92;vec3 hi=1.055*pow(max(c.rgb,vec3(0.0)),vec3(1.0/2.4))-.055;gl_FragColor=vec4(mix(hi,lo,lessThanEqual(c.rgb,vec3(.0031308))),c.a);}'});
  this.fxaa=new ShaderMaterial({...FXAAShader,uniforms:cloneUniforms(FXAAShader.uniforms),depthTest:false,depthWrite:false});
  this.quad=new FullScreenQuad(this.output);this.smaa=null;
  this.size=new Vector2();this.busy=false;
  renderer.render=(scene,camera)=>{if(this.busy||renderer.getRenderTarget())return this.render(scene,camera);this.draw(scene,camera);};
 }
 configure(mode,w,h){
  if(this.configKey===mode+':'+w+':'+h)return;this.configKey=mode+':'+w+':'+h;
  const samples=mode==='msaa'?Math.min(4,this.renderer.capabilities.maxSamples||0):0;
  this.mode=mode==='msaa'&&!samples?'none':mode;
  if(this.mode==='none'){this.sceneTarget?.dispose();this.colorTarget?.dispose();this.smaa?.dispose();this.sceneTarget=this.colorTarget=this.smaa=null;return;}
  this.sceneTarget??=new WebGLRenderTarget(w,h,{depthBuffer:true});
  if(this.mode==='smaa'||this.mode==='fxaa')this.colorTarget??=new WebGLRenderTarget(w,h,{depthBuffer:false});else{this.colorTarget?.dispose();this.colorTarget=null;}
  if(this.mode==='smaa'){this.smaa??=new SMAAPass();this.smaa.renderToScreen=false;}else{this.smaa?.dispose();this.smaa=null;}
  if(this.sceneTarget.samples!==samples){this.sceneTarget.dispose();this.sceneTarget.samples=samples;}
  this.sceneTarget.setSize(w,h);this.colorTarget?.setSize(w,h);this.smaa?.setSize(w,h);this.fxaa.uniforms.resolution.value.set(1/w,1/h);
 }
 draw(scene,camera){
  if(this.mode==='none')return this.render(scene,camera);
  const r=this.renderer;this.busy=true;
  try{
   r.setRenderTarget(this.sceneTarget);this.render(scene,camera);
   let texture=this.sceneTarget.texture;
   if(this.mode==='smaa'){this.smaa.render(r,this.colorTarget,this.sceneTarget);texture=this.colorTarget.texture;}
   this.output.uniforms.tDiffuse.value=texture;this.quad.material=this.output;
   r.setRenderTarget(this.mode==='fxaa'?this.colorTarget:null);this.quad.render(r);
   if(this.mode==='fxaa'){this.fxaa.uniforms.tDiffuse.value=this.colorTarget.texture;this.quad.material=this.fxaa;r.setRenderTarget(null);this.quad.render(r);}
  }finally{r.setRenderTarget(null);this.busy=false;}
 }
}
