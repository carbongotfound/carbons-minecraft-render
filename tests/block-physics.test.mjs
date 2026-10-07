import test from 'node:test';
import assert from 'node:assert/strict';
import {collideWorld,raycastWorld} from '../public/src/block-physics.js';
const cube=[0,0,0,1,1,1];
const shape=id=>id===84?[.375,0,.375,.625,1,.625]:id?cube:null;
const world=(blocks,meta=new Map)=>({get:(x,y,z)=>blocks.get(`${x},${y},${z}`)||0,metadata:meta});

test('stairs collide with their two steps, leaving the upper empty half usable',()=>{
  const w=world(new Map([['0,0,0',82]]));
  assert.equal(collideWorld(w,{x:.5,y:.51,z:.85},.3,.1,shape),false);
  assert.equal(collideWorld(w,{x:.5,y:.51,z:.15},.3,.1,shape),true);
  assert.equal(collideWorld(w,{x:.5,y:.01,z:.85},.3,.1,shape),true);
});
test('picking passes through a stair gap and reaches the block behind',()=>{
  const w=world(new Map([['0,0,0',82],['-1,0,0',3]]));
  const hit=raycastWorld(w,{x:2,y:.75,z:.8},{x:-1,y:0,z:0},4,shape);
  assert.equal(hit.b,3);assert.equal(hit.x,-1);assert.deepEqual(hit.n,[1,0,0]);
});
test('a fence collision reaches into the cell above and connections block passage',()=>{
  const w=world(new Map([['0,0,0',84],['1,0,0',84]]));
  assert.equal(collideWorld(w,{x:.5,y:1.1,z:.5},.2,.1,shape),true);
  assert.equal(collideWorld(w,{x:.85,y:.1,z:.5},.5,.1,shape),true);
  assert.equal(collideWorld(w,{x:.85,y:.1,z:.15},.5,.1,shape),false);
});
