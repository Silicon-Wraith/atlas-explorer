import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldRecord } from '../../src/space/preparation/contract.js';
import { createSpatialGrid } from '../../src/space/preparation/spatial-grid.js';
import { createPreparedPoseModel, preparedOrientation, preparedForward } from '../../src/space/preparation/pose.js';

const origin = [1414.9757562519364,79.21086912557448,1040.6400501279961], D = .0265625;
const world = createWorldRecord({ id:'pose-unit-world',generator:{id:'test',version:'1'},parameters:{},assets:[{role:'math',sha256:'0'.repeat(64)}],lineage:[{id:'root',parent:null}] });
const axes = [[0,.16538701891281857,-.9862287432310676],[-.8721772490151933,.4824532290228802,.08090567412540195],[.4891899899837377,.860166272170984,.14424679517820585]];
const fineOrigin = [1414.969281874518,79.1994849165704,1040.6381410370243];
const grid = createSpatialGrid({origin,axes,diameter:D}), fineBounds={min:fineOrigin.map(x=>x-D/2),max:fineOrigin.map(x=>x+D/2)};
const model=()=>createPreparedPoseModel({world,grid,fineBounds});

test('prepared pose owns its data and keeps body size out of world identity',()=>{
  const m=model(),local=fineOrigin.map((x,i)=>x-origin[i]);const large=m.create({positionLocalM:local}),small=m.create({positionLocalM:local,bodyDiameterM:D/4});
  local[0]=999;assert.ok(Object.isFrozen(large.positionLocalM));assert.deepEqual(large.world,small.world);assert.deepEqual(m.positionM(small),fineOrigin);
  assert.notDeepEqual(large.positionLocalM,local);
  assert.deepEqual(m.validate(large),large);
});
test('prepared pose rejects unsupported worlds, scales and locations without clamping',()=>{
  const m=model();assert.throws(()=>m.create({world:{...m.reference,id:'other'}}),/world mismatch/);
  assert.throws(()=>m.create({bodyDiameterM:D/2}),/diameter/);assert.throws(()=>m.create({bodyDiameterM:D/4}),/fine pose/);
  assert.throws(()=>m.create({positionLocalM:[1,0,0]}),/domain/);assert.throws(()=>m.create({originM:[0,0,0]}),/canonical/);
  assert.throws(()=>m.create({orientationWxyz:[2,0,0,0]}),/unit/);assert.throws(()=>m.create({nativePath:'private'}),/known/);
});
test('prepared orientation agrees with Y-up movement across headings and pitch',()=>{
  for(const yaw of [-Math.PI,-1,0,1,Math.PI])for(const pitch of [-1,.2,1]){
    const q=preparedOrientation(yaw,pitch),f=preparedForward(model().create({orientationWxyz:q}));
    const expected=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)];
    assert.ok(f.every((x,i)=>Math.abs(x-expected[i])<1e-14));
  }
});
test('prepared local-to-native conversion stays inside the smallest-body roundoff budget',()=>{
  const m=model();assert.ok(m.roundoffBoundM<1e-8*D/4);
  for(const address of [[-3,-3,-2],[9,3,2],[0,0,0]]){
    const p=grid.center(address),pose=m.withPositionM(m.create(),p),back=m.positionM(pose);
    assert.ok(back.every((x,i)=>Math.abs(x-p[i])<=m.roundoffBoundM));
  }
  const enormous=createSpatialGrid({origin:[1e16,0,0],axes,diameter:D});
  assert.throws(()=>createPreparedPoseModel({world,grid:enormous,fineBounds}),/numerical budget/);
});

test('a saved rolled quaternion supplies its full orthonormal render basis and sign-equivalent image',async()=>{
 const {preparedUp}=await import('../../src/space/preparation/pose.js');
 const {preparedViewBasis}=await import('../../src/space/render/webgpu/prepared-regions.js');
 const q=[Math.SQRT1_2,0,0,Math.SQRT1_2],pose={orientationWxyz:q},flipped={orientationWxyz:q.map(x=>-x)};
 const basis=preparedViewBasis(preparedForward(pose),preparedUp(pose));
 const expected={forward:[0,0,-1],right:[0,1,0],up:[-1,0,0]};
 for(const key of Object.keys(expected))assert.ok(basis[key].every((x,i)=>Math.abs(x-expected[key][i])<1e-14));
 assert.deepEqual(preparedViewBasis(preparedForward(flipped),preparedUp(flipped)),basis);
 for(const yaw of [-2,0,1])for(const pitch of [-1,.2,1]){
  const p={orientationWxyz:preparedOrientation(yaw,pitch)},actual=preparedViewBasis(preparedForward(p),preparedUp(p)),prior=preparedViewBasis(preparedForward(p));
  for(const key of ['forward','right','up'])assert.ok(actual[key].every((x,i)=>Math.abs(x-prior[key][i])<1e-14));
 }
});
