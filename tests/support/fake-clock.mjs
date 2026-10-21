// Deterministic virtual time. advance runs due callbacks in deadline / insertion order;
// callbacks observe their deadline, including timers scheduled by another callback.
export function createFakeClock(start = 0) {
  if (!Number.isFinite(start)) throw new RangeError('start must be finite');
  let now = start, nextId = 0, running = false;
  const timers = new Map();
  function runUntil(target) {
    if (running) throw new Error('fake clock cannot advance recursively');
    running = true;
    try {
      let callbacks = 0;
      for (;;) {
        const next = [...timers.values()].filter(timer => timer.at <= target).sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!next) break;
        if (++callbacks > 100000) throw new Error('fake clock timer loop did not quiesce');
        timers.delete(next.id); now = next.at; next.fn();
      }
      now = target;
    } finally { running = false; }
    return now;
  }
  return Object.freeze({
    now: () => now,
    advance(ms) {
      if (!Number.isFinite(ms) || ms < 0 || !Number.isFinite(now + ms)) throw new RangeError('advance requires a finite nonnegative duration');
      return runUntil(now + ms);
    },
    schedule(fn, ms) {
      if (typeof fn !== 'function') throw new TypeError('timer callback must be a function');
      if (!Number.isFinite(ms) || ms < 0 || !Number.isFinite(now + ms)) throw new RangeError('delay must be finite and nonnegative');
      const id = ++nextId; timers.set(id, { id, fn, at: now + ms }); return id;
    },
    clear: id => timers.delete(id), runDue: () => runUntil(now),
  });
}
