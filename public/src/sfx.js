// Synthesised block sounds: filtered noise shaped per material, no audio files.
const GRASS=new Set([1,6,26,27,38,97,100,101,102,103,104,112,126,127,128,139]);
const GRAVEL=new Set([2,28,42,107,108]);
const SAND=new Set([4,93]);
const SNOW=new Set([11,132]);
const WOOD=new Set([5,7,16,22,23,24,25,34,35,59,60,77,80,83,84,85,86,95,96,98,99,121,122,140,185,186]);
const GLASS=new Set([9,43,105,106,124,141,143]);
const WOOL=new Set([19,109,110,111,...Array.from({length:13},(_,i)=>161+i)]);
const MATERIALS={
 grass:{type:'bandpass',freq:2600,q:.6,step:.09,dig:.16,gain:.5},
 gravel:{type:'bandpass',freq:1200,q:.8,step:.1,dig:.18,gain:.6},
 sand:{type:'highpass',freq:2200,q:.5,step:.11,dig:.17,gain:.35},
 snow:{type:'lowpass',freq:1500,q:.7,step:.12,dig:.16,gain:.45},
 wood:{type:'bandpass',freq:520,q:2.2,step:.07,dig:.12,gain:.9,knock:150},
 stone:{type:'bandpass',freq:900,q:1.4,step:.06,dig:.13,gain:.7,knock:95},
 glass:{type:'highpass',freq:3000,q:.9,step:.06,dig:.3,gain:.5,ring:true},
 wool:{type:'lowpass',freq:700,q:.5,step:.1,dig:.14,gain:.45},
};
export function materialOf(block){return GRASS.has(block)?'grass':GRAVEL.has(block)?'gravel':SAND.has(block)?'sand':SNOW.has(block)?'snow':WOOD.has(block)?'wood':GLASS.has(block)?'glass':WOOL.has(block)?'wool':'stone';}
export class BlockSounds{
 constructor(enabled){this.enabled=enabled;this.ctx=null;this.noise=null;}
 context(){
  if(!this.enabled())return null;
  try{this.ctx??=new(window.AudioContext||window.webkitAudioContext)();if(this.ctx.state==='suspended')this.ctx.resume();
   if(!this.noise){const n=this.ctx.sampleRate,b=this.ctx.createBuffer(1,n,n),d=b.getChannelData(0);let last=0;for(let i=0;i<n;i++){const w=Math.random()*2-1;last=last*.3+w*.7;d[i]=last;}this.noise=b;}
   this.out??=(()=>{const c=this.ctx.createDynamicsCompressor();c.connect(this.ctx.destination);return c;})();
   return this.ctx;}catch{return null;}
 }
 burst(block,duration,volume,pitch=1){
  const ctx=this.context();if(!ctx)return;const m=MATERIALS[materialOf(block)],t=ctx.currentTime,src=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();
  src.buffer=this.noise;src.playbackRate.value=pitch*(.9+Math.random()*.2);f.type=m.type;f.frequency.value=m.freq*pitch*(.9+Math.random()*.2);f.Q.value=m.q;
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume*m.gain,t+.006);g.gain.exponentialRampToValueAtTime(.0005,t+duration);
  src.connect(f);f.connect(g);g.connect(this.out);src.start(t,Math.random()*.5,duration+.05);
  if(m.knock){const o=ctx.createOscillator(),og=ctx.createGain();o.type='sine';o.frequency.setValueAtTime(m.knock*pitch*(.9+Math.random()*.2),t);o.frequency.exponentialRampToValueAtTime(m.knock*.55,t+duration*.6);og.gain.setValueAtTime(volume*.35,t);og.gain.exponentialRampToValueAtTime(.0005,t+duration*.6);o.connect(og);og.connect(this.out);o.start(t);o.stop(t+duration);}
  if(m.ring&&duration>.2)for(const k of [1,1.5,2.2]){const o=ctx.createOscillator(),og=ctx.createGain();o.frequency.value=1800*k+Math.random()*300;og.gain.setValueAtTime(volume*.05,t);og.gain.exponentialRampToValueAtTime(.0005,t+.35);o.connect(og);og.connect(this.out);o.start(t);o.stop(t+.36);}
 }
 step(block){if(block)this.burst(block,MATERIALS[materialOf(block)].step,.09);}
 hit(block){if(block)this.burst(block,.07,.1,1.15);}
 dig(block){if(block)this.burst(block,MATERIALS[materialOf(block)].dig,.26,.85);}
 place(block){if(block)this.burst(block,MATERIALS[materialOf(block)].dig*.8,.22,1);}
 thunder(){
  const ctx=this.context();if(!ctx)return;const t=ctx.currentTime,src=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();
  src.buffer=this.noise;src.loop=true;src.playbackRate.value=.35;f.type='lowpass';f.frequency.setValueAtTime(420,t);f.frequency.exponentialRampToValueAtTime(90,t+3);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.55,t+.08);g.gain.exponentialRampToValueAtTime(.001,t+3.4);src.connect(f);f.connect(g);g.connect(this.out);src.start(t);src.stop(t+3.5);
 }
}
