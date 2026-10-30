import { createResourceLease } from './lifecycle.js';
import { assertResultForRequest } from './contract.js';

const epoch = () => performance.timeOrigin + performance.now();
export function createBrowserProducer({ onEvent = () => {} } = {}) {
  let livePayloadBytes = 0, peakPayloadBytes = 0, releases = 0;
  async function retire(token) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 5000);
    try {
      const r = await fetch('/pc2/retire/' + token, { method: 'POST', signal: controller.signal });
      if (!r.ok) throw new Error('Producer retirement failed');
    } finally { clearTimeout(timer); }
  }
  async function produce(request, signal) {
    const controller = new AbortController(), abort = () => controller.abort(), timer = setTimeout(abort, 130000);
    signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
    let token, buffers = {};
    try {
      const response = await fetch('/pc2/prepare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: controller.signal });
      const output = await response.json(); if (!response.ok) throw new Error(output.error ?? 'Native request failed');
      token = output.token;
      const result = assertResultForRequest(output.result, request);
      if (result.status !== 'prepared') { if (token) await retire(token); return { result, payload: null }; }
      if (typeof token !== 'string') throw new Error('Missing producer publication');
      await Promise.all(result.artifact.buffers.map(async descriptor => {
        const r = await fetch('/pc2/buffer/' + token + '/' + descriptor.role, { signal: controller.signal });
        if (!r.ok) throw new Error('Prepared buffer transfer failed');
        const bytes = await r.arrayBuffer();
        const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
        if (bytes.byteLength !== descriptor.byteLength || digest !== descriptor.sha256) throw new Error('Prepared buffer length/digest mismatch');
        buffers[descriptor.role] = bytes;
      }));
      const bytes = Object.values(buffers).reduce((sum, b) => sum + b.byteLength, 0);
      livePayloadBytes += bytes; peakPayloadBytes = Math.max(peakPayloadBytes, livePayloadBytes);
      onEvent({ type: 'transfer-ready', time: epoch(), requestId: request.identity.requestId, token, bytes, native: output.native, cacheHit: output.cacheHit });
      const owned = buffers; buffers = null;
      return { result, payload: createResourceLease({ owner: 'browser-transfer', bytes }, owned, async value => {
        // Some buffers have transferred to the collision worker by this point.
        // This counter is lease credit, not an allocator/live-array measurement.
        for (const key of Object.keys(value)) delete value[key]; livePayloadBytes -= bytes; releases++;
        await retire(token);
      }) };
    } catch (error) {
      if (token) await retire(token);
      else {
        const cancellation = new AbortController(), deadline = setTimeout(() => cancellation.abort(), 5000);
        try { const response = await fetch('/pc2/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request.identity), signal: cancellation.signal }); if (!response.ok) throw new Error('Request-identity retirement failed'); }
        finally { clearTimeout(deadline); }
      }
      throw error;
    } finally { signal.removeEventListener('abort', abort); clearTimeout(timer); }
  }
  return Object.freeze({ produce, snapshot: () => ({ livePayloadLeaseBytes: livePayloadBytes, peakPayloadLeaseBytes: peakPayloadBytes, releases }) });
}
