import test from 'node:test';
import assert from 'node:assert/strict';
import { auditLedger, judgeRecord, parseLedger, requiredIdsFromManifest } from '../../scripts/gate/ledger.mjs';

const IDS = ['unit', 'build', 'browser', 'graphics', 'cleanup'];
const passedResults = Object.fromEntries(IDS.map(id => [id, { state: 'passed', reason: '' }]));
const record = (commit, overrides = {}) => ({ schema: 'atlas.plane-gate', schemaVersion: 1, commit, requiredIds: IDS, results: passedResults, overall: { state: 'passed' }, ...overrides });
const audit = (commits, entries, records) => auditLedger({ commits, entries, records, requiredIdsFor: () => IDS });

test('every commit needs its own passed gate; the final tip cannot clear earlier commits', () => {
  const deferred = { ...passedResults, graphics: { state: 'deferred', reason: 'held' } };
  const entries = [
    { commit: 'a', overall: 'pending', record: 'a1' },
    { commit: 'b', overall: 'passed', record: 'b1' },
    { commit: 'c', overall: 'passed', record: 'c1' },
  ];
  const records = { a1: record('a', { results: deferred, overall: { state: 'pending' } }), b1: record('b'), c1: record('c') };
  const result = audit(['a', 'b', 'c'], entries, records);
  assert.equal(result.accepted, false);
  assert.deepEqual(result.rows.map(row => row.state), ['pending', 'accepted', 'accepted']);
  assert.equal(audit(['a', 'b', 'c'], [...entries, { commit: 'a', overall: 'passed', record: 'a2' }], { ...records, a2: record('a') }).accepted, true);
});

test('a ledger claim without valid evidence never accepts a commit', () => {
  const claim = [{ commit: 'x', overall: 'passed', record: 'r' }];
  const cases = {
    'missing record': {},
    'corrupt record': { r: { unreadable: 'Unexpected token' } },
    'wrong commit': { r: record('y') },
    'missing required suite': { r: record('x', { requiredIds: IDS.slice(0, 3), results: Object.fromEntries(IDS.slice(0, 3).map(id => [id, { state: 'passed' }])) }) },
    'deferred suite claimed as passed': { r: record('x', { results: { ...passedResults, graphics: { state: 'deferred', reason: 'held' } } }) },
    'wrong schema': { r: record('x', { schema: 'other' }) },
    'wrong version': { r: record('x', { schemaVersion: 2 }) },
    'no results': { r: record('x', { results: null }) },
    'missing required result': { r: record('x', { results: { ...passedResults, graphics: undefined } }) },
    'missing overall': { r: record('x', { overall: undefined }) },
  };
  for (const [name, records] of Object.entries(cases)) {
    const result = audit(['x'], claim, records);
    assert.equal(result.accepted, false, name);
    assert.equal(result.rows[0].state, 'invalid-evidence', name);
  }
  assert.match(judgeRecord('x', record('x', { results: { ...passedResults, graphics: { state: 'deferred' } } }), IDS).reason, /claims passed, its results give pending/);
});

test('an ungated commit, an empty range or a corrupt ledger line never passes', () => {
  assert.equal(audit(['x'], [], {}).rows[0].state, 'ungated');
  assert.equal(audit([], [], {}).accepted, false);
  const entries = parseLedger('{"commit":"x","overall":"passed","record":"r"}\nnot json\n\n');
  assert.equal(entries.length, 2);
  const result = audit(['x', 'y'], entries, { r: record('x') });
  assert.deepEqual([result.accepted, result.corruptLedgerLines, result.rows[0].state, result.rows[1].state], [false, 1, 'accepted', 'ungated']);
  const allGated = audit(['x'], entries, { r: record('x') });
  assert.deepEqual([allGated.accepted, allGated.corruptLedgerLines, allGated.rows[0].state], [false, 1, 'accepted']);
  assert.deepEqual(requiredIdsFromManifest({ suites: [{ id: 'browser' }, { id: 'graphics' }] }), IDS);
  assert.equal(requiredIdsFromManifest(undefined), null);
});

test('a later fixing commit never accepts an earlier failed-only commit', () => {
  const entries = [
    { commit: 'broken', overall: 'passed', record: 'failure' },
    { commit: 'fixed', overall: 'passed', record: 'fix' },
  ];
  const results = { ...passedResults, browser: { state: 'failed', reason: 'recovery race' } };
  const result = audit(['broken', 'fixed'], entries, {
    failure: record('broken', { results, overall: { state: 'failed' } }),
    fix: record('fixed'),
  });
  assert.equal(result.accepted, false);
  assert.deepEqual(result.rows.map(row => row.state), ['failed', 'accepted']);
  assert.deepEqual(result.rows[0], { commit: 'broken', state: 'failed', runs: 1, record: 'failure', reason: 'a required suite did not pass' });
});

test('a valid pass on the same commit establishes acceptance and selects the last passing record', () => {
  const failure = record('x', { results: { ...passedResults, browser: { state: 'failed' } }, overall: { state: 'failed' } });
  const records = { fail: failure, pass1: record('x'), pass2: record('x'), invalid: record('other') };
  for (const paths of [['fail', 'pass1'], ['pass1', 'fail'], ['fail', 'pass1', 'pass2', 'invalid']]) {
    const result = audit(['x'], paths.map(path => ({ commit: 'x', record: path })), records);
    assert.equal(result.accepted, true);
    assert.deepEqual(result.rows[0], {
      commit: 'x', state: 'accepted', runs: paths.length,
      record: paths.includes('pass2') ? 'pass2' : 'pass1', reason: 'every required suite passed',
    });
  }
});

test('pending takes precedence over failed and invalid runs and cites pending evidence', () => {
  const records = {
    pending: record('x', { results: { ...passedResults, graphics: { state: 'deferred' } }, overall: { state: 'pending' } }),
    failed: record('x', { results: { ...passedResults, browser: { state: 'failed' } }, overall: { state: 'failed' } }),
    invalid: record('other'),
  };
  for (const paths of [['pending', 'failed', 'invalid'], ['failed', 'invalid', 'pending']]) {
    const result = audit(['x'], paths.map(path => ({ commit: 'x', record: path })), records);
    assert.equal(result.accepted, false);
    assert.deepEqual(result.rows[0], { commit: 'x', state: 'pending', runs: 3, record: 'pending', reason: 'GPU suites deferred by explicit handoff' });
  }
});

test('failed takes precedence over invalid evidence and cites the failure', () => {
  const result = audit(['x'], [{ commit: 'x', record: 'failure' }, { commit: 'x', record: 'missing' }], {
    failure: record('x', { results: { ...passedResults, cleanup: { state: 'incomplete' } }, overall: { state: 'failed' } }),
  });
  assert.equal(result.accepted, false);
  assert.deepEqual(result.rows[0], { commit: 'x', state: 'failed', runs: 2, record: 'failure', reason: 'a required suite did not pass' });
});

test('invalid-only evidence cites the last invalid record and never accepts', () => {
  const result = audit(['x'], [{ commit: 'x', record: 'missing' }, { commit: 'x', record: 'wrong' }], { wrong: record('y') });
  assert.equal(result.accepted, false);
  assert.deepEqual(result.rows[0], { commit: 'x', state: 'invalid-evidence', runs: 2, record: 'wrong', reason: 'the record is for y, not x' });
});

test('each commit uses its own manifest including suites introduced later', () => {
  const oldIds = requiredIdsFromManifest({ suites: [{ id: 'browser' }] });
  const newIds = requiredIdsFromManifest({ suites: [{ id: 'browser' }, { id: 'workflow' }, { id: 'graphics' }] });
  const make = (commit, requiredIds) => record(commit, {
    requiredIds, results: Object.fromEntries(requiredIds.map(id => [id, { state: 'passed' }])),
  });
  const input = {
    commits: ['old', 'new'], entries: [{ commit: 'old', record: 'old' }, { commit: 'new', record: 'new' }],
    records: { old: make('old', oldIds), new: make('new', newIds) },
    requiredIdsFor: commit => commit === 'old' ? oldIds : newIds,
  };
  assert.equal(auditLedger(input).accepted, true);
  input.records.new = make('new', oldIds);
  assert.deepEqual(auditLedger(input).rows.map(row => row.state), ['accepted', 'invalid-evidence']);
  assert.equal(auditLedger(input).accepted, false);
});

test('missing, incomplete, not-run and unclassified results recompute as failed', () => {
  for (const state of [undefined, 'incomplete', 'not-run', 'unknown']) {
    const results = { ...passedResults, graphics: state === undefined ? undefined : { state } };
    assert.equal(judgeRecord('x', record('x', { results, overall: { state: 'failed' } }), IDS).state, 'failed');
    assert.equal(judgeRecord('x', record('x', { results }), IDS).state, 'invalid');
  }
});

test('unknown required suites and changed required order never validate a record', () => {
  for (const requiredIds of [undefined, null, [], [...IDS].reverse(), IDS.slice(0, -1)]) {
    assert.equal(judgeRecord('x', record('x'), requiredIds).state, 'invalid');
  }
});

test('malformed ledger values fail closed while unassigned gate records remain valid indexes', () => {
  const valid = { commit: 'x', overall: 'pending', record: 'r' };
  const unassigned = { commit: null, overall: 'failed', record: 'no-commit' };
  const invalid = [null, false, true, 5, 'text', [], {}, { commit: 'x' }, { commit: 'x', record: 1 }, { commit: '', record: 'r' }];
  const entries = parseLedger([valid, unassigned, ...invalid].map(value => JSON.stringify(value)).join('\r\n') + '\n \n');
  assert.deepEqual(entries, [valid, unassigned, ...invalid.map(() => null)]);
  const result = audit(['x'], entries, { r: record('x') });
  assert.deepEqual([result.accepted, result.corruptLedgerLines, result.rows[0].state], [false, invalid.length, 'accepted']);
  assert.equal(audit(['x'], [valid, unassigned], { r: record('x') }).accepted, true, 'ledger overall claims do not override valid records');
});

test('malformed manifests return an unknown suite set instead of throwing or accepting', () => {
  for (const manifest of [null, {}, { suites: null }, { suites: [null] }, { suites: [{}] }, { suites: [{ id: '' }] }, { suites: [{ id: 'unit' }] }, { suites: [{ id: 'browser' }, { id: 'browser' }] }]) {
    assert.equal(requiredIdsFromManifest(manifest), null);
  }
  assert.deepEqual(requiredIdsFromManifest({ suites: [] }), ['unit', 'build', 'cleanup']);
});

const FAILED_SHA = 'a'.repeat(40);
const FIX_SHA = 'b'.repeat(40);
const LATER_SHA = 'c'.repeat(40);
const exceptionEntry = (overrides = {}) => ({
  commit: FAILED_SHA, supersededBy: FIX_SHA, reason: 'Recorded recovery race fixed by the descendant.',
  approvedBy: 'user', date: '2026-10-21', ...overrides,
});
const exceptionFile = (entries = [exceptionEntry()]) => ({ schema: 'atlas.gate-exceptions', schemaVersion: 1, exceptions: entries });
const failedRecord = commit => record(commit, {
  results: { ...passedResults, browser: { state: 'failed' } }, overall: { state: 'failed' },
});
const exceptionInput = (overrides = {}) => ({
  commits: [FAILED_SHA, FIX_SHA],
  entries: [{ commit: FAILED_SHA, record: 'failure' }, { commit: FIX_SHA, record: 'fix' }],
  records: { failure: failedRecord(FAILED_SHA), fix: record(FIX_SHA) },
  requiredIdsFor: () => IDS,
  exceptions: exceptionFile(), ancestry: [{ commit: FAILED_SHA, supersededBy: FIX_SHA }],
  ...overrides,
});
const refused = (input, state = 'failed') => {
  const result = auditLedger(input);
  assert.equal(result.accepted, false);
  assert.equal(result.rows.find(row => row.commit === FAILED_SHA)?.state, state);
  assert.equal(result.exceptions?.entries[0]?.verdict, 'refused');
  assert.ok(result.exceptions?.entries[0]?.reason.length > 0);
  return result;
};

test('a recorded exception accepts a failed commit distinctly and cites both gate records', () => {
  const input = exceptionInput();
  const result = auditLedger(input);
  assert.equal(result.accepted, true);
  assert.deepEqual(result.rows.map(row => row.state), ['accepted-by-exception', 'accepted']);
  assert.equal(result.rows[0].record, 'failure');
  assert.equal(result.rows[0].supersedingRecord, 'fix');
  assert.equal(result.rows[0].supersededBy, FIX_SHA);
  assert.equal(result.rows[0].failureReason, 'a required suite did not pass');
  assert.deepEqual(result.exceptions.entries[0].entry, input.exceptions.exceptions[0]);
  assert.equal(result.exceptions.entries[0].verdict, 'applied');
  assert.equal(result.exceptions.entries[0].record, 'failure');
  assert.equal(result.exceptions.entries[0].supersedingRecord, 'fix');
  assert.deepEqual(result.exceptions.counts, { listed: 1, applied: 1, refused: 0 });
  assert.equal(result.counts.accepted, 1);
  assert.equal(result.counts['accepted-by-exception'], 1);
  assert.equal(result.counts.total, 2);
  assert.equal(input.records.failure.overall.state, 'failed', 'the original evidence is never rewritten');
});

test('an exception refuses a superseder without plain passing evidence', () => {
  for (const fix of [undefined, record('wrong'), failedRecord(FIX_SHA), record(FIX_SHA, {
    results: { ...passedResults, graphics: { state: 'deferred' } }, overall: { state: 'pending' },
  })]) {
    refused(exceptionInput({ records: { failure: failedRecord(FAILED_SHA), fix } }));
  }
  refused(exceptionInput({ entries: [{ commit: FAILED_SHA, record: 'failure' }] }));
});

test('an exception cannot use a superseder accepted only by another exception', () => {
  const first = exceptionEntry();
  const second = exceptionEntry({ commit: FIX_SHA, supersededBy: LATER_SHA });
  for (const exceptions of [[first, second], [second, first]]) {
    const input = exceptionInput({
      commits: [FAILED_SHA, FIX_SHA, LATER_SHA],
      entries: [{ commit: FAILED_SHA, record: 'failure' }, { commit: FIX_SHA, record: 'fix' }, { commit: LATER_SHA, record: 'later' }],
      records: { failure: failedRecord(FAILED_SHA), fix: failedRecord(FIX_SHA), later: record(LATER_SHA) },
      exceptions: exceptionFile(exceptions), ancestry: [first, second],
    });
    const result = auditLedger(input);
    assert.equal(result.accepted, false);
    assert.deepEqual(result.rows.map(row => row.state), ['failed', 'accepted-by-exception', 'accepted']);
    assert.equal(result.exceptions?.entries.find(item => item.entry.commit === FAILED_SHA)?.verdict, 'refused');
    assert.deepEqual(result.exceptions?.counts, { listed: 2, applied: 1, refused: 1 });
  }
});

test('a later unrelated commit or absent ancestry evidence cannot justify an exception', () => {
  for (const ancestry of [undefined, [], [{ commit: FIX_SHA, supersededBy: FAILED_SHA }]]) {
    const result = refused(exceptionInput({ ancestry }));
    assert.match(result.exceptions.entries[0].reason, /descendant|ancestry/);
  }
});

test('a superseder before the failed commit or the commit itself cannot justify an exception', () => {
  refused(exceptionInput({ commits: [FIX_SHA, FAILED_SHA] }));
  refused(exceptionInput({ exceptions: exceptionFile([exceptionEntry({ supersededBy: FAILED_SHA })]) }));
});

test('a passing superseder outside the audited range cannot justify an exception', () => {
  const result = refused(exceptionInput({ commits: [FAILED_SHA] }));
  assert.match(result.exceptions.entries[0].reason, /range/);
});

test('an ungated commit can never be accepted by exception', () => {
  const result = refused(exceptionInput({ entries: [{ commit: FIX_SHA, record: 'fix' }] }), 'ungated');
  assert.equal(result.rows[0].runs, 0);
  assert.equal(result.rows[0].record, null);
});

test('exceptions do not change pending, invalid-evidence or plainly accepted rows', () => {
  const cases = [
    ['pending', record(FAILED_SHA, { results: { ...passedResults, graphics: { state: 'deferred' } }, overall: { state: 'pending' } })],
    ['invalid-evidence', record('wrong')],
    ['accepted', record(FAILED_SHA)],
  ];
  for (const [state, failure] of cases) refused(exceptionInput({ records: { failure, fix: record(FIX_SHA) } }), state);
});

test('a malformed exception file refuses all exceptions and reports the file error', () => {
  const malformed = [
    null, [], {}, { unreadable: 'Unexpected token' },
    { ...exceptionFile(), schema: 'other' }, { ...exceptionFile(), schemaVersion: 2 },
    { ...exceptionFile(), exceptions: null },
    ...[null, {}, exceptionEntry({ commit: 'a' }), exceptionEntry({ supersededBy: 'g'.repeat(40) }),
      exceptionEntry({ reason: ' ' }), exceptionEntry({ approvedBy: 'assistant' }),
      exceptionEntry({ date: '2026-02-30' }), exceptionEntry({ date: undefined }),
    ].map(entry => exceptionFile([exceptionEntry(), entry])),
  ];
  for (const exceptions of malformed) {
    const result = auditLedger(exceptionInput({ exceptions }));
    assert.equal(result.accepted, false);
    assert.equal(result.rows[0].state, 'failed');
    assert.equal(result.exceptions?.state, 'invalid');
    assert.ok(result.exceptions?.reason.length > 0);
    assert.equal(result.exceptions?.counts.applied, 0);
    assert.ok(result.exceptions?.entries.every(item => item.verdict === 'refused'));
  }
});

test('duplicate exception entries invalidate the whole file instead of choosing an approval', () => {
  const result = refused(exceptionInput({ exceptions: exceptionFile([exceptionEntry(), exceptionEntry({ reason: 'another reason' })]) }));
  assert.equal(result.exceptions.state, 'invalid');
  assert.deepEqual(result.exceptions.counts, { listed: 2, applied: 0, refused: 2 });
  assert.match(result.exceptions.reason, /duplicate/);
});

test('an unlisted failed commit stays failed even when another exception applies', () => {
  const input = exceptionInput({ commits: [FAILED_SHA, LATER_SHA, FIX_SHA] });
  input.entries.push({ commit: LATER_SHA, record: 'other-failure' });
  input.records['other-failure'] = failedRecord(LATER_SHA);
  const result = auditLedger(input);
  assert.equal(result.accepted, false);
  assert.deepEqual(result.rows.map(row => row.state), ['accepted-by-exception', 'failed', 'accepted']);
  assert.equal(result.exceptions?.counts.applied, 1);
});

test('an exception naming a target outside the range is refused and reported', () => {
  const result = auditLedger(exceptionInput({ commits: [FIX_SHA] }));
  assert.equal(result.accepted, false);
  assert.equal(result.rows[0].state, 'accepted');
  assert.equal(result.exceptions?.entries[0]?.verdict, 'refused');
  assert.match(result.exceptions.entries[0].reason, /range/);
});

test('missing or empty exceptions never infer approval and corruption still prevents acceptance', () => {
  for (const exceptions of [undefined, exceptionFile([])]) {
    const result = auditLedger(exceptionInput({ exceptions }));
    assert.equal(result.accepted, false);
    assert.equal(result.rows[0].state, 'failed');
    assert.deepEqual(result.exceptions?.counts, { listed: 0, applied: 0, refused: 0 });
  }
  const input = exceptionInput();
  input.entries.push(null);
  const result = auditLedger(input);
  assert.equal(result.accepted, false);
  assert.equal(result.corruptLedgerLines, 1);
  assert.equal(result.exceptions?.counts.applied, 1);
});

test('a malformed exception file prevents acceptance even when all gate records pass', () => {
  const result = auditLedger(exceptionInput({ exceptions: { unreadable: 'invalid JSON' }, records: { failure: record(FAILED_SHA), fix: record(FIX_SHA) } }));
  assert.equal(result.accepted, false);
  assert.deepEqual(result.rows.map(row => row.state), ['accepted', 'accepted']);
  assert.equal(result.exceptions?.state, 'invalid');
});
