// CPU reference-suite evidence contract; no file access or process launches.
export const REFERENCE_SUITE_MS = 600_000;
export const REFERENCE_WORK_MS = 570_000;
// Approved B04 freeze. A re-freeze requires a reviewed edit of these pins.
export const APPROVED_REFERENCE_IDENTITIES = Object.freeze({
  matrixSha256: 'd17a04fc8b6c83a56c99a418947c4081bdc197fc2c75d49868e3534af58919b4',
  indexSha256: 'faa95f4fbfb667ce05932c09601f278cacc7969494b92f306ae3e20beefd74a0',
  generatorSha256: '05d171561dc77762e24a448b931c668ca321027132f56e6a3810dbe03817e05d',
  predictionSha256: '0f2639a3a4ecac28ab780e4f91600cf48b35113507fad5c0947070514eaaa9e7',
  workloadSha256: 'c10b4da400ebf6427bb0cd891d3340690b6571e2934aec956b5cc96f71cedb1f',
});
export const REFERENCE_CHECKS = Object.freeze({
  'P1 complete matrix regeneration': { strata: 1123, mandatory: 979, anchors: 18, shards: 18 },
  'P2 quaternion usability regeneration': { rays: 14400 },
  'P3 complete workload and prediction regeneration': { scenes: 3, orbitPoses: 5625, interactionPoses: 1200, checkpoints: 15, rays: 5529600 },
});
export function validateReferenceReport(suite, report) {
  const invalid = detail => ({ ok: false, kind: 'invalid', detail });
  const names = Object.keys(REFERENCE_CHECKS);
  if (!Array.isArray(suite.requiredPasses) || suite.requiredPasses.length !== names.length ||
      !names.every(name => suite.requiredPasses.includes(name))) return invalid('reference suite must require every regeneration check');
  if (!Array.isArray(report) || report.length !== names.length) return invalid('reference report has missing or extra checks');
  const hashes = ['matrixSha256', 'indexSha256', 'generatorSha256', 'predictionSha256', 'workloadSha256'];
  let identity, duration = 0;
  for (const name of names) {
    const entries = report.filter(entry => entry?.name === name);
    if (entries.length !== 1 || entries[0].state !== 'passed') return invalid(`reference check did not pass exactly once: ${name}`);
    const entry = entries[0], expected = REFERENCE_CHECKS[name];
    if (!entry.checked || Object.keys(entry.checked).length !== Object.keys(expected).length ||
        !Object.entries(expected).every(([key, count]) => entry.checked[key] === count)) return invalid(`incomplete reference coverage: ${name}`);
    if (!hashes.every(key => /^[a-f0-9]{64}$/.test(entry.identities?.[key]))) return invalid(`missing reference identity: ${name}`);
    for (const key of hashes) {
      if (entry.identities[key] !== APPROVED_REFERENCE_IDENTITIES[key]) return invalid(`unapproved reference identity: ${key}`);
    }
    const current = JSON.stringify(hashes.map(key => entry.identities[key]));
    if (identity && current !== identity) return invalid('reference checks name different artifacts');
    identity = current;
    if (!Number.isFinite(entry.durationMs) || entry.durationMs < 0) return invalid('invalid reference duration');
    duration += entry.durationMs;
  }
  return duration <= REFERENCE_WORK_MS ? { ok: true } : invalid('reference suite exceeded its work deadline');
}
