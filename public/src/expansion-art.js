import {surfaceHeight} from './frontier-gen.js';
import {Mesh,Group,BoxGeometry,PlaneGeometry,Material,BasicMaterial,CanvasTexture,SRGB,Nearest,Color} from './engine.js';
import {B,BLOCKS,TILES,blockShape,keyOf,parseKey,CARDINAL} from './expansion-data.js';
import {hash,ITEMS} from './core.js';
const box=new BoxGeometry(1,1,1);
export const DECOR=new Set([B.PORTAL,B.PORTAL_Z,B.END_PORTAL,B.END_EXIT,B.WIRE,B.LEVER,B.LEVER_ON,B.RED_TORCH,B.RED_TORCH_OFF,B.REPEATER,B.PLATE,B.BUTTON,B.STONE_BUTTON,B.BREWING_STAND,B.LADDER,B.RAIL,B.POWERED_RAIL,B.CARROTS,B.POTATOES,B.BEETROOTS,B.FLOWER,B.MUSHROOM,B.CAMPFIRE,B.FENCE,B.ANVIL,B.HOPPER]);
export function extendArt(view){const c=view.atlas,g=c.getContext('2d');g.imageSmoothingEnabled=false;
 for(const[id,d]of BLOCKS){const t=TILES.get(id),ox=t%16*32,oy=Math.floor(t/16)*32;g.fillStyle=d.color;g.fillRect(ox,oy,32,32);for(let y=0;y<16;y++)for(let x=0;x<16;x++){const n=hash(x,y,id);g.fillStyle=n>.5?'#fff1':'#0002';g.fillRect(ox+x*2,oy+y*2,2,2);}
  const rect=(x,y,w,h,col)=>{g.fillStyle=col;g.fillRect(ox+x*2,oy+y*2,w*2,h*2);};
  if(/brick|purpur/.test(d.key)){for(let y=0;y<16;y+=4){rect(0,y,16,1,'#0005');for(let x=y%8?0:4;x<16;x+=8)rect(x,y,1,4,'#0005');}}
  if(/planks|slab|stairs|trapdoor|fence|table/.test(d.key)){for(let y=0;y<16;y+=4){rect(0,y,16,1,'#0004');rect((y*3)%13,y,1,4,'#0003');}}
  if(/_ore/.test(d.key)||id===B.DEBRIS){for(let i=0;i<12;i++){let x=1+(hash(i,id,1)*13|0),y=1+(hash(i,id,2)*13|0),col=({44:'#e7dad0',55:'#d4473a',56:'#4568cb',57:'#52c988',115:'#d09473',113:'#a98572'})[id]||'#ada198';rect(x,y,2,2,col);rect(x,y,1,1,'#fff7');}}
  if(/_log/.test(d.key)){for(let x=0;x<16;x+=3)rect(x,0,1,16,id===B.BIRCH_LOG?'#4e4943':'#0005');}
  if([B.TNT].includes(id)){rect(0,5,16,6,'#ddd5c3');rect(0,0,16,1,'#432924');rect(0,15,16,1,'#432924');g.fillStyle='#312923';g.font='bold 12px monospace';g.fillText('TNT',ox+4,oy+20);}
  if([B.PISTON,B.PISTON_EXTENDED,B.STICKY_PISTON,B.STICKY_EXTENDED,B.PISTON_HEAD].includes(id)){rect(0,0,16,5,'#ad8f5a');rect(1,1,14,1,'#d2b37d');if([B.STICKY_PISTON,B.STICKY_EXTENDED].includes(id))rect(2,1,12,3,'#90ac60');for(let x of[0,14])rect(x,5,2,11,'#535654');}
  if(id===B.LAMP||id===B.LAMP_ON){const col=id===B.LAMP_ON?'#f7d590':'#967943';for(let i=0;i<4;i++)for(let j=0;j<4;j++)rect(i*4+1,j*4+1,3,3,col);}
  if(id===B.ENCHANT_TABLE){rect(1,1,14,3,'#993e43');rect(0,0,2,16,'#4dbcb6');rect(14,0,2,16,'#4dbcb6');rect(2,9,12,5,'#282435');}
  if(id===B.MAGMA||id===B.LAVA){for(let i=0;i<7;i++){const x=hash(i,2,id)*14|0,y=hash(i,3,id)*14|0;rect(x,y,3,2,'#ffd154');}}
  if(id===B.GLOWSTONE){for(let i=0;i<18;i++)rect(hash(i,4)*14|0,hash(i,5)*14|0,2,2,'#f9df9c');}
  if([B.END_FRAME,B.END_FRAME_EYE].includes(id)){rect(2,2,12,12,'#477866');rect(4,4,8,8,'#253e36');if(id===B.END_FRAME_EYE){rect(5,6,6,4,'#719d81');rect(7,6,2,4,'#152f29');}}
  if([B.GLASS_PANE,B.IRON_BARS].includes(id)){g.clearRect(ox,oy,32,32);if(id===B.GLASS_PANE){rect(0,0,16,16,'#b1d8d943');for(let x of[0,15])rect(x,0,1,16,'#e0ebdf');rect(0,0,16,1,'#e0ebdf');rect(0,15,16,1,'#e0ebdf');}else{for(let x=1;x<16;x+=4)rect(x,0,1,16,'#b1b9b3');for(let y of[4,12])rect(0,y,16,1,'#8b948e');}}
 }
 view.material.map.needsUpdate=true;
 const prior=globalThis.__carbonTile;globalThis.__carbonTile=(id,side)=>TILES.get(id)??prior?.(id,side);
}
export function part(parent,mat,s,p){const m=new Mesh(box,mat);m.scale.set(...s);m.position.set(...p);parent.add(m);return m;}
export class DecorationRenderer{
 constructor(e){this.e=e;this.objects=new Map;this.mats=new Map;this.last=0;}
 mat(color,emissive=false){const k=color+emissive;if(this.mats.has(k))return this.mats.get(k);const m=emissive?new BasicMaterial({color,transparent:color.length>7,opacity:color.length>7?.6:1}):new Material({color});this.mats.set(k,m);return m;}
 clear(){this.naturalPatch=null;for(const o of this.objects.values())o.group.parent?.remove(o.group);this.objects.clear();}
 update(t){const e=this.e,w=e.g.world;if(t-this.last>600){this.last=t;
 const px=Math.floor(e.g.player.x),pz=Math.floor(e.g.player.z),patch=(px>>4)+','+(pz>>4);
 if(e.g.dimension==='overworld'&&this.naturalPatch!==patch){this.naturalPatch=patch;w.v4Special??=new Set;
  for(let x=Math.max(-511,px-24);x<=Math.min(511,px+24);x++)for(let z=Math.max(-511,pz-24);z<=Math.min(511,pz+24);z++){
   if(Math.max(Math.abs(x),Math.abs(z))<134)continue;const y=surfaceHeight(x,z)+1,id=w.get(x,y,z);
   if(id===B.FLOWER||id===B.MUSHROOM)w.v4Special.add(keyOf(x,y,z));
  }
 }
 const keep=new Set;for(const key of w.v4Special||[]){const[x,y,z]=parseKey(key),id=w.get(x,y,z);if(!DECOR.has(id)||Math.hypot(x-e.g.player.x,z-e.g.player.z)>65)continue;keep.add(key);let o=this.objects.get(key);if(o?.id!==id){if(o)o.group.parent?.remove(o.group);o=this.make(x,y,z,id);this.objects.set(key,o);}o.power=(e.circuitState?.powers.get(key)||0);if(id===B.WIRE)o.wire.material=this.mat(o.power?'#e95833':'#6f241f',!!o.power);if(id===B.REPEATER)o.dot.material=this.mat(e.circuitMemory.get(key)?.output?'#f26435':'#673528',true);}
 for(const[k,o]of this.objects)if(!keep.has(k)){o.group.parent?.remove(o.group);this.objects.delete(k);}}
 for(const o of this.objects.values()){if(o.id===B.PORTAL||o.id===B.PORTAL_Z){o.group.children[0].material.opacity=.42+Math.sin(t*.002+o.x)*.12;o.group.children[0].scale.x=1+.025*Math.sin(t*.003);}if(o.id===B.BREWING_STAND&&o.bottle)o.bottle.rotation.y=t*.001;if(o.id===B.CAMPFIRE&&o.flame)o.flame.scale.y=.8+.2*Math.sin(t*.02);}
 }
 make(x,y,z,id){const group=new Group;group.position.set(x,y,z);const o={group,x,y,z,id},wood=this.mat('#987344'),stone=this.mat('#70766e'),red=this.mat('#d94b35',true),metal=this.mat('#747d79'),green=this.mat('#689442'),dark=this.mat('#353739'),p=(m,s,a)=>part(group,m,s,a),meta=this.e.meta(x,y,z),direction=meta.dir||0;
 if(id===B.PORTAL||id===B.PORTAL_Z){const m=new BasicMaterial({color:'#8764c1',transparent:true,opacity:.55,side:2,depthWrite:false});const portal=new Mesh(new PlaneGeometry(1,1),m);portal.position.set(.5,.5,.5);if(id===B.PORTAL_Z)portal.rotation.y=Math.PI/2;group.add(portal);}
 else if(id===B.END_PORTAL||id===B.END_EXIT){const m=this.mat('#172733',true);p(m,[1,.04,1],[.5,.08,.5]);for(let i=0;i<6;i++)p(this.mat('#a0c8b6',true),[.015,.015,.015],[hash(i,x)*.9,.11,hash(i,z)*.9]);}
 else if(id===B.WIRE){o.wire=p(this.mat('#782b23'),[.9,.025,.08],[.5,.035,.5]);p(o.wire.material,[.08,.025,.9],[.5,.035,.5]);}
 else if(id===B.LEVER||id===B.LEVER_ON){p(stone,[.42,.14,.34],[.5,.07,.5]);const h=p(wood,[.08,.5,.08],[.5,.35,.5]);h.rotation.x=id===B.LEVER_ON?.55:-.55;}
 else if(id===B.RED_TORCH||id===B.RED_TORCH_OFF){p(wood,[.1,.6,.1],[.5,.3,.5]);p(id===B.RED_TORCH?red:dark,[.17,.17,.17],[.5,.65,.5]);}
 else if(id===B.REPEATER){p(stone,[.87,.09,.87],[.5,.045,.5]);o.dot=p(red,[.1,.2,.1],[.5,.15,.23]);p(red,[.1,.2,.1],[.5,.15,.65]);}
 else if(id===B.BUTTON||id===B.STONE_BUTTON){p(id===B.BUTTON?wood:stone,[.35,.1,.2],[.5,.06,.5]);}
 else if(id===B.PLATE)p(wood,[.9,.06,.9],[.5,.03,.5]);
 else if(id===B.LADDER){p(wood,[.08,1,.07],[.16,.5,.95]);p(wood,[.08,1,.07],[.84,.5,.95]);for(let i=0;i<4;i++)p(wood,[.76,.06,.07],[.5,.15+i*.23,.95]);}
 else if(id===B.RAIL||id===B.POWERED_RAIL){const iron=id===B.RAIL?this.mat('#b4b9b3'):this.mat('#c9ac5b');for(const xx of[.18,.82])p(iron,[.055,.05,1],[xx,.045,.5]);for(let i=0;i<3;i++)p(wood,[.96,.045,.12],[.5,.022,.15+i*.34]);}
 else if(id===B.ANVIL){p(dark,[.75,.2,.7],[.5,.1,.5]);p(metal,[.37,.5,.42],[.5,.45,.5]);p(dark,[.92,.3,.48],[.5,.85,.5]);}
 else if(id===B.HOPPER){p(metal,[.9,.12,.9],[.5,.8,.5]);p(dark,[.66,.3,.66],[.5,.55,.5]);p(metal,[.3,.5,.3],[.5,.25,.5]);}
 else if(id===B.BREWING_STAND){p(stone,[.8,.12,.8],[.5,.06,.5]);p(this.mat('#ab9e58'),[.1,.8,.1],[.5,.5,.5]);p(metal,[.72,.07,.1],[.5,.4,.5]);for(let i of[.19,.81])p(this.mat('#6996b0'),[.17,.23,.17],[i,.25,.5]);o.bottle=p(this.mat('#a39ac3'),[.16,.23,.16],[.5,.25,.78]);}
 else if([B.CARROTS,B.POTATOES,B.BEETROOTS].includes(id)){const age=this.e.u.cropAge(x,y,z),h=Math.min(.7,.17+age/300);for(let i=0;i<6;i++){p(green,[.08,h,.06],[.2+i%3*.3,h/2,.3+Math.floor(i/3)*.35]);if(age>150)p(this.mat(id===B.CARROTS?'#ce7d31':id===B.POTATOES?'#aaa05e':'#ab424e'),[.15,.12,.14],[.2+i%3*.3,.08,.3+Math.floor(i/3)*.35]);}}
 else if(id===B.FENCE){p(wood,[.25,1.5,.25],[.5,.75,.5]);p(wood,[1,.17,.15],[.5,.56,.5]);p(wood,[1,.17,.15],[.5,1.1,.5]);}
 else if(id===B.CAMPFIRE){for(let i=0;i<3;i++){const m=p(wood,[.18,.16,.85],[.26+i*.24,.12,.5]);if(i%2)m.rotation.y=Math.PI/2;}o.flame=p(this.mat('#f2a344',true),[.38,.42,.38],[.5,.36,.5]);}
 else if(id===B.FLOWER||id===B.MUSHROOM){p(green,[.035,.45,.035],[.5,.22,.5]);p(this.mat('#b74d4a'),[.3,.15,.3],[.5,.44,.5]);}
 if([B.RAIL,B.POWERED_RAIL,B.LADDER,B.REPEATER].includes(id)){const pivot=new Group;pivot.position.set(.5,0,.5);for(const c of [...group.children]){c.position.x-=.5;c.position.z-=.5;pivot.add(c);}pivot.rotation.y=-direction*Math.PI/2;group.add(pivot);}
 this.e.g.view.scene.add(group);return o;
 }
}
