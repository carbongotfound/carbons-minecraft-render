import {Mesh,PlaneGeometry,BasicMaterial,CanvasTexture,SRGB,Group} from './engine.js';
const EMITTERS=new Map([[18,['#ffbd62',13]],[43,['#ffda85',15]],[49,['#ff742d',15]],[61,['#ee342d',6]],[64,['#ffd59a',15]],[119,['#ff792b',7]],[123,['#ffc066',13]]]);
export function installLightSources(g){
 const view=g.view,group=new Group;view.scene.add(group);const sprites=[];
 const c=document.createElement('canvas');c.width=c.height=32;const ctx=c.getContext('2d'),gradient=ctx.createRadialGradient(16,16,0,16,16,16);gradient.addColorStop(0,'#ffffffbb');gradient.addColorStop(.2,'#ffffff44');gradient.addColorStop(1,'#ffffff00');ctx.fillStyle=gradient;ctx.fillRect(0,0,32,32);const texture=new CanvasTexture(c);texture.colorSpace=SRGB;
 let last=0,stamp='';g.lighting={loaded:0,invalidate(){last=-Infinity;stamp='';},tick(t){
  if(t-last>700){last=t;const sources=[],p=g.playing?g.player:g.spawn,keys=new Set([...g.world.versions.keys(),...(g.world.v4Special||[])]);for(const chunk of view.chunks.values())for(const s of chunk.userData.emitters||[])keys.add(`${s.x},${s.y},${s.z}`);
   for(const key of keys){const[x,y,z]=key.split(',').map(Number),b=g.world.get(x,y,z),def=EMITTERS.get(b);if(!def)continue;const distance=Math.hypot(x-p.x,y-p.y,z-p.z);if(distance>64)continue;sources.push({x,y,z,b,color:def[0],radius:def[1],distance});}
   sources.sort((a,b)=>a.distance-b.distance);sources.length=Math.min(sources.length,g.upgrade.settings.maxLights);this.loaded=sources.length;
   const previous=view.carbonTorches||[];view.carbonTorches=sources;const next=sources.map(s=>`${s.x},${s.y},${s.z},${s.b}`).sort().join('|');
   if(next!==stamp){stamp=next;for(const key of view.chunks.keys()){const[cx,cz]=key.split(',').map(Number),o=g.dimension==='overworld'?512:256;if([...sources,...previous].some(s=>Math.abs(s.x-(cx*16-o+8))<32&&Math.abs(s.z-(cz*16-o+8))<32))g.world.dirty.add(key);}}
   while(sprites.length<sources.length){const mesh=new Mesh(new PlaneGeometry(1,1),new BasicMaterial({map:texture,transparent:true,depthWrite:false,blending:2}));group.add(mesh);sprites.push(mesh);}
   sprites.forEach((mesh,i)=>{const s=sources[i];mesh.visible=!!s;if(s){mesh.position.set(s.x+.5,s.y+(s.b===18?.7:.6),s.z+.5);mesh.material.color.set(s.color);mesh.userData.flicker=[18,49,123].includes(s.b);mesh.scale.setScalar(s.b===18?.7:1.05);}});
  }
  for(const mesh of sprites)if(mesh.visible){mesh.quaternion.copy(view.camera.quaternion);mesh.material.opacity=mesh.userData.flicker?.7+Math.sin(t*.013+mesh.position.x)*.1:.65;}
 }};return g.lighting;
}
