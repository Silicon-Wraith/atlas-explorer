import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireDevice, DeviceError, IDENTITY_FIELDS, RECORDED_LIMITS } from '../../src/space/render/webgpu/device.js';
import { UNAVAILABLE } from '../../src/shared/render-report.js';

// A navigator.gpu stand-in. Every call is logged so the annex's ordering rules (adapter.info read
// on the retained adapter before requestDevice; device.lost observed before returning) are checked.
function fakeGpu({ adapter = {}, info = {}, features = ['timestamp-query', 'shader-f16'], limits = {}, refuse = null, nullAdapter = false, exposeFallbackOnAdapter = false } = {}) {
  const calls = [];
  let resolveLost;
  const lost = new Promise(resolve => { resolveLost = resolve; });
  // Instrumented subscription: acquireDevice must have called lost.then by the time it resolves.
  const subscribe = lost.then.bind(lost);
  const subscriptions = [];
  lost.then = (...args) => { subscriptions.push(performance.now()); return subscribe(...args); };
  const device = { limits: { maxBufferSize: 256 * 2 ** 20, maxStorageBufferBindingSize: 128 * 2 ** 20, maxUniformBufferBindingSize: 65536, maxTextureDimension2D: 8192, maxComputeWorkgroupsPerDimension: 65535, maxComputeInvocationsPerWorkgroup: 256, maxBindGroups: 4, maxStorageBuffersPerShaderStage: 8, ...limits }, lost, label: 'fake' };
  const infoObject = { vendor: '', architecture: '', device: '', description: '', ...info };
  const gpuAdapter = {
    get info() { calls.push('adapter.info'); return infoObject; },
    features: new Set(features),
    async requestDevice(descriptor) {
      calls.push(`requestDevice:${JSON.stringify(descriptor?.requiredFeatures ?? null)}`);
      if (refuse) throw new (refuse.constructor ?? Error)(refuse.message ?? String(refuse));
      return device;
    },
    ...adapter,
  };
  if (exposeFallbackOnAdapter) gpuAdapter.isFallbackAdapter = true;
  const gpu = { async requestAdapter(options) { calls.push(`requestAdapter:${options?.powerPreference}`); return nullAdapter ? null : gpuAdapter; } };
  return { gpu, calls, device, adapter: gpuAdapter, subscriptions, loseDevice: info => resolveLost(info) };
}

test('acquireDevice reads adapter.info on the retained adapter before requestDevice and returns a fresh attemptId', async () => {
  const fake = fakeGpu();
  const first = await acquireDevice({ gpu: fake.gpu });
  const second = await acquireDevice({ gpu: fake.gpu });
  assert.equal(first.device?.label, 'fake', 'the acquired device is the one the adapter created');
  assert.ok(first.adapter === fake.adapter, 'the retained adapter is returned');
  assert.equal(typeof first.attemptId, 'string');
  assert.ok(first.attemptId.length > 0);
  assert.notEqual(first.attemptId, second.attemptId, 'every acquisition attempt receives a fresh identity');
  const sequence = fake.calls.slice(0, 3);
  assert.equal(sequence[0], 'requestAdapter:high-performance');
  assert.equal(sequence[1], 'adapter.info');
  assert.equal(sequence[2], 'requestDevice:["timestamp-query"]', 'only the optional features the adapter offers are requested');
  assert.equal(fake.calls.filter(call => call.startsWith('requestAdapter')).length, 2, 'one requestAdapter per acquisition attempt');
});

test('identity fields are observed with their source or recorded as unavailable, never invented', async () => {
  const empty = await acquireDevice({ gpu: fakeGpu().gpu });
  assert.deepEqual(IDENTITY_FIELDS, ['vendor', 'architecture', 'device', 'description']);
  for (const field of IDENTITY_FIELDS) assert.equal(empty.identity[field], UNAVAILABLE, `${field} empty string → unavailable`);
  assert.equal(empty.isFallbackAdapter, UNAVAILABLE, 'a fallback flag the adapter does not expose is unavailable');

  const populated = await acquireDevice({ gpu: fakeGpu({ info: { vendor: 'nvidia', architecture: 'ada-lovelace', device: '0x26b1', description: 'NVIDIA RTX 6000 Ada', isFallbackAdapter: false } }).gpu });
  assert.deepEqual(populated.identity, {
    vendor: { value: 'nvidia', source: 'adapter.info' }, architecture: { value: 'ada-lovelace', source: 'adapter.info' },
    device: { value: '0x26b1', source: 'adapter.info' }, description: { value: 'NVIDIA RTX 6000 Ada', source: 'adapter.info' },
  });
  assert.deepEqual(populated.isFallbackAdapter, { value: false, source: 'adapter.info' });

  const whitespace = await acquireDevice({ gpu: fakeGpu({ info: { vendor: '   ' } }).gpu });
  assert.equal(whitespace.identity.vendor, UNAVAILABLE, 'whitespace is not an observation');

  const legacy = await acquireDevice({ gpu: fakeGpu({ exposeFallbackOnAdapter: true }).gpu });
  assert.deepEqual(legacy.isFallbackAdapter, { value: true, source: 'adapter' });
  assert.ok(Object.isFrozen(populated.identity));
});

test('features and the annex limits are recorded as granted or observed, with absent limits unavailable', async () => {
  const fake = fakeGpu({ features: ['shader-f16'], limits: { maxBindGroups: undefined } });
  const result = await acquireDevice({ gpu: fake.gpu });
  assert.deepEqual(result.features, { requested: ['timestamp-query'], granted: [], available: ['shader-f16'], timestampQuery: false });
  assert.deepEqual(RECORDED_LIMITS, ['maxBufferSize', 'maxStorageBufferBindingSize', 'maxUniformBufferBindingSize', 'maxTextureDimension2D', 'maxComputeWorkgroupsPerDimension', 'maxComputeInvocationsPerWorkgroup', 'maxBindGroups', 'maxStorageBuffersPerShaderStage']);
  assert.equal(result.limits.maxBufferSize, 256 * 2 ** 20);
  assert.equal(result.limits.maxBindGroups, UNAVAILABLE);
  assert.deepEqual(Object.keys(result.limits), RECORDED_LIMITS);
  assert.equal(fake.calls.at(-1), 'requestDevice:[]');

  const granted = await acquireDevice({ gpu: fakeGpu().gpu, optionalFeatures: ['timestamp-query', 'shader-f16', 'not-a-feature'] });
  assert.deepEqual(granted.features.granted, ['timestamp-query', 'shader-f16']);
  assert.equal(granted.features.timestampQuery, true);
});

test('device.lost is observed before acquireDevice returns and reports the attempt that was lost', async () => {
  const fake = fakeGpu();
  const events = [];
  const result = await acquireDevice({ gpu: fake.gpu, onLost: event => events.push(event) });
  // Checked immediately, before any timer turn: a subscription deferred to a later task would be absent here.
  assert.equal(fake.subscriptions.length, 1, 'device.lost.then is subscribed exactly once by the time acquisition resolves');
  assert.deepEqual(events, [], 'the loss observer is attached, never awaited');
  fake.loseDevice({ reason: 'destroyed', message: 'device destroyed' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(events, [{ attemptId: result.attemptId, reason: 'destroyed', message: 'device destroyed' }]);

  // A missing reason (Chrome reports 'unknown' for unexpected loss) is passed through as observed.
  const second = fakeGpu();
  const observed = [];
  const again = await acquireDevice({ gpu: second.gpu, onLost: event => observed.push(event) });
  assert.equal(second.subscriptions.length, 1);
  // Without an onLost callback the observer is still attached (the annex: attached immediately after acquisition).
  const silent = fakeGpu();
  await acquireDevice({ gpu: silent.gpu });
  assert.equal(silent.subscriptions.length, 1, 'the loss observer is attached even without a callback');
  second.loseDevice({ reason: 'unknown', message: '' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(observed, [{ attemptId: again.attemptId, reason: 'unknown', message: '' }]);
});

test('DeviceError codes name the failing step: no-webgpu, no-adapter, device-refused', async () => {
  await assert.rejects(acquireDevice({ gpu: undefined }), error => error instanceof DeviceError && error.code === 'no-webgpu');
  await assert.rejects(acquireDevice({ gpu: null }), error => error instanceof DeviceError && error.code === 'no-webgpu');
  await assert.rejects(acquireDevice({ gpu: fakeGpu({ nullAdapter: true }).gpu }), error => error instanceof DeviceError && error.code === 'no-adapter');
  const refused = fakeGpu({ refuse: new Error('requestDevice failed: feature not supported') });
  await assert.rejects(acquireDevice({ gpu: refused.gpu }), error => error instanceof DeviceError && error.code === 'device-refused' && /feature not supported/.test(error.message) && error.cause instanceof Error);
  assert.throws(() => new DeviceError('other'), RangeError);
  const error = new DeviceError('no-adapter');
  assert.equal(error.name, 'DeviceError');
  assert.equal(error.message, 'no-adapter');
});
