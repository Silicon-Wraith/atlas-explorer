import { judgeRecord } from './ledger.mjs';
import { createHash } from 'node:crypto';
import { parseTapSummary } from './lib.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sha = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
// SHA-256 of JSON.stringify(policy.historicalDocsOnly), approved by the user on
// 2026-10-22, round 6. Pin the exact 23 full SHAs, refined rule and provenance independently
// of the live manifest and policies in audited commits. Neither can enroll more.
const HISTORICAL_DOCS_POLICY_SHA256 = 'f10b7531ec9c4bc3d2ef62ea89c7f97b8dda85c3ec218db2a7d15c4aabb0eaaf';
// Pin round-9 approvals and converged round-16/17/23/25 amendments independently of audit inputs.
export const WIP_EVIDENCE_POLICY_SHA256 = '392479c11614dc4ebb6677891820ca6edaeead42ff03914be39bed02736a0cca';
// P17-2: exact failed SHA, evidence, repair containment and delegated peer provenance.
export const HISTORICAL_WIP_EXCEPTION_SHA256 = '230935368c85f47b41c380023e7b6a79edf580fc7139d7c16421082bfe862556';
const HISTORICAL_WIP_COMMIT = '2f91343fe82e08a915b7de81bfd87c46baa0e35c';
// R23-Q3 is separately authorized; P17-2 does not confer a general failure waiver.
export const ROUND23_WIP_EXCEPTION_SHA256 = 'e332ba1cde88f02513687f287fa31d12493521ccb329f70388b3e4c4e2b847bd';
const ROUND23_WIP_COMMIT = '4ffda8835bee7c7a72949dffd7baf0aed352609c';
const knownFailureCommit = commit => [HISTORICAL_WIP_COMMIT, ROUND23_WIP_COMMIT].includes(commit);
export const approvedWipEvidencePolicy = policy => !!policy &&
  createHash('sha256').update(JSON.stringify(policy)).digest('hex') === WIP_EVIDENCE_POLICY_SHA256;
export const approvedRetrospectiveWip = (commit, policy) => approvedWipEvidencePolicy(policy) && policy.implementationWipCommits.includes(commit);
export const TRANSITION = Object.freeze({
  cutover: '76de54b1df64b67a8764b05918671c218df93da0',
  retrospective: [
    { commit: '40fecc3194529ce26a7ee4cd03176805998eb834', disposition: 'validated-later', candidate: '123fb965d4320f5bc81cd02807a30f6e15789176' },
    ...['85820e580471b7656b15a8e1f3cd786cd343a164', 'b46e2159171f342c227b907b366f36d313b4328e', '9f7875cd455e0bec90e75314babad5ff52a0e600'].map(commit => ({ commit, disposition: 'wip' })),
  ],
});

export function judgeFast(commit, record, facts, manifests, contemporaneous, { wipEvidencePolicy } = {}) {
  const invalid = reason => ({ state: 'invalid', reason });
  if (!record || record.schema !== 'atlas.fast-check' || record.schemaVersion !== 1) return invalid('missing or incorrectly typed fast evidence');
  if (record.commit !== commit || record.tree !== facts?.tree) return invalid('fast evidence commit/tree mismatch');
  if (record.cleanBefore !== true || record.cleanAfter !== true || record.unchanged !== true) return invalid('fast checks did not verify a clean unchanged tree');
  if (!manifests || !same(record.manifests, manifests)) return invalid('fast checks did not identify the commit manifests');
  if (record.unit?.state !== 'passed' || record.build?.state !== 'passed' || record.cleanup !== 'confirmed') return invalid('fast checks or cleanup did not pass');
  const wipOnly = approvedRetrospectiveWip(commit, wipEvidencePolicy);
  const recordPinApproved = record.wipEvidencePolicySha256 === WIP_EVIDENCE_POLICY_SHA256 || wipOnly &&
    wipEvidencePolicy.priorImplementationRecordPolicies?.some(p => p.sha256 === record.wipEvidencePolicySha256 && p.commits.includes(commit));
  if (record.evidenceScope !== undefined && (record.evidenceScope !== 'wip-only' || !wipOnly || !recordPinApproved))
    return invalid('WIP-only fast evidence requires its approved WIP scope and policy pin');
  if (wipOnly && record.recordedRetrospectively !== true) return invalid('approved WIP re-run must be recordedRetrospectively: true');
  if (record.recordedRetrospectively) {
    const start = Date.parse(record.startedAt), end = Date.parse(record.finishedAt);
    if (record.recordedRetrospectively !== true || !Number.isFinite(start) || !Number.isFinite(end) || end < start ||
        wipOnly && (!Number.isFinite(facts?.committedAt) || start < facts.committedAt * 1000)) return invalid('retrospective evidence has invalid run timestamps');
    const then = Date.parse(contemporaneous?.recordedAt);
    if (!wipOnly && (contemporaneous?.commit !== commit || contemporaneous.unit !== 'passed' || contemporaneous.build !== 'passed' ||
        !/^[0-9a-f]{64}$/.test(contemporaneous.source?.sha256 ?? '') || !Number.isFinite(then) || then >= start))
      return invalid('retrospective fast evidence lacks a same-SHA contemporaneous unit/build pass');
  }
  return { state: 'passed', reason: 'typed fast evidence on the clean unchanged commit' };
}

function docsFirstParent(fact, policy, disposition) {
  const diffs = fact.pathsByParent;
  if (!Array.isArray(fact.parents) || !fact.parents.length || !fact.parents.every(sha) ||
      new Set(fact.parents).size !== fact.parents.length || !Array.isArray(diffs) ||
      diffs.filter(diff => diff?.parent === fact.parents[0]).length !== 1)
    return { error: `${disposition} requires an unambiguous first-parent Git diff` };
  const diff = diffs.find(diff => diff?.parent === fact.parents[0]);
  if (!Array.isArray(diff.paths)) return { error: `${disposition} requires first-parent changed paths` };
  // Complete tree diffs include additions, deletions, mode/type and object
  // changes. Only docs paths may differ, including code resolved in a merge.
  if (diff.paths.some(path => typeof path !== 'string' || !(policy.allowedPaths?.includes(path) || policy.allowedPathPrefixes.some(prefix => path.startsWith(prefix)))))
    return { error: `${disposition} changed a path outside approved docs directories` };
  return { diff };
}

// Only required rows from the pinned matrix join; diagnostic evidence cannot
// fill a hole. Equal repetitions are harmless; contradictory dispositions fail.
export function joinStrata(mandatory, evidence) {
  const rows = mandatory.map(required => {
    const found = evidence.filter(row => row.matrixSha256 === required.matrixSha256 && row.id === required.id && row.role === 'mandatory');
    const signatures = new Set(found.map(row => `${row.state}/${row.passed}`));
    if (!found.length) return { ...required, passed: false, reason: 'missing mandatory evidence' };
    if (signatures.size > 1) return { ...required, passed: false, reason: 'conflicting duplicate evidence' };
    const passed = found[0].state === 'passed' && found[0].passed === true;
    return { ...required, passed, reason: passed ? 'passed' : 'failed or inconclusive mandatory evidence' };
  });
  return { accepted: rows.length > 0 && rows.every(row => row.passed), rows };
}

export function auditAcceptance({ commits, manifest, facts, records, requiredIdsFor, isAncestor, manifestsFor,
  approvedPolicyFor, historicalDocsPolicy, wipEvidencePolicy, historicalFailureEvidence = {}, approvedTransition = TRANSITION, legacyRows = [], corruptLedgerLines = 0, evidenceJoin = null, summaryValidFor = () => false, contemporaneousFastFor = () => null }) {
  const errors = [], rows = [], entries = new Map();
  if (!manifest || manifest.schema !== 'atlas.acceptance' || manifest.schemaVersion !== 1 || manifest.policyVersion !== 1 ||
      !sha(manifest.base) || !sha(manifest.head) || !sha(manifest.cutover) || manifest.approval?.approvedBy !== 'user' ||
      !manifest.approval?.date || !manifest.approval?.source || !Array.isArray(manifest.commits) || !Array.isArray(manifest.docsFastAllowlist)) {
    return { accepted: false, errors: ['invalid versioned acceptance manifest'], rows };
  }
  if (!commits.length || manifest.head !== commits.at(-1)) errors.push('empty range or manifest head does not match audited head');
  if (manifest.cutover !== approvedTransition.cutover || !same(manifest.retrospective, approvedTransition.retrospective)) errors.push('unapproved cutover or retrospective classification');
  if (corruptLedgerLines) errors.push(`${corruptLedgerLines} corrupt ledger lines`);
  for (const entry of manifest.commits) {
    if (!sha(entry.commit) || entries.has(entry.commit) || !commits.includes(entry.commit)) errors.push(`duplicate, invalid or out-of-range disposition: ${entry.commit}`);
    entries.set(entry.commit, entry);
  }
  const retrospective = new Map(approvedTransition.retrospective.map(row => [row.commit, row]));
  const historicalDocsPolicyApproved = historicalDocsPolicy &&
    manifest.historicalDocsOnlyPolicySha256 === HISTORICAL_DOCS_POLICY_SHA256 &&
    createHash('sha256').update(JSON.stringify(historicalDocsPolicy)).digest('hex') === HISTORICAL_DOCS_POLICY_SHA256;
  const fullKinds = new Set(['feature-gated', 'merge-gated', 'integration-gated']);
  const full = entry => entry && !knownFailureCommit(entry.commit) && fullKinds.has(entry.disposition) && judgeRecord(entry.commit, records[entry.gate], requiredIdsFor(entry.commit)).state === 'passed';
  const wipPolicyApproved = manifest.wipEvidencePolicySha256 === WIP_EVIDENCE_POLICY_SHA256 && approvedWipEvidencePolicy(wipEvidencePolicy);
  const fast = (entry, fact) => entry.requiresRetrospectiveFast && records[entry.fast]?.recordedRetrospectively !== true
    ? {state:'invalid',reason:'historical fast evidence must be recordedRetrospectively'}
    : judgeFast(entry.commit, records[entry.fast], fact, manifestsFor(entry.commit), contemporaneousFastFor(entry.commit),
      { wipEvidencePolicy: entry.disposition === 'wip' && wipPolicyApproved ? wipEvidencePolicy : null });
  const fastProvenance = entry => ({ record: entry.fast, recordedRetrospectively: records[entry.fast]?.recordedRetrospectively === true,
    ...(entry.disposition === 'wip' && wipPolicyApproved && approvedRetrospectiveWip(entry.commit, wipEvidencePolicy)
      ? { evidenceScope: 'wip-only', policySha256: WIP_EVIDENCE_POLICY_SHA256, approval: wipEvidencePolicy.approval, amendments: wipEvidencePolicy.amendments }
      : contemporaneousFastFor(entry.commit) ? { contemporaneous: contemporaneousFastFor(entry.commit) } : {}) });
  function historicalException(known, entry) {
    const round23 = known?.commit === ROUND23_WIP_COMMIT;
    const exceptionPin = round23 ? ROUND23_WIP_EXCEPTION_SHA256 : HISTORICAL_WIP_EXCEPTION_SHA256;
    const manifestPin = round23 ? manifest.historicalWipExceptionPins?.[ROUND23_WIP_COMMIT] : manifest.historicalWipExceptionSha256;
    if (!wipPolicyApproved || !known || manifestPin !== exceptionPin ||
        createHash('sha256').update(JSON.stringify(known)).digest('hex') !== exceptionPin)
      return { reason: 'missing or unapproved historical WIP exception policy pin' };
    if (entry?.disposition !== 'exception' || entry.exceptionId !== known.exception.id || entry.promotable !== false)
      return { reason: 'known historical failure requires its explicit non-promotable exception disposition' };
    const refs = [known.record, known.unitLog, known.firstPassingDescendant.record, ...(!round23 ? [known.containment.gate] : [])];
    if (refs.some(ref => historicalFailureEvidence[ref.file]?.sha256 !== ref.sha256))
      return { reason: 'missing or mismatched pinned historical failure evidence' };
    const failed = historicalFailureEvidence[known.record.file].json, log = historicalFailureEvidence[known.unitLog.file].text;
    const repaired = historicalFailureEvidence[known.firstPassingDescendant.record.file].json;
    const gate = round23 ? null : historicalFailureEvidence[known.containment.gate.file].json;
    const summary = parseTapSummary(log ?? ''), start = Date.parse(failed?.startedAt), end = Date.parse(failed?.finishedAt);
    if (failed?.schema !== 'atlas.fast-check' || failed.schemaVersion !== 1 || failed.commit !== known.commit ||
        failed.tree !== facts[known.commit].tree || !same(failed.manifests, manifestsFor(known.commit)) ||
        failed.unit?.state !== 'failed' || failed.build?.state !== 'passed' || failed.cleanup !== 'confirmed' ||
        failed.cleanBefore !== true || failed.cleanAfter !== true || failed.unchanged !== true || failed.recordedRetrospectively !== true ||
        !Number.isFinite(start) || !Number.isFinite(end) || end < start || !Number.isFinite(facts[known.commit].committedAt) || start < facts[known.commit].committedAt * 1000 ||
        !same(records[entry.fast], failed) || summary?.tests !== known.unit.tests || summary.pass !== known.unit.passed || summary.fail !== known.unit.failed || summary.cancelled !== (known.unit.cancelled ?? 0) || summary.skipped !== 0 || summary.todo !== 0 ||
        known.tests.some(name => !String(log).split('\n').some(line => /^not ok \d+ - /.test(line) && line.slice(line.indexOf(' - ') + 3) === name)))
      return { reason: 'pinned failure record or named failing tests contradict the historical failure' };
    const child = known.firstPassingDescendant.commit, boundary = known.containment.featureBoundary, promoted = known.containment.promotion;
    if (!entries.has(child) || !facts[child]?.parents?.includes(known.commit) ||
        judgeFast(child, repaired, facts[child], manifestsFor(child), contemporaneousFastFor(child), { wipEvidencePolicy }).state !== 'passed')
      return { reason: 'missing immediate repaired child with passing exact-commit fast evidence' };
    if (round23) {
      const boundary = entry.boundary, feature = entries.get(boundary);
      if (!sha(boundary) || !isAncestor(child, boundary) || !full(feature) ||
          feature.disposition === 'feature-gated' && (feature.reviewedCandidate !== boundary || !sha(feature.integrationBase) || !isAncestor(feature.integrationBase, boundary)))
        return { reason: 'historical repair requires a qualifying fully gated descendant boundary' };
      for (const boundaryEntry of entries.values()) {
        if (fullKinds.has(boundaryEntry.disposition) || ['merge-tree-identical', 'validated-later'].includes(boundaryEntry.disposition)) {
          if (boundaryEntry.commit === known.commit || boundaryEntry.candidate === known.commit ||
              isAncestor(known.commit, boundaryEntry.commit) && !isAncestor(child, boundaryEntry.commit))
            return { reason: 'a gated or promoted boundary uses the failed SHA or omits its repair' };
        }
      }
      return { failureEvidence: { record: failed, unitLog: known.unitLog }, approval: known.exception,
        exceptionPolicySha256: exceptionPin, containment: { repair: child, boundary, gate: feature.gate } };
    }
    const feature = entries.get(boundary), promotion = entries.get(promoted), promotedFact = facts[promoted];
    if (!isAncestor(child, boundary) || !isAncestor(boundary, promoted) ||
        facts[boundary]?.tree !== known.containment.tree || promotedFact?.tree !== known.containment.tree ||
        !full(feature) || !same(records[feature.gate], gate) || judgeRecord(boundary, gate, requiredIdsFor(boundary)).state !== 'passed' ||
        feature.reviewedCandidate !== boundary || !sha(feature.integrationBase) || !isAncestor(feature.integrationBase, boundary) ||
        promotion?.disposition !== 'merge-tree-identical' || promotion.candidate !== boundary ||
        !same(promotedFact.parents, [promotion.integrationBase, boundary]) || !same(promotion.parents, promotedFact.parents) ||
        promotion.tree !== promotedFact.tree || promotion.candidateTree !== facts[boundary].tree ||
        promotion.verifiedIntegration !== promotion.integrationBase || feature.integrationBase !== promotion.integrationBase ||
        fast(promotion, promotedFact).state !== 'passed')
      return { reason: 'historical repair is not contained by the pinned qualifying gate and identical-tree promotion' };
    for (const boundaryEntry of entries.values()) {
      if ((fullKinds.has(boundaryEntry.disposition) || ['merge-tree-identical', 'validated-later'].includes(boundaryEntry.disposition)) &&
          isAncestor(known.commit, boundaryEntry.commit) && !isAncestor(child, boundaryEntry.commit))
        return { reason: 'an acceptance boundary contains the historical failure without its repair' };
    }
    return { failureEvidence: { record: failed, unitLog: known.unitLog }, approval: known.exception,
      exceptionPolicySha256: HISTORICAL_WIP_EXCEPTION_SHA256 };
  }
  for (const commit of commits) {
    const entry = entries.get(commit), fact = facts[commit], historical = retrospective.get(commit);
    const fail = reason => rows.push({ commit, disposition: entry?.disposition ?? 'missing', state: 'unaccepted', reason });
    if (!fact || !sha(fact.tree)) { fail('missing Git facts'); continue; }
    const knownFailure = approvedWipEvidencePolicy(wipEvidencePolicy) && wipEvidencePolicy.knownFailures?.find(item => item.commit === commit);
    if (knownFailureCommit(commit)) {
      const checked = historicalException(knownFailure, entry);
      rows.push({ commit, disposition: entry?.disposition ?? 'missing', state: checked.reason ? 'unaccepted' : 'accepted-by-exception', promotable: false,
        reason: checked.reason ?? `failed historical WIP accounted by ${knownFailure.exception.id} exception only; no passing or promotion eligibility`, ...checked,
        knownFailure: knownFailure || undefined, policySha256: WIP_EVIDENCE_POLICY_SHA256, amendments: wipEvidencePolicy?.amendments });
      continue;
    }
    if (entry?.disposition === 'historical-docs-only') {
      if (!historicalDocsPolicyApproved) { fail('unapproved historical-docs-only policy or manifest pin'); continue; }
      if (!historicalDocsPolicy.commits.includes(commit)) { fail('SHA is not approved for historical-docs-only'); continue; }
      const checked = docsFirstParent(fact, historicalDocsPolicy, entry.disposition);
      if (checked.error) { fail(checked.error); continue; }
      rows.push({ commit, disposition: entry.disposition, state: 'accepted', approval: historicalDocsPolicy.approval,
        policySha256: HISTORICAL_DOCS_POLICY_SHA256, pathsByParent: [checked.diff],
        reason: 'user-approved historical docs-only classification; first-parent diff verified, non-docs entries unchanged' });
      continue;
    }
    const before = commit !== manifest.cutover && (isAncestor(commit, manifest.cutover) ||
      Number.isFinite(fact.committedAt) && fact.committedAt < facts[manifest.cutover]?.committedAt);
    if (before && !historical) {
      if (entry && !['legacy', 'exception'].includes(entry.disposition)) { fail('unapproved retrospective classification'); continue; }
      const legacy = legacyRows.find(row => row.commit === commit);
      if (!legacy || !['accepted', 'accepted-by-exception'].includes(legacy.state)) { fail(legacy?.reason ?? 'missing legacy exact-commit evidence'); continue; }
      rows.push({ ...legacy, disposition: entry?.disposition ?? 'legacy', legacy: true }); continue;
    }
    if (!entry) { fail('missing disposition'); continue; }
    if (historical && entry.disposition !== historical.disposition) { fail('retrospective disposition differs from approved transition'); continue; }
    if (fullKinds.has(entry.disposition)) {
      const judged = judgeRecord(commit, records[entry.gate], requiredIdsFor(commit));
      if (judged.state !== 'passed') { fail(judged.reason); continue; }
      if (entry.disposition === 'feature-gated' && (entry.reviewedCandidate !== commit || !sha(entry.integrationBase) || !isAncestor(entry.integrationBase, commit))) { fail('feature candidate lacks pinned integration ancestry or reviewed tip'); continue; }
      rows.push({ commit, disposition: entry.disposition, state: 'accepted', record: entry.gate, reason: judged.reason });
    } else if (entry.disposition === 'merge-tree-identical' || entry.disposition === 'validated-later') {
      const approvedLate = entry.disposition === 'validated-later' && historical?.candidate === entry.candidate;
      const candidateEntry = entries.get(entry.candidate), candidateFact = facts[entry.candidate];
      const candidateGate = approvedLate ? judgeRecord(entry.candidate, records[entry.gate], requiredIdsFor(entry.candidate)).state === 'passed' : full(candidateEntry);
      if (!candidateGate || !candidateFact || fact.tree !== candidateFact.tree) { fail('promotion requires a fully gated candidate with an identical tree'); continue; }
      if (!approvedLate) {
        if (!same(fact.parents, [entry.integrationBase, entry.candidate]) || !same(entry.parents, fact.parents) || entry.tree !== fact.tree || entry.candidateTree !== candidateFact.tree || entry.verifiedIntegration !== entry.integrationBase || candidateEntry.integrationBase !== entry.integrationBase) { fail('stale promotion target or mismatched parents/tree evidence'); continue; }
        const checked = fast(entry, fact); if (checked.state !== 'passed') { fail(checked.reason); continue; }
      } else if (!isAncestor(entry.candidate, commit)) { fail('validated-later candidate is not an ancestor'); continue; }
      rows.push({ commit, disposition: entry.disposition, state: 'accepted', evidenceReuse: { candidate: entry.candidate, gate: approvedLate ? entry.gate : candidateEntry.gate }, ...(!approvedLate ? { fastEvidence: fastProvenance(entry) } : {}), chronology: approvedLate ? 'gate ran after promotion; approved transition only' : 'candidate gate reused; promotion fast-checked' });
    } else if (entry.disposition === 'wip' || entry.disposition === 'docs-only-wip') {
      if (!sha(entry.boundary)) { fail('WIP boundary SHA is missing or invalid'); continue; }
      if (!isAncestor(commit, entry.boundary)) { fail('WIP boundary is not a descendant'); continue; }
      if (!full(entries.get(entry.boundary))) { fail('WIP boundary is not fully gated'); continue; }
      if (entry.disposition === 'docs-only-wip') {
        if (!wipPolicyApproved) { fail('unapproved docs-only-wip policy or manifest pin'); continue; }
        if (!wipEvidencePolicy.docsOnlyWipCommits.includes(commit)) { fail('SHA is not approved for docs-only-wip'); continue; }
        if (!(facts[entry.boundary]?.parents?.length >= 2)) { fail('docs-only-wip boundary must be a fully gated descendant merge'); continue; }
        const checked = docsFirstParent(fact, wipEvidencePolicy, entry.disposition);
        if (checked.error) { fail(checked.error); continue; }
        rows.push({ commit, disposition: entry.disposition, state: 'accounted-wip', promotable: false, boundary: entry.boundary,
          approval: wipEvidencePolicy.approval, amendments: wipEvidencePolicy.amendments, policySha256: WIP_EVIDENCE_POLICY_SHA256, pathsByParent: [checked.diff] });
      } else {
        if (!historical) { const checked = fast(entry, fact); if (checked.state !== 'passed') { fail(checked.reason); continue; } }
        rows.push({ commit, disposition: 'wip', state: 'accounted-wip', promotable: false, boundary: entry.boundary,
          ...(!historical ? { fastEvidence: fastProvenance(entry) } : {}) });
      }
    } else if (entry.disposition === 'docs-fast') {
      const policy = approvedPolicyFor(commit);
      const consumed = [...manifest.commits.flatMap(e => [e.gate, e.fast]), ...(manifest.stratumEvidence ?? []).map(e => e.file), ...(manifest.exceptionInputs ?? []).map(e => e.file)];
      const narrative = path => /^(README|HANDOFF|AGENTS|CLAUDE)\.md$/.test(path) || /^docs\/(reports|codesign)\/[^]*\.md$/.test(path);
      if (fact.paths.some(path => consumed.includes(path) || !(narrative(path) || path === 'docs/reports/project1b/gate-ledger-1b1.json' && policy?.outputSummaries?.includes(path)) || /(?:^|\/)(?:specs|plans|scripts)(?:\/|$)|(?:acceptance|exceptions|policy).*\.json$/.test(path))) { fail('forbidden docs-fast policy, requirement, exception or evidence path'); continue; }
      if (!Array.isArray(policy?.docsFastAllowlist) || !fact.paths.length || fact.paths.some(path => !policy.docsFastAllowlist.includes(path) || !manifest.docsFastAllowlist.includes(path))) { fail('changed paths are outside the previously approved docs-fast allowlist'); continue; }
      if (fact.paths.some(path => policy.outputSummaries?.includes(path)) && !summaryValidFor(commit)) { fail('generated summary does not reproduce its underlying evidence'); continue; }
      const checked = fast(entry, fact); if (checked.state !== 'passed') { fail(checked.reason); continue; }
      rows.push({ commit, disposition: 'docs-fast', state: 'accepted', record: entry.fast });
    } else { fail('unknown disposition or exception outside the legacy scope'); }
  }
  if (evidenceJoin && !evidenceJoin.accepted) errors.push('mandatory B08/B10 evidence join failed');
  return { accepted: errors.length === 0 && rows.length === commits.length && rows.every(row => ['accepted', 'accepted-by-exception', 'accounted-wip'].includes(row.state)),
    errors, rows, counts: { total: rows.length, accepted: rows.filter(row => row.state === 'accepted').length, exceptions: rows.filter(row => row.state === 'accepted-by-exception').length,
      wip: rows.filter(row => row.state === 'accounted-wip').length, unaccepted: rows.filter(row => row.state === 'unaccepted').length }, evidenceJoin };
}
