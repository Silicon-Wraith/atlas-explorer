// CPU-only gate entry. Activate the same enforced launch guard used by unit children.
import { mkdir, rm, writeFile } from 'node:fs/promises';
process.env.NODE_TEST_CONTEXT = 'child-reference';
const { unitGuardActive } = await import('./support/no-launch.mjs');
if (!unitGuardActive) throw new Error('reference suite requires the no-launch guard');
const { runReferenceChecks } = await import('./support/reference-checks.mjs');
const stdoutOnly = process.argv.slice(2).includes('--stdout');
if (process.argv.slice(2).some(arg => arg !== '--stdout')) throw new Error('usage: node tests/reference.mjs [--stdout]');
const reportPath = new URL('../artifacts/reference-report.json', import.meta.url);
if (!stdoutOnly) await rm(reportPath, { force: true });
const report = [];
try {
  await runReferenceChecks({ onPass: entry => report.push(entry), onProgress: message => console.log(`REFERENCE_PROGRESS ${message}`) });
} catch (error) {
  report.push({ name: 'FAIL', state: 'failed', error: error?.stack ?? String(error) });
  process.exitCode = error?.code === 'ATLAS_REFERENCE_TIMEOUT' ? 124 : 1;
}
if (!stdoutOnly) {
  await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
}
console.log(`REFERENCE ${JSON.stringify(report)}`);
