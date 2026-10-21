// spikes/project0/browser/drivers/visible.js — visible-output evidence outside measured windows (not a gate). For each view it
// classifies the storage display texture, then asks Node to screenshot the *presented* #view canvas (window.p0Capture handshake).
import { session, renderOnce, sleep, failure, harnessTimeout } from './common.js';
import { dispatchOnce, mapWithin, MAP_DEADLINE_MS } from '../../gpu/webgpu.js';
import { CORRECTNESS_ONLY } from '../../timing-contract.js';   // visible-output evidence: no timing measurement

export function classifyRgba(rgba) {
  const c = { background: 0, unresolved: 0, failure: 0, unavailableNormal: 0, shaded: 0 };
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    if (r === 255 && g === 0 && b === 255) c.unresolved++; else if (r === 255 && g === 0 && b === 0) c.failure++;
    else if (r === 128 && g === 128 && b === 128) c.unavailableNormal++; else if (r <= 6 && g <= 6 && b <= 8) c.background++; else c.shaded++;
  }
  return c;
}
export async function storageCapture(s, { mapDeadlineMs = MAP_DEADLINE_MS } = {}) {
  const { device, renderer } = s, t = renderer.targets, bytesPerRow = Math.ceil(t.W * 4 / 256) * 256;
  const buf = s.alloc.buffer(device, { size: bytesPerRow * t.H, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  try {
    await dispatchOnce(device, s.watchdog, s.abort, enc => enc.copyTextureToBuffer({ texture: t.display }, { buffer: buf, bytesPerRow }, [t.W, t.H]), 'visible-capture');
    await mapWithin(buf, s.abort, mapDeadlineMs); const src = new Uint8Array(buf.getMappedRange().slice(0)); buf.unmap();
    const rgba = new Uint8ClampedArray(t.W * t.H * 4); for (let y = 0; y < t.H; y++) rgba.set(src.subarray(y * bytesPerRow, y * bytesPerRow + t.W * 4), y * t.W * 4);
    return { W: t.W, H: t.H, classes: classifyRgba(rgba) };
  } finally { buf.destroy(); }
}
// T9 fix round 1 (Codex T9 r1, finding 1): the request goes through Node's binding (window.p0Push, installed before navigation) and Node's reply
// is the acknowledgement, so Node never evaluates in the page. Bounded, and raced against the session abort.
export async function presentedCapture(s, name, seq, { timeoutMs = 20000 } = {}) {
  if (typeof window.p0Push !== 'function') throw harnessTimeout(s.abort, 'no presented-capture transport (window.p0Push is not installed)');
  let timer;
  const expired = new Promise((_, reject) => { timer = setTimeout(() => reject(harnessTimeout(s.abort, `presented capture ${name} was not acknowledged within ${timeoutMs} ms`)), timeoutMs); });
  try {
    const ack = await s.abort.race(Promise.race([window.p0Push({ type: 'capture', seq, name }), expired]));
    if (ack !== seq) throw harnessTimeout(s.abort, `presented capture ${name} was refused by the runner`);
  } finally { clearTimeout(timer); }
}
export async function run(gate, fx, params, status) {
  let s = null; const out = {};
  try {
    s = await session(fx, status); let seq = 0;
    for (const [view, profile] of [['sphere', 'draft'], ['bulb-overview', 'draft'], ['bulb-stress', 'stress']]) {
      const frame = await renderOnce(s.renderer, { view, profile });
      out[view] = { counts: frame.counts, storage: await storageCapture(s) };
      await s.abort.race(sleep(100));                                                // let the compositor present the blit
      await presentedCapture(s, view, ++seq);
    }
    s.abort.throwIfAborted();                                                        // a stop latched during the last capture is the experiment's error
    return { slots: [{ slot: 'captures', raw: { out }, timingMethod: CORRECTNESS_ONLY }], invalidations: [] };
  } catch (error) { return { slots: [{ slot: 'captures', raw: { out, error: failure(s, error) }, timingMethod: CORRECTNESS_ONLY }], invalidations: [failure(s, error)] }; }
  finally { s?.close(); }
}
