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
const candidates = smoke.hello.sourceFiles;
if (!Array.isArray(candidates)) throw new Error('This qualifier requires current owned-source records; use the archived qualifier for historical runs');
const sources = [];
for (const row of smoke.hello.sources) {
  let verified = null;
  for (const candidate of candidates.filter(candidate => candidate.role === row.role)) {
    const filename = candidate.file;
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
