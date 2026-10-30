import { createResourceLease } from './lifecycle.js';
import { representationKey } from './contract.js';
import { observeWasmInitialization } from './wasm-memory.js';

const vec = a => ({ x: a[0], y: a[1], z: a[2] });
const rotation = { x: 0, y: 0, z: 0, w: 1 };
export async function createBrowserPreparer({ renderer, workerUrl, loadPhysics, onEvent = () => {} }) {
  if (!workerUrl || typeof loadPhysics !== 'function') throw new TypeError('Explicit collision worker and physics loader required');
  let engine, capacity, initialization;
  async function rapier() {
    initialization ??= (async () => { engine = await loadPhysics(); capacity = await observeWasmInitialization(() => engine.init()); })();
    await initialization; return engine;
  }
  const worker = new Worker(workerUrl, { type: 'module' });
  const pending = new Map(); let nextId = 0, closed = false, workerCapacity = 0, resolveReady, rejectReady;
  const ready = new Promise((r, j) => { resolveReady = r; rejectReady = j; });
  worker.onmessage = ({ data }) => {
    if (data.type === 'ready') { resolveReady(); return; }
    const job = pending.get(data.id); if (!job) return; pending.delete(data.id); clearTimeout(job.timer);
    workerCapacity = Math.max(workerCapacity, data.wasmCapacity ?? 0);
    data.error ? job.reject(new Error(data.error)) : job.resolve(data);
  };
  worker.onerror = event => { const error = new Error(event.message); rejectReady(error); for (const job of pending.values()) { clearTimeout(job.timer); job.reject(error); } pending.clear(); };
  let startup;
  try { await Promise.race([ready, new Promise((_, reject) => { startup = setTimeout(() => reject(new Error('Collision worker startup deadline')), 10000); })]); }
  catch (error) { worker.terminate(); throw error; } finally { clearTimeout(startup); }
  function build(artifact, buffers) {
    if (closed) return Promise.reject(new Error('Browser preparer closed'));
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { reject(new Error('Browser indexing deadline; worker owns unfinished job')); }, 20000);
      pending.set(id, { resolve, reject, timer });
      const data = { id, intent: artifact.intent, classification: artifact.classification, vertices: buffers.vertices, indices: buffers['surface-indices'], solid: buffers['solid-indices'] };
      try { worker.postMessage(data, Object.values(buffers)); }
      catch (error) { pending.delete(id); clearTimeout(timer); reject(error); }
    });
  }
  async function prepare(artifact, buffers, signal) {
    let surface, solid, collider, gpu;
    try {
      const built = await build(artifact, buffers);
      if (signal.aborted) throw new Error('Preparation cancelled before consumer publication');
      const restoreBegin = performance.now(); let restoreMs = 0, warmupMs = 0;
      if (artifact.intent === 'interaction' && artifact.classification === 'surface') {
        const R = await rapier();
        surface = R.World.restoreSnapshot(new Uint8Array(built.surfaceSnapshot));
        solid = R.World.restoreSnapshot(new Uint8Array(built.solidSnapshot)); collider = solid.getCollider(built.handle);
        if (!surface || !solid || !collider) throw new Error('Prepared collision restore failed');
        restoreMs = performance.now() - restoreBegin;
        const warm = performance.now();
        if (!surface.projectPoint(vec([0, 0, 0]), false)) throw new Error('Surface collision data unavailable after restore');
        collider.containsPoint(vec([0, 0, 0]));
        surface.castShape(vec([0, 0, 0]), rotation, vec([1e-6, 0, 0]), new R.Ball(.5), 0, 1, true);
        warmupMs = performance.now() - warm;
      } else if (built.surfaceSnapshot || built.solidSnapshot) throw new Error('Unexpected collision snapshots for view/constant occupancy');
      const uploadBegin = performance.now(); gpu = await renderer.upload(artifact, new Float32Array(built.expanded));
      const key = representationKey(artifact), value = { artifact, gpu, surface, solid, collider, key, shape: surface ? new engine.Ball(.5) : null, castQueries: 0 };
      const timings = { workerBegin: built.begin, workerEnd: built.end, normalsMs: built.normalsMs, collisionMs: built.collisionMs, restoreMs, warmupMs, uploadMs: performance.now() - uploadBegin,
        workerWasmCapacity: workerCapacity, mainWasmCapacity: capacity?.bytes() ?? 0, gpuBytes: gpu.bytes,
        snapshotBytes: (built.surfaceSnapshot?.byteLength ?? 0) + (built.solidSnapshot?.byteLength ?? 0) };
      onEvent({ type: 'consumer-prepared', time: performance.timeOrigin + performance.now(), representationKey: key, intent: artifact.intent, classification: artifact.classification, timings });
      return { renderRevision: key, collisionRevision: artifact.intent === 'view' ? null : key, collisionKind: artifact.intent === 'view' ? null : artifact.classification,
        // GPU bytes are exact here; WASM capacity is reported separately.
        lease: createResourceLease({ owner: 'browser-region', bytes: gpu.bytes }, value, async region => {
          try { await renderer.retire(region.gpu); }
          finally { region.surface?.free(); region.solid?.free(); }
        }) };
    } catch (error) {
      try { if (gpu) await renderer.retire(gpu); }
      finally { surface?.free(); solid?.free(); }
      throw error;
    }
  }
  return Object.freeze({ prepare,
    capacity: () => ({ workerWasmCapacity: workerCapacity, mainWasmCapacity: capacity?.bytes() ?? 0, workerJobs: pending.size }),
    close() {
      if (closed) return; closed = true;
      for (const job of pending.values()) { clearTimeout(job.timer); job.reject(new Error('Browser preparer terminated')); }
      pending.clear(); worker.terminate();
    },
  });
}
