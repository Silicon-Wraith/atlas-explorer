// Pure evidence and classification rules for the unit runner and the Plane gate.
// Nothing here launches a process or touches the file system.
import { validateReferenceReport } from './reference-evidence.mjs';

export const SUITE_STATES = Object.freeze(['passed', 'failed', 'deferred', 'not-run', 'incomplete']);

// Reads the summary block that node:test's TAP reporter prints last.
export function parseTapSummary(text) {
  const read = name => {
    const match = String(text).match(new RegExp(`^# ${name} (\\d+)$`, 'm'));
    return match ? Number(match[1]) : null;
  };
  const summary = { tests: read('tests'), pass: read('pass'), fail: read('fail'), cancelled: read('cancelled'), skipped: read('skipped'), todo: read('todo') };
  return Object.values(summary).some(value => value === null) ? null : summary;
}

// A unit run passes only with at least one executed test and no failure, cancellation, skip or todo.
export function classifyUnit({ exitCode, signal, timedOut, spawnError, cleanup }, summary) {
  if (cleanup === 'unconfirmed') return { state: 'incomplete', reason: 'cleanup-unconfirmed: an owned process did not exit' };
  if (timedOut) return { state: 'incomplete', reason: 'timeout' };
  if (spawnError) return { state: 'incomplete', reason: `launch-error: ${spawnError}` };
  if (signal) return { state: 'incomplete', reason: `interrupted: ${signal}` };
  if (!summary) return { state: 'incomplete', reason: 'missing-evidence: no TAP summary' };
  if (summary.tests === 0) return { state: 'failed', reason: 'no-tests' };
  if (summary.skipped > 0 || summary.todo > 0) return { state: 'failed', reason: 'skipped-or-todo-tests' };
  if (summary.fail > 0 || summary.cancelled > 0 || exitCode !== 0) return { state: 'failed', reason: `failures: ${summary.fail}, cancelled: ${summary.cancelled}, exit: ${exitCode}` };
  if (summary.pass !== summary.tests) return { state: 'failed', reason: 'pass count differs from test count' };
  return { state: 'passed', reason: `${summary.pass} tests passed` };
}

const NON_BEHAVIOURAL = /ERR_MODULE_NOT_FOUND|SyntaxError|ReferenceError: .* is not defined|LaunchDeniedError|ATLAS_LAUNCH_DENIED|cancelledByParent|'test timed out'/;

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The TAP block of one failing test: from its `not ok` line up to the next result line.
export function tapBlock(output, name) {
  const lines = String(output).split('\n');
  const heading = new RegExp(`^\\s*not ok \\d+ - ${escapeRegExp(name)}\\s*$`);
  const start = lines.findIndex(line => heading.test(line));
  if (start < 0) return null;
  const end = lines.findIndex((line, index) => index > start && /^\s*(ok|not ok) \d+ - /.test(line));
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

// RED is behavioural: the named test executes against an importable interface and fails on an
// assertion (ERR_ASSERTION). Missing modules, syntax, reference, launch and timeout failures never
// count. `missing` exists only for the T00 bootstrap and is reported as such.
export function classifyRed(run, output, expectation) {
  if (run.cleanup === 'unconfirmed') return { confirmed: false, reason: 'cleanup-unconfirmed: an owned process did not exit' };
  if (run.timedOut || run.signal || run.spawnError) return { confirmed: false, reason: 'the RED run did not finish normally' };
  if (run.exitCode === 0) return { confirmed: false, reason: 'the tests passed; RED requires a failure' };
  if (expectation.missing) {
    const ok = /ERR_MODULE_NOT_FOUND/.test(output) && output.includes(expectation.missing);
    return ok ? { confirmed: true, reason: `bootstrap only: module ${expectation.missing} does not exist yet` } : { confirmed: false, reason: `expected ERR_MODULE_NOT_FOUND for ${expectation.missing}` };
  }
  if (expectation.failing) {
    if (NON_BEHAVIOURAL.test(output)) return { confirmed: false, reason: 'a module, syntax, reference, launch or timeout failure occurred; RED must be an assertion' };
    const block = tapBlock(output, expectation.failing);
    if (!block) return { confirmed: false, reason: `"${expectation.failing}" did not fail` };
    if (!/ERR_ASSERTION/.test(block)) return { confirmed: false, reason: `"${expectation.failing}" failed, but not on an assertion` };
    return { confirmed: true, reason: `"${expectation.failing}" fails on an assertion` };
  }
  return { confirmed: false, reason: 'no RED expectation given' };
}

// Evidence validators. `missing` means the evidence does not exist (incomplete);
// `invalid` means it exists and shows a failure or a vacuous run (failed).
export function validateEvidence(suite, evidence) {
  if (suite.evidence === 'build') {
    const missing = (suite.requiredFiles || []).filter(file => !evidence.files?.[file]);
    return missing.length ? { ok: false, kind: 'missing', detail: `build output lacks ${missing.join(', ')}` } : { ok: true };
  }
  const report = evidence.report;
  if (report === undefined) return { ok: false, kind: 'missing', detail: `no report at ${suite.report}` };
  if (suite.evidence === 'reference') return validateReferenceReport(suite, report);
  if (!Array.isArray(report) || report.length === 0) return { ok: false, kind: 'invalid', detail: 'report is empty or not a list' };
  if (suite.evidence === 'browser') {
    if (report.some(entry => entry?.name === 'FAIL')) return { ok: false, kind: 'invalid', detail: 'report records a failure' };
    const names = new Set(report.map(entry => entry?.name));
    const absent = (suite.requiredPasses || []).filter(name => !names.has(name));
    if (!suite.requiredPasses?.length) return { ok: false, kind: 'invalid', detail: 'suite declares no required passes' };
    return absent.length ? { ok: false, kind: 'invalid', detail: `missing passes: ${absent.join('; ')}` } : { ok: true };
  }
  if (suite.evidence === 'navigation') {
    const backends = report.map(entry => entry?.backend).sort();
    if (JSON.stringify(backends) !== JSON.stringify(['cpu', 'gpu'])) return { ok: false, kind: 'invalid', detail: `backends ${backends}` };
    const bad = report.filter(entry => !(entry.frames > 0 && entry.renderedPerWheel === 1 && entry.burst?.commits === 1));
    return bad.length ? { ok: false, kind: 'invalid', detail: 'a backend lacks frames, a single wheel commit or a burst result' } : { ok: true };
  }
  if (suite.evidence === 'graphics') {
    const bad = report.filter(entry => entry?.error || entry?.samples?.length !== 6 || (suite.benchmark && entry?.benchmarks?.length !== 4));
    return bad.length ? { ok: false, kind: 'invalid', detail: 'a graphics entry failed or is incomplete' } : { ok: true };
  }
  if (suite.evidence === 'workflow') {
    if (report.some(entry => entry?.name === 'FAIL')) return { ok: false, kind: 'invalid', detail: 'report records a failure' };
    const names = new Set(report.map(entry => entry?.name));
    const absent = (suite.requiredPasses || []).filter(name => !names.has(name));
    if (!suite.requiredPasses?.length) return { ok: false, kind: 'invalid', detail: 'suite declares no required passes' };
    return absent.length ? { ok: false, kind: 'invalid', detail: `missing passes: ${absent.join('; ')}` } : { ok: true };
  }
  return { ok: false, kind: 'invalid', detail: `unknown evidence kind ${suite.evidence}` };
}

export function classifySuiteRun(run, evidenceResult) {
  if (/CLEANUP-UNCONFIRMED/.test(`${run.stdout ?? ''}\n${run.stderr ?? ''}`)) return { state: 'incomplete', reason: 'cleanup-unconfirmed: the suite could not confirm closing its browser', cleanup: 'unconfirmed' };
  if (run.cleanup === 'unconfirmed') return { state: 'incomplete', reason: 'cleanup-unconfirmed: the process tree did not exit after SIGKILL', cleanup: 'unconfirmed' };
  if (run.timedOut) return { state: 'incomplete', reason: 'timeout' };
  if (run.spawnError) return { state: 'incomplete', reason: `launch-error: ${run.spawnError}` };
  if (run.signal) return { state: 'incomplete', reason: `interrupted: ${run.signal}` };
  if (run.exitCode === 124) return { state: 'incomplete', reason: 'the suite reached its own deadline' };
  if (run.exitCode === 125) return { state: 'incomplete', reason: 'cleanup-unconfirmed: the suite could not close its browser', cleanup: 'unconfirmed' };
  if (run.exitCode !== 0) return { state: 'failed', reason: `exit ${run.exitCode}` };
  if (!evidenceResult.ok) return { state: evidenceResult.kind === 'missing' ? 'incomplete' : 'failed', reason: evidenceResult.detail };
  return { state: 'passed', reason: 'exit 0 with valid evidence' };
}

// Overall: 0 passed, 2 pending (only explicit GPU deferrals outstanding), 1 failed.
export function overallGate(results, requiredIds) {
  const states = requiredIds.map(id => results[id]?.state ?? 'not-run');
  for (const state of states) if (!SUITE_STATES.includes(state)) return { state: 'failed', exitCode: 1, reason: `unclassified state ${state}` };
  if (states.some(state => state === 'failed' || state === 'incomplete' || state === 'not-run')) return { state: 'failed', exitCode: 1, reason: 'a required suite did not pass' };
  if (states.some(state => state === 'deferred')) return { state: 'pending', exitCode: 2, reason: 'GPU suites deferred by explicit handoff' };
  return { state: 'passed', exitCode: 0, reason: 'every required suite passed' };
}
