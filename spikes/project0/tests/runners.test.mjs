// spikes/project0/tests/runners.test.mjs — the probe and G2 runners against fake browsers: outer bounds, stops and evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ROOT, chromeVersion } from '../launch.mjs';
import { stopReasons } from '../session-utils.mjs';
const { runProbeInvocation, probeSucceeded } = await import('../probe.mjs');
const { runG2, runSession, finalise, environment } = await import('../run.mjs');
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
      effectiveCommandLine: async () => 'chrome --enable-gpu --user-data-dir=/p', browserVersion: async () => 'v', modeMs: 60, stepMs: 20, log: () => {} });   // no real subprocess inside the 60 ms window
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

// Fix round 1 (Codex T6 r1): bounded version check, no work after expiry, cleanup failure is a stop, capture allowance in G2.
test('the runner\'s browser version check is bounded: a hung subprocess is killed and the rejection is a classified stop', async () => {
  const { context, closed } = gpuContext(ACTIVE), t0 = Date.now();
  await assert.rejects(environment(context, 'chrome', [], () => {}, { gpuTextMs: 1000, browserVersion: () => chromeVersion({ command: 'sleep', args: ['5'], timeoutMs: 50 }) }),
    e => /^browser hang: browser version check failed/.test(e.message) && stopReasons({ invalidations: [`session: ${e.message}`] }).includes('browser hang'));
  assert.ok(Date.now() - t0 < 2000, 'the hung subprocess must not hold the runner');
  assert.equal(closed.length, 1);
});

// A fake browser whose pages count navigations; `newPageMs` delays newPage(), `close` overrides context.close.
function fakeBrowser({ newPageMs = 0, close } = {}) {
  const c = { launches: 0, gotos: 0, reloads: 0, pageCloses: 0, closes: 0, environments: 0 };
  const page = { on() {}, goto: async () => { c.gotos++; }, reload: async () => { c.reloads++; }, close: async () => { c.pageCloses++; } };
  const launchChrome = async () => { c.launches++; return { context: { newPage: () => new Promise(r => setTimeout(() => r(page), newPageMs)), close: close ?? (async () => { c.closes++; }) }, requestedArgs: ['--enable-gpu'], profile: '/p' }; };
  return { c, launchChrome };
}
const baseDeps = (dir, launchChrome, c) => ({
  startServer: async () => ({ url: 'http://x', stop: async () => {} }), fixtureIdentity: async () => fixture, implementationIdentity: async () => implementation, newRunDir: async () => dir,
  fixtures: async () => ({}), launchChrome, effectiveCommandLine: async () => 'chrome --enable-gpu --user-data-dir=/p',
  environment: async () => { c.environments++; return { chromeGpuText: 'GPU', env: { browserVersion: 'v', browserExecutable: 'x', driver: 'd', session: 's' } }; },
  waitResult: async () => ({ result: ok() }) });

test('runSession: a page that opens after the outer deadline is closed and never navigated', async () => {
  const dir = await scratch(), { c, launchChrome } = fakeBrowser({ newPageMs: 120 });
  try {
    const { records } = await runSession({ gate: 'G4' }, { ...baseDeps(dir, launchChrome, c), deadlineMs: 30, outerMs: 60 });
    await new Promise(r => setTimeout(r, 150));                                                     // the late page arrives
    assert.equal(c.gotos, 0, 'nothing is navigated after expiry');
    assert.equal(c.pageCloses, 1, 'the late page is closed');
    assert.equal(records.length, 1); assert.equal(records[0].slot, 'incomplete');
    assert.ok(stopReasons(records[0]).includes('browser hang'), JSON.stringify(records[0].invalidations));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('G2: a page that opens after the run deadline is closed and never navigated, and no further browser is launched', async () => {
  const dir = await scratch(), { c, launchChrome } = fakeBrowser({ newPageMs: 120 });
  try {
    const { records } = await runG2({}, { ...baseDeps(dir, launchChrome, c), runMs: 60 });
    await new Promise(r => setTimeout(r, 150));
    assert.equal(c.gotos, 0, 'nothing is navigated after expiry'); assert.equal(c.reloads, 0);
    assert.equal(c.pageCloses, 1, 'the late page is closed');
    assert.equal(c.launches, 1); assert.deepEqual(records.map(r => r.slot), ['incomplete']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('G2: a cleanup that times out is a harness-timeout stop, and the next browser is never launched', async () => {
  const dir = await scratch(), { c, launchChrome } = fakeBrowser({ close: never });
  try {
    const { records } = await runG2({}, { ...baseDeps(dir, launchChrome, c), closeMs: 30 });
    assert.equal(c.launches, 1, 'no second launch while the first browser may still be open');
    assert.ok(records[0].invalidations.some(x => /^harness timeout: cleanup of the G2 fresh-0 browser did not finish within 30 ms/.test(x)), JSON.stringify(records[0].invalidations));
    assert.ok(stopReasons(records[0]).includes('harness timeout'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('G2: a cleanup that fails is also a stop', async () => {
  const dir = await scratch(), { c, launchChrome } = fakeBrowser({ close: async () => { throw new Error('Target closed'); } });
  try {
    const { records } = await runG2({}, { ...baseDeps(dir, launchChrome, c), closeMs: 30 });
    assert.equal(c.launches, 1);
    assert.ok(stopReasons(records[0]).includes('harness timeout'), JSON.stringify(records[0].invalidations));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('G2: the chrome://gpu capture never starts with less than its allowance left in the run window', async () => {
  const dir = await scratch(), { c, launchChrome } = fakeBrowser();
  try {
    const deps = { ...baseDeps(dir, launchChrome, c), runMs: 300, gpuTextMs: 200, versionMs: 50, waitResult: async () => { await new Promise(r => setTimeout(r, 100)); return { result: ok() }; } };
    const { records } = await runG2({}, deps);
    assert.equal(c.environments, 0, 'the capture is skipped');
    assert.ok(records[0].invalidations.some(x => /harness timeout: chrome:\/\/gpu capture skipped: \d+ ms of the 300 ms run window left, it needs 250 ms/.test(x)), JSON.stringify(records[0].invalidations));
    assert.equal(c.launches, 1, 'a skipped capture is a stop');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// Fix round 2 (Codex T6 r2): a server or browser that arrives after the deadline is disposed; a failed server stop keeps the evidence.
const delayed = (ms, value) => new Promise(r => setTimeout(() => r(value), ms));
function lateResources({ serverMs = 0, launchMs = 0, stop } = {}) {
  const c = { stops: 0, launches: 0, closes: 0, gotos: 0 };
  const page = { on() {}, goto: async () => { c.gotos++; }, reload: async () => {}, close: async () => {} };
  return { c, deps: {
    startServer: () => delayed(serverMs, { url: 'http://x', stop: stop ?? (async () => { c.stops++; }) }),
    launchChrome: () => { c.launches++; return delayed(launchMs, { context: { newPage: async () => page, close: async () => { c.closes++; } }, requestedArgs: ['--enable-gpu'], profile: '/p' }); } } };
}
for (const runner of ['runSession', 'runG2']) {
  const run = (dir, c, deps, extra) => (runner === 'runSession'
    ? runSession({ gate: 'G4' }, { ...baseDeps(dir, deps.launchChrome, c), waitResult: async () => ({ result: { slots: [{ slot: 'bulb-samples', raw: {} }], invalidations: [] } }), ...deps, deadlineMs: 10, outerMs: 20, launchMs: 200, ...extra })
    : runG2({}, { ...baseDeps(dir, deps.launchChrome, c), ...deps, runMs: 20, launchMs: 200, ...extra }));

  test(`${runner}: a server that starts after the deadline is stopped, and no browser is launched`, async () => {
    const dir = await scratch(), { c, deps } = lateResources({ serverMs: 60 });
    try {
      const { records } = await run(dir, c, deps);
      await delayed(120);
      assert.equal(c.stops, 1, 'the late server is stopped'); assert.equal(c.launches, 0);
      assert.deepEqual(records.map(r => r.slot), ['incomplete']);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  test(`${runner}: a browser that launches after the deadline is closed and never navigated`, async () => {
    const dir = await scratch(), { c, deps } = lateResources({ launchMs: 60 });
    try {
      const { records } = await run(dir, c, deps);
      await delayed(120);
      assert.equal(c.launches, 1); assert.equal(c.closes, 1, 'the late browser is closed'); assert.equal(c.gotos, 0);
      assert.equal(c.stops, 1, 'the server is stopped once');
      assert.deepEqual(records.map(r => r.slot), ['incomplete']);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  test(`${runner}: a server stop that fails is a classified stop, and the evidence is still written`, async () => {
    const dir = await scratch(), { c, deps } = lateResources({ stop: async () => { throw new Error('server did not exit'); } });
    try {
      const { records } = await run(dir, c, deps, runner === 'runSession' ? { deadlineMs: 2000, outerMs: 2000 } : { runMs: 2000, gpuTextMs: 100, versionMs: 50 });
      assert.equal(records.length >= 1, true, 'evidence is finalised');
      assert.ok(records[0].invalidations.some(x => /^harness timeout: the harness server did not stop: server did not exit/.test(x)), JSON.stringify(records[0].invalidations));
      assert.ok(stopReasons(records[0]).includes('harness timeout'));
      assert.equal(c.launches, 1, 'no further browser after the stop');
      JSON.parse(await readFile(join(dir, `${records[0].id}.json`), 'utf8'));
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}

// Fix round 3 (Codex T6 r4): console errors keep their location, HTTP error responses are recorded, the harness declares an empty icon,
// and every runner record carries the producer's timing method.
test('the harness page declares an empty icon, so Chrome makes no favicon request', async () => {
  assert.match(await readFile(resolve(ROOT, 'spikes/project0/index.html'), 'utf8'), /<link rel="icon" href="data:,">/);
});

test('runSession records console errors with their location and HTTP error responses with status and URL', async () => {
  const dir = await scratch(), c = { gotos: 0 }, handlers = {};
  const page = { on: (event, fn) => { handlers[event] = fn; }, close: async () => {},
    goto: async () => {
      c.gotos++;
      handlers.response?.({ status: () => 200, url: () => 'http://x/spikes/project0/index.html' });
      handlers.response?.({ status: () => 404, url: () => 'http://x/missing.js' });
      handlers.console?.({ type: () => 'error', text: () => 'Failed to load resource: the server responded with a status of 404 (Not Found)', location: () => ({ url: 'http://x/missing.js', lineNumber: 0, columnNumber: 0 }) });
      handlers.console?.({ type: () => 'log', text: () => 'fine', location: () => ({ url: 'http://x/a.js', lineNumber: 1, columnNumber: 2 }) });
    } };
  const launchChrome = async () => ({ context: { newPage: async () => page, close: async () => {} }, requestedArgs: ['--enable-gpu'], profile: '/p' });
  try {
    const { records } = await runSession({ gate: 'derivative-policy' }, { ...baseDeps(dir, launchChrome, c),
      waitResult: async () => ({ result: { slots: [{ slot: 'vectors', raw: { fits: [] }, timingMethod: { kind: 'correctness-only' } }], invalidations: [] } }) });
    assert.equal(c.gotos, 1);
    assert.deepEqual(records[0].invalidations, [
      'http error: 404 http://x/missing.js',
      'console error: Failed to load resource: the server responded with a status of 404 (Not Found) (at http://x/missing.js:0:0)']);
    assert.deepEqual(records[0].timingMethod, { kind: 'correctness-only' });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('finalise passes each slot\'s timing method through; a missing one is an invalidation, never a guess; an incomplete record is not-measured', async () => {
  const dir = await scratch();
  try {
    const identity = { backend: 'webgpu', ...fixture, ...implementation, launchHash: 'f'.repeat(64), mode: 'headed', browserVersion: 'v', browserExecutable: 'x', driver: 'd', session: 's' };
    const { TRACE_LIST_TIMING } = await import('../gpu/webgpu.js');
    const common = { gate: 'G3', mode: 'headed', campaign: 'dev', runDir: dir, identity, launchInfo: {}, chromeGpuText: '', invalidations: [], fixtures: {}, experiment: true };
    const [measured, missing] = await finalise({ ...common, outcome: { result: { slots: [{ slot: 'sphere', raw: { workMs: 1 }, timingMethod: TRACE_LIST_TIMING }, { slot: 'box', raw: { workMs: 2 } }], invalidations: [] } } });
    assert.deepEqual(measured.timingMethod, TRACE_LIST_TIMING); assert.deepEqual(measured.invalidations, []);
    assert.equal(missing.timingMethod.kind, 'not-measured'); assert.match(missing.timingMethod.reason, /timing method: missing/);
    assert.ok(missing.invalidations.some(x => /^timing method: missing/.test(x)), JSON.stringify(missing.invalidations));
    const [inconsistent] = await finalise({ ...common, outcome: { result: { slots: [{ slot: 'menger-1', raw: {}, timingMethod: { ...TRACE_LIST_TIMING, timestampQueriesUsed: true } }], invalidations: [] } } });
    assert.ok(inconsistent.invalidations.some(x => /^timing method: .*inconsistent/.test(x)));
    const [incomplete] = await finalise({ ...common, outcome: null });
    assert.equal(incomplete.slot, 'incomplete'); assert.equal(incomplete.timingMethod.kind, 'not-measured'); assert.match(incomplete.timingMethod.reason, /incomplete/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// T6 fix round 4 (Codex r5 finding 2): finalise validates the gate, the descriptor and the raw measurement together. A contradiction is an
// invalidation with a not-measured descriptor, so the evidence is kept and fails closed; before this round each of these was written clean.
test('finalise invalidates a completed G3 slot whose descriptor or workMs contradicts the queue-completion measurement', async () => {
  const dir = await scratch();
  try {
    const identity = { backend: 'webgpu', ...fixture, ...implementation, launchHash: 'f'.repeat(64), mode: 'headed', browserVersion: 'v', browserExecutable: 'x', driver: 'd', session: 's' };
    const { TRACE_LIST_TIMING } = await import('../gpu/webgpu.js');
    const common = { gate: 'G3', mode: 'headed', campaign: 'dev', runDir: dir, identity, launchInfo: {}, chromeGpuText: '', invalidations: [], fixtures: {}, experiment: true };
    const slots = [
      { slot: 'sphere', raw: { workMs: 4 }, timingMethod: { kind: 'correctness-only' } },
      { slot: 'box', raw: { workMs: 4 }, timingMethod: { kind: 'not-measured', reason: 'no timing' } },
      { slot: 'menger-1', raw: { workMs: 4 }, timingMethod: { ...TRACE_LIST_TIMING, field: 'gpuWorkSeconds', clock: 'gpu.timestamp', unit: 's' } },
      { slot: 'menger-2', raw: { workMs: -4 }, timingMethod: TRACE_LIST_TIMING }];
    const records = await finalise({ ...common, outcome: { result: { slots, invalidations: [] } } });
    assert.equal(records.length, 4);
    for (const r of records) {
      assert.ok(r.invalidations.some(x => /^timing method: /.test(x)), `${r.slot}: ${JSON.stringify(r.invalidations)}`);
      assert.equal(r.timingMethod.kind, 'not-measured', r.slot); assert.match(r.timingMethod.reason, /^timing method: /);
    }
    const [g4] = await finalise({ ...common, gate: 'G4', outcome: { result: { slots: [{ slot: 'bulb-samples', raw: {}, timingMethod: TRACE_LIST_TIMING }], invalidations: [] } } });
    assert.ok(g4.invalidations.some(x => /^timing method: G4\/bulb-samples expects/.test(x)), JSON.stringify(g4.invalidations));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the ray-list timing descriptor states what workMs measures: queue completion on the page clock, from before batch preparation', async () => {
  const { TRACE_LIST_TIMING } = await import('../gpu/webgpu.js');
  assert.deepEqual(TRACE_LIST_TIMING, { kind: 'queue-completion', clock: 'page.performance.now', unit: 'ms', field: 'workMs', start: 'before the first batch is prepared', end: 'after the final onSubmittedWorkDone promise resolves', readbackIncluded: false, timestampQueriesUsed: false });
});

// WebGPU remediation (prereg rev 2 §3.5): each G2 browser's acquisition log reaches its own slot's raw, fresh and warm alike.
test('G2: every fresh and warm slot keeps its own document\'s acquisition log', async () => {
  const dir = await scratch(), counters = { reloads: 0 };
  try {
    const withLog = n => ({ ...ok(), acquisitions: [{ epoch: n, requestedFeatures: ['timestamp-query'], features: ['timestamp-query'], grantedFeatures: ['timestamp-query'] }] });
    const { records } = await runG2({}, g2deps(dir, [withLog(1), withLog(2), withLog(3), withLog(4)], counters));
    assert.deepEqual(records.map(r => r.slot), ['fresh-0', 'fresh-1', 'fresh-2', 'warm']);
    for (const [i, r] of records.entries()) {
      const raw = JSON.parse(await readFile(join(dir, `${r.id}.raw.json`), 'utf8'));
      assert.deepEqual(raw.acquisitions.map(a => a.epoch), [i + 1], r.slot);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
