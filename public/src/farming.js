export const CROPS=new Set([26,101,102,103]);
export function hydrated(world,x,y,z){
 if(world.get(x,y-1,z)!==25)return false;
 for(let dx=-5;dx<=5;dx++)for(let dz=-5;dz<=5;dz++)if(dx*dx+dz*dz<=25)for(let dy=-1;dy<=0;dy++)if(world.get(x+dx,y+dy,z+dz)===14)return true;
 return false;
}
export function cropAge(world,clock,x,y,z){
 const row=world.metadata?.get(`${x},${y},${z}`);if(!row?.updated_at)return 0;
 const elapsed=Math.max(0,(clock.serverMs()-Date.parse(row.updated_at))/1000);
 return elapsed*(CROPS.has(world.get(x,y,z))&&hydrated(world,x,y,z)?1.15:1)+Math.max(0,Number(row.meta?.growth)||0);
}
export function pickupDelay(row){return row.player_dropped?2000:650;}
export function pickupReady(row,now){return now-Date.parse(row.created_at)>=pickupDelay(row);}
