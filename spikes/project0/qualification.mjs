// spikes/project0/qualification.mjs — authorised qualification profiles (E7 / G1-D; Codex design run 20261020T042650Z-8f9e). Nonfrozen.
// The governing specification, the frozen gate plan (gates.js) and the decision procedure (decision.js) are unchanged. A profile is the base
// specification plus one hash-pinned amendment: this registry names the only approved profile, its exact path and its SHA-256, so an arbitrary
// document with a caller-supplied hash can never waive a requirement. The loader authenticates the bytes and returns a nonserializable verified
// context (a saved `verified: true` never authorises). effectiveGatePlan removes only G1/headless, for that context only.
// Historical manifests without a profile (webgpu-1) keep the original two-mode rules; webgpu-remediation requires the profile.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ROOT } from './launch.mjs';
import { canonical } from './contract.js';
import { gatePlan } from './gates.js';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const QUALIFICATIONS = Object.freeze({
  'project0-e7-headed-v1': Object.freeze({ path: 'spikes/project0/qualification/e7-headed-v1.json', sha256: '99ea9a3030fd31f68a3cb39cc97b10227fd28afdfc38e55a82119618991d8c51' }),
});
export const REQUIRED_PROFILE_CAMPAIGNS = Object.freeze({ 'webgpu-remediation': 'project0-e7-headed-v1' });
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

const VERIFIED = new WeakSet();
export const isVerifiedQualification = ctx => Boolean(ctx) && typeof ctx === 'object' && VERIFIED.has(ctx);
const requireVerified = ctx => { if (!isVerifiedQualification(ctx)) throw new Error('a verified qualification context is required (load it with loadQualification)'); return ctx; };

export async function loadQualification(id, { root = ROOT } = {}) {
  const entry = Object.hasOwn(QUALIFICATIONS, id ?? '') ? QUALIFICATIONS[id] : null;
  if (!entry) throw new Error(`unknown qualification profile ${JSON.stringify(id ?? null)}`);
  let bytes;
  try { bytes = await readFile(join(root, entry.path)); } catch (e) { throw new Error(`qualification ${id}: ${entry.path} cannot be read (${e.code ?? e.message})`); }
  if (sha256(bytes) !== entry.sha256) throw new Error(`qualification ${id}: ${entry.path} does not match its pinned hash ${entry.sha256}`);
  const doc = JSON.parse(bytes.toString('utf8'));
  if (canonical(doc) + '\n' !== bytes.toString('utf8')) throw new Error(`qualification ${id}: not canonically serialised`);
  if (doc.schema !== 1 || doc.id !== id || doc.backend !== 'webgpu' || doc.executionMode !== 'headed' || canonical(doc.excludedRequiredSlots) !== canonical(['G1/headless']))
    throw new Error(`qualification ${id}: unexpected content`);
  let prereg;
  try { prereg = await readFile(join(root, doc.preregistration.path)); } catch (e) { throw new Error(`qualification ${id}: the preregistration ${doc.preregistration.path} cannot be read (${e.code ?? e.message})`); }
  if (sha256(prereg) !== doc.preregistration.sha256) throw new Error(`qualification ${id}: the preregistration ${doc.preregistration.path} does not match the amendment's hash`);
  const ctx = Object.freeze({ id, path: entry.path, sha256: entry.sha256, doc: Object.freeze(doc) });
  VERIFIED.add(ctx);
  return ctx;
}

export const qualificationReference = ctx => { requireVerified(ctx); return { id: ctx.id, path: ctx.path, sha256: ctx.sha256 }; };
export function excludedTrialsOf(ctx) {
  requireVerified(ctx);
  return Object.fromEntries(ctx.doc.excludedRequiredSlots.map(k => [k, { disposition: 'not-required', authority: ctx.doc.authority.decision, collection: 'not-scheduled-in-this-campaign' }]));
}
export const knownLimitationsOf = ctx => { requireVerified(ctx); return JSON.parse(JSON.stringify(LIMITATIONS[ctx.id])); };
export const isExcluded = (ctx, gate, slot) => Boolean(ctx) && requireVerified(ctx).doc.excludedRequiredSlots.includes(`${gate}/${slot}`);

// The frozen plan, fresh, minus the profile's excluded slots (only G1/headless exists). Without a context, the frozen plan unchanged.
export function effectiveGatePlan(fixtures, ctx) {
  const plan = gatePlan(fixtures);
  if (ctx === null || ctx === undefined) return plan;
  requireVerified(ctx);
  for (const key of ctx.doc.excludedRequiredSlots) { const [g, s] = key.split('/'); delete plan[g][s]; }
  return plan;
}

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
  for (const key of ctx.doc.excludedRequiredSlots) if (manifest.trials?.[key]) throw new Error(`${key} is excluded under ${ctx.doc.authority.decision} and cannot be selected`);
}

// Records and attempts that may qualify under a profile: never an excluded slot, never a headless execution identity.
export function headlessProblems(records, ctx) {
  if (!ctx) return [];
  requireVerified(ctx);
  return records.flatMap(r => [...(isExcluded(ctx, r.gate, r.slot) ? [`record ${r.id}: ${r.gate}/${r.slot} is excluded under ${ctx.doc.authority.decision} and cannot be selected`] : []),
    ...(r.identity?.mode !== ctx.doc.executionMode ? [`record ${r.id}: execution identity ${r.identity?.mode} is not ${ctx.doc.executionMode} (headless evidence cannot qualify under ${ctx.doc.authority.decision})`] : [])]);
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
