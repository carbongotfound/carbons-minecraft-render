import test from 'node:test';
import assert from 'node:assert/strict';
import {horizontalMotion,verticalMotion,PLAYER_MOTION} from '../public/src/player-motion.js';

test('walking covers the same distance at 20, 60 and 144 updates/second',()=>{
  const simulate=hz=>{const state={x:0,z:0};let z=0;for(let i=0;i<hz*2;i++)z+=horizontalMotion(state,{forward:1,grounded:true},1/hz).z;return z;};
  assert.ok(Math.abs(simulate(20)-simulate(60))<1e-9);
  assert.ok(Math.abs(simulate(60)-simulate(144))<1e-9);
  assert.ok(Math.abs(simulate(60))>8);
});
test('diagonal input cannot outrun walking and releasing input slows movement',()=>{
  const state={x:0,z:0};for(let i=0;i<120;i++)horizontalMotion(state,{forward:1,side:1,grounded:true},1/60);
  assert.ok(Math.hypot(state.x,state.z)<=PLAYER_MOTION.walk+1e-9);
  for(let i=0;i<30;i++)horizontalMotion(state,{grounded:true},1/60);
  assert.ok(Math.hypot(state.x,state.z)<.001);
});
test('menus and lost pointer lock stop momentum immediately',()=>{
  const state={x:4,z:-3};assert.deepEqual(horizontalMotion(state,{active:false},.05),{x:0,z:0});assert.deepEqual(state,{x:0,z:0});
});

test('a jump clears a full block even at 20 updates/second',()=>{
  const jump=hz=>{let v=PLAYER_MOTION.jump,y=0,peak=0;for(let i=0;i<hz;i++){const step=verticalMotion(v,1/hz);v=step.velocity;y+=step.distance;peak=Math.max(peak,y);}return peak;};
  for(const hz of [20,30,60,144])assert.ok(jump(hz)>1.08&&jump(hz)<1.12,`${hz} Hz jump: ${jump(hz)}`);
  assert.ok(Math.abs(jump(20)-jump(144))<.01);
});
