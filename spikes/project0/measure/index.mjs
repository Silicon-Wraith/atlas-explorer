// spikes/project0/measure/index.mjs — the metric registry. Later tasks add the modules it names.
const GROUPS = { G3: './arith.mjs', G4: './arith.mjs', G5: './arith.mjs',
  G11: './resources.mjs', G13: './lifecycle.mjs',                                                  // T8
  G1: './timing.mjs', G2: './timing.mjs', G6: './timing.mjs', G7: './timing.mjs', G8: './timing.mjs', G9: './timing.mjs', G10: './timing.mjs', G12: './timing.mjs' };  // T9
export async function metricsFor(gate, slot, raw, fixtures) {
  const path = GROUPS[gate];
  if (!path) throw new Error(`no metric derivation for ${gate}`);
  return (await import(path)).metrics(gate, slot, raw, fixtures);
}
