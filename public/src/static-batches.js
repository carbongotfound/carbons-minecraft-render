import {B} from './expansion-data.js';
import {Mesh,Group,makeGeometry} from './engine.js';

// Decorative blocks are static between edits/crop stages. Merge by chunk and
// material so a field of grass or crops does not submit thousands of draws.
export class StaticBatches {
 constructor(scene){this.scene=scene;this.chunks=new Map;this.sourceMeshes=0;this.draws=0;this.sources=new WeakMap;}
 sync(objects,include=()=>true){
  const chunks=new Map;this.sourceMeshes=0;
  for(const object of objects.values()){
   if(!include(object))continue;
   const root=object.group,key=Math.floor(root.position.x/16)+','+Math.floor(root.position.z/16);
   const entries=chunks.get(key)||[];if(!chunks.has(key))chunks.set(key,entries);
   let meshes=this.sources.get(root);if(!meshes){meshes=[];root.updateMatrixWorld(true);root.traverse(mesh=>{if(mesh.isMesh&&mesh.visible&&!Array.isArray(mesh.material))meshes.push(mesh);});this.sources.set(root,meshes);}
   entries.push(...meshes);this.sourceMeshes+=meshes.length;
   root.parent?.remove(root);
  }
  for(const [key,old]of this.chunks)if(!chunks.has(key)){this.dispose(old);this.chunks.delete(key);}
  for(const [key,entries]of chunks){
   const stamp=entries.map(m=>m.uuid+':'+m.material.uuid).join('|');
   if(this.chunks.get(key)?.stamp===stamp)continue;
   const old=this.chunks.get(key);if(old)this.dispose(old);
   const materials=new Map,group=new Group;
   for(const mesh of entries){
    let out=materials.get(mesh.material);if(!out){out={p:[],n:[],uv:[],col:[],idx:[]};materials.set(mesh.material,out);}
    const geo=mesh.geometry,position=geo.attributes.position,normal=geo.attributes.normal,uv=geo.attributes.uv,index=geo.index,offset=out.p.length/3;
    const matrix=mesh.matrixWorld.elements;
    // Box normals are axis aligned locally; transforming and normalizing each
    // column handles the nonuniform scales used by these decorative models.
    for(let i=0;i<position.count;i++){
     const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
     out.p.push(matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12],matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13],matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14]);
     const nx=normal.getX(i),ny=normal.getY(i),nz=normal.getZ(i),a=matrix[0]*nx+matrix[4]*ny+matrix[8]*nz,b=matrix[1]*nx+matrix[5]*ny+matrix[9]*nz,c=matrix[2]*nx+matrix[6]*ny+matrix[10]*nz,len=Math.hypot(a,b,c)||1;
     out.n.push(a/len,b/len,c/len);out.uv.push(uv?.getX(i)||0,uv?.getY(i)||0);out.col.push(1,1,1);
    }
    if(index)for(let i=0;i<index.count;i++)out.idx.push(offset+index.getX(i));else for(let i=0;i<position.count;i++)out.idx.push(offset+i);
   }
   for(const [material,data]of materials){const mesh=new Mesh(makeGeometry(data),material);mesh.castShadow=true;mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;group.add(mesh);}
   group.matrixAutoUpdate=false;this.scene.add(group);this.chunks.set(key,{group,stamp});
  }
  this.draws=[...this.chunks.values()].reduce((n,c)=>n+c.group.children.length,0);
 }
 dispose(entry){for(const mesh of entry.group.children)mesh.geometry.dispose();entry.group.parent?.remove(entry.group);}
 clear(){for(const entry of this.chunks.values())this.dispose(entry);this.chunks.clear();this.draws=0;}
}
export function installStaticBatches(game){
 if(game.view.software)return;
 const base=new StaticBatches(game.view.scene),extra=new StaticBatches(game.view.scene),u=game.upgrade,d=game.expansion.decoration;
 const sync=u.syncObjects.bind(u);u.syncObjects=()=>{sync();base.sync(u.objects);};
 const update=d.update.bind(d);let stamp=-1;d.update=t=>{update(t);if(stamp!==d.last){stamp=d.last;extra.sync(d.objects,o=>![B.PORTAL,B.PORTAL_Z,B.BREWING_STAND,B.CAMPFIRE,B.WIRE,B.REPEATER].includes(o.id));}};
 const clear=d.clear.bind(d);d.clear=()=>{clear();base.clear();extra.clear();stamp=-1;};
 game.staticBatches={base,extra};
}
