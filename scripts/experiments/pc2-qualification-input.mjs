// Prepare an independently checkable CPU qualification input, without a GPU job.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { nativeArtifact, nativeSourcesKey } from '../preparation/native-adapter.mjs';
import { representationKey } from '../../src/space/preparation/contract.js';

const root = path.resolve(process.argv[2]);
const reportName = process.argv[3] ?? 'smoke.json';
const smoke = JSON.parse(await fs.readFile(path.join(root, reportName), 'utf8'));
const native = JSON.parse(await fs.readFile(path.join(root, 'native-records.json'), 'utf8'));
const oldSources = JSON.parse(await fs.readFile('/mnt/ml_storage/scratch/atlas-preparation-pc1/canonical-sources-r0.json', 'utf8'));
const legacy = JSON.parse(await fs.readFile('/mnt/ml_storage/scratch/atlas-preparation-pc1/legacy-provenance-r1.json', 'utf8'));
const candidates = [...oldSources.map(s => s.path), ...legacy.assets.map(s => s.original_path),
  fileURLToPath(new URL('../preparation/native-worker.py', import.meta.url)),
  '/mnt/ml_storage/scratch/atlas-multiscale-pr8/approach-r1.json',
  '/mnt/ml_storage/scratch/valley-spike/zoom2d/gpu/ia/rc1/prepared-layers-r0/parent-reference-r0.npz',
  '/mnt/ml_storage/scratch/atlas-prepared-toolchain/py/manifold3d.cpython-313-x86_64-linux-gnu.so',
  '/mnt/ml_storage/scratch/atlas-prepared-toolchain/py/pymartini/martini.cpython-313-x86_64-linux-gnu.so'];
const sources = [];
for (const row of smoke.hello.sources) {
  let verified = null;
  for (const filename of candidates.filter(filename => path.basename(filename) === row.role)) {
    if (createHash('sha256').update(await fs.readFile(filename)).digest('hex') === row.sha256) { verified = filename; break; }
  }
  if (!verified) throw new Error('Unverified native source: ' + row.role);
  sources.push({ ...row, file: verified });
}
const published = reportName === 'browser.json' ? new Set((smoke.browserCleanup?.events ?? []).filter(e => e.type === 'ready').map(e => e.key)) : null;
const seen = new Set(), jobs = [];
for (const raw of native.records.filter(r => r.status === 'prepared')) {
  const artifact = nativeArtifact(raw, { hello: smoke.hello, world: smoke.hello.definition, qualification: true });
  const key = representationKey(artifact);
  if ((!published || published.has(key)) && !seen.has(key)) { jobs.push({ ...raw, representationKey: key }); seen.add(key); }
}
if (published && [...published].some(key => !seen.has(key))) throw new Error('Published representation missing its native qualification input');
await fs.writeFile(path.join(root, 'qualification-input.json'), JSON.stringify({ world: smoke.hello.definition.id,
  sourcesKey: nativeSourcesKey(smoke.hello), sources, jobs }, null, 2) + '\n');
console.log(JSON.stringify({ sources: sources.length, representations: jobs.length, output: path.join(root, 'qualification-input.json') }));
