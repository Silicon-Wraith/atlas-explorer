// spikes/project0/browser/drivers/index.js — the driver registry. Later tasks add the modules it names.
const DRIVERS = { 'derivative-policy': './checks.js', G3: './checks.js', G4: './checks.js', G5: './checks.js',
  smoke: './smoke.js',                                                                               // T7
  G11: './resources.js', G13: './lifecycle.js',                                                      // T8
  G1: './g1.js', G2: './g2.js', timing: './timing.js', G8: './g8.js', G10: './g10.js', G12: './g12.js', visible: './visible.js',  // T9
  precision: './precision.js' };                                                                     // T12
export async function runGateDriver(gate, fixtures, params, status) {
  const path = DRIVERS[gate];
  if (!path) throw new Error(`no driver for ${gate}`);
  return (await import(path)).run(gate, fixtures, params, status);
}
