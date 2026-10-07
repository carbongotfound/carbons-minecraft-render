import test from 'node:test';
import assert from 'node:assert/strict';
import {stepDroppedItem} from '../public/src/drop-physics.js';
const shape=id=>id?[0,0,0,1,1,1]:null;
const drop=(x,z)=>({x,z,y:2,vx:0,vy:0,vz:0});
const simulate=(w,d)=>{for(let i=0;i<120;i++)stepDroppedItem(w,d,1/60,shape);return d;};
test('drops settle on the lower and upper surfaces of a stair',()=>{
  const w={get:(x,y,z)=>x===0&&y===0&&z===0?82:0};
  assert.ok(Math.abs(simulate(w,drop(.5,.8)).y-.62)<1e-9);
  assert.ok(Math.abs(simulate(w,drop(.5,.2)).y-1.12)<1e-9);
});
test('drops pass through pane gaps and settle on the floor below',()=>{
  const w={get:(x,y,z)=>y===-1?3:x===0&&y===0&&z===0?124:0};
  assert.ok(Math.abs(simulate(w,drop(.2,.2)).y-.12)<1e-9);
});
