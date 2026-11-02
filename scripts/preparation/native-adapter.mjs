import { GENERATION_BUNDLE, verifyGenerationBundle } from '../generation/config.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { canonicalJson, fnv1a64 } from '../../src/shared/scene.js';
import { createWorldRecord, worldReference, createPreparationRequest, createPreparedArtifact, createPreparationResult, assertResultForRequest, containsBounds, representationKey } from '../../src/space/preparation/contract.js';
import { createSpatialGrid } from '../../src/space/preparation/spatial-grid.js';
import { createNativeController } from './native-controller.mjs';
import { createNativeQueue } from './native-queue.mjs';
import { createPublications } from './publications.mjs';

const digest = data => createHash('sha256').update(data).digest('hex');
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const ensure = (value, reason) => { if (!value) throw new Error(reason); };
const cubeBounds = (origin, half) => ({ min: origin.map(x => x - half), max: origin.map(x => x + half) });
const sortedSources = hello => [...hello.sources].sort((a, b) => a.role < b.role ? -1 : a.role > b.role ? 1 : 0);
export const nativeSourcesKey = hello => fnv1a64(canonicalJson({ sources: sortedSources(hello), packages: hello.packages }));

export function nativeArtifact(raw, { hello, world, certificate, qualification = false }) {
  ensure(raw.status === 'prepared', 'native artifact is not prepared');
  const m = raw.meta, kind = raw.kind;
  ensure(m.sourceUnknown === 0 && m.closedEdgePairs === true && m.manifoldStatus === 'NoError', 'native structural admission failed');
  const expected = { cells: 256, stepM: m.diameter / 256, tileWidthM: m.diameter, rtinToleranceM: .001 * m.diameter, coordinateType: 'float32-local-metres-per-unit' };
  ensure(same(m.sampling, expected), 'actual native sampling policy differs from declared policy');
  ensure(m.denseValidation === false, 'runtime policy requires explicit offline dense validation');
  const policy = certificate?.policies?.[kind];
  if (!qualification) {
    ensure(certificate?.sourcesKey === nativeSourcesKey(hello) && policy?.qualifiedSpecimens > 0 && same(policy.sampling, m.sampling), 'unqualified native source/policy');
  }
  const source = sortedSources(hello), parent = source.find(s => ['parent-reference-r0.npz','regression-world/prepared-layers-r0/parent-reference-r0.npz'].includes(s.role));
  if (kind === 'fine') ensure(parent, 'fine parent dependency missing');
  return createPreparedArtifact({ schema: 'atlas.preparation.artifact', schemaVersion: 1, world: worldReference(world),
    bounds: cubeBounds(m.origin, m.half_extent), transform: { originM: m.origin, metresPerUnit: m.diameter }, intent: kind === 'view' ? 'view' : 'interaction',
    classification: m.classification, classificationBasis: { kind: 'constructed-approximation', method: 'native-composed-volume-and-paired-closed-edges', evidenceId: 'sha256:' + digest(canonicalJson(m)), volumeM3: m.volumeM3 },
    qualification: { kind: 'empirical', toleranceM: .01 * m.diameter, referenceSamples: 0, meshSamples: 0, denseValidation: false,
      evidenceId: qualification ? 'PC2/preflight-pending' : certificate.evidenceId,
      limits: [qualification ? 'Preflight instance awaiting independent sampling; not admitted for flight.' : `Runtime instance not individually sampled at admission; policy qualified on ${policy.qualifiedSpecimens} ${kind} representations.`, 'Declared approximation target with finite evidence, not an everywhere error bound.'] },
    representation: { builder: { id: 'pc2-native-' + kind, version: 'r0/' + fnv1a64(canonicalJson(hello.packages)), sourceDigests: source },
      sampling: m.sampling, dependencies: kind === 'fine' ? [{ role: 'retained-parent-reference', sha256: parent.sha256 }] : [], features: world.lineage.map(f => f.id) },
    buffers: raw.buffers.filter(b => kind !== 'view' || b.role !== 'solid-indices').map(({ role, byteLength, sha256 }) => ({ role, byteLength, sha256 })),
  });
}

export async function createNativeAdapter({ bundle = GENERATION_BUNDLE, runRoot, python, onEvent = () => {}, onController = () => {} }) {
  bundle = path.resolve(bundle); runRoot = path.resolve(runRoot);
  const verifiedGeneration = await verifyGenerationBundle({bundle});
  ensure(runRoot.startsWith('/mnt/ml_storage/scratch/'), 'native outputs must be under scratch');
  const output = path.join(runRoot, 'native');
  let stopped = false, terminal = null;
  const controller = createNativeController({ bundle, output, python, onEvent: event => {
    if (event.type === 'worker-exit' && !stopped) terminal = Object.assign(new Error('Native preparation stopped. Save your scene and restart ATLAS.'), { code: 'preparer-lost' });
    onEvent(event);
  } });
  let hello, world, grid, D, viewGrid, fineOrigin, fineBounds;
  try {
    onController(controller);
    hello = await controller.ready; world = createWorldRecord(hello.definition); grid = createSpatialGrid(hello.grid); D = grid.config.diameter;
    ensure(world.id === 'H1C-surface-child@ee2564d40bda7ef6', 'canonical world mismatch');
    const binding=hello.recursiveRecipe;
    ensure(binding&&same(Object.fromEntries(Object.keys(verifiedGeneration.recursiveRecipe).map(k=>[k,binding[k]])),verifiedGeneration.recursiveRecipe)&&binding.actualProjectionDigest===binding.projectionDigest&&binding.legacyDefinitionKey===world.definitionKey,'native recipe compatibility mismatch');
    viewGrid = createSpatialGrid({ ...hello.grid, diameter: 4 * D, domain: [[-1, 3], [-1, 1], [-1, 1]] });
    fineOrigin = hello.approach.fine_origin; fineBounds = cubeBounds(fineOrigin, hello.approach.fine_half_extent_m);
    ensure(containsBounds(grid.bounds([0, 0, 0]), fineBounds), 'fine dependency not enclosed by canonical home');
  } catch (error) { await controller.close(); throw error; }
  const cache = new Map(), records = [];
  const publications = createPublications({ onRetire(publication, token) {
    if (![...publications.values()].some(p => p.cacheKey === publication.cacheKey)) cache.delete(publication.cacheKey);
    onEvent({ type: 'producer-retired', time: Date.now(), token, identity: publication.identity });
  } });
  let certificate = null, totalOutputBytes = 0;
  function remember(raw, key) {
    records.push(raw); totalOutputBytes += raw.outputBytes ?? 0;
    ensure(totalOutputBytes <= 4 * 2 ** 30, 'native output quota exceeded');
    if (raw.status === 'prepared') {
      cache.delete(key); cache.set(key, raw); while (cache.size > 4) cache.delete(cache.keys().next().value);
    }
  }
  const queue = createNativeQueue({
    dispatch: async job => { const raw = await controller.run(job); remember(raw, job.cacheKey); return raw; },
    onEvent: event => onEvent({ ...event, time: Date.now() }),
  });
  function actualProducer() { return controller.hello().producer; }
  function resolveRequest(q) {
    if (!same(q.world, worldReference(world))) return null;
    const extent = q.bounds.max.map((x, i) => x - q.bounds.min[i]);
    if (Math.max(...extent) - Math.min(...extent) > Math.max(...extent) * 1e-9) return null;
    const midpoint = q.bounds.min.map((x, i) => x + extent[i] / 2);
    if (q.intent === 'interaction' && q.requirements.bodyDiameterM === D / 4) return containsBounds(fineBounds, q.bounds) ? { kind: 'fine', originM: fineOrigin, address: [0, 0, 0] } : null;
    if (q.intent === 'interaction' && q.requirements.bodyDiameterM !== D) return null;
    const g = q.intent === 'view' ? viewGrid : grid, kind = q.intent === 'view' ? 'view' : 'coarse';
    const nearest = g.nearest(midpoint);
    const candidates = nearest ? [nearest, ...g.covering(midpoint, midpoint, 0)] : g.covering(midpoint, midpoint, 0);
    const address = candidates.find(a => containsBounds(g.bounds(a), q.bounds));
    return address ? { kind, address, originM: g.center(address) } : null;
  }
  function resultFor(q, status, reason, artifact = null) {
    return createPreparationResult({ schema: 'atlas.preparation.result', schemaVersion: 1, identity: q.identity, producer: actualProducer(), status, reason, artifact });
  }
  async function prepare(input, { signal, qualification = false, rebuild = false } = {}) {
    if (terminal) throw terminal;
    const q = createPreparationRequest(input);
    ensure(!stopped && same(q.producer, actualProducer()), 'preparer closed or stale producer');
    const selected = resolveRequest(q);
    if (!selected || q.requirements.maxErrorM < .01 * (selected.kind === 'fine' ? D / 4 : selected.kind === 'view' ? 4 * D : D)) return { result: resultFor(q, 'unsupported', 'Unsupported world, coverage, body or declared accuracy'), token: null };
    if (signal?.aborted || publications.cancelled(q.identity)) throw Object.assign(new Error('Native request cancelled before admission'), { name: 'AbortError' });
    if (publications.size() >= 16) return { result: resultFor(q, 'unsupported', 'Producer publication capacity'), token: null };
    const key = canonicalJson({ ...selected, sources: nativeSourcesKey(hello) });
    let raw = !rebuild && cache.get(key), cacheHit = !!raw;
    try {
      if (!raw) raw = await queue.submit({ ...selected, identity: q.identity, producer: q.producer, cacheKey: key }, signal);
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      if (error.code === 'capacity') return { result: resultFor(q, 'unsupported', 'Native queue capacity; retry after deferral'), token: null };
      throw error;
    }
    if (raw.status !== 'prepared') return { result: resultFor(q, raw.status, raw.reason), token: null };
    if (terminal) throw terminal;
    const artifact = nativeArtifact(raw, { hello, world, certificate, qualification });
    const result = assertResultForRequest(resultFor(q, 'prepared', null, artifact), q);
    if (signal?.aborted || publications.cancelled(q.identity)) throw Object.assign(new Error('Native request cancelled before publication'), { name: 'AbortError' });
    const token = randomUUID(); publications.publish(token, { artifact, raw, cacheKey: key, identity: q.identity });
    onEvent({ type: 'producer-prepared', time: Date.now(), identity: q.identity, kind: selected.kind, address: selected.address,
      representationKey: representationKey(artifact), token, cacheHit, timings: raw.timings, fieldCalls: raw.fieldCalls, fieldPoints: raw.fieldPoints });
    return { result, token, cacheHit, native: { timings: raw.timings, fieldCalls: raw.fieldCalls, fieldPoints: raw.fieldPoints, caches: raw.caches, interactionCacheEvictions: raw.interactionCacheEvictions } };
  }
  return Object.freeze({ world, grid, viewGrid, fineBounds, prepare, producer: actualProducer, records,
    hello: () => ({ ...controller.hello(), definition: world, certificate }),
    installCertificate(value) { ensure(value.sourcesKey === nativeSourcesKey(hello), 'certificate source mismatch'); certificate = value; },
    async buffer(token, role) {
      if (terminal) throw terminal;
      const publication = publications.get(token); ensure(publication, 'retired publication');
      const descriptor = publication.artifact.buffers.find(b => b.role === role); ensure(descriptor, 'buffer role not allowed for intent');
      const source = publication.raw.buffers.find(b => b.role === role); ensure(source.file.startsWith(output + path.sep), 'buffer outside owned output root');
      const bytes = await fs.readFile(source.file);
      if (terminal) throw terminal;
      ensure(bytes.byteLength === descriptor.byteLength && digest(bytes) === descriptor.sha256, 'native payload mismatch'); return bytes;
    },
    retire: publications.retire,
    cancelRequest: publications.cancel,
    snapshot: () => ({ queue: queue.snapshot(), activeRequest: queue.activeRequest(), publications: publications.size(), cacheEntries: cache.size, totalOutputBytes, pid: controller.pid, failure: terminal ? { code: terminal.code, message: terminal.message } : null }),
    async reset() {
      if (terminal) throw terminal;
      ensure(publications.size() === 0 && queue.snapshot().active === 0 && queue.snapshot().queued === 0, 'reset requires retired idle state');
      publications.reset(); cache.clear(); await controller.reset(); return actualProducer();
    },
    async close() {
      stopped = true; const draining = queue.close(); const native = await controller.close(); await draining;
      publications.clear(); cache.clear(); await fs.writeFile(path.join(runRoot, 'native-records.json'), JSON.stringify({ records, totalOutputBytes, native }, null, 2) + '\n');
      return native;
    },
  });
}
