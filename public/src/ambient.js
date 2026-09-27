import {Mesh,Vector3,ShaderMaterial,makeGeometry} from './engine.js';
import {buildMob} from './mob-models.js';
import {cubeMesh} from './item-models.js';

// Local ambience: bats in dark caves, fish in water, torch flames and smoke, textured block
// particles and mob calls. Nothing here is networked or saved; it only decorates what each
// player sees, and every piece has a hard cap so it never grows with the world.
const MAX_EMITTERS = 24, PER_EMITTER = 7, NOOP = {dispose() {}};
const FLAMES = new Set([18, 61, 123]);
const SOLID = b => b && b !== 14 && b !== 18 && b !== 26 && b !== 27 && b !== 38 && b !== 39;
const PARTICLE_VERTEX = `uniform vec4 uEm[${MAX_EMITTERS}];uniform float uTime,uCount;varying float vLife,vType;varying vec2 vQ;
void main(){int i=int(position.x);if(float(i)>=uCount){gl_Position=vec4(2.,2.,2.,1.);return;}vec4 e=uEm[i];float camp=step(1.5,e.w);
 float life=fract(uTime*mix(.55,.3,camp)+position.y);vec3 base=e.xyz+vec3(.5,mix(.72,.35,camp),.5);
 vec3 p=base+vec3(sin(position.y*40.+uTime*1.3)*.07*life,life*mix(.85,2.4,camp),cos(position.y*31.+uTime)*.07*life);
 float size=mix(.035,.11,life)*mix(1.,2.4,camp);vec4 mv=viewMatrix*vec4(p,1.);mv.xy+=normal.xy*size;gl_Position=projectionMatrix*mv;vLife=life;vType=camp;vQ=normal.xy;}`;
const PARTICLE_FRAGMENT = `varying float vLife,vType;varying vec2 vQ;void main(){float r=length(vQ);if(r>1.)discard;float flame=1.-smoothstep(.08,.2,vLife);
 vec3 c=mix(vec3(.32,.31,.3),vec3(1.,.72,.25),flame);float a=mix((1.-vLife)*.38,.95,flame)*(1.-r*r);gl_FragColor=vec4(c,a);
 #include <colorspace_fragment>
}`;

export function installAmbient(g) {
  if (g.view.software) return null;
  return g.ambient = new Ambient(g);
}
class Ambient {
  constructor(g) {
    this.g = g; this.v = g.view; this.creatures = []; this.nextSpawn = 0; this.nextCall = 0; this.nextEmitters = 0;
    this.makeParticles(); this.texturedBits();
    const update = this.v.update.bind(this.v);
    this.v.update = (dt, t) => { try { this.tick(Math.min(dt, .1), t); } catch (e) { if (!this.warned) { this.warned = true; console.warn('Ambient effects paused:', e); } } update(dt, t); };
  }
  // Block breaking shows little textured cubes of the block, like Minecraft's fragments.
  texturedBits() {
    const v = this.v;
    v.particles = (x, y, z, b, count = 8) => {
      if (!b) return;
      for (let i = 0; i < count && v.bits.length < 160; i++) {
        const m = cubeMesh(b, v); m.castShadow = false; m.scale.setScalar(.06 + Math.random() * .06);
        m.position.set(x + .2 + Math.random() * .6, y + .2 + Math.random() * .6, z + .2 + Math.random() * .6); v.scene.add(m);
        v.bits.push({m, life: .35 + Math.random() * .35, v: new Vector3((Math.random() - .5) * 3, Math.random() * 3.2, (Math.random() - .5) * 3), mat: NOOP});
      }
    };
  }
  makeParticles() {
    const d = {p: [], n: [], uv: [], col: [], idx: []};
    for (let e = 0; e < MAX_EMITTERS; e++) for (let k = 0; k < PER_EMITTER; k++) {
      const seed = (k + Math.random() * .6) / PER_EMITTER, o = d.p.length / 3;
      for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { d.p.push(e, seed, 0); d.n.push(cx, cy, 0); d.uv.push(0, 0); d.col.push(1, 1, 1); }
      d.idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3);
    }
    // A flat Float32Array uploads directly as vec4[] (Vector4 is not exported by the engine bundle).
    this.emitters = new Float32Array(MAX_EMITTERS * 4);
    this.particleUniforms = {uEm: {value: this.emitters}, uTime: {value: 0}, uCount: {value: 0}};
    const material = new ShaderMaterial({uniforms: this.particleUniforms, vertexShader: PARTICLE_VERTEX, fragmentShader: PARTICLE_FRAGMENT, transparent: true, depthWrite: false});
    this.smoke = new Mesh(makeGeometry(d), material); this.smoke.frustumCulled = false; this.smoke.renderOrder = 4; this.v.scene.add(this.smoke);
  }
  updateEmitters(t) {
    if (t < this.nextEmitters) return; this.nextEmitters = t + 500;
    const cam = this.v.camera.position, list = (this.v.carbonTorches || []).filter(s => FLAMES.has(s.b) && Math.abs(s.x - cam.x) < 40 && Math.abs(s.z - cam.z) < 40).slice(0, MAX_EMITTERS);
    list.forEach((s, i) => this.emitters.set([s.x, s.y, s.z, s.b === 123 ? 2 : 1], i * 4));
    this.particleUniforms.uCount.value = list.length;
  }
  heightAbove(x, y, z) { let n = 0; for (let yy = Math.floor(y) + 1; yy < 96 && n < 4; yy++) if (SOLID(this.g.world.get(Math.floor(x), yy, Math.floor(z)))) n++; return n; }
  spawnCreatures(t) {
    if (t < this.nextSpawn) return; this.nextSpawn = t + 1200;
    const g = this.g, p = g.player, w = g.world, fancy = g.realism?.level !== 'fast';
    if (!g.playing || (g.dimension && g.dimension !== 'overworld')) return;
    const bats = this.creatures.filter(c => c.kind === 'bat').length, fish = this.creatures.length - bats;
    const underground = this.heightAbove(p.x, p.y + 1.6, p.z) >= 4 && p.y < 60;
    if (underground && bats < (fancy ? 4 : 2)) for (let i = 0; i < 8; i++) {
      const x = Math.floor(p.x + (Math.random() - .5) * 18), y = Math.floor(p.y + 1 + Math.random() * 5), z = Math.floor(p.z + (Math.random() - .5) * 18);
      if (!w.get(x, y, z) && !w.get(x, y + 1, z) && this.heightAbove(x, y, z) >= 4) { this.add('bat', x + .5, y + .3, z + .5); break; }
    }
    if (fish < (fancy ? 6 : 3)) for (let i = 0; i < 8; i++) {
      const x = Math.floor(p.x + (Math.random() - .5) * 24), z = Math.floor(p.z + (Math.random() - .5) * 24);
      for (let y = 23; y > 12; y--) if (w.get(x, y, z) === 14 && w.get(x, y - 1, z) === 14) { this.add(Math.random() < .3 ? 'salmon' : 'cod', x + .5, y - .7, z + .5); i = 8; break; }
    }
  }
  add(kind, x, y, z) {
    const o = buildMob(kind); o.root.position.set(x, y, z); if (kind !== 'bat') o.root.scale.setScalar(.9 + Math.random() * .3);
    this.v.scene.add(o.root); this.creatures.push({...o, kind, vel: new Vector3, turn: 0, life: 0});
  }
  moveCreatures(dt, t) {
    const w = this.g.world, p = this.g.player;
    for (let i = this.creatures.length - 1; i >= 0; i--) {
      const c = this.creatures[i], pos = c.root.position; c.life += dt; c.turn -= dt;
      if (pos.distanceTo(p) > 28 || c.life > 180) { this.v.scene.remove(c.root); c.mats.forEach(m => m.dispose()); this.creatures.splice(i, 1); continue; }
      const bat = c.kind === 'bat', inside = (x, y, z) => bat ? !SOLID(w.get(Math.floor(x), Math.floor(y), Math.floor(z))) : w.get(Math.floor(x), Math.floor(y), Math.floor(z)) === 14;
      if (c.turn <= 0) { c.turn = bat ? .4 + Math.random() * .9 : 1.5 + Math.random() * 3; const a = Math.random() * Math.PI * 2, s = bat ? 3.2 : .9 + Math.random() * .6; c.vel.set(Math.cos(a) * s, bat ? (Math.random() - .45) * 2.2 : (Math.random() - .5) * .3, Math.sin(a) * s); }
      const nx = pos.x + c.vel.x * dt, ny = pos.y + c.vel.y * dt, nz = pos.z + c.vel.z * dt;
      if (inside(nx, ny + .2, nz) && (!bat || inside(nx, ny + .5, nz))) pos.set(nx, ny, nz); else { c.vel.multiplyScalar(-1); c.turn = .3; }
      c.root.rotation.y = Math.atan2(-c.vel.x, -c.vel.z);
      if (bat) { const flap = Math.sin(t * .035 + i) * .9; c.arms[0].rotation.z = flap; c.arms[1].rotation.z = -flap; c.root.position.y += Math.sin(t * .01 + i) * .004; if (Math.random() < dt * .08) this.g.sfx?.mob?.('bat', false, .4); }
      else c.legs[0].rotation.y = Math.sin(t * .012 + i) * .5;
    }
  }
  mobCalls(t) {
    if (t < this.nextCall) return; this.nextCall = t + 900 + Math.random() * 1500;
    const mobs = this.g.upgrade?.a?.mobs?.mobs, p = this.g.player; if (!mobs?.size || !this.g.sfx?.mob) return;
    const near = [...mobs.values()].filter(m => Math.hypot(m.x - p.x, m.y - p.y, m.z - p.z) < 16);
    if (!near.length || Math.random() < .45) return;
    const m = near[Math.floor(Math.random() * near.length)], d = Math.hypot(m.x - p.x, m.y - p.y, m.z - p.z);
    this.g.sfx.mob(m.kind, false, Math.max(.15, 1 - d / 16));
  }
  tick(dt, t) {
    this.particleUniforms.uTime.value = t / 1000; this.updateEmitters(t);
    this.smoke.visible = this.particleUniforms.uCount.value > 0;
    this.spawnCreatures(t); this.moveCreatures(dt, t); this.mobCalls(t);
  }
}
