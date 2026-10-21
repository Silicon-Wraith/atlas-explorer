import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { nextUp, nextDown, derivativeUpdate } from '../reference/f32.js';
import { complexOrbit } from '../reference/complex.js';
import { quaternionOrbit, quaternionBound, componentsAgree, admitsRequestedComponent } from '../reference/quaternion.js';
import { bulbOrbit } from '../reference/bulb.js';
import { sphereDistance, boxDistance, sphereInterval, boxInterval } from '../reference/analytic.js';
import { mengerBoxes, mengerDistance } from '../reference/menger.js';
import { overviewCamera, cameraBasis, rayFor, yawCamera } from '../reference/camera.js';
import { traceRay, traceModel } from '../reference/trace.js';
import { prepareAnchor } from '../reference/anchors.mjs';
import { generateMatrix, matrixIsQualifiable, finalizeStratum, materializePerformance, predictCheckpoint,
  serialize, sha256, matrixHeader, generateStrata, generateAnchors, generateUsability, createMatrixIndex, assembleMatrix, loadMatrix, compareOverview, overviewStratum, pointAdversarial, rayAdversarial } from '../reference/matrix.mjs';

const dir = new URL('../reference/', import.meta.url);
const json = name => JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
const bytes = name => readFileSync(new URL(name, dir));
const close = (a, b, tolerance = 1e-12) => assert.ok(Math.abs(a - b) <= tolerance, `${a} versus ${b}`);
const profile = { name: 'surface-v1', height: 720, verticalFovDegrees: 60, maxSteps: 512 };

const committed = loadMatrix();
test('Menger depths enumerate 20 and 400 boxes and the exterior distance is the box-union minimum', () => {
  for (const depth of [1, 2]) {
    const boxes = mengerBoxes(depth);
    assert.equal(boxes.length, depth === 1 ? 20 : 400);
    for (const point of [[2, 3, 4], [0, 0, 0], [0.7, -1.1, 0.3]]) {
      const expected = Math.min(...boxes.map(box => boxDistance(point, box).distance));
      close(mengerDistance(point, depth).distance, expected);
    }
  }
});

test('the reference marcher reports stagnation by field coordinate for o = 1, t = 2⁻²⁶ in f32 mode', () => {
  const result = traceRay({ origin: [1, 0, 0], direction: [1, 0, 0] },
    { ...profile, precision: 'f32', tolerance: 0, stepMultiplier: 0.9 },
    () => ({ distance: 2 ** -26 / 0.9, applicability: 'exterior' }), { enter: 2 ** -26, exit: 1 });
  assert.equal(result.status, 'unresolved'); assert.equal(result.reason, 'stagnation'); assert.equal(result.subreason, 'field-coordinate');
});

test('the reference marcher reports an interior start as unresolved with estimate-unavailable', () => {
  const result = traceRay({ origin: [0, 0, 0], direction: [1, 0, 0] }, profile, sphereDistance, { enter: -2, exit: 2 });
  assert.equal(result.status, 'unresolved'); assert.equal(result.reason, 'estimate-unavailable');
});

test('anchors converge within the declared rule and are recorded with both tolerances', () => {
  const anchors = committed.anchors;
  assert.equal(anchors.length, 18);
  for (const anchor of anchors) {
    assert.deepEqual(anchor.convergence.tolerances, [1e-13, 1e-15]);
    assert.equal(anchor.convergence.converged, true, anchor.id);
    const result = prepareAnchor(anchor.model, anchor.effective, anchor.seedRay);
    assert.deepEqual(result.anchor, anchor.anchor); assert.deepEqual(result.convergence, anchor.convergence);
    assert.ok(anchor.convergence.deltaT <= anchor.convergence.limit);
  }
});

test('analytic intervals, boundary starts, empty slices and invalid rays stay distinct', () => {
  assert.deepEqual(sphereInterval({ origin: [0, -4, 0], direction: [0, 1, 0] }, 1), { enter: 3, exit: 5 });
  assert.equal(boxInterval({ origin: [3, 0, 0], direction: [0, 1, 0] }, { center: [0, 0, 0], half: [1, 1, 1] }), null);
  assert.equal(traceRay({ origin: [1, 0, 0], direction: [1, 0, 0] }, profile, sphereDistance, { enter: -2, exit: 1 }).status, 'approximate hit');
  assert.equal(traceRay({ origin: [0, 0, 0], direction: [0, 0, 0] }, profile, sphereDistance, null).status, 'numerical failure');
  assert.ok(quaternionBound([4, 4, 4, 4]) >= (1 + Math.sqrt(33)) / 2);
  assert.equal(quaternionOrbit([nextUp(nextUp(2)), 0, 0, 0], [2.00000072, 0, 0, 0], 64, { precision: 'f32' }).escapeIndex, 0,
    'the default bound must use the effective C after precision conversion');
  let evaluated = false;
  const invalid = traceRay({ origin: [1e40, 0, 0], direction: [1, 0, 0] }, { ...profile, precision: 'f32' },
    () => { evaluated = true; return { distance: 1 }; }, { enter: 0, exit: 1 });
  assert.equal(invalid.status, 'numerical failure'); assert.equal(evaluated, false);
});

test('outward enclosing slabs do not create interior starts for exterior Menger rays', () => {
  const camera = yawCamera(overviewCamera(Math.sqrt(3)), 14.992);
  for (let j = 0; j < 90; j++) for (let i = 0; i < 160; i++) {
    const result = traceModel('menger', { depth: 2 }, rayFor(camera, i, j, 160, 90), { height: 90, maxSteps: 512 });
    assert.notEqual(result.detail, 'interior');
  }
});

test('the quaternion usability prediction is independently reproducible', { timeout: 10000 }, () => {
  const prediction = generateUsability();
  assert.deepEqual(prediction.settings.camera.positionLocal, [1.92, -1.44, 0.7]);
  assert.equal(prediction.acceptance.perClassAbsoluteFraction, 0.05);
  assert.deepEqual(prediction, json('quaternion-usability.json'));
});

const regenerated = [];
const strata = generateStrata({ partition: 'rays' });
const expectedRows = committed.strata.filter(s => ['adversarial-ray', 'analytic-ray', 'fractal-overview', 'detail-ladder'].includes(s.kind));
for (const expected of expectedRows) test(`regenerates P1 stratum ${expected.id}`, { timeout: 10000 }, () => {
  const actual = strata.next(); assert.equal(actual.done, false); assert.equal(serialize(actual.value), serialize(expected)); regenerated.push(actual.value);
});
test('the rays partition regenerates exactly its declared shards', () => {
  assert.equal(strata.next().done, true); assert.deepEqual(regenerated.map(s => s.id), expectedRows.map(s => s.id));
});


test('overview uses the approved integer footprint and status-only eligibility', () => {
  const row = overviewStratum('probe', 'mandelbulb', { power: 8 });
  assert.equal(row.cases.length, 1024); assert.deepEqual(row.floor, { reference: 820, positiveHits: 64 });
  let depthWouldExclude = 0;
  for (const [n,c] of row.cases.entries()) {
    assert.deepEqual(c.pixel, [376 + 17*(n%32), 96 + 17*Math.floor(n/32)]);
    assert.equal(c.referenceEligible, ['approximate hit','miss'].includes(c.expected.status) && c.expected.status === c.reference.status);
    assert.equal(c.depthDifference, c.reference.t - c.expected.t);
    if(c.referenceEligible && c.expected.status === 'approximate hit' && Math.abs(c.depthDifference)/c.expected.t > 1e-3) depthWouldExclude++;
  }
  assert.ok(depthWouldExclude > 64); assert.equal(row.state,'frozen');
  const c2=overviewStratum('c2','quaternion-julia',{C:[2,0,0,0],kappa:0});
  assert.equal(c2.surfaceBearing,false); assert.equal(c2.floor.positiveHits,0); assert.ok(c2.eligible.positiveHits>0);
});

test('overview pass rules count missing hits and make numerical failure hard', () => {
  const cases=Array.from({length:100},(_,i)=>({id:String(i),referenceEligible:true,expected:{status:i<20?'approximate hit':'miss',t:1}}));
  const row={kind:'fractal-overview',profile:'surface-v1',surfaceBearing:true,cases,inputs:{profile:{height:720,verticalFovDegrees:60}}};
  const base=cases.map(c=>({...c.expected}));
  assert.equal(compareOverview(row,base).passed,true);
  const missing=structuredClone(base); missing[0]={status:'miss'};
  assert.equal(compareOverview(row,missing).passed,true);
  missing[1]={status:'miss'};assert.equal(compareOverview(row,missing).passed,false);
  assert.equal(compareOverview({...row,surfaceBearing:false},missing).passed,true);
  const wrong=structuredClone(base);for(let i=20;i<25;i++)wrong[i]={status:'approximate hit',t:1};
  assert.equal(compareOverview(row,wrong).passed,true);wrong[25]={status:'approximate hit',t:1};assert.equal(compareOverview(row,wrong).passed,false);
  const failure=structuredClone(base);failure[99]={status:'numerical failure'};
  assert.equal(compareOverview(row,failure).passed,false);
  const tau=Math.max(1e-6,Math.tan(Math.PI/6)/720);
  const within=structuredClone(base);for(let i=0;i<20;i++)within[i].t+=1.5*tau;
  assert.equal(compareOverview(row,within).passed,true);
  const depth=structuredClone(base);depth[0].t+=3*tau;depth[1].t+=3*tau;assert.equal(compareOverview(row,depth).passed,false);
  assert.equal(compareOverview(row,base.slice(1)).passed,false);
});

test('overview numerical failure on an excluded ray fails an otherwise passing row', () => {
  const cases = Array.from({ length: 100 }, (_, i) => ({
    id: String(i), referenceEligible: i !== 99,
    expected: { status: i < 20 ? 'approximate hit' : 'miss', t: 1 },
  }));
  const row = { kind: 'fractal-overview', profile: 'surface-v1', surfaceBearing: true,
    cases, inputs: { profile: { height: 720, verticalFovDegrees: 60 } } };
  const results = cases.map(c => ({ ...c.expected }));
  assert.equal(compareOverview(row, results).passed, true);
  results[99] = { status: 'numerical failure' };
  const comparison = compareOverview(row, results);
  assert.equal(comparison.eligible, 99);
  assert.equal(comparison.hits, 20);
  assert.equal(comparison.disagreements, 0);
  assert.equal(comparison.goodDepths, 20);
  assert.equal(comparison.statusPassed, true);
  assert.equal(comparison.depthPassed, true);
  assert.equal(comparison.passed, false);
  assert.equal(comparison.numericalFailures, 1);
});

test('all 12 adversarial ray cases execute live termination rules', () => {
  const expected = {
    'sphere-interior':['unresolved','estimate-unavailable',null], 'sphere-boundary':['approximate hit',null,null],
    'box-interior':['unresolved','estimate-unavailable',null], 'sphere-origin-through':['approximate hit',null,null],
    'bulb-polar-axis':['approximate hit',null,null], 'bulb-origin-through':['approximate hit',null,null],
    'sphere-grazing':['approximate hit',null,null], 'quaternion-inside-start':['unresolved','point-budget',null],
    'ray-step-budget':['unresolved','ray-step-budget',null], 'invalid-ray-direction':['numerical failure',null,null],
    'stagnation-field-coordinate':['unresolved','stagnation','field-coordinate'], 'stagnation-ray-parameter':['unresolved','stagnation','ray-parameter'],
  };
  const cases=rayAdversarial().cases;assert.equal(cases.length,12);
  for(const c of cases){const v=c.inputs;
    const a=Object.hasOwn(v,'constantExteriorDistance') ? traceRay(v.ray,v.profile,()=>({distance:v.constantExteriorDistance,applicability:'exterior'}),v.interval)
      : traceModel(v.model,v.effective,v.ray,{name:'surface-v1',height:720,...v.profile});
    assert.deepEqual([a.status,a.reason,a.subreason],expected[c.id],c.id);
  }
});
