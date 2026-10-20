// spikes/project0/qualification.mjs — authorised qualification profiles (E7 / G1-D; Codex design run 20261020T042650Z-8f9e). Nonfrozen.
// The governing specification, the frozen gate plan (gates.js) and the decision procedure (decision.js) are unchanged. A profile is the base
// specification plus one hash-pinned amendment: this registry names the only approved profile, its exact path and its SHA-256, so an arbitrary
// document with a caller-supplied hash can never waive a requirement. The loader authenticates the bytes and returns a nonserializable verified
// context (a saved `verified: true` never authorises). effectiveGatePlan removes only G1/headless, for that context only.
// Historical manifests without a profile (webgpu-1) keep the original two-mode rules; webgpu-remediation requires the profile.
// G5-D (prereg docs/reports/project0/webgpu-g5d-prereg.md §8.2; E7, E8, E9): a second profile, project0-g5d-v1, for campaign webgpu-g5d. It
// inherits E7's exclusion of G1/headless, replaces the required G5/qjulia-offplane with G5/qjulia-operational (rules in the authenticated
// document), and pins its preregistration, generated artefacts, source files, shader identity and historical references by hash. What each
// profile may exclude or inject is fixed here, per registry entry (POLICY), never by the document.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ROOT } from './launch.mjs';
import { canonical } from './contract.js';
import { gatePlan } from './gates.js';
import { HISTORICAL_G5A } from './remediation/validate.mjs';
import { G5D_FORM, OPERATIONAL_LAYOUT } from './qualification/g5d-config.js';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const QUALIFICATIONS = Object.freeze({
  'project0-e7-headed-v1': Object.freeze({ path: 'spikes/project0/qualification/e7-headed-v1.json', sha256: '99ea9a3030fd31f68a3cb39cc97b10227fd28afdfc38e55a82119618991d8c51' }),
  'project0-g5d-v1': Object.freeze({ path: 'spikes/project0/qualification/g5d-v1.json', sha256: 'e0f26d9e83e592f25fc6777134efca82427948df93257ce6eb485d48e8a91c24' }),
});
export const REQUIRED_PROFILE_CAMPAIGNS = Object.freeze({ 'webgpu-remediation': 'project0-e7-headed-v1', 'webgpu-g5d': 'project0-g5d-v1' });
// The only slots each profile may remove from, or add to, the frozen plan.
const POLICY = Object.freeze({
  'project0-e7-headed-v1': Object.freeze({ removable: Object.freeze(['G1/headless']), injectable: Object.freeze([]) }),
  'project0-g5d-v1': Object.freeze({ removable: Object.freeze(['G1/headless', 'G5/qjulia-offplane']), injectable: Object.freeze(['G5/qjulia-operational']) }),
});
export const SCOPE_DISCLOSURE = 'Qualification scope: headed execution only, under E7.';
export const HEADLESS_ROW = 'G1/headless — Not required under E7; not scheduled in this campaign. Prior headless collection was unsuccessful; browser/GPU-process crash remains a known limitation on the recorded host.';
// The known limitation and its evidence, bound by the hashes the bytes had when E7 was implemented. A changed byte is an integrity problem,
// which E7 does not excuse.
const LIMITATIONS = Object.freeze({
  'project0-e7-headed-v1': [{
    id: 'g1-headless-gpu-process-crash', authority: 'E7',
    summary: 'On the recorded host, Chrome 151 headless: the GPU process crashes (SIGSEGV) at startup; the first crash precedes any WebGPU request. Headless G1 evidence could not be collected (G1-C: browser/GPU-process failure, no admissible correction).',
    evidence: [
      { kind: 'diagnosis', path: 'docs/reports/project0/webgpu-g1c-diagnosis.md', sha256: 'cdf7b66649e29853e13c59b877694afa98c4597d71ca8381cd3f8ab102cd5ac4' },
      { kind: 'manifest', path: 'docs/reports/project0/webgpu-1-manifest.json', sha256: 'd733e85046a39d64d7fefe7f50ff0c39d822b0ca0ae69fe9ec92b8fbb7c9dfdd' },
      { kind: 'record', recordId: 'G1-headless-20261019T235719304Z-webgpu-1-g1-headless', path: '20261019T235719304Z-webgpu-1-g1-headless/G1-headless-20261019T235719304Z-webgpu-1-g1-headless.json', sha256: '1461dc310889a2034897d5da976d830728728c0bdf2e4ece3417a6273b09f275' },
    ],
  }],
});

// E7 fix round 1 (finding 2): the authenticated document is deeply frozen, and every use re-checks it against the authenticated bytes kept
// privately, so neither a mutation nor a substituted object can change what a context authorises. Only G1/headless is ever removable.
const VERIFIED = new WeakMap();                                                           // context -> authenticated canonical bytes
const policyOf = id => POLICY[id] ?? { removable: [], injectable: [] };
const deepFreeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const v of Object.values(value)) deepFreeze(v); Object.freeze(value); } return value; };
export const isVerifiedQualification = ctx => Boolean(ctx) && typeof ctx === 'object' && VERIFIED.has(ctx) && canonical(ctx.doc) + '\n' === VERIFIED.get(ctx);
const requireVerified = ctx => { if (!isVerifiedQualification(ctx)) throw new Error('a verified qualification context is required (load it with loadQualification)'); return ctx; };

export async function loadQualification(id, { root = ROOT } = {}) {
  const entry = Object.hasOwn(QUALIFICATIONS, id ?? '') ? QUALIFICATIONS[id] : null;
  if (!entry) throw new Error(`unknown qualification profile ${JSON.stringify(id ?? null)}`);
  let bytes;
  try { bytes = await readFile(join(root, entry.path)); } catch (e) { throw new Error(`qualification ${id}: ${entry.path} cannot be read (${e.code ?? e.message})`); }
  if (sha256(bytes) !== entry.sha256) throw new Error(`qualification ${id}: ${entry.path} does not match its pinned hash ${entry.sha256}`);
  const doc = JSON.parse(bytes.toString('utf8'));
  if (canonical(doc) + '\n' !== bytes.toString('utf8')) throw new Error(`qualification ${id}: not canonically serialised`);
  const policy = policyOf(id);
  if (doc.schema !== 1 || doc.id !== id || doc.backend !== 'webgpu' || doc.executionMode !== 'headed' || canonical(doc.excludedRequiredSlots) !== canonical(policy.removable)
    || canonical(Object.keys(doc.addedSlots ?? {})) !== canonical(policy.injectable))
    throw new Error(`qualification ${id}: unexpected content`);
  let prereg;
  try { prereg = await readFile(join(root, doc.preregistration.path)); } catch (e) { throw new Error(`qualification ${id}: the preregistration ${doc.preregistration.path} cannot be read (${e.code ?? e.message})`); }
  if (sha256(prereg) !== doc.preregistration.sha256) throw new Error(`qualification ${id}: the preregistration ${doc.preregistration.path} does not match the amendment's hash`);
  if (doc.excludedRequiredSlots.some(k => !policy.removable.includes(k))) throw new Error(`qualification ${id}: only ${policy.removable.join(', ')} may be excluded`);
  if (policy.injectable.length) await verifyAmendment(id, doc, root);
  const ctx = deepFreeze({ id, path: entry.path, sha256: entry.sha256, doc });
  VERIFIED.set(ctx, bytes.toString('utf8'));
  return ctx;
}

export const qualificationReference = ctx => { requireVerified(ctx); return { id: ctx.id, path: ctx.path, sha256: ctx.sha256 }; };
export function excludedTrialsOf(ctx) {
  requireVerified(ctx);
  if (ctx.doc.dispositions) return Object.fromEntries(ctx.doc.excludedRequiredSlots.map(k => [k, JSON.parse(JSON.stringify(ctx.doc.dispositions[k]))]));
  return Object.fromEntries(ctx.doc.excludedRequiredSlots.map(k => [k, { disposition: 'not-required', authority: ctx.doc.authority.decision, collection: 'not-scheduled-in-this-campaign' }]));
}
export const knownLimitationsOf = ctx => { requireVerified(ctx); return JSON.parse(JSON.stringify(ctx.doc.knownLimitations ?? LIMITATIONS[ctx.id])); };
export const dispositionsOf = ctx => { requireVerified(ctx); return JSON.parse(JSON.stringify(ctx.doc.dispositions ?? excludedTrialsOf(ctx))); };
export const scopeOf = ctx => { requireVerified(ctx); return ctx.doc.scope ?? SCOPE_DISCLOSURE; };
export const isExcluded = (ctx, gate, slot) => Boolean(ctx) && requireVerified(ctx).doc.excludedRequiredSlots.includes(`${gate}/${slot}`);

// The frozen plan, fresh, minus the profile's excluded slots (only G1/headless exists). Without a context, the frozen plan unchanged.
// G5-D: plus the profile's injected slots (only G5/qjulia-operational exists), with the rules its authenticated document fixes.
export function effectiveGatePlan(fixtures, ctx) {
  const plan = gatePlan(fixtures);
  if (ctx === null || ctx === undefined) return plan;
  requireVerified(ctx);
  const policy = policyOf(ctx.id);
  for (const key of ctx.doc.excludedRequiredSlots) { if (!policy.removable.includes(key)) throw new Error(`only ${policy.removable.join(', ')} may be removed`); const [g, s] = key.split('/'); delete plan[g][s]; }
  for (const [key, slot] of Object.entries(ctx.doc.addedSlots ?? {})) {
    if (!policy.injectable.includes(key)) throw new Error(`only ${policy.injectable.join(', ') || 'no slot'} may be injected`);
    const [g, s] = key.split('/');
    plan[g][s] = Object.fromEntries(Object.entries(slot.rules).map(([k, rule]) => [k, [...rule]]));
  }
  return plan;
}
export const addedSlotsOf = ctx => (ctx ? Object.keys(requireVerified(ctx).doc.addedSlots ?? {}) : []);
// The disposition authority of an excluded slot (G5-D: G1/headless under E7, G5/qjulia-offplane under E8); E7 names its own decision.
const authorityOf = (ctx, key) => ctx.doc.dispositions?.[key]?.authority ?? ctx.doc.authority.decision;

// A manifest and a context belong together, or neither carries a profile. Under a profile: the exact reference, the profile's campaign, base
// specification and fixture, exactly its exclusions and limitations, and no selected excluded trial.
export function validateQualification(manifest, ctx) {
  const required = REQUIRED_PROFILE_CAMPAIGNS[manifest?.campaign];
  if (ctx === null || ctx === undefined) {
    if (required || manifest?.qualification) throw new Error(`campaign ${manifest?.campaign} requires the authenticated qualification ${required ?? manifest.qualification?.id}: a verified qualification context is required`);
    if (manifest?.excludedTrials !== undefined || manifest?.knownLimitations !== undefined) throw new Error('excludedTrials / knownLimitations require an authenticated qualification profile');
    return;
  }
  requireVerified(ctx);
  if (canonical(manifest?.qualification ?? null) !== canonical(qualificationReference(ctx))) throw new Error(`the manifest's qualification reference ${JSON.stringify(manifest?.qualification ?? null)} is not the verified ${JSON.stringify(qualificationReference(ctx))}`);
  if (manifest.campaign !== ctx.doc.campaign) throw new Error(`qualification ${ctx.id} applies to campaign ${ctx.doc.campaign}, not ${manifest.campaign}`);
  if (manifest.fixture?.specHash !== ctx.doc.baseSpecHash) throw new Error(`qualification ${ctx.id}: the manifest's base specification ${manifest.fixture?.specHash} is not ${ctx.doc.baseSpecHash}`);
  if (manifest.fixture?.fixtureHash !== ctx.doc.fixtureHash) throw new Error(`qualification ${ctx.id}: the manifest's fixture ${manifest.fixture?.fixtureHash} is not ${ctx.doc.fixtureHash}`);
  if (canonical(manifest.excludedTrials ?? null) !== canonical(excludedTrialsOf(ctx))) throw new Error(`excludedTrials ${JSON.stringify(manifest.excludedTrials ?? null)} contradict qualification ${ctx.id}`);
  if (canonical(manifest.knownLimitations ?? null) !== canonical(knownLimitationsOf(ctx))) throw new Error(`knownLimitations differ from qualification ${ctx.id}'s`);
  for (const key of ctx.doc.excludedRequiredSlots) if (manifest.trials?.[key]) throw new Error(`${key} is excluded under ${authorityOf(ctx, key)} and cannot be selected`);
  // G5-D fix round 1 (Codex run 20261020T161736Z-8d55, finding 2): a profile that pins its launch configuration and its request binds every
  // manifest, wherever it is built, loaded, evaluated or closed (not only in the campaign runner). Profiles without them (E7) are unchanged.
  const launch = ctx.doc.launch;
  if (launch && (manifest.args !== launch.args || canonical(manifest.requestedArgs ?? null) !== canonical(launch.requestedArgs)))
    throw new Error(`qualification ${ctx.id} pins the launch configuration ${launch.args} ${JSON.stringify(launch.requestedArgs)}; the manifest declares ${manifest.args} ${JSON.stringify(manifest.requestedArgs ?? null)}`);
  const request = ctx.doc.campaignRequest;
  if (request && canonical(manifest.reuse ?? []) !== canonical(request.reuse)) throw new Error(`qualification ${ctx.id} requires no reuse; the manifest reuses ${JSON.stringify(manifest.reuse)}`);
}

// Records and attempts that may qualify under a profile: never an excluded slot, never a headless execution identity.
export function headlessProblems(records, ctx) {
  if (!ctx) return [];
  requireVerified(ctx);
  return records.flatMap(r => [...(isExcluded(ctx, r.gate, r.slot) ? [`record ${r.id}: ${r.gate}/${r.slot} is excluded under ${authorityOf(ctx, `${r.gate}/${r.slot}`)} and cannot be selected`] : []),
    ...(r.identity?.mode !== ctx.doc.executionMode ? [`record ${r.id}: execution identity ${r.identity?.mode} is not ${ctx.doc.executionMode} (headless evidence cannot qualify under ${authorityOf(ctx, 'G1/headless')})`] : [])]);
}

// The limitation's evidence: every referenced byte matches its pinned hash, the record is the original manifest's selected headless G1 trial,
// and its own artefacts verify through the existing evidence reader (qualify.mjs recompute). Original files and invalidations are untouched.
export async function verifyKnownLimitations(ctx, { root = ROOT } = {}) {
  for (const lim of knownLimitationsOf(ctx)) {
    const byKind = Object.fromEntries(lim.evidence.map(e => [e.kind, e]));
    for (const e of lim.evidence) {
      const path = e.kind === 'record' ? join(root, 'artifacts/project0', e.path) : join(root, e.path);
      let bytes;
      try { bytes = await readFile(path); } catch (err) { throw new Error(`known limitation ${lim.id}: ${e.path} cannot be read (${err.code ?? err.message})`); }
      if (sha256(bytes) !== e.sha256) throw new Error(`known limitation ${lim.id}: ${e.path} does not match its pinned hash`);
    }
    const manifest = JSON.parse(await readFile(join(root, byKind.manifest.path), 'utf8'));
    const record = JSON.parse(await readFile(join(root, 'artifacts/project0', byKind.record.path), 'utf8'));
    if (manifest.trials?.['G1/headless']?.id !== byKind.record.recordId || record.id !== byKind.record.recordId) throw new Error(`known limitation ${lim.id}: ${byKind.record.recordId} is not the original manifest's headless G1 trial`);
    const { recompute } = await import('./qualify.mjs');
    const { errors } = await recompute([record], {}, { root, manifest, collect: true });
    if (errors[record.id]) throw new Error(`known limitation ${lim.id}: ${record.id} does not verify: ${errors[record.id]}`);
  }
}

// --- G5-D (prereg §8.2, §8.5, §8.6) ----------------------------------------------------------------------------------------------------------
// Every file an amendment pins: the preregistration, the generated artefacts and their generators, the shader modules, the launch
// configuration and the inherited profile. Each must match its hash, or the profile does not authenticate.
const pinnedOfDoc = doc => [doc.preregistration, ...Object.values(doc.artifacts ?? {}), ...(doc.kernel?.shader?.modules ?? []), ...(doc.launch ? [doc.launch] : []), ...(doc.inherits ? [doc.inherits] : [])]
  .map(f => ({ path: f.path, sha256: f.sha256 }));
export const pinnedFilesOf = ctx => pinnedOfDoc(requireVerified(ctx).doc);
async function verifyAmendment(id, doc, root) {
  const bytes = {};
  for (const f of pinnedOfDoc(doc)) {
    try { bytes[f.path] = await readFile(join(root, f.path)); } catch (e) { throw new Error(`qualification ${id}: ${f.path} cannot be read (${e.code ?? e.message})`); }
    if (sha256(bytes[f.path]) !== f.sha256) throw new Error(`qualification ${id}: ${f.path} does not match its pinned hash ${f.sha256}`);
  }
  const k = doc.kernel, mods = k.shader.modules.map(m => bytes[m.path]);
  if (sha256(Buffer.concat(mods)) !== k.shader.sha256) throw new Error(`qualification ${id}: the concatenated shader source does not match ${k.shader.sha256}`);
  const [fields, arithmetic] = mods.map(b => b.toString('utf8').split('\n')), w = arithmetic.findIndex(l => l.startsWith('fn q_update_g5d('));
  if (w < 0 || arithmetic.slice(w, w + 3).join('\n') + '\n' !== k.wrapper || sha256(fields.slice(51, 54).join('\n') + '\n' + k.wrapper) !== k.fragmentSha256)
    throw new Error(`qualification ${id}: the kernel fragment (fields.wgsl lines 52-54 + the q_update_g5d wrapper) does not match ${k.fragmentSha256}`);
  const { ARITHMETIC_ENTRY_POINTS, arithmeticPipelines } = await import('./remediation/pipeline-config.js');
  if (k.form !== G5D_FORM || canonical(k.layout) !== canonical(OPERATIONAL_LAYOUT) || canonical(k.shader.entryPoints) !== canonical(ARITHMETIC_ENTRY_POINTS) || canonical(k.shader.pipelines) !== canonical(arithmeticPipelines()))
    throw new Error(`qualification ${id}: the kernel form, layout, entry points or pipeline descriptors are not the reviewed configuration`);
  if (canonical(doc.historical.g5a) !== canonical(HISTORICAL_G5A)) throw new Error(`qualification ${id}: the historical G5-A implementation identity differs from remediation/validate.mjs`);
  if (QUALIFICATIONS[doc.inherits.profile]?.sha256 !== doc.inherits.sha256 || QUALIFICATIONS[doc.inherits.profile]?.path !== doc.inherits.path || canonical(doc.knownLimitations) !== canonical(LIMITATIONS[doc.inherits.profile]))
    throw new Error(`qualification ${id}: the inherited profile or its known limitations differ from ${doc.inherits.profile}`);
  if (canonical(JSON.parse(bytes[doc.launch.path].toString('utf8'))) !== canonical(doc.launch.requestedArgs)) throw new Error(`qualification ${id}: the launch configuration differs from ${doc.launch.path}`);
}

// §8.6: the historical references, by their pinned bytes; each selected off-plane record resolved through its own authenticated manifest (and,
// for webgpu-remediation, its E7 profile), its artefacts verified and its observation recomputed from raw words (G5-A against its recorded
// implementation, §8.5). Returns the original results, which G5-D never reinterprets.
export async function verifyHistoricalReferences(ctx, { root = ROOT } = {}) {
  const h = requireVerified(ctx).doc.historical;
  if (!h) return null;
  for (const f of h.files) {
    let bytes;
    try { bytes = await readFile(join(root, f.path)); } catch (e) { throw new Error(`historical reference ${f.path} cannot be read (${e.code ?? e.message})`); }
    if (sha256(bytes) !== f.sha256) throw new Error(`historical reference ${f.path} does not match its pinned hash ${f.sha256}`);
  }
  const { loadCampaign, loadFixtures, recompute, gateVerdict } = await import('./qualify.mjs');
  const offplane = [], outcomes = {};
  for (const r of h.offplaneRecords) {
    const qualification = r.profile ? await loadQualification(r.profile, { root }) : null;
    const { manifest, records } = await loadCampaign(r.manifest, { root, qualification });
    if (manifest.trials?.['G5/qjulia-offplane']?.id !== r.recordId) throw new Error(`historical reference ${r.recordId} is not ${r.manifest}'s selected G5/qjulia-offplane trial`);
    const record = records.find(x => x.id === r.recordId), raw = record.artifacts.find(a => a.path.endsWith('.raw.json')).path;
    const recordPath = join(root, 'artifacts/project0', raw.split('/').slice(0, -1).join('/'), `${record.id}.json`);
    if (sha256(await readFile(recordPath)) !== r.sha256) throw new Error(`historical record ${r.recordId} does not match its pinned hash ${r.sha256}`);
    const g5 = records.filter(x => x.gate === 'G5'), fixtures = await loadFixtures(manifest, { root });
    const { raws, errors, g5Observations } = await recompute(g5, fixtures, { root, manifest, collect: true, qualification });
    if (Object.keys(errors).length) throw new Error(`historical G5 evidence of ${r.campaign} does not verify: ${Object.entries(errors).map(([i, e]) => `${i}: ${e}`).join('; ')}`);
    const o = g5Observations[r.recordId], verdict = gateVerdict('G5', g5, manifest, fixtures, raws, qualification);
    offplane.push({ campaign: r.campaign, recordId: r.recordId, sha256: r.sha256, componentRatio: o.componentRatio, numericalFailure: o.numericalFailure,
      ...(o.compensation ? { compensation: { validated: o.compensation.validated, matches: o.compensation.matches } } : {}) });
    outcomes[r.campaign] = { G5: verdict.status, ...(o.compensation ? { compensation: o.compensation.validated ? 'validated' : 'unvalidated', matches: o.compensation.matches } : {}) };
  }
  const decision = h.files.find(f => f.kind === 'decision');
  outcomes.decision = JSON.parse(await readFile(join(root, decision.path), 'utf8')).decision.outcome;
  return { files: JSON.parse(JSON.stringify(h.files)), offplane, outcomes };
}
