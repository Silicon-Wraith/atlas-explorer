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
// G1-A (WebGPU remediation prereg rev 2 §3): the selected-adapter identity comes from snapshots of the adapter that created the device, the
// ACTIVE record from the chrome://gpu capture taken after the probe, and the probe's samples are verified here; `g` builds a complete raw.
import { readFileSync } from 'node:fs';
import { snapshotInfo } from '../gpu/device.js';
import { ARITH_STATUS } from '../contract.js';
const fx = JSON.parse(readFileSync(new URL('../fixtures.json', import.meta.url), 'utf8'));
const nvidia = { vendor: 'nvidia', architecture: 'lovelace', device: '0x26b1', description: 'NVIDIA RTX 6000 Ada Generation', isFallbackAdapter: false, backend: 'vulkan', type: 'discrete GPU' };
const u = new Uint32Array(4 * fx.arithmetic.bulb.length), f = new Float32Array(u.buffer);
fx.arithmetic.bulb.forEach((s, i) => { const r = s.reference; u[4 * i] = ARITH_STATUS.indexOf(r.status); if (r.status === 'escaped') { u[4 * i + 1] = r.index; f[4 * i + 2] = r.logR; f[4 * i + 3] = r.de; } else if (r.status === 'failure') u[4 * i + 1] = r.index; });
const WORDS = Array.from(u);
const g = ({ adapterInfo = nvidia, chromeGpuText = gpuText, probeOk = true }) => g1Metrics({
  adapterInfo: { ...adapterInfo, identity: { before: snapshotInfo(adapterInfo), after: snapshotInfo(adapterInfo), deviceAdapterInfo: null } },
  chromeGpuText, chromeGpuTextAfter: chromeGpuText, probeOk, probeWords: WORDS, lossEvents: 0, document: { id: 'd', run: 'R' },
  session: { run: 'R', browser: { before: { pid: 1, start: '1' }, after: { pid: 1, start: '1' } }, target: { before: 'T', after: 'T' }, mainFrameNavigations: 1, crashed: false, closed: false } }, fx);

test('an NVIDIA adapter, same-session hardware-accelerated WebGPU and a matching active device corroborate', () => {
  assert.deepEqual(g({}), { metrics: { nvidia: 1, software: 0, corroborated: 1 }, invalidations: [] });
});
test('a software adapter is software even when an NVIDIA device is listed elsewhere', () => {
  const r = g({ adapterInfo: { ...nvidia, vendor: 'google', description: 'SwiftShader Device (Subzero)', isFallbackAdapter: true } });
  assert.equal(r.metrics.software, 1); assert.equal(r.metrics.nvidia, 0);
});
test('missing or contradictory evidence invalidates', () => {
  assert.ok(g({ adapterInfo: { ...nvidia, vendor: '', description: '' } }).invalidations.length > 0);
  assert.equal(g({ chromeGpuText: gpuText.replace('WebGPU: Hardware accelerated', 'WebGPU: Software only') }).metrics.corroborated, 0);
  assert.ok(g({ adapterInfo: { ...nvidia, device: '0x2684' } }).invalidations.some(r => /contradict/.test(r)));
  assert.ok(g({ probeOk: false }).invalidations.some(r => /probe/.test(r)));
});
test('an NVIDIA description without a matchable device identity does not corroborate', () => {
  const r = g({ adapterInfo: { ...nvidia, device: '' } });
  assert.ok(r.invalidations.some(x => /device "" is not a whole hexadecimal identifier/.test(x)));
  assert.equal(r.metrics.corroborated, 0);
});

// Deviation (controller ruling 1): the driver identity and the active GPU come from launch.mjs's reviewed record selection, which is fail-closed.
test('the driver identity is the active GPU record\'s, through activeGpuDriver; its refusals invalidate and never corroborate', () => {
  const twoActive = gpuText.replace('Optimus                         :\nfalse\n', `GPU1                            :\n${ACTIVE.replace('0x26b1', '0x2684')}\n`);
  const noVersion = gpuText.replace('DRIVER_VERSION=580.173.2.0 ', '');
  const inactive = gpuText.replace(' *ACTIVE*', '');
  for (const [text, why] of [[twoActive, /2 active GPU records/], [noVersion, /driver version/], [inactive, /0 active GPU records/], ['', /chrome:\/\/gpu/]]) {
    const r = g({ chromeGpuText: text });
    assert.ok(r.invalidations.some(x => why.test(x)), JSON.stringify(r.invalidations));
    assert.equal(r.metrics.corroborated, 0);
  }
});
test('the active record needs a parseable VENDOR/DEVICE pair, and a non-NVIDIA active vendor never corroborates', () => {
  const r = g({ chromeGpuText: gpuText.replace('VENDOR= 0x10de', 'VENDOR= 0x8086') });
  assert.equal(r.metrics.corroborated, 0);
  const r2 = g({ chromeGpuText: gpuText.replace('DEVICE=0x26b1', 'DEVICE=') });
  assert.ok(r2.invalidations.some(x => /DEVICE= value .* is not a 0x hexadecimal token/.test(x)), JSON.stringify(r2.invalidations));
  assert.equal(r2.metrics.corroborated, 0);
});
// G1-A §3.3 changes this test's expectation deliberately (stricter): a legacy driver-only page still yields a driver identity, but it no
// longer supplies device corroboration.
test('the pre-151 format still yields the driver through activeGpuDriver\'s legacy rows, but supplies no device corroboration', () => {
  const r0 = g({ chromeGpuText: legacyText });
  assert.equal(r0.metrics.corroborated, 0); assert.ok(r0.invalidations.some(x => /legacy driver-only record does not supply device corroboration/.test(x)));
  const r = g({ chromeGpuText: legacyText.replace('Driver version\t580.173.02', '') });
  assert.ok(r.invalidations.some(x => /driver version row/.test(x)), JSON.stringify(r.invalidations));
  assert.equal(r.metrics.corroborated, 0);
});
