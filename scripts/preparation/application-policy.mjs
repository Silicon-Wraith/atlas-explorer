// Pure admission and client identity controls; no sockets or native process.
export function applicationRequestAllowed({ host, origin, method, contentType, port }) {
  if (![...['127.0.0.1', 'localhost'].map(name => name + ':' + port)].includes(host)) return false;
  if (origin != null && origin !== 'http://' + host) return false;
  if (method === 'POST' && (origin !== 'http://' + host || contentType?.split(';')[0].trim() !== 'application/json')) return false;
  return ['GET', 'POST', 'HEAD'].includes(method);
}
export function createApplicationClientOwner({ onClose = () => {} } = {}) {
  let current = null; const closed = new Set();
  const valid = id => typeof id === 'string' && /^[a-zA-Z0-9:_-]{8,128}$/.test(id);
  function begin(id) {
    if (!valid(id)) throw new Error('Invalid application client identity');
    if (closed.has(id)) throw new Error('Landscape client was already closed');
    if (current && current.id !== id) throw new Error('Another landscape client is already active');
    return current ??= { id, requests: new Map(), controllers: new Map(), tokens: new Set(), closed: false };
  }
  return Object.freeze({ begin, current: () => current,
    require(id) { if (!current || current.closed || current.id !== id) throw new Error('Landscape client is not current'); return current; },
    close(id) {
      if (!valid(id)) throw new Error('Invalid application client identity');
      if (closed.size >= 1024 && !closed.has(id)) throw new Error('Application client accounting capacity exceeded');
      closed.add(id); if (!current || current.id !== id) return false;
      const old = current; old.closed = true; current = null; onClose(old); return true;
    },
  });
}
