import {skyExposed,findHostileSpawn,animalLure,mobDimensions,sheepGrazing,moveMob} from './mob-rules.js';
import {Group,Mesh,BoxGeometry,Material,BasicMaterial,Vector3,CanvasTexture,SRGB,Nearest} from './engine.js';
import {hash,ITEMS} from './core.js';
import {shape} from './extra-data.js';
import {clamp,angleDelta,damp} from './motion.js';
import {SKINNED,buildMob} from './mob-models.js';
const TYPES={cow:{hp:10,speed:.75,h:1.4,r:.45,loot:[['raw_beef',2],['leather',1]]},sheep:{hp:8,speed:.8,h:1.3,r:.45,loot:[['raw_mutton',2],['wool',1]]},chicken:{hp:4,speed:.8,h:.7,r:.2,loot:[['raw_chicken',1],['feather',2]]},pig:{hp:10,speed:.85,h:.9,r:.45,loot:[['raw_porkchop',2]]},zombie:{hp:20,speed:2.35,h:1.95,r:.3,hostile:true,burn:true,loot:[['rotten_flesh',1]]},skeleton:{hp:20,speed:2.5,h:1.95,r:.3,hostile:true,burn:true,loot:[['bone',1],['arrow',2]]},creeper:{hp:20,speed:2.15,h:1.7,r:.3,hostile:true,loot:[['gunpowder',1]]},spider:{hp:16,speed:2.1,h:.9,r:.7,hostile:true,loot:[['string',2]]}};
function skinTex(paint,w=16,h=16){const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.imageSmoothingEnabled=false;paint(g,w,h);const t=new CanvasTexture(c);t.colorSpace=SRGB;t.magFilter=t.minFilter=Nearest;t.needsUpdate=true;return t;}
function blot(g,base,seed,n=50){g.fillStyle=base;g.fillRect(0,0,g.canvas.width,g.canvas.height);for(let i=0;i<n;i++){g.fillStyle=i%2?'#00000024':'#ffffff18';g.fillRect(hash(i,seed,2)*g.canvas.width|0,hash(i,seed,3)*g.canvas.height|0,1+(i%3===0),1);}}
function zombieFace(g){blot(g,'#5B8F3C',4,36);g.fillStyle='#2f4a22';g.fillRect(0,0,16,3);g.fillStyle='#1f321a';g.fillRect(3,6,4,2);g.fillRect(9,6,4,2);g.fillStyle='#3e5f2a';g.fillRect(7,9,2,3);g.fillStyle='#2a1c14';g.fillRect(4,12,8,3);g.fillStyle='#6a3a32';g.fillRect(5,13,6,1);}
function skeletonFace(g){blot(g,'#E8DFC6',8,18);g.fillStyle='#141210';g.fillRect(2,4,5,5);g.fillRect(9,4,5,5);g.fillRect(7,9,2,3);g.fillRect(3,13,10,2);g.fillStyle='#E8DFC6';g.fillRect(6,13,1,2);g.fillRect(9,13,1,2);}
function creeperFace(g){blot(g,'#4F8A32',11,40);g.fillStyle='#101410';g.fillRect(2,4,4,4);g.fillRect(10,4,4,4);g.fillRect(6,8,4,2);g.fillRect(4,10,8,2);g.fillRect(4,10,2,6);g.fillRect(10,10,2,6);}
export class MobSystem{
 constructor(g){this.g=g;this.mobs=new Map;this.models=new Map;this.behaviors=new Map;this.arrows=new Map;this.lastState=0;this.lastSpawn=0;this.lastAnimals=0;this.lastHit=new Map;this.started=false;this.box=new BoxGeometry(1,1,1);this.lastHost=null;}
 get host(){let ids=[...(this.g.net?.members?.entries()||[])].filter(([id,p])=>p.version===3||id===this.g.net?.session?.id).map(([id])=>id);return ids.length?ids.sort()[0]:this.g.net?.session?.id;}
 get authority(){return !!this.g.net?.session&&this.host===this.g.net.session.id;}
 send(p){if(this.g.net?.connected)this.g.net.channel.send({type:'broadcast',event:'survival',payload:{...p,from:this.g.net.session.id,version:3}});}
 ground(x,z){for(let y=91;y>0;y--){let b=this.g.world.get(Math.floor(x),y,Math.floor(z));if(b&&![5,6,14,18,26,27,38,39].includes(b))return y+1;}return 1;}
 players(){const a=[];if(!this.g.dead)a.push({...this.g.player,id:this.g.net.session.id,held:this.g.upgrade?.a.selected()?.id||''});for(const [id,p]of this.g.positions)if(p.alive!==false)a.push({...p,id});return a;}
 seed(){if(this.started)return;this.started=true;const s=this.g.spawn;for(let i=0;i<18;i++){let a=hash(i,2,18)*Math.PI*2,d=7+hash(i,4,7)*38,x=clamp(s.x+Math.cos(a)*d,-504,504),z=clamp(s.z+Math.sin(a)*d,-504,504);this.add({id:'animal-'+i,kind:['cow','sheep','chicken','pig'][i%4],x,y:this.ground(x,z),z,hp:TYPES[['cow','sheep','chicken','pig'][i%4]].hp,yaw:a,phase:hash(i,1,4)*5});}}
 add(m){if(!m?.id||typeof m.id!=='string'||m.id.length>96||!TYPES[m.kind]||![m.x,m.y,m.z,m.hp,m.yaw].every(Number.isFinite)||Math.abs(m.x)>512||Math.abs(m.z)>512||m.y< -5||m.y>110)return;const old=this.mobs.get(m.id);if(old&&m.hp<old.hp)m.hurtUntil=performance.now()+240;this.mobs.set(m.id,m);if(!this.models.has(m.id))this.model(m);}
 model(m){if(SKINNED.has(m.kind)){const o=buildMob(m.kind,m);o.mats.forEach(x=>x.userData.shared=true);o.root.position.set(m.x,m.y,m.z);o.root.userData.sprite={kind:m.kind,h:TYPES[m.kind].h};this.g.view.scene.add(o.root);this.models.set(m.id,{...o,kind:m.kind,last:new Vector3(m.x,m.y,m.z)});return;}const root=new Group,head=new Group,mats=[],legs=[],arms=[];let mat=(color,pixels=false)=>{let a;if(pixels){a=new Material({map:skinTex(g=>blot(g,color,m.kind.length+(color.length||0),70))});}else a=new Material({color});a.userData.original=a.color.clone();mats.push(a);return a;};
 let pix=(paint)=>{const a=new Material({map:skinTex(paint)});a.userData.original=a.color.clone();mats.push(a);return a;};
 let part=(scale,pos,material,parent=root)=>{let mesh=new Mesh(this.box,material);mesh.scale.set(...scale);mesh.position.set(...pos);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;},limb=(x,y,z,sx,sy,sz,material,isArm=false)=>{let p=new Group;p.position.set(x,y,z);part([sx,sy,sz],[0,-sy/2,0],material,p);root.add(p);(isArm?arms:legs).push(p);return p;};
 const dark=mat('#202320'),skin=mat(m.kind==='zombie'?'#5B8F3C':m.kind==='skeleton'?'#E8DFC6':m.kind==='creeper'?'#4F8A32':m.kind==='cow'?'#71614d':m.kind==='sheep'?'#e4e0d6':m.kind==='pig'?'#e7a8a0':'#e6e2d3',true);
 if(['zombie','skeleton'].includes(m.kind)){const skeleton=m.kind==='skeleton',shirt=skeleton?pix(g=>blot(g,'#E8DFC6',9,22)):pix(g=>blot(g,'#2D8C8E',5,40)),pants=skeleton?shirt:pix(g=>blot(g,'#2C3C6E',6,36)),face=pix(skeleton?skeletonFace:zombieFace),back=skeleton?shirt:pix(g=>blot(g,'#4A7A32',4,30));part([.5,.75,.25],[0,1.125,0],shirt);head.position.y=1.5;part([.5,.5,.5],[0,.25,0],[back,back,back,skin,back,face],head);root.add(head);const legW=skeleton?.125:.25,armW=skeleton?.125:.25;limb(-.125,.75,0,legW,.75,skeleton?.125:.25,pants);limb(.125,.75,0,legW,.75,skeleton?.125:.25,pants);let l=limb(-.375,1.5,0,armW,.75,skeleton?.125:.25,skeleton?shirt:skin,true),r=limb(.375,1.5,0,armW,.75,skeleton?.125:.25,skeleton?shirt:skin,true);l.rotation.x=r.rotation.x=-1.55;if(skeleton){const wood=mat('#6a4a2c'),string=mat('#1a1814');part([.05,.62,.05],[0,-.42,-.28],wood,r);part([.02,.62,.02],[0,-.42,-.08],string,r);part([.09,.05,.05],[0,-.72,-.28],wood,r);part([.09,.05,.05],[0,-.12,-.28],wood,r);}}
 else if(m.kind==='creeper'){const green=pix(g=>blot(g,'#4F8A32',11,80)),face=pix(creeperFace),darker=pix(g=>blot(g,'#3A6B24',12,50));part([.5,.75,.25],[0,.75,0],green);head.position.y=1.125;part([.5,.5,.5],[0,.25,0],[darker,darker,green,green,darker,face],head);root.add(head);for(const x of[-.125,.125])for(const z of[-.125,.125])limb(x,.375,z,.25,.375,.25,green);}
 else if(m.kind==='spider'){const black=mat('#3f302b',true),red=mat('#b22224');part([.87,.43,.91],[0,.43,.2],black);part([.62,.46,.46],[0,.46,-.48],black);for(let x of[-.2,-.08,.08,.2])part([.06,.05,.024],[x,.55,-.72],red);for(let i=0;i<8;i++){let p=new Group;p.position.set(i%2?.3:-.3,.45,(Math.floor(i/2)-1.5)*.22);let leg=part([.88,.08,.09],[i%2?.43:-.43,0,0],black,p);p.rotation.z=i%2?-.32:.32;p.rotation.y=(Math.floor(i/2)-1.5)*.28;root.add(p);legs.push(p);}}
 else {
  const chicken=m.kind==='chicken',cow=m.kind==='cow',pig=m.kind==='pig',sheep=m.kind==='sheep';
  const pale=mat('#eee9df',true),snout=mat(pig?'#e6a09b':'#ad9581',true),hoof=mat('#62534b');
  if(chicken){
   part([.375,.5,.5],[0,.5,.04],pale);head.position.set(0,.75,-.22);part([.25,.375,.25],[0,.05,0],pale,head);
   for(const x of[-.128,.128])part([.012,.055,.055],[x,.1,-.055],dark,head);
   part([.25,.125,.125],[0,-.025,-.185],mat('#d9ad39'),head);part([.125,.125,.0625],[0,-.145,-.155],mat('#ad302b'),head);
   for(const x of[-.22,.22])part([.0625,.25,.375],[x,.54,.06],pale);
   for(const x of[-.095,.095]){const leg=limb(x,.25,0,.0625,.25,.0625,mat('#c09b48'));part([.125,.04,.18],[0,-.23,-.055],mat('#c09b48'),leg);}
  }else{
   const legHeight=pig?.375:sheep?.375:.5,bodyHeight=pig?.5:sheep?.625:.625,bodyY=legHeight+bodyHeight/2;
   const coat=sheep?pale:skin;part([sheep?.75:.625,bodyHeight,pig?1:1.125],[0,bodyY,0],coat);
   head.position.set(0,pig?.7:sheep?1.04:1.15,pig?-.6:-.62);part([pig?.5:.5,pig?.5:sheep?.5:.625,pig?.5:.5],[0,0,0],pig?skin:snout,head);
   for(const x of[-.155,.155]){part([.09,.09,.016],[x,.07,-.258],pale,head);part([.045,.07,.018],[x,.07,-.267],dark,head);}
   part([pig?.25:.34,pig?.1875:.18,.125],[0,-.12,-.3],snout,head);
   if(pig)for(const x of[-.065,.065])part([.045,.045,.012],[x,-.12,-.369],dark,head);
   if(cow){for(const x of[-.23,.23])part([.0625,.1875,.0625],[x,.38,.04],pale,head);for(let i=0;i<7;i++)part([.012,.17+hash(i,8)*.19,.2+hash(i,9)*.19],[i%2?.319:-.319,bodyY+(hash(i,11)-.5)*.3,(hash(i,12)-.5)*.8],pale);part([.3,.125,.35],[0,.49,.26],mat('#c99894'));}
   for(let i=0;i<4;i++){const leg=limb(i%2?.19:-.19,legHeight,i<2?-.36:.36,.1875,legHeight,.1875,pig?skin:snout);part([.19,.1,.19],[0,-legHeight+.05,0],pig?snout:hoof,leg);}
  }
  root.add(head);
 }

 root.position.set(m.x,m.y,m.z);root.userData.sprite={kind:m.kind,h:TYPES[m.kind].h};this.g.view.scene.add(root);this.models.set(m.id,{root,head,legs,arms,mats,kind:m.kind,last:new Vector3(m.x,m.y,m.z)});}
 receive(p){if(!p||p.version!==3||typeof p.from!=='string'||!this.g.net.members.has(p.from))return;
 if(p.kind==='mob-state'&&p.from===this.host&&!this.authority&&Array.isArray(p.mobs)){this.started=true;const keep=new Set;for(const m of p.mobs.slice(0,64)){this.add(m);keep.add(m.id);}for(const id of this.mobs.keys())if(!keep.has(id))this.remove(id);}
 if(p.kind==='mob-hit'&&this.authority)this.hit(p.from,p.target,p.tool);if(p.kind==='shear'&&this.authority)this.shear(p.from,p.target);
 if(p.kind==='player-hurt'&&p.from===this.host&&p.target===this.g.net.session.id)this.g.damage(clamp(Number(p.amount)||0,0,20),p.reason||'A hostile mob got you.');
 if(p.kind==='xp'&&p.from===this.host&&p.target===this.g.net.session.id){this.g.xp+=clamp(p.amount||0,0,10);this.g.upgrade?.a.save();}
 if(p.kind==='arrow-shot'&&this.authority&&p.shot&&p.shot.owner===p.from){const owner=this.players().find(x=>x.id===p.from),q=p.shot;if(owner&&[q.x,q.y,q.z,q.vx,q.vy,q.vz].every(Number.isFinite)&&Math.hypot(q.x-owner.x,q.y-owner.y-1.5,q.z-owner.z)<3&&Math.hypot(q.vx,q.vy,q.vz)<35)this.projectile({...q,damage:clamp(q.damage||1,1,12)});}
 if(p.kind==='arrow-spawn'&&p.from===this.host)this.projectile(p.shot,true);if(p.kind==='arrow-end'&&p.from===this.host)this.removeArrow(p.id);
 if(p.kind==='explosion'&&p.from===this.host)this.explosionEffect(p.x,p.y,p.z);}
 attack(id,tool){if(this.authority)this.hit(this.g.net.session.id,id,tool);else this.send({kind:'mob-hit',target:id,tool});}
 visible(from,to){let d=new Vector3(to.x-from.x,to.y-from.y,to.z-from.z),distance=d.length();if(distance<.1)return true;d.multiplyScalar(1/distance);const hit=this.g.world.ray(new Vector3(from.x,from.y,from.z),d,distance);return !hit||hit.t>distance-.25;}
 hit(player,id,tool){const m=this.mobs.get(id);if(!m)return;const now=performance.now();if(now-(this.lastHit.get(player)||0)<500)return;const p=this.players().find(p=>p.id===player);if(!p||Math.hypot(p.x-m.x,p.z-m.z)>3.6||Math.abs(p.y-m.y)>2.5||!this.visible({x:p.x,y:p.y+1.6,z:p.z},{x:m.x,y:m.y+.8,z:m.z}))return;this.lastHit.set(player,now);this.hurtMob(m,ITEMS[tool]?.damage||1,player,p);}
 hurtMob(m,amount,player,source){if(m.kind==='spider')m.aggro=12;m.hp-=amount;m.hurtUntil=performance.now()+240;m.panic=4;const d=Math.max(.1,Math.hypot(m.x-source.x,m.z-source.z)),nx=m.x+(m.x-source.x)/d*.38,nz=m.z+(m.z-source.z)/d*.38;if(!TYPES[m.kind].hostile)m.yaw=Math.atan2(-(m.x-source.x),-(m.z-source.z));const size=mobDimensions(m,TYPES[m.kind],this.g.clock.serverMs());if(!this.g.world.collide({x:nx,y:m.y,z:nz},size.height,size.radius)){m.x=nx;m.z=nz;}m.vy=2.4;if(m.hp<=0)this.kill(m,player);}
 kill(m,player){for(const[id,n]of TYPES[m.kind].loot){if(id==='wool'&&m.sheared)continue;this.g.drop(id,n,m.x,m.y+.6,m.z);}let xp=TYPES[m.kind].hostile?5:2;if(player===this.g.net.session.id){this.g.xp+=xp;this.g.upgrade?.a.save();}else if(player)this.send({kind:'xp',target:player,amount:xp});this.remove(m.id);this.lastState=0;}
 shear(player,id){const m=this.mobs.get(id),p=this.players().find(p=>p.id===player);if(!m||m.kind!=='sheep'||m.sheared||Number(m.babyUntil)>this.g.clock.serverMs()||!p||Math.hypot(m.x-p.x,m.z-p.z)>3.5||Math.abs(m.y-p.y)>2||!this.visible({x:p.x,y:p.y+1.5,z:p.z},{x:m.x,y:m.y+.8,z:m.z}))return;m.sheared=true;m.regrow=(m.phase||0)+16+hash(Math.floor(m.x),Math.floor(m.z),9)*20;this.g.drop('wool',2,m.x,m.y+.7,m.z);this.lastState=0;}
 requestShear(id){if(this.authority)this.shear(this.g.net.session.id,id);else this.send({kind:'shear',target:id});}
 remove(id){const o=this.models.get(id);if(o){this.g.view.scene.remove(o.root);o.mats.forEach(m=>{if(!m.userData.shared)m.map?.dispose();m.dispose();});this.models.delete(id);}this.behaviors.delete(id);this.mobs.delete(id);}
 projectile(p,remote=false){if(!p||typeof p.id!=='string'||this.arrows.has(p.id)||this.arrows.size>60||![p.x,p.y,p.z,p.vx,p.vy,p.vz].every(Number.isFinite))return;const root=new Group,mat=new Material({color:'#785931'}),tip=new Material({color:'#c0c2b7'}),shaft=new Mesh(this.box,mat),head=new Mesh(this.box,tip);shaft.scale.set(.035,.035,.6);head.scale.set(.075,.075,.11);head.position.z=-.34;root.add(shaft,head);root.position.set(p.x,p.y,p.z);this.g.view.scene.add(root);this.arrows.set(p.id,{...p,root,mat,tip,life:6});if(this.authority&&!remote)this.send({kind:'arrow-spawn',shot:p});}
 removeArrow(id){const a=this.arrows.get(id);if(!a)return;this.g.view.scene.remove(a.root);a.mat.dispose();a.tip.dispose();this.arrows.delete(id);}
 tickArrows(dt){for(const[id,a]of this.arrows){a.life-=dt;const old=new Vector3(a.x,a.y,a.z),delta=new Vector3(a.vx*dt,a.vy*dt,a.vz*dt),length=delta.length();let hit=length>0?this.g.world.ray(old,delta.clone().normalize(),length):null;a.x+=delta.x;a.y+=delta.y;a.z+=delta.z;a.vy-=9*dt;a.root.position.set(a.x,a.y,a.z);a.root.lookAt(a.x-a.vx,a.y-a.vy,a.z-a.vz);let stop=!!hit||a.life<=0||a.y<0;
 if(this.authority&&!stop){if(a.enemy){for(const p of this.players())if(Math.hypot(a.x-p.x,a.z-p.z)<.48&&a.y>p.y&&a.y<p.y+1.85){this.damagePlayer(p.id,a.damage||3,a.fireball?'A blaze fireball hit you.':'A skeleton arrow hit you.');stop=true;break;}}else{for(const m of this.mobs.values())if(Math.hypot(a.x-m.x,a.z-m.z)<.55&&a.y>m.y&&a.y<m.y+TYPES[m.kind].h){this.hurtMob(m,a.damage||4,a.owner,{x:old.x,z:old.z});stop=true;break;}}}
 if(stop){if(this.authority){this.send({kind:'arrow-end',id});if(!a.enemy&&hit&&a.life>0)this.g.drop('arrow',1,old.x,old.y,old.z);}this.removeArrow(id);}}}
 damagePlayer(id,amount,reason){if(id===this.g.net.session.id)this.g.damage(amount,reason);else this.send({kind:'player-hurt',target:id,amount,reason});}
 async explode(m){this.remove(m.id);const center={x:Math.floor(m.x),y:Math.floor(m.y+.7),z:Math.floor(m.z)},players=this.players();for(const p of players){const d=Math.hypot(p.x-m.x,p.y+.9-m.y,p.z-m.z);if(d<6.2&&this.visible({x:m.x,y:m.y+1,z:m.z},{x:p.x,y:p.y+1,z:p.z}))this.damagePlayer(p.id,Math.ceil((1-d/6.2)*22),'A creeper exploded.');}this.explosionEffect(m.x,m.y,m.z);this.send({kind:'explosion',x:m.x,y:m.y,z:m.z});const cells=[];for(let dx=-3;dx<=3;dx++)for(let dy=-3;dy<=3;dy++)for(let dz=-3;dz<=3;dz++){if(dx*dx+dy*dy+dz*dz>10)continue;let x=center.x+dx,y=center.y+dy,z=center.z+dz,b=this.g.world.get(x,y,z);if(b&&![13,14,17,22,33].includes(b))cells.push({x,y,z,b});}cells.sort((a,b)=>hash(a.x,a.z,a.y)-hash(b.x,b.z,b.y));await this.g.upgrade?.special('blast',{...center,event:m.id,cells:cells.slice(0,52)});}
 explosionEffect(x,y,z){for(let i=0;i<16;i++)this.g.view.particles(Math.floor(x+(Math.random()-.5)*3),Math.floor(y+Math.random()*2),Math.floor(z+(Math.random()-.5)*3),3);this.g.upgrade?.a.beep(38,.55,.11,'sawtooth');this.g.upgrade?.a.beep(90,.2,.06,'square');}
 simulate(dt,now,night){if(this.authority){this.seed();const players=this.players();if(players.length&&now-this.lastSpawn>6500&&[...this.mobs.values()].filter(m=>TYPES[m.kind].hostile).length<16){
 this.lastSpawn=now;const p=players[Math.floor(Math.random()*players.length)];
 const point=findHostileSpawn(this.g.world,p,players,{night,dimension:this.g.dimension,lit:this.g.nearTorch},this.ground.bind(this));
 if(point){const kind=this.g.expansion?.spawnKind?.(point.x,point.y,point.z)||'zombie';
 if(!this.g.world.collide({...point,y:point.y+.02},TYPES[kind].h,.4))this.add({id:'hostile-'+crypto.randomUUID(),kind,...point,hp:TYPES[kind].hp,yaw:Math.random()*Math.PI*2,phase:Math.random()*10});}}

 for(const m of [...this.mobs.values()]){const def=TYPES[m.kind];if(!players.some(p=>Math.hypot(p.x-m.x,p.z-m.z)<104)&&!m.id.startsWith("end-"))continue;if(this.g.expansion?.mobStep?.(m,dt,now))continue;m.phase=(m.phase||0)+dt;m.panic=Math.max(0,(m.panic||0)-dt);m.aggro=Math.max(0,(m.aggro||0)-dt);m.burning=false;let speed=0;const closest=players.reduce((p,q)=>!p||Math.hypot(q.x-m.x,q.z-m.z)<Math.hypot(p.x-m.x,p.z-m.z)?q:p,null);if(def.hostile&&closest&&(m.kind!=='spider'||night||m.aggro>0||!skyExposed(this.g.world,m.x,m.y,m.z))){const d=Math.hypot(closest.x-m.x,closest.z-m.z),aim={x:closest.x,y:closest.y+1.5,z:closest.z},eye={x:m.x,y:m.y+(m.kind==='spider'?.6:1.55),z:m.z},canSee=d<20&&this.visible(eye,aim);m.pitch=Math.atan2(closest.y+1.5-eye.y,Math.max(.1,d));if(d<34){m.yaw=Math.atan2(-(closest.x-m.x),-(closest.z-m.z));speed=d>1.35?def.speed:0;}
 if(m.kind==='creeper'){// Minecraft uses true 3D distance: a creeper below a cliff or above a roof must not ignite.
const d3=Math.hypot(closest.x-m.x,(closest.y+.9)-(m.y+.85),closest.z-m.z),step=Math.min(dt,.1);if(d3<3&&canSee)m.fuse=(m.fuse||0)+step;else if(d3>7||!canSee)m.fuse=Math.max(0,(m.fuse||0)-step*2);if(m.fuse>0)speed=def.speed*.55;if(m.fuse>1.5){this.explode(m);continue;}}
 else if(m.kind==='skeleton'){if(d<14&&canSee){speed=d<4.5?-1.2:d<8?0:def.speed*.45;if(m.phase-(m.attack||0)>2){m.attack=m.phase;let dir=new Vector3(aim.x-eye.x,aim.y-eye.y+d*.04,aim.z-eye.z).normalize();this.projectile({id:crypto.randomUUID(),owner:m.id,enemy:true,x:eye.x,y:eye.y,z:eye.z,vx:dir.x*21,vy:dir.y*21,vz:dir.z*21,damage:3});}}}
 else if(d<1.85&&Math.abs(closest.y-m.y)<1.7&&canSee&&m.phase-(m.attack||0)>1){m.attack=m.phase;this.damagePlayer(closest.id,m.kind==='spider'?2:3,m.kind==='spider'?'A spider bit you.':'A zombie got you.');}
 if(def.burn&&!night&&this.g.dimension==='overworld'&&this.g.paper?.weather==='clear'){
 const wet=this.g.world.get(Math.floor(m.x),Math.floor(m.y+.5),Math.floor(m.z))===14;
 m.burning=!wet&&skyExposed(this.g.world,m.x,m.y,m.z);if(m.burning){m.hp-=dt*2;if(m.hp<=0){this.kill(m,null);continue;}}}}

 else if(!def.hostile||m.kind==='spider'){
  let behavior=this.behaviors.get(m.id);if(!behavior){behavior={};this.behaviors.set(m.id,behavior);}
  if(m.phase>=(behavior.turnAt||0)){const seed=Math.floor(m.phase);behavior.turnAt=m.phase+3+hash(seed,Math.floor(m.x),Math.floor(m.z))*4;behavior.wanderYaw=m.yaw+(hash(Math.floor(m.z),seed,37)-.5)*1.8;behavior.walking=hash(seed,Math.floor(m.z),45)>.3;}
  m.pitch=0;if(m.panic)speed=3.3;else if(behavior.walking){m.yaw+=angleDelta(behavior.wanderYaw,m.yaw)*(1-Math.exp(-2*dt));speed=def.speed;}
  const lured=animalLure(m,players,this.visible.bind(this));
  if(lured&&!m.panic){const distance=Math.hypot(lured.x-m.x,lured.z-m.z);m.yaw+=angleDelta(Math.atan2(-(lured.x-m.x),-(lured.z-m.z)),m.yaw)*(1-Math.exp(-6*dt));m.pitch=clamp(Math.atan2(lured.y+1.2-(m.y+def.h*.8),Math.max(.1,distance)),-.35,.45);speed=distance>1.7?Math.max(1,def.speed):0;}
  if(m.kind==='sheep'){
   m.regrow??=m.phase+20+hash(Math.floor(m.x),Math.floor(m.z),71)*24;
   if(sheepGrazing(m,this.g.world)&&!lured)speed=0;
   if(m.phase>=m.regrow){const grass=this.g.world.get(Math.floor(m.x),Math.floor(m.y)-1,Math.floor(m.z))===1;if(grass&&!m.panic&&!lured)m.sheared=false;m.regrow=m.phase+(grass?28:8)+hash(Math.floor(m.x),Math.floor(m.z),Math.floor(m.phase))*24;}
  }
 }
 let behavior=this.behaviors.get(m.id);if(!behavior){behavior={};this.behaviors.set(m.id,behavior);}
 moveMob(this.g.world,m,def,speed,dt,{now:this.g.clock.serverMs(),state:behavior});if(m.y<0){m.y=this.ground(m.x,m.z);m.vy=0;}}
 if(now-this.lastState>95){this.lastState=now;this.send({kind:'mob-state',mobs:[...this.mobs.values()].map(({hurtUntil,...m})=>m)});}}
 }
 renderMobs(dt,now){
  this.tickArrows(dt);
  for(const [id,m]of this.mobs){
   const o=this.models.get(id);if(!o)continue;
   o.root.position.x=damp(o.root.position.x,m.x,22,dt);o.root.position.z=damp(o.root.position.z,m.z,22,dt);o.root.position.y=damp(o.root.position.y,m.y,24,dt);
   o.root.rotation.y+=angleDelta(m.yaw,o.root.rotation.y)*(1-Math.exp(-18*dt));
   if(this.authority||!this.g.frontier?.buffers?.has(id))this.animateModel(m,o,dt,now);
  }
 }
 animateModel(m,o,dt,now,snapshotSpeed){
  const traveled=Math.hypot(o.root.position.x-(o.last?.x??o.root.position.x),o.root.position.z-(o.last?.z??o.root.position.z));
  const speed=snapshotSpeed??Math.min(4,traveled/Math.max(.001,dt));
  // Phase advances by distance, so slow animals take slow steps and stopped
  // animals settle naturally. Network corrections never create giant strides.
  o.stride=(o.stride||0)+Math.min(.25,speed*dt)*9;
  o.walkAmount=damp(o.walkAmount||0,speed>.08?Math.min(.7,speed*.65):0,12,dt);
  const walk=Math.sin(o.stride)*o.walkAmount;o.walk=walk;o.last?.copy(o.root.position);
  const baby=Number(m.babyUntil)>this.g.clock.serverMs()?.5:1;
  const fuse=m.kind==='creeper'?(m.fuse||0):0,swell=fuse?1+fuse/1.5*.18+Math.sin(now*.05)*.025:1;
  o.root.scale.set(baby*swell,baby*(fuse?1-fuse/1.5*.08:1),baby*swell);
  o.head.scale.setScalar(baby<1?1.5:1);
  const grazing=sheepGrazing(m,this.g.world)&&Math.abs(m.pitch||0)<.01;
  o.head.rotation.x=damp(o.head.rotation.x,grazing?-.85+(Math.sin(now*.018)*.12):m.pitch||0,14,dt);
  const rest=o.head.userData.restPosition;if(rest){o.head.position.y=damp(o.head.position.y,rest.y-(grazing?.22:0),10,dt);o.head.position.z=damp(o.head.position.z,rest.z-(grazing?.12:0),10,dt);}
  for(const wool of o.wool||[])wool.visible=!m.sheared;
  for(let i=0;i<o.legs.length;i++){
   const leg=o.legs[i],spider=leg.userData.spider;
   if(spider){leg.rotation.x=0;leg.rotation.y=Math.sin(o.stride+spider.row*.8)*o.walkAmount*.28*spider.side;leg.rotation.z=Math.max(0,Math.cos(o.stride+spider.row*.8))*o.walkAmount*.2*spider.side;}
   else leg.rotation.x=damp(leg.rotation.x,walk*(i%2?1:-1)*(m.kind==='creeper'?.65:1),22,dt);
  }
  if(m.kind==='chicken')for(let i=0;i<(o.wings?.length||0);i++){const falling=(m.vy||0)<-.3,flap=falling?.35+Math.sin(now*.035)*.55:.08; o.wings[i].rotation.z=damp(o.wings[i].rotation.z,flap*(i?1:-1),18,dt);}
  if(o.arms?.length){
   const striking=(m.phase||0)-(m.attack||0)<.32;
   if(m.kind==='zombie'){const pose=striking?-2.15:-1.55;o.arms[0].rotation.x=damp(o.arms[0].rotation.x,pose+walk*.14,18,dt);o.arms[1].rotation.x=damp(o.arms[1].rotation.x,pose-walk*.14,18,dt);}
   else if(m.kind==='skeleton'){const draw=striking||((m.phase||0)-(m.attack||0)<.5);o.arms[0].rotation.x=damp(o.arms[0].rotation.x,draw?-1.05:-1.4,16,dt);o.arms[1].rotation.x=damp(o.arms[1].rotation.x,draw?-1.2:-1.45,16,dt);o.arms[0].rotation.z=damp(o.arms[0].rotation.z,draw?.18:.06,16,dt);o.arms[1].rotation.z=damp(o.arms[1].rotation.z,draw?-.18:-.06,16,dt);}
  }
  if(m.kind==='creeper'&&fuse>0&&(!o.lastHiss||now-o.lastHiss>Math.max(70,220-fuse*90))){o.lastHiss=now;this.g.upgrade?.a.beep(160+fuse*280,.09,.018+fuse*.02,'sawtooth');}
  for(const mat of o.mats){mat.color.copy(mat.userData.original);if(m.hurtUntil>now)mat.color.lerp(new (mat.color.constructor)('#ef4840'),.6);else if(m.burning)mat.color.lerp(new (mat.color.constructor)('#ff9527'),.35);else if(fuse&&Math.sin(now*.001*(8+fuse*18)*Math.PI*2)>.05)mat.color.lerp(new (mat.color.constructor)('#ffffff'),.55+fuse*.25);}
 }
 target(camera,blockDistance=4){const dir=this.g.direction;let best=null,distance=Math.min(3.4,blockDistance);for(const m of this.mobs.values()){let center=m.y+TYPES[m.kind].h*.55,dx=m.x-camera.position.x,dy=center-camera.position.y,dz=m.z-camera.position.z,along=dx*dir.x+dy*dir.y+dz*dir.z;if(along<0||along>distance)continue;const radius=m.kind==='chicken'?.3:.62;if(dx*dx+dy*dy+dz*dz-along*along<radius*radius){best=m;distance=along;}}return best;}
}

export {TYPES};
