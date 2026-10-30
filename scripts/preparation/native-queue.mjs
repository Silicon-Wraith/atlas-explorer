// One nonpreemptive native job, bounded queued clients, prompt queued cancellation.
export class NativeQueueError extends Error {
  constructor(code, message) { super(message); this.name = 'NativeQueueError'; this.code = code; }
}
const aborted = () => Object.assign(new Error('native request cancelled'), { name: 'AbortError' });

export function createNativeQueue({ dispatch, maxQueued = 2, onEvent = () => {}, onOrphan = () => {} }) {
  if (typeof dispatch !== 'function' || !Number.isSafeInteger(maxQueued) || maxQueued < 0) throw new TypeError('dispatch and bounded queue required');
  const queue = []; let active = null, closed = false, sequence = 0;
  function settle(job, error, value) {
    if (job.settled) return;
    job.settled = true; job.signal?.removeEventListener('abort', job.abort);
    error ? job.reject(error) : job.resolve(value);
  }
  function pump() {
    if (closed || active || !queue.length) return;
    queue.sort((a, b) => Number(a.request.kind === 'view') - Number(b.request.kind === 'view') || a.order - b.order);
    const job = active = queue.shift(); onEvent({ type: 'dispatch', order: job.order, kind: job.request.kind });
    job.nativeDone = Promise.resolve().then(() => dispatch(job.request)).then(value => {
      if (job.settled) onOrphan(value); else settle(job, null, value);
    }, error => settle(job, error)).finally(() => { active = null; onEvent({ type: 'finished', order: job.order }); pump(); });
  }
  function submit(request, signal) {
    if (closed) return Promise.reject(new NativeQueueError('closed', 'native queue closed'));
    if (signal?.aborted) return Promise.reject(aborted());
    if (active && queue.length >= maxQueued) return Promise.reject(new NativeQueueError('capacity', 'native queue capacity exceeded'));
    let resolve, reject;
    const promise = new Promise((r, j) => { resolve = r; reject = j; });
    const job = { request, signal, resolve, reject, order: ++sequence, settled: false };
    job.abort = () => {
      const i = queue.indexOf(job); if (i >= 0) queue.splice(i, 1);
      settle(job, aborted()); onEvent({ type: 'cancelled', order: job.order, active: active === job });
    };
    signal?.addEventListener('abort', job.abort, { once: true });
    queue.push(job); onEvent({ type: 'queued', order: job.order, kind: request.kind }); pump(); return promise;
  }
  return Object.freeze({ submit,
    snapshot: () => ({ active: active ? 1 : 0, queued: queue.length, closed }),
    close() {
      closed = true;
      for (const job of queue.splice(0)) settle(job, new NativeQueueError('closed', 'native queue closed'));
      if (active) settle(active, new NativeQueueError('closed', 'native queue closed'));
      return active?.nativeDone ?? Promise.resolve();
    },
  });
}
