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
 // Short voiced calls: an oscillator through a formant filter, pitched up when hurt.
 voice(type,f0,f1,dur,formant,q,vol,{tremolo=0,noise=0,pulses=1,gap=.12}={}){
  const ctx=this.context();if(!ctx)return;for(let k=0;k<pulses;k++){const t=ctx.currentTime+k*gap,o=ctx.createOscillator(),f=ctx.createBiquadFilter(),g=ctx.createGain();
   o.type=type;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);f.type='bandpass';f.frequency.value=formant;f.Q.value=q;
   g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+Math.min(.05,dur*.2));g.gain.setValueAtTime(vol,t+dur*.6);g.gain.exponentialRampToValueAtTime(.0005,t+dur);
   if(tremolo){const lfo=ctx.createOscillator(),lg=ctx.createGain();lfo.frequency.value=tremolo;lg.gain.value=vol*.6;lfo.connect(lg);lg.connect(g.gain);lfo.start(t);lfo.stop(t+dur);}
   o.connect(f);f.connect(g);g.connect(this.out);o.start(t);o.stop(t+dur+.02);
   if(noise){const s=ctx.createBufferSource(),ng=ctx.createGain();s.buffer=this.noise;ng.gain.setValueAtTime(vol*noise,t);ng.gain.exponentialRampToValueAtTime(.0005,t+dur);s.connect(f);f.connect(ng);ng.connect(this.out);s.start(t,Math.random()*.5,dur);}}
 }
 mob(kind,hurt=false,volume=1){
  const r=.9+Math.random()*.2,h=hurt?1.35:1,v=.12*volume;
  switch(kind){
   case 'cow':return this.voice('sawtooth',115*r*h,86*r*h,hurt?.35:.95,520,2.5,v,{tremolo:6});
   case 'pig':return this.voice('square',330*r*h,210*r*h,.13,950,3,v*.6,{pulses:hurt?1:2,gap:.16});
   case 'sheep':return this.voice('sawtooth',390*r*h,350*r*h,hurt?.3:.6,1250,3,v*.8,{tremolo:17});
   case 'chicken':return this.voice('triangle',980*r*h,620*r*h,.07,1500,2,v*.7,{pulses:hurt?1:3,gap:.1});
   case 'zombie':return this.voice('sawtooth',98*r*h,74*r*h,hurt?.4:1.1,430,2,v*1.2,{noise:.5,tremolo:4});
   case 'skeleton':return this.burst(3,.06,volume*.5,2.2),this.burst(3,.05,volume*.4,2.6);
   case 'spider':return this.voice('sawtooth',62*r,55*r,.5,2600,1,v*.5,{noise:1.4});
   case 'creeper':return hurt?this.voice('sawtooth',220*r,160*r,.2,900,2,v):undefined;
   case 'enderman':return this.voice('sine',180*r,hurt?900:520,.55,700,.8,v*.9,{tremolo:9});
   case 'villager':return this.voice('triangle',250*r*h,195*r*h,.32,700,3,v*.9,{tremolo:7});
   case 'bat':return this.voice('square',3800*r,2900*r,.05,4200,4,v*.25,{pulses:2,gap:.07});
   case 'slime':return this.burst(107,.14,volume*.35,.6);
   case 'blaze':return this.voice('sawtooth',140*r,120*r,.7,800,1,v*.6,{noise:1});
  }
 }
 pickup(){return this.voice('sine',720*(.95+Math.random()*.1),1250,.09,1400,1,.09);}
 thunder(){
  const ctx=this.context();if(!ctx)return;const t=ctx.currentTime,src=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();
  src.buffer=this.noise;src.loop=true;src.playbackRate.value=.35;f.type='lowpass';f.frequency.setValueAtTime(420,t);f.frequency.exponentialRampToValueAtTime(90,t+3);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.55,t+.08);g.gain.exponentialRampToValueAtTime(.001,t+3.4);src.connect(f);f.connect(g);g.connect(this.out);src.start(t);src.stop(t+3.5);
 }
}
