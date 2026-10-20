// spikes/project0/campaign.mjs — node spikes/project0/campaign.mjs --name webgpu-1 [--args attempt1|remediation] [--gates G1,G4,...] [--reuse <json>]
// T10 amendments (tests/t10.test.mjs):
// - the campaign is `runCampaign(values, deps)`, run by the CLI block at the end with the real dependencies; every dependency is required, so
//   importing this module (a test) never runs a browser, and a test can only run it with fakes;
// - the name must be a qualifying campaign name before anything runs (dev, probe and precision never qualify);
// - the integrity preflight (integrity-preflight.mjs, headed, no GPU adapter or device) runs first, and must pass its seven assertions at this
//   exact implementation (qualify.mjs preflightProblems), or no gate runs; the manifest names it (verifyPreflight checks it on read);
// - the correctness verdicts that gate the performance phase, and the final verdicts, are the checked ones (evaluateGateChecked with the raw
//   payloads, through qualify.mjs gateVerdict/qualify), after recompute has verified the evidence;
// - reused records are verified and recomputed together per source manifest, so a reused G9 is bound to its reused companions.
// Fix round 1 (Codex T10 r1): G3-G5 headed; reuse rules (incl. whole timing invocation) before anything runs; the preflight with this campaign's
// flags; auxiliary evidence bound by hash; source preflights verified; incomplete attempts kept; every correctness gate evaluated whatever
// --gates names; a report is always written, failing closed.
// G5-D (prereg §8.4, §10): under project0-g5d-v1 the request is fixed (every gate, headed, no reuse, the pinned remediation launch), the
// historical references are verified before the preflight, and the G5 page alone is told the profile.
import { parseArgs } from 'node:util';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { ROOT, DEVELOPER_FLAG } from './launch.mjs';
import { GATES } from './contract.js';
import { decideBackends } from './decision.js';
import { buildManifest, checkCoherence, ABORTS, recompute, qualify, loadCampaign, loadBaseline, requiredSlots, gatesOf, verdictOf, preflightProblems, NON_QUALIFYING,
  validateReuseEntries, verifyPreflight, auxiliaryHashes } from './qualify.mjs';
import { gatePlan } from './gates.js';
import { REQUIRED_PROFILE_CAMPAIGNS, effectiveGatePlan, qualificationReference, excludedTrialsOf, knownLimitationsOf, HEADLESS_ROW, loadQualification, verifyKnownLimitations, scopeOf, dispositionsOf, addedSlotsOf, verifyHistoricalReferences } from './qualification.mjs';
import { canonical } from './contract.js';

// Fix round 1 (Codex ruling): G3, G4 and G5 run headed, as T6's development checks did; the spec names no mode for them, and headless has no
// usable device on this host (E1, E4). G1 keeps both modes (spec §4) and G2 stays headed.
export const PHASES = [
  ['correctness', [['G1', 'headed'], ['G1', 'headless'], ['G4', 'headed'], ['G5', 'headed'], ['G3', 'headed'], ['G11', 'headed'], ['G13', 'headed']]],
  ['performance', [['G2', 'headed'], ['timing', 'headed'], ['G8', 'headed'], ['G10', 'headed']]],
  ['stability', [['G12', 'headed']]],
];
// E7 / G1-D: under the verified headed-only profile the schedule is PHASES with only ['G1', 'headless'] removed; otherwise PHASES unchanged.
export const phasesFor = qualification => (qualification
  ? PHASES.map(([phase, steps]) => [phase, steps.filter(([gate, mode]) => !(gate === 'G1' && mode === 'headless'))])
  : PHASES);
const CORRECTNESS = ['G1', 'G3', 'G4', 'G5', 'G11', 'G13'];
const DEPS = ['LAUNCH', 'runSession', 'runG2', 'runPreflight', 'implementationIdentity', 'fixtureIdentity', 'readFixtures', 'loadCampaign', 'verifyPreflight', 'bindAuxiliary', 'recompute', 'writeReport', 'log'];

export async function runCampaign(values, d) {
  for (const k of DEPS) if (!d?.[k]) throw new Error(`campaign: the ${k} dependency is required (the command line supplies the real ones)`);
  if (!/^[a-z0-9-]+$/.test(values.name ?? '') || NON_QUALIFYING.has(values.name)) throw new Error(`a qualifying campaign name is required (lower-case, not dev, probe or precision): ${values.name}`);
  // E7 / G1-D: a campaign that requires a qualification profile names exactly it; it is authenticated, and its limitation evidence verified,
  // below, before the baseline, the preflight or any browser launch.
  const requiredProfile = REQUIRED_PROFILE_CAMPAIGNS[values.name];
  if (requiredProfile && values.qualification !== requiredProfile) throw new Error(`campaign ${values.name} requires --qualification ${requiredProfile} (got ${JSON.stringify(values.qualification ?? null)})`);
  if (values.qualification && (!d.loadQualification || !d.verifyKnownLimitations)) throw new Error('campaign: --qualification needs the loadQualification and verifyKnownLimitations dependencies');
  const qualification = values.qualification ? await d.loadQualification(values.qualification) : null;
  if (qualification) {
    if (qualification.doc.campaign !== values.name) throw new Error(`qualification ${qualification.id} applies to campaign ${qualification.doc.campaign}, not ${values.name}`);
    // G5-D (prereg §10): the single attempt requests every gate, headed, with no reuse, under the reviewed remediation launch configuration
    // exactly as the profile pins it; anything else is refused before the preflight or any browser launch.
    const request = qualification.doc.campaignRequest;
    if (request) {
      if (values.gates !== undefined) throw new Error(`campaign ${values.name} requests every gate (G1–G13) under ${qualification.id}; --gates ${values.gates} is not permitted`);
      let reuse; try { reuse = JSON.parse(values.reuse ?? '[]'); } catch { reuse = null; }
      if (canonical(reuse) !== canonical(request.reuse)) throw new Error(`campaign ${values.name} runs with no reuse under ${qualification.id} (--reuse '[]'), not ${values.reuse}`);
      if ((values.args ?? 'attempt1') !== qualification.doc.launch.args) throw new Error(`campaign ${values.name} runs with --args ${qualification.doc.launch.args} (the reviewed remediation launch configuration), not ${values.args ?? 'attempt1'}`);
      if (canonical(d.LAUNCH[qualification.doc.launch.args] ?? null) !== canonical(qualification.doc.launch.requestedArgs)) throw new Error(`the ${qualification.doc.launch.args} launch configuration ${JSON.stringify(d.LAUNCH[qualification.doc.launch.args] ?? null)} is not the one ${qualification.id} pins`);
    }
    await d.verifyKnownLimitations(qualification);
    if (qualification.doc.historical) {
      if (!d.verifyHistoricalReferences) throw new Error('campaign: the verifyHistoricalReferences dependency is required under this profile');
      await d.verifyHistoricalReferences(qualification);
    }
  }
  const args = values.args ?? 'attempt1';
  const only = values.gates?.split(','), reuse = JSON.parse(values.reuse ?? '[]');
  validateReuseEntries(reuse);                                                          // R1 (findings 7, 8): before anything runs
  if (!d.LAUNCH[args]) throw new Error(`unknown launch configuration: ${args}`);
  const requestedArgs = d.LAUNCH[args];
  // WebGPU remediation (prereg rev 2 §3.5): under the developer flag every recompute compares granted features with attempt 1's records.
  if (requestedArgs.includes(DEVELOPER_FLAG) && !d.loadBaseline) throw new Error('campaign: the remediation configuration needs the attempt-1 baseline (the loadBaseline dependency)');
  const baseline = requestedArgs.includes(DEVELOPER_FLAG) ? await d.loadBaseline() : null;
  const fixtures = await d.readFixtures();
  const fixture = await d.fixtureIdentity(), plan = qualification ? effectiveGatePlan(fixtures, qualification) : gatePlan(fixtures);
  if (qualification && (fixture.specHash !== qualification.doc.baseSpecHash || fixture.fixtureHash !== qualification.doc.fixtureHash)) throw new Error(`qualification ${qualification.id}: the fixture identity ${fixture.fixtureHash}/${fixture.specHash} is not the amendment's base`);
  // The integrity preflight, at this exact implementation and with this campaign's launch configuration (R1, finding 9), before any GPU work.
  const implementation = await d.implementationIdentity();
  const pf = await d.runPreflight({ mode: 'headed', args: requestedArgs });
  const pfProblems = preflightProblems(pf?.record, implementation, requestedArgs);
  if (pfProblems.length) throw new Error(`campaign refused before any gate ran: the integrity preflight does not support it (${pfProblems.join('; ')}; evidence ${pf?.runDir})`);
  const preflight = { runDir: basename(pf.runDir), implementationCommit: implementation.implementationCommit, implementationHash: implementation.implementationHash };
  // R1 (finding 5): the auxiliary evidence (preflight record, supervision sidecars, checkpoints) is bound by hash as soon as it exists.
  const bindings = {}, bindingErrors = [];
  const bindDir = async dir => { try { Object.assign(bindings, await d.bindAuxiliary(dir)); } catch (e) { bindingErrors.push(`auxiliary evidence of ${dir} could not be bound: ${e.message}`); } };
  await bindDir(preflight.runDir);
  const selected = [], attempts = [], runDirs = [], attempted = new Set(), gateErrors = {}; let stopped = null, blockedBy = null;
  const reusedKeys = new Set(reuse.map(x => `${x.gate}/${x.slot}`));
  // Reused records: each source campaign is loaded once, its preflight verified (R1, finding 7), its records verified together (so a reused
  // timing invocation keeps G9 beside its companions, finding 8), and its bindings for those records carried over.
  const bySource = new Map();
  for (const x of reuse) {
    if (!bySource.has(x.fromManifest)) bySource.set(x.fromManifest, { loaded: await d.loadCampaign(x.fromManifest), records: [] });
    const { loaded: { records: rs }, records } = bySource.get(x.fromManifest);
    const r = rs.find(y => y.id === x.recordId && y.gate === x.gate && y.slot === x.slot);
    if (!r) throw new Error(`cannot reuse ${x.recordId} as ${x.gate}/${x.slot}`);
    records.push(r); selected.push(r); attempted.add(r.gate);
  }
  for (const { loaded: { manifest: src, records: srcRecords }, records } of bySource.values()) {
    await d.verifyPreflight(src, srcRecords);
    const dirs = new Set(records.map(r => (r.artifacts.find(a => a.path.endsWith('.raw.json'))?.path ?? '').split('/').slice(0, -1).join('/')));
    for (const [path, hash] of Object.entries(src.bindings ?? {})) if (dirs.has(path.split('/').slice(0, -1).join('/'))) bindings[path] = hash;
    await d.recompute(records, fixtures, { manifest: src, baseline });
  }
  const draft = () => buildManifest({ records: selected, fixture, campaign: values.name, args, requestedArgs, runDirs, reuse, preflight, attempts, bindings, qualification });
  for (const [phase, steps] of phasesFor(qualification)) {
    for (const [gate, mode] of steps) {
      if (only && !gatesOf(gate).some(g => only.includes(g))) continue;
      const required = requiredSlots(gate, mode, plan);
      if (required.every(k => reusedKeys.has(k))) continue;                                // fully supplied by valid reuse
      if (stopped) continue;
      gatesOf(gate).forEach(g => attempted.add(g));
      // R2 (concern 3): once a gate is attempted, nothing ends the campaign without a report; a runner that throws stops it, failing closed.
      let out;
      // G5-D: only an invocation of a gate whose slots the profile amends tells its page the profile (the page cannot authenticate it; the read
      // side checks the declared form, matrix and shader against the authenticated profile)
      const extra = qualification && addedSlotsOf(qualification).some(k => gatesOf(gate).includes(k.split('/')[0])) ? `&qualification=${encodeURIComponent(qualification.id)}` : '';
      try { out = gate === 'G2' ? await d.runG2({ args, campaign: values.name }) : await d.runSession({ gate, mode, args, campaign: values.name, ...(extra ? { extra } : {}) }); }
      catch (e) {
        const message = `the ${gate} ${mode} runner failed: ${e.message}`;
        stopped = `${gate}: ${message}`;
        for (const g of gatesOf(gate)) (gateErrors[g] ??= []).push(message);
        continue;
      }
      const dir = out.runDir.split('/').at(-1);
      runDirs.push(dir);
      await bindDir(dir);
      // Select only this invocation's required, non-reused slots; other outputs stay on disk as unselected evidence. R1 (finding 2): a slot
      // outside the plan (the synthesized `incomplete` slot of an invocation that produced no result) is kept as a named attempt.
      selected.push(...out.records.filter(r => required.includes(`${r.gate}/${r.slot}`) && !reusedKeys.has(`${r.gate}/${r.slot}`)));
      attempts.push(...out.records.filter(r => !plan[r.gate]?.[r.slot]));
      const abort = out.records.flatMap(r => ABORTS.map(f => f(r)).filter(Boolean));
      if (abort.length) stopped = `${gate}: ${[...new Set(abort)].join(', ')}`;
    }
    if (phase === 'correctness' && !stopped) {
      // Correctness before benchmarking: a numerical or functional failure is diagnosed before performance work starts. The verdict is the
      // checked one, over verified evidence and its raw payloads. R1 (finding 3): every correctness gate is evaluated, whatever --gates names
      // (--gates is the rerun set, never a waiver), over the campaign's own and its reused records.
      try {
        const m = draft();
        const { raws, errors: rejected } = await d.recompute([...selected, ...attempts], fixtures, { manifest: m, collect: true, baseline, qualification });
        for (const g of CORRECTNESS) {
          const r = verdictOf(g, { records: selected, attempts, manifest: m, fixtures, raws, rejected, errors: bindingErrors, gateErrors, qualification });
          if (r.status !== 'pass') { stopped = `correctness gate ${g} is ${r.status}`; if (r.status === 'fail') blockedBy = g; break; }
        }
      } catch (e) { stopped = `correctness verification failed: ${e.message}`; }
    }
  }
  // notRun is reserved for gates that were never attempted; a partially attempted gate keeps its records and evaluates as incomplete.
  const notRun = {};
  for (const g of GATES) {
    if (attempted.has(g) || (only && !only.includes(g))) continue;
    notRun[g] = { status: 'not run', reason: stopped ? `campaign stopped: ${stopped}` : 'not requested', ...(stopped && blockedBy ? { blockedBy } : {}) };
  }
  // R1 (finding 4): verification never prevents the report. A record that fails verification makes its gate invalid/inconclusive; any other
  // failure here leaves every attempted gate invalid/inconclusive and the decision inconclusive, with the failure recorded.
  let manifest = null, backend, decision, failure = null, verificationErrors = [], g5Observations = {};
  try {
    manifest = buildManifest({ records: selected, fixture, campaign: values.name, args, requestedArgs, runDirs, notRun, reuse, preflight, attempts, bindings, qualification });
    const errors = [...bindingErrors];
    // Coherence binds the evidence that can support a verdict; an invalidated record (e.g. an honest failed launch with a fallback identity)
    // cannot pass and keeps its own identity.
    try { checkCoherence(selected.filter(r => !r.invalidations.length), manifest); } catch (e) { errors.push(e.message); }
    const { raws, errors: rejected, g5Observations: observed } = await d.recompute([...selected, ...attempts], fixtures, { manifest, collect: true, baseline, qualification });
    g5Observations = observed ?? {};
    ({ backend, decision } = qualify(manifest, selected, fixtures, { raws, attempts, rejected, errors, gateErrors, qualification }));
    // R2 (finding 13): every collected verification or invocation error is a tooling error, reported and reflected in the exit status
    verificationErrors = [...errors, ...Object.entries(gateErrors).flatMap(([g, ms]) => ms.map(x => `${g}: ${x}`)), ...Object.entries(rejected).map(([id, x]) => `${id}: ${x}`)];
  } catch (e) {
    failure = e.message;
    const evidence = g => [...selected, ...attempts].filter(r => gatesOf(r.gate).includes(g)).map(r => r.id);
    backend = { remediationClosed: false, gates: Object.fromEntries(GATES.map(g => [g, attempted.has(g)
      ? { gate: g, status: 'invalid/inconclusive', reasons: [`verification: ${failure}`], evidenceIds: evidence(g) }
      : { gate: g, status: 'not run', reason: notRun[g]?.reason ?? 'not requested', reasons: [notRun[g]?.reason ?? 'not requested'], evidenceIds: [] }])) };
    decision = decideBackends(backend);
  }
  const manifestDoc = { ...(manifest ?? { fixture, campaign: values.name, args, requestedArgs, runDirs, notRun, reuse, preflight, bindings,
    selected: selected.map(r => r.id), attempts: Object.fromEntries(attempts.map(a => [a.id, { gate: a.gate, slot: a.slot, identity: a.identity }])),
    ...(qualification ? { qualification: qualificationReference(qualification), excludedTrials: excludedTrialsOf(qualification), knownLimitations: knownLimitationsOf(qualification) } : {}) }),
    stopped, verificationErrors, ...(failure ? { verificationFailure: failure } : {}) };
  // Fix round 1 (finding 1): the rederived G5 observations are reported beside the verdicts; a numerical failure is named even when G5 is invalid.
  // E7: the scope disclosure, the excluded trial and the known limitation travel with the verdicts, separately from them (never a gate row).
  const scope = qualification ? { qualification: qualificationReference(qualification), scope: scopeOf(qualification), excludedTrials: excludedTrialsOf(qualification), knownLimitations: knownLimitationsOf(qualification), headlessRow: HEADLESS_ROW,
    ...(qualification.doc.dispositions ? { dispositions: dispositionsOf(qualification) } : {}) } : {};
  await d.writeReport(values.name, manifestDoc, { backend, decision, g5Observations, ...scope, ...(failure ? { verificationFailure: failure } : {}) });
  if (qualification) d.log(scopeOf(qualification));
  for (const [id, o] of Object.entries(g5Observations)) if (o.slot === 'qjulia-operational') d.log(`G5 operational ${id}: ${o.invalidation ? `INVALID: ${o.invalidation}` : `qualifying ${JSON.stringify(o.metrics)}`}; S3 diagnostics (E9, non-gating): ${o.diagnostics?.outsideNumericalCriteria ?? '?'} of ${o.diagnostics?.samples ?? '?'} outside the numerical criteria, ${o.diagnostics?.statusIndexDisagreements ?? '?'} status/index disagreements; forced continuation (E8 diagnostic): componentRatio=${o.continuation?.componentRatio ?? 'not collected'}${o.continuation ? ` matches ${o.continuation.matches.join(', ') || 'none'}` : ''}`);
  for (const [id, o] of Object.entries(g5Observations)) if (o.slot === 'qjulia-offplane') d.log(`G5 observation ${id}: componentRatio=${o.componentRatio}${o.numericalFailure ? ' (NUMERICAL FAILURE)' : ''}; compensation ${o.compensation ? (o.compensation.validated ? 'validated' : `unvalidated (matches ${o.compensation.matches.join(', ') || 'none'})`) : 'not declared'}`);
  for (const [g, r] of Object.entries(backend.gates)) d.log(`${g}: ${r.status}${r.reasons?.length ? ` — ${r.reasons.slice(0, 3).join('; ')}` : ''}`);
  d.log(`decision (remediation not yet closed): ${decision.outcome} — next: ${decision.next}${stopped ? `\nSTOPPED: ${stopped}` : ''}${failure ? `\nVERIFICATION FAILURE: ${failure}` : ''}`);
  return { manifest, backend, decision, stopped, failure, verificationErrors };
}

// R2 (finding 13): non-zero when verification or an invocation failed, or the report fell back; a measured gate failure is a result, exit 0.
export const exitStatus = result => (result.failure || result.verificationErrors?.length ? 1 : 0);

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { name: { type: 'string' }, args: { type: 'string', default: 'attempt1' }, gates: { type: 'string' }, reuse: { type: 'string', default: '[]' }, qualification: { type: 'string' } } });
  const { runSession, runG2, LAUNCH } = await import('./run.mjs');
  const { runIntegrityPreflight } = await import('./integrity-preflight.mjs');
  const { fixtureIdentity, implementationIdentity } = await import('./evidence.mjs');
  const dir = resolve(ROOT, 'docs/reports/project0');
  const result = await runCampaign(values, {
    LAUNCH, runSession, runG2, runPreflight: runIntegrityPreflight, implementationIdentity, fixtureIdentity, loadCampaign, recompute, log: console.log, loadBaseline: () => loadBaseline(), loadQualification: id => loadQualification(id), verifyKnownLimitations: ctx => verifyKnownLimitations(ctx), verifyHistoricalReferences: ctx => verifyHistoricalReferences(ctx),
    verifyPreflight: (manifest, records) => verifyPreflight(manifest, records), bindAuxiliary: runDir => auxiliaryHashes(runDir),
    readFixtures: async () => JSON.parse(await readFile(resolve(ROOT, 'spikes/project0/fixtures.json'), 'utf8')),
    writeReport: async (name, manifest, gates) => {
      await mkdir(dir, { recursive: true });
      await writeFile(resolve(dir, `${name}-manifest.json`), JSON.stringify(manifest, null, 2));
      await writeFile(resolve(dir, `${name}-gates.json`), JSON.stringify(gates, null, 2));
    },
  });
  process.exitCode = exitStatus(result);
}
