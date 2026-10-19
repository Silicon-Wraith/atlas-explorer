// spikes/project0/browser/integrity-preflight.js — the browser part of the integrity preflight (T9 fix round 2, Codex T9 r2; a prerequisite of
// the GPU campaign). Real Chrome, the real #view canvas and its real property setters; no GPU adapter or device is ever requested. It returns the
// observer's raw results; Node (integrity-preflight.mjs) judges them, fail-closed.
import { observeIntegrity } from './integrity.js';
const settle = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));   // past a frame and its mutation delivery
export async function runIntegrityPreflight() {
  const canvas = document.getElementById('view');
  // 1. a resize and its restore within one task: invisible to any animation-frame check
  let watch = observeIntegrity(canvas);
  canvas.width = 800; canvas.width = 1280;
  await settle();
  const sameTaskRevert = watch.stop();
  // 2. a mutation still undelivered when stop() is called at once
  watch = observeIntegrity(canvas);
  canvas.width = 640;
  const undeliveredAtStop = watch.stop();
  canvas.width = 1280; await settle();
  // 3. G12's deliberate resizes between allowed sizes
  watch = observeIntegrity(canvas, { allowedBacking: [[1280, 720], [1920, 1080], [960, 540]] });
  for (const size of [[1920, 1080], [960, 540], [1280, 720]]) { watch.resize(size); await settle(); }
  const allowedResizes = watch.stop();
  return { slots: [{ slot: 'integrity', raw: { sameTaskRevert, undeliveredAtStop, allowedResizes, transport: typeof window.p0Push === 'function' ? 'p0Push' : 'none',
    state: { visibility: document.visibilityState, focused: document.hasFocus(), devicePixelRatio, backing: [canvas.width, canvas.height], gpuRequested: false } } }], invalidations: [] };
}
