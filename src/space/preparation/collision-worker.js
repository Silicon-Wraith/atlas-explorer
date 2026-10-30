import { expandTriangles } from './mesh-normals.js';
import { initializeObservedWasm } from './wasm-memory.js';

export function installCollisionWorker({ loadPhysics }) {
  if (typeof loadPhysics !== 'function') throw new TypeError('Explicit physics loader required');
  let engine, capacity, initialization, chain = Promise.resolve();
  async function rapier() {
    initialization ??= (async () => {
      engine = await loadPhysics();
      capacity = await initializeObservedWasm(engine);
    })();
    await initialization; return engine;
  }
  const ownedBuffer = bytes => bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer;

  async function build(data) {
    let surface, solid;
    const begin = performance.timeOrigin + performance.now();
    try {
      const vertices = new Float32Array(data.vertices), indices = new Uint32Array(data.indices);
      const normalsBegin = performance.now(), expanded = expandTriangles(vertices, indices), normalsMs = performance.now() - normalsBegin;
      let surfaceSnapshot = null, solidSnapshot = null, handle = null, collisionMs = 0;
      if (data.intent === 'interaction' && data.classification === 'surface') {
        const R = await rapier(), start = performance.now();
        surface = new R.World({ x: 0, y: 0, z: 0 });
        surface.createCollider(R.ColliderDesc.trimesh(vertices, indices, R.TriMeshFlags.FIX_INTERNAL_EDGES)); surface.step();
        solid = new R.World({ x: 0, y: 0, z: 0 });
        handle = solid.createCollider(R.ColliderDesc.trimesh(vertices, new Uint32Array(data.solid), R.TriMeshFlags.ORIENTED)).handle; solid.step();
        surfaceSnapshot = ownedBuffer(surface.takeSnapshot()); solidSnapshot = ownedBuffer(solid.takeSnapshot()); collisionMs = performance.now() - start;
      } else if (!['view', 'interaction'].includes(data.intent) || !['surface', 'empty-air', 'full-solid'].includes(data.classification)) throw new Error('Invalid preparation intent/classification');
      const transfer = [expanded.buffer, ...[surfaceSnapshot, solidSnapshot].filter(Boolean)];
      // The two temporary worlds are freed before acknowledging completion.
      surface?.free(); surface = null; solid?.free(); solid = null;
      self.postMessage({ id: data.id, expanded: expanded.buffer, surfaceSnapshot, solidSnapshot, handle,
        begin, end: performance.timeOrigin + performance.now(), normalsMs, collisionMs, wasmCapacity: capacity?.bytes() ?? 0 }, transfer);
    } catch (error) { self.postMessage({ id: data.id, error: error.stack ?? String(error) }); }
    finally { surface?.free(); solid?.free(); }
  }
  self.onmessage = ({ data }) => { chain = chain.then(() => build(data)); };
  self.postMessage({ type: 'ready' });
}
