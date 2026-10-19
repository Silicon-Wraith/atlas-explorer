// spikes/project0/tests/g1.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { g1Metrics } from '../measure/timing.mjs';

// The real Chrome 151 chrome://gpu shape (T5 report, fix rounds 3-5; E1): feature-status rows are bulleted, and the driver is reported on the
// single `GPU0 :` record whose value line ends `*ACTIVE*`; there are no "Driver vendor"/"Driver version" rows.
const ACTIVE = 'VENDOR= 0x10de [Google Inc. (NVIDIA)], DEVICE=0x26b1 [ANGLE (NVIDIA, Vulkan 1.4.312 (NVIDIA NVIDIA RTX 6000 Ada Generation (0x000026B1)), NVIDIA-580.173.2.0)], DRIVER_VENDOR=NVIDIA, DRIVER_VERSION=580.173.2.0 *ACTIVE*';
const gpuText = ['Graphics Feature Status', '=======================', '*   Vulkan: Enabled', '*   WebGL: Hardware accelerated', '*   WebGPU: Hardware accelerated', '*   WebGPU interop: Disabled', '',
  'Version Information', 'Optimus                         :', 'false', '', 'GPU0                            :', ACTIVE, '', 'Optimus                         :', 'false'].join('\n');
// The pre-151 format the plan was written against: an unlabelled GPU0 line and separate driver rows (activeGpuDriver's legacy fallback).
const legacyText = ['Graphics Feature Status', 'WebGPU: Hardware accelerated', 'GPU0\tVENDOR= 0x10de, DEVICE=0x26b1 *ACTIVE*',
  'Driver vendor\tNVIDIA', 'Driver version\t580.173.02'].join('\n');
const nvidia = { vendor: 'nvidia', architecture: 'lovelace', device: '0x26b1', description: 'NVIDIA RTX 6000 Ada Generation', isFallbackAdapter: false, fallbackSource: 'adapter.info.isFallbackAdapter' };

test('an NVIDIA adapter, same-session hardware-accelerated WebGPU and a matching active device corroborate', () => {
  assert.deepEqual(g1Metrics({ adapterInfo: nvidia, chromeGpuText: gpuText, probeOk: true }), { metrics: { nvidia: 1, software: 0, corroborated: 1 }, invalidations: [] });
});
test('a software adapter is software even when an NVIDIA device is listed elsewhere', () => {
  const r = g1Metrics({ adapterInfo: { ...nvidia, vendor: 'google', description: 'SwiftShader Device (Subzero)', isFallbackAdapter: true }, chromeGpuText: gpuText, probeOk: true });
  assert.equal(r.metrics.software, 1); assert.equal(r.metrics.nvidia, 0);
});
test('missing or contradictory evidence invalidates', () => {
  assert.ok(g1Metrics({ adapterInfo: { ...nvidia, vendor: '', description: '' }, chromeGpuText: gpuText, probeOk: true }).invalidations.length > 0);
  assert.equal(g1Metrics({ adapterInfo: nvidia, chromeGpuText: gpuText.replace('WebGPU: Hardware accelerated', 'WebGPU: Software only'), probeOk: true }).metrics.corroborated, 0);
  assert.ok(g1Metrics({ adapterInfo: { ...nvidia, device: '0x2684' }, chromeGpuText: gpuText, probeOk: true }).invalidations.some(r => /contradict/.test(r)));
  assert.ok(g1Metrics({ adapterInfo: nvidia, chromeGpuText: gpuText, probeOk: false }).invalidations.some(r => /probe/.test(r)));
});
test('an NVIDIA description without a matchable device identity does not corroborate', () => {
  const r = g1Metrics({ adapterInfo: { ...nvidia, device: '' }, chromeGpuText: gpuText, probeOk: true });
  assert.ok(r.invalidations.some(x => /device identity is missing or unrecognised/.test(x)));
  assert.equal(r.metrics.corroborated, 0);
});

// Deviation (controller ruling 1): the driver identity and the active GPU come from launch.mjs activeGpuDriver, which is fail-closed.
test('the driver identity is the active GPU record\'s, through activeGpuDriver; its refusals invalidate and never corroborate', () => {
  const twoActive = gpuText.replace('Optimus                         :\nfalse\n', `GPU1                            :\n${ACTIVE.replace('0x26b1', '0x2684')}\n`);
  const noVersion = gpuText.replace('DRIVER_VERSION=580.173.2.0 ', '');
  const inactive = gpuText.replace(' *ACTIVE*', '');
  for (const [text, why] of [[twoActive, /2 active GPU records/], [noVersion, /driver version/], [inactive, /0 active GPU records/], ['', /chrome:\/\/gpu driver identity/]]) {
    const r = g1Metrics({ adapterInfo: nvidia, chromeGpuText: text, probeOk: true });
    assert.ok(r.invalidations.some(x => why.test(x)), JSON.stringify(r.invalidations));
    assert.equal(r.metrics.corroborated, 0);
  }
});
test('the active record needs a parseable VENDOR/DEVICE pair, and a non-NVIDIA active vendor never corroborates', () => {
  const r = g1Metrics({ adapterInfo: nvidia, chromeGpuText: gpuText.replace('VENDOR= 0x10de', 'VENDOR= 0x8086'), probeOk: true });
  assert.equal(r.metrics.corroborated, 0);
  const r2 = g1Metrics({ adapterInfo: nvidia, chromeGpuText: gpuText.replace('DEVICE=0x26b1', 'DEVICE='), probeOk: true });
  assert.ok(r2.invalidations.some(x => /identifies no active GPU/.test(x)), JSON.stringify(r2.invalidations));
  assert.equal(r2.metrics.corroborated, 0);
});
test('the pre-151 format is still accepted through activeGpuDriver\'s legacy driver rows', () => {
  assert.deepEqual(g1Metrics({ adapterInfo: nvidia, chromeGpuText: legacyText, probeOk: true }), { metrics: { nvidia: 1, software: 0, corroborated: 1 }, invalidations: [] });
  const r = g1Metrics({ adapterInfo: nvidia, chromeGpuText: legacyText.replace('Driver version\t580.173.02', ''), probeOk: true });
  assert.ok(r.invalidations.some(x => /driver version row/.test(x)), JSON.stringify(r.invalidations));
  assert.equal(r.metrics.corroborated, 0);
});
