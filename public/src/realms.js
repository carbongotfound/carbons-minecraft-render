import {hash,noise,heightAt} from './core.js';
import {B,keyOf,blockShape} from './expansion-data.js';

export const LANDMARKS=[
 {id:'village',dim:'overworld',x:-70,z:-64,r:20,name:'Oakridge village',hint:'Farmers trade crops for emeralds.'},
 {id:'stronghold',dim:'overworld',x:78,z:74,r:12,name:'Old stronghold',hint:'Twelve eyes open the frame.'},
 {id:'mineshaft',dim:'overworld',x:-82,z:71,r:16,name:'Abandoned mine',hint:'Follow the rails below the stone arch.'},
 {id:'fortress',dim:'nether',x:42,z:-40,r:17,name:'Nether fortress',hint:'Blazes patrol the brick walkways.'}
];
export function groundLevel(dim,x,z){if(dim==='overworld')return heightAt(x,z);if(dim==='nether')return Math.floor(25+noise(x*.045,z*.045,701)*12+noise(x*.13,z*.13,708)*4);const d=Math.hypot(x,z);return Math.floor(48+Math.sin(x*.09)*2+Math.cos(z*.08)*2-Math.max(0,d-34)*.12);}
export const END_CENTER={x:0,y:51,z:0};
export function endPillars(){return Array.from({length:8},(_,i)=>{const angle=i*Math.PI/4;return{x:Math.round(Math.cos(angle)*27),z:Math.round(Math.sin(angle)*27),y:59+i%4*4};});}
const TRACKED=new Set([50,51,52,53,54,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,84,101,102,103,120,122,123,126,128,133,136,138]);
export function markSpecial(w,x,y,z,id){w.v4Special??=new Set;if(TRACKED.has(id))w.v4Special.add(keyOf(x,y,z));}
function raw(w,x,y,z,id){if(!w.valid(x,y,z))return;w.raw(x,y,z,id);markSpecial(w,x,y,z,id);}
export function frameCells(x,y,z,axis='x',interior=B.PORTAL){const list=[];for(let u=0;u<4;u++)for(let v=0;v<5;v++){if((u===0||u===3)&&(v===0||v===4))continue;list.push({x:x+(axis==='x'?u:0),y:y+v,z:z+(axis==='z'?u:0),block:u===0||u===3||v===0||v===4?33:interior});}return list;}
export function portalRing(centerX,y,centerZ,filled=false){const a=[];for(let i=-1;i<=1;i++)for(const [dx,dz]of [[i,-2],[i,2],[-2,i],[2,i]])a.push({x:centerX+dx,y,z:centerZ+dz,block:filled?B.END_FRAME_EYE:B.END_FRAME});return a;}
export function generateRealm(w,dim){w.dimension=dim;w.v4Special=new Set;w.naturalDecor=new Set;w.metadata=new Map;w.v4Natural=new Map;
 if(dim==='nether'){
  for(let x=-256;x<256;x++)for(let z=-256;z<256;z++){const h=groundLevel(dim,x,z),roof=82+Math.floor(noise(x*.07,z*.07,706)*8);for(let y=0;y<96;y++){let b=0;if(y===0||y===95)b=13;else if(y<=h||y>=roof){b=B.NETHERRACK;if(y>3&&y<h-3){let n=hash(x>>1,z>>1,y>>1);if(n>.992)b=B.QUARTZ_ORE;else if(n>.989&&y<20)b=B.DEBRIS;else if(n>.976&&y<23)b=B.BLACKSTONE;}if(y===h&&noise(x*.08,z*.08,722)>.62)b=B.SOUL_SAND;}else if(y<29)b=B.LAVA;raw(w,x,y,z,b);}
   if(hash(x,z,791)>.992)for(let y=roof-2;y<roof;y++)raw(w,x,y,z,B.GLOWSTONE);
  }
  for(let x=-7;x<=7;x++)for(let z=-9;z<=7;z++)for(let y=28;y<42;y++)raw(w,x,y,z,y<=32?B.NETHER_BRICKS:0);
  for(const b of frameCells(-1,33,-5))raw(w,b.x,b.y,b.z,b.block);
  w.spawn={x:.5,y:33.04,z:.5,yaw:0,pitch:0};
 }else if(dim==='end'){
  for(let x=-256;x<256;x++)for(let z=-256;z<256;z++){const d=Math.hypot(x,z),island=d<54+noise(x*.035,z*.035,830)*9||d>77&&noise(x*.046,z*.046,847)>.62;const top=groundLevel(dim,x,z),depth=Math.max(2,Math.floor(14-noise(x*.08,z*.08,853)*6));if(island)for(let y=top-depth;y<=top;y++)raw(w,x,y,z,B.END_STONE);}
  for(let x=-6;x<=6;x++)for(let z=-6;z<=6;z++)for(let y=46;y<=52;y++)raw(w,x,y,z,y<=50?B.END_STONE:0);
  for(const p of endPillars())for(let x=p.x-1;x<=p.x+1;x++)for(let z=p.z-1;z<=p.z+1;z++)for(let y=groundLevel(dim,x,z);y<p.y;y++)raw(w,x,y,z,33);
  for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++)if(Math.max(Math.abs(x),Math.abs(z))===3)raw(w,x,51,z,13);
  for(let x=-35;x<=-29;x++)for(let z=-3;z<=3;z++)for(let y=46;y<55;y++)raw(w,x,y,z,y===49?33:y<49?B.END_STONE:0);
  w.spawn={x:-32.5,y:50.04,z:.5,yaw:-Math.PI/2,pitch:0};
 }
 buildStructures(w,dim);w.base=w.data.slice();dirtyAll(w);return w;
}
export function enhanceOverworld(w,enabled={}){if(w.expanded)return;w.expanded=true;w.dimension='overworld';w.v4Special=new Set;w.v4Natural=new Map;const put=(x,y,z,b)=>{if(w.versions.has(keyOf(x,y,z)))return;raw(w,x,y,z,b);};
 for(let x=-128;x<128;x++)for(let z=-128;z<128;z++){
  const h=heightAt(x,z),cold=noise(x*.018,z*.018,914)>.7,dry=noise(x*.018,z*.018,918)>.7;
  for(let y=2;y<h-4;y++){const b=w.get(x,y,z);if(b!==3)continue;const n=hash(x>>1,z>>1,(y>>1)+950);let next=b;if(n>.991&&y<28)next=B.REDSTONE_ORE;else if(n>.985&&y<32)next=B.LAPIS_ORE;else if(n>.983&&h>40)next=B.EMERALD_ORE;else if(n>.978&&y<35)next=B.COPPER_ORE;else if(n>.96&&y<12)next=B.DEEPSLATE;else if(n>.955)next=B.GRANITE;else if(n>.95)next=B.DIORITE;if(next!==b)put(x,y,z,next);}
  if(cold&&w.get(x,h,z)===1)put(x,h,z,11);if(dry&&w.get(x,h,z)===4&&hash(x,z,990)>.993)for(let y=h+1;y<=h+3;y++)if(!w.get(x,y,z))put(x,y,z,B.CACTUS);
  if(w.get(x,h,z)===1&&!w.get(x,h+1,z)&&hash(x,z,991)>.995)put(x,h+1,z,B.FLOWER);
  if(x< -38||x>38||z< -38||z>38)for(let y=h+1;y<=Math.min(80,h+10);y++){const b=w.get(x,y,z);if(b===5)put(x,y,z,cold?B.SPRUCE_LOG:dry?B.BIRCH_LOG:5);if(b===6)put(x,y,z,cold?B.SPRUCE_LEAVES:dry?B.BIRCH_LEAVES:6);}
 }
 // Small deep lava pockets supply obsidian without changing the surface or player edits.
 for(const [cx,cz]of [[28,23],[-35,27],[32,-29]])for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++){if(dx*dx+dz*dz>10)continue;put(cx+dx,7,cz+dz,Math.abs(dx)+Math.abs(dz)>3?33:B.LAVA);for(let y=8;y<=10;y++)put(cx+dx,y,cz+dz,0);}
 buildStructures(w,'overworld',enabled);w.base=w.data.slice();dirtyAll(w);
}
export function dirtyAll(w){for(let x=0;x<32;x++)for(let z=0;z<32;z++)w.dirty.add(`${x},${z}`);}
export function buildStructures(w,dim,enabled={}){
 const put=(x,y,z,b)=>{if(w.versions.has(keyOf(x,y,z)))return;raw(w,x,y,z,b);if([18,20,22,23,24,25,26,27,34,36,37,38,39].includes(b))w.naturalDecor?.add(keyOf(x,y,z));if([26,B.CARROTS,B.POTATOES,B.BEETROOTS].includes(b)){w.metadata??=new Map;w.metadata.set(keyOf(x,y,z),{x,y,z,block:b,revision:0,updated_at:'2020-01-01T00:00:00Z',meta:{natural:true}});}};
 const chest=(id,x,y,z)=>{put(x,y,z,22);w.v4Natural??=new Map;w.v4Natural.set(keyOf(x,y,z),id);};
 for(const s of LANDMARKS.filter(v=>v.dim===dim&&enabled[v.id]!==false)){
  const y=dim==='nether'?36:heightAt(s.x,s.z)+1;s.floor=y;
  if(s.id==='village'){
   for(let x=s.x-19;x<=s.x+19;x++)for(let z=s.z-19;z<=s.z+19;z++){for(let yy=Math.min(heightAt(x,z),y-3);yy<y;yy++)put(x,yy,z,2);for(let yy=y;yy<y+11;yy++)put(x,yy,z,0);put(x,y-1,z,Math.abs(x-s.x)<2||Math.abs(z-s.z)<2?28:1);}
   for(const [i,dx,dz]of [[0,-12,-10],[1,8,-10],[2,-12,8]]){const x=s.x+dx,z=s.z+dz;for(let xx=0;xx<8;xx++)for(let zz=0;zz<7;zz++){put(x+xx,y-1,z+zz,10);for(let yy=0;yy<5;yy++){let b=0;if(yy===4)b=7;else if(xx===0||xx===7||zz===0||zz===6)b=yy===2&&(xx===0||xx===7)?9:7;if(zz===0&&xx===3&&yy<2)b=yy===0?23:36;put(x+xx,y+yy,z+zz,b);}if(xx===0||xx===7||zz===0||zz===6)put(x+xx,y+5,z+zz,7);}
    put(x+1,y,z+4,20);put(x+6,y,z+4,i===0?16:17);put(x+5,y+2,z+5,18);chest('village-'+i,x+5,y,z+4);
   }
   for(let x=s.x+5;x<s.x+15;x++)for(let z=s.z+5;z<s.z+14;z++){put(x,y-1,z,z===s.z+9?14:25);if(z!==s.z+9)put(x,y,z,(x+z)%3===0?B.CARROTS:26);}
   for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){put(s.x+dx,y-1,s.z+dz,Math.abs(dx)===2||Math.abs(dz)===2?10:14);if(Math.abs(dx)===2&&Math.abs(dz)===2)for(let yy=0;yy<4;yy++)put(s.x+dx,y+yy,s.z+dz,5);put(s.x+dx,y+4,s.z+dz,7);}
  }else if(s.id==='stronghold'){
   for(let dx=-10;dx<=10;dx++)for(let dz=-10;dz<=10;dz++)for(let dy=-4;dy<=7;dy++){let b=dy<0?B.STONE_BRICKS:0;if(dy>=0&&(Math.abs(dx)===10||Math.abs(dz)===10))b=dy<7?B.MOSSY_BRICKS:0;if(dy===6)b=B.STONE_BRICKS;if(dz===-10&&Math.abs(dx)<=1&&dy<4)b=0;put(s.x+dx,y+dy,s.z+dz,b);}
   for(const b of portalRing(s.x,y,s.z))put(b.x,b.y,b.z,b.block);
   for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)put(s.x+x,y-1,s.z+z,B.LAVA);
   for(let dx of[-8,8]){put(s.x+dx,y+2,s.z-8,18);put(s.x+dx,y+2,s.z+8,18);}
   for(let i=-7;i<=7;i++)if(Math.abs(i)>3)put(s.x+i,y,s.z+8,34);
   chest('stronghold',s.x-8,y,s.z+7);
  }else if(s.id==='mineshaft'){
   const floor=Math.max(10,y-15);for(let dx=-3;dx<=3;dx++)for(let dz=-14;dz<=14;dz++)for(let yy=floor-1;yy<=floor+4;yy++)put(s.x+dx,yy,s.z+dz,yy===floor-1?7:0);
   for(let dz=-12;dz<=12;dz+=6){for(let dy=0;dy<3;dy++)for(let dx of[-2,2])put(s.x+dx,floor+dy,s.z+dz,5);for(let dx=-2;dx<=2;dx++)put(s.x+dx,floor+3,s.z+dz,7);put(s.x-2,floor+2,s.z+dz+1,18);}
   for(let dz=-13;dz<=13;dz++)put(s.x,floor,s.z+dz,B.RAIL);
   for(let yy=floor;yy<=y+2;yy++){put(s.x+3,yy,s.z,0);put(s.x+4,yy,s.z,3);put(s.x+3,yy,s.z,B.LADDER);}
   put(s.x+3,y+3,s.z,18);chest('mineshaft',s.x+1,floor,s.z+11);
  }else if(s.id==='fortress'){
   for(let dx=-15;dx<=15;dx++)for(let dz=-15;dz<=15;dz++){for(let dy=-5;dy<=6;dy++){let b=dy<0?B.NETHER_BRICKS:0;if((Math.abs(dx)===15||Math.abs(dz)===15)&&dy<3)b=B.NETHER_BRICKS;put(s.x+dx,y+dy,s.z+dz,b);}if(Math.abs(dx)>10&&Math.abs(dz)>10)for(let dy=0;dy<8;dy++)put(s.x+dx,y+dy,s.z+dz,B.NETHER_BRICKS);}
   for(let dx=-5;dx<=5;dx++)for(let dz=-5;dz<=5;dz++)put(s.x+dx,y-1,s.z+dz,B.SOUL_SAND);
   for(let dx of[-9,9])for(let dz of[-9,9])put(s.x+dx,y,s.z+dz,B.GLOWSTONE);
   chest('fortress',s.x-8,y,s.z-8);
  }
 }
}
export function structureCoordinates(){const out=[];for(const s of LANDMARKS){const y=s.dim==='nether'?36:heightAt(s.x,s.z)+1;if(s.id==='village')for(const [i,dx,dz]of [[0,-12,-10],[1,8,-10],[2,-12,8]])out.push({id:'village-'+i,dim:s.dim,x:s.x+dx+5,y,z:s.z+dz+4,structure:s.id});if(s.id==='stronghold')out.push({id:s.id,dim:s.dim,x:s.x-8,y,z:s.z+7,structure:s.id});if(s.id==='mineshaft')out.push({id:s.id,dim:s.dim,x:s.x+1,y:Math.max(10,y-15),z:s.z+11,structure:s.id});if(s.id==='fortress')out.push({id:s.id,dim:s.dim,x:s.x-8,y,z:s.z-8,structure:s.id});}return out;}
