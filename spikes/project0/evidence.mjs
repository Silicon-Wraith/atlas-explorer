// spikes/project0/evidence.mjs — evidence identity and record persistence (Node only).
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { ROOT } from './launch.mjs';
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
  // Chrome 151 prints the active device as `GPU0 : ... DRIVER_VENDOR=NVIDIA, DRIVER_VERSION=580.x *ACTIVE*`; older builds had `Driver vendor` rows.
  const active = /DRIVER_VENDOR=([^,\n]+),\s*DRIVER_VERSION=(\S+)[^\n]*\*ACTIVE\*/.exec(chromeGpuText);
  const vendor = active?.[1]?.trim() ?? /Driver vendor\s+(.+)/.exec(chromeGpuText)?.[1]?.trim();
  const version = active?.[2]?.trim() ?? /Driver version\s+(.+)/.exec(chromeGpuText)?.[1]?.trim();
  if (!vendor || !version) throw new Error('chrome://gpu has no driver vendor/version');
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

export async function writeRecord(runDir, record, artifacts) {
  const names = new Set();
  for (const { name } of artifacts) {
    if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error(`invalid artefact name: ${name}`);
    if (name === `${record.id}.json`) throw new Error(`artefact ${name} collides with the record file`);
    if (names.has(name)) throw new Error(`duplicate artefact name: ${name}`);
    names.add(name);
  }
  record.artifacts = [];
  const root = resolve(ROOT, 'artifacts/project0');
  for (const { name, data } of artifacts) {
    await writeFile(join(runDir, name), data, { flag: 'wx' });
    record.artifacts.push({ path: relative(root, join(runDir, name)), sha256: sha256(data) });
  }
  await writeFile(join(runDir, `${record.id}.json`), canonical(record), { flag: 'wx' });
  return record;
}
