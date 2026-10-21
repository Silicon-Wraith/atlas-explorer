// Acceptance audit. A ledger line is only an index into evidence: acceptance comes from the
// referenced gate record — its schema, its exact commit, the required suite set for that
// commit, and a recomputed overall result. Missing, malformed, contradictory or incomplete
// evidence never establishes acceptance (fails closed).
// An explicit user-approved exception may accept a failed commit without claiming it passed.
import { overallGate } from './lib.mjs';

export const GATE_RECORD_SCHEMA = 'atlas.plane-gate';
export const GATE_EXCEPTIONS_SCHEMA = 'atlas.gate-exceptions';
const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]);
const isLedgerEntry = entry => entry && typeof entry === 'object' && !Array.isArray(entry)
  && (entry.commit === null || (typeof entry.commit === 'string' && entry.commit.trim().length > 0))
  && typeof entry.record === 'string' && entry.record.trim().length > 0;

// → { state: 'passed' | 'pending' | 'failed' | 'invalid', reason }
export function judgeRecord(commit, record, requiredIds) {
  if (record === undefined) return { state: 'invalid', reason: 'the referenced gate record is missing' };
  if (!record || typeof record !== 'object' || record.unreadable) return { state: 'invalid', reason: 'the gate record is unreadable' };
  if (record.schema !== GATE_RECORD_SCHEMA || record.schemaVersion !== 1) return { state: 'invalid', reason: 'not an atlas.plane-gate v1 record' };
  if (record.commit !== commit) return { state: 'invalid', reason: `the record is for ${record.commit}, not ${commit}` };
  if (!Array.isArray(requiredIds) || !requiredIds.length) return { state: 'invalid', reason: 'the commit\'s required suite set is unknown' };
  if (!sameList(record.requiredIds, requiredIds)) return { state: 'invalid', reason: 'the record does not cover the commit\'s required suites' };
  if (!record.results || typeof record.results !== 'object') return { state: 'invalid', reason: 'the record has no results' };
  const recomputed = overallGate(record.results, requiredIds);
  if (record.overall?.state !== recomputed.state) return { state: 'invalid', reason: `the record claims ${record.overall?.state}, its results give ${recomputed.state}` };
  return { state: recomputed.state, reason: recomputed.reason };
}

// commits: the audited SHAs in order; entries: parsed ledger lines (null for corrupt lines);
// records: { path → parsed record | undefined }; requiredIdsFor(commit) → the commit's suite ids.
// exceptions: parsed exception file, undefined if absent, { unreadable } on a read/parse error.
// ancestry: verified { commit, supersededBy } pairs supplied by the caller, never inferred here.
export function auditLedger({ commits, entries, records, requiredIdsFor, exceptions, ancestry = [] }) {
  const corruptLedgerLines = entries.filter(entry => !isLedgerEntry(entry)).length;
  const gateRows = commits.map(commit => {
    const judged = entries.filter(entry => isLedgerEntry(entry) && entry.commit === commit).map(entry => ({ record: entry.record, ...judgeRecord(commit, records[entry.record], requiredIdsFor(commit)) }));
    const passed = judged.filter(run => run.state === 'passed');
    const state = passed.length ? 'accepted' : judged.some(run => run.state === 'pending') ? 'pending' : judged.some(run => run.state === 'failed') ? 'failed' : judged.length ? 'invalid-evidence' : 'ungated';
    const chosen = passed.at(-1) ?? judged.filter(run => run.state === 'pending').at(-1) ?? judged.filter(run => run.state === 'failed').at(-1) ?? judged.at(-1) ?? null;
    return { commit, state, runs: judged.length, record: chosen?.record ?? null, reason: chosen?.reason ?? 'no gate run recorded' };
  });
  // Judge every exception against the original gate rows, so exceptions cannot form a chain.
  const exceptionSummary = judgeExceptions(exceptions, gateRows, ancestry);
  const applied = new Map(exceptionSummary.entries.filter(item => item.verdict === 'applied').map(item => [item.entry.commit, item]));
  const rows = gateRows.map(row => {
    const exception = applied.get(row.commit);
    return exception ? {
      ...row, state: 'accepted-by-exception', failureReason: row.reason,
      supersededBy: exception.entry.supersededBy, supersedingRecord: exception.supersedingRecord,
      reason: `recorded exception approved by ${exception.entry.approvedBy} on ${exception.entry.date}: ${exception.entry.reason}`,
    } : row;
  });
  const states = ['accepted', 'accepted-by-exception', 'pending', 'failed', 'invalid-evidence', 'ungated'];
  const counts = { total: rows.length, ...Object.fromEntries(states.map(state => [state, rows.filter(row => row.state === state).length])) };
  const accepted = corruptLedgerLines === 0 && rows.length > 0
    && exceptionSummary.state !== 'invalid' && exceptionSummary.counts.refused === 0
    && counts.accepted + counts['accepted-by-exception'] === rows.length;
  return { accepted, corruptLedgerLines, counts, rows, exceptions: exceptionSummary };
}

const isSha = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const isApprovalDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

function validateExceptions(document) {
  const entries = Array.isArray(document?.exceptions) ? document.exceptions : [];
  if (document === undefined) return { state: 'absent', reason: 'no exception file; no exceptions requested', entries };
  const invalid = reason => ({ state: 'invalid', reason, entries });
  if (!document || Array.isArray(document) || document.unreadable || document.schema !== GATE_EXCEPTIONS_SCHEMA
      || document.schemaVersion !== 1 || !Array.isArray(document.exceptions)) {
    return invalid(`not a readable ${GATE_EXCEPTIONS_SCHEMA} v1 file${document?.unreadable ? `: ${document.unreadable}` : ''}`);
  }
  const seen = new Set();
  for (const entry of entries) {
    if (!entry || Array.isArray(entry) || !isSha(entry.commit) || !isSha(entry.supersededBy)
        || typeof entry.reason !== 'string' || !entry.reason.trim()
        || entry.approvedBy !== 'user' || !isApprovalDate(entry.date)) {
      return invalid('an exception lacks full lowercase 40-character SHAs, a reason, user approval or a valid YYYY-MM-DD date');
    }
    if (seen.has(entry.commit)) return invalid(`duplicate exception for ${entry.commit}`);
    seen.add(entry.commit);
  }
  return { state: 'valid', reason: 'exception file schema and entries are valid', entries };
}

function judgeExceptions(document, rows, ancestry) {
  const file = validateExceptions(document);
  const byCommit = new Map(rows.map((row, index) => [row.commit, { ...row, index }]));
  const entries = file.entries.map(entry => {
    const target = byCommit.get(entry?.commit), superseder = byCommit.get(entry?.supersededBy);
    let reason;
    if (file.state === 'invalid') reason = file.reason;
    else if (!target) reason = 'the excepted commit is outside the audited range';
    else if (target.state !== 'failed' || target.runs === 0) reason = `exceptions apply only to failed rows with gate attempts; this row is ${target.state}`;
    else if (!superseder) reason = 'the superseding commit is outside the audited range';
    else if (superseder.index <= target.index) reason = 'the superseding commit must follow the failed commit in the audited range';
    else if (!ancestry.some(pair => pair.commit === entry.commit && pair.supersededBy === entry.supersededBy)) reason = 'the superseding commit is not a verified descendant';
    else if (superseder.state !== 'accepted') reason = `the superseding commit is not plainly accepted (${superseder.state}); exceptions cannot justify other exceptions`;
    return {
      entry, verdict: reason ? 'refused' : 'applied',
      reason: reason ?? 'a user-approved exception links recorded failure to a plainly accepted descendant within the audited range',
      record: target?.record ?? null, supersedingRecord: superseder?.record ?? null,
    };
  });
  const applied = entries.filter(entry => entry.verdict === 'applied').length;
  return { ...file, counts: { listed: entries.length, applied, refused: entries.length - applied }, entries };
}

export function parseLedger(text) {
  return text.split('\n').filter(line => line.trim()).map(line => { try { const entry = JSON.parse(line); return isLedgerEntry(entry) ? entry : null; } catch { return null; } });
}

// The required suite ids of a commit, from its own tests/suites.manifest.json (as the gate builds them).
export function requiredIdsFromManifest(manifest) {
  if (!manifest || !Array.isArray(manifest.suites)) return null;
  const ids = ['unit', 'build', ...manifest.suites.map(suite => suite?.id), 'cleanup'];
  return ids.every(id => typeof id === 'string' && id.trim().length > 0) && new Set(ids).size === ids.length ? ids : null;
}
