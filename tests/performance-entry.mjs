// Offline integration: launch the registered entry points, never a browser/GPU.
import './support/entry-guard.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runBounded } from '../scripts/gate/supervise.mjs';

const report = [], pass = 'Registered P3 entry points terminate without a circular module wait';
await mkdir('artifacts/runtime', { recursive: true });
const receipts = await mkdtemp(resolve('artifacts/runtime/performance-entry-'));
try {
  const manifest = JSON.parse(await readFile('tests/suites.manifest.json', 'utf8'));
  for (const scene of ['bulb', 'quaternion', 'menger']) {
    const suite = manifest.suites.find(suite => suite.id === `space-performance-${scene}`);
    assert.ok(suite, `registered ${scene} command`);
    const receipt = resolve(receipts, `${scene}.json`);
    const result = await runBounded({ spawnFn: spawn, command: process.execPath,
      args: ['--experimental-loader', './tests/support/performance-entry-loader.mjs', ...suite.command],
      options: { cwd: process.cwd(), env: { ...process.env, ATLAS_P3_ENTRY_RECEIPT: receipt } }, timeoutMs: 5000, cleanupMs: 1000 });
    report.push({ name: 'entry', scene, ...result });
    assert.equal(result.cleanup, 'confirmed', `entry process cleanup: ${JSON.stringify(result)}`);
    assert.equal(result.timedOut, false, 'entry point must not deadlock');
    assert.equal(result.exitCode, 0, `entry point must complete: ${JSON.stringify(result)}`);
    assert.deepEqual(JSON.parse(await readFile(receipt, 'utf8')), { scene, implementationLoaded: true });
  }
  report.push({ name: pass }); console.log(`PASS ${pass}`);
} catch (error) {
  report.push({ name: 'FAIL', error: String(error.stack ?? error) }); throw error;
} finally {
  await rm(receipts, { recursive: true, force: true });
  await writeFile('artifacts/performance-entry-report.json', `${JSON.stringify(report, null, 2)}\n`);
}
