// spikes/project0/tests/runners.test.mjs — the probe and G2 runners against fake browsers: outer bounds, stops and evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ROOT } from '../launch.mjs';
const { runProbeInvocation, probeSucceeded } = await import('../probe.mjs');
const { runG2, finalise, environment } = await import('../run.mjs');
const fixture = { fixtureHash: 'a'.repeat(64), fixtureCommit: 'b'.repeat(40), specHash: 'c'.repeat(64) };
const implementation = { implementationCommit: 'd'.repeat(40), implementationHash: 'e'.repeat(64) };
async function scratch() { const b = resolve(ROOT, 'artifacts/runtime'); await mkdir(b, { recursive: true }); return mkdtemp(join(b, 'p0-runner-test-')); }
const never = () => new Promise(() => {});

test('a probe whose first newPage() never resolves writes an incomplete record, cleans up, and never launches the second mode', async () => {
  const dir = await scratch(); let launches = 0, closes = 0;
  try {
    const out = await runProbeInvocation({
      startServer: async () => ({ url: 'http://x', stop: async () => {} }), fixtureIdentity: async () => fixture, implementationIdentity: async () => implementation, newRunDir: async () => dir,
      launchChrome: async () => { launches++; return { context: { newPage: never, close: async () => { closes++; } }, requestedArgs: ['--enable-gpu'], profile: '/p' }; },
      effectiveCommandLine: async () => 'chrome --enable-gpu --user-data-dir=/p', modeMs: 60, stepMs: 20, log: () => {} });
    assert.equal(launches, 1, 'the second mode is not launched after a stop');
    assert.equal(closes, 1);
    assert.equal(out.records.length, 1); assert.equal(out.records[0].slot, 'incomplete');
    assert.ok(out.records[0].invalidations.some(x => /browser hang/.test(x)));
    JSON.parse(await readFile(join(dir, 'probe-headed.json'), 'utf8'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the probe succeeds only when both modes completed cleanly and passed their own readback check', async () => {
  const dir = await scratch();
  try {
    const page = { on() {}, goto: async () => {} };
    const out = await runProbeInvocation({
      chromeGpuText: async () => 'Driver vendor\tNVIDIA\nDriver version\t580.1\n',   // the reviewed probe takes its chrome://gpu text from the shared capture (launch.mjs)
      startServer: async () => ({ url: 'http://x', stop: async () => {} }), fixtureIdentity: async () => fixture, implementationIdentity: async () => implementation, newRunDir: async () => dir,
      launchChrome: async () => ({ context: { newPage: async () => page, close: async () => {} }, requestedArgs: ['--enable-gpu'], profile: '/p' }),
      effectiveCommandLine: async () => 'chrome --enable-gpu --user-data-dir=/p', browserVersion: async () => 'v',
      waitResult: async () => ({ result: { slots: [{ raw: { ok: false, info: { vendor: 'nvidia' }, readback: { mismatches: 1 } } }], invalidations: [] } }),
      modeMs: 2000, stepMs: 500, log: () => {} });
    assert.equal(out.records.length, 2, 'a readback mismatch is a failed probe, not a stop');
    assert.ok(out.records.every(r => r.slot !== 'incomplete' && r.metrics.probeOk === 0));
    assert.equal(probeSucceeded(out.records), false, 'a completed-but-failed probe exits nonzero');
  } finally { await rm(dir, { recursive: true, force: true }); }
  const rec = (ok, extra = {}) => ({ slot: 'headed', invalidations: [], metrics: { probeOk: ok }, ...extra });
  assert.equal(probeSucceeded([rec(1), rec(1)]), true);
  assert.equal(probeSucceeded([rec(1), rec(0)]), false);
  assert.equal(probeSucceeded([rec(1)]), false, 'a stopped second mode fails');
  assert.equal(probeSucceeded([rec(1), rec(1, { invalidations: ['x'] })]), false);
  assert.equal(probeSucceeded([rec(1), rec(1, { slot: 'incomplete' })]), false);
});

function g2deps(dir, results, counters) {
  const page = { on() {}, goto: async () => {}, reload: async () => { counters.reloads++; } };
  return {
    startServer: async () => ({ url: 'http://x', stop: async () => {} }), fixtureIdentity: async () => fixture, implementationIdentity: async () => implementation, newRunDir: async () => dir,
    fixtures: async () => ({ profiles: { draft: { W: 640, H: 360 } } }),
    launchChrome: async () => ({ context: { newPage: async () => page, close: async () => {} }, requestedArgs: ['--enable-gpu'], profile: '/p' }),
    effectiveCommandLine: async () => 'chrome --enable-gpu --user-data-dir=/p',
    environment: async () => ({ chromeGpuText: '', env: { browserVersion: 'v', browserExecutable: 'x', driver: 'd', session: 's' } }),
    waitResult: async () => ({ result: results.shift() }),
  };
}
const ok = () => ({ slots: [{ raw: { navigationMs: 900, statusLog: [], frame: null, outstandingMax: 1, integrity: { violations: [] } } }], invalidations: [] });

test('G2: a stopped third fresh launch performs zero warm reloads, and the invocation ends after its evidence is written', async () => {
  const dir = await scratch(), counters = { reloads: 0 };
  try {
    const { records } = await runG2({}, g2deps(dir, [ok(), ok(), { error: 'browser hang: the page did not answer within 10000 ms' }], counters));
    assert.equal(counters.reloads, 0);
    assert.deepEqual(records.map(r => r.slot), ['fresh-0', 'fresh-1', 'fresh-2']);
    assert.ok(records[2].invalidations.some(x => /browser hang/.test(x)));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('G2: the warm run\'s invalidations reach its record', async () => {
  const dir = await scratch(), counters = { reloads: 0 };
  try {
    const warm = ok(); warm.invalidations = ['device lost: unknown'];
    const { records } = await runG2({}, g2deps(dir, [ok(), ok(), ok(), warm], counters));
    assert.equal(counters.reloads, 1);
    const w = records.find(r => r.slot === 'warm');
    assert.ok(w.invalidations.includes('device lost: unknown'), JSON.stringify(w.invalidations));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('finalise keeps per-slot invalidations', async () => {
  const dir = await scratch();
  try {
    const identity = { backend: 'webgpu', ...fixture, ...implementation, launchHash: 'f'.repeat(64), mode: 'headed', browserVersion: 'v', browserExecutable: 'x', driver: 'd', session: 's' };
    const recs = await finalise({ gate: 'G2', mode: 'headed', campaign: 'dev', runDir: dir, identity, launchInfo: {}, chromeGpuText: '', outcome: { result: { slots: [{ slot: 'warm', raw: {}, invalidations: ['device lost: unknown'] }], invalidations: [] } }, invalidations: [], fixtures: {}, experiment: true });
    assert.ok(recs[0].invalidations.includes('device lost: unknown'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// run.mjs takes chrome://gpu through the shared bounded capture (launch.mjs chromeGpuText), as probe.mjs does: Chrome 151 renders the page
// into open shadow roots asynchronously, so body.innerText is empty.
const text = s => ({ nodeType: 3, textContent: s });
const el = (tagName, children = [], shadow = null) => ({ nodeType: 1, tagName, childNodes: children, shadowRoot: shadow });
const shadowBody = s => el('BODY', [el('INFO-VIEW', [], { nodeType: 11, childNodes: [el('SPAN', [text(s)])], shadowRoot: null })]);
function gpuContext(bodyText) {
  const closed = [];
  const page = { goto: async () => {}, waitForTimeout: async () => {}, close: async () => { closed.push(1); }, locator: () => ({ innerText: async () => '' }),   // what the old capture used: always empty
    evaluate: async fn => { globalThis.document = { body: shadowBody(bodyText) }; try { return fn(); } finally { delete globalThis.document; } } };
  return { context: { newPage: async () => page }, closed };
}
const ACTIVE = 'Graphics Feature Status\nWebGPU: Hardware accelerated\nGPU0 : VENDOR= 0x10de, DRIVER_VENDOR=NVIDIA, DRIVER_VERSION=580.173.2.0 *ACTIVE*\n';

test('the runner reads chrome://gpu from its shadow roots and derives the driver identity', async () => {
  const { context, closed } = gpuContext(ACTIVE), snapshots = [], invalidations = [];
  const out = await environment(context, '/opt/google/chrome/chrome --enable-gpu', invalidations, t => snapshots.push(t), { gpuTextMs: 1000 });
  assert.match(out.chromeGpuText, /DRIVER_VERSION=580\.173\.2\.0/);
  assert.equal(out.env.driver, 'NVIDIA 580.173.2.0');
  assert.deepEqual(invalidations, []); assert.ok(snapshots.length >= 1); assert.equal(closed.length, 1);
});

test('a chrome://gpu capture that never fills in is a classified browser hang that keeps its latest text', async () => {
  const { context, closed } = gpuContext('Graphics Feature Status\nLoading'), snapshots = [];
  await assert.rejects(environment(context, 'chrome', [], t => snapshots.push(t), { gpuTextMs: 80 }), /^Error: browser hang: chrome:\/\/gpu/);
  assert.match(snapshots.at(-1), /Graphics Feature Status\nLoading/);
  assert.equal(closed.length, 1);
});
