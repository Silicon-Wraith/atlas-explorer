// spikes/project0/gpu/device.js — the only module that requests an adapter or device.
const state = { device: null, epoch: 0, handlers: new Set(), acquisitions: [] };
// G1-A §3.5: every acquisition of this document, with its requested, available and granted features (the driver registry returns it).
export const acquisitionLog = () => state.acquisitions.map(a => ({ ...a, requestedFeatures: [...a.requestedFeatures], features: [...a.features], grantedFeatures: [...a.grantedFeatures] }));
export const currentEpoch = () => state.epoch;
export function onLoss(handler) { state.handlers.add(handler); return () => state.handlers.delete(handler); }

// Real and injected losses take the same path. The epoch advances *first*, so every completion still in
// flight already belongs to a retired epoch by the time any listener — or any late callback — runs.
function signalLoss({ reason, message = '', injected }) {
  const lostEpoch = state.epoch;
  state.epoch++;
  for (const handler of [...state.handlers]) handler({ epoch: lostEpoch, reason, message, injected });
}

// `cancelled` lets the caller withdraw the acquisition (timeout, abort): a late adapter then requests no device, and a late device is
// destroyed before it can become current or advance the epoch.
// G1-A (WebGPU remediation prereg rev 2 §3.1-§3.2): the extended adapter information, snapshotted from the exact GPUAdapter that creates the
// device. An absent property is recorded as absent; nothing is substituted from another diagnostic.
export const INFO_FIELDS = Object.freeze(['vendor', 'architecture', 'device', 'description', 'isFallbackAdapter', 'driver', 'backend', 'type', 'vkDriverVersion']);
export function snapshotInfo(info) {
  const present = {}, absent = [];
  for (const k of INFO_FIELDS) { const v = info?.[k]; if (v === undefined || v === null) absent.push(k); else present[k] = v; }
  return { present, absent };
}
export async function acquire({ requiredFeatures = [], cancelled = () => false } = {}) {
  if (!('gpu' in navigator)) throw Object.assign(new Error('navigator.gpu is absent'), { code: 'no-api' });
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw Object.assign(new Error('requestAdapter returned null'), { code: 'no-adapter' });
  if (cancelled()) throw Object.assign(new Error('acquisition cancelled before requestDevice'), { code: 'cancelled' });
  const before = snapshotInfo(adapter.info);                 // before requestDevice, on the same retained adapter (never a second requestAdapter)
  const granted = requiredFeatures.filter(f => adapter.features.has(f));
  const device = await adapter.requestDevice({ requiredFeatures: granted });
  if (cancelled()) { device.destroy(); throw Object.assign(new Error('acquisition cancelled; late device destroyed'), { code: 'cancelled' }); }
  const epoch = ++state.epoch;
  state.device = device;
  device.lost.then(info => { if (epoch === state.epoch) signalLoss({ reason: info.reason, message: info.message, injected: false }); });
  device.addEventListener('uncapturederror', event => console.error(`uncapturederror: ${event.error.message}`));
  const i = adapter.info;
  const fallbackSource = 'isFallbackAdapter' in i ? 'adapter.info.isFallbackAdapter' : 'isFallbackAdapter' in adapter ? 'adapter.isFallbackAdapter' : 'not exposed';
  const isFallbackAdapter = fallbackSource === 'not exposed' ? null : Boolean(fallbackSource === 'adapter.info.isFallbackAdapter' ? i.isFallbackAdapter : adapter.isFallbackAdapter);
  const limits = Object.fromEntries(['maxComputeWorkgroupSizeX', 'maxStorageBufferBindingSize', 'maxBufferSize', 'maxTextureDimension2D', 'maxComputeInvocationsPerWorkgroup'].map(k => [k, device.limits[k]]));
  const identity = { before, after: snapshotInfo(i), deviceAdapterInfo: device.adapterInfo ? snapshotInfo(device.adapterInfo) : null };
  state.acquisitions.push({ epoch, requestedFeatures: [...requiredFeatures], features: [...adapter.features].sort(), grantedFeatures: [...granted] });
  return { adapter, device, epoch, info: { vendor: i.vendor ?? '', architecture: i.architecture ?? '', device: i.device ?? '', description: i.description ?? '', isFallbackAdapter, fallbackSource, features: [...adapter.features].sort(), requestedFeatures: [...requiredFeatures], grantedFeatures: granted, limits, identity } };
}

export function injectLoss() {                     // G13: an unexpected-loss notification through the recovery path
  const device = state.device; state.device = null;
  signalLoss({ reason: 'unknown', message: 'injected by G13', injected: true });
  device?.destroy();
}

export function destroy() {                        // intentional teardown: retire the epoch, then destroy
  const device = state.device; state.device = null;
  state.epoch++;
  device?.destroy();
}
