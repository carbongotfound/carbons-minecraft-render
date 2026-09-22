import {B,CARDINAL,keyOf,parseKey} from './expansion-data.js';
import {DAYLIGHT_SENSOR,NIGHT_SENSOR} from './building-data.js';
export const CIRCUIT_IDS=new Set([B.WIRE,B.LEVER,B.LEVER_ON,B.RED_TORCH,B.RED_TORCH_OFF,B.REPEATER,B.LAMP,B.LAMP_ON,B.PISTON,B.PISTON_EXTENDED,B.STICKY_PISTON,B.STICKY_EXTENDED,B.PLATE,B.BUTTON,B.STONE_BUTTON,B.TNT,B.HOPPER,B.REDSTONE_BLOCK,B.POWERED_RAIL,B.IRON_DOOR,B.IRON_DOOR_OPEN,B.NOTE_BLOCK]);
const N=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
CIRCUIT_IDS.add(DAYLIGHT_SENSOR);CIRCUIT_IDS.add(NIGHT_SENSOR);
export function solveCircuit(nodes,get,metadata,players,now,previous=new Map(),memory=new Map(),daylightAt=()=>15){
 const powers=new Map,sources=new Map,queue=[];
 const level=(x,y,z)=>Math.max(powers.get(keyOf(x,y,z))||0,sources.get(keyOf(x,y,z))||0);
 const previousLevel=(x,y,z)=>previous.get(keyOf(x,y,z))||0;
 for(const key of nodes){const[x,y,z]=parseKey(key),id=get(x,y,z),m=metadata(key)||{};let on=id===B.LEVER_ON||id===B.REDSTONE_BLOCK;
  if(id===B.RED_TORCH||id===B.RED_TORCH_OFF){const d=CARDINAL[m.dir||0];on=previousLevel(x-d[0],y,z-d[2])===0;}
  if(id===B.BUTTON||id===B.STONE_BUTTON)on=(m.until||0)>now;
  if(id===B.PLATE)on=players.some(p=>!p.dead&&Math.abs(p.x-x-.5)<.8&&Math.abs(p.z-z-.5)<.8&&p.y>=y-.15&&p.y<=y+.4);
  if(id===B.REPEATER)on=!!memory.get(key)?.output;
  if(on)sources.set(key,15);
  if(id===DAYLIGHT_SENSOR||id===NIGHT_SENSOR){const light=Math.max(0,Math.min(15,Math.round(daylightAt(x,y,z))));const strength=id===DAYLIGHT_SENSOR?light:15-light;if(strength)sources.set(key,strength);}
 }
 const seed=(x,y,z,n)=>{const key=keyOf(x,y,z);if(n<1||get(x,y,z)!==B.WIRE||(powers.get(key)||0)>=n)return;powers.set(key,n);queue.push([x,y,z,n]);};
 for(const[key,p]of sources){const[x,y,z]=parseKey(key),m=metadata(key)||{};if(get(x,y,z)===B.REPEATER){const d=CARDINAL[m.dir||0];seed(x+d[0],y,z+d[2],p);}else for(const[dX,dY,dZ]of N)seed(x+dX,y+dY,z+dZ,p);}
 for(let i=0;i<queue.length&&i<8192;i++){const[x,y,z,p]=queue[i];for(const[dX,,dZ]of CARDINAL){seed(x+dX,y,z+dZ,p-1);if(get(x,y+1,z)===0)seed(x+dX,y+1,z+dZ,p-1);if(get(x+dX,y,z+dZ)===0)seed(x+dX,y-1,z+dZ,p-1);}}
 const outputs=new Map;
 const incoming=(sx,sy,sz,x,y,z)=>{if(get(sx,sy,sz)===B.REPEATER){const d=CARDINAL[(metadata(keyOf(sx,sy,sz))||{}).dir||0];if(sx+d[0]!==x||sy!==y||sz+d[2]!==z)return 0;}return level(sx,sy,sz);};
 for(const key of nodes){const[x,y,z]=parseKey(key),id=get(x,y,z),meta=metadata(key)||{};let input=0;for(const[dx,dy,dz]of N)input=Math.max(input,incoming(x+dx,y+dy,z+dz,x,y,z));
  if(id===B.REPEATER){const d=CARDINAL[meta.dir||0],signal=incoming(x-d[0],y,z-d[2],x,y,z)>0,old=memory.get(key)||{input:false,output:false,due:0};if(old.input!==signal){old.input=signal;old.due=now+(meta.delay||1)*100;}if(now>=old.due)old.output=old.input;memory.set(key,old);outputs.set(key,old.output?15:0);}
  else outputs.set(key,input);
 }
 for(const[k,v]of sources)powers.set(k,v);
 return {powers,outputs,memory};
}
// Match the shared-world bounds and keep containers/portal blocks immovable.
const IMMOVABLE = new Set([13, 17, 22, 33, B.HOPPER, B.END_FRAME, B.END_FRAME_EYE, B.END_PORTAL, B.END_EXIT,
  B.ENCHANT_TABLE, B.ANVIL, B.BREWING_STAND, B.PORTAL, B.PORTAL_Z, B.PISTON_EXTENDED, B.STICKY_EXTENDED, B.PISTON_HEAD]);
export function pistonEdits(x, y, z, id, dir, shouldExtend, get, metadata, half = 512) {
  const d = CARDINAL[dir || 0], at = n => [x + d[0] * n, y, z + d[2] * n];
  const valid = p => p[0] >= -half && p[0] < half && p[2] >= -half && p[2] < half && p[1] >= 1 && p[1] <= 95;
  const extended = id === B.PISTON_EXTENDED || id === B.STICKY_EXTENDED;
  const sticky = id === B.STICKY_PISTON || id === B.STICKY_EXTENDED;
  if (shouldExtend === extended || !valid(at(0)) || !valid(at(1))) return [];
  const baseMeta = metadata(keyOf(x, y, z)) || {dir};
  if (shouldExtend) {
    let length = 0;
    while (true) {
      const p = at(length + 1);
      if (!valid(p)) return [];
      const block = get(...p);
      if (!block) break;
      if (IMMOVABLE.has(block) || length >= 12) return [];
      length++;
    }
    const edits = [];
    for (let i = length; i >= 1; i--) {
      const p = at(i), q = at(i + 1);
      edits.push({x: q[0], y, z: q[2], block: get(...p), meta: metadata(keyOf(...p)) || {}});
    }
    const front = at(1);
    edits.push({x: front[0], y, z: front[2], block: B.PISTON_HEAD, meta: {dir}},
      {x, y, z, block: sticky ? B.STICKY_EXTENDED : B.PISTON_EXTENDED, meta: baseMeta});
    return edits;
  }
  const front = at(1), beyond = at(2);
  const edits = [{x, y, z, block: sticky ? B.STICKY_PISTON : B.PISTON, meta: baseMeta}];
  if (get(...front) === B.PISTON_HEAD) {
    const block = valid(beyond) ? get(...beyond) : 0;
    const pull = sticky && block && !IMMOVABLE.has(block);
    edits.push({x: front[0], y, z: front[2], block: pull ? block : 0, meta: pull ? metadata(keyOf(...beyond)) || {} : {}});
    if (pull) edits.push({x: beyond[0], y, z: beyond[2], block: 0});
  }
  return edits;
}
