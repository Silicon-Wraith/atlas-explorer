import { GENERATION_ROOT } from '../generation/config.mjs';
// Bounded development smoke. All generator files/outputs remain producer-owned.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPreparationRequest, worldReference } from '../../src/space/preparation/contract.js';
import { createNativeAdapter } from '../preparation/native-adapter.mjs';

if (!process.env.ATLAS_GPU_HANDOFF || process.env.ATLAS_GPU_DEFERRED) throw new Error('exactly one explicit GPU handoff required');
const root = path.resolve(process.argv[2]);
if (!root.startsWith('/mnt/ml_storage/scratch/')) throw new Error('scratch run root required');
await fs.mkdir(root, { recursive: false });
const report = { started: new Date().toISOString(), ownedPids: [process.pid], mode: 'native-development-smoke', handoff: process.env.ATLAS_GPU_HANDOFF, rows: [], cleanup: false, events: [] };
let adapter, count = 0;
try {
  adapter = await createNativeAdapter({ runRoot: root, onEvent: e => report.events.push(e) });
  report.hello = adapter.hello(); report.ownedPids.push(adapter.snapshot().pid);
  const old = JSON.parse(await fs.readFile(path.join(GENERATION_ROOT,'provenance/legacy-buffer-controls.json'), 'utf8'));
  assert.equal(adapter.world.definitionKey, old.world.definitionKey);
  const D = adapter.grid.config.diameter;
  const cases = [
    { label: 'home', bounds: adapter.grid.bounds([0, 0, 0]), intent: 'interaction', body: D },
    { label: 'new-3d', bounds: adapter.grid.bounds([0, 1, 2]), intent: 'interaction', body: D },
    { label: 'domain-corner', bounds: adapter.grid.bounds([9, 3, -2]), intent: 'interaction', body: D },
    { label: 'fine-control', bounds: adapter.fineBounds, intent: 'interaction', body: D / 4 },
    { label: 'view', bounds: adapter.viewGrid.bounds([0, 0, 0]), intent: 'view', body: null },
  ];
  for (const c of cases) {
    const request = createPreparationRequest({ schema: 'atlas.preparation.request', schemaVersion: 1,
      identity: { runtimeId: 'pc2-native-smoke', epoch: 0, requestId: 'r' + ++count }, producer: adapter.producer(), world: worldReference(adapter.world),
      bounds: c.bounds, intent: c.intent, requirements: { maxErrorM: .01 * (c.body ?? 4 * D), bodyDiameterM: c.body } });
    const begin = performance.now(), prepared = await adapter.prepare(request, { qualification: true, rebuild: true });
    assert.equal(prepared.result.status, 'prepared', prepared.result.reason);
    const sizes = {};
    for (const descriptor of prepared.result.artifact.buffers) {
      const bytes = await adapter.buffer(prepared.token, descriptor.role); sizes[descriptor.role] = bytes.byteLength;
      assert.equal(createHash('sha256').update(bytes).digest('hex'), descriptor.sha256);
    }
    if (c.intent === 'view') assert.equal(Object.hasOwn(sizes, 'solid-indices'), false);
    const row = { label: c.label, request, artifact: prepared.result.artifact, native: prepared.native, sizes, elapsedMs: performance.now() - begin };
    report.rows.push(row); adapter.retire(prepared.token);
    console.log(JSON.stringify({ label: c.label, classification: row.artifact.classification, sizes, elapsedMs: row.elapsedMs }));
  }
  assert.equal(adapter.snapshot().publications, 0);
  report.pass = true;
} catch (error) { report.error = error.stack; process.exitCode = 1; }
finally {
  if (adapter) {
    try { report.nativeCleanup = await adapter.close(); report.cleanup = report.nativeCleanup.cleanup; }
    catch (error) { report.cleanupError = error.stack; process.exitCode = 1; }
  }
  report.ended = new Date().toISOString(); await fs.writeFile(path.join(root, 'smoke.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output: path.join(root, 'smoke.json'), pass: report.pass, cleanup: report.cleanup, error: report.error, cleanupError: report.cleanupError }));
}
