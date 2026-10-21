import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { canonical } from './contract.js';

export const ROOT = fileURLToPath(new URL('../../',import.meta.url));
export const SPEC =
  'docs/superpowers/specs/2026-10-18-project0-space-qualification-design.md';
export const FIXTURE = 'spikes/project0/fixtures.json';

export const SOURCE_PATHS = [
  'contract.js','metrics.js','gates.js','decision.js',
  'reference/bulb.js','reference/complex.js','reference/quaternion.js',
  'reference/f32.js','reference/camera.js','reference/geometry.js',
  'reference/trace.js','reference/sensitivity.js','reference/preparation.js',
  'fixture-definition.js','fixture-audit.js','fixture-pool.mjs',
  'fixture-files.mjs','prepare-worker.mjs',
  'prepare-fixtures.mjs','verify-fixtures.mjs',
  'tests/contract.test.mjs','tests/reference.test.mjs',
  'tests/geometry.test.mjs','tests/fixtures.test.mjs'
].map(path => 'spikes/project0/'+path).sort();

export const sha256 = bytes =>
  createHash('sha256').update(bytes).digest('hex');

export function git(...args) {
  return execFileSync('git',['-C',ROOT,...args],{
    maxBuffer: 256*1024*1024
  });
}

export function encodeFixtures(value) {
  return canonical(value)+'\n';
}

export function decodeFixtures(bytes) {
  const text = bytes.toString('utf8');
  const value = JSON.parse(text);
  if (encodeFixtures(value) !== text) {
    throw new Error('noncanonical fixture file');
  }
  return value;
}

export async function provenanceAt(
  commit=git('rev-parse','HEAD').toString().trim()
) {
  if (!/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error('invalid generator commit');
  }
  git('merge-base','--is-ancestor',commit,'HEAD');

  const sources = [];
  for (const path of SOURCE_PATHS) {
    const bytes = await readFile(ROOT+path);
    if (!bytes.equals(git('show',commit+':'+path))) {
      throw new Error('uncommitted or changed frozen source: '+path);
    }
    sources.push({ path, sha256: sha256(bytes) });
  }

  const spec = await readFile(ROOT+SPEC);
  if (!spec.equals(git('show',commit+':'+SPEC))) {
    throw new Error('changed governing spec');
  }
  return {
    specPath: SPEC,
    specHash: sha256(spec),
    generatorCommit: commit,
    nodeVersion: process.version,
    sources
  };
}

export async function readVerifiedFile(candidate=false) {
  const bytes = await readFile(ROOT+FIXTURE);
  const fixtures = decodeFixtures(bytes);
  const expected = await provenanceAt(fixtures.provenance.generatorCommit);

  if (canonical(expected) !== canonical(fixtures.provenance)) {
    throw new Error('fixture provenance mismatch (including Node version)');
  }

  let fixtureCommit = null;
  if (!candidate) {
    fixtureCommit = git(
      'log','-1','--format=%H','HEAD','--',FIXTURE
    ).toString().trim();

    if (
      !/^[a-f0-9]{40}$/.test(fixtureCommit) ||
      !bytes.equals(git('show',fixtureCommit+':'+FIXTURE))
    ) {
      throw new Error('fixture is not frozen in HEAD history');
    }
    git(
      'merge-base','--is-ancestor',
      fixtures.provenance.generatorCommit,fixtureCommit
    );
  }

  return {
    bytes,
    fixtures,
    identity: {
      fixtureHash: sha256(bytes),
      fixtureCommit,
      specHash: fixtures.provenance.specHash
    }
  };
}

export function options(args,allowed) {
  const result = { workers: 8, candidate: false, recompute: false };
  const seen = new Set();

  for (const argument of args) {
    const [key,...rest] = argument.split('=');
    if (!allowed.includes(key) || seen.has(key)) {
      throw new Error('invalid option: '+argument);
    }
    seen.add(key);

    if (key === '--workers') {
      if (
        rest.length !== 1 ||
        !/^(?:[1-9]|1[0-6])$/.test(rest[0])
      ) {
        throw new Error('workers must be an integer in [1,16]');
      }
      result.workers = Number(rest[0]);
    } else {
      if (rest.length) throw new Error('flag takes no value: '+key);
      result[key.slice(2)] = true;
    }
  }
  return result;
}

export function auditSummary(audit) {
  const { ranges, ...rest } = audit;
  return {
    ...rest,
    maximumDr: Math.max(...ranges.map(r => r.maxDr)),
    rangeCrossings: ranges.filter(
      r => r.doubleRangeCrossings || r.roundedOperandCrossings
    )
  };
}
