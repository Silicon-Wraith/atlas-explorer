// spikes/project0/close-g5d.mjs — node spikes/project0/close-g5d.mjs --manifest docs/reports/project0/webgpu-g5d-manifest.json --history docs/reports/project0/webgpu-g5d.md
// Closes the single G5-D attempt (prereg §8.6, §11) into its own decision file, docs/reports/project0/webgpu-g5d-decision.json. It never writes
// webgpu-decision.json. It authenticates the profile (reloaded from the registry's pinned hash, never the manifest's), the matrix, the
// implementation (preflight), the evidence and the historical references; recomputes every observation from raw words; and writes the amended
// verdict with the original failures beside it. No hardware. The frozen decision.js is used unchanged.
import { parseArgs } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT, DEVELOPER_FLAG, launchDisclosures } from './launch.mjs';
import { sha256 } from './evidence.mjs';
import { loadCampaign, loadFixtures, checkCoherence, recompute, qualify, unsafeFromLaunches, verifyPreflight, loadBaseline } from './qualify.mjs';
import { loadQualification, verifyKnownLimitations, verifyHistoricalReferences, qualificationReference, excludedTrialsOf, knownLimitationsOf, dispositionsOf, scopeOf, HEADLESS_ROW } from './qualification.mjs';

export const G5D_PROFILE = 'project0-g5d-v1';
export const DECISION_PATH = 'docs/reports/project0/webgpu-g5d-decision.json';

export async function closeG5d(values, deps = {}) {
  const d = { root: ROOT, qualificationRoot: ROOT, historicalRoot: ROOT, loadQualification, verifyKnownLimitations, verifyHistoricalReferences, loadCampaign, loadFixtures, verifyPreflight, loadBaseline, recompute, writeFile, log: console.log, ...deps };
  const root = d.root;
  const history = await readFile(resolve(root, values.history), 'utf8');
  const named = JSON.parse(await readFile(resolve(root, values.manifest), 'utf8'));
  if (named.qualification?.id !== G5D_PROFILE) throw new Error(`close-g5d closes only a manifest under ${G5D_PROFILE} (this one names ${JSON.stringify(named.qualification?.id ?? null)})`);
  const qualification = await d.loadQualification(G5D_PROFILE, { root: d.qualificationRoot });
  await d.verifyKnownLimitations(qualification);
  const historical = await d.verifyHistoricalReferences(qualification, { root: d.historicalRoot });
  const { manifest, records, attempts } = await d.loadCampaign(values.manifest, { root, qualification });
  const fixtures = await d.loadFixtures(manifest, { root });
  checkCoherence(records.filter(r => !r.invalidations.length), manifest);
  await d.verifyPreflight(manifest, records, { root });
  const baseline = manifest.requestedArgs?.includes(DEVELOPER_FLAG) ? await d.loadBaseline() : null;
  const { launches, raws, featureComparison, g5Observations } = await d.recompute([...records, ...attempts], fixtures, { root, manifest, baseline, qualification });
  const { backend, decision } = qualify(manifest, records, fixtures, { remediationClosed: true, raws, attempts, qualification });
  const doc = qualification.doc, unsafeFlag = unsafeFromLaunches(launches);
  const out = {
    backend: 'webgpu', campaign: manifest.campaign, manifest: values.manifest, manifestSha256: sha256(await readFile(resolve(root, values.manifest))), history: values.history, historySha256: sha256(history),
    args: manifest.args, requestedArgs: manifest.requestedArgs, unsafeFlag, disclosures: launchDisclosures(manifest.requestedArgs ?? []), featureComparison,
    qualification: qualificationReference(qualification), scope: scopeOf(qualification), excludedTrials: excludedTrialsOf(qualification), knownLimitations: knownLimitationsOf(qualification), headlessRow: HEADLESS_ROW,
    dispositions: dispositionsOf(qualification), preregistration: { ...doc.preregistration },
    matrix: { path: doc.artifacts.matrix.path, sha256: doc.artifacts.matrix.sha256 }, predictions: { path: doc.artifacts.predictions.path, sha256: doc.artifacts.predictions.sha256 },
    kernel: { form: doc.kernel.form, fragmentSha256: doc.kernel.fragmentSha256, shader: { sha256: doc.kernel.shader.sha256, entryPoints: [...doc.kernel.shader.entryPoints] }, layout: { ...doc.kernel.layout } },
    historical, g5Observations, disclosure: [...doc.disclosure],
    decision, gates: backend.gates,
  };
  await d.writeFile(resolve(root, DECISION_PATH), JSON.stringify(out, null, 2));
  d.log(scopeOf(qualification));
  d.log(`WebGPU G5-D attempt closed: ${decision.outcome}${unsafeFlag ? ' — DEPENDS ON --enable-unsafe-webgpu' : ''} (written to ${DECISION_PATH}; webgpu-decision.json unchanged)`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { manifest: { type: 'string' }, history: { type: 'string' } } });
  await closeG5d(values);
}
