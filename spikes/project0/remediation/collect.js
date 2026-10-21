// spikes/project0/remediation/collect.js — browser-safe: the G5 off-plane slot and its supplementary readbacks, collected so that nothing
// already read back is lost (fix round 1, finding 2; prereg rev 2 §2.7, §5.4). The slot is appended as soon as the qualification orbit is
// read; the shader identity and each supplementary readback are attached as they complete; a failure is recorded on the raw
// (`supplementaryFailure`) and rethrown, so the driver's catch still records the precise invalidation. Read-time validation treats any missing
// part as unvalidated (remediation/validate.mjs).
import { supplementaryInputs } from './inputs.js';
import { CORRECTNESS_ONLY } from '../timing-contract.js';

export const SUPPLEMENTARY_ENTRIES = Object.freeze([['primitives', 'remediation_primitives'], ['dots', 'remediation_dot'], ['updates', 'remediation_updates']]);
// deps: orbit() -> Float32Array(32); shader() -> {sha256, entryPoints, pipelines}; supplementaryJson() -> the committed supplementary data;
// entry(name, {data, n}) -> readback words
export async function collectOffplane({ orbit, shader, supplementaryJson, entry }, slots, form) {
  const words = await orbit();
  const raw = { orbit: Array.from(words), orbitWords: Array.from(new Uint32Array(words.buffer, words.byteOffset, words.length)), form, supplementary: {} };
  slots.push({ slot: 'qjulia-offplane', raw, timingMethod: CORRECTNESS_ONLY });
  try {
    raw.supplementary.shader = await shader();
    const packed = supplementaryInputs(await supplementaryJson());
    for (const [key, name] of SUPPLEMENTARY_ENTRIES) raw.supplementary[key] = await entry(name, packed[key]);
  } catch (error) { raw.supplementaryFailure = error?.message ?? String(error); throw error; }
  return raw;
}
