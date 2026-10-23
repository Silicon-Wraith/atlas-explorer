// Main-thread facade. Pixel arrays are created/decoded only in the Worker; the
// renderer retains its readback lease until the identity-matched acknowledgement.
const sameSample = (a, b) => a?.accumulationKey === b?.accumulationKey && a?.sample === b?.sample;
const failure = reason => reason instanceof Error ? reason : new Error(String(reason));
// One service belongs to one renderer/scheduler admission domain. Across all
// sessions, every pending record retains one of that scheduler epoch's at most
// two leases until acknowledgement (including non-REC-G draft diagnostics).
// Sharing an injected service across independent schedulers is unsupported.
export function createMaskProcessor({ createWorker = () => new Worker(new URL('./outcome-masks.worker.js', import.meta.url), { type: 'module' }) } = {}) {
  let worker = null, destroyed = false, serial = 0, sequence = 0;
  const sessions = new Map(), pending = new Map();
  function reset(reason = 'outcome-mask Worker reset') {
    const previous = worker; worker = null;
    if (previous) { previous.onmessage = previous.onerror = previous.onmessageerror = null; previous.terminate(); }
    for (const session of [...sessions.values()]) session.close(failure(reason), false);
  }
  function start() {
    if (worker) return worker;
    const next = createWorker(); worker = next;
    next.onmessage = ({ data }) => {
      if (worker !== next) return;
      const item = pending.get(data?.sequence); if (!item) return; // disposed session/old reply
      pending.delete(data.sequence);
      if (data.session !== item.session || !sameSample(data.id, item.id)) item.reject(new Error('outcome-mask Worker reply identity mismatch'));
      else if (data.error) item.reject(new Error(data.error));
      else item.resolve(data);
    };
    next.onerror = event => { event.preventDefault?.(); if (worker === next) reset(event.message ?? 'outcome-mask Worker failed'); };
    next.onmessageerror = () => { if (worker === next) reset('outcome-mask Worker message decode failed'); };
    return next;
  }
  function open(size, { recovery = false, producerToken = 0, strict = true, valid = () => true } = {}) {
    if (destroyed) throw new Error('outcome-mask processor destroyed');
    const session = ++serial, setup = { size: { ...size }, options: { recovery, producerToken, strict } };
    let started = false, error = null, completed = null;
    const close = (reason = 'outcome-mask session closed', notify = true) => {
      if (error) return;
      error = failure(reason); completed = null; sessions.delete(session);
      for (const [key, item] of pending) if (item.session === session) { pending.delete(key); item.reject(error); }
      if (started && worker && notify) {
        try { worker.postMessage({ type: 'drop', session }); } catch (reason) { reset(reason); }
      }
    };
    async function ingest(id, field, region, bytes) {
      try {
        if (error) throw error;
        if (!valid()) throw new Error('outcome-mask work invalidated');
        // Backend copy-out promises sole ownership of the complete buffer. Never
        // clone pixels, transfer a mapped GPU buffer, or detach someone else's view.
        if (!(bytes instanceof Uint8Array) || !(bytes.buffer instanceof ArrayBuffer) || bytes.byteOffset || bytes.byteLength !== bytes.buffer.byteLength || !bytes.byteLength) throw new Error('outcome-mask transfer requires an owned complete readback buffer');
        if (pending.size >= 2) throw new Error('outcome-mask Worker exceeds the two readback lease bound');
        const target = start(), key = ++sequence, identity = { ...id };
        const result = new Promise((resolve, reject) => {
          pending.set(key, { session, id: identity, resolve, reject });
          try {
            target.postMessage({ type: 'record', session, sequence: key, id: identity, field, region,
              ...(started ? {} : { setup }), bytes }, [bytes.buffer]);
            started = true;
          } catch (reason) { pending.delete(key); reject(reason); reset(reason); }
        });
        const reply = await result;
        if (error) throw error;
        if (!valid()) throw new Error('outcome-mask work invalidated');
        if (typeof reply.closed !== 'boolean') throw new Error('outcome-mask Worker acknowledgement missing validation state');
        if (reply.closed) {
          if (!reply.counts || reply.snapshot?.accumulationKey !== id.accumulationKey || reply.snapshot?.samples?.at(-1)?.sample !== id.sample) throw new Error('outcome-mask Worker validation result missing or mismatched');
          completed = { id: identity, counts: reply.counts, snapshot: reply.snapshot };
        }
      } catch (reason) { close(reason); throw reason; }
    }
    const api = Object.freeze({
      ingest, ingestDraft: (id, region, bytes) => ingest(id, 'draftDiagnostics', region, bytes),
      closed: id => !error && sameSample(completed?.id, id),
      counts: () => structuredClone(completed?.counts ?? null), snapshot: () => structuredClone(completed?.snapshot ?? null), close,
    });
    sessions.set(session, api); return api;
  }
  return Object.freeze({ open, reset, destroy() { if (!destroyed) { destroyed = true; reset('outcome-mask processor destroyed'); } } });
}
