// Pure admission and client identity controls; no sockets or native process.
export function applicationRequestAllowed({ host, origin, method, contentType, port }) {
  if (![...['127.0.0.1', 'localhost'].map(name => name + ':' + port)].includes(host)) return false;
  if (origin != null && origin !== 'http://' + host) return false;
  if (method === 'POST' && (origin !== 'http://' + host || contentType?.split(';')[0].trim() !== 'application/json')) return false;
  return ['GET', 'POST', 'HEAD'].includes(method);
}
export const APPLICATION_SESSION_POLICY = Object.freeze({ leaseMs: 30000, heartbeatMs: 5000, sweepMs: 1000 });

export class ApplicationSessionError extends Error {
  constructor(code, message, status = 409) {
    super(message); this.name = 'ApplicationSessionError'; this.code = code; this.status = status;
  }
}

export function createApplicationClientOwner({ onClose = () => {}, onEvent = () => {}, now = () => performance.now(),
  leaseMs = APPLICATION_SESSION_POLICY.leaseMs, maxClosed = 1024 } = {}) {
  if (!(Number.isFinite(leaseMs) && leaseMs > 0 && Number.isSafeInteger(maxClosed) && maxClosed > 0)) throw new TypeError('Bounded session policy required');
  let current = null, cleanupError = null;
  const closed = new Map();
  function validate(id, nonce) {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9:_-]{8,128}$/.test(id) || typeof nonce !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(nonce)) {
      throw new ApplicationSessionError('identity', 'Invalid landscape session identity');
    }
  }
  const same = (client, id, nonce) => client?.id === id && client.nonce === nonce;
  function healthy() {
    if (cleanupError) throw new ApplicationSessionError('cleanup-failed', 'Landscape cleanup failed. Restart the launcher before retrying.', 503);
  }
  function capacity(id) {
    // Reserve a tombstone for the live owner even if close-before-open calls arrive.
    if (!closed.has(id) && closed.size >= maxClosed - (current && current.id !== id ? 1 : 0)) {
      throw new ApplicationSessionError('capacity', 'Landscape session capacity reached. Restart the launcher before retrying.', 503);
    }
  }
  function finish(client, reason) {
    client.closed = true; client.reason = reason;
    const tombstone = { id: client.id, nonce: client.nonce, closed: true, reason, tokens: new Set(client.tokens) };
    try { onClose(client); }
    catch (error) {
      cleanupError = error; onEvent({ type: 'cleanup-failed', id: client.id, message: error.message }); healthy();
    }
    closed.set(client.id, tombstone); current = null;
    onEvent({ type: reason, id: client.id });
  }
  function expire() {
    if (current && !current.closed && now() >= current.expiresAt) finish(current, 'expired');
  }
  function requireClient(id, nonce) {
    validate(id, nonce); expire(); healthy();
    if (same(current, id, nonce) && !current.closed) return current;
    if (current?.id === id || closed.has(id) && closed.get(id).nonce !== nonce) throw new ApplicationSessionError('identity', 'This tab does not own that landscape session');
    const previous = closed.get(id);
    throw new ApplicationSessionError(previous?.reason === 'closed' ? 'closed' : 'expired', 'The landscape session has ended. Retry Landscape to continue.', 410);
  }
  function begin(id, nonce) {
    validate(id, nonce); expire(); healthy();
    if (closed.has(id)) {
      if (closed.get(id).nonce !== nonce) throw new ApplicationSessionError('identity', 'This tab does not own that landscape session');
      throw new ApplicationSessionError('closed', 'The landscape session has ended. Retry Landscape to continue.', 410);
    }
    if (current) {
      if (same(current, id, nonce)) return current;
      throw new ApplicationSessionError('owned', 'Landscape is active in another tab. Return there, or retry after its session ends.');
    }
    capacity(id);
    current = { id, nonce, expiresAt: now() + leaseMs, sequence: 0, requests: new Map(), controllers: new Map(), tokens: new Set(), closed: false };
    onEvent({ type: 'opened', id }); return current;
  }
  function cleanup(id, nonce) {
    validate(id, nonce); expire(); healthy();
    if (same(current, id, nonce) && !current.closed) return current;
    const previous = closed.get(id);
    if (same(previous, id, nonce)) return previous;
    return requireClient(id, nonce);
  }
  return Object.freeze({ begin, expire,
    current() { expire(); return current; },
    require: requireClient, cleanup,
    renew(id, nonce, sequence) {
      const client = requireClient(id, nonce);
      if (!Number.isSafeInteger(sequence) || sequence <= client.sequence) throw new ApplicationSessionError('sequence', 'Stale landscape renewal');
      client.sequence = sequence; client.expiresAt = now() + leaseMs; onEvent({ type: 'renewed', id, sequence }); return client;
    },
    describe(client) {
      requireClient(client.id, client.nonce);
      return { protocol: 'atlas.preparation.session.v1', leaseMs, remainingMs: Math.max(0, client.expiresAt - now()), sequence: client.sequence };
    },
    close(id, nonce) {
      validate(id, nonce); expire(); healthy();
      if (current?.id === id) {
        if (!same(current, id, nonce)) throw new ApplicationSessionError('identity', 'This tab does not own that landscape session');
        finish(current, 'closed'); return true;
      }
      if (closed.has(id)) {
        if (!same(closed.get(id), id, nonce)) throw new ApplicationSessionError('identity', 'This tab does not own that landscape session');
        return false;
      }
      capacity(id); closed.set(id, { id, nonce, closed: true, reason: 'closed', tokens: new Set() }); return false;
    },
    snapshot() {
      try { expire(); } catch { /* Sticky cleanup state is reported without disclosing identity. */ }
      return { state: cleanupError ? 'cleanup-failed' : current ? 'owned' : 'available', remainingMs: current && !current.closed ? Math.max(0, current.expiresAt - now()) : 0, closedClients: closed.size };
    },
  });
}
