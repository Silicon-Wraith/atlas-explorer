// spikes/project0/report.mjs — node spikes/project0/report.mjs --decision docs/reports/project0/webgpu-g5d-decision.json [--date YYYY-MM-DD] [--out docs/reports]
// Renders the Project 0 qualification report from verified, recomputed evidence; exits nonzero (REPORT REFUSED) on any inconsistency and then
// writes nothing. Adapted from the T13 brief for the reviewed amendments (task-T13-report.md, "Adaptations"):
// - Verdicts come only from the checked path: each closed decision is recomputed by its own closer (close-g5d / close-remediation: profile
//   reloaded from the registry's pinned hash, limitations and historical references verified, preflight, recompute, evaluateGateChecked with the
//   raws) with its writes captured, and must reproduce the saved decision exactly (an append-only history extension is allowed, as in T12).
//   webgpu-1 (no profile) is recomputed through loadCampaign / recompute / qualify and must reproduce webgpu-1-gates.json.
// - The decision is shown honestly: the mechanical outcome (inconclusive) and, beside it, the E10 user-override selection, verified as recorded.
// - E7: the scope line; G1 and G1/headless as two rows (the latter never a gate, never notRun, never pass); the same split in the results JSON.
// - G5 as amended by E8/E9 with the authenticated disclosure; the webgpu-1 and G5-A failures stand. G6/G7/G9 carry the timing carry-forward.
// - Codex's T13 condition: every run's implementation identity is authenticated from its own commit (the harness hash recomputed from git), and a
//   record's declared shader hash must equal fields.wgsl + arithmetic.wgsl resolved from that commit, never from the current files.
// - T12 is separate from qualification: precision.json is recomputed in full from its own record (assessPrecision, imported only when precision
//   evidence exists) and bound to the decision file it names; the superseded ff11b35 summary is listed with its evidence hash-verified.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { decideBackends } from './decision.js';
import { ROOT } from './launch.mjs';
import { sha256, launchIdentity } from './evidence.mjs';
import { canonical } from './contract.js';
import { loadCampaign, loadFixtures, checkCoherence, recompute, qualify, unsafeFromLaunches, verifyPreflight, loadBaseline } from './qualify.mjs';
import { loadQualification, validateQualification, qualificationReference, excludedTrialsOf, knownLimitationsOf, verifyKnownLimitations, verifyHistoricalReferences } from './qualification.mjs';
import { closeG5d } from './close-g5d.mjs';
import { closeRemediation } from './close-remediation.mjs';

const R = 'docs/reports/project0';
export const CHAIN = Object.freeze({
  final: { campaign: 'webgpu-g5d', decision: `${R}/webgpu-g5d-decision.json`, profile: 'project0-g5d-v1' },
  remediation: { campaign: 'webgpu-remediation', decision: `${R}/webgpu-decision.json` },
  original: { campaign: 'webgpu-1', manifest: `${R}/webgpu-1-manifest.json`, gates: `${R}/webgpu-1-gates.json` },
});
export const SELECTION = Object.freeze({
  decisions: 'docs/codesign/execution-decisions.md', heading: '## E10 — WebGPU selected by user decision (user, 2026-10-20)',
  platform: `${R}/platform-decision.md`, selected: '**Selected backend: WebGPU.**',
  text: 'WebGPU, chosen by explicit user override (E10); timing qualification incomplete',
});
export const TIMING_CARRY = 'timing evidence incomplete; cause unknown; demonstrated harness scheduling vulnerability';
// Fix round 1 (finding 5): one classification for the Markdown and the results JSON. The carry-forward applies to an invalid G6/G7/G9 only when
// the timing invocation was ended by a schedule deviation (the demonstrated harness scheduling vulnerability).
const TIMING = ['G6', 'G7', 'G9'];
export const timingCarry = gates => TIMING.some(g => (gates[g]?.reasons ?? []).some(r => /schedule deviation/.test(r)));
const carried = (gates, g) => timingCarry(gates) && TIMING.includes(g) && gates[g]?.status === 'invalid/inconclusive';
export const resultsGates = gates => Object.fromEntries(Object.entries(gates).map(([g, r]) => [g, { status: r.status, reasons: r.reasons, evidenceIds: r.evidenceIds,
  ...(g === 'G5' && r.amendedBy ? { amendedBy: r.amendedBy } : {}), ...(carried(gates, g) ? { carryForward: TIMING_CARRY } : {}) }]));
const PRECISION = `${R}/precision.json`, INTERPRETATION = `${R}/precision-interpretation.md`;
// Fix round 1 (finding 2): the preserved ff11b35 reference set is pinned here (values as committed at 4465b3c), so a record whose artefact list
// is emptied, a missing file or a substituted record is refused; its metrics are never reinterpreted.
const SUPERSEDED = Object.freeze({ summary: `${R}/precision-ff11b35-superseded.json`, summarySha256: 'f7465a524d33df3bbedc10f5791f941530852abc8fe0b4713d95bacb03cb927a',
  note: `${R}/precision-ff11b35-superseded.md`, record: 'precision-precision-20261020T175447161Z-precision-precision-headed', runDir: '20261020T175447161Z-precision-precision-headed',
  recordSha256: '49b058916333c414733c08c188a0f024c345d8f3af5978fc4636df39ea224262',
  implementationCommit: 'ff11b35f1e2eee3c05140ca0c0ba17651348ea81', implementationHash: '1fdb34079a855350b24da8e12e77853fc565f789933d3c60cca7ee6c8696c678',
  artifacts: Object.freeze({ '.raw.json': 'a6c02c5bead9b7e08a9e06a1663c8a2f593c9d1ab88ad8c04b3d6c76a4c36b9e', '.launch.json': '2320b55c3a6ccd72cfd8a10d9bcf8492bcdc4d885f8cb182897e3d5b3e1b9476',
    '.chrome-gpu.txt': 'd1e2def00d50c851d12b431224ed0ce9fe191b0e2f503ff34a4efa661d615330' }) });
const esc = s => String(s).replace(/\|/g, '\\|');

// ---------- rendering (pure) ----------
export function renderReport({ decision, backend, webgl = null, selection = null, scope = null, g5Scope = null, headlessRow = null, knownLimitations = [], g5 = null,
  chain = [], implementations = [], precision = null, superseded = [], unsafeFlag = false, launch = null }) {
  const again = decideBackends(backend, webgl);
  if (again.outcome !== decision.outcome) throw new Error(`decision does not follow from the gate statuses (${again.outcome} vs ${decision.outcome})`);
  if (selection && (selection.basis !== 'user decision E10' || selection.text !== SELECTION.text)) throw new Error('the selection is not the recorded E10 user override');
  const gates = backend.gates, carry = timingCarry(gates);
  const statusOf = (g, r) => (g === 'G5' && g5 && r.status === 'pass' ? 'pass as amended by E8 and E9' : r.status);
  const reasonsOf = (g, r) => [...(carried(gates, g) ? [TIMING_CARRY] : []), ...(r.reasons ?? [])].map(esc).join('; ') || '—';
  const rows = [];
  for (const [g, r] of Object.entries(gates)) {
    rows.push(`| ${g} | ${statusOf(g, r)} | ${reasonsOf(g, r)} |`);
    if (g === 'G1' && headlessRow) rows.push(`| G1/headless | ${esc(headlessRow.replace(/^G1\/headless — /, ''))} | excluded trial (E7); not a gate verdict |`);
  }
  const limitationLinks = knownLimitations.flatMap(l => l.evidence.map(e => `  - ${e.kind}: \`${e.path}\`${e.recordId ? ` (record \`${e.recordId}\`)` : ''}, sha256 \`${e.sha256.slice(0, 12)}…\``));
  const out = ['# Project 0 — Space Backend Qualification Report', '', '## Decision', '',
    `Mechanical outcome: **${decision.outcome}**${decision.next ? ` (next: ${decision.next})` : ''}. Recomputed from the saved evidence through the checked evaluator; the recorded decision is unchanged.`, ''];
  if (selection) out.push(`Selection: **${SELECTION.text}**. This is an exception to the specification §6 rule that selection requires every mandatory gate to pass. It is the user's decision (E10), never a mechanical qualification.`, '');
  if (unsafeFlag) out.push('> **The selection depends on `--enable-unsafe-webgpu`.** Space would require a Chrome flag that ordinary users do not set. This is the user\'s decision to accept or reject.', '');
  if (scope) out.push(scope, '');
  if (g5Scope && g5Scope !== scope) out.push(g5Scope, '');
  if (launch) out.push(`Launch configuration: \`${launch.args}\` — \`${(launch.requestedArgs ?? []).join(' ')}\`${launch.disclosures?.developerFeatures ? ` (developer features; ${launch.disclosures.timestampQuantization})` : ''}.`, '');
  out.push('## Gates (final campaign)', '', '| Gate | Status | Reasons |', '|---|---|---|', ...rows, '');
  if (headlessRow) out.push(`**G1/headless.** ${headlessRow.replace(/^G1\/headless — /, '')}`, ...(limitationLinks.length ? ['', 'Preserved evidence:', ...limitationLinks] : []), '');
  if (carry) out.push('**Timing (G6, G7, G9).** Not qualified: ' + TIMING_CARRY + '. The leading diagnostic target is the harness timer defect carried forward in `docs/reports/project0/platform-decision.md` (fractional `setTimeout` rearm delays at `browser/drivers/timing.js`); no WebGPU limitation is demonstrated.', '');
  if (g5) {
    out.push('## G5 as amended by E8 and E9', '', ...g5.disclosure.map(d => `- ${d}`), '');
    for (const o of g5.operational) {
      out.push(`Operational orbits: ${o.qualifying.samples - o.qualifying.outside}/${o.qualifying.samples} qualifying within limits, worst componentRatio ${o.qualifying.maxComponentRatio}, worst logRRatio ${o.qualifying.maxLogRRatio}. ${o.scope}`, '',
        '| Band | Role | Samples | Outside | Worst componentRatio |', '|---|---|---|---|---|',
        ...Object.entries(o.bands).map(([b, s]) => `| ${b} | ${b === 'S3' ? 'diagnostic (E9, non-gating)' : 'qualifying'} | ${s.samples} | ${s.outside} | ${s.maxComponentRatio} |`), '');
    }
    out.push('The original failures stand under their own contracts:', '', '| Campaign | Record | componentRatio | Result |', '|---|---|---|---|',
      ...g5.historical.map(h => `| ${h.campaign} | \`${h.recordId}\` | ${h.componentRatio} | ${h.compensation ? `failure; compensation ${h.compensation.validated ? 'validated' : 'eliminated (unvalidated)'}` : 'failure'} |`), '');
  }
  if (chain.length) out.push('## Verified evidence chain', '', '| Campaign | Verified against | Mechanical outcome |', '|---|---|---|', ...chain.map(c => `| ${c.campaign} | \`${c.verifiedAgainst}\` | ${c.outcome} |`), '');
  if (implementations.length) out.push('Implementation identities, each authenticated from its own commit (harness hash recomputed from git; shader resolved at that commit):', '',
    '| Commit | Harness hash | Used by | Shader (fields + arithmetic) |', '|---|---|---|---|',
    ...implementations.map(i => `| ${i.implementationCommit.slice(0, 7)} | ${i.implementationHash.slice(0, 12)}… | ${i.usedBy.join(', ')} | ${i.shader ? `${i.shader.slice(0, 12)}… (${i.shaderRecords.length} record(s))` : 'not recorded at this implementation'} |`), '');
  out.push('## Precision experiment (T12; separate from qualification)', '', precisionText(precision), '');
  if (superseded.length) out.push('Superseded evidence (listed, not used):', '', ...superseded.map(s => `- \`${s.summary}\` — ${s.status}; implementation ${s.implementationCommit.slice(0, 7)}; record \`${s.record}\` (${s.artifacts} artefacts hash-verified, not recomputed: the fixed readers refuse its raw). See \`${s.note}\`.`), '');
  return out.join('\n');
}

function precisionText(p) {
  if (!p) return 'Not run: no precision evidence is present.';
  if (!p.interpretable) return `Not interpretable: ${[...(p.executionInvalidations ?? []), p.environmentError, p.timingError, p.interpretationError].filter(Boolean).join('; ') || 'incomplete run'}`;
  const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(2)}%` : '—');
  return [`Selection basis: ${p.selection?.basis ?? '—'} (mechanical outcome ${p.selection?.mechanicalOutcome ?? '—'}). Record \`${p.record}\`, implementation ${p.implementationCommit?.slice(0, 7) ?? '—'}; recomputed in full from its own evidence.`, '',
    `Primitive validation: ${p.validated ? 'passed (compensation validated under the preregistered rule)' : `**failed** — compensation not interpreted (${p.primitiveFailures.join('; ')})`}.`,
    `Observed disagreement threshold against the CPU reference: ${p.observedDisagreementThreshold ?? 'not reached within the tested distances'}${p.firstStop ? `; interpretation stopped at d=${p.firstStop.distance} (${p.firstStop.reasons.join(', ')})` : ''}.`, '',
    '| d | interpreted | eligible | baseline status / large depth (exceeded) | compensated status / large depth (exceeded) | work median ms (base / comp) | extra bytes |', '|---|---|---|---|---|---|---|',
    ...p.rows.map(r => { const b = r.baseline.vsRequested, c = r.compensated?.vsRequested;
      if (!r.interpreted) return `| ${r.distance} | no | not interpreted | not interpreted | ${b.eligible} | ${r.cost.baseline.workMs.median.toFixed(2)} / ${r.cost.compensated.workMs.median.toFixed(2)} | ${r.extraBytes} |`;
      return `| ${r.distance} | yes | ${b.eligible} | ${b.statusDisagreements} (${pct(b.statusDisagreements, b.eligible)}) / ${b.largeDepthErrors} (${b.thresholdExceeded}) | ${c ? `${c.statusDisagreements} (${pct(c.statusDisagreements, c.eligible)}) / ${c.largeDepthErrors} (${c.thresholdExceeded})` : '—'} | ${r.cost.baseline.workMs.median.toFixed(2)} / ${r.cost.compensated.workMs.median.toFixed(2)} | ${r.extraBytes} |`; }), '',
    'Caveats (joint interpretation, `docs/reports/project0/precision-interpretation.md`): the limit is local to this anchor, profile, implementation and environment, not a universal f32 zoom floor; A.11 compensates coordinate construction and recurrence addition only (the nonlinear map, derivative and estimator remain f32), so field-evaluation precision is the leading remaining bottleneck without a quantified attribution; costs describe the instrumented prototype; extraBytes is a difference of allocation peaks, not a saving; T12 tests arithmetic splitting, not Plane\'s bitwise splitting.'].join('\n');
}

// ---------- verification ----------
const sameExceptOrder = gates => Object.fromEntries(Object.entries(gates).map(([g, r]) => [g, { ...r, evidenceIds: [...(r.evidenceIds ?? [])].sort() }]));

// T12 F7 rule: the recorded history hash is the whole current history or a line-boundary prefix of it (append-only notes).
export function historyPrefix(text, sha) {
  if (sha256(text) === sha) return true;
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) if (sha256(text.slice(0, i + 1)) === sha) return true;
  return false;
}

async function verifyClosed(path, close, root) {
  const bytes = await readFile(resolve(root, path)), recorded = JSON.parse(String(bytes));
  if (!historyPrefix(await readFile(resolve(root, recorded.history), 'utf8'), recorded.historySha256)) throw new Error(`${recorded.history} is not an append-only extension of the history ${path} recorded`);
  const out = JSON.parse(JSON.stringify(await close({ manifest: recorded.manifest, history: recorded.history }, { root, qualificationRoot: root, historicalRoot: root, writeFile: async () => {}, log: () => {},
    // Fix round 1 (finding 1): every evidence reader is bound to the supplied root, never the module checkout's defaults.
    loadQualification: (id, o = {}) => loadQualification(id, { ...o, root }), verifyKnownLimitations: ctx => verifyKnownLimitations(ctx, { root }),
    verifyHistoricalReferences: ctx => verifyHistoricalReferences(ctx, { root }), loadBaseline: () => loadBaseline(undefined, { root }),
    loadCampaign: (m, o = {}) => loadCampaign(m, { ...o, root }), loadFixtures: (m, o = {}) => loadFixtures(m, { ...o, root }), verifyPreflight: (m, r, o = {}) => verifyPreflight(m, r, { ...o, root }),
    recompute: (r, f, o = {}) => recompute(r, f, { ...o, root }) })));
  const again = { ...out, historySha256: recorded.historySha256 };
  const differ = [...new Set([...Object.keys(again), ...Object.keys(recorded)])].filter(k => canonical(again[k] ?? null) !== canonical(recorded[k] ?? null));
  if (differ.length) throw new Error(`${path} does not reproduce from its evidence (${differ.join(', ')})`);
  return { recorded, bytes };
}

const run = promisify(execFile);
export const gitAt = root => ({
  list: async commit => (await run('git', ['ls-tree', '-r', '--full-tree', '--name-only', commit, '--', 'spikes/project0'], { cwd: root, maxBuffer: 1 << 26 })).stdout.split('\n').filter(Boolean),
  show: async (commit, path) => (await run('git', ['show', `${commit}:${path}`], { cwd: root, encoding: 'buffer', maxBuffer: 1 << 28 })).stdout,
});
// The harness hash exactly as evidence.mjs implementationIdentity computes it (every spikes/project0 file except tests/ and fixtures.json), but
// from the commit's tree; then every declared shader hash must be the commit's fields.wgsl + arithmetic.wgsl.
export async function authenticateImplementation({ implementationCommit, implementationHash }, shaderDecls, { git }) {
  const files = (await git.list(implementationCommit)).filter(p => !p.startsWith('spikes/project0/tests/') && p !== 'spikes/project0/fixtures.json').sort();
  const h = createHash('sha256');
  for (const p of files) h.update(p).update('\0').update(await git.show(implementationCommit, p)).update('\0');
  if (h.digest('hex') !== implementationHash) throw new Error(`implementation ${implementationCommit}/${implementationHash} does not authenticate against its commit`);
  const declared = shaderDecls.filter(d => d.shader);
  let shader = null;
  if (declared.length) {
    shader = sha256(Buffer.concat([await git.show(implementationCommit, 'spikes/project0/gpu/fields.wgsl'), await git.show(implementationCommit, 'spikes/project0/gpu/arithmetic.wgsl')]));
    for (const d of declared) if (d.shader !== shader) throw new Error(`record ${d.id} declares shader ${d.shader}, not the source at its implementation commit ${implementationCommit} (${shader})`);
  }
  return { implementationCommit, implementationHash, authenticated: true, shader, shaderRecords: declared.map(d => d.id) };
}

const rawOf = async (root, r) => { const a = r.artifacts.find(x => x.path.endsWith('.raw.json')); return a ? JSON.parse(await readFile(join(root, 'artifacts/project0', a.path), 'utf8')) : null; };
const declaredShader = raw => raw?.shader?.sha256 ?? raw?.supplementary?.shader?.sha256 ?? null;

async function verifyRecordFile(root, runDir, id) {
  const record = JSON.parse(await readFile(join(root, 'artifacts/project0', runDir, `${id}.json`), 'utf8'));
  if (record.id !== id) throw new Error(`record ${id} names itself ${record.id}`);
  for (const a of record.artifacts) if (sha256(await readFile(join(root, 'artifacts/project0', a.path))) !== a.sha256) throw new Error(`artefact hash mismatch: ${a.path}`);
  return record;
}

export async function verifyPrecision({ root, saved, final, finalBytes, manifest, fixtures, records }) {
  if (saved.manifest !== final.manifest || saved.manifestSha256 !== final.manifestSha256) throw new Error('precision evidence was produced against a different selection');
  const s = saved.selection ?? {};
  if (s.basis !== 'user decision E10' || s.backend !== 'webgpu' || s.decisionFile !== CHAIN.final.decision || s.decisionSha256 !== sha256(finalBytes) || s.mechanicalOutcome !== final.decision.outcome)
    throw new Error('the precision summary is not bound to the verified E10 selection and decision file');
  if (saved.args !== manifest.args || canonical(saved.requestedArgs) !== canonical(manifest.requestedArgs)) throw new Error('the precision summary names a different launch configuration');
  const record = await verifyRecordFile(root, saved.runDir, saved.record);
  for (const k of ['fixtureHash', 'fixtureCommit', 'specHash']) if (record.identity[k] !== manifest.fixture[k]) throw new Error('precision record has a different fixture identity');
  if (record.identity.backend !== 'webgpu' || record.gate !== 'precision' || !['precision', 'incomplete'].includes(record.slot)) throw new Error('precision record is not a WebGPU precision experiment');
  const raws = record.artifacts.filter(a => a.path.endsWith('.raw.json')), launches = record.artifacts.filter(a => a.path.endsWith('.launch.json'));
  if (raws.length !== 1 || launches.length !== 1) throw new Error('precision record must have exactly one raw payload and one launch artefact');
  const launch = JSON.parse(await readFile(join(root, 'artifacts/project0', launches[0].path), 'utf8'));
  if (launch.commandLine) {
    if (launchIdentity(launch).launchHash !== record.identity.launchHash || canonical(launch.requestedArgs) !== canonical(manifest.requestedArgs)) throw new Error('precision launch artefact does not match the selected configuration');
  } else if (!record.invalidations.length) throw new Error('a precision record without a complete launch artefact must carry an invalidation');
  const { assessPrecision } = await import('./measure/precision.mjs');                             // T12; only on this path
  const again = assessPrecision({ fx: fixtures, record, raw: JSON.parse(await readFile(join(root, 'artifacts/project0', raws[0].path), 'utf8')), selected: records });
  const META = new Set(['manifest', 'manifestSha256', 'selection', 'record', 'runDir', 'args', 'requestedArgs']);
  for (const k of new Set([...Object.keys(again), ...Object.keys(saved).filter(k => !META.has(k))])) if (canonical(again[k] ?? null) !== canonical(saved[k] ?? null)) throw new Error(`precision ${k} does not recompute from its evidence`);
  return { ...again, selection: s, record: record.id, runDir: saved.runDir, identity: record.identity, implementationCommit: record.identity.implementationCommit, recordDoc: record };
}

// Fix round 1 (finding 2): the superseded summary and its record must be exactly the pinned reference set, with the expected artefact types,
// a WebGPU precision identity at ff11b35 and the selected fixture; the summary must be bound to the same selection as the accepted one.
async function verifySuperseded({ root, final, finalBytes, manifest, precision }) {
  const P = SUPERSEDED, bytes = await readFile(resolve(root, P.summary));
  if (sha256(bytes) !== P.summarySha256) throw new Error(`the superseded summary ${P.summary} is not the preserved one`);
  const s = JSON.parse(String(bytes));
  if (s.record !== P.record || s.runDir !== P.runDir) throw new Error('the superseded summary names a record other than the preserved superseded one');
  if (s.manifestSha256 !== final.manifestSha256 || s.selection?.decisionSha256 !== sha256(finalBytes)) throw new Error('the superseded summary is not bound to the verified selection');
  if (!/^\*\*Status:\*\* superseded/m.test(await readFile(resolve(root, P.note), 'utf8'))) throw new Error(`${P.note} does not mark the ff11b35 summary superseded`);
  const recordBytes = await readFile(join(root, 'artifacts/project0', P.runDir, `${P.record}.json`));
  if (sha256(recordBytes) !== P.recordSha256) throw new Error('the superseded record is not the preserved one (its artefact references or identity changed)');
  const r = await verifyRecordFile(root, P.runDir, P.record);
  const kinds = Object.keys(P.artifacts);
  if (r.artifacts.length !== kinds.length || !kinds.every(k => r.artifacts.filter(a => a.path.endsWith(k) && a.path.startsWith(`${P.runDir}/`) && a.sha256 === P.artifacts[k]).length === 1))
    throw new Error('the superseded record does not reference exactly its preserved raw, launch and chrome-gpu artefacts');
  const id = r.identity;
  if (r.gate !== 'precision' || r.slot !== 'precision' || id.backend !== 'webgpu' || id.mode !== 'headed' || id.implementationCommit !== P.implementationCommit || id.implementationHash !== P.implementationHash
    || ['fixtureHash', 'fixtureCommit', 'specHash'].some(k => id[k] !== manifest.fixture[k])) throw new Error('the superseded record is not the ff11b35 WebGPU precision experiment on the selected fixture');
  if (precision && r.id === precision.record) throw new Error('the superseded summary names the accepted precision record');
  return { summary: P.summary, summarySha256: P.summarySha256, note: P.note, status: 'superseded; user-directed run while review was pending; not the accepted T12 result',
    record: r.id, runDir: P.runDir, implementationCommit: id.implementationCommit, implementationHash: id.implementationHash, artifacts: r.artifacts.length, recordDoc: r };
}

export async function buildReport({ root, decisionPath, date, git = gitAt(root) }) {
  if (decisionPath !== CHAIN.final.decision) throw new Error(`the report covers the final campaign's decision ${CHAIN.final.decision}, not ${decisionPath}`);
  // 1. The final decision (G5-D) and the remediation decision, each recomputed by its own closer through the checked path.
  const { recorded: final, bytes: finalBytes } = await verifyClosed(CHAIN.final.decision, closeG5d, root);
  const { recorded: remediation, bytes: remBytes } = await verifyClosed(CHAIN.remediation.decision, closeRemediation, root);
  const pins = final.historical.files;
  const pinned = p => pins.find(f => f.path === p)?.sha256;
  if (pinned(CHAIN.remediation.decision) !== sha256(remBytes)) throw new Error('the remediation decision is not the one the G5-D decision pins');
  // 2. Plan note 2: the decision's profile metadata agrees with the manifest and with the reloaded profile (also covered by step 1's equality).
  const qualification = await loadQualification(CHAIN.final.profile, { root });
  const { manifest, records, attempts } = await loadCampaign(final.manifest, { root, qualification });
  validateQualification(manifest, qualification);
  for (const [k, want] of [['qualification', qualificationReference(qualification)], ['excludedTrials', excludedTrialsOf(qualification)], ['knownLimitations', knownLimitationsOf(qualification)]])
    if (canonical(final[k] ?? null) !== canonical(want) || canonical(manifest[k] ?? null) !== canonical(want)) throw new Error(`the decision's ${k} disagrees with the manifest or the reloaded profile`);
  if (final.decision.outcome === 'WebGPU selected') throw new Error('the mechanical outcome would make the E10 override meaningless; refusing to render it as an override');
  const fixtures = await loadFixtures(manifest, { root });
  // 3. webgpu-1 (no profile): recomputed through the same checked evaluator and compared with its saved gates.
  const o = CHAIN.original, oBytes = await readFile(resolve(root, o.manifest));
  if (pinned(o.manifest) !== sha256(oBytes)) throw new Error('the webgpu-1 manifest is not the one the G5-D decision pins');
  const c1 = await loadCampaign(o.manifest, { root }), fx1 = await loadFixtures(c1.manifest, { root });
  checkCoherence(c1.records.filter(r => !r.invalidations.length), c1.manifest);
  await verifyPreflight(c1.manifest, c1.records, { root });
  const v1 = await recompute([...c1.records, ...c1.attempts], fx1, { root, manifest: c1.manifest });
  const q1 = qualify(c1.manifest, c1.records, fx1, { raws: v1.raws, attempts: c1.attempts });
  const g1 = JSON.parse(await readFile(resolve(root, o.gates), 'utf8'));
  if (canonical(sameExceptOrder(q1.backend.gates)) !== canonical(sameExceptOrder(g1.backend.gates)) || canonical(q1.decision) !== canonical(g1.decision)) throw new Error('webgpu-1-gates.json does not reproduce from its evidence');
  if (unsafeFromLaunches(v1.launches)) throw new Error('webgpu-1 ran with --enable-unsafe-webgpu');
  // 4. The E10 selection is recorded where it must be.
  const decisions = await readFile(resolve(root, SELECTION.decisions), 'utf8'), platform = await readFile(resolve(root, SELECTION.platform), 'utf8');
  if (!decisions.split('\n').includes(SELECTION.heading)) throw new Error(`the E10 user selection is not recorded in ${SELECTION.decisions}`);
  if (!platform.split('\n').includes(SELECTION.selected)) throw new Error(`the platform decision does not record WebGPU as selected (${SELECTION.platform})`);
  const selection = { basis: 'user decision E10', backend: 'webgpu', text: SELECTION.text, decisions: SELECTION.decisions, platform: SELECTION.platform, platformSha256: sha256(platform) };
  // 5. Precision (T12) and the superseded ff11b35 summary.
  const precisionSaved = existsSync(resolve(root, PRECISION)) ? JSON.parse(await readFile(resolve(root, PRECISION), 'utf8')) : null;
  const precision = precisionSaved ? await verifyPrecision({ root, saved: precisionSaved, final, finalBytes, manifest, fixtures, records }) : null;
  const superseded = existsSync(resolve(root, SUPERSEDED.summary)) ? [await verifySuperseded({ root, final, finalBytes, manifest, precision })] : [];
  // 6. Every implementation identity, authenticated from its own commit, with each declared shader resolved there.
  const rem = await loadCampaign(remediation.manifest, { root, qualification: await loadQualification(JSON.parse(await readFile(resolve(root, remediation.manifest), 'utf8')).qualification.id, { root }) });
  const byImpl = new Map();
  const add = async (identity, label, record = null) => {
    const key = `${identity.implementationCommit} ${identity.implementationHash}`;
    if (!byImpl.has(key)) byImpl.set(key, { identity, usedBy: new Set(), decls: [] });
    const e = byImpl.get(key); e.usedBy.add(label);
    if (record) e.decls.push({ id: record.id, shader: declaredShader(await rawOf(root, record)) });
  };
  for (const [label, c] of [['webgpu-1', c1], ['webgpu-remediation', rem], ['webgpu-g5d', { manifest, records, attempts }]]) {
    for (const r of [...c.records, ...c.attempts]) await add(r.identity, label, r);
    if (c.manifest.preflight) await add(c.manifest.preflight, `${label} preflight`);
  }
  // Fix round 1 (finding 3): the compact verified per-trial inventory (the brief's `records`), by campaign and role.
  const compact = (campaign, role, r) => ({ campaign, role, id: r.id, gate: r.gate, slot: r.slot, mode: r.mode, invalidations: r.invalidations, metrics: r.metrics, identity: r.identity, artifacts: r.artifacts });
  const inventory = [];
  for (const [label, c] of [['webgpu-1', c1], ['webgpu-remediation', rem], ['webgpu-g5d', { manifest, records, attempts }]])
    inventory.push(...c.records.map(r => compact(label, 'selected', r)), ...c.attempts.map(r => compact(label, 'attempt', r)));
  if (precision) inventory.push(compact('precision', 'precision', precision.recordDoc));
  for (const s of superseded) inventory.push(compact('precision', 'superseded', s.recordDoc));
  if (precision) await add(precision.identity, 'precision (T12)');
  for (const s of superseded) await add(s, 'precision ff11b35 (superseded)');
  const implementations = [];
  for (const e of byImpl.values()) implementations.push({ ...await authenticateImplementation(e.identity, e.decls, { git }), usedBy: [...e.usedBy] });

  const g5Obs = Object.values(final.g5Observations).filter(x => x.slot === 'qjulia-operational');
  const g5 = { disclosure: final.disclosure, historical: final.historical.offplane, operational: g5Obs.map(x => ({ qualifying: x.qualifying, bands: x.bands, scope: x.scope, diagnostics: x.diagnostics, continuation: { componentRatio: x.continuation.componentRatio } })) };
  const backend = { gates: final.gates, remediationClosed: true };
  const chain = [
    { campaign: 'webgpu-1', verifiedAgainst: o.gates, outcome: g1.decision.outcome },
    { campaign: 'webgpu-remediation', verifiedAgainst: CHAIN.remediation.decision, outcome: remediation.decision.outcome },
    { campaign: 'webgpu-g5d', verifiedAgainst: CHAIN.final.decision, outcome: final.decision.outcome },
  ];
  const launchConfig = { args: final.args, requestedArgs: final.requestedArgs, disclosures: final.disclosures };
  const markdown = renderReport({ decision: final.decision, backend, selection, scope: final.scope, headlessRow: final.headlessRow, knownLimitations: final.knownLimitations, g5, chain, implementations,
    precision, superseded, unsafeFlag: final.unsafeFlag, launch: launchConfig });
  const assessment = precision ? Object.fromEntries(Object.entries(precision).filter(([k]) => !['identity', 'recordDoc'].includes(k))) : null;
  const results = {
    date, mechanicalDecision: final.decision, selection, scope: final.scope, unsafeFlag: final.unsafeFlag, ...launchConfig,
    qualification: final.qualification, excludedTrials: final.excludedTrials, headlessRow: final.headlessRow, knownLimitations: final.knownLimitations,
    gates: resultsGates(Object.fromEntries(Object.entries(final.gates).map(([g, r]) => [g, g === 'G5' ? { ...r, amendedBy: ['E8', 'E9'] } : r]))),
    g5, chain, implementations, precision: assessment, superseded: superseded.map(({ recordDoc, ...x }) => x), records: inventory,
    files: Object.fromEntries(await Promise.all([CHAIN.final.decision, CHAIN.remediation.decision, final.manifest, remediation.manifest, o.manifest, o.gates, SELECTION.decisions, SELECTION.platform,
      ...(precision ? [PRECISION] : []), ...(existsSync(resolve(root, INTERPRETATION)) ? [INTERPRETATION] : [])].map(async p => [p, sha256(await readFile(resolve(root, p)))]))),
  };
  return { markdown, results };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { decision: { type: 'string' }, date: { type: 'string', default: new Date().toISOString().slice(0, 10) }, out: { type: 'string', default: 'docs/reports' } } });
  const root = process.env.P0_ROOT ? resolve(process.env.P0_ROOT) : ROOT;
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) throw new Error(`--date must be YYYY-MM-DD (${values.date})`);
    const { markdown, results } = await buildReport({ root, decisionPath: values.decision, date: values.date });
    const dir = resolve(root, values.out);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${values.date}-project0-qualification.md`), markdown);
    await writeFile(join(dir, `${values.date}-project0-results.json`), JSON.stringify(results, null, 2));
    console.log(`report written: ${join(values.out, `${values.date}-project0-qualification.md`)} (mechanical outcome ${results.mechanicalDecision.outcome}; selection: ${results.selection.text})`);
  } catch (error) { console.error(`REPORT REFUSED: ${error.message}`); process.exitCode = 1; }
}
