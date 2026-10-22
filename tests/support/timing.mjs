// Self-contained so the performance harness can install this exact function in
// the page. Positive waits round up; callbacks never move the absolute origin.
export function scheduleAbsolute({ clock, setTimer }, targets, callback) {
  if (!Array.isArray(targets) || targets.some((t, i) => !Number.isFinite(t) || i && t < targets[i - 1])) throw new TypeError('ordered finite absolute targets required');
  const result = { rearms: 0, lateByMs: [], longTasks: [], invalidated: false };
  return new Promise((resolve, reject) => {
    let index = 0, armedFor = -1;
    function step() {
      if (index === targets.length) { resolve(result); return; }
      const delay = targets[index] - clock();
      if (delay > 0) {
        if (armedFor === index) result.rearms++;
        armedFor = index;
        setTimer(step, Math.ceil(delay)); return;
      }
      const issuedAt = clock(), late = Math.max(0, issuedAt - targets[index]);
      result.lateByMs.push(late);
      if (late > 4) result.invalidated = true;
      try { callback({ target: targets[index], issuedAt, lateByMs: late }, index++); }
      catch (error) { error.timing = result; reject(error); return; }
      step();
    }
    step();
  });
}
