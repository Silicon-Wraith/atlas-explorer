// spikes/project0/close-remediation.mjs — node spikes/project0/close-remediation.mjs --manifest docs/reports/project0/<campaign>-manifest.json --history docs/reports/project0/webgpu-remediation.md
// Closes the backend's single remediation cycle: verifies and recomputes the final selection, then writes the decision. No hardware.
// T10 amendments: the manifest's integrity preflight is verified (qualify.mjs verifyPreflight), and the verdict is the checked one, over every
// selected record's raw payload (recompute's `raws`, passed to qualify, which evaluates through evaluateGateChecked).
// Fix round 1: the manifest's named attempts are loaded, verified and passed to qualify; coherence binds the uninvalidated records (as in the
// campaign); any verification failure refuses to close the cycle (no decision is written).
import { parseArgs } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT, DEVELOPER_FLAG, launchDisclosures } from './launch.mjs';
import { sha256 } from './evidence.mjs';
import { loadCampaign, loadFixtures, checkCoherence, recompute, qualify, unsafeFromLaunches, verifyPreflight, loadBaseline } from './qualify.mjs';
import { loadQualification, verifyKnownLimitations, qualificationReference, excludedTrialsOf, knownLimitationsOf, SCOPE_DISCLOSURE, HEADLESS_ROW } from './qualification.mjs';

// E7 fix round 1 (finding 3): the closure is a function with injectable reads, writes and verifiers (the real ones by default), so a test
// can execute it end to end with captured writes; the command line below calls it unchanged.
export async function closeRemediation(values, deps = {}) {
  const d = { root: ROOT, qualificationRoot: ROOT, loadQualification, verifyKnownLimitations, loadCampaign, loadFixtures, verifyPreflight, loadBaseline, recompute, writeFile, log: console.log, ...deps };
  const root = d.root;
  const history = await readFile(resolve(root, values.history), 'utf8');
  if (!/^## Classification/m.test(history) || !/^## Change set/m.test(history)) throw new Error('the remediation history must contain "## Classification" and "## Change set" sections (use "none" when no remediation was needed)');
  // E7 / G1-D: a manifest that names a qualification profile is closed only under that profile, reloaded and authenticated here (the registry's
  // pinned hash, not the manifest's), with its limitation evidence verified; loadCampaign and qualify then check the manifest against it.
  const named = JSON.parse(await readFile(resolve(root, values.manifest), 'utf8'));
  const qualification = named.qualification ? await d.loadQualification(named.qualification.id, { root: d.qualificationRoot }) : null;
  if (qualification) await d.verifyKnownLimitations(qualification);
  const { manifest, records, attempts } = await d.loadCampaign(values.manifest, { root, qualification });
  const fixtures = await d.loadFixtures(manifest, { root });
  checkCoherence(records.filter(r => !r.invalidations.length), manifest);
  await d.verifyPreflight(manifest, records, { root });
  // WebGPU remediation (prereg rev 2 §3.5): under the developer flag the granted features are compared with attempt 1's (equal / differs /
  // unavailable); a difference refuses the record, and every row is written beside the decision with the flag's disclosures.
  const baseline = manifest.requestedArgs?.includes(DEVELOPER_FLAG) ? await d.loadBaseline() : null;
  const { launches, raws, featureComparison, g5Observations } = await d.recompute([...records, ...attempts], fixtures, { root, manifest, baseline });
  const { backend, decision } = qualify(manifest, records, fixtures, { remediationClosed: true, raws, attempts, qualification });
  const unsafeFlag = unsafeFromLaunches(launches);                                          // the verified effective command lines decide
  const out = { backend: 'webgpu', manifest: values.manifest, manifestSha256: sha256(await readFile(resolve(root, values.manifest))), history: values.history, historySha256: sha256(history), args: manifest.args, requestedArgs: manifest.requestedArgs, unsafeFlag, disclosures: launchDisclosures(manifest.requestedArgs ?? []), featureComparison, g5Observations,
    ...(qualification ? { qualification: qualificationReference(qualification), scope: SCOPE_DISCLOSURE, excludedTrials: excludedTrialsOf(qualification), knownLimitations: knownLimitationsOf(qualification), headlessRow: HEADLESS_ROW } : {}),
    decision, gates: backend.gates };
  await d.writeFile(resolve(root, 'docs/reports/project0/webgpu-decision.json'), JSON.stringify(out, null, 2));
  if (qualification) d.log(SCOPE_DISCLOSURE);
  d.log(`WebGPU remediation closed: ${decision.outcome}${unsafeFlag ? ' — DEPENDS ON --enable-unsafe-webgpu' : ''}`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { manifest: { type: 'string' }, history: { type: 'string' } } });
  await closeRemediation(values);
}
