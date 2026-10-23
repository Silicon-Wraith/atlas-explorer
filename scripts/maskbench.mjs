// CPU-only, same-thread 4K mask benchmark. No Worker, browser, GPU or timing assertions.
// node scripts/maskbench.mjs [source-root] [worker|sliced|legacy]
// Adapted from Claude's b15-q5prof/tools/maskbench.mjs (2026-10-23).
// Same seeded inputs, 256-row tiles, six samples, input copies outside timing.
// legacy measures record + end/snapshot, excluding the old separate countReadback.
// worker/sliced include fused counts and close + counts/snapshot. Sample 0 is cold;
// steady reports samples 1–5. Timings are diagnostics, never acceptance evidence.
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cpus } from 'node:os';

const root = resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
const mode = process.argv[3] ?? 'worker';
if (!['worker', 'sliced', 'legacy'].includes(mode) || process.argv.length > 4) throw new Error('usage: node scripts/maskbench.mjs [source-root] [worker|sliced|legacy]');
const module = await import(pathToFileURL(resolve(root, 'src/space/render/outcome-masks.js')));
const create = mode === 'worker' ? module.createWorkerOutcomeMasks : module.createOutcomeMasks;
if (typeof create !== 'function') throw new Error(`source root does not implement ${mode} masks`);
const width = 3840, height = 2160, tileRows = 256, fields = ['status', 'normal', 'lightingStatus'];
let seed = 1;
const random = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
function tile(field, h) {
  const n = width * h, bytes = new Uint8Array(n * (field === 'normal' ? 8 : 4)), data = new DataView(bytes.buffer);
  for (let i = 0; i < n; i++) {
    if (field === 'status') data.setUint32(4 * i, random() < 0.06 ? 0 : 1, true);
    else if (field === 'normal') data.setUint16(8 * i + 6, 0x3c00, true);
    else data.setUint32(4 * i, random() < 0.001 ? 1 | (2 << 2) | (1 << 4) : 0, true);
  }
  return bytes;
}
const regions = [];
for (let y = 0; y < height; y += tileRows) regions.push({ x: 0, y, width, height: Math.min(tileRows, height - y) });
const data = Object.fromEntries(fields.map(field => [field, regions.map(r => tile(field, r.height))]));
const masks = create({ width, height }, mode === 'legacy' ? {} : { strict: true });
const samples = [];
for (let sample = 0; sample < 6; sample++) {
  const id = { accumulationKey: 'k', sample }, decodeByFieldMs = Object.fromEntries(fields.map(f => [f, 0]));
  let decodeMs = 0, closeMs = 0, tiles = 0;
  for (let t = 0; t < regions.length; t++) for (const field of fields) {
    const bytes = data[field][t].slice(), last = t === regions.length - 1 && field === 'lightingStatus';
    const started = performance.now();
    if (mode === 'legacy' || last) masks.record(id, field, regions[t], bytes);
    else masks.ingestSync(id, field, regions[t], bytes);
    const decoded = performance.now(), elapsed = decoded - started;
    decodeMs += elapsed; decodeByFieldMs[field] += elapsed; tiles++;
    if (last) {
      masks.end(id);
      if (mode !== 'legacy') masks.counts();
      masks.snapshot();
      closeMs += performance.now() - decoded;
    }
  }
  samples.push({ sample, tiles, decodeMs, decodeMsPerTile: decodeMs / tiles, decodeByFieldMs, closeMs });
}
const warm = samples.slice(1), mean = field => warm.reduce((sum, s) => sum + s[field], 0) / warm.length;
console.log(JSON.stringify({ root, mode, node: process.version, cpu: cpus()[0]?.model, width, height, tileRows,
  countPassIncluded: mode !== 'legacy', samples,
  steady: { samples: warm.map(s => s.sample), decodeMsPerTile: mean('decodeMsPerTile'), closeMs: mean('closeMs') } }));
