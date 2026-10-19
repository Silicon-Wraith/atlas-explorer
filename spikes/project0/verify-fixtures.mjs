import {
  baseFixtures, preparationJobs, assembleFixtures
} from './fixture-definition.js';
import { auditFixtures } from './fixture-audit.js';
import { runJobs } from './fixture-pool.mjs';
import {
  readVerifiedFile, provenanceAt, encodeFixtures, options, auditSummary
} from './fixture-files.mjs';

const configuration = options(
  process.argv.slice(2),
  ['--candidate','--recompute','--workers']
);

const { bytes, fixtures, identity } =
  await readVerifiedFile(configuration.candidate);

const base = baseFixtures();
const audit = auditFixtures(fixtures,base);

if (configuration.recompute) {
  const results = await runJobs(preparationJobs(base),base.anchor,{
    workers: configuration.workers,
    onProgress: row => console.error(JSON.stringify(row))
  });
  const rebuilt = assembleFixtures(base,fixtures.provenance,results);
  auditFixtures(rebuilt,base);

  if (encodeFixtures(rebuilt) !== bytes.toString('utf8')) {
    throw new Error('CPU regeneration differs from fixture bytes');
  }
}

if (
  encodeFixtures(fixtures.provenance) !==
  encodeFixtures(await provenanceAt(fixtures.provenance.generatorCommit))
) {
  throw new Error('source changed during verification');
}

console.log(JSON.stringify({
  status: configuration.candidate ? 'CANDIDATE OK' : 'FIXTURES OK',
  recomputed: configuration.recompute,
  identity,
  audit: auditSummary(audit)
}));
