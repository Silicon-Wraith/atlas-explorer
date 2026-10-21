// spikes/project0/gpu/watchdog.js — spec §7: 5 s without observable submission progress stops the experiment.
export function createWatchdog({ stallMs = 5000, now = () => performance.now(), every = 250, onStall = () => {} } = {}) {
  const outstanding = new Map(); let lastProgress = now(), seq = 0, timer = null;
  const wd = {
    stopped: false, stall: null,
    submitted(id, meta = {}) {
      if (wd.stopped) throw new Error('watchdog stopped: no further submissions');
      const key = `${id}#${seq++}`; outstanding.set(key, { id, meta, at: now() });
      if (outstanding.size === 1) lastProgress = now();
      return () => { if (outstanding.delete(key)) lastProgress = now(); };
    },
    check() {
      if (wd.stopped || outstanding.size === 0) return;
      const t = now();
      if (t - lastProgress > stallMs) {
        wd.stopped = true;
        wd.stall = { atMs: t, outstanding: [...outstanding.values()].map(o => ({ id: o.id, meta: o.meta, ageMs: t - o.at })) };
        onStall(wd.stall);
      }
    },
    dispose() { if (timer) clearInterval(timer); },
  };
  if (every) timer = setInterval(() => wd.check(), every);
  return wd;
}
