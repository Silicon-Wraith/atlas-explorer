// spikes/project0/qualification/g5d-collect.js — browser-safe: the G5-D page collection (prereg §7.1, §8.4), with injected readers so that the
// collection order and preservation are testable without a GPU. Nothing already read back is lost: the plane slot is kept as soon as its words
// arrive; the operational slot is appended before its first readback and then grows in place (shader identity, matrix identity, the forced-
// continuation diagnostic, then each bounded batch in order); a failure is recorded on the raw (`failure`) and rethrown, so the driver's catch
// still records the precise invalidation. Read-time validation (g5d-metrics.mjs) treats any missing part as an evidence defect.
import { G5D_FORM, G5D_PROFILE_ID, OPERATIONAL_LAYOUT, packOperationalInputs } from './g5d-config.js';
import { CORRECTNESS_ONLY } from '../timing-contract.js';

// deps: plane() -> Uint32Array (4,096 rows); shader() -> {sha256, entryPoints, pipelines}; matrix() -> {sha256 (of the fetched bytes), cases};
// continuation() -> Uint32Array(32); batch(inputs Float32Array, count, start) -> Uint32Array (count * stride vec4u)
export async function collectG5d(deps, slots) {
  const plane = await deps.plane();
  slots.push({ slot: 'qjulia-plane', raw: { words: Array.from(plane), form: G5D_FORM }, timingMethod: CORRECTNESS_ONLY });
  const raw = { form: G5D_FORM, profile: G5D_PROFILE_ID, layout: { ...OPERATIONAL_LAYOUT }, shader: null, matrix: null, continuation: null, batches: [] };
  slots.push({ slot: 'qjulia-operational', raw, timingMethod: CORRECTNESS_ONLY });
  try {
    raw.shader = await deps.shader();
    const { sha256, cases } = await deps.matrix();
    raw.matrix = { sha256, cases: cases.length };
    raw.continuation = { words: Array.from(await deps.continuation()) };
    for (let start = 0; start < cases.length; start += OPERATIONAL_LAYOUT.batch) {
      const count = Math.min(OPERATIONAL_LAYOUT.batch, cases.length - start);
      const words = await deps.batch(packOperationalInputs(cases.slice(start, start + count)), count, start);
      raw.batches.push({ start, count, words: Array.from(words) });
    }
  } catch (error) { raw.failure = error?.message ?? String(error); throw error; }
  return raw;
}
