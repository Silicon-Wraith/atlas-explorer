// Preloaded into every unit-test process by scripts/run-unit.mjs (`node --import`).
// Inside a node:test child process (NODE_TEST_CONTEXT=child…) every child_process
// launcher throws before any side effect, so a RED or unit run can never start a
// server, a browser or a GPU process. The supervising runner process is untouched:
// node:test itself needs `spawn` to start each test file.
// This is an enforced repository rule, not a security sandbox.
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

export const DENIED_METHODS = Object.freeze(['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']);

export class LaunchDeniedError extends Error {
  constructor(method) {
    super(`Unit tests may not launch processes (child_process.${method}).`);
    this.name = 'LaunchDeniedError';
    this.code = 'ATLAS_LAUNCH_DENIED';
    this.method = method;
  }
}

export const unitGuardActive = String(process.env.NODE_TEST_CONTEXT || '').startsWith('child');

if (unitGuardActive) {
  for (const method of DENIED_METHODS) {
    childProcess[method] = () => { throw new LaunchDeniedError(method); };
  }
  // Rebind the named ESM exports (`import { spawn } from 'node:child_process'`).
  syncBuiltinESMExports();
  process.env.ATLAS_UNIT_MODE = '1';
}
