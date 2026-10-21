// The first import of every browser suite. Under a unit or RED run it throws
// before the suite imports Playwright, starts a server or launches a browser.
export class UnitModeRefusal extends Error {
  constructor() {
    super('This browser suite refuses to run under unit tests (ATLAS_UNIT_MODE or NODE_TEST_CONTEXT is set).');
    this.name = 'UnitModeRefusal';
    this.code = 'ATLAS_UNIT_MODE_REFUSAL';
  }
}
export function inUnitMode(env = process.env) {
  return env.ATLAS_UNIT_MODE === '1' || String(env.NODE_TEST_CONTEXT || '').startsWith('child');
}
if (inUnitMode()) throw new UnitModeRefusal();
