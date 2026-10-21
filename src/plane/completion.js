// GPU completion of a publication (plan amendment G(3), landed in T08 fix round 1). The render
// adapter inserts a fence right after a publication's final colour pass; awaiting it confirms that
// the queued GL commands completed ('queue-completion'), not compositor presentation. Browser-safe
// and DOM-free: unit-tested with a fake GL, used by src/plane/render-adapter.js in the page. The
// test suites' teardown drain (tests/support/bounded.mjs) follows the same protocol and validates
// its own fence by a one-pixel readback; product code never reads pixels per render.
export class CompletionError extends Error {
  // code: 'unavailable' (no WebGL fences), 'fence-failed', 'timeout', 'interrupted' (context lost or
  // device replaced), 'superseded' (a newer publication replaced this one).
  constructor(message, code) { super(message); this.name = 'CompletionError'; this.code = code; }
}

// → the fence for the commands queued so far: a sync object, null when the context refused one, or
// undefined when this renderer has no WebGL fences (the CPU fallback). Flushed, so it can signal.
export function createFence(gl) {
  if (!gl || typeof gl.fenceSync !== 'function') return undefined;
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  return sync;
}

// Zero-timeout polls, each after a task yield (WebGL forbids a fence from signaling until control
// returns to the event loop — even before the first poll). `stillValid()` throws when the awaited
// publication no longer stands. → { polls, waitMs }; rejects with a CompletionError.
export async function awaitFence({ gl, sync, ms, stillValid = () => {}, now = () => performance.now(), yieldTask = () => new Promise(resolve => setTimeout(resolve, 0)) }) {
  if (!(Number.isFinite(ms) && ms > 0)) throw new RangeError('awaitFence needs a positive finite bound');
  if (sync === undefined) throw new CompletionError('this renderer has no GPU fences', 'unavailable');
  if (sync === null) throw new CompletionError('fenceSync returned null', 'fence-failed');
  const started = now();
  let polls = 0;
  while (true) {
    await yieldTask();
    stillValid();
    if (gl.isContextLost()) throw new CompletionError('the graphics context was lost', 'interrupted');
    if (now() - started >= ms) throw new CompletionError(`GPU completion did not arrive within ${ms} ms`, 'timeout');
    const status = gl.clientWaitSync(sync, 0, 0);
    polls++;
    if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) return { polls, waitMs: now() - started };
    if (status === gl.WAIT_FAILED) throw new CompletionError('clientWaitSync returned WAIT_FAILED', 'fence-failed');
    if (status !== gl.TIMEOUT_EXPIRED) throw new CompletionError(`unexpected fence status ${status}`, 'fence-failed');
  }
}
