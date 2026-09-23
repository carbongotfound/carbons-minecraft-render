import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const port=10005;await mkdir('artifacts',{recursive:true});
const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port)},stdio:'pipe',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/healthz`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});const context=await browser.newContext({viewport:{width:1440,height:900}});await context.route(/supabase\.(co|in)/,r=>r.abort());const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.error(m.text());});
 await page.goto(`http://127.0.0.1:${port}/?test`);await page.waitForFunction(()=>!!window.__survival,null,{timeout:120000});
 const result=await page.evaluate(()=>{
  const g=__survival.game,u=g.upgrade,v=g.view;u.syncObjects();
  const batches=g.staticBatches.base,renderer=v.renderer,camera=v.camera,draw=g.graphics.post.render;
  u.finalPose=()=>{};camera.position.set(g.spawn.x+15,g.spawn.y+8,g.spawn.z+15);camera.lookAt(g.spawn.x,g.spawn.y,g.spawn.z);camera.updateMatrixWorld(true);renderer.info.autoReset=false;
  const diagnostic={spawn:g.spawn,camera:camera.position.toArray(),near:camera.near,far:camera.far,sceneVisible:v.scene.visible,children:v.scene.children.length,contextLost:renderer.getContext().isContextLost()};
  const roots=[...u.objects.values()].map(o=>o.group),merged=[...batches.chunks.values()].map(b=>b.group);
  for(const group of merged)v.scene.remove(group);for(const root of roots)v.scene.add(root);
  renderer.info.reset();draw(v.scene,camera);const before={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
  for(const root of roots)v.scene.remove(root);for(const group of merged)v.scene.add(group);
  renderer.info.reset();draw(v.scene,camera);const after={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
  let sourceTriangles=0,batchTriangles=0;for(const root of roots)root.traverse(m=>{if(m.isMesh)sourceTriangles+=(m.geometry.index?.count||m.geometry.attributes.position.count)/3;});for(const group of merged)group.traverse(m=>{if(m.isMesh)batchTriangles+=(m.geometry.index?.count||m.geometry.attributes.position.count)/3;});
  const first=batches.chunks.values().next().value?.group;u.syncObjects();const reused=[...batches.chunks.values()].some(c=>c.group===first);
  return {diagnostic,before,after,sourceTriangles,batchTriangles,sourceMeshes:batches.sourceMeshes,batchDraws:batches.draws,reused,stream:g.frontier.stream.stats()};
 });
 assert.ok(result.before.calls>result.after.calls*5,JSON.stringify(result));assert.equal(result.sourceTriangles,result.batchTriangles);assert.equal(result.reused,true);assert.equal(result.stream.captureSlices,0);assert.equal(result.stream.error,null);
 // Look at the actual mob models from the front, including their face materials.
 await page.evaluate(async()=>{
  const {Scene,Mesh,BoxGeometry,Material}=await import('/src/engine.js');const a=__survival,g=a.game,v=g.view,scene=new Scene;scene.background=v.scene.background.clone();
  for(const light of v.scene.children.filter(o=>o.isLight))scene.add(light.clone());
  const camera=v.camera.clone();camera.position.set(0,3.4,-11);camera.lookAt(0,.75,0);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  const kinds=['cow','sheep','pig','chicken','zombie','skeleton','creeper'];
  for(let i=0;i<kinds.length;i++){const kind=kinds[i],id='model-check-'+kind;a.mobs.model({id,kind,x:(i-3)*1.65,y:0,z:0,hp:20,yaw:0});scene.add(a.mobs.models.get(id).root);}
  const floor=new Mesh(new BoxGeometry(16,.25,5),new Material({color:'#789255'}));floor.position.set(0,-.125,0);scene.add(floor);
  v.update=()=>{g.graphics.post.render(scene,camera);};g.upgrade.finalPose=()=>{};
  document.getElementById('title').hidden=true;document.getElementById('hud').hidden=true;
 });
 await page.waitForTimeout(300);await page.screenshot({path:'artifacts/mob-models-094.png'});
 await writeFile('artifacts/performance-comparison.json',JSON.stringify(result,null,2));assert.deepEqual(errors,[]);console.log('PASS: same decorative geometry, fewer draw calls, unchanged batches reused, dense chunks copied without sliced sampling.');console.log(JSON.stringify(result));
}finally{await browser?.close();server.kill();}
