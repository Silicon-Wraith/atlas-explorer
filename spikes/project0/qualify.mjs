// spikes/project0/qualify.mjs — selection, coherence, artefact and launch verification, recomputation and evaluation (no hardware).
// Every build-time rule is applied again when a manifest is read back, so an edited manifest file cannot smuggle in a verdict.
// T10 amendments (Codex T9 r7 carry-forward list; each is marked "T10:" below and tested in tests/t10.test.mjs):
// - every verdict comes from evaluateGateChecked (gates-checked.js) with the raw payloads, never bare evaluateGate, and an invalid verdict keeps
//   the records' original invalidations beside the timing reason (gateVerdict);
// - recompute parses and returns every record's raw payload (invalidated ones included) and, for every uninvalidated record, requires its
//   invocation's complete supervision sidecar, reconciles G12's checkpoint files with its cycleLog, and binds G9's source windows to validated
//   companions of the same invocation (validateSources), all before its metrics are rederived;
// - the integrity preflight (seven assertions, recomputed from its saved page results) must be at the implementation of the selected records;
// - loadCampaign reads only records from a run directory (a supervision sidecar or checkpoint is never selected).
// Fix round 1 (Codex T10 r1, "R1:" below): checkpoint payloads are validated; an invocation that produced only a synthesized incomplete slot is
// kept as a named attempt; recompute can collect per-record failures (the campaign reports them as invalid/inconclusive); supervision,
// checkpoint and preflight files are bound by hash in the manifest; a saved launch must be sandboxed and carry its requested flags; reuse
// rules (including whole-invocation timing reuse) are checked on build and read; every source campaign's preflight is verified; the preflight
// is checked against the campaign's own launch configuration.
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { canonical, GATES } from './contract.js';
import { gatePlan } from './gates.js';
import { evaluateGateChecked } from './gates-checked.js';
import { decideBackends } from './decision.js';
import { sha256, launchIdentity } from './evidence.mjs';
import { metricsFor } from './measure/index.mjs';
import { validateSources } from './measure/timing.mjs';
import { readVerifiedFile } from './fixture-files.mjs';
import { ROOT, assertSandboxed } from './launch.mjs';
import { STOPS } from './session-utils.mjs';
import { WINDOW_PLANS } from './supervision-plan.js';
import { evaluatePreflight } from './integrity-preflight.mjs';

export const NON_QUALIFYING = new Set(['dev', 'probe', 'precision']);
const sameArgs = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function validateStops(notRun = {}, trials = {}) {
  for (const [gate, entry] of Object.entries(notRun)) {
    if (!GATES.includes(gate)) throw new Error(`notRun.${gate}: unknown gate`);
    const keys = Object.keys(entry).sort().join(',');
    if (entry.status !== 'not run' || !['reason,status', 'blockedBy,reason,status'].includes(keys) || !entry.reason) throw new Error(`notRun.${gate}: only 'not run' with a reason (and optional blockedBy) is allowed`);
    if (Object.keys(trials).some(k => k.startsWith(`${gate}/`))) throw new Error(`notRun.${gate} cannot coexist with selected trials for that gate`);
  }
}

// Per-record selection rules: qualifying campaign (or an exactly justified reuse), not an experiment, fixture identity, no duplicates.
export function validateSelection(manifest, records, plan = null) {
  if (!/^[a-z0-9-]+$/.test(manifest.campaign || '') || NON_QUALIFYING.has(manifest.campaign)) throw new Error('a qualifying campaign name is required');
  const seen = new Set();
  for (const r of records) {
    if (r.experiment) throw new Error(`experiment record ${r.id} cannot qualify`);
    const reused = (manifest.reuse ?? []).find(x => x.gate === r.gate && x.slot === r.slot && x.recordId === r.id);
    if (!r.campaign || NON_QUALIFYING.has(r.campaign) || (r.campaign !== manifest.campaign && !reused)) throw new Error(`record ${r.id}: campaign ${r.campaign ?? '(none)'} is not selectable here`);
    for (const k of ['fixtureHash', 'fixtureCommit', 'specHash']) if (r.identity[k] !== manifest.fixture[k]) throw new Error(`record ${r.id}: fixture identity differs`);
    const key = `${r.gate}/${r.slot}`;
    if (seen.has(key)) throw new Error(`duplicate selection for ${key}`);
    seen.add(key);
    if (manifest.trials[key] && manifest.trials[key].id !== r.id) throw new Error(`record ${r.id} is not the selected trial for ${key}`);
    if (plan && !plan[r.gate]?.[r.slot]) throw new Error(`record ${r.id}: unknown slot ${key}`);
  }
}

// T10: `preflight` ({runDir, implementationCommit, implementationHash}) names the passing integrity preflight the campaign ran first.
// R1 (finding 7): one reuse rule set, applied on build and on every read. Each entry names its gate, slot, source manifest, record and reason,
// once. R1 (finding 8): the timing invocation (G6, G7 and G9) is reused whole from one source campaign or rerun whole, because G9 is bound to
// the twelve windows of its own invocation; mixing a rerun with reused companions would also select one trial of a slot over another.
export const TIMING_KEYS = Object.freeze([...WINDOW_PLANS.timing.map(w => w.name), 'G9/warmed']);
export function validateReuseEntries(reuse = []) {
  if (!Array.isArray(reuse)) throw new Error('reuse must be a list');
  const keys = new Set();
  for (const x of reuse) {
    if (!x?.gate || !x.slot || !x.reason || !x.fromManifest || !x.recordId) throw new Error(`reuse of ${x?.gate}/${x?.slot} needs gate, slot, fromManifest, recordId and a reason`);
    const key = `${x.gate}/${x.slot}`;
    if (keys.has(key)) throw new Error(`reuse of ${key} is listed twice`);
    keys.add(key);
  }
  const timing = reuse.filter(x => TIMING_KEYS.includes(`${x.gate}/${x.slot}`));
  if (timing.length && (timing.length !== TIMING_KEYS.length || new Set(timing.map(x => x.fromManifest)).size !== 1))
    throw new Error(`the timing invocation (G6, G7 and G9, ${TIMING_KEYS.length} slots) is reused whole from one source campaign or rerun whole; ${timing.length} of its slots are reused`);
}
export function validateReuse(manifest) {
  validateReuseEntries(manifest.reuse ?? []);
  for (const x of manifest.reuse ?? []) if (manifest.trials?.[`${x.gate}/${x.slot}`]?.id !== x.recordId) throw new Error(`reuse of ${x.recordId} is not reflected in the selection`);
}

// R1 (finding 2): an invocation that produced no result leaves a synthesized slot outside the plan (`incomplete`). It is never a selected slot,
// but it is named in the manifest (`attempts`), verified like any record, and its reasons and id join its gates' verdicts. It must be this
// campaign's, carry its invalidations and match the manifest exactly; every named attempt must be supplied.
export function validateAttempts(manifest, attempts = []) {
  const named = manifest.attempts ?? {};
  if (attempts.length !== Object.keys(named).length) throw new Error(`the manifest names ${Object.keys(named).length} attempts, ${attempts.length} supplied`);
  for (const a of attempts) {
    const e = named[a.id];
    if (!e || e.gate !== a.gate || e.slot !== a.slot || canonical(e.identity) !== canonical(a.identity)) throw new Error(`attempt ${a.id} is not one the manifest names`);
    if (a.experiment || a.campaign !== manifest.campaign) throw new Error(`attempt ${a.id}: campaign ${a.campaign} is not this campaign's`);
    for (const k of ['fixtureHash', 'fixtureCommit', 'specHash']) if (a.identity?.[k] !== manifest.fixture[k]) throw new Error(`attempt ${a.id}: fixture identity differs`);
    if (!Array.isArray(a.invalidations) || !a.invalidations.length) throw new Error(`attempt ${a.id} carries no invalidation`);
  }
}

// T10: `preflight` ({runDir, implementationCommit, implementationHash}) names the passing integrity preflight the campaign ran first.
// R1: `attempts` (records) and `bindings` ({path: sha256} of the auxiliary evidence) are named too.
export function buildManifest({ records, fixture, campaign, args, requestedArgs, runDirs = [], notRun = {}, reuse = [], preflight = null, attempts = [], bindings = {} }) {
  validateReuseEntries(reuse);
  const manifest = { fixture, campaign, args, requestedArgs, runDirs, trials: {}, notRun, reuse, ...(preflight ? { preflight } : {}),
    attempts: Object.fromEntries(attempts.map(a => [a.id, { gate: a.gate, slot: a.slot, identity: a.identity }])), bindings: { ...bindings } };
  validateSelection(manifest, records);
  for (const r of records) manifest.trials[`${r.gate}/${r.slot}`] = { id: r.id, identity: r.identity };
  validateStops(notRun, manifest.trials);
  validateReuse(manifest);
  validateAttempts(manifest, attempts);
  return manifest;
}

// R1 (finding 5): the auxiliary evidence of a run directory (supervision sidecars, G12 checkpoints, the preflight record), by path and hash.
export const AUXILIARY = /^(supervision[A-Za-z0-9.-]*|checkpoint-\d+|integrity-preflight)\.json$/;
export async function auxiliaryHashes(dir, { root = ROOT } = {}) {
  const out = {};
  for (const name of (await readdir(join(root, 'artifacts/project0', dir))).sort()) if (AUXILIARY.test(name)) out[`${dir}/${name}`] = sha256(await readFile(join(root, 'artifacts/project0', dir, name)));
  return out;
}

export function checkCoherence(records, manifest) {
  if (!records.length) return;
  const ref = records[0].identity, byMode = {};
  for (const r of records) {
    for (const k of ['backend', 'browserVersion', 'browserExecutable', 'driver', 'session']) if (r.identity[k] !== ref[k]) throw new Error(`incoherent evidence: ${k} differs in ${r.id}`);
    byMode[r.identity.mode] ??= r.identity.launchHash;
    if (byMode[r.identity.mode] !== r.identity.launchHash) throw new Error(`incoherent evidence: launch configuration differs in ${r.id}`);
  }
  const reused = r => manifest.reuse?.some(x => x.gate === r.gate && x.slot === r.slot && x.recordId === r.id && x.reason);
  const impl = records.find(r => !reused(r))?.identity;
  for (const r of records) if (impl && !reused(r) && (r.identity.implementationCommit !== impl.implementationCommit || r.identity.implementationHash !== impl.implementationHash)) throw new Error(`incoherent evidence: implementation identity differs in ${r.id} without a justified reuse`);
}

// The campaign's stop conditions: the shared classifier (T5 session-utils), applied to each record.
export const ABORTS = STOPS.map(([reason, test]) => record => (test({ metrics: {}, invalidations: [], ...record }) ? reason : null));

// Which slots one runner invocation must provide; it is skipped only when every one of them is supplied by valid reuse.
export const gatesOf = g => (g === 'timing' ? ['G6', 'G7', 'G9'] : [g]);
export function requiredSlots(gate, mode, plan) {
  return gatesOf(gate).flatMap(g => Object.keys(plan[g] ?? {}).filter(slot => g !== 'G1' || slot === mode).map(slot => `${g}/${slot}`));
}

// The frozen fixture bytes bound to the manifest. In the repository the T4 provenance verification also applies.
export async function loadFixtures(manifest, { root = ROOT, provenance = existsSync(join(root, '.git')) } = {}) {
  const bytes = await readFile(resolve(root, 'spikes/project0/fixtures.json'));
  if (sha256(bytes) !== manifest.fixture.fixtureHash) throw new Error('fixtures.json does not match the selected manifest\'s fixture hash');
  if (provenance) { const { identity } = await readVerifiedFile(false); if (identity.fixtureHash !== manifest.fixture.fixtureHash || identity.fixtureCommit !== manifest.fixture.fixtureCommit) throw new Error('T4 provenance verification disagrees with the manifest'); }
  return JSON.parse(bytes);
}

// T10: only evidence records. A run directory also holds supervision sidecars (supervision*.json) and G12 checkpoints, which have no gate,
// slot or id; the brief's filter let them through, and `trials['undefined/undefined']?.id === undefined` then selected them.
const isRecord = r => r?.schema === 1 && typeof r.id === 'string' && r.id && typeof r.gate === 'string' && typeof r.slot === 'string';
async function recordsIn(root, dir) {
  const out = [];
  for (const name of await readdir(join(root, 'artifacts/project0', dir))) {
    if (!name.endsWith('.json') || name.endsWith('.raw.json') || name.endsWith('.launch.json') || name.startsWith('checkpoint-') || name.startsWith('supervision')) continue;
    const r = JSON.parse(await readFile(join(root, 'artifacts/project0', dir, name), 'utf8'));
    if (isRecord(r)) out.push(r);
  }
  return out;
}
const selectedIn = (manifest, r) => { const t = manifest.trials[`${r.gate}/${r.slot}`]; return Boolean(t) && t.id === r.id; };

export async function loadCampaign(manifestPath, { root = ROOT } = {}) {
  const manifest = JSON.parse(await readFile(resolve(root, manifestPath), 'utf8'));
  validateStops(manifest.notRun, manifest.trials);
  validateReuse(manifest);
  const records = [], attempts = [];
  for (const dir of manifest.runDirs) for (const r of await recordsIn(root, dir)) { if (selectedIn(manifest, r)) records.push(r); else if (manifest.attempts?.[r.id]) attempts.push(r); }
  for (const x of manifest.reuse ?? []) {
    const { manifest: source, records: sourceRecords } = await loadCampaign(x.fromManifest, { root });
    const r = sourceRecords.find(y => y.id === x.recordId && y.gate === x.gate && y.slot === x.slot && selectedIn(source, y));
    if (!r) throw new Error(`reused record ${x.recordId} is not selected for ${x.gate}/${x.slot} in ${x.fromManifest}`);
    if (manifest.trials[`${x.gate}/${x.slot}`]?.id !== x.recordId) throw new Error(`reuse of ${x.recordId} is not reflected in the selection`);
    // R1: the reused evidence keeps its source campaign's auxiliary bindings
    for (const [path, hash] of Object.entries(source.bindings ?? {})) if (path.startsWith(`${dirOf(r)}/`) && manifest.bindings?.[path] !== hash) throw new Error(`the binding of reused evidence ${path} differs from its source campaign's`);
    records.push(r);
  }
  for (const key of Object.keys(manifest.trials)) if (!records.some(r => `${r.gate}/${r.slot}` === key)) throw new Error(`selected trial ${key} has no record`);
  validateSelection(manifest, records);
  validateAttempts(manifest, attempts);
  return { manifest, records, attempts };
}

// T10: an invocation's supervision sidecar (session-utils, T9 fix rounds 2-3). The invocation of G6, G7 and G9 is `timing`; G2 writes one
// sidecar per wait (`supervision-fresh-<i>.json`, and `supervision-warm.json`, which also holds fresh-2's window, the channel being shared).
// Successful evidence needs failure null, complete, the gate's plan, its windows in plan order, each closed and complete within its fixed bound and
// after the previous one, and every planned checkpoint (G12: 60). Returns the problems.
export const invocationOf = gate => (['G6', 'G7', 'G9'].includes(gate) ? 'timing' : gate);
export const sidecarName = record => (record.gate === 'G2' ? `supervision-${record.slot}.json` : 'supervision.json');
export function supervisionProblems(record, sidecar) {
  const plan = WINDOW_PLANS[invocationOf(record.gate)] ?? [], names = plan.map(w => w.name);
  const expected = record.gate === 'G2' && record.slot === 'warm' ? [...names, ...names] : names;
  if (!sidecar || typeof sidecar !== 'object' || !Array.isArray(sidecar.windows)) return ['no supervision record'];
  const p = [];
  if (sidecar.failure !== null) p.push(`failure ${JSON.stringify(sidecar.failure)}`);
  if (sidecar.complete !== true) p.push(`complete is ${JSON.stringify(sidecar.complete)}`);
  if (!sameArgs(sidecar.plan, names)) p.push(`plan ${JSON.stringify(sidecar.plan)} is not ${JSON.stringify(names)}`);
  const got = sidecar.windows.map(w => w?.name);
  if (!sameArgs(got, expected)) p.push(`windows ${JSON.stringify(got)} are not ${JSON.stringify(expected)}`);
  sidecar.windows.forEach((w, i) => {
    const bound = plan.find(x => x.name === w?.name);
    if (!bound) return;
    if (w.complete !== true || !Number.isFinite(w.openedAt) || !Number.isFinite(w.closedAt) || w.closedAt < w.openedAt) p.push(`${w.name}: not closed and complete`);
    else if (w.closedAt - w.openedAt > bound.boundMs) p.push(`${w.name}: lasted ${w.closedAt - w.openedAt} ms, above its ${bound.boundMs} ms bound`);
    if (i > 0 && !(w.openedAt >= sidecar.windows[i - 1]?.closedAt)) p.push(`${w.name}: opened before the previous window closed`);
    if (bound.checkpoints !== undefined && !(w.checkpoints === bound.checkpoints && w.expectedCheckpoints === bound.checkpoints)) p.push(`${w.name}: ${w.checkpoints} of ${bound.checkpoints} checkpoints`);
  });
  return p;
}

// T10: G12's checkpoint files against its cycleLog (the T9 Step 8 reading rule, Codex T9 r7). `checkpoints` maps N to checkpoint-N.json. Exactly
// checkpoint-0 .. checkpoint-(cycleCount-1); checkpoint N names cycle N, its finite t lies between the cycle's last phase end and its checkpoint send,
// and its deadlineMisses counts the preceding cycles' misses (an overrun reply or a skipped phase), as does the raw total. The schedule, spans,
// overruns, wall time, maintenance and inventory are validated by the G12 metric derivation (validateCycleLog), which recompute reruns.
export function checkpointProblems(raw, checkpoints, fx) {
  const count = fx.stability.cycleCount, cycleMs = fx.stability.cycleMs, p = [];
  const ns = Object.keys(checkpoints).sort((a, b) => Number(a) - Number(b));
  const want = Array.from({ length: count }, (_, i) => String(i));
  if (!sameArgs(ns, want)) p.push(`checkpoint files must be exactly checkpoint-0 .. checkpoint-${count - 1}, found ${ns.length} (${ns.slice(0, 3).join(', ')}${ns.length > 3 ? ` … ${ns.at(-1)}` : ''})`);
  const log = raw?.cycleLog;
  if (!Array.isArray(log) || log.length !== count) return [...p, `cycleLog has ${Array.isArray(log) ? log.length : 'no'} cycles, not ${count}`];
  let preceding = 0;
  for (let n = 0; n < count; n++) {
    const c = log[n], cp = checkpoints[n], lastEnd = c?.phases?.at?.(-1)?.endMs;
    if (cp !== undefined) {                                                         // R1 (finding 1): a present file must hold a complete payload
      if (!cp || typeof cp !== 'object' || Array.isArray(cp)) p.push(`checkpoint ${n} is not a checkpoint object (${JSON.stringify(cp)})`);
      else {
        if (!Number.isInteger(cp.cycle) || cp.cycle !== n) p.push(`checkpoint ${n} names cycle ${cp.cycle}`);
        if (!(Number.isFinite(cp.t) && Number.isFinite(lastEnd) && Number.isFinite(c.checkpointSentMs) && cp.t >= lastEnd && cp.t <= c.checkpointSentMs)) p.push(`checkpoint ${n}: t ${cp.t} is not within [${lastEnd}, ${c?.checkpointSentMs}]`);
        if (!Number.isInteger(cp.deadlineMisses) || cp.deadlineMisses !== preceding) p.push(`checkpoint ${n}: deadlineMisses ${cp.deadlineMisses}, but ${preceding} preceding cycles missed`);
      }
    }
    if (c?.checkpointRepliedMs > c?.c0 + cycleMs || c?.phases?.some?.(x => x.skipped)) preceding++;
  }
  if (raw.deadlineMisses !== preceding) p.push(`deadlineMisses ${raw.deadlineMisses}, but ${preceding} cycles missed`);
  return p;
}

// T10: a record's invocation directory (relative to artifacts/project0) is that of its raw payload.
const dirOf = r => { const raw = r.artifacts?.find(a => a.path.endsWith('.raw.json'))?.path ?? ''; return raw.split('/').slice(0, -1).join('/'); };

// T10: G9's source windows, each bound to a validated companion record of the same invocation (measure/timing.mjs validateSources, as finalise
// applies it at write time). A G9 raw must name its sources. Returns the problems.
export function sourceProblems(record, records, raws) {
  const raw = raws[record.id];
  if (!Array.isArray(raw?.sources)) return [`G9: ${record.id} names no source windows`];
  const dir = dirOf(record);
  return validateSources(raw, (gate, slot) => {
    const c = records.find(x => x.gate === gate && x.slot === slot && dirOf(x) === dir);
    return c ? { invalidations: c.invalidations, raw: raws[c.id] } : null;
  });
}

// Re-hash every artefact; verify the launch artefact against the record's configuration identity and the declared flags; parse every record's
// single raw payload (T10: returned as `raws`, invalidated records included); for every uninvalidated record, check its supervision, G12's
// checkpoints and G9's binding (T10), then rederive its metrics from its raw payload.
// R1: every saved effective command line must be sandboxed, keep its GPU watchdog and carry each requested flag (finding 6); supervision and
// checkpoint files are read only through their manifest binding (finding 5); with `collect`, a record's verification failure is returned in
// `errors` ({id: message}) instead of thrown, so a campaign can report it (finding 4). A G9 record is checked after its companions, and a
// companion that failed verification does not count.
export async function recompute(records, fixtures, { root = ROOT, manifest = null, collect = false } = {}) {
  const launches = [], raws = {}, errors = {};
  const at = path => join(root, 'artifacts/project0', path);
  const fail = (r, e) => { if (!collect) throw e; errors[r.id] = e.message; };
  // An auxiliary file is read only if its exact bytes are bound by the manifest; a missing file reads as undefined.
  const readBound = async path => {
    let bytes;
    try { bytes = await readFile(at(path)); } catch { return undefined; }
    const want = manifest?.bindings?.[path];
    if (want !== sha256(bytes)) throw new Error(`${path}: ${want ? 'its bytes differ from the hash bound in the manifest' : 'not bound by the manifest'}`);
    return JSON.parse(bytes);
  };
  for (const r of records) {
    try {
      for (const a of r.artifacts) if (sha256(await readFile(at(a.path))) !== a.sha256) throw new Error(`artefact hash mismatch: ${a.path}`);
      const rawFiles = r.artifacts.filter(a => a.path.endsWith('.raw.json')), launch = r.artifacts.filter(a => a.path.endsWith('.launch.json'));
      if (rawFiles.length !== 1) throw new Error(`record ${r.id} must have exactly one raw payload`);
      if (launch.length !== 1) throw new Error(`record ${r.id} must have exactly one launch artefact`);
      const info = JSON.parse(await readFile(at(launch[0].path), 'utf8'));
      const complete = Boolean(info.commandLine && info.profile && info.mode && Array.isArray(info.requestedArgs));
      // A qualifying record needs a complete launch artefact; an honestly failed launch may be incomplete, but must carry an invalidation.
      if (!complete && !r.invalidations.length) throw new Error(`record ${r.id}: an uninvalidated record needs a complete launch artefact`);
      if (complete) {
        if (launchIdentity(info).launchHash !== r.identity.launchHash || info.mode !== r.identity.mode) throw new Error(`record ${r.id}: its launch artefact does not reproduce its configuration identity and mode`);
        if (manifest?.requestedArgs && !sameArgs(info.requestedArgs, manifest.requestedArgs)) throw new Error(`record ${r.id} was launched with flags other than the manifest's declared configuration`);
        try { assertSandboxed(info.commandLine); } catch (e) { throw new Error(`record ${r.id}: its saved launch is not admissible: ${e.message}`); }
        const tokens = info.commandLine.split(/\s+/), absent = info.requestedArgs.filter(a => !tokens.includes(a));
        if (absent.length) throw new Error(`record ${r.id}: requested ${absent.join(' ')} absent from the effective command line`);
        launches.push(info);
      }
      try { raws[r.id] = JSON.parse(await readFile(at(rawFiles[0].path), 'utf8')); }
      catch (e) { throw new Error(`record ${r.id}: its raw payload is not readable JSON (${e.message})`); }
    } catch (e) { fail(r, e); }
  }
  const order = [...records.filter(r => r.gate !== 'G9'), ...records.filter(r => r.gate === 'G9')];
  for (const r of order) {
    if (errors[r.id] || r.invalidations.length) continue;
    try {
      const dir = dirOf(r);
      const sidecar = await readBound(join(dir, sidecarName(r)));
      const supervision = supervisionProblems(r, sidecar ?? null);
      if (supervision.length) throw new Error(`record ${r.id}: its invocation's supervision does not support clean evidence (${sidecarName(r)}: ${supervision.join('; ')})`);
      if (r.gate === 'G12') {
        const checkpoints = {};
        for (const name of await readdir(at(dir))) {
          if (!name.startsWith('checkpoint-')) continue;
          const m = /^checkpoint-(0|[1-9]\d*)\.json$/.exec(name), payload = await readBound(join(dir, name));
          checkpoints[m ? m[1] : name] = m ? payload : null;
        }
        const problems = checkpointProblems(raws[r.id], checkpoints, fixtures);
        if (problems.length) throw new Error(`record ${r.id}: its checkpoints do not reconcile with its cycleLog: ${problems.join('; ')}`);
      }
      if (r.gate === 'G9') {
        const problems = sourceProblems(r, records.filter(x => !errors[x.id]), raws);
        if (problems.length) throw new Error(`record ${r.id}: its source windows are not bound to validated companions of its invocation: ${problems.join('; ')}`);
      }
      const again = await metricsFor(r.gate, r.slot, raws[r.id], fixtures);
      if (canonical(again) !== canonical(r.metrics)) throw new Error(`metrics for ${r.id} do not recompute from its raw payload`);
    } catch (e) { fail(r, e); }
  }
  return { records, launches, raws, errors };
}

// From verified launch artefacts: the effective command line decides, and must be consistent with the requested arguments.
export function unsafeFromLaunches(launches) {
  const flag = '--enable-unsafe-webgpu';
  for (const l of launches) if (l.requestedArgs.includes(flag) && !l.commandLine.split(/\s+/).includes(flag)) throw new Error('requested --enable-unsafe-webgpu is absent from the effective command line');
  return launches.some(l => l.commandLine.split(/\s+/).includes(flag));
}

// T10: the read-time evaluator (T6 fix rounds 4-5) with the required raw payloads. An invalid verdict keeps the gate's records' own
// invalidations beside the wrapper's timing reason, so the original evidence of why a trial failed is never replaced.
export function gateVerdict(gate, rows, manifest, fixtures, raws) {
  const result = evaluateGateChecked(gate, rows, manifest, fixtures, { raws });
  if (result.status !== 'invalid/inconclusive') return result;
  return { ...result, reasons: [...new Set([...result.reasons, ...rows.flatMap(r => (Array.isArray(r.invalidations) ? r.invalidations : []))])] };
}

// R1 (findings 2 and 4): one gate's verdict over everything the campaign holds for it. A selected record that failed verification
// (`rejected`, from recompute's collected errors), a campaign-wide verification error (`errors`, e.g. coherence or binding), or an attempt of an
// invocation that covers the gate makes it invalid/inconclusive, with those reasons, the checked verdict's reasons, and the attempts' ids. A
// verification problem is never a measured failure.
export function verdictOf(gate, { records, attempts = [], manifest, fixtures, raws, rejected = {}, errors = [] }) {
  const rows = records.filter(r => r.gate === gate), verdict = gateVerdict(gate, rows, manifest, fixtures, raws);
  const tried = attempts.filter(a => gatesOf(a.gate).includes(gate));
  const bad = [...rows, ...tried].filter(r => rejected[r.id]).map(r => `verification: ${r.id}: ${rejected[r.id]}`);
  if (!bad.length && !tried.length && !errors.length) return verdict;
  return { gate, status: 'invalid/inconclusive',
    reasons: [...new Set([...errors.map(e => `verification: ${e}`), ...bad, ...tried.flatMap(a => a.invalidations.map(x => `attempt ${a.id}: ${x}`)), ...verdict.reasons])],
    evidenceIds: [...verdict.evidenceIds, ...tried.map(a => a.id)] };
}

export function qualify(manifest, records, fixtures, { remediationClosed = false, raws, attempts = [], rejected = {}, errors = [] } = {}) {
  validateStops(manifest.notRun, manifest.trials);
  validateSelection(manifest, records, gatePlan(fixtures));
  validateReuse(manifest);
  validateAttempts(manifest, attempts);
  const gates = {};
  for (const g of GATES) if (!manifest.notRun?.[g]) gates[g] = verdictOf(g, { records, attempts, manifest, fixtures, raws, rejected, errors });
  for (const [g, entry] of Object.entries(manifest.notRun ?? {})) {
    if (entry.blockedBy && gates[entry.blockedBy]?.status !== 'fail') throw new Error(`notRun.${g}: blockedBy ${entry.blockedBy} is not a measured failure`);
    gates[g] = { gate: g, status: 'not run', reason: entry.reason, ...(entry.blockedBy ? { blockedBy: entry.blockedBy } : {}), reasons: [entry.reason], evidenceIds: [] };
  }
  const backend = { remediationClosed, gates };
  return { backend, decision: decideBackends(backend) };
}

// T10: the integrity preflight (T9 fix rounds 2-5), a precondition of the campaign. A record supports it only when it is a headed preflight
// that passed with no errors and no Node evaluation, its seven assertions all hold and are exactly what its saved page results recompute to
// (integrity-preflight.mjs evaluatePreflight), and its implementation is `implementation`. R1 (finding 9): it was launched with exactly the
// campaign's `requestedArgs`, sandboxed, with each of them on its effective command line. Returns the problems.
export const PREFLIGHT_ASSERTIONS = 7;
export function preflightProblems(record, implementation, requestedArgs) {
  if (record?.schema !== 1 || record.kind !== 'integrity-preflight') return ['not an integrity preflight record'];
  const p = [];
  if (record.mode !== 'headed') p.push(`mode ${record.mode}, not headed`);
  if (record.pass !== true) p.push('it did not pass');
  if (!Array.isArray(record.errors) || record.errors.length) p.push(`errors ${JSON.stringify(record.errors)}`);
  if (record.evaluates !== 0) p.push(`${record.evaluates} Node evaluations`);
  const a = record.assertions;
  if (!Array.isArray(a) || a.length !== PREFLIGHT_ASSERTIONS || !a.every(x => x?.ok === true)) p.push(`not ${PREFLIGHT_ASSERTIONS} passing assertions`);
  const load = r => (r?.error ? null : r?.slots?.[0]?.raw ?? null);
  const again = evaluatePreflight({ first: load(record.first), reload: load(record.reload), evaluates: record.evaluates });
  if (!again.pass || !sameArgs(again.assertions, a)) p.push('its saved page results do not recompute to its passing assertions');
  const impl = record.implementation ?? {};
  if (impl.implementationCommit !== implementation?.implementationCommit || impl.implementationHash !== implementation?.implementationHash)
    p.push(`it ran at implementation ${impl.implementationCommit}/${impl.implementationHash}, not ${implementation?.implementationCommit}/${implementation?.implementationHash}`);
  const l = record.launch ?? {};
  if (!Array.isArray(requestedArgs) || !sameArgs(l.requestedArgs, [...requestedArgs])) p.push(`it was launched with ${JSON.stringify(l.requestedArgs)}, not the campaign's ${JSON.stringify(requestedArgs)}`);
  if (typeof l.commandLine !== 'string' || !l.commandLine) p.push('it has no effective command line');
  else {
    try { assertSandboxed(l.commandLine); } catch (e) { p.push(e.message); }
    const tokens = l.commandLine.split(/\s+/), absent = (l.requestedArgs ?? []).filter(a => !tokens.includes(a));
    if (absent.length) p.push(`requested ${absent.join(' ')} absent from its effective command line`);
  }
  return p;
}

// T10, read side: the manifest names the campaign's preflight (artifacts/project0/<runDir>/integrity-preflight.json), at the implementation of
// the records the campaign itself produced (reused records keep their own; coherence binds the rest to one implementation).
// R1: the file's bytes must be bound by the manifest (finding 5), it must match the manifest's launch configuration (finding 9), and every
// source campaign a record is reused from must itself have a verified preflight, recursively (finding 7).
export async function verifyPreflight(manifest, records, { root = ROOT, seen = new Set() } = {}) {
  const pf = manifest.preflight;
  if (!pf?.runDir || !/^[A-Za-z0-9.-]+$/.test(pf.runDir)) throw new Error('the manifest names no integrity preflight');
  const reused = r => manifest.reuse?.some(x => x.gate === r.gate && x.slot === r.slot && x.recordId === r.id);
  const own = records.find(r => !reused(r))?.identity ?? pf;
  const implementation = { implementationCommit: own.implementationCommit, implementationHash: own.implementationHash };
  if (pf.implementationCommit !== implementation.implementationCommit || pf.implementationHash !== implementation.implementationHash) throw new Error('the manifest\'s integrity preflight is not at the selected records\' implementation');
  const path = `${pf.runDir}/integrity-preflight.json`;
  let bytes;
  try { bytes = await readFile(join(root, 'artifacts/project0', path)); }
  catch (e) { throw new Error(`the integrity preflight ${pf.runDir} cannot be read (${e.message})`); }
  const want = manifest.bindings?.[path];
  if (want !== sha256(bytes)) throw new Error(`the integrity preflight ${pf.runDir}: ${want ? 'its bytes differ from the hash bound in the manifest' : 'it is not bound by the manifest'}`);
  const problems = preflightProblems(JSON.parse(bytes), implementation, manifest.requestedArgs);
  if (problems.length) throw new Error(`the integrity preflight ${pf.runDir} does not support this campaign: ${problems.join('; ')}`);
  for (const source of new Set((manifest.reuse ?? []).map(x => x.fromManifest))) {
    if (seen.has(source)) continue;
    seen.add(source);
    const { manifest: m, records: rs } = await loadCampaign(source, { root });
    try { await verifyPreflight(m, rs, { root, seen }); } catch (e) { throw new Error(`reused source ${source}: ${e.message}`); }
  }
}
