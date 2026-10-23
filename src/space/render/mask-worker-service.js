// Worker-owned sessions. This handler is synchronous within one worker message:
// samples never interleave with a drop/new identity, and no timer clamp is needed.
import { createWorkerOutcomeMasks } from './outcome-masks.js';
export function createMaskWorkerHandler() {
  const sessions = new Map();
  return message => {
    const { type, session, sequence, id, field, region, bytes, setup } = message;
    if (type === 'drop') { sessions.delete(session); return null; }
    const reply = { session, sequence, id };
    try {
      if (type !== 'record' || !Number.isSafeInteger(session) || session < 1) throw new Error('invalid outcome-mask Worker request');
      if (setup) {
        if (sessions.has(session)) throw new Error('duplicate outcome-mask Worker session');
        sessions.set(session, createWorkerOutcomeMasks(setup.size, setup.options));
      }
      const masks = sessions.get(session);
      if (!masks) throw new Error('unknown outcome-mask Worker session');
      masks.ingestSync(id, field, region, bytes);
      const closed = masks.closed(id);
      return { ...reply, closed, ...(closed ? { counts: masks.counts(), snapshot: masks.snapshot() } : {}) };
    } catch (error) { sessions.delete(session); return { ...reply, error: error.message ?? String(error) }; }
  };
}
