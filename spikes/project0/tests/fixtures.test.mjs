import test from 'node:test';
import assert from 'node:assert/strict';
import { canonical } from '../contract.js';
import {
  baseFixtures, derivativeVectors, resourceLayout, preparationJobs, assembleFixtures
} from '../fixture-definition.js';
import { auditStatic, auditCoverage, auditPrecision } from '../fixture-audit.js';
import { runJobs } from '../fixture-pool.mjs';
import { encodeFixtures, decodeFixtures, options } from '../fixture-files.mjs';
import { F32_MAX, nextDown } from '../reference/f32.js';
import { prepareCoverage, preparePrecision } from '../reference/preparation.js';

const base = baseFixtures();

test('resource bytes and derivative boundaries are frozen explicitly', () => {
  const layout = resourceLayout();
  assert.equal(layout.tableBytes,405995520);
  assert.equal(layout.entries.length,8);
  assert.equal(layout.entries[7].bytes,7864320);
  assert.equal(layout.entries[7].bytesPerRow%256,0);
  const vectors = derivativeVectors();
  const fits = (grow,dr) => vectors.find(v => v.grow === grow && v.dr === dr)?.fits;
  assert.equal(fits(0,F32_MAX),true);
  assert.equal(fits(2,nextDown(F32_MAX/2)),true);
  assert.equal(fits(2,F32_MAX/2),false);
  assert.equal(fits(1,F32_MAX),false);
  assert.equal(fits(2,Math.fround(.375*F32_MAX)),true);
  assert.equal(fits(2 ** -149,2 ** -149),true);
  assert.equal(fits(F32_MAX,1),false);
});

test('upload arrays preserve effective ray order and static corruption is rejected', () => {
  const candidate = { ...base, provenance: {} };
  assert.deepEqual(auditStatic(candidate,base),{ bulb: 3972, plane: 3684 });
  for (const f of Object.values(base.analytic)) {
    assert.deepEqual(Array.from(new Float32Array(f.effectiveOrigins)),
      f.rays.flatMap(r => r.effectiveOrigin));
    assert.deepEqual(Array.from(new Float32Array(f.effectiveDirections)),
      f.rays.flatMap(r => r.effectiveDirection));
  }
  const bad = structuredClone(candidate);
  bad.analytic.box.effectiveOrigins[0] += 1;
  assert.throws(() => auditStatic(bad,base),/static fixture/);
  const badPolicy = structuredClone(candidate);
  badPolicy.derivativePolicy[0].fits = false;
  assert.throws(() => auditStatic(badPolicy,base),/static fixture/);
});

test('job manifest and assembly cannot lose, duplicate or reorder results', () => {
  const jobs = preparationJobs(base);
  assert.equal(jobs.length,82);
  assert.equal(jobs.filter(j => j.kind === 'coverage').length,74);
  assert.equal(jobs[0].time,0);
  assert.equal(jobs[11].time,27.5);
  assert.equal(jobs[72].name,'bulb-stress');
  assert.equal(jobs[73].name,'sphere');
  const rows = jobs.map(j => ({ id: j.id, value: j }));
  const fixture = assembleFixtures(base,{},rows);
  assert.equal(fixture.coverage.length,74);
  assert.equal(fixture.precision.results.length,8);
  assert.throws(() => assembleFixtures(base,{},rows.slice(1)),/identity/);
  [rows[0],rows[1]] = [rows[1],rows[0]];
  assert.throws(() => assembleFixtures(base,{},rows),/identity/);
});

test('coverage audit checks camera, profile, conservation and normal counts', () => {
  const job = { name: 'sphere', profile: 'draft', time: 0 };
  const row = prepareCoverage(job.name,job.profile,job.time,base.anchor);
  auditCoverage(row,job,base);
  const bad = structuredClone(row);
  bad.counts.miss++;
  assert.throws(() => auditCoverage(bad,job,base),/coverage range/);
  bad.counts.miss--;
  bad.counts.normalAvailable = bad.counts.hit+1;
  assert.throws(() => auditCoverage(bad,job,base),/normal count/);
  const wrong = structuredClone(row);
  wrong.effectiveProfile.k = .9;
  assert.throws(() => auditCoverage(wrong,job,base),/coverage profile/);
});

test('precision audit validates conversions, statuses and derived exclusions', () => {
  const set = preparePrecision(.1,base.anchor);
  auditPrecision(set,.1,base.anchor);
  set.rows[0].requested.eligible = !set.rows[0].requested.eligible;
  assert.throws(() => auditPrecision(set,.1,base.anchor),/precision eligibility/);
  set.rows[0].requested.eligible = !set.rows[0].requested.eligible;
  set.rows[0].requested.primary.status = 'typo';
  assert.throws(() => auditPrecision(set,.1,base.anchor),/status/);
});

const workerURL = body => new URL('data:text/javascript,'+encodeURIComponent(
  "import { parentPort } from 'node:worker_threads';\n"+body
));

test('parallel completion still produces identical ordered bytes', async () => {
  const jobs = Array.from({ length: 5 },(_,id) => ({ id }));
  const worker = workerURL(
    'parentPort.on("message",j=>setTimeout(()=>parentPort.postMessage({id:j.id,value:j.id*j.id}),20-j.id*3));'
  );
  const a = await runJobs(jobs,null,{ workers: 1, workerURL: worker });
  const b = await runJobs(jobs,null,{ workers: 3, workerURL: worker });
  assert.equal(canonical(a),canonical(b));
  assert.deepEqual(b.map(r => r.value),[0,1,4,9,16]);
});

test('worker errors, wrong identities and clean premature exit fail the pool', async () => {
  for (const body of [
    'parentPort.on("message",()=>{throw Error("deliberate");});',
    'parentPort.on("message",()=>process.exit(0));',
    'parentPort.on("message",()=>parentPort.postMessage({id:99,value:0}));'
  ]) {
    await assert.rejects(
      runJobs([{ id: 0 },{ id: 1 }],null,{ workers: 2, workerURL: workerURL(body) })
    );
  }
});

test('canonical file codec and command options fail closed', () => {
  const text = encodeFixtures({ z: [1,2], a: true });
  assert.equal(text,'{"a":true,"z":[1,2]}\n');
  assert.deepEqual(decodeFixtures(Buffer.from(text)),{ a: true, z: [1,2] });
  assert.throws(() => decodeFixtures(Buffer.from('{"z":[1,2],"a":true}\n')),/canonical/);
  assert.throws(() => decodeFixtures(Buffer.from('{"a":true,"a":false}\n')),/canonical/);
  assert.throws(() => encodeFixtures({ x: Infinity }),/nonfinite/);
  assert.equal(options(['--workers=8'],['--workers']).workers,8);
  assert.throws(() => options(['--workers=0'],['--workers']),/workers/);
  assert.throws(() => options(['--force'],['--workers']),/option/);
});
