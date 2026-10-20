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

const { values } = parseArgs({ options: { manifest: { type: 'string' }, history: { type: 'string' } } });
const history = await readFile(resolve(ROOT, values.history), 'utf8');
if (!/^## Classification/m.test(history) || !/^## Change set/m.test(history)) throw new Error('the remediation history must contain "## Classification" and "## Change set" sections (use "none" when no remediation was needed)');
const { manifest, records, attempts } = await loadCampaign(values.manifest);
const fixtures = await loadFixtures(manifest);
checkCoherence(records.filter(r => !r.invalidations.length), manifest);
await verifyPreflight(manifest, records);
// WebGPU remediation (prereg rev 2 §3.5): under the developer flag the granted features are compared with attempt 1's (equal / differs /
// unavailable); a difference refuses the record, and every row is written beside the decision with the flag's disclosures.
const baseline = manifest.requestedArgs?.includes(DEVELOPER_FLAG) ? await loadBaseline() : null;
const { launches, raws, featureComparison } = await recompute([...records, ...attempts], fixtures, { manifest, baseline });
const { backend, decision } = qualify(manifest, records, fixtures, { remediationClosed: true, raws, attempts });
const unsafeFlag = unsafeFromLaunches(launches);                                          // the verified effective command lines decide
const out = { backend: 'webgpu', manifest: values.manifest, manifestSha256: sha256(await readFile(resolve(ROOT, values.manifest))), history: values.history, historySha256: sha256(history), args: manifest.args, requestedArgs: manifest.requestedArgs, unsafeFlag, disclosures: launchDisclosures(manifest.requestedArgs ?? []), featureComparison, decision, gates: backend.gates };
await writeFile(resolve(ROOT, 'docs/reports/project0/webgpu-decision.json'), JSON.stringify(out, null, 2));
console.log(`WebGPU remediation closed: ${decision.outcome}${unsafeFlag ? ' — DEPENDS ON --enable-unsafe-webgpu' : ''}`);
