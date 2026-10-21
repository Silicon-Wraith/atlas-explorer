// spikes/project0/gpu/abort.js — one abort signal per experiment. Every wait on queue completion, mapping, publication or
// driver progress races it, so a stall or an unexpected loss ends the experiment without waiting for GPU promises to settle.
// The invalidation text T5's shared stop classifier recognises, for a structured abort reason. `driver-error` (T7 r4: a renderer completion
// handler threw) keeps the original message, e.g. `driver error: allocation cap exceeded: ...`, which STOPS classifies by that text.
// The first abort latched is kept: a later abort() call never replaces its reason.
export function invalidationFor(reason) {
  return reason.kind === 'stall' ? `no observable progress for 5 s: ${JSON.stringify(reason.outstanding ?? [])}` : reason.kind === 'device-lost' ? `device lost: ${reason.message ?? 'unknown'}` : reason.kind === 'harness' ? `harness readback timeout: ${reason.message ?? ''}` : reason.kind === 'harness-timeout' ? `harness timeout: ${reason.message ?? ''}` : reason.kind === 'driver-error' ? `driver error: ${reason.message ?? 'unknown'}` : `aborted: ${reason.kind}`;
}

export function createAbort() {
  let fail; const promise = new Promise((_, reject) => { fail = reject; }); promise.catch(() => {});
  const a = {
    aborted: false, reason: null,
    abort(reason) {
      if (a.aborted) return;
      a.aborted = true; a.reason = reason;
      fail(Object.assign(new Error(`aborted: ${reason.kind}${reason.message ? ` (${reason.message})` : ''}`), { abort: reason }));
    },
    race(p) { return Promise.race([p, promise]); },
    throwIfAborted() { if (a.aborted) throw Object.assign(new Error(`aborted: ${a.reason.kind}`), { abort: a.reason }); },
    // The invalidation text T10's ABORTS recognises.
    invalidation() { return a.aborted ? invalidationFor(a.reason) : null; },
  };
  return a;
}
// An abortable experiment context: an allocator, a watchdog wired to the abort, and the abort itself.
export function experiment({ capBytes, createAllocator, createWatchdog, stallMs = 5000 }) {
  const abort = createAbort();
  const watchdog = createWatchdog({ stallMs, onStall: stall => abort.abort({ kind: 'stall', outstanding: stall.outstanding }) });
  return { abort, watchdog, alloc: createAllocator({ capBytes }) };
}
