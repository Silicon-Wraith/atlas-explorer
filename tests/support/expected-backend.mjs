// Expected-backend bookkeeping for every GPU drain (plan amendment H carry-forward, T08). A suite
// declares the backend each page was opened on; every drain of that page — teardown, an early
// close, a reload, a timing measurement — then has to find that backend on the device, drain to
// `complete` (WebGL) or `no-webgl` (CPU), and leave the device epoch and state unchanged. A GPU page
// that silently became CPU-backed, or lost its context, fails here instead of passing as `no-webgl`.
import { LIMITS, drainGpuWithin, ev } from './bounded.mjs';

const backends = new WeakMap();

export function expectBackend(page, backend) {
  if (backend !== 'webgl' && backend !== 'cpu') throw new RangeError(`unknown backend ${backend}`);
  backends.set(page, backend);
  return page;
}
export const expectedBackend = page => backends.get(page) ?? 'webgl';

export async function drainExpecting(page, ms = LIMITS.deep) {
  const expected = expectedBackend(page);
  const device = () => ev(page, () => globalThis.atlas?.device ?? null, undefined, 'device snapshot');
  const before = await device();
  const result = await drainGpuWithin(page, ms);
  const after = await device();
  if (!before || !after) throw new Error(`drain GPU work: the page exposes no atlas.device (${JSON.stringify({ before, after })})`);
  if (before.backend !== expected || after.backend !== expected) throw new Error(`drain GPU work: page expected a ${expected} backend; the device reports ${before.backend} then ${after.backend}`);
  if (result.status !== (expected === 'webgl' ? 'complete' : 'no-webgl')) throw new Error(`drain GPU work: a ${expected} page drained to ${result.status}`);
  if (before.deviceEpoch !== after.deviceEpoch || after.state !== 'ready') throw new Error(`drain GPU work: the device changed during the drain: ${JSON.stringify({ before, after })}`);
  return result;
}
