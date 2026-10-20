// The only way to run Node unit tests (npm test). Never starts a browser, server or GPU:
// every test process is preloaded with tests/support/no-launch.mjs.
//   node scripts/run-unit.mjs                          all files in tests/unit.manifest.json
//   node scripts/run-unit.mjs tests/unit/x.test.js     selected manifest files
//   … --expect-missing src/shared/scene.js             RED: that module does not exist yet
//   … --expect-fail "exact test name"                  RED: that named test fails
import { spawn } from 'node:child_process';
import { readFile, mkdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runBounded } from './gate/supervise.mjs';
import { parseTapSummary, classifyUnit, classifyRed } from './gate/lib.mjs';

export const UNIT_TIMEOUT_MS = 600_000;
export const TEST_CASE_TIMEOUT_MS = 10_000;

export function parseArgs(argv) {
  const files = [], expectation = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--expect-missing') expectation.missing = argv[++i];
    else if (argv[i] === '--expect-fail') expectation.failing = argv[++i];
    else files.push(argv[i]);
  }
  if ('missing' in expectation && !expectation.missing) throw new Error('--expect-missing needs a module path');
  if ('failing' in expectation && !expectation.failing) throw new Error('--expect-fail needs a test name');
  return { files, expectation };
}

export function selectFiles(manifest, requested) {
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) throw new Error('tests/unit.manifest.json lists no files');
  const unknown = requested.filter(file => !manifest.files.includes(file));
  if (unknown.length) throw new Error(`not in tests/unit.manifest.json: ${unknown.join(', ')}`);
  return requested.length ? requested : manifest.files;
}

async function main() {
  const root = resolve(new URL('..', import.meta.url).pathname);
  const { files: requested, expectation } = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(resolve(root, 'tests/unit.manifest.json'), 'utf8'));
  const files = selectFiles(manifest, requested);
  for (const file of files) await access(resolve(root, file));
  await mkdir(resolve(root, 'artifacts/runtime'), { recursive: true });
  const run = await runBounded({
    spawnFn: spawn, command: process.execPath, timeoutMs: UNIT_TIMEOUT_MS, echo: !expectation.missing && !expectation.failing,
    args: ['--import', './tests/support/no-launch.mjs', '--test', '--test-reporter=tap', `--test-timeout=${TEST_CASE_TIMEOUT_MS}`, ...files],
    options: { cwd: root, env: { ...process.env, TMPDIR: resolve(root, 'artifacts/runtime'), ATLAS_UNIT_MODE: '1' } },
  });
  const output = `${run.stdout}\n${run.stderr}`;
  if (expectation.missing || expectation.failing) {
    const red = classifyRed(run, output, expectation);
    console.log(`${red.confirmed ? 'RED confirmed' : 'RED NOT confirmed'}: ${red.reason}`);
    if (!red.confirmed) console.log(output);
    process.exitCode = red.confirmed ? 0 : 1;
    return;
  }
  const result = classifyUnit(run, parseTapSummary(run.stdout));
  console.log(`UNIT ${JSON.stringify({ ...result, cleanup: run.cleanup, files: files.length, summary: parseTapSummary(run.stdout) })}`);
  process.exitCode = result.state === 'passed' ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) await main();
