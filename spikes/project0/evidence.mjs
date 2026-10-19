// spikes/project0/evidence.mjs — evidence identity and record persistence (Node only).
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { ROOT, activeGpuDriver } from './launch.mjs';
import { canonical } from './contract.js';
import { readVerifiedFile } from './fixture-files.mjs';

const run = promisify(execFile);
const git = async args => (await run('git', args, { cwd: ROOT })).stdout;
export const sha256 = data => createHash('sha256').update(data).digest('hex');

export async function fixtureIdentity({ readVerified = readVerifiedFile } = {}) {
  const { identity } = await readVerified(false);
  return identity;
}

async function harnessFiles(dir = resolve(ROOT, 'spikes/project0')) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'tests') out.push(...await harnessFiles(path)); }
    else if (entry.name !== 'fixtures.json') out.push(path);
  }
  return out.sort();
}

export async function implementationIdentity({ gitFn = git } = {}) {
  if ((await gitFn(['status', '--porcelain', '--untracked-files=all', '--', 'spikes/project0'])).trim()) throw new Error('harness has uncommitted changes; commit before running GPU checks');
  const hash = createHash('sha256');
  for (const file of await harnessFiles()) hash.update(relative(ROOT, file)).update('\0').update(await readFile(file)).update('\0');
  return { implementationCommit: (await gitFn(['rev-parse', 'HEAD'])).trim(), implementationHash: hash.digest('hex') };
}

// Execution evidence keeps the exact command line (the .launch.json artefact). The *configuration* identity replaces only the
// verified per-launch profile path with a fixed marker, so fresh profiles stay coherent while every other flag stays significant.
export function launchConfiguration({ requestedArgs, mode, commandLine, profile }) {
  if (!profile || !commandLine) throw new Error('launch identity needs the effective command line and the verified profile path');
  const token = `--user-data-dir=${profile}`;
  const occurrences = commandLine.split(token).length - 1;
  if (occurrences !== 1) throw new Error(`the effective command line must contain ${token} exactly once (found ${occurrences})`);
  return { requestedArgs: [...requestedArgs], mode, commandLine: commandLine.replace(token, '--user-data-dir=<PROFILE>') };
}
export const launchIdentity = info => ({ launchHash: sha256(canonical(launchConfiguration(info))), mode: info.mode });

export function environmentIdentity(chromeGpuText, { browserVersion, browserExecutable, session }) {
  const { vendor, version } = activeGpuDriver(chromeGpuText);   // exactly one active GPU record with complete fields, or it throws
  return { browserVersion, browserExecutable, driver: `${vendor} ${version}`, session };
}

export async function newRunDir(label) {
  if (!/^[a-z0-9.-]+$/.test(label)) throw new Error(`invalid run label: ${label}`);
  const parent = resolve(ROOT, 'artifacts/project0');
  await mkdir(parent, { recursive: true });
  const dir = resolve(parent, `${new Date().toISOString().replace(/[-:.]/g, '')}-${label}`);
  await mkdir(dir);                                         // throws EEXIST rather than reusing a directory
  return dir;
}

// The timing-method contract (globals: every record names its timing method). The producer of a record supplies `record.timingMethod`;
// writeRecord validates it and never infers one. Three shapes:
// - measured: { kind, clock, unit, field, start, end, readbackIncluded, timestampQueriesUsed }, all required, nothing else. `kind` names the
//   method ('queue-completion', 'timestamp-query', or a later task's own measured kind); `field` names the raw value it describes; `start`/`end`
//   state the measured interval in words. timestampQueriesUsed must be true exactly when kind is 'timestamp-query'.
// - CORRECTNESS_ONLY = { kind: 'correctness-only' }: the record carries no timing measurement (G3-G5 arithmetic checks, policy, probe).
// - notMeasured(reason) = { kind: 'not-measured', reason }: no measurement is available; the only shape an incomplete record may carry.
export const CORRECTNESS_ONLY = Object.freeze({ kind: 'correctness-only' });
export const notMeasured = reason => ({ kind: 'not-measured', reason });
const MEASURED_FIELDS = ['kind', 'clock', 'unit', 'field', 'start', 'end', 'readbackIncluded', 'timestampQueriesUsed'];
export function validateTimingMethod(tm, { slot } = {}) {
  const fail = why => { throw new Error(`timing method: ${why}`); };
  if (tm === undefined || tm === null || typeof tm !== 'object' || Array.isArray(tm)) fail('missing (the producer must supply one)');
  if (typeof tm.kind !== 'string' || !tm.kind) fail('no kind');
  const only = allowed => { for (const k of Object.keys(tm)) if (!allowed.includes(k)) fail(`unexpected field ${k} for kind ${tm.kind}`); };
  if (tm.kind === 'not-measured') { only(['kind', 'reason']); if (typeof tm.reason !== 'string' || !tm.reason) fail('not-measured needs a reason'); return tm; }
  if (slot === 'incomplete') fail(`an incomplete record must be not-measured, not ${tm.kind}`);
  if (tm.kind === 'correctness-only') { only(['kind']); return tm; }
  only(MEASURED_FIELDS);
  for (const k of ['clock', 'unit', 'field', 'start', 'end']) if (typeof tm[k] !== 'string' || !tm[k]) fail(`measured kind ${tm.kind} needs ${k}`);
  for (const k of ['readbackIncluded', 'timestampQueriesUsed']) if (typeof tm[k] !== 'boolean') fail(`measured kind ${tm.kind} needs boolean ${k}`);
  if (tm.timestampQueriesUsed !== (tm.kind === 'timestamp-query')) fail(`inconsistent: kind ${tm.kind} with timestampQueriesUsed ${tm.timestampQueriesUsed}`);
  return tm;
}

export async function writeRecord(runDir, record, artifacts) {
  const names = new Set();
  for (const { name } of artifacts) {
    if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error(`invalid artefact name: ${name}`);
    if (name === `${record.id}.json`) throw new Error(`artefact ${name} collides with the record file`);
    if (names.has(name)) throw new Error(`duplicate artefact name: ${name}`);
    names.add(name);
  }
  validateTimingMethod(record.timingMethod, record);                          // before anything is written
  record.artifacts = [];
  const root = resolve(ROOT, 'artifacts/project0');
  for (const { name, data } of artifacts) {
    await writeFile(join(runDir, name), data, { flag: 'wx' });
    record.artifacts.push({ path: relative(root, join(runDir, name)), sha256: sha256(data) });
  }
  await writeFile(join(runDir, `${record.id}.json`), canonical(record), { flag: 'wx' });
  return record;
}
