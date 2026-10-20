// spikes/project0/precision.mjs — node spikes/project0/precision.mjs ; on the verified selected configuration, headed.
// T12 adaptation (E10; task-T12-report.md): WebGPU was selected by user decision E10, not by the mechanical procedure, whose recomputed outcome
// is inconclusive and is never overwritten. No decision file records 'WebGPU selected', so the brief's mechanical check could never pass.
// The selection is instead verified from evidence: the recorded G5-D decision (webgpu-g5d-decision.json) is recomputed by close-g5d's own
// verification sequence (profile, limitations, historical references, campaign, fixtures, coherence, preflight, recomputation, checked
// evaluation) and must reproduce exactly; the E10 user selection must be recorded; precision then runs headed with the launch configuration
// whose flags equal the selected manifest's requestedArgs. The summary states the selection basis and the mechanical outcome side by side.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT } from './launch.mjs';
import { runSession, LAUNCH } from './run.mjs';
import { sha256 } from './evidence.mjs';
import { canonical } from './contract.js';
import { loadCampaign, loadFixtures } from './qualify.mjs';
import { loadQualification } from './qualification.mjs';
import { closeG5d, G5D_PROFILE, DECISION_PATH } from './close-g5d.mjs';
import { assessPrecision } from './measure/precision.mjs';

export const SELECTION = Object.freeze({
  decisions: 'docs/codesign/execution-decisions.md', heading: '## E10 — WebGPU selected by user decision (user, 2026-10-20)',
  platform: 'docs/reports/project0/platform-decision.md', selected: '**Selected backend: WebGPU.**',
});

// Establish the selection from verified evidence, not from a mutable configuration name. Dependencies are injectable for tests; the default
// recomputation is CPU only (no browser, no GPU).
export async function verifySelection({ root = ROOT, read = path => readFile(resolve(root, path)), close = closeG5d, launch = LAUNCH } = {}) {
  const decisionBytes = await read(DECISION_PATH), recorded = JSON.parse(String(decisionBytes));
  if (sha256(await read(recorded.manifest)) !== recorded.manifestSha256) throw new Error('the manifest changed after the decision was recorded');
  const recomputed = JSON.parse(JSON.stringify(await close({ manifest: recorded.manifest, history: recorded.history }, { root, qualificationRoot: root, historicalRoot: root, writeFile: async () => {}, log: () => {} })));
  if (canonical(recomputed) !== canonical(recorded)) throw new Error(`the recorded G5-D decision (${DECISION_PATH}) does not reproduce from its evidence`);
  const decisions = await read(SELECTION.decisions), platform = await read(SELECTION.platform);
  if (!String(decisions).split('\n').includes(SELECTION.heading)) throw new Error(`the E10 user selection is not recorded in ${SELECTION.decisions}`);
  if (!String(platform).split('\n').includes(SELECTION.selected)) throw new Error(`the platform decision does not record WebGPU as selected (${SELECTION.platform})`);
  const qualification = await loadQualification(G5D_PROFILE, { root });
  const { manifest, records } = await loadCampaign(recorded.manifest, { root, qualification });
  const fx = await loadFixtures(manifest, { root });
  const args = Object.keys(launch).find(k => JSON.stringify(launch[k]) === JSON.stringify(manifest.requestedArgs));
  if (!args) throw new Error('no current launch configuration equals the selected configuration\'s flags');
  const selection = { basis: 'user decision E10', backend: 'webgpu', mechanicalOutcome: recomputed.decision.outcome,
    decisionFile: DECISION_PATH, decisionSha256: sha256(decisionBytes), manifest: recorded.manifest, manifestSha256: recorded.manifestSha256,
    decisions: SELECTION.decisions, decisionsSha256: sha256(decisions), platform: SELECTION.platform, platformSha256: sha256(platform) };
  return { fx, manifest, records, args, selection };
}

export async function main() {
  const { fx, manifest, records, args, selection } = await verifySelection();
  const { records: out, runDir } = await runSession({ gate: 'precision', mode: 'headed', args, campaign: 'precision' });
  const record = out[0];
  const raw = JSON.parse(await readFile(resolve(ROOT, 'artifacts/project0', record.artifacts.find(a => a.path.endsWith('.raw.json')).path), 'utf8'));
  const summary = { manifest: selection.manifest, manifestSha256: selection.manifestSha256, selection, record: record.id, runDir: runDir.split('/').at(-1), args, requestedArgs: manifest.requestedArgs, ...assessPrecision({ fx, record, raw, selected: records }) };
  await mkdir(resolve(ROOT, 'docs/reports/project0'), { recursive: true });
  await writeFile(resolve(ROOT, 'docs/reports/project0/precision.json'), JSON.stringify(summary, null, 2));
  console.log(`selection: ${selection.basis} (mechanical outcome ${selection.mechanicalOutcome}, ${selection.decisionFile})`);
  if (!summary.interpretable) console.log(`NOT INTERPRETABLE: ${[...summary.executionInvalidations, summary.environmentError, summary.interpretationError].filter(Boolean).join('; ')}`);
  else {
    if (!summary.validated) console.log(`UNVALIDATED (compensation not interpreted): ${summary.primitiveFailures.join('; ')}`);
    for (const r of summary.rows) console.log(`d=${r.distance}: ${r.interpreted ? '' : '(not interpreted) '}baseline exceeded=${r.baseline.vsRequested.thresholdExceeded}${r.compensated ? `, compensated exceeded=${r.compensated.vsRequested.thresholdExceeded}` : ''}, work median ms base=${r.cost.baseline.workMs.median.toFixed(2)} ff=${r.cost.compensated.workMs.median.toFixed(2)}, extra bytes ${r.extraBytes}`);
    console.log(`observed disagreement threshold against the CPU reference: ${summary.observedDisagreementThreshold ?? 'not reached within tested distances'}${summary.firstStop ? `; first stop at d=${summary.firstStop.distance} (${summary.firstStop.reasons.join(', ')})` : ''}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
