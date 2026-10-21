// spikes/project0/remediation/inputs.js — browser-safe: packs the committed G5-A supplementary inputs (remediation/supplementary.json)
// into runtime storage-buffer words for the validation entry points (prereg rev 2 §2.6: runtime inputs, never shader constants).
// The words are written bit-exactly through a Uint32Array, so signed zeros and every input bit survive the upload.
const word = h => parseInt(h, 16) >>> 0;
const asF32 = u => new Float32Array(u.buffer);
export function supplementaryInputs(supp) {
  const primitives = new Uint32Array(4 * supp.primitives.inputs.length);
  supp.primitives.inputs.forEach(([a, b], i) => { primitives[4 * i] = word(a); primitives[4 * i + 1] = word(b); });
  const dots = Uint32Array.from(supp.dots.inputs.flat().map(word));
  const updates = Uint32Array.from(supp.updates.inputs.flat().map(word));   // per case q (4 words) then C (4 words): inputs[2i], inputs[2i + 1]
  return {
    primitives: { data: asF32(primitives), n: supp.primitives.inputs.length },
    dots: { data: asF32(dots), n: supp.dots.inputs.length },
    updates: { data: asF32(updates), n: supp.updates.inputs.length },
  };
}
