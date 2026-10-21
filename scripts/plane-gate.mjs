// The Plane behaviour gate (spec §4.3, §16.3), run on every 1a commit:
//   ATLAS_GPU_HANDOFF="<who, when>" node scripts/plane-gate.mjs     GPU handed to Project 1
//   ATLAS_GPU_DEFERRED="<reason>"   node scripts/plane-gate.mjs     GPU held (e.g. by Project 0)
// Exactly one of the two must be set; the gate never probes the GPU.
// Exit 0 passed, 2 pending (only GPU suites deferred), 1 failed. Records go to
// artifacts/gates/<stamp>-<sha>.json and one line per run to artifacts/gates/ledger.jsonl.
import { spawn, execFileSync } from 'node:child_process';
import { connect } from 'node:net';
import { readFile, rm, mkdir, writeFile, appendFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runBounded, cleanUpGroup } from './gate/supervise.mjs';
import { validateEvidence, classifySuiteRun, overallGate } from './gate/lib.mjs';

export const GATE_PORT = 5190;
export const SERVER_READY_MS = 15_000;
export const UNIT_MS = 600_000;
export const BUILD_MS = 120_000;
export const SUITE_MS = 600_000;
export const CLEANUP_MS = 5_000;
export const GATE_RECORD_SCHEMA = 'atlas.plane-gate';
export const GIT_MS = 10_000;

function startOwnedServer({ spawnFn, root, env }) {
  return new Promise(resolveStart => {
    let child, ready = false, output = '';
    try {
      child = spawnFn(process.execPath, ['scripts/serve.mjs', '--port', String(GATE_PORT)], { cwd: root, env: { ...env, PORT: String(GATE_PORT) }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    } catch (error) { resolveStart({ ok: false, reason: `server launch failed: ${error.message}` }); return; }
    const server = { child, exited: false };
    child.once('close', () => { server.exited = true; });
    const timer = setTimeout(() => { if (!ready) resolveStart({ ok: false, reason: 'server did not report readiness', server }); }, SERVER_READY_MS);
    child.stdout.on('data', data => {
      output += data;
      if (!ready && output.includes(`ATLAS is ready at http://localhost:${GATE_PORT}`)) { ready = true; clearTimeout(timer); resolveStart({ ok: true, server }); }
    });
    child.stderr?.on('data', data => { output += data; });
    child.once('error', error => { clearTimeout(timer); server.exited = true; if (!ready) resolveStart({ ok: false, reason: `server error: ${error.message}`, server }); });
    child.once('close', code => { clearTimeout(timer); if (!ready) resolveStart({ ok: false, reason: `server exited (${code}) before readiness: ${output.trim()}`, server }); });
  });
}

// → 'not-needed' | 'confirmed' | 'unconfirmed': the server's whole process group has exited.
function stopOwnedServer(server, groupSignal) {
  if (!server) return Promise.resolve('not-needed');
  return cleanUpGroup({ groupSignal, pgid: server.child.pid, leader: { closed: () => server.exited }, cleanupMs: CLEANUP_MS });
}

// deps: { root, env, spawnFn, groupSignal?, git: { head(), porcelain() }, fs: { readJson(rel), exists(rel), remove(rel) }, probePort(port), now() }
// runGate never rejects once its dependencies are present: an infrastructure error (a git timeout,
// a file-system failure, an unreadable manifest) marks the stage it interrupted incomplete and the
// record is still finished, so main always writes it and its ledger line.
export const TAIL_BYTES = 16_384;
const tail = text => String(text ?? '').slice(-TAIL_BYTES);
// An unsuccessful result keeps the end of the run's output as its diagnostics.
const withTails = (result, run) => result.state === 'passed' ? result : { ...result, stdoutTail: tail(run.stdout), stderrTail: tail(run.stderr) };

export async function runGate(deps) {
  for (const key of ['root', 'env', 'spawnFn', 'git', 'fs', 'probePort', 'now']) if (!deps?.[key]) throw new TypeError(`runGate requires ${key}`);
  const { root, env, spawnFn, git, fs, probePort, now } = deps;
  const groupSignal = deps.groupSignal ?? ((pgid, signal) => process.kill(-pgid, signal));
  const startedAt = now();
  const results = {};
  const record = { schema: GATE_RECORD_SCHEMA, schemaVersion: 1, startedAt, commit: null, requiredIds: ['unit', 'build', 'cleanup'], handoff: env.ATLAS_GPU_HANDOFF || null, deferral: env.ATLAS_GPU_DEFERRED || null, results, notes: [] };
  let cleanupConfirmed = true;
  let stage = 'unit'; // the required id an infrastructure error is charged to
  const finish = () => {
    if (!results.cleanup) results.cleanup = cleanupConfirmed ? { state: 'passed', reason: 'every owned process exited' } : { state: 'incomplete', reason: 'cleanup-unconfirmed: an owned process tree did not exit' };
    record.finishedAt = now(); record.overall = overallGate(results, record.requiredIds); return record;
  };
  let childEnv;
  const supervised = async (args, timeoutMs, extraEnv = {}) => {
    const run = await runBounded({ spawnFn, groupSignal, command: process.execPath, args, options: { cwd: root, env: { ...childEnv, ...extraEnv } }, timeoutMs, cleanupMs: CLEANUP_MS });
    if (run.cleanup === 'unconfirmed' || run.exitCode === 125 || /CLEANUP-UNCONFIRMED/.test(`${run.stdout}\n${run.stderr}`)) cleanupConfirmed = false;
    return run;
  };

  try {
    const manifest = await fs.readJson('tests/suites.manifest.json');
    if (!Array.isArray(manifest?.suites) || !Array.isArray(manifest?.build?.requiredFiles)) throw new Error('tests/suites.manifest.json is missing or malformed');
    record.requiredIds = ['unit', 'build', ...manifest.suites.map(suite => suite.id), 'cleanup'];
    for (const suite of manifest.suites) {
      const timeout = suite.timeoutMs ?? SUITE_MS;
      if (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > SUITE_MS) throw new Error(`invalid suite timeout: ${suite.id}`);
      if (suite.server === false && suite.gpu) throw new Error(`CPU suite cannot require a GPU: ${suite.id}`);
    }

    if (Boolean(env.ATLAS_GPU_HANDOFF) === Boolean(env.ATLAS_GPU_DEFERRED)) {
      record.notes.push('exactly one of ATLAS_GPU_HANDOFF or ATLAS_GPU_DEFERRED must name the GPU state');
      return finish();
    }
    record.commit = await git.head();
    if (await git.porcelain()) { record.notes.push('the working tree has uncommitted changes; a gate runs only on a commit'); return finish(); }
    childEnv = { ...env, TMPDIR: resolve(root, 'artifacts/runtime') };

    const unit = await supervised(['scripts/run-unit.mjs'], UNIT_MS);
    const unitLine = unit.stdout.split('\n').find(line => line.startsWith('UNIT '));
    let unitResult = null;
    try { unitResult = unitLine ? JSON.parse(unitLine.slice(5)) : null; } catch { unitResult = null; }
    if (unitResult?.cleanup === 'unconfirmed' || /^cleanup-unconfirmed/.test(unitResult?.reason ?? '')) {
      // The runner's own supervised test process outlived its cleanup: that is a cleanup failure.
      cleanupConfirmed = false;
      results.unit = withTails({ state: 'incomplete', reason: unitResult.reason }, unit);
    } else {
      results.unit = withTails(classifySuiteRun(unit, unitResult ? (unitResult.state === 'passed' ? { ok: true } : { ok: false, kind: 'invalid', detail: unitResult.reason }) : { ok: false, kind: 'missing', detail: 'no UNIT summary line' }), unit);
    }
    if (results.unit.state !== 'passed') return finish();

    stage = 'build';
    await fs.remove('dist');
    const build = await supervised(['scripts/build.mjs'], BUILD_MS);
    const files = {};
    for (const file of manifest.build.requiredFiles) files[file] = await fs.exists(file);
    results.build = withTails(classifySuiteRun(build, validateEvidence({ evidence: 'build', requiredFiles: manifest.build.requiredFiles }, { files })), build);

    const toRun = [];
    for (const suite of manifest.suites) {
      if (suite.server === false) {
        stage = suite.id;
        await fs.remove(suite.report);
        const run = await supervised(suite.command, suite.timeoutMs ?? SUITE_MS);
        const report = await fs.readJson(suite.report);
        results[suite.id] = withTails(classifySuiteRun(run, validateEvidence(suite, { report })), run);
        if (results[suite.id].state !== 'passed') return finish();
        if (suite.evidence === 'reference') results[suite.id].evidence = report;
      } else if (suite.gpu && env.ATLAS_GPU_DEFERRED) results[suite.id] = { state: 'deferred', reason: env.ATLAS_GPU_DEFERRED };
      else toRun.push(suite);
    }
    if (toRun.length) {
      stage = toRun[0].id;
      if (await probePort(GATE_PORT)) {
        for (const suite of toRun) results[suite.id] = { state: 'incomplete', reason: `port ${GATE_PORT} is in use; the gate never adopts a server` };
        return finish();
      }
      const started = await startOwnedServer({ spawnFn, root, env: childEnv });
      try {
        if (!started.ok) {
          for (const suite of toRun) results[suite.id] = { state: 'incomplete', reason: started.reason };
        } else {
          for (const suite of toRun) {
            stage = suite.id;
            if (!cleanupConfirmed) { results[suite.id] = { state: 'not-run', reason: 'an earlier suite\'s cleanup was unconfirmed; no further browser or GPU work starts' }; continue; }
            if (started.server.exited) { results[suite.id] = { state: 'incomplete', reason: 'the owned server exited' }; continue; }
            await fs.remove(suite.report);
            const run = await supervised(suite.command, suite.timeoutMs ?? SUITE_MS, { ATLAS_URL: `http://127.0.0.1:${GATE_PORT}` });
            const report = await fs.readJson(suite.report);
            results[suite.id] = withTails(started.server.exited ? { state: 'incomplete', reason: 'the owned server exited during the suite' } : classifySuiteRun(run, validateEvidence(suite, { report })), run);
          }
        }
      } finally {
        record.server = await stopOwnedServer(started.server, groupSignal);
        if (record.server === 'unconfirmed') cleanupConfirmed = false;
      }
    }
    stage = 'unit';
    if (await git.head() !== record.commit || await git.porcelain()) {
      record.notes.push('the commit or tracked tree changed during the gate');
      results.unit = { state: 'failed', reason: 'tree changed during the gate' };
    }
  } catch (error) {
    const reason = `infrastructure-error: ${error?.message ?? error}`;
    record.notes.push(reason);
    results[stage] = { ...(results[stage]?.state === 'passed' ? {} : results[stage]), state: 'incomplete', reason };
  }
  return finish();
}

function productionDeps(root) {
  const run = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: GIT_MS, killSignal: 'SIGKILL' }).trim();
  return {
    root, env: process.env, spawnFn: spawn, now: () => new Date().toISOString(),
    git: { head: async () => run(['rev-parse', 'HEAD']), porcelain: async () => run(['status', '--porcelain']) },
    fs: {
      readJson: async rel => { try { return JSON.parse(await readFile(resolve(root, rel), 'utf8')); } catch (error) { if (error.code === 'ENOENT') return undefined; return { unreadable: error.message }; } },
      exists: async rel => access(resolve(root, rel)).then(() => true, () => false),
      remove: async rel => rm(resolve(root, rel), { recursive: true, force: true }),
    },
    probePort: port => new Promise(resolveProbe => {
      const socket = connect({ port, host: '127.0.0.1' });
      socket.setTimeout(1000);
      socket.once('connect', () => { socket.destroy(); resolveProbe(true); });
      socket.once('timeout', () => { socket.destroy(); resolveProbe(true); });
      socket.once('error', () => resolveProbe(false));
    }),
  };
}

async function main() {
  const root = resolve(new URL('..', import.meta.url).pathname);
  const record = await runGate(productionDeps(root));
  await mkdir(resolve(root, 'artifacts/gates'), { recursive: true });
  const name = `artifacts/gates/${record.startedAt.replace(/[:.]/g, '-')}-${(record.commit || 'none').slice(0, 12)}.json`;
  await writeFile(resolve(root, name), JSON.stringify(record, null, 2));
  await appendFile(resolve(root, 'artifacts/gates/ledger.jsonl'), `${JSON.stringify({ commit: record.commit, startedAt: record.startedAt, overall: record.overall.state, record: name, deferral: record.deferral })}\n`);
  for (const [id, result] of Object.entries(record.results)) console.log(`${id.padEnd(18)} ${result.state.padEnd(10)} ${result.reason}`);
  for (const note of record.notes) console.log(`note: ${note}`);
  console.log(`GATE ${record.overall.state.toUpperCase()} (${record.overall.reason}) → ${name}`);
  process.exitCode = record.overall.exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) await main();
