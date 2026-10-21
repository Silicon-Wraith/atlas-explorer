import test from 'node:test';
import assert from 'node:assert/strict';
import { PROJECT0_LAUNCH_ARGS, activeGpuIdentity, graphicsFeatureStatus, checkEffectiveArguments, renderSpikeDocument, SPIKE_DOCUMENT_PATH } from '../support/space-suite.mjs';

// chrome://gpu visible text as Chrome renders it: GPUn records on their own lines, the active one
// marked *ACTIVE*, fields comma-separated and DEVICE= full of commas inside its bracketed name.
const GPU_TEXT = `Graphics Feature Status
Canvas: Hardware accelerated
WebGPU: Hardware accelerated
Driver Information
GPU0
VENDOR= 0x10de [Google Inc. (NVIDIA)], DEVICE=0x26b1 [ANGLE (NVIDIA, Vulkan 1.3.289 (NVIDIA NVIDIA RTX 6000 Ada Generation (0x000026B1)), NVIDIA)], DRIVER_VENDOR=Nvidia, DRIVER_VERSION=580.173.02 *ACTIVE*
GPU1
VENDOR= 0x8086 [Intel], DEVICE=0x4680 [Intel UHD], DRIVER_VENDOR=Mesa, DRIVER_VERSION=24.0.0
Optimus: false
`;

test('activeGpuIdentity reads exactly one *ACTIVE* record and fails closed otherwise', () => {
  const identity = activeGpuIdentity(GPU_TEXT);
  assert.equal(identity.vendorId, 0x10de);
  assert.equal(identity.deviceId, 0x26b1);
  assert.equal(identity.driverVendor, 'Nvidia');
  assert.equal(identity.driverVersion, '580.173.02');
  assert.match(identity.record, /^VENDOR= 0x10de/);
  assert.throws(() => activeGpuIdentity(GPU_TEXT.replace(' *ACTIVE*', '')), /0 active GPU records/);
  assert.throws(() => activeGpuIdentity(GPU_TEXT.replace('DRIVER_VERSION=24.0.0', 'DRIVER_VERSION=24.0.0 *ACTIVE*')), /2 active GPU records/);
  assert.throws(() => activeGpuIdentity(GPU_TEXT.replace('GPU1\n', 'GPU0\n')), /listed twice/);
  assert.throws(() => activeGpuIdentity('Graphics Feature Status\nDriver vendor\nNvidia\nDriver version\n580\n'), /no GPU records/);
  assert.throws(() => activeGpuIdentity(GPU_TEXT.replace('DEVICE=0x26b1', 'DEVICE=26b1')), /DEVICE=/);
  assert.throws(() => activeGpuIdentity(GPU_TEXT.replace('DRIVER_VENDOR=Nvidia, ', '')), /DRIVER_VENDOR/);
});

test('graphicsFeatureStatus reads one feature line of the Graphics Feature Status section or reports it unavailable', () => {
  assert.equal(graphicsFeatureStatus(GPU_TEXT, 'WebGPU'), 'Hardware accelerated');
  const bulleted = GPU_TEXT.replace('WebGPU: Hardware accelerated', '*   WebGPU: Hardware accelerated\n*   WebGPU interop: Disabled');
  assert.equal(graphicsFeatureStatus(bulleted, 'WebGPU'), 'Hardware accelerated');
  assert.equal(graphicsFeatureStatus(bulleted, 'WebGPU interop'), 'Disabled');
  assert.equal(graphicsFeatureStatus(bulleted.replace('*   WebGPU: Hardware accelerated\n', ''), 'WebGPU'), 'unavailable', 'a longer feature name is not the feature');
  assert.equal(graphicsFeatureStatus(GPU_TEXT, 'Canvas'), 'Hardware accelerated');
  assert.equal(graphicsFeatureStatus(GPU_TEXT.replace('WebGPU: Hardware accelerated', 'WebGPU\nSoftware only'), 'WebGPU'), 'Software only');
  assert.equal(graphicsFeatureStatus(GPU_TEXT, 'Vulkan'), 'unavailable');
  assert.equal(graphicsFeatureStatus('no section\nWebGPU: x', 'WebGPU'), 'unavailable');
  assert.equal(graphicsFeatureStatus(GPU_TEXT.replace('WebGPU: Hardware accelerated\n', ''), 'WebGPU'), 'unavailable');
});

test('checkEffectiveArguments compares the recorded profile with the effective command line and refuses an unsandboxed or headless launch', () => {
  assert.deepEqual([...PROJECT0_LAUNCH_ARGS], ['--enable-gpu', '--use-angle=vulkan', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--enable-webgpu-developer-features']);
  const line = '/opt/google/chrome/chrome --disable-field-trial-config --enable-gpu --use-angle=vulkan --enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan --enable-webgpu-developer-features --user-data-dir=/x --remote-debugging-pipe about:blank';
  const complete = checkEffectiveArguments(line, PROJECT0_LAUNCH_ARGS);
  assert.deepEqual(complete, { present: [...PROJECT0_LAUNCH_ARGS], missing: [], noSandbox: false, headless: false, gpuWatchdogDisabled: false });
  const partial = checkEffectiveArguments(line.replace('--enable-webgpu-developer-features ', ''), PROJECT0_LAUNCH_ARGS);
  assert.deepEqual(partial.missing, ['--enable-webgpu-developer-features']);
  assert.equal(checkEffectiveArguments(`${line} --no-sandbox`, PROJECT0_LAUNCH_ARGS).noSandbox, true);
  assert.equal(checkEffectiveArguments(`${line} --headless=new`, PROJECT0_LAUNCH_ARGS).headless, true);
  assert.equal(checkEffectiveArguments(`${line} --disable-gpu-watchdog`, PROJECT0_LAUNCH_ARGS).gpuWatchdogDisabled, true);
  // A flag that is only a prefix of another (e.g. --enable-gpu-rasterization) is not the flag.
  assert.deepEqual(checkEffectiveArguments('chrome --enable-gpu-rasterization', ['--enable-gpu']).missing, ['--enable-gpu']);
});

const sampleReport = () => [
  { name: 'environment', group: 'coexistence', chromeVersion: '155.0.8059.84', userAgent: 'ua', headed: true, chromiumSandbox: true,
    requestedArgs: [...PROJECT0_LAUNCH_ARGS], effectiveArguments: { present: [...PROJECT0_LAUNCH_ARGS], missing: [], noSandbox: false, headless: false, gpuWatchdogDisabled: false },
    effectiveCommandLine: 'chrome --enable-gpu', chromeGpu: { vendorId: 0x10de, deviceId: 0x26b1, driverVendor: 'Nvidia', driverVersion: '580.173.02', record: 'VENDOR= 0x10de …' }, webgpuStatus: 'Hardware accelerated (sample)', startedAt: '2026-10-21T00:00:00.000Z' },
  { name: 'WebGL 2 and WebGPU contexts coexist in one page', webgl: { renderer: 'ANGLE (NVIDIA, Vulkan …)', vendor: 'Google Inc. (NVIDIA)', version: 'WebGL 2.0' },
    webgpu: { attemptId: 'space-device-1-x', canvasFormat: 'bgra8unorm', probe: { sum: 2016, elapsedMs: 1.5 } }, plane: { zoomBefore: 3.85, zoomAfter: 4.15, width: 1280, height: 720 },
    drains: { afterAcquire: { status: 'complete', fenceMs: 1, polls: 2 }, afterWebGpuWork: { status: 'complete', fenceMs: 1, polls: 1 } } },
  { name: 'Adapter identity reports observed or unavailable fields truthfully', identity: { vendor: { value: 'nvidia', source: 'adapter.info' }, architecture: 'unavailable', device: 'unavailable', description: 'unavailable' },
    isFallbackAdapter: { value: false, source: 'adapter.info' }, features: { requested: ['timestamp-query'], granted: ['timestamp-query'], available: ['timestamp-query'], timestampQuery: true },
    limits: { maxBufferSize: 2147483648, maxBindGroups: 4 } },
  { name: 'A representative pipeline set prepares within the bound with progress events', boundMs: 60000, totalMs: 123.4,
    stages: [{ id: 'trace', moduleMs: 1.2, pipelineMs: 80.1, totalMs: 81.3, messages: [] }, { id: 'normals', moduleMs: 0.8, pipelineMs: 20.2, totalMs: 21, messages: [] }, { id: 'display', moduleMs: 0.5, pipelineMs: 10.3, totalMs: 10.8, messages: [] }],
    events: [{ stage: 'trace', index: 1, total: 3, elapsedMs: 81.3 }, { stage: 'normals', index: 2, total: 3, elapsedMs: 102.3 }, { stage: 'display', index: 3, total: 3, elapsedMs: 113.1 }],
    warm: { totalMs: 5.5, stages: [{ id: 'trace', totalMs: 2 }, { id: 'normals', totalMs: 2 }, { id: 'display', totalMs: 1.5 }] },
    dispatch: { width: 128, height: 128, submissionMs: 0.4, queueCompletionMs: 9.9, counts: { hit: 5000, miss: 11000, unresolved: 384, numericalFailure: 0 } } },
  { name: 'WebGPU device destroyed without disturbing WebGL', lost: { reason: 'destroyed' }, webglAfterDestroy: { status: 'complete' } },
  { name: 'No browser runtime errors' },
];

test('renderSpikeDocument records conditions and every measured value from the report, and refuses a failed report', () => {
  const text = renderSpikeDocument(sampleReport(), { generatedAt: '2026-10-21T12:00:00.000Z', commit: 'abc1234', runs: [{ label: 'run 1', report: sampleReport() }] });
  assert.equal(SPIKE_DOCUMENT_PATH, 'docs/reports/project1b/2026-10-21-coexistence-spike.md');
  for (const needle of ['155.0.8059.84', '--enable-webgpu-developer-features', '0x10de', '0x26b1', '580.173.02', 'space-device-1-x', 'bgra8unorm',
    '1280 × 720', 'nvidia', 'unavailable', 'timestamp-query', '2147483648', '80.1', '20.2', '10.3', '123.4', '60000', '5.5', 'destroyed', 'abc1234', '2026-10-21T12:00:00.000Z', '5000', '11000', '384', 'Hardware accelerated (sample)']) {
    assert.ok(text.includes(needle), `document must record ${needle}`);
  }
  assert.match(text, /^# /m);
  assert.match(text, /Generated from the suite report/);
  assert.match(text, /headed/i);
  assert.match(text, /## Repeat runs/);
  const multi = renderSpikeDocument(sampleReport(), { generatedAt: 'x', commit: 'y', runs: [
    { label: 'later', report: sampleReport().map(entry => (entry.name === 'environment' ? { ...entry, startedAt: '2026-10-21T00:00:09.000Z' } : entry)) },
    { label: 'earlier', report: sampleReport().map(entry => (entry.name === 'environment' ? { ...entry, startedAt: '2026-10-21T00:00:01.000Z' } : entry)) },
  ] });
  assert.ok(multi.indexOf('| earlier |') < multi.indexOf('| later |'), 'repeat runs are ordered by start time');
  assert.throws(() => renderSpikeDocument([...sampleReport(), { name: 'FAIL', error: 'boom' }], { generatedAt: 'x', commit: 'y' }), /records a failure/);
  assert.throws(() => renderSpikeDocument(sampleReport().filter(entry => entry.name !== 'environment'), { generatedAt: 'x', commit: 'y' }), /environment/);
});
