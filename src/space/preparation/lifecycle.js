// Local resource ownership is deliberately separate from portable JSON records.
import { createPreparationRequest, assertResultForRequest, assertPreparationReceipt, PreparationError } from './contract.js';

const leases = new WeakSet();
export function createResourceLease({ owner, bytes }, value, release) {
  if (typeof owner !== 'string' || !owner.trim() || !Number.isSafeInteger(bytes) || bytes < 0 || typeof release !== 'function') throw new TypeError('lease requires owner, byte count and release');
  let retirement;
  const lease = Object.freeze({ owner, bytes, value,
    release() { return retirement ??= Promise.resolve().then(() => release(value)); },
  });
  leases.add(lease); return lease;
}
const isLease = value => value !== null && typeof value === 'object' && leases.has(value);

export function createPreparationSession({ runtimeId, producer, maxLive = 8 }) {
  if (typeof runtimeId !== 'string' || !runtimeId.trim() || !Number.isSafeInteger(maxLive) || maxLive < 1) throw new TypeError('runtimeId and positive maxLive required');
  // Validate/copy the producer identity through the same record validator.
  const probe = createPreparationRequest({ schema: 'atlas.preparation.request', schemaVersion: 1,
    identity: { runtimeId, epoch: 0, requestId: 'validation' }, producer, world: { id: 'validation', definitionKey: 'validation' },
    bounds: { min: [0, 0, 0], max: [1, 1, 1] }, intent: 'view', requirements: { maxErrorM: 1, bodyDiameterM: null } });
  producer = probe.producer;
  let epoch = 0, sequence = 0, closed = false, cleanupUnconfirmed = false;
  const live = new Set(), cleanupErrors = [];

  function start(spec, { produce, prepare }) {
    if (closed || cleanupErrors.length || cleanupUnconfirmed) throw new Error('preparation session closed or cleanup failed/unconfirmed');
    if (live.size >= maxLive) throw new Error('preparation capacity exceeded');
    if (typeof produce !== 'function' || typeof prepare !== 'function') throw new TypeError('producer and consumer preparer required');
    const request = createPreparationRequest({ ...spec, schema: 'atlas.preparation.request', schemaVersion: 1,
      identity: { runtimeId, epoch, requestId: `${runtimeId}:${++sequence}` }, producer });
    const controller = new AbortController();
    let state = 'pending', reason = null, artifact = null, payload = null, resources = null, valid = true, disposal;
    const current = () => valid && !closed && !cleanupErrors.length && !cleanupUnconfirmed && request.identity.epoch === epoch;
    const snapshot = () => Object.freeze({ state, reason, request, artifact,
      viewEligible: current() && ['view-ready', 'interaction-ready'].includes(state),
      interactionEligible: current() && state === 'interaction-ready', cleanupFailed: cleanupErrors.length > 0 });
    async function dispose() {
      if (disposal) return disposal;
      // Only call once preparation has settled: it may still be reading payload.
      disposal = (async () => {
        for (const lease of new Set([resources, payload].filter(Boolean))) {
          try { await lease.release(); } catch (error) { cleanupErrors.push(error); }
        }
        resources = null; payload = null; live.delete(ticket);
      })();
      return disposal;
    }
    function invalidate(nextState, why) {
      valid = false; state = nextState; reason = why; controller.abort(why);
    }
    const done = Promise.resolve().then(async () => {
      try {
        if (!current()) return;
        const output = await produce(request, controller.signal);
        // Take ownership before validating the envelope so malformed/stale output
        // cannot strand a resource lease returned with it.
        if (isLease(output?.payload)) payload = output.payload;
        else if (output?.payload != null) throw new PreparationError('producer payload requires a resource lease');
        if (!current()) return;
        const result = assertResultForRequest(output?.result, request);
        if (result.status !== 'prepared') { state = result.status; reason = result.reason; return; }
        if (!payload) throw new PreparationError('prepared artifact requires an explicit payload lease');
        artifact = result.artifact; state = 'prepared';
        const receipt = await prepare(artifact, payload.value, controller.signal);
        if (isLease(receipt?.lease)) resources = receipt.lease;
        else throw new PreparationError('consumer receipt requires a resource lease');
        assertPreparationReceipt(receipt, artifact);
        if (!current()) return;
        state = request.intent === 'view' ? 'view-ready' : 'interaction-ready';
      } catch (error) {
        if (current()) { state = 'failed'; reason = error.message; }
      } finally {
        if (!current() || !['view-ready', 'interaction-ready'].includes(state)) await dispose();
      }
    }).then(snapshot);
    const ticket = Object.freeze({ request, done, snapshot,
      cancel(why = 'cancelled') {
        if (valid) invalidate('cancelled', why);
        return done.then(dispose).then(snapshot);
      },
      retire() {
        if (valid) invalidate('retired', 'retired');
        return done.then(dispose).then(snapshot);
      },
    });
    live.add(ticket); return ticket;
  }
  async function drain(tickets, timeoutMs) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('positive cleanup deadline required');
    const work = Promise.all(tickets.map(ticket => ticket.retire()));
    let timer;
    try {
      await Promise.race([work, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('preparation cleanup deadline; ownership unconfirmed')), timeoutMs); })]);
    } catch (error) { cleanupUnconfirmed = true; throw error; }
    finally { clearTimeout(timer); }
    if (cleanupErrors.length) throw new AggregateError([...cleanupErrors], 'preparation resource release failed');
    cleanupUnconfirmed = false;
    return Object.freeze({ cleanup: true, live: live.size });
  }
  return Object.freeze({ start,
    diagnostics: () => Object.freeze({ epoch, closed, live: live.size, cleanupErrors: cleanupErrors.length, cleanupUnconfirmed }),
    recover({ nextProducer = producer, timeoutMs = 5000 } = {}) {
      // Validate first, before invalidating any current request.
      const checked = createPreparationRequest({ ...probe, producer: nextProducer });
      producer = checked.producer; epoch++;
      return drain([...live], timeoutMs);
    },
    shutdown({ timeoutMs = 5000 } = {}) { closed = true; return drain([...live], timeoutMs); },
  });
}
