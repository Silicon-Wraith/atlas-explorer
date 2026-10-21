// spikes/project0/tests/remediation-g1a.test.mjs — G1-A (prereg rev 2 §3): the selected-adapter identity, its binding to the run, browser
// process and document, the whole-string device rule, the ACTIVE-record VENDOR=/DEVICE= parse, the corroborated / conflicting / unavailable
// dispositions, and the verified probe readback. CPU only: fakes for every browser object.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { g1Metrics } from '../measure/timing.mjs';
import { activeGpuIds, activeGpuDriver, DEVELOPER_FLAG, launchDisclosures } from '../launch.mjs';
import { snapshotInfo, acquire } from '../gpu/device.js';
import { ARITH_STATUS } from '../contract.js';

const fx = JSON.parse(readFileSync(new URL('../fixtures.json', import.meta.url), 'utf8'));
const ACTIVE = 'VENDOR= 0x10de [Google Inc. (NVIDIA)], DEVICE=0x26b1 [ANGLE (NVIDIA, Vulkan 1.4.312 (NVIDIA NVIDIA RTX 6000 Ada Generation (0x000026B1)), NVIDIA-580.173.2.0)], DRIVER_VENDOR=NVIDIA, DRIVER_VERSION=580.173.2.0 *ACTIVE*';
const gpu = (active = ACTIVE, extra = '') => ['Graphics Feature Status', '=======================', '*   Vulkan: Enabled', '*   WebGPU: Hardware accelerated', '',
  'Version Information', 'GPU0                            :', active, extra, '', 'Optimus                         :', 'false'].join('\n');
const SELECTED = { vendor: 'nvidia', architecture: 'lovelace', device: '0x26b1', description: 'NVIDIA RTX 6000 Ada Generation', isFallbackAdapter: false, driver: 'NVIDIA 580.173.02', backend: 'vulkan', type: 'discrete GPU', vkDriverVersion: 2434400256 };
const snap = (fields = SELECTED) => snapshotInfo(fields);
// the bound probe readback: the frozen bulb references encoded as the GPU would write them (status, index, f32 logR, f32 de)
function bulbWords() {
  const u = new Uint32Array(4 * fx.arithmetic.bulb.length), f = new Float32Array(u.buffer);
  fx.arithmetic.bulb.forEach((s, i) => { const r = s.reference; u[4 * i] = ARITH_STATUS.indexOf(r.status); if (r.status === 'escaped') { u[4 * i + 1] = r.index; f[4 * i + 2] = r.logR; f[4 * i + 3] = r.de; } else if (r.status === 'failure') u[4 * i + 1] = r.index; });
  return Array.from(u);
}
const WORDS = bulbWords();
function good(overrides = {}) {
  const base = {
    adapterInfo: { ...SELECTED, fallbackSource: 'adapter.info.isFallbackAdapter', identity: { before: snap(), after: snap(), deviceAdapterInfo: snap() }, requestedFeatures: [], grantedFeatures: [], features: [] },
    chromeGpuText: gpu(), chromeGpuTextAfter: gpu(), probeOk: true, probeWords: WORDS,
    document: { id: 'doc-1', timeOrigin: 1792456224000.5, run: 'RUN-1' },
    session: { run: 'RUN-1', browser: { before: { pid: 41, start: '777' }, after: { pid: 41, start: '777' } }, target: { before: 'T-1', after: 'T-1' }, mainFrameNavigations: 1, crashed: false, closed: false, deviceLost: false },
  };
  return { ...base, ...overrides };
}
const withIdentity = (before, after = before, device = before) => good({ adapterInfo: { ...good().adapterInfo, identity: { before: snap(before), after: snap(after), deviceAdapterInfo: device === null ? null : snap(device) } } });
const outcome = r => (r.metrics.corroborated ? 'corroborated' : r.invalidations.find(x => /^identity (unavailable|conflicting|not corroborated)/.test(x))?.split(':')[0] ?? 'other');

test('every matching condition holds: corroborated, including the observed VENDOR= whitespace and comma-containing bracketed names', () => {
  assert.deepEqual(g1Metrics(good(), fx), { metrics: { nvidia: 1, software: 0, corroborated: 1 }, invalidations: [] });
  assert.equal(g1Metrics(withIdentity({ ...SELECTED, device: ' 26b1 ' }), fx).metrics.corroborated, 1, 'the whole-string rule allows no 0x prefix and surrounding whitespace');
  assert.equal(g1Metrics(withIdentity(SELECTED, SELECTED, null), fx).metrics.corroborated, 1, 'device.adapterInfo is compared only when exposed');
});

test('activeGpuIds: the reviewed record selection, exactly one VENDOR= and DEVICE=, a leading hex token and only a bracketed-name suffix', () => {
  assert.deepEqual(activeGpuIds(gpu()), { vendorId: 0x10de, deviceId: 0x26b1 });
  assert.deepEqual(activeGpuIds(gpu(ACTIVE.replace('DEVICE=0x26b1 [ANGLE', 'DEVICE=0x26b1[ANGLE'))), { vendorId: 0x10de, deviceId: 0x26b1 }, 'no separating whitespace');
  assert.deepEqual(activeGpuIds(gpu(ACTIVE.replace('VENDOR= 0x10de [Google Inc. (NVIDIA)]', 'VENDOR=0x10de'))), { vendorId: 0x10de, deviceId: 0x26b1 }, 'no suffix');
  for (const [bad, why] of [
    [ACTIVE.replace('DEVICE=0x26b1', 'DEVICE=0x0000026b1'), /DEVICE/], [ACTIVE.replace('DEVICE=0x26b1', 'DEVICE=0x26b1z'), /DEVICE/], [ACTIVE.replace('DEVICE=0x26b1', 'DEVICE=26b1'), /DEVICE/],
    [ACTIVE.replace('DEVICE=0x26b1 [', 'DEVICE=0x26b1 -x ['), /DEVICE/], [ACTIVE.replace('DEVICE=0x26b1', 'DEVICE=0x26b1, DEVICE=0x26b1'), /DEVICE.*2/], [ACTIVE.replace('VENDOR= 0x10de [Google Inc. (NVIDIA)], ', ''), /VENDOR.*0/],
  ]) assert.throws(() => activeGpuIds(gpu(bad)), why, bad);
  assert.throws(() => activeGpuIds(gpu(ACTIVE, `GPU1                            :\n${ACTIVE.replace('0x26b1', '0x2684')}`)), /2 active GPU records/);
  assert.throws(() => activeGpuIds(['Graphics Feature Status', 'WebGPU: Hardware accelerated', 'Driver vendor\tNVIDIA', 'Driver version\t580.173.02'].join('\n')), /legacy driver-only record does not supply device corroboration/);
  assert.deepEqual(activeGpuDriver(gpu()), { vendor: 'NVIDIA', version: '580.173.2.0' }, 'the driver parser is unchanged');
});

test('the selected-adapter device must match the whole string ^(0x)?[0-9a-fA-F]{1,8}$: embedded, overlong or malformed IDs are unavailable, never extracted', () => {
  for (const device of ['NVIDIA 0x26b1', '0x26b1 (RTX 6000)', '0x0000026b1', 'g26b1', '', '0x']) assert.equal(outcome(g1Metrics(withIdentity({ ...SELECTED, device }), fx)), 'identity unavailable', device);
  const absent = { ...SELECTED }; delete absent.device;
  const r = g1Metrics(withIdentity(absent), fx);
  assert.equal(outcome(r), 'identity unavailable'); assert.ok(r.invalidations.some(x => /device is absent/.test(x)));
});

test('mismatched device IDs, contradictory adapter/device information and a pre/post ACTIVE disagreement are conflicting evidence', () => {
  assert.equal(outcome(g1Metrics(withIdentity({ ...SELECTED, device: '0x2684' }), fx)), 'identity conflicting');
  assert.equal(outcome(g1Metrics(withIdentity(SELECTED, { ...SELECTED, device: '0x2684' }), fx)), 'identity conflicting');
  assert.equal(outcome(g1Metrics(withIdentity(SELECTED, SELECTED, { ...SELECTED, vendor: 'amd' }), fx)), 'identity conflicting');
  assert.equal(outcome(g1Metrics(good({ chromeGpuText: gpu(ACTIVE.replace('DEVICE=0x26b1', 'DEVICE=0x2684')) }), fx)), 'identity conflicting');
});

test('absent, malformed or ambiguous diagnostics are unavailable: missing fields, a missing post-probe capture, duplicate or missing ACTIVE fields, multiple ACTIVE records', () => {
  const noBackend = { ...SELECTED }; delete noBackend.backend;
  assert.equal(outcome(g1Metrics(withIdentity(noBackend), fx)), 'identity unavailable');
  assert.equal(outcome(g1Metrics(good({ chromeGpuTextAfter: undefined }), fx)), 'identity unavailable');
  assert.equal(outcome(g1Metrics(good({ chromeGpuTextAfter: gpu(ACTIVE.replace('DEVICE=0x26b1', 'DEVICE=0x26b1, DEVICE=0x26b1')) }), fx)), 'identity unavailable');
  assert.equal(outcome(g1Metrics(good({ chromeGpuTextAfter: gpu(ACTIVE.replace('VENDOR= 0x10de [Google Inc. (NVIDIA)], ', '')) }), fx)), 'identity unavailable');
  assert.equal(outcome(g1Metrics(good({ chromeGpuTextAfter: gpu(ACTIVE, `GPU1                            :\n${ACTIVE}`) }), fx)), 'identity unavailable');
  assert.equal(outcome(g1Metrics(good({ adapterInfo: { ...good().adapterInfo, identity: undefined } }), fx)), 'identity unavailable');
});

test('selected-adapter values that are not NVIDIA, Vulkan and a discrete GPU never corroborate; the ACTIVE vendor must be 0x10de', () => {
  for (const change of [{ vendor: 'amd' }, { backend: 'opengl' }, { type: 'integrated GPU' }, { vendor: ' NVIDIA ', type: ' Discrete GPU ' }]) {
    const r = g1Metrics(withIdentity({ ...SELECTED, ...change }), fx);
    if (change.vendor === ' NVIDIA ') assert.equal(r.metrics.corroborated, 1, 'trimmed and case-normalised');
    else { assert.equal(r.metrics.corroborated, 0, JSON.stringify(change)); assert.ok(r.invalidations.length); }
  }
  assert.equal(g1Metrics(good({ chromeGpuTextAfter: gpu(ACTIVE.replace('VENDOR= 0x10de', 'VENDOR= 0x8086')), chromeGpuText: gpu(ACTIVE.replace('VENDOR= 0x10de', 'VENDOR= 0x8086')) }), fx).metrics.corroborated, 0);
  assert.equal(g1Metrics(good({ chromeGpuTextAfter: gpu().replace('WebGPU: Hardware accelerated', 'WebGPU: Software only') }), fx).metrics.corroborated, 0);
});

test('software adapters are named explicitly, whatever else is missing', () => {
  for (const change of [{ isFallbackAdapter: true }, { type: 'CPU', description: 'SwiftShader Device (Subzero)', vendor: 'google' }]) {
    const r = g1Metrics(withIdentity({ ...SELECTED, ...change }), fx);
    assert.equal(r.metrics.software, 1); assert.ok(r.invalidations.some(x => /^software adapter: /.test(x)));
  }
  const legacy = g1Metrics({ adapterInfo: { vendor: 'google', architecture: '', device: '', description: 'SwiftShader Device (Subzero)', isFallbackAdapter: true }, chromeGpuText: '', probeOk: false });
  assert.equal(legacy.metrics.software, 1);
});

test('stale run bindings and changed browser-process or document identities are refused', () => {
  const s = good().session;
  for (const session of [{ ...s, run: 'RUN-0' }, { ...s, browser: { ...s.browser, after: { pid: 42, start: '777' } } }, { ...s, browser: { ...s.browser, after: { pid: 41, start: '778' } } },
    { ...s, target: { ...s.target, after: 'T-2' } }, { ...s, mainFrameNavigations: 2 }, { ...s, crashed: true }, { ...s, deviceLost: true }, undefined]) {
    const r = g1Metrics(good({ session }), fx);
    assert.equal(r.metrics.corroborated, 0, JSON.stringify(session)); assert.ok(r.invalidations.some(x => /binding/.test(x)), JSON.stringify(r.invalidations));
  }
  assert.equal(g1Metrics(good({ document: { ...good().document, run: 'RUN-0' } }), fx).metrics.corroborated, 0);
});

test('unverified readbacks: the probe samples must pass the frozen arithmetic comparison; a page flag or a length check is not enough', () => {
  for (const probeWords of [undefined, WORDS.slice(4), WORDS.map((w, i) => (i === 2 ? w ^ 0x00400000 : w)), WORDS.map((w, i) => (i === 0 ? (w === 0 ? 1 : 0) : w))]) {
    const r = g1Metrics(good({ probeWords, probeOk: true }), fx);
    assert.equal(r.metrics.corroborated, 0); assert.ok(r.invalidations.some(x => /probe readback/.test(x)), JSON.stringify(r.invalidations));
  }
  assert.equal(g1Metrics(good({ probeOk: false }), fx).metrics.corroborated, 0);
});

test('snapshotInfo records absent properties as absent, never as empty strings or values from elsewhere', () => {
  assert.deepEqual(snapshotInfo({ vendor: 'nvidia', device: '' }), { present: { vendor: 'nvidia', device: '' }, absent: ['architecture', 'description', 'isFallbackAdapter', 'driver', 'backend', 'type', 'vkDriverVersion'] });
  assert.deepEqual(snapshotInfo(null).absent.length, 9);
});

test('acquire snapshots the same adapter before and after requestDevice, captures device.adapterInfo, and records requested, available and granted features', async () => {
  const calls = [], info = { vendor: 'nvidia', device: '0x26b1', backend: 'vulkan' };
  const device = { lost: new Promise(() => {}), addEventListener() {}, limits: {}, destroy() {}, adapterInfo: { vendor: 'nvidia', device: '0x26b1' } };
  const adapter = { get info() { calls.push('info'); return info; }, features: new Set(['timestamp-query', 'subgroups']), requestDevice: async d => { calls.push(['requestDevice', d]); info.description = 'late'; return device; } };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { gpu: { requestAdapter: async () => { calls.push('requestAdapter'); return adapter; } } }, configurable: true, writable: true });
  try {
    const got = await acquire({ requiredFeatures: ['timestamp-query', 'shader-f16'] });
    assert.equal(calls.filter(c => c === 'requestAdapter').length, 1, 'no second requestAdapter');
    assert.ok(calls.indexOf('info') < calls.findIndex(c => Array.isArray(c)), 'snapshot before requestDevice');
    assert.equal(got.info.identity.before.present.description, undefined); assert.ok(got.info.identity.before.absent.includes('description'));
    assert.equal(got.info.identity.after.present.description, 'late');
    assert.deepEqual(got.info.identity.deviceAdapterInfo.present, { vendor: 'nvidia', device: '0x26b1' });
    assert.deepEqual(got.info.requestedFeatures, ['timestamp-query', 'shader-f16']); assert.deepEqual(got.info.grantedFeatures, ['timestamp-query']); assert.deepEqual(got.info.features, ['subgroups', 'timestamp-query']);
  } finally { if (previous) Object.defineProperty(globalThis, 'navigator', previous); else delete globalThis.navigator; }
});

test('the remediation launch configuration is the attempt-1 arguments plus the developer flag, and its timestamp disclosure is labelled', () => {
  const json = JSON.parse(readFileSync(new URL('../launch-remediation.json', import.meta.url), 'utf8'));
  assert.deepEqual(json, ['--enable-gpu', '--use-angle=vulkan', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--enable-webgpu-developer-features']);
  assert.equal(DEVELOPER_FLAG, '--enable-webgpu-developer-features');
  assert.deepEqual(launchDisclosures(json), { developerFeatures: true, timestampQuantization: 'browser timestamp quantization disabled' });
  assert.deepEqual(launchDisclosures(json.slice(0, 3)), { developerFeatures: false, timestampQuantization: 'browser default (100 µs quantization)' });
});

// --- the Node side of the binding (run.mjs): run ID in the URL, owned browser process, page target, navigations, post-probe chrome://gpu ---
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { runSession } from '../run.mjs';
import { browserProcess } from '../launch.mjs';
const scratch = () => mkdtemp(join(resolve(new URL('../../../artifacts/runtime/', import.meta.url).pathname), 'g1a-'));
function g1Browser({ pidAfter = 41 } = {}) {
  const c = { urls: [], captures: 0, pids: [] }, handlers = {};
  const mainFrame = {};
  const page = { on(name, f) { (handlers[name] ??= []).push(f); }, mainFrame: () => mainFrame, goto: async url => { c.urls.push(url); for (const f of handlers.framenavigated ?? []) f(mainFrame); }, close: async () => {} };
  const context = { newPage: async () => page, close: async () => {}, newCDPSession: async () => ({ send: async m => (m === 'Target.getTargetInfo' ? { targetInfo: { targetId: 'T-9' } } : {}), detach: async () => {} }) };
  return { c, launchChrome: async () => ({ context, requestedArgs: ['--enable-gpu'], profile: '/p' }),
    browserProcess: async profile => { c.pids.push(profile); return { pid: c.pids.length === 1 ? 41 : pidAfter, start: '777' }; },
    postGpuText: async () => { c.captures++; return 'AFTER-TEXT'; } };
}
const sessionDeps = (dir, b, extra = {}) => ({
  startServer: async () => ({ url: 'http://x', stop: async () => {} }), fixtureIdentity: async () => ({ fixtureHash: 'f', fixtureCommit: 'c', specHash: 's' }), implementationIdentity: async () => ({ implementationCommit: 'i', implementationHash: 'h' }),
  newRunDir: async () => dir, fixtures: async () => fx, launchChrome: b.launchChrome, effectiveCommandLine: async () => 'chrome --enable-gpu --user-data-dir=/p',
  environment: async () => ({ chromeGpuText: 'BEFORE-TEXT', env: { browserVersion: 'v', browserExecutable: 'x', driver: 'd', session: 's' } }),
  browserProcess: b.browserProcess, postGpuText: b.postGpuText,
  waitResult: async () => ({ result: { slots: [{ slot: 'headed', raw: { adapterInfo: null, probeOk: false, document: { id: 'd', run: 'forged' }, session: { run: 'forged' }, chromeGpuTextAfter: 'forged' }, timingMethod: { kind: 'correctness-only' } }], invalidations: [] } }), ...extra });

test('runSession binds G1 to its run, owned browser process and page target, and captures chrome://gpu again after the probe, before teardown', async () => {
  const dir = await scratch(), b = g1Browser();
  try {
    await runSession({ gate: 'G1', mode: 'headed' }, sessionDeps(dir, b));
    const stamp = dir.split('/').at(-1);
    assert.equal(b.c.urls.length, 1); assert.ok(b.c.urls[0].endsWith(`&run=${encodeURIComponent(stamp)}`), b.c.urls[0]);
    assert.equal(b.c.captures, 1); assert.deepEqual(b.c.pids, ['/p', '/p']);
    const name = (await readdir(dir)).find(n => n.endsWith('.raw.json')), raw = JSON.parse(await readFile(join(dir, name), 'utf8'));
    assert.equal(raw.chromeGpuText, 'BEFORE-TEXT'); assert.equal(raw.chromeGpuTextAfter, 'AFTER-TEXT', 'the page cannot supply the post-probe capture');
    assert.deepEqual(raw.session, { run: stamp, browser: { before: { pid: 41, start: '777' }, after: { pid: 41, start: '777' } }, target: { before: 'T-9', after: 'T-9' }, mainFrameNavigations: 1, crashed: false, closed: false }, 'the page cannot supply the session binding');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('runSession: a non-G1 gate gets no run parameter, no binding and no second capture', async () => {
  const dir = await scratch(), b = g1Browser();
  try {
    await runSession({ gate: 'G4', mode: 'headed' }, sessionDeps(dir, b, { waitResult: async () => ({ result: { slots: [{ slot: 'bulb-samples', raw: {} }], invalidations: [] } }) }));
    assert.ok(!b.c.urls[0].includes('&run=')); assert.equal(b.c.captures, 0); assert.deepEqual(b.c.pids, []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('browserProcess finds the one owned browser process by its profile, from /proc, with its start time', async () => {
  const proc = await mkdtemp(join(resolve(new URL('../../../artifacts/runtime/', import.meta.url).pathname), 'proc-'));
  try {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const put = async (pid, args, start) => { await mkdir(join(proc, String(pid))); await writeFile(join(proc, String(pid), 'cmdline'), args.join('\0') + '\0'); await writeFile(join(proc, String(pid), 'stat'), `${pid} (chrome) S 1 ${Array.from({ length: 18 }, (_, i) => i === 17 ? start : '0').join(' ')} 0 0`); };
    await put(10, ['/opt/google/chrome/chrome', '--user-data-dir=/p'], '555'); await put(11, ['/opt/google/chrome/chrome', '--type=gpu-process', '--user-data-dir=/p'], '556'); await put(12, ['/opt/google/chrome/chrome', '--user-data-dir=/q'], '557');
    assert.deepEqual(await browserProcess('/p', { procRoot: proc }), { pid: 10, start: '555' });
    assert.equal(await browserProcess('/none', { procRoot: proc }), null);
  } finally { await rm(proc, { recursive: true, force: true }); }
});
