// spikes/project0/tests/transport.test.mjs — T9 fix round 1 (Codex T9 r1, finding 1): the page pushes its result, its checkpoints and its capture
// requests through a binding installed before navigation; Node waits on those pushes and never evaluates in the page while a gate runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ROOT } from '../launch.mjs';
import { installTransport, waitResult, stopReasonsOf } from '../session-utils.mjs';
const { runSession } = await import('../run.mjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// A fake Playwright page: exposeBinding stores the binding, `push` calls it the way the page's window.p0Push does; evaluate is counted and
// refused, so any Node evaluation fails the test.
function fakePage(log = []) {
  const handlers = {}; let binding = null; const c = { evaluates: 0, screenshots: 0 };
  const page = {
    on: (event, fn) => { (handlers[event] ??= []).push(fn); },
    exposeBinding: async (name, fn) => { log.push(`exposeBinding ${name}`); binding = fn; },
    evaluate: async () => { c.evaluates++; throw new Error('Node evaluated in the page'); },
    locator: sel => ({ screenshot: async () => { c.screenshots++; log.push(`screenshot ${sel}`); return Buffer.from('png'); } }),
    goto: async () => { log.push('goto'); }, reload: async () => {}, close: async () => {},
  };
  return { page, c, log, push: message => binding(null, message), emit: event => (handlers[event] ?? []).forEach(fn => fn()) };
}

test('the result and the checkpoints arrive by push; Node makes no evaluate call while it waits', async () => {
  const f = fakePage(), writes = [];
  await installTransport(f.page);
  setTimeout(() => f.push({ type: 'checkpoint', checkpoint: { cycle: 0 } }), 10);
  setTimeout(() => f.push({ type: 'checkpoint', checkpoint: { cycle: 1 } }), 20);
  setTimeout(() => f.push({ type: 'result', result: { slots: [{ slot: 'sequence', raw: {} }], invalidations: [] } }), 40);
  const out = await waitResult(f.page, { gate: 'G12', runDir: '/x', deadlineMs: 5000, writeFn: async (p, data) => writes.push([p, data]) });
  assert.deepEqual(out.result.slots.map(s => s.slot), ['sequence']);
  assert.deepEqual(out.lastCheckpoint, { cycle: 1 });
  assert.deepEqual(writes.map(([p]) => p), ['/x/checkpoint-0.json', '/x/checkpoint-1.json']);
  assert.equal(f.c.evaluates, 0);
});

test('a page that never pushes a result meets the Node-owned outer deadline; the last checkpoint is kept; no evaluate', async () => {
  const f = fakePage(); await installTransport(f.page);
  setTimeout(() => f.push({ type: 'checkpoint', checkpoint: { cycle: 0 } }), 5);
  const t0 = Date.now();
  const out = await waitResult(f.page, { gate: 'G12', runDir: '/x', deadlineMs: 60, writeFn: async () => {} });
  assert.match(out.result.error, /browser hang: no result within the 60 ms outer deadline/); assert.deepEqual(out.lastCheckpoint, { cycle: 0 });
  assert.ok(Date.now() - t0 < 1000); assert.equal(f.c.evaluates, 0);
  assert.deepEqual(stopReasonsOf([`page: ${out.result.error}`]), ['browser hang']);
});

test('a crashed page ends the wait at once as a classified browser hang', async () => {
  const f = fakePage(); await installTransport(f.page);
  setTimeout(() => f.emit('crash'), 10);
  const t0 = Date.now();
  const out = await waitResult(f.page, { gate: 'timing', runDir: '/x', deadlineMs: 60000 });
  assert.match(out.result.error, /browser hang or crash: the page crashed/); assert.ok(Date.now() - t0 < 1000);
  assert.equal(f.c.evaluates, 0);
});

test('without a transport installed before navigation there is no result, fail-closed, and nothing is evaluated', async () => {
  const f = fakePage();
  const out = await waitResult(f.page, { gate: 'G6', runDir: '/x', deadlineMs: 60000 });
  assert.match(out.result.error, /no result transport was installed before navigation/); assert.equal(f.c.evaluates, 0);
});

test('a presented-canvas capture request is served by screenshotting #view and acknowledged through the binding\'s reply', async () => {
  const f = fakePage(); await installTransport(f.page); let ack = null;
  setTimeout(async () => { ack = await f.push({ type: 'capture', seq: 1, name: 'sphere' }); f.push({ type: 'result', result: { slots: [], invalidations: [] } }); }, 10);
  const out = await waitResult(f.page, { gate: 'visible', runDir: '/x', deadlineMs: 5000 });
  assert.equal(ack, 1); assert.deepEqual(out.captures.map(c => c.name), ['sphere']); assert.equal(f.c.screenshots, 1); assert.equal(f.c.evaluates, 0);
});

test('results are consumed in order, so a reload\'s result is the second wait\'s (G2 warm)', async () => {
  const f = fakePage(); await installTransport(f.page);
  f.push({ type: 'result', result: { slots: [{ slot: 'pending', raw: { n: 1 } }] } });
  const first = await waitResult(f.page, { gate: 'G2', runDir: '/x', deadlineMs: 1000 });
  setTimeout(() => f.push({ type: 'result', result: { slots: [{ slot: 'pending', raw: { n: 2 } }] } }), 10);
  const second = await waitResult(f.page, { gate: 'G2', runDir: '/x', deadlineMs: 1000 });
  assert.deepEqual([first.result.slots[0].raw.n, second.result.slots[0].raw.n], [1, 2]);
});

test('runSession installs the transport before navigating and waits with no evaluate call', async () => {
  const base = resolve(ROOT, 'artifacts/runtime'); await mkdir(base, { recursive: true });
  const dir = await mkdtemp(join(base, 'p0-transport-test-'));
  const f = fakePage(); const goto = f.page.goto;
  f.page.goto = async () => { await goto(); setTimeout(() => f.push({ type: 'result', result: { slots: [{ slot: 'vectors', raw: { fits: [] }, timingMethod: { kind: 'correctness-only' } }], invalidations: [] } }), 20); };
  try {
    const { records } = await runSession({ gate: 'derivative-policy' }, {
      startServer: async () => ({ url: 'http://x', stop: async () => {} }), fixtureIdentity: async () => ({ fixtureHash: 'a'.repeat(64), fixtureCommit: 'b'.repeat(40), specHash: 'c'.repeat(64) }),
      implementationIdentity: async () => ({ implementationCommit: 'd'.repeat(40), implementationHash: 'e'.repeat(64) }), newRunDir: async () => dir, fixtures: async () => ({}),
      launchChrome: async () => ({ context: { newPage: async () => f.page, close: async () => {} }, requestedArgs: ['--enable-gpu'], profile: '/p' }),
      effectiveCommandLine: async () => 'chrome --enable-gpu --user-data-dir=/p',
      environment: async () => ({ chromeGpuText: 'GPU', env: { browserVersion: 'v', browserExecutable: 'x', driver: 'd', session: 's' } }) });
    assert.deepEqual(f.log.slice(0, 2), ['exposeBinding p0Push', 'goto']);
    assert.deepEqual(records.map(r => r.slot), ['vectors']); assert.deepEqual(records[0].invalidations, []);
    assert.equal(f.c.evaluates, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
