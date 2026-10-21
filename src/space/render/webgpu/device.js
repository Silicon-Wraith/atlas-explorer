// WebGPU adapter and device acquisition (spec §9.1 "Adapter and device", "Epochs and loss";
// plan B01). The only production module that touches navigator.gpu until B06 builds the backend
// on it. Identity is recorded as observed or unavailable — no device string is ever invented
// (§7.4); nothing here asserts that Chrome returns empty adapter strings.
import { observed, UNAVAILABLE } from '../../../shared/render-report.js';

export const IDENTITY_FIELDS = Object.freeze(['vendor', 'architecture', 'device', 'description']);
export const RECORDED_LIMITS = Object.freeze([
  'maxBufferSize', 'maxStorageBufferBindingSize', 'maxUniformBufferBindingSize', 'maxTextureDimension2D',
  'maxComputeWorkgroupsPerDimension', 'maxComputeInvocationsPerWorkgroup', 'maxBindGroups', 'maxStorageBuffersPerShaderStage',
]);
export const DEFAULT_OPTIONAL_FEATURES = Object.freeze(['timestamp-query']);
const ERROR_CODES = Object.freeze(['no-webgpu', 'no-adapter', 'device-refused']);

export class DeviceError extends Error {
  constructor(code, message = code, { cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    if (!ERROR_CODES.includes(code)) throw new RangeError(`unknown device error code ${code}`);
    this.name = 'DeviceError'; this.code = code;
  }
}

let attempts = 0;
// Fresh per call within this document; the counter orders attempts, the suffix separates documents.
const freshAttemptId = () => `space-device-${++attempts}-${Date.now().toString(36)}-${Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')}`;

// A boolean exposed by the adapter is recorded with its source; anything else is unavailable.
function observedFallback(adapter, info) {
  if (typeof info?.isFallbackAdapter === 'boolean') return Object.freeze({ value: info.isFallbackAdapter, source: 'adapter.info' });
  if (typeof adapter?.isFallbackAdapter === 'boolean') return Object.freeze({ value: adapter.isFallbackAdapter, source: 'adapter' });
  return UNAVAILABLE;
}
const observedLimit = value => (Number.isFinite(value) ? value : UNAVAILABLE);

// One requestAdapter per attempt; adapter.info read on that retained adapter before requestDevice;
// device.lost observed before returning and never awaited. Resolves
// { device, adapter, attemptId, identity, isFallbackAdapter, features, limits }.
export async function acquireDevice({ gpu = globalThis.navigator?.gpu, powerPreference = 'high-performance', optionalFeatures = DEFAULT_OPTIONAL_FEATURES, onLost } = {}) {
  if (!gpu || typeof gpu.requestAdapter !== 'function') throw new DeviceError('no-webgpu', 'navigator.gpu is unavailable in this browser');
  if (onLost !== undefined && typeof onLost !== 'function') throw new TypeError('onLost must be a function');
  const attemptId = freshAttemptId();
  const adapter = await gpu.requestAdapter({ powerPreference });
  if (!adapter) throw new DeviceError('no-adapter', `requestAdapter(${powerPreference}) returned null`);
  const info = adapter.info;
  const identity = Object.freeze(Object.fromEntries(IDENTITY_FIELDS.map(field => [field, observed(info?.[field], 'adapter.info')])));
  const isFallbackAdapter = observedFallback(adapter, info);
  const available = [...(adapter.features ?? [])].sort();
  const requested = [...optionalFeatures];
  const granted = requested.filter(feature => adapter.features?.has(feature));
  let device;
  try { device = await adapter.requestDevice({ requiredFeatures: granted, label: attemptId }); }
  catch (error) { throw new DeviceError('device-refused', `requestDevice refused: ${error?.message ?? error}`, { cause: error }); }
  if (!device) throw new DeviceError('device-refused', 'requestDevice returned no device');
  const limits = Object.freeze(Object.fromEntries(RECORDED_LIMITS.map(key => [key, observedLimit(device.limits?.[key])])));
  // Attached immediately after acquisition, never awaited; the attempt identifies which device was lost.
  Promise.resolve(device.lost).then(lost => { onLost?.({ attemptId, reason: lost?.reason ?? 'unknown', message: lost?.message ?? '' }); }, () => {});
  return {
    device, adapter, attemptId, identity, isFallbackAdapter,
    features: Object.freeze({ requested: Object.freeze(requested), granted: Object.freeze(granted), available: Object.freeze(available), timestampQuery: granted.includes('timestamp-query') }),
    limits,
  };
}
