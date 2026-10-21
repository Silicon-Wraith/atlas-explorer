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

// Self-contained so Playwright can serialize it into the page; gl/clock/yield injection also lets
// unit tests exercise the real protocol without launching a browser. This confirms preceding GL
// commands, not compositor presentation or every intermediate frame. No finish()/loseContext().
export async function drainWebGL({ gl = globalThis.atlas?.renderer?.gl, ms,
  now = () => performance.now(), yieldTask = () => new Promise(resolve => setTimeout(resolve, 0)) }) {
  if (!(Number.isFinite(ms) && ms > 0)) throw new RangeError('drainWebGL needs a positive finite bound');
  if (!gl) return { status: 'no-webgl' };
  const started = now();
  const fail = message => { throw Object.assign(new Error(`drain GPU work: ${message}`), { code: 'ATLAS_GPU_DRAIN_FAILED' }); };
  const healthy = stage => {
    if (gl.isContextLost()) fail(`context lost (${stage})`);
    const error = gl.getError();
    if (error !== gl.NO_ERROR) fail(`GL error 0x${error.toString(16)} (${stage})`);
  };
  const inTime = () => {
    if (now() - started >= ms) throw Object.assign(new Error(`drain GPU work did not finish within ${ms} ms.`), {
      name: 'BoundedWaitTimeout', code: 'ATLAS_WAIT_TIMEOUT', label: 'drain GPU work', ms,
    });
  };
  healthy('before fence');
  let sync, polls = 0, fenceMs, readbackMs, pixel;
  try {
    sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    healthy('fence');
    if (!sync) fail('fenceSync returned null');
    gl.flush();
    healthy('flush');
    while (true) {
      inTime();
      // A microtask is insufficient: WebGL forbids a new fence from signaling until control
      // returns to the user agent's event loop. Yield even before the very first poll.
      await yieldTask();
      healthy('before poll'); inTime();
      const status = gl.clientWaitSync(sync, 0, 0);
      polls++;
      healthy('poll'); inTime();
      if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) break;
      if (status === gl.WAIT_FAILED) fail('clientWaitSync returned WAIT_FAILED');
      if (status !== gl.TIMEOUT_EXPIRED) fail(`unexpected fence status ${status}`);
    }
    fenceMs = now() - started;

    // Validate the fence against a synchronous one-pixel read of ATLAS's preserved default
    // framebuffer. Snapshot only after polling: no modified bindings are held across a yield.
    // READ_FRAMEBUFFER leaves the draw binding alone; READ_BUFFER belongs to its framebuffer.
    const framebuffer = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
    const packBuffer = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
    const pack = [gl.PACK_ALIGNMENT, gl.PACK_ROW_LENGTH, gl.PACK_SKIP_ROWS, gl.PACK_SKIP_PIXELS]
      .map(key => [key, gl.getParameter(key)]);
    healthy('save readback state');
    let defaultReadBuffer;
    try {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      defaultReadBuffer = gl.getParameter(gl.READ_BUFFER);
      gl.readBuffer(gl.BACK);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      for (const [key] of pack) gl.pixelStorei(key, key === gl.PACK_ALIGNMENT ? 1 : 0);
      healthy('prepare readback'); inTime();
      pixel = new Uint8Array(4);
      const readStarted = now();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      readbackMs = now() - readStarted;
      healthy('readback'); inTime();
    } finally {
      if (defaultReadBuffer !== undefined) gl.readBuffer(defaultReadBuffer);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, packBuffer);
      for (const [key, value] of pack) gl.pixelStorei(key, value);
      healthy('restore readback state');
    }
  } finally {
    if (sync) gl.deleteSync(sync);
    healthy('delete fence');
  }
  inTime();
  return { status: 'complete', polls, fenceMs, readbackMs, elapsedMs: now() - started, pixel: [...pixel] };
}

// One host deadline covers application submission AND the drain, including a blocked readPixels
// or page event loop. The in-page deadline alone cannot interrupt a synchronous browser call.
export async function drainGpuWithin(page, ms = LIMITS.deep) {
  if (!(Number.isFinite(ms) && ms > 0)) throw new RangeError('drainGpuWithin needs a positive finite bound');
  const deadline = performance.now() + ms;
  return within((async () => {
    await ev(page, timeoutMs => globalThis.atlas?.whenIdle({ timeoutMs }), ms, 'idle before GPU drain', ms);
    const remaining = deadline - performance.now();
    if (remaining <= 0) throw new BoundedWaitTimeout('drain GPU work', ms);
    return ev(page, drainWebGL, { ms: remaining }, 'drain GPU work', remaining);
  })(), ms, 'drain GPU work');
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
