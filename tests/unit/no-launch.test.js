import test from 'node:test';
import assert from 'node:assert/strict';
import * as childProcess from 'node:child_process';
import { spawn, execFileSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { DENIED_METHODS, LaunchDeniedError, unitGuardActive } from '../support/no-launch.mjs';
import { readFileSync } from 'node:fs';
import { within, BoundedWaitTimeout, closeWithin, installSuiteDeadline, cleanupState, CHROME_TMPDIR, chromeSocketPathFits, chromeLaunchEnv } from '../support/bounded.mjs';

test('the launch guard is active inside unit-test processes', () => {
  assert.equal(unitGuardActive, true, 'run unit tests through scripts/run-unit.mjs');
  assert.equal(process.env.ATLAS_UNIT_MODE, '1');
});

test('every child_process launcher throws before any side effect', () => {
  for (const method of DENIED_METHODS) {
    assert.throws(() => childProcess[method]('node', ['-e', '']), error => error instanceof LaunchDeniedError && error.method === method, method);
  }
  assert.throws(() => spawn('node'), LaunchDeniedError, 'named ESM binding');
  assert.throws(() => execFileSync('node'), LaunchDeniedError, 'named ESM binding');
});

test('worker threads remain available to unit tests', async () => {
  const worker = new Worker('require("node:worker_threads").parentPort.postMessage(21 * 2)', { eval: true });
  try {
    const value = await within(new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); }), 5000, 'worker');
    assert.equal(value, 42);
  } finally { await worker.terminate(); }
});

test('browser suites refuse to start under a unit run', async () => {
  for (const suite of ['../browser.mjs', '../navigation.mjs', '../graphics.mjs', '../workflow.mjs']) {
    await assert.rejects(import(suite), error => error.name === 'UnitModeRefusal', suite);
  }
});

test('bounded waits resolve in time and time out with a classified error', async () => {
  assert.equal(await within(Promise.resolve(7), 50, 'fast'), 7);
  await assert.rejects(within(new Promise(() => {}), 20, 'stuck'), error => error instanceof BoundedWaitTimeout && error.code === 'ATLAS_WAIT_TIMEOUT' && error.label === 'stuck');
  assert.throws(() => within(Promise.resolve(), Infinity, 'unbounded'), RangeError);
});

test('an unconfirmed browser close is terminal and survives a later deadline', async () => {
  class Stopped extends Error {}
  const exits = [];
  const exit = code => { exits.push(code); throw new Stopped(); };
  let launchedNext = false;
  // The simulated failure's protocol lines are captured, never written into the enclosing unit run
  // (the gate reads CLEANUP-UNCONFIRMED from real suite output).
  const captured = [], originalError = console.error;
  console.error = (...args) => { captured.push(args.join(' ')); };
  try {
    const suite = async () => {
      await closeWithin({ close: () => new Promise(() => {}) }, 'browser', { ms: 10, exit });
      launchedNext = true;
    };
    await assert.rejects(suite(), Stopped);
    assert.equal(launchedNext, false, 'no further launch after the failed close');
    assert.deepEqual(exits, [125]);
    assert.equal(cleanupState.unconfirmed, true);
    assert.ok(captured.some(line => line.startsWith('CLEANUP-UNCONFIRMED browser')), 'the marker is emitted');
    const deadlineExits = [];
    const timer = installSuiteDeadline('test', 5, { exit: code => deadlineExits.push(code) });
    await new Promise(resolve => setTimeout(resolve, 30));
    clearTimeout(timer);
    assert.deepEqual(deadlineExits, [125], 'a deadline cannot downgrade 125 to 124');
  } finally {
    console.error = originalError;
    cleanupState.unconfirmed = false;
  }
});

// Fix round 1 (Codex run 20261020T184044Z-f4e5; controller ruling on the Chrome socket path).
const suiteText = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('installed Chrome gets a temporary directory whose socket path fits', () => {
  assert.equal(chromeSocketPathFits(CHROME_TMPDIR), true, CHROME_TMPDIR);
  assert.equal(chromeSocketPathFits('/mnt/ml_storage/dev/projects/mandelbrot_explorer-wt/project1a/artifacts/runtime'), false, 'the first GPU gate failed on this path');
  assert.equal(chromeLaunchEnv({ TMPDIR: '/elsewhere', KEEP: '1' }).TMPDIR, CHROME_TMPDIR);
  assert.equal(chromeLaunchEnv({ KEEP: '1' }).KEEP, '1', 'the rest of the environment is kept');
  assert.match(suiteText('graphics.mjs'), /env: chromeLaunchEnv\(\)/, 'the installed-Chrome launch uses it');
});

test('every Playwright input, CDP and locator evaluation in the browser suites is bounded', () => {
  const unbounded = /\.keyboard\.|\.mouse\.|newCDPSession\(|touch\.send\(|touch\.detach\(|\.locator\([^;]*\)\.evaluate\(/;
  const offenders = [];
  for (const name of ['browser.mjs', 'navigation.mjs', 'graphics.mjs', 'workflow.mjs']) {
    suiteText(name).split('\n').forEach((line, index) => {
      for (const statement of line.split(';')) if (unbounded.test(statement) && !/within\(/.test(statement)) offenders.push(`${name}:${index + 1}: ${statement.trim()}`);
    });
  }
  assert.deepEqual(offenders, []);
});
