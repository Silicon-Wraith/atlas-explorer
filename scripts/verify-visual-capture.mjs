// B11c (Codex B11b-F7): verify a visual capture archive from the archive alone. Run it from the tree of the measured
// assembly (it uses that tree's visual-acceptance helpers and appearance, camera and jitter rules).
// usage: node scripts/verify-visual-capture.mjs <capture dir>   (prints JSON; exit 1 on any problem or mismatch)
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as va from '../tests/support/visual-acceptance.mjs';
import * as appearance from '../src/space/render/webgpu/appearance.js';
import { basis } from '../src/space/camera.js';
import { sampleJitter } from '../src/space/render/backend.js';
import { halfToNumber } from '../src/space/render/webgpu/passes.js';
import { verifyCaptureScene, makeFaceRecords, sha256 } from '../tests/support/visual-capture.mjs';

const dir = process.argv[2];
if (!dir) { console.error('usage: verify-visual-capture.mjs <capture dir>'); process.exit(2); }
const run = JSON.parse(await readFile(join(dir, 'run.json'), 'utf8'));
const deps = { va, appearance, faceRecords: makeFaceRecords({ va, basis, sampleJitter, halfToNumber }) };
const scenes = [];
for (const entry of run.scenes) {
  const sceneText = await readFile(join(dir, entry.id, 'scene.json'));
  const hashOk = sha256(sceneText) === entry.sceneSha256;
  try {
    const r = await verifyCaptureScene(join(dir, entry.id), deps), m = r.metrics;
    const lighting = m.thresholds.rows.find(row => row.metric === 'lightingUnresolved');
    scenes.push({ id: r.id, ok: r.ok && hashOk, sceneJsonHash: hashOk, problems: r.problems, mismatches: r.mismatches, files: entry.files,
      union: m.union, lightingUnresolved: `${lighting.numerator}/${lighting.denominator}`, thresholdsPassed: m.thresholds.passed, recovery: m.recovery?.union ?? null });
  } catch (error) { scenes.push({ id: entry.id, ok: false, error: String(error?.message ?? error) }); }
}
const out = { dir, stage: run.stage, source: run.source, fixture: run.fixture, ok: scenes.length > 0 && scenes.every(s => s.ok), scenes };
console.log(JSON.stringify(out, null, 1));
process.exit(out.ok ? 0 : 1);
