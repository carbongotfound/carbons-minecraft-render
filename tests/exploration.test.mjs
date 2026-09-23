import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/src/building-data.js';
import {canSpawnHostile, findHostileSpawn, animalLure, canBreed} from '../public/src/mob-rules.js';
import {biomeDecoration, naturalCell, frontierSites} from '../public/src/frontier-gen.js';
import {discover, restoreExploration} from '../public/src/exploration.js';

const player = {x:0,y:20,z:0}, point = {x:30.5,y:20,z:.5};
const world = (roof = false, floor = 3, blocked = false) => ({get: (x,y,z) => y === 19 ? floor : roof && y === 24 ? 3 : 0, collide: () => blocked});
test('hostiles spawn in dark caves at noon, but not under open daylight', () => {
  assert.equal(canSpawnHostile(world(), point, [player], {night:false}), false);
  assert.equal(canSpawnHostile(world(true), point, [player], {night:false}), true);
  assert.equal(canSpawnHostile(world(), point, [player], {night:true}), true);
});
test('spawn checks enforce player distance, lighting, support and body clearance', () => {
  assert.equal(canSpawnHostile(world(), {...point,x:12}, [player], {night:true}), false);
  assert.equal(canSpawnHostile(world(), point, [player,{...point}], {night:true}), false);
  assert.equal(canSpawnHostile(world(), point, [player], {night:true,lit:()=>true}), false);
  for(const floor of [0,14,6,80,49])assert.equal(canSpawnHostile(world(false,floor),point,[player],{night:true}),false);
  assert.equal(canSpawnHostile(world(false,3,true),point,[player],{night:true}),false);
});
test('spawn search finds underground floor levels and respects illuminated caves', () => {
  const found=findHostileSpawn(world(true),player,[player],{night:false},()=>40,()=>.5);
  assert.ok(found); assert.equal(found.y,20);
  assert.equal(findHostileSpawn(world(true),player,[player],{night:false,lit:()=>true},()=>40,()=>.5),null);
});
test('animals can follow another player holding the right food, with line of sight', () => {
  const mob={kind:'cow',x:0,y:20,z:0};
  const players=[{id:'local',x:1,y:20,z:0,held:'stone'},{id:'remote',x:4,y:20,z:0,held:'wheat'}];
  assert.equal(animalLure(mob,players,()=>true).id,'remote');
  assert.equal(animalLure(mob,players,()=>false),null);
  assert.equal(animalLure({...mob,kind:'pig'},players,()=>true),null);
});
test('ordinary adult animals can breed without preexisting cooldown fields', () => {
  assert.equal(canBreed({kind:'cow'},1000),true);
  assert.equal(canBreed({kind:'cow',babyUntil:2000},1000),false);
  assert.equal(canBreed({kind:'cow',breedCooldown:2000},1000),false);
  assert.equal(canBreed({kind:'cow',breedCooldown:1000},1000),true);
  assert.equal(canBreed({kind:'zombie'},1000),false);
});
test('biome decorations provide desert cactus, forest flowers and swamp mushrooms', () => {
  for(const [biome,expected]of [['desert',112],['forest',126],['swamp',128]]) {
    let found=0;for(let x=150;x<200;x++)for(let z=150;z<200;z++)if(biomeDecoration(x,41,z,{h:40,biome})===expected)found++;
    assert.ok(found>0,biome);
    assert.equal(biomeDecoration(0,41,0,{h:40,biome}),0);
    assert.equal(biomeDecoration(180,40,180,{h:40,biome}),0);
  }
});
test('procedural terrain remains deterministic across interleaved world seeds', () => {
  const samples=[];for(let x=200;x<210;x++)for(let y=15;y<60;y+=4)samples.push([x,y,200]);
  const before=samples.map(p=>naturalCell(...p,123));
  for(const p of samples)naturalCell(...p,321);
  assert.deepEqual(samples.map(p=>naturalCell(...p,123)),before);
});
test('exploration records actual cave visits once and survives save reload', () => {
  const state=restoreExploration(),site=frontierSites()[0];
  discover(state,{x:site.x,y:site.surface+1,z:site.z},'overworld'); assert.equal(state.sites[site.id],undefined);
  assert.ok(discover(state,site,'overworld').includes(site.title));
  assert.deepEqual(discover(state,site,'overworld'),[]);
  assert.deepEqual(restoreExploration(JSON.parse(JSON.stringify(state))),state);
  assert.deepEqual(discover(state,frontierSites()[1],'nether'),[]);
  assert.deepEqual(restoreExploration({sites:{fake:true},biomes:{fake:true}}),{sites:{},biomes:{}});
});
