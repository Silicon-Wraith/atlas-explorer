// spikes/project0/qualification/g5d-profile.mjs — node spikes/project0/qualification/g5d-profile.mjs --check | --write
// Builds the authenticated G5-D amendment profile qualification/g5d-v1.json (prereg §8.2) from the committed preregistration and the files it
// pins. Order (no circular hash): the preregistration was committed first (9c59e51); this document binds its hash; qualification.mjs pins this
// document's hash in its registry. The profile never pins qualification.mjs. --write writes canonical() + LF; --check compares the bytes.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../launch.mjs';
import { canonical } from '../contract.js';
import { HISTORICAL_G5A } from '../remediation/validate.mjs';
import { ARITHMETIC_ENTRY_POINTS, arithmeticPipelines } from '../remediation/pipeline-config.js';
import { G5D_FORM, OPERATIONAL_LAYOUT } from './g5d-config.js';
import { TOLERANCES } from './g5d-reference.mjs';

export const PROFILE_PATH = 'spikes/project0/qualification/g5d-v1.json';
const sha = b => createHash('sha256').update(b).digest('hex');
const P = 'spikes/project0/';
export const FRAGMENT_SHA256 = '290b4cc6ef4a608da0e44f3cdafb0ed52943e3c37aee9292167fb24a5a90a78c';   // prereg §3, recomputed and unchanged
export const WRAPPER = 'fn q_update_g5d(q: vec4f, c: vec4f) -> vec4f {\n  return qsq(q) + c;\n}\n';
export const OPERATIONAL_RULES = Object.freeze({ samples: ['eq', 287], qualifying: ['eq', 223], diagnostics: ['eq', 64], components: ['eq', 19108], statusErrors: ['eq', 0], indexErrors: ['eq', 0],
  numericalFailures: ['eq', 0], componentRatio: ['range', 0, 1], logRRatio: ['range', 0, 1] });
// §11, verbatim (markdown emphasis removed)
export const DISCLOSURE = Object.freeze([
  'WebGPU passes G5 as amended by E8 and E9, under the headed-only scope of E7. This is not a pass of the original G5 contract.',
  'G5-D was authorized after the original numerical failures. The original plain implementation failed the frozen eight-iterate comparison at 2.7497713106862958; an exact contraction model reproduced all 32 GPU components. The compensated remediation failed at 4.744852004194964 and failed its compensation validation. It matched none of its five preregistered models. These results remain failures under their original contracts.',
  'G5-D changes the required comparison to operational orbits. It does not explain away the original divergence or validate accurate post-escape continuation. Any instrument relying on such continuation requires separate validation.',
  'No validated long-escape band at f32 input precision was established by this qualification. S3 was measured and reported as a non-gating diagnostic under E9. Qualifying escaping orbits cover escape indices 0–11 only; escape indices 12–128 are not validated by this qualification. This is a limitation of the demonstrated qualification domain, not a proof that every possible long-escape input is unqualifiable. Bounded orbits are tested through 128 updates.',
  'Headless WebGPU remains a known host limitation and was not converted into a pass.',
]);

export async function buildProfile({ root = ROOT } = {}) {
  const file = async path => ({ path, sha256: sha(await readFile(join(root, path))) });
  const e7 = JSON.parse(await readFile(join(root, P + 'qualification/e7-headed-v1.json'), 'utf8'));
  const { QUALIFICATIONS, knownLimitationsOf, loadQualification } = await import('../qualification.mjs');
  const fields = await file(P + 'gpu/fields.wgsl'), arithmetic = await file(P + 'gpu/arithmetic.wgsl');
  const concatenated = sha(Buffer.concat([await readFile(join(root, fields.path)), await readFile(join(root, arithmetic.path))]));
  const launch = { ...(await file(P + 'launch-remediation.json')), args: 'remediation', requestedArgs: JSON.parse(await readFile(join(root, P + 'launch-remediation.json'), 'utf8')) };
  return {
    schema: 1, id: 'project0-g5d-v1', backend: 'webgpu', executionMode: 'headed', campaign: 'webgpu-g5d',
    authority: { decision: 'E8', decisions: ['E7', 'E8', 'E9'], commits: { E7: 'e3ee2c0a584c5daa4df750332e82d64b88aa5251', E8: '509e03700ea4bd03b39d685b30dbd153735e830e', E9: 'eda65b76b06ab4422f1e82c59ed8bfe9fa6dd6af' } },
    preregistration: { ...(await file('docs/reports/project0/webgpu-g5d-prereg.md')), commit: '9c59e51c7025c945eec3ebbf6c0b1b138100a29d' },
    baseSpecHash: e7.baseSpecHash, fixtureHash: e7.fixtureHash,
    inherits: { profile: e7.id, path: QUALIFICATIONS[e7.id].path, sha256: QUALIFICATIONS[e7.id].sha256 },
    excludedRequiredSlots: ['G1/headless', 'G5/qjulia-offplane'],
    addedSlots: { 'G5/qjulia-operational': { replaces: 'G5/qjulia-offplane', authority: 'E8', rules: OPERATIONAL_RULES } },
    dispositions: {
      'G1/headless': { disposition: 'not-required', authority: 'E7', collection: 'not-scheduled-in-this-campaign', summary: 'not required under E7; prior failure retained' },
      'G5/qjulia-offplane': { disposition: 'diagnostic', authority: 'E8', collection: 'freshly-collected-in-G5/qjulia-operational', summary: 'diagnostic under E8; freshly collected; not a qualifying pass' },
      S3: { disposition: 'diagnostic', authority: 'E9', collection: 'measured-in-G5/qjulia-operational', summary: 'diagnostic under E9; sensitivity exclusions retained' },
    },
    knownLimitations: knownLimitationsOf(await loadQualification(e7.id, { root })),
    artifacts: {
      config: await file(P + 'qualification/g5d-config.js'), reference: await file(P + 'qualification/g5d-reference.mjs'), generator: await file(P + 'qualification/g5d-matrix.mjs'),
      matrix: await file(P + 'qualification/g5d-matrix.json'), models: await file(P + 'qualification/g5d-models.mjs'), predictions: await file(P + 'qualification/g5d-predictions.json'),
      metrics: await file(P + 'qualification/g5d-metrics.mjs'),
    },
    kernel: { form: G5D_FORM, fragmentSha256: FRAGMENT_SHA256, wrapper: WRAPPER, layout: { ...OPERATIONAL_LAYOUT },
      shader: { modules: [fields, arithmetic], sha256: concatenated, entryPoints: [...ARITHMETIC_ENTRY_POINTS], pipelines: arithmeticPipelines() } },
    operational: { budget: 128, samples: 287, qualifying: 223, diagnostics: 64, components: 19108, tolerances: { ...TOLERANCES }, qualifyingEscapeIndices: [0, 11] },
    launch, campaignRequest: { gates: 'all', mode: 'headed', reuse: [] },
    historical: {
      files: [
        { kind: 'manifest', campaign: 'webgpu-1', ...(await file('docs/reports/project0/webgpu-1-manifest.json')) },
        { kind: 'manifest', campaign: 'webgpu-remediation', ...(await file('docs/reports/project0/webgpu-remediation-manifest.json')) },
        { kind: 'decision', ...(await file('docs/reports/project0/webgpu-decision.json')) },
      ],
      offplaneRecords: [
        { campaign: 'webgpu-1', manifest: 'docs/reports/project0/webgpu-1-manifest.json', recordId: 'G5-qjulia-offplane-20261019T235725379Z-webgpu-1-g5-headed', sha256: '7bda8368b6449105945d1ced07a6c76cfc38b76a5ad8fde524898423ce96b87c' },
        { campaign: 'webgpu-remediation', manifest: 'docs/reports/project0/webgpu-remediation-manifest.json', profile: 'project0-e7-headed-v1', recordId: 'G5-qjulia-offplane-20261020T051013812Z-webgpu-remediation-g5-headed', sha256: '1023ae9e0fbbb8656e7f46313f0a9ffd63a22382769b3e7b31c379ad26a84d3f' },
      ],
      g5a: JSON.parse(JSON.stringify(HISTORICAL_G5A)),
    },
    scope: 'Qualification scope: headed execution only, under E7; G5 as amended by E8 and E9 (operational orbits through first escape or 128 updates; S3 measured as a non-gating diagnostic).',
    disclosure: [...DISCLOSURE],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2];
  if (!['--check', '--write'].includes(mode)) { console.error('usage: g5d-profile.mjs --check | --write'); process.exit(2); }
  const bytes = canonical(await buildProfile()) + '\n';
  if (mode === '--write') await writeFile(join(ROOT, PROFILE_PATH), bytes);
  else if ((await readFile(join(ROOT, PROFILE_PATH), 'utf8')) !== bytes) { console.error(`${PROFILE_PATH} differs from the built profile`); process.exit(1); }
  console.log(`G5-D PROFILE ${mode === '--write' ? 'WRITTEN' : 'OK'} ${sha(bytes)}`);
}
