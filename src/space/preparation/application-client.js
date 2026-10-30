import { createBrowserProducer } from './browser-producer.js';

export function createApplicationPreparationClient({ runtimeId, fetcher = fetch, onEvent = () => {}, onSessionLost = () => {},
  nonce = crypto.randomUUID(), now = () => performance.now(), wallNow = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
  const controller = new AbortController();
  const headers = { 'Content-Type': 'application/json', 'X-Atlas-Client': runtimeId, 'X-Atlas-Session': nonce };
  let opening, closing, closed = false, expired = false, confirmed = false, verified = false, hidden = false;
  let policy = null, deadline = 0, wallDeadline = 0, sequence = 0, timer = null, renewing = null, renewalController = null;
  let message = '';
  const emit = (type, data = {}) => onEvent({ type, time: performance.timeOrigin + performance.now(), ...data });
  function clearSchedule() { if (timer != null) clearTimer(timer); timer = null; }
  function lose(reason) {
    if (closed || expired) return;
    expired = true; verified = false; message = reason; clearSchedule(); renewalController?.abort();
    emit('session-lost', { reason }); onSessionLost(reason);
  }
  function timeValid() {
    if (closed || expired || !confirmed) return false;
    if (now() >= deadline || wallNow() >= wallDeadline) { lose('The landscape session expired. Retry Landscape to continue.'); return false; }
    return true;
  }
  function sessionValue(value) {
    if (!value || value.protocol !== 'atlas.preparation.session.v1' || !Number.isFinite(value.leaseMs) || value.leaseMs <= 0 ||
      !Number.isFinite(value.remainingMs) || value.remainingMs <= 0 || value.remainingMs > value.leaseMs ||
      !Number.isFinite(value.heartbeatMs) || value.heartbeatMs <= 0 || value.heartbeatMs >= value.leaseMs || !Number.isSafeInteger(value.sequence)) {
      throw new Error('Unsupported landscape session policy');
    }
    return value;
  }
  function schedule() {
    clearSchedule(); if (!closed && !expired) timer = setTimer(() => { timer = null; renew().catch(error => lose(error.message)); }, policy.heartbeatMs);
  }
  async function renew(force = false) {
    if (closed || expired || !policy) return false;
    if (confirmed && !timeValid()) return false;
    if (renewing && !force) return renewing;
    if (force) { verified = false; renewalController?.abort(); }
    clearSchedule();
    const mine = ++sequence, sent = now(), wallSent = wallNow(), cancellation = new AbortController();
    renewalController = cancellation;
    const timeout = setTimer(() => cancellation.abort(), Math.min(5000, policy.heartbeatMs));
    const task = (async () => {
      try {
        const response = await fetcher('/api/preparation/heartbeat', { method: 'POST', headers, body: JSON.stringify({ sequence: mine }), signal: cancellation.signal });
        const output = await response.json();
        if (mine !== sequence || closed || expired) return false;
        if (!response.ok) { lose(output.error ?? 'The landscape session is unavailable. Retry Landscape.'); return false; }
        const next = sessionValue(output.session);
        if (next.sequence !== mine) throw new Error('Landscape renewal identity mismatch');
        // Credit time from send, never arrival. A wall-clock jump can expire
        // early but cannot extend this local permit.
        deadline = sent + next.remainingMs; wallDeadline = wallSent + next.remainingMs;
        confirmed = true; policy = next;
        if (!timeValid()) return false;
        verified = !hidden;
        message = hidden ? 'Landscape is paused while this tab is hidden.' : '';
        emit('session-renewed', { sequence: mine, remainingMs: deadline - now(), verified });
        return verified;
      } catch (error) {
        if (mine !== sequence || closed || expired) return false;
        verified = false; message = 'Checking the landscape connection…'; emit('session-checking', { reason: error.message });
        if (!confirmed) lose('The landscape session could not be verified. Retry Landscape.');
        else timeValid();
        return false;
      } finally {
        clearTimer(timeout);
        if (mine === sequence) { renewing = null; renewalController = null; schedule(); }
      }
    })();
    renewing = task; return task;
  }
  async function sessionFetch(url, options) {
    const cleanup = /\/(?:retire\/|cancel$)/.test(url);
    if (!cleanup && !timeValid()) throw Object.assign(new Error('Landscape session is not active'), { name: 'AbortError' });
    const response = await fetcher(url, { ...options, headers: { ...options.headers, ...headers } });
    if (response.status === 410 || response.status === 409) {
      const output = await (response.clone ? response.clone() : response).json();
      if (cleanup && response.status === 410 && output.sessionRetired === true) return new Response(JSON.stringify({ closedSession: true }), { status: 200 });
      if (!cleanup) lose(output.error ?? 'The landscape session has ended. Retry Landscape.');
    }
    if (!cleanup && response.ok && !timeValid()) {
      response.body?.cancel().catch(() => {});
      throw Object.assign(new Error('Landscape session ended during transfer'), { name: 'AbortError' });
    }
    return response;
  }
  const producer = createBrowserProducer({ baseUrl: '/api/preparation', headers, fetcher: sessionFetch, onEvent });
  function cancelOpening() {
    closed = true; verified = false; clearSchedule(); controller.abort(); renewalController?.abort();
  }
  return Object.freeze({ produce: producer.produce,
    snapshot: () => ({ ...producer.snapshot(), session: { state: closed ? 'closed' : expired ? 'expired' : verified && !hidden ? 'ready' : 'checking', verified: verified && !hidden,
      remainingMs: confirmed ? Math.max(0, Math.min(deadline - now(), wallDeadline - wallNow())) : 0, sequence, message } }),
    check: () => timeValid() && verified && !hidden,
    pause() { hidden = true; verified = false; message = 'Landscape is paused while this tab is hidden.'; },
    revalidate() { hidden = false; return renew(true); },
    cancelOpening,
    open() {
      if (closed) return Promise.reject(new Error('Landscape opening was cancelled'));
      return opening ??= (async () => {
        const timeout = setTimer(() => controller.abort(), 35000);
        try {
          const response = await fetcher('/api/preparation/open', { method: 'POST', headers, body: JSON.stringify({ runtimeId }), signal: controller.signal });
          if (response.status === 404) throw new Error('Landscape preparation is unavailable. Start ATLAS with npm run dev:world, then retry Landscape.');
          const output = await response.json();
          if (!response.ok) throw new Error(output.error ?? 'Landscape preparation is unavailable');
          if (closed) throw new Error('Landscape opening was superseded');
          policy = sessionValue(output.session);
          if (!await renew(true)) throw new Error(message || 'Landscape session verification failed');
          return output;
        } finally { clearTimer(timeout); }
      })();
    },
    close({ allowDeferred = false } = {}) {
      if (closing) return closing; cancelOpening();
      closing = (async () => {
        const cancellation = new AbortController(), timeout = setTimer(() => cancellation.abort(), 5000);
        let received = false;
        try {
          const response = await fetcher('/api/preparation/close', { method: 'POST', headers, body: JSON.stringify({ runtimeId }), signal: cancellation.signal });
          received = true;
          if (!response.ok && response.status !== 404) throw new Error('Landscape client release failed');
          return { confirmed: true };
        } catch (error) {
          // The workspace may defer only the empty session record, after all
          // request/payload/local retirement succeeded. A new open still has
          // to pass the authoritative server fence. Retirement errors are not
          // covered by this exception.
          if (allowDeferred && expired && !received) { emit('session-close-deferred', { reason: error.message }); return { confirmed: false, expiryBounded: true }; }
          throw error;
        } finally { clearTimer(timeout); }
      })(); return closing;
    },
  });
}
