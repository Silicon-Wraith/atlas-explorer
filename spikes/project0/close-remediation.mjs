// spikes/project0/close-remediation.mjs — node spikes/project0/close-remediation.mjs --manifest docs/reports/project0/<campaign>-manifest.json --history docs/reports/project0/webgpu-remediation.md
// Closes the backend's single remediation cycle: verifies and recomputes the final selection, then writes the decision. No hardware.
// T10 amendments: the manifest's integrity preflight is verified (qualify.mjs verifyPreflight), and the verdict is the checked one, over every
// selected record's raw payload (recompute's `raws`, passed to qualify, which evaluates through evaluateGateChecked).
import { parseArgs } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT } from './launch.mjs';
import { sha256 } from './evidence.mjs';
import { loadCampaign, loadFixtures, checkCoherence, recompute, qualify, unsafeFromLaunches, verifyPreflight } from './qualify.mjs';

const { values } = parseArgs({ options: { manifest: { type: 'string' }, history: { type: 'string' } } });
const history = await readFile(resolve(ROOT, values.history), 'utf8');
if (!/^## Classification/m.test(history) || !/^## Change set/m.test(history)) throw new Error('the remediation history must contain "## Classification" and "## Change set" sections (use "none" when no remediation was needed)');
const { manifest, records } = await loadCampaign(values.manifest);
const fixtures = await loadFixtures(manifest);
checkCoherence(records, manifest);
await verifyPreflight(manifest, records);
const { launches, raws } = await recompute(records, fixtures, { manifest });
const { backend, decision } = qualify(manifest, records, fixtures, { remediationClosed: true, raws });
const unsafeFlag = unsafeFromLaunches(launches);                                          // the verified effective command lines decide
const out = { backend: 'webgpu', manifest: values.manifest, manifestSha256: sha256(await readFile(resolve(ROOT, values.manifest))), history: values.history, historySha256: sha256(history), args: manifest.args, requestedArgs: manifest.requestedArgs, unsafeFlag, decision, gates: backend.gates };
await writeFile(resolve(ROOT, 'docs/reports/project0/webgpu-decision.json'), JSON.stringify(out, null, 2));
console.log(`WebGPU remediation closed: ${decision.outcome}${unsafeFlag ? ' — DEPENDS ON --enable-unsafe-webgpu' : ''}`);
