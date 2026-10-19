// Node probe invocation under injected dependencies: every stop is recognised, no second mode launches after it, late resources are closed,
// and an expired mode is an explicit incomplete record.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runProbeInvocation, probeSucceeded } from '../probe.mjs';

const GOOD_RAW = { ok: true, info: { vendor: 'nvidia', isFallbackAdapter: false, fallbackSource: 'x' }, readback: { mismatches: 0 } };
const GPU_TEXT = 'Driver vendor\tNVIDIA\nDriver version\t580.1\n';
function harness(over = {}) {
  const h = { launches: 0, closes: 0, written: [] };
  const d = {
    startServer: async () => ({ url: 'http://x', stop: async () => {} }),
    launchChrome: async () => { h.launches++; return { profile: '/p', requestedArgs: ['--enable-gpu'], context: {
      close: over.close ?? (async () => { h.closes++; }),
      newPage: async () => ({ on() {}, goto: async () => {} }) } }; },
    chromeGpuText: over.gpuHang ? () => new Promise(() => {}) : async () => GPU_TEXT,
    effectiveCommandLine: async () => 'chrome --enable-gpu --user-data-dir=/p',
    waitResult: async () => ({ result: over.result ?? { slots: [{ raw: GOOD_RAW }], invalidations: [], metrics: {} } }),
    fixtureIdentity: async () => ({ fixtureHash: 'a'.repeat(64), fixtureCommit: 'b'.repeat(40), specHash: 'c'.repeat(64) }),
    implementationIdentity: async () => ({ implementationCommit: 'd'.repeat(40), implementationHash: 'e'.repeat(64) }),
    newRunDir: async () => '/x', writeRecord: async (dir, record, artifacts) => { h.written.push({ record, artifacts }); return record; },
    browserVersion: async () => 'Google Chrome 151', modeMs: 2000, stepMs: 500, log: () => {}, env: { DISPLAY: ':10.0', XDG_SESSION_TYPE: 'x11' }, ...over.deps,
  };
  return { h, d };
}
const settle = ms => new Promise(r => setTimeout(r, ms));

test('two clean modes succeed', async () => {
  const { h, d } = harness(); const out = await runProbeInvocation(d);
  assert.equal(h.launches, 2); assert.equal(probeSucceeded(out.records), true);
});

test('a software adapter stops the probe: the second mode never launches', async () => {
  const { h, d } = harness({ result: { slots: [{ raw: { ok: false, info: GOOD_RAW.info } }], invalidations: ['software adapter: swiftshader'], metrics: { software: 1 } } });
  const out = await runProbeInvocation(d);
  assert.equal(h.launches, 1); assert.match(out.stopped, /software execution detected/); assert.equal(out.records[0].metrics.software, 1);
});

test('a context.close() that never resolves is a recognised stop: no second launch, failure preserved', async () => {
  const { h, d } = harness({ close: () => new Promise(() => {}), deps: { stepMs: 40 } });
  const out = await runProbeInvocation(d);
  assert.equal(h.launches, 1); assert.match(out.stopped, /harness timeout/);
  assert.ok(out.records[0].invalidations.some(x => /harness timeout: .*cleanup/.test(x)));
});

test('a failing browser-version check is a stop before any launch; a late answer cannot resume work', async () => {
  let late; const hung = harness({ deps: { modeMs: 40, browserVersion: () => new Promise(r => { late = r; }) } });
  const out = await runProbeInvocation(hung.d); late('Google Chrome 151'); await settle(30);
  assert.equal(hung.h.launches, 0); assert.match(out.stopped, /browser hang/);
  const failing = harness({ deps: { browserVersion: async () => { throw new Error('Command failed: timed out'); } } });
  const out2 = await runProbeInvocation(failing.d);
  assert.equal(failing.h.launches, 0); assert.match(out2.stopped, /browser hang/);
});

test('a browser that launches after the outer deadline is still closed', async () => {
  const { h, d } = harness({ deps: { modeMs: 20, stepMs: 1000, launchChrome: async () => { await settle(80); h.launches++; return { profile: '/p', requestedArgs: [], context: { close: async () => { h.closes++; } } }; } } });
  await runProbeInvocation(d); await settle(200);
  assert.equal(h.launches, 1); assert.equal(h.closes, 1);
});

test('a mode that expires after readback is recorded incomplete, never as a passing slot', async () => {
  const { d: d2 } = harness({ gpuHang: true, deps: { modeMs: 100, stepMs: 1000 } });
  const out = await runProbeInvocation(d2);
  assert.equal(out.records[0].slot, 'incomplete'); assert.equal(out.records[0].metrics.probeOk, 0);
  assert.equal(probeSucceeded(out.records), false); assert.match(out.stopped, /browser hang/);
});

test('the display context is recorded in the launch artefact but not in the configuration identity', async () => {
  const a = harness({ deps: { env: { DISPLAY: ':10.0', XDG_SESSION_TYPE: 'x11' } } }), b = harness({ deps: { env: { DISPLAY: ':0' } } });
  await runProbeInvocation(a.d); await runProbeInvocation(b.d);
  const launch = h => JSON.parse(h.written[0].artifacts.find(x => x.name === 'probe-headed.launch.json').data);
  assert.equal(launch(a.h).display, ':10.0'); assert.equal(launch(a.h).session, 'x11'); assert.equal(launch(b.h).session, null);
  assert.equal(a.h.written[0].record.identity.launchHash, b.h.written[0].record.identity.launchHash);
});

test('a cleanup timeout makes the mode incomplete, not a passing slot', async () => {
  const { d } = harness({ close: () => new Promise(() => {}), deps: { stepMs: 40 } });
  const out = await runProbeInvocation(d);
  assert.equal(out.records[0].slot, 'incomplete'); assert.equal(out.records[0].metrics.probeOk, 0); assert.equal(probeSucceeded(out.records), false);
});

test('a failed launch still records the display context', async () => {
  const { h, d } = harness({ deps: { launchChrome: async () => { throw new Error('Missing X server or $DISPLAY'); }, env: { DISPLAY: ':10.0', XDG_SESSION_TYPE: 'x11' } } });
  await runProbeInvocation(d);
  const launch = JSON.parse(h.written[0].artifacts.find(x => x.name === 'probe-headed.launch.json').data);
  assert.equal(launch.display, ':10.0'); assert.equal(launch.session, 'x11');
});

test('an unknown adapter identity is inconclusive: no stop, the second mode still runs, never a pass', async () => {
  const { h, d } = harness({ result: { slots: [{ raw: { ok: false, error: 'adapter identity unknown: x', info: { vendor: '' } } }], invalidations: [], metrics: {} } });
  const out = await runProbeInvocation(d);
  assert.equal(h.launches, 2); assert.equal(out.stopped, null); assert.equal(out.records[0].metrics.software, undefined);
  assert.equal(out.records[0].metrics.probeOk, 0); assert.equal(probeSucceeded(out.records), false);
});

test('the chrome://gpu text comes from the shared bounded capture, and its hang is a classified stop', async () => {
  const calls = []; const ok = harness({ deps: { chromeGpuText: async (ctx, opts) => { calls.push(opts); return GPU_TEXT; } } });
  await runProbeInvocation(ok.d); assert.deepEqual(calls[0], { timeoutMs: 500 });
  const bad = harness({ deps: { chromeGpuText: async () => { throw new Error('browser hang: chrome://gpu did not fill in within 500 ms'); } } });
  const out = await runProbeInvocation(bad.d);
  assert.equal(bad.h.launches, 1); assert.match(out.stopped, /browser hang/); assert.equal(out.records[0].slot, 'incomplete');
});

test('a chrome://gpu timeout persists the latest captured text, still classified as a stop', async () => {
  const partial = 'Graphics Feature Status\nWebGPU: Hardware accelerated\nGPU0 :\n\nVENDOR= 0x8086, DRIVER_VENDOR=Intel, DRIVER_VERSION=24.0.5\n';
  const { h, d } = harness({ deps: { chromeGpuText: async () => { throw Object.assign(new Error('browser hang: chrome://gpu did not fill in within 500 ms'), { capturedText: partial }); } } });
  const out = await runProbeInvocation(d);
  const { record, artifacts } = h.written[0];
  assert.equal(artifacts.find(a => a.name === 'probe-headed.chrome-gpu.txt').data, partial);
  assert.equal(record.slot, 'incomplete'); assert.equal(record.metrics.probeOk, 0);
  assert.ok(record.invalidations.some(x => /browser hang: chrome:\/\/gpu did not fill in/.test(x)));
  assert.match(out.stopped, /browser hang/); assert.equal(h.launches, 1);
});
