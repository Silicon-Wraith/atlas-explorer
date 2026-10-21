// spikes/project0/tests/evidence-guard.mjs — shared skip guard for tests that read the git-ignored campaign evidence (artifacts/project0).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../launch.mjs';

export const requiredEvidenceDirs = (root = ROOT) => ['webgpu-1', 'webgpu-remediation']
  .flatMap(c => JSON.parse(readFileSync(join(root, `docs/reports/project0/${c}-manifest.json`), 'utf8')).runDirs);

// Complete evidence runs the tests (false); wholly absent evidence (a clean clone) skips them with a reason; partial evidence is an error,
// so a damaged installation is never mistaken for an absent one (Codex pre-PR review run 20261020T214152Z-80df).
export function evidenceSkip({ root = ROOT, exists = existsSync } = {}) {
  const dirs = requiredEvidenceDirs(root), missing = dirs.filter(d => !exists(join(root, 'artifacts/project0', d)));
  if (missing.length && missing.length < dirs.length) throw new Error(`Partial Project 0 evidence: required run directories are missing: ${missing.join(', ')}`);
  return missing.length ? 'the git-ignored campaign evidence (artifacts/project0) is not installed' : false;
}
