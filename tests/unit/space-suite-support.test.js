import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROJECT0_LAUNCH_ARGS, DEVELOPER_FLAG, COEXISTENCE_REQUIRED_PASSES, activeGpuIdentity, graphicsFeatureStatus, checkEffectiveArguments,
  validateCoexistenceReport, canWriteSpikeDocument, renderSpikeDocument, SPIKE_DOCUMENT_PATH } from '../support/space-suite.mjs';

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

test('a missing feature value never consumes the next feature label or a section boundary', () => {
  assert.equal(graphicsFeatureStatus('Graphics Feature Status\nWebGPU:\nDriver Information\n', 'WebGPU'), 'unavailable', 'a section boundary is not a value');
  assert.equal(graphicsFeatureStatus('Graphics Feature Status\nWebGPU:\n* WebGL: Hardware accelerated\n', 'WebGPU'), 'unavailable', 'the next feature label is not a value');
  assert.equal(graphicsFeatureStatus('Graphics Feature Status\n=======================\n*   WebGPU:\n\n*   WebNN: Disabled\nDriver Information\n', 'WebGPU'), 'unavailable');
  assert.equal(graphicsFeatureStatus('Graphics Feature Status\n=======================\n*   WebGPU:\n\nHardware accelerated\n*   WebNN: Disabled\n', 'WebGPU'), 'Hardware accelerated');
  assert.equal(graphicsFeatureStatus('Graphics Feature Status\n*   WebGPU:\n[WebGPU Status]\n', 'WebGPU'), 'unavailable', 'a bracketed section heading is not a value');
  assert.equal(graphicsFeatureStatus('Graphics Feature Status\n=====\n*   WebGL: Hardware accelerated\nDriver Information\n=====\n*   WebGPU: Hardware accelerated\n', 'WebGPU'), 'unavailable', 'parsing stays inside the feature-status section');
});

test('checkEffectiveArguments compares the recorded profile with the effective command line and refuses an unsandboxed or headless launch', () => {
  assert.deepEqual([...PROJECT0_LAUNCH_ARGS], ['--enable-gpu', '--use-angle=vulkan', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--enable-webgpu-developer-features']);
  assert.equal(DEVELOPER_FLAG, '--enable-webgpu-developer-features');
  const line = '/opt/google/chrome/chrome --disable-field-trial-config --enable-gpu --use-angle=vulkan --enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan --enable-webgpu-developer-features --user-data-dir=/x --remote-debugging-pipe about:blank';
  const complete = checkEffectiveArguments(line, PROJECT0_LAUNCH_ARGS);
  assert.deepEqual(complete, { present: [...PROJECT0_LAUNCH_ARGS], missing: [], noSandbox: false, headless: false, gpuWatchdogDisabled: false, developerFeatures: true });
  const partial = checkEffectiveArguments(line.replace('--enable-webgpu-developer-features ', ''), PROJECT0_LAUNCH_ARGS);
  assert.deepEqual(partial.missing, ['--enable-webgpu-developer-features']);
  assert.equal(partial.developerFeatures, false);
  assert.equal(checkEffectiveArguments(`${line} --no-sandbox`, PROJECT0_LAUNCH_ARGS).noSandbox, true);
  assert.equal(checkEffectiveArguments(`${line} --headless=new`, PROJECT0_LAUNCH_ARGS).headless, true);
  assert.equal(checkEffectiveArguments(`${line} --disable-gpu-watchdog`, PROJECT0_LAUNCH_ARGS).gpuWatchdogDisabled, true);
  // A flag that is only a prefix of another (e.g. --enable-gpu-rasterization) is not the flag.
  assert.deepEqual(checkEffectiveArguments('chrome --enable-gpu-rasterization', ['--enable-gpu']).missing, ['--enable-gpu']);
});

const environment = (patch = {}) => ({
  name: 'environment', group: 'coexistence', launch: 'profile', chromeVersion: '155.0.8059.84', userAgent: 'ua', headed: true, chromiumSandbox: true,
  requestedArgs: [...PROJECT0_LAUNCH_ARGS], effectiveArguments: { present: [...PROJECT0_LAUNCH_ARGS], missing: [], noSandbox: false, headless: false, gpuWatchdogDisabled: false, developerFeatures: true },
  effectiveCommandLine: '/opt/google/chrome/chrome --enable-gpu --user-data-dir=/tmp/pw-profile-1 about:blank',
  chromeGpu: { vendorId: 0x10de, deviceId: 0x26b1, driverVendor: 'Nvidia', driverVersion: '580.173.02', record: 'VENDOR= 0x10de …', polls: 2 }, webgpuStatus: 'Hardware accelerated (sample)',
  handoff: 'B01 implementer (Fable), 2026-10-21, granted by controller', source: { commit: 'abc1234', dirty: false, servedUrl: 'http://127.0.0.1:5197', servedModuleMatches: true },
  startedAt: '2026-10-21T00:00:00.000Z', ...patch,
});
const sampleReport = () => [
  environment(),
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
    timer: { resolutionMs: 0.005, samples: 4096, distinctDeltas: 3 }, longTasks: [{ name: 'self', startTime: 12.5, duration: 61 }], waits: { preparationBound: { armed: 1, rearmed: 0, fired: false } },
    dispatch: { width: 128, height: 128, submissionMs: 0.4, queueCompletionMs: 9.9, counts: { hit: 5000, miss: 11000, unresolved: 384, numericalFailure: 0 } } },
  { name: 'WebGPU device destroyed without disturbing WebGL', lost: { reason: 'destroyed' }, webglAfterDestroy: { status: 'complete' }, waits: { lossObservation: { armed: 1, rearmed: 0, fired: false } } },
  { name: 'No browser runtime errors' },
];
const experimentReport = () => [
  environment({ group: 'developer-flag-experiment', launch: 'with-developer-flag' }),
  { name: 'Adapter identity with --enable-webgpu-developer-features', launch: 'with-developer-flag', identity: { vendor: { value: 'nvidia', source: 'adapter.info' }, architecture: { value: 'lovelace', source: 'adapter.info' }, device: { value: '0x26b1', source: 'adapter.info' }, description: { value: 'NVIDIA RTX 6000 Ada Generation', source: 'adapter.info' } },
    isFallbackAdapter: { value: false, source: 'adapter.info' }, features: { granted: ['timestamp-query'] }, limits: { maxBufferSize: 268435456 }, probe: { sum: 2016, ordered: true } },
  environment({ group: 'developer-flag-experiment', launch: 'without-developer-flag', requestedArgs: PROJECT0_LAUNCH_ARGS.slice(0, 3), effectiveArguments: { present: PROJECT0_LAUNCH_ARGS.slice(0, 3), missing: [], noSandbox: false, headless: false, gpuWatchdogDisabled: false, developerFeatures: false }, startedAt: '2026-10-21T00:00:05.000Z' }),
  { name: 'Adapter identity without --enable-webgpu-developer-features (portability experiment; never qualification)', launch: 'without-developer-flag', identity: { vendor: { value: 'nvidia', source: 'adapter.info' }, architecture: { value: 'lovelace', source: 'adapter.info' }, device: 'unavailable', description: 'unavailable' },
    isFallbackAdapter: { value: false, source: 'adapter.info' }, features: { granted: ['timestamp-query'] }, limits: { maxBufferSize: 268435456 }, probe: { sum: 2016, ordered: true } },
  { name: 'No browser runtime errors' },
];

test('COEXISTENCE_REQUIRED_PASSES is the manifest entry for space-coexistence', () => {
  const manifest = JSON.parse(readFileSync(new URL('../suites.manifest.json', import.meta.url), 'utf8'));
  const suite = manifest.suites.find(entry => entry.id === 'space-coexistence');
  assert.deepEqual([...COEXISTENCE_REQUIRED_PASSES], suite.requiredPasses);
  assert.deepEqual(suite.command, ['tests/space.mjs', '--group', 'coexistence']);
});

test('validateCoexistenceReport rejects an environment-only report, a FAIL entry and a missing required pass', () => {
  assert.equal(validateCoexistenceReport(sampleReport()).ok, true);
  assert.throws(() => validateCoexistenceReport([environment()]), /missing passes/);
  assert.throws(() => validateCoexistenceReport([...sampleReport(), { name: 'FAIL', error: 'boom' }]), /records a failure/);
  assert.throws(() => validateCoexistenceReport(sampleReport().filter(entry => entry.name !== COEXISTENCE_REQUIRED_PASSES[2])), /missing passes: A representative/);
  assert.throws(() => validateCoexistenceReport(sampleReport().filter(entry => entry.name !== 'environment')), /environment/);
  assert.throws(() => validateCoexistenceReport([]), /empty/);
  assert.throws(() => validateCoexistenceReport('nope'), /empty|list/);
});

test('canWriteSpikeDocument permits the document only after a clean run, a persisted report and a confirmed cleanup', () => {
  assert.deepEqual(canWriteSpikeDocument({ report: sampleReport(), cleanupFailed: false, reportPersisted: true, exitCode: undefined }), { ok: true, reason: 'run passed, report persisted, cleanup confirmed' });
  assert.equal(canWriteSpikeDocument({ report: sampleReport(), cleanupFailed: true, reportPersisted: true }).ok, false);
  assert.match(canWriteSpikeDocument({ report: sampleReport(), cleanupFailed: true, reportPersisted: true }).reason, /cleanup/);
  assert.match(canWriteSpikeDocument({ report: sampleReport(), cleanupFailed: false, reportPersisted: false }).reason, /persist/);
  assert.match(canWriteSpikeDocument({ report: sampleReport(), cleanupFailed: false, reportPersisted: true, exitCode: 1 }).reason, /exit/);
  assert.match(canWriteSpikeDocument({ report: [...sampleReport(), { name: 'FAIL', error: 'x' }], cleanupFailed: false, reportPersisted: true }).reason, /failure/);
  assert.match(canWriteSpikeDocument({ report: [environment()], cleanupFailed: false, reportPersisted: true }).reason, /missing passes/);
});

test('renderSpikeDocument records conditions and every measured value from the report, and refuses a failed report', () => {
  const text = renderSpikeDocument(sampleReport(), { generatedAt: '2026-10-21T12:00:00.000Z', commit: 'abc1234', runs: [{ label: 'run 1', report: sampleReport() }] });
  assert.equal(SPIKE_DOCUMENT_PATH, 'docs/reports/project1b/2026-10-21-coexistence-spike.md');
  for (const needle of ['155.0.8059.84', '--enable-webgpu-developer-features', '0x10de', '0x26b1', '580.173.02', 'space-device-1-x', 'bgra8unorm',
    '1280 × 720', 'nvidia', 'unavailable', 'timestamp-query', '2147483648', '80.1', '20.2', '10.3', '123.4', '60000', '5.5', 'destroyed', 'abc1234', '2026-10-21T12:00:00.000Z', '5000', '11000', '384', 'Hardware accelerated (sample)',
    // fix round 1: measured timer resolution, long tasks, wait rearms, the full command line, the handoff, per-run source and the unmeasured cache state
    '0.005 ms', '4096', 'long task', '61 ms', 'rearm', '/opt/google/chrome/chrome --enable-gpu --user-data-dir=/tmp/pw-profile-1 about:blank', 'B01 implementer (Fable), 2026-10-21, granted by controller',
    'driver-cache state unmeasured', 'http://127.0.0.1:5197']) {
    assert.ok(text.includes(needle), `document must record ${needle}`);
  }
  assert.doesNotMatch(text, /shader cache persists|compiles from scratch/, 'no cache state is claimed that was not measured');
  assert.match(text, /^# /m);
  assert.match(text, /Generated from the suite report/);
  assert.match(text, /headed/i);
  assert.match(text, /## Repeat runs/);
  assert.match(text, /\| run 1 \|[^\n]*abc1234`? \(clean\)/, 'each run row names its own source commit');
  assert.throws(() => renderSpikeDocument([...sampleReport(), { name: 'FAIL', error: 'boom' }], { generatedAt: 'x', commit: 'y' }), /records a failure/);
  assert.throws(() => renderSpikeDocument(sampleReport().filter(entry => entry.name !== 'environment'), { generatedAt: 'x', commit: 'y' }), /environment/);
  assert.throws(() => renderSpikeDocument([environment()], { generatedAt: 'x', commit: 'y' }), /missing passes/, 'an environment-only report is not evidence');
  assert.throws(() => renderSpikeDocument(sampleReport(), { generatedAt: 'x', commit: 'y', runs: [{ label: 'bad', report: [...sampleReport(), { name: 'FAIL', error: 'boom' }] }] }), /bad.*records a failure|records a failure.*bad/);
  assert.throws(() => renderSpikeDocument(sampleReport(), { generatedAt: 'x', commit: 'y', runs: [{ label: 'partial', report: [environment()] }] }), /partial.*missing passes|missing passes.*partial/);
  const multi = renderSpikeDocument(sampleReport(), { generatedAt: 'x', commit: 'y', runs: [
    { label: 'later', report: sampleReport().map(entry => (entry.name === 'environment' ? { ...entry, startedAt: '2026-10-21T00:00:09.000Z', source: { commit: 'def5678', dirty: true } } : entry)) },
    { label: 'earlier', report: sampleReport().map(entry => (entry.name === 'environment' ? { ...entry, startedAt: '2026-10-21T00:00:01.000Z' } : entry)) },
  ] });
  assert.ok(multi.indexOf('| earlier |') < multi.indexOf('| later |'), 'repeat runs are ordered by start time');
  assert.match(multi, /\| later \|[^\n]*def5678`? \(dirty\)/);
});

test('renderSpikeDocument reports the developer-flag experiment with the flag-absent launch labelled a portability experiment', () => {
  const text = renderSpikeDocument(sampleReport(), { generatedAt: 'x', commit: 'y', experiment: experimentReport() });
  assert.match(text, /## Developer-flag experiment/);
  assert.match(text, /portability experiment/);
  assert.match(text, /never qualification|not (a )?qualification/i);
  assert.match(text, /\| with-developer-flag \|[^\n]*`0x26b1`/);
  assert.match(text, /\| without-developer-flag \|[^\n]*unavailable/);
  assert.doesNotMatch(renderSpikeDocument(sampleReport(), { generatedAt: 'x', commit: 'y' }), /## Developer-flag experiment/);
  assert.throws(() => renderSpikeDocument(sampleReport(), { generatedAt: 'x', commit: 'y', experiment: [...experimentReport(), { name: 'FAIL', error: 'x' }] }), /records a failure/);
  assert.throws(() => renderSpikeDocument(sampleReport(), { generatedAt: 'x', commit: 'y', experiment: experimentReport().slice(0, 2) }), /both launches/);
});
