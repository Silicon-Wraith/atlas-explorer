// spikes/project0/qualification/g5d-config.js — browser-safe G5-D constants (prereg docs/reports/project0/webgpu-g5d-prereg.md §3, §8.4), shared
// by the page (browser/drivers/checks.js through g5d-collect.js) and the read side (g5d-metrics.mjs), and pinned in the profile g5d-v1.json.
// The operational output layout, batch size and input packing are frozen here; no runtime batch-size search exists.
export const G5D_PROFILE_ID = 'project0-g5d-v1';
export const G5D_FORM = 'g5d-plain-qsq-wrapper-prereg-v1';            // q_update_g5d(q, c) = qsq(q) + c, the fields.wgsl polynomial unchanged
export const MATRIX_PATH = 'spikes/project0/qualification/g5d-matrix.json';
// One invocation per sample. Inputs: three vec4f per sample (q0, C, (R, 0, 0, 0)), R the certified binary32 radius (a runtime input).
// Output: `stride` vec4u per sample: a header (status code in ARITH_STATUS order, escape or failure index, log-radius word, completed-update
// count), then row n holds q_(n+1) as bitcast words for every completed update. Batches of `batch` samples, one outstanding at a time.
export const OPERATIONAL_LAYOUT = Object.freeze({ entryPoint: 'qjulia_operational', budget: 128, stride: 129, batch: 64, inputsPerSample: 3, workgroupSize: 64 });

// The effective input words of each case (lowercase hex), packed bit-exactly through a Uint32Array: no word passes through a JS number.
export function packOperationalInputs(cases) {
  const u = new Uint32Array(12 * cases.length);
  cases.forEach((c, i) => {
    if (!Array.isArray(c.inputWords) || c.inputWords.length !== 8 || typeof c.radiusWord !== 'string') throw new Error(`case ${c.id}: malformed input words`);
    [...c.inputWords, c.radiusWord].forEach((h, k) => {
      if (!/^[0-9a-f]{8}$/.test(h)) throw new Error(`case ${c.id}: malformed input word ${h}`);
      u[12 * i + k] = parseInt(h, 16) >>> 0;
    });
  });
  return new Float32Array(u.buffer);
}
