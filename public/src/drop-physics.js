import {collisionBoxes} from './block-geometry.js';
import {collideWorld} from './block-physics.js';

// Drops use their small physical bounds and the same surfaces as the player.
export function stepDroppedItem(world,d,dt,shapeResolver) {
  const water=world.get(Math.floor(d.x),Math.floor(d.y),Math.floor(d.z))===14;
  d.vy=Math.max(water?-2:-22,d.vy-(water?3:20)*dt);
  const steps=Math.max(1,Math.ceil(Math.max(Math.abs(d.vx*dt),Math.abs(d.vy*dt),Math.abs(d.vz*dt))/.12));
  const step=dt/steps,r=.1;
  for(let i=0;i<steps;i++){
    for(const axis of ['x','z']){
      if(!d['v'+axis])continue;
      const p={x:d.x,y:d.y-r,z:d.z};p[axis]+=d['v'+axis]*step;
      if(collideWorld(world,p,.2,r,shapeResolver))d['v'+axis]*=-.25;else d[axis]=p[axis];
    }
    const next=d.y+d.vy*step,falling=d.vy<=0;let surface=falling?-Infinity:Infinity;
    for(let x=Math.floor(d.x-r);x<=Math.floor(d.x+r);x++)
      for(let z=Math.floor(d.z-r);z<=Math.floor(d.z+r);z++)
        for(let y=Math.floor(Math.min(next,d.y)-r)-1;y<=Math.floor(Math.max(next,d.y)+r);y++)
          for(const box of collisionBoxes(world,x,y,z,shapeResolver)){
            if(d.x+r<=x+box[0]||d.x-r>=x+box[3]||d.z+r<=z+box[2]||d.z-r>=z+box[5])continue;
            if(falling){const top=y+box[4];if(d.y-r>=top-.03&&next-r<=top+(d.grounded?.03:0))surface=Math.max(surface,top);}
            else{const bottom=y+box[1];if(d.y+r<=bottom+.03&&next+r>=bottom)surface=Math.min(surface,bottom);}
          }
    if(Number.isFinite(surface)){d.y=surface+(falling?.12:-.12);d.vy=0;d.grounded=falling;}
    else{d.y=next;d.grounded=false;}
  }
  if(d.grounded){d.vx*=Math.exp(-9*dt);d.vz*=Math.exp(-9*dt);}
  d.simulated=(d.simulated||0)+dt;
}
