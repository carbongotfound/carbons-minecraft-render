import {collisionBoxes,blockBoxes} from './block-geometry.js';

export function collideWorld(world,p,height=1.8,r=.29,shapeResolver) {
  // Fences extend half a block above their cell, so inspect the cell below too.
  for(let x=Math.floor(p.x-r);x<=Math.floor(p.x+r);x++)
    for(let y=Math.floor(p.y)-1;y<=Math.floor(p.y+height-.001);y++)
      for(let z=Math.floor(p.z-r);z<=Math.floor(p.z+r);z++)
        for(const a of collisionBoxes(world,x,y,z,shapeResolver))
          if(p.x+r>x+a[0]&&p.x-r<x+a[3]&&p.y+height>y+a[1]+.001&&p.y<y+a[4]-.001&&p.z+r>z+a[2]&&p.z-r<z+a[5])return true;
  return false;
}

export function raycastWorld(world,o,d,reach=5,shapeResolver) {
  let x=Math.floor(o.x),y=Math.floor(o.y),z=Math.floor(o.z);
  const sx=Math.sign(d.x)||1,sy=Math.sign(d.y)||1,sz=Math.sign(d.z)||1;
  let tx=d.x?((sx>0?x+1:x)-o.x)/d.x:Infinity,ty=d.y?((sy>0?y+1:y)-o.y)/d.y:Infinity,tz=d.z?((sz>0?z+1:z)-o.z)/d.z:Infinity;
  const dx=Math.abs(1/d.x),dy=Math.abs(1/d.y),dz=Math.abs(1/d.z);let entry=0;
  for(let step=0;step<240&&entry<=reach;step++){
    const b=world.get(x,y,z);
    if(b&&b!==14){
      const fallback=shapeResolver(b)||([18,27,38].includes(b)?[.3,0,.3,.7,.9,.7]:[0,0,0,1,.85,1]);
      const boxes=blockBoxes(b,{fallback,meta:world.metadata?.get(`${x},${y},${z}`)?.meta||{},neighbor:(a,c,e)=>world.get(x+a,y+c,z+e),neighborMeta:(a,c,e)=>world.metadata?.get(`${x+a},${y+c},${z+e}`)?.meta||{}});
      let best=null;
      for(const box of boxes){
        let near=-Infinity,far=Infinity,n=[0,0,0];
        for(let k=0;k<3;k++){
          const v=[d.x,d.y,d.z][k],s=[o.x,o.y,o.z][k],p=[x,y,z][k];
          if(Math.abs(v)<1e-10){if(s<p+box[k]||s>p+box[k+3]){far=-Infinity;break;}continue;}
          let t1=(p+box[k]-s)/v,t2=(p+box[k+3]-s)/v;if(t1>t2)[t1,t2]=[t2,t1];
          if(t1>near){near=t1;n=[0,0,0];n[k]=v>0?-1:1;}far=Math.min(far,t2);
        }
        if(far>=Math.max(0,near)&&near<=reach&&(!best||Math.max(0,near)<best.t))best={x,y,z,b,n,t:Math.max(0,near),box};
      }
      if(best)return best;
    }
    if(tx<ty&&tx<tz){entry=tx;tx+=dx;x+=sx;}else if(ty<tz){entry=ty;ty+=dy;y+=sy;}else{entry=tz;tz+=dz;z+=sz;}
  }
  return null;
}
