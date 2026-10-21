// CPU reference-suite evidence contract; no file access or process launches.
export const REFERENCE_SUITE_MS = 600_000;
export const REFERENCE_WORK_MS = 570_000;
// Approved B04 freeze, re-frozen for the user-approved rev 4.8 analytic-depth amendment (B10 fix round 2).
// A re-freeze requires a reviewed edit of these pins.
export const APPROVED_REFERENCE_IDENTITIES = Object.freeze({
  matrixSha256: 'b7c8f53d8c5116e3c30d5625c2a73e9e5df1366802ec7ad48b782e27fa1f4c3c',
  indexSha256: '3e68955ff7bae321cb19cbcda646860f305a514fb85021880b9db4bdc8710828',
  generatorSha256: '138cbdc75637ea7c96b5d5ca7664d6cad1c7a3128d65a2a896c9d61f4e0f85bd',
  predictionSha256: '4868da7df834734f95d40f59f785c33a90d6ab8a4f0261bee25a56d01b0632b9',
  workloadSha256: '47758f70dd0f7c33151976c422bc3a3b1eb0291e7af201920a82c4f7884b238d',
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
