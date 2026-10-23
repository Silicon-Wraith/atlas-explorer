// Serial CPU mask work. The iterator exposes bounded pixel chunks; GPU leases
// stay with the caller until this work and validation have completed.
export function createMaskWork({ clock = () => performance.now(), yieldTask = () => new Promise(resolve => setTimeout(resolve, 0)), budgetMs = 2 } = {}) {
  if (!(budgetMs > 0 && budgetMs <= 2)) throw new RangeError('mask task budget must be at most 2 ms');
  let tail = Promise.resolve(), deadline = -Infinity;
  async function yieldNow() { await yieldTask(); deadline = clock() + budgetMs; }
  return Object.freeze({ run(steps, valid = () => true) {
    const result = tail.then(async () => {
      try {
        while (true) {
          if (!valid()) throw new Error('outcome-mask work invalidated');
          if (clock() >= deadline) await yieldNow();
          if (!valid()) throw new Error('outcome-mask work invalidated');
          const next = steps.next();
          if (next.done) {
            // Separate mask work from the completion/next-admission microtasks.
            // Promise.resolve alone would leave them in the same browser task.
            await yieldNow();
            if (!valid()) throw new Error('outcome-mask work invalidated');
            return next.value;
          }
        }
      } finally { steps.return?.(); }
    });
    tail = result.catch(() => {});
    return result;
  } });
}
