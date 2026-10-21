import { canonical, assertRayStatus } from './contract.js';
import { coverageValid } from './metrics.js';
import { add, scale, pose, ray } from './reference/camera.js';
import { split } from './reference/f32.js';
import { profiles, angularPixelSize } from './reference/trace.js';
import {
  referenceAgreement, precisionStopReasons
} from './reference/preparation.js';
import { baseFixtures, preparationJobs } from './fixture-definition.js';

function requireValue(ok,message) {
  if (!ok) throw new Error(message);
}

function equal(actual,expected,message) {
  requireValue(canonical(actual) === canonical(expected),message);
}

function auditRange(a) {
  requireValue(a && Number.isFinite(a.maxDr) && a.maxDr >= 0,'range maximum');
  for (const key of ['updates','doubleRangeCrossings','roundedOperandCrossings']) {
    requireValue(Number.isSafeInteger(a[key]) && a[key] >= 0,'range count');
  }
  requireValue(
    a.doubleRangeCrossings <= a.updates &&
    a.roundedOperandCrossings <= a.updates,
    'range count exceeds updates'
  );
  requireValue(
    (a.witness === null) === (a.roundedOperandCrossings === 0),
    'range witness'
  );
  canonical(a);
}

export function auditCoverage(row,job,base) {
  equal(
    [row.name,row.profile,row.time],
    [job.name,job.profile,job.time],
    'coverage identity'
  );
  equal(row.camera,pose(job.name,job.time,base.anchor),'coverage camera');
  const expected = {
    ...profiles[job.profile],
    ...base.views[job.name].traceOverrides
  };
  equal(row.effectiveProfile,expected,'coverage profile');
  requireValue(row.counts.total === expected.W*expected.H,'coverage dimensions');
  requireValue(coverageValid(row.name,row.counts),'coverage range');
  requireValue(
    Number.isInteger(row.counts.normalAvailable) &&
    row.counts.normalAvailable >= 0 &&
    row.counts.normalAvailable <= row.counts.hit,
    'normal count'
  );
  auditRange(row.audit);
}

function auditTrace(value) {
  assertRayStatus(value);
  requireValue(
    Number.isInteger(value.steps) &&
    value.steps >= 0 &&
    value.steps <= profiles.precision.steps,
    'reference steps'
  );
  requireValue(
    value.status === 'miss'
      ? value.t === null
      : Number.isFinite(value.t) && value.t >= 0,
    'reference depth'
  );
}

export function auditPrecision(set,distance,anchor) {
  const origin = add(anchor.A,scale(anchor.D,-distance));
  const originPairs = origin.map(split);
  equal(
    {
      distance: set.distance,
      origin: set.origin,
      originPairs: set.originPairs,
      roundedOrigin: set.roundedOrigin,
      pairOrigin: set.pairOrigin,
      angularPixelSize: set.angularPixelSize,
      nominalFootprintAtAnchor: set.nominalFootprintAtAnchor,
      primaryProfile: set.primaryProfile,
      tighterProfile: set.tighterProfile
    },
    {
      distance, origin, originPairs,
      roundedOrigin: origin.map(Math.fround),
      pairOrigin: originPairs.map(([hi,lo]) => hi+lo),
      angularPixelSize: angularPixelSize(profiles.precision),
      nominalFootprintAtAnchor: angularPixelSize(profiles.precision)*distance,
      primaryProfile: 'precision',
      tighterProfile: 'precisionTight'
    },
    'precision inputs'
  );
  requireValue(
    Array.isArray(set.rows) && set.rows.length === 4096,
    'precision ray count'
  );
  const camera = { origin, target: anchor.A };
  let ineligible = 0;
  for (let id=0; id<4096; id++) {
    const row = set.rows[id];
    const pixel = [608+id%64,328+Math.floor(id/64)];
    equal([row.id,row.pixel],[id,pixel],'precision ray identity');
    const direction = ray(camera,1280,720,...pixel).direction;
    equal(row.direction,direction,'requested direction');
    equal(
      row.effectiveDirection,direction.map(Math.fround),
      'effective direction'
    );
    for (const key of [
      'requested','directionRounded','baselineInput','compensatedInput'
    ]) {
      const value = row[key];
      auditTrace(value.primary);
      auditTrace(value.tighter);
      equal(
        value,
        referenceAgreement(value.primary,value.tighter),
        'precision eligibility'
      );
    }
    ineligible += Number(!row.requested.eligible);
  }
  equal(set.ineligible,ineligible,'precision exclusion count');
  equal(
    set.stopReasons,
    precisionStopReasons(ineligible,anchor.delta,distance),
    'precision stop'
  );
  auditRange(set.audit);
}

export function auditStatic(fixtures,base=baseFixtures()) {
  canonical(fixtures);
  const { provenance, ...withoutProvenance } = fixtures;
  equal(
    {
      ...withoutProvenance,
      coverage: [],
      precision: { ...fixtures.precision, results: [] }
    },
    base,
    'static fixture mismatch'
  );
  requireValue(
    provenance && typeof provenance === 'object',
    'missing provenance'
  );
  const eligible = {};
  for (const name of ['bulb','plane']) {
    eligible[name] = fixtures.arithmetic[name].filter(r => r.eligible).length;
    requireValue(eligible[name] >= .8*4096,'eligibility floor');
  }
  return eligible;
}

export function auditFixtures(fixtures,base=baseFixtures()) {
  const eligible = auditStatic(fixtures,base);
  const jobs = preparationJobs(base);
  const coverageJobs = jobs.filter(j => j.kind === 'coverage');
  requireValue(
    fixtures.coverage.length === coverageJobs.length,
    'coverage job count'
  );
  fixtures.coverage.forEach((row,i) => {
    auditCoverage(row,coverageJobs[i],base);
  });
  const distances = base.precision.distances;
  requireValue(
    fixtures.precision.results.length === distances.length,
    'precision job count'
  );
  fixtures.precision.results.forEach((set,i) => {
    auditPrecision(set,distances[i],base.anchor);
  });
  const firstStop = fixtures.precision.results.find(set => set.stopReasons.length);
  const ranges = [
    ['arithmetic',fixtures.rangeDiagnostics.arithmetic],
    ['anchor',fixtures.anchor.audit],
    ...fixtures.coverage.map((r,i) => ['coverage/'+i,r.audit]),
    ...fixtures.precision.results.map((r,i) => ['precision/'+i,r.audit])
  ];
  return {
    coverageFrames: fixtures.coverage.length,
    precisionSets: distances.length,
    arithmeticEligible: eligible,
    firstPrecisionStop: firstStop
      ? { distance: firstStop.distance, reasons: firstStop.stopReasons }
      : null,
    ranges: ranges.map(([id,a]) => ({ id, ...a }))
  };
}
