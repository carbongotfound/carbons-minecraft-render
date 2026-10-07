import test from 'node:test';
import assert from 'node:assert/strict';
import {blockBoxes, collisionBoxes, surfaceQuads, faceUV, chunkShapeMetadata} from '../public/src/block-geometry.js';

const faces = [
  {n:[1,0,0],v:[[1,0,1],[1,0,0],[1,1,1],[1,1,0]]}, {n:[-1,0,0],v:[[0,0,0],[0,0,1],[0,1,0],[0,1,1]]},
  {n:[0,1,0],v:[[0,1,1],[1,1,1],[0,1,0],[1,1,0]]}, {n:[0,-1,0],v:[[0,0,0],[1,0,0],[0,0,1],[1,0,1]]},
  {n:[0,0,1],v:[[0,0,1],[1,0,1],[0,1,1],[1,1,1]]}, {n:[0,0,-1],v:[[1,0,0],[0,0,0],[1,1,0],[0,1,0]]},
];
const contains = (boxes, x, y, z) => boxes.some(b => x >= b[0] && y >= b[1] && z >= b[2] && x < b[3] && y < b[4] && z < b[5]);

test('stairs have a walkable half step and saved direction rotates the upper step', () => {
  for (const [dir, upper, open] of [[0, [.5,.75,.25], [.5,.75,.75]], [1, [.75,.75,.5], [.25,.75,.5]], [2, [.5,.75,.75], [.5,.75,.25]], [3, [.25,.75,.5], [.75,.75,.5]]]) {
    const boxes = blockBoxes(83, {meta:{dir}});
    assert.ok(contains(boxes, .5, .25, .5)); assert.ok(contains(boxes, ...upper)); assert.ok(!contains(boxes, ...open));
  }
  const top = blockBoxes(82, {meta:{dir:0,half:'top'}});
  assert.ok(contains(top,.5,.75,.75)); assert.ok(!contains(top,.5,.25,.75));
});

test('adjacent perpendicular stairs form inner and outer corners', () => {
  const outer = blockBoxes(83, {neighbor:(x,y,z)=>z===-1?83:0,neighborMeta:()=>({dir:1})});
  assert.ok(contains(outer,.75,.75,.25)); assert.ok(!contains(outer,.25,.75,.25));
  const inner = blockBoxes(83, {neighbor:(x,y,z)=>z===1?83:0,neighborMeta:()=>({dir:1})});
  assert.ok(contains(inner,.25,.75,.25)); assert.ok(contains(inner,.75,.75,.75)); assert.ok(!contains(inner,.25,.75,.75));
});

test('untrusted nonfinite or invalid saved directions use a safe default', () => {
  const expected = blockBoxes(83);
  for (const dir of [NaN, Infinity, -Infinity, '1e309', '-1e309', 'invalid', undefined, null]) {
    assert.deepEqual(blockBoxes(83,{meta:{dir}}),expected);
    assert.doesNotThrow(()=>blockBoxes(83,{neighbor:()=>83,neighborMeta:()=>({dir})}));
  }
});

test('fences connect in the actual neighbor direction and retain 1.5-block collision height', () => {
  const neighbor = (x,y,z) => x === 1 ? 84 : z === -1 ? 3 : 0;
  const model = blockBoxes(84,{neighbor}), collision = blockBoxes(84,{neighbor,collision:true});
  assert.ok(contains(model,.9,.8,.5)); assert.ok(contains(model,.5,.8,.1)); assert.ok(!contains(model,.1,.8,.5));
  assert.ok(!contains(model,.5,1.2,.5)); assert.ok(contains(collision,.5,1.2,.5));
});

test('panes and bars connect to neighbors without filling a whole block', () => {
  for (const id of [124,125]) {
    const boxes = blockBoxes(id,{neighbor:(x)=>x===1?id:0});
    assert.ok(contains(boxes,.9,.5,.5)); assert.ok(!contains(boxes,.1,.5,.5)); assert.ok(!contains(boxes,.9,.5,.9));
  }
});

test('shared collision geometry uses saved metadata and leaves passable blocks empty', () => {
  const world = {get:(x,y,z)=>x===0&&y===10&&z===0?83:0,metadata:new Map([['0,10,0',{meta:{dir:2}}]])};
  const boxes = collisionBoxes(world,0,10,0,id=>id?[0,0,0,1,1,1]:null);
  assert.ok(contains(boxes,.5,.75,.75)); assert.ok(!contains(boxes,.5,.75,.25));
  assert.deepEqual(collisionBoxes(world,1,10,0,()=>null),[]);
});

test('union surfaces suppress internal faces and slab sides retain half-height texture UVs', () => {
  const boxes = blockBoxes(83), quads = surfaceQuads(boxes,faces);
  assert.ok(quads.some(q=>q.f===2&&q.v.every(v=>v[1]===.5)));
  assert.ok(!quads.some(q=>q.f===3&&q.v.every(v=>v[1]===.5)));
  const slabSide = surfaceQuads([[0,0,0,1,.5,1]],faces).find(q=>q.f===4);
  assert.deepEqual(slabSide.v.map(p=>faceUV(4,p)),[[0,0],[1,0],[0,.5],[1,.5]]);
  const inner = surfaceQuads(blockBoxes(83,{neighbor:(x,y,z)=>z===1?83:0,neighborMeta:()=>({dir:1})}),faces);
  assert.equal(new Set(inner.map(q=>JSON.stringify([q.f,q.v]))).size,inner.length);
});

test('chunk shape metadata keeps stair orientation at the chunk border', () => {
  const cells=new Uint8Array(18*18*96),index=17+18*(4+18*12);cells[index]=83;
  const world={metadata:new Map([['117,12,204',{meta:{dir:3,half:'top',irrelevant:'excluded'}}]])};
  assert.deepEqual(chunkShapeMetadata(world,cells,[],100,200),[[index,{dir:3,half:'top',upsideDown:undefined}]]);
});
