// CPU-testable lifecycle checks used by the headed Space harness.
import assert from 'node:assert/strict';
import { LIMITS, ev, drainGpuWithin } from './bounded.mjs';

const backends = new WeakMap();
export const expectBackend = (page, backend) => { if (!['webgl', 'none'].includes(backend)) throw new RangeError(`unknown backend ${backend}`); backends.set(page, backend); return page; };
export async function drainExpecting(page, ms = LIMITS.deep) {
  // Ladder isolation intentionally replaces the app with about:blank. This is
  // the only URL exception; real application pages retain their declared backend.
  const expected = page.url?.() === 'about:blank' ? 'none' : backends.get(page) ?? 'webgl';
  const snapshot = () => ev(page, () => {
    const gl = globalThis.atlas?.renderer?.gl ?? null;
    return { acceleration: globalThis.atlas?.graphics?.acceleration ?? null, contextLost: gl ? gl.isContextLost() : null };
  }, undefined, 'backend snapshot');
  const before = await snapshot();
  const result = await drainGpuWithin(page, ms);
  const after = await snapshot();
  if (expected === 'webgl') {
    if (before.acceleration !== 'hardware' || after.acceleration !== 'hardware') throw new Error(`drain GPU work: page expected a hardware WebGL backend; the renderer reports ${before.acceleration} then ${after.acceleration}`);
    if (result.status !== 'complete') throw new Error(`drain GPU work: a webgl page drained to ${result.status}`);
    if (after.contextLost) throw new Error('drain GPU work: the WebGL context was lost during the drain');
  } else if (result.status !== 'no-webgl') throw new Error(`drain GPU work: a page without WebGL drained to ${result.status}`);
  return result;
}

export function assertStatusAfterTicket(fourK) {
  assert.equal(fourK.afterTicket.tracked, fourK.trackedAtAllocation, 'idle status remains tracked after ticket retirement');
  assert.equal(fourK.afterTicket.retiring, 0);
  assert.equal(fourK.afterTicket.statusPresent, true);
  assert.equal(fourK.afterTicket.status.state, 'pooled');
  for (const hold of ['tickets', 'mappings', 'owners']) assert.equal(fourK.afterTicket.status[hold], 0, hold);
  assert.ok(fourK.afterTicket.idleBytes <= 256 * 2 ** 20, 'idle pool byte bound');
  assert.ok(fourK.afterTicket.peak <= 2 ** 30, 'peak concurrent tracked includes idle pool');
}
