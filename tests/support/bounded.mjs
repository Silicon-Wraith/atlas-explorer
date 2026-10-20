// Bounded waits for browser suites. A timeout is a classified failure; callers
// follow it with bounded cleanup (closeWithin), and the suite deadline ends the
// process if cleanup itself cannot finish.
export const LIMITS = Object.freeze({
  launch: 15_000,      // browser launch and server readiness
  operation: 30_000,   // ordinary browser operation
  deep: 120_000,       // explicit deep render or numerical probe
  suite: 600_000,      // whole suite
  cleanup: 5_000,      // graceful cleanup before termination
});

export class BoundedWaitTimeout extends Error {
  constructor(label, ms) {
    super(`${label} did not finish within ${ms} ms.`);
    this.name = 'BoundedWaitTimeout';
    this.code = 'ATLAS_WAIT_TIMEOUT';
    this.label = label;
    this.ms = ms;
  }
}

export function within(promise, ms, label) {
  if (!(Number.isFinite(ms) && ms > 0)) throw new RangeError(`within(${label}) needs a positive finite bound`);
  let timer;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new BoundedWaitTimeout(label, ms)), ms); });
  return Promise.race([Promise.resolve(promise), deadline]).finally(() => clearTimeout(timer));
}

// Every Playwright action, locator, wait and navigation on this context or page gets a
// default bound; page.evaluate has none, so suites call it through ev().
export function boundContext(target) {
  target.setDefaultTimeout(LIMITS.operation);
  target.setDefaultNavigationTimeout(LIMITS.launch);
  return target;
}

// page.evaluate under a bound.
export function ev(target, fn, arg, label = 'page.evaluate', ms = LIMITS.operation) {
  return within(target.evaluate(fn, arg), ms, label);
}

// Waits for the application's own idle signal, bounded from outside the page.
export function idleWithin(page, ms = LIMITS.operation) {
  return within(page.evaluate(timeoutMs => window.atlas.whenIdle({ timeoutMs }), ms), ms + LIMITS.cleanup, 'atlas.whenIdle');
}

// Bounded close. A close that cannot be confirmed is sticky and terminal: the suite prints
// CLEANUP-UNCONFIRMED (which the gate reads whatever the exit code), records it, and exits 125 at
// once, so no further browser or GPU work starts and no later deadline or error can downgrade it.
export const CLEANUP_UNCONFIRMED_EXIT = 125;
export const cleanupState = { unconfirmed: false };
export async function closeWithin(resource, label, { ms = LIMITS.cleanup, exit = code => process.exit(code) } = {}) {
  if (!resource) return 'absent';
  try { await within(resource.close(), ms, `${label}.close`); return 'closed'; }
  catch (error) {
    cleanupState.unconfirmed = true;
    console.error(`CLEANUP-UNCONFIRMED ${label}: ${error.message}`);
    exit(CLEANUP_UNCONFIRMED_EXIT);
    return 'abandoned';
  }
}

// Ends the process with exit code 124 if the whole suite overruns its bound.
export function installSuiteDeadline(name, ms = LIMITS.suite, { exit = code => process.exit(code) } = {}) {
  const timer = setTimeout(() => {
    console.error(`SUITE-DEADLINE ${name}: exceeded ${ms} ms`);
    exit(cleanupState.unconfirmed ? CLEANUP_UNCONFIRMED_EXIT : 124);
  }, ms);
  timer.unref();
  return timer;
}

// Installed Chrome puts its ProcessSingleton socket under $TMPDIR. A Unix socket path holds at
// most 107 bytes, which artifacts/runtime inside a worktree exceeds (the first GPU gate failed on
// it), so installed-Chrome launches alone get this short directory on the ZFS pool. The Node
// processes keep TMPDIR=artifacts/runtime (controller ruling, 2026-10-20).
export const CHROME_TMPDIR = '/mnt/ml_storage/scratch/atlas-1a-tmp';
export const UNIX_SOCKET_PATH_MAX = 107;
const CHROME_SOCKET_SUFFIXES = ['/com.google.Chrome.XXXXXX/SingletonSocket', '/.org.chromium.Chromium.XXXXXX/SingletonSocket'];
export function chromeSocketPathFits(dir) {
  return CHROME_SOCKET_SUFFIXES.every(suffix => Buffer.byteLength(`${dir}${suffix}`) <= UNIX_SOCKET_PATH_MAX);
}
export function chromeLaunchEnv(env = process.env) {
  return { ...env, TMPDIR: CHROME_TMPDIR };
}
