// spikes/project0/tests/evidence-guard.test.mjs — the shared guard for tests that read the git-ignored campaign evidence
// (artifacts/project0): complete evidence runs them, wholly absent evidence skips them with a reason, and partial evidence is an error,
// never a silent skip (Codex pre-PR review run 20261020T214152Z-80df, finding 1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT } from '../launch.mjs';
import { evidenceSkip, requiredEvidenceDirs } from './evidence-guard.mjs';

const dirs = requiredEvidenceDirs();
const at = d => join(ROOT, 'artifacts/project0', d);

test('evidence guard: the required directories are every run directory of the webgpu-1 and webgpu-remediation manifests', () => {
  assert.equal(dirs.length, 13);
  assert.ok(dirs.includes('20261019T235716360Z-webgpu-1-g1-headed') && dirs.includes('20261020T051022962Z-webgpu-remediation-g13-headed'));
});

test('evidence guard: complete evidence runs the tests', () => {
  assert.equal(evidenceSkip({ exists: () => true }), false);
});

test('evidence guard: wholly absent evidence skips with a stated reason', () => {
  const skip = evidenceSkip({ exists: () => false });
  assert.equal(typeof skip, 'string');
  assert.match(skip, /not installed/);
});

test('evidence guard: partial evidence throws "Partial Project 0 evidence" naming the missing directories, never a skip', () => {
  for (const missing of [dirs[0], dirs.at(-1)]) {
    assert.throws(() => evidenceSkip({ exists: p => p !== at(missing) }), e => /Partial Project 0 evidence/.test(e.message) && e.message.includes(missing));
  }
  assert.throws(() => evidenceSkip({ exists: p => p === at(dirs[3]) }), /Partial Project 0 evidence/, 'one directory present is still partial');
});
