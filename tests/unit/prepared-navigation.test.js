import test from 'node:test';
import assert from 'node:assert/strict';
import { expandTriangles } from '../../src/space/preparation/mesh-normals.js';
import { regionClear, regionCovers, sweepRegion } from '../../src/space/preparation/region-navigation.js';
import { predictRegionAddresses } from '../../src/space/preparation/prediction.js';
import { createSpatialGrid } from '../../src/space/preparation/spatial-grid.js';

const region = classification => ({ artifact: { classification, bounds: { min: [-2,-2,-2], max: [2,2,2] }, transform: { originM: [0,0,0], metresPerUnit: 1 } }, castQueries: 0 });
test('prepared normals retain triangle winding and reject unavailable geometry', () => {
  const vertices = new Float32Array([0,0,0, 1,0,0, 0,1,0]);
  assert.deepEqual([...expandTriangles(vertices, new Uint32Array([0,1,2])).slice(3,6)], [0,0,1]);
  assert.equal(expandTriangles(vertices, new Uint32Array([0,2,1]))[5], -1);
  assert.throws(() => expandTriangles(vertices, new Uint32Array([0,1,5])), /outside/);
  assert.throws(() => expandTriangles(vertices, new Uint32Array([0,0,1])), /Degenerate/);
});
test('constant occupancy still requires whole-body swept coverage', () => {
  const air = region('empty-air'), solid = region('full-solid');
  assert.equal(regionClear(air,[0,0,0],1),true); assert.equal(regionClear(solid,[0,0,0],1),false);
  assert.equal(regionCovers(air,[0,0,0],[1.6,0,0],1),false);
  assert.throws(() => sweepRegion(air,[0,0,0],[1.6,0,0],1),/coverage/);
  assert.equal(sweepRegion(air,[0,0,0],[.1,0,0],1).fraction,1);
  assert.equal(sweepRegion(solid,[0,0,0],[.1,0,0],1).fraction,0);
  assert.throws(() => regionClear(region('surface'),[0,0,0],1),/Unresolved/);
});
test('surface sweep preserves collision contact and skin, and refuses a mismatched body scale', () => {
  const surface=region('surface'); surface.shape={};
  surface.surface={ castShape: () => ({ time_of_impact:.5,witness1:{x:0,y:0,z:0},normal1:{x:0,y:1,z:0} }) };
  assert.equal(sweepRegion(surface,[0,0,0],[.1,0,0],1).fraction,.49);
  assert.equal(surface.castQueries,1);
  assert.throws(() => sweepRegion(surface,[0,0,0],[.1,0,0],.25),/scale/);
});
test('prediction uses vertical travel, respects finite bounds and caps useful addresses', () => {
  const grid=createSpatialGrid({origin:[0,0,0],axes:[[1,0,0],[0,1,0],[0,0,1]],diameter:1,domain:[[-3,3],[-3,3],[-3,3]]});
  const predicted=predictRegionAddresses(grid,[0,0,0],[0,0,.5],4,{exclude:['0,0,0']});
  assert.equal(predicted.length,3); assert.ok(predicted.every(a=>a[2]>0&&a[0]===0));
  assert.deepEqual(predictRegionAddresses(grid,[100,0,0],[0,0,0],2),[]);
});
