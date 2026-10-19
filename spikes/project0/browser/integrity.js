// spikes/project0/browser/integrity.js — integrity across the whole measured interval, long tasks, refresh rate.
export function observeIntegrity(canvas, { allowedBacking = [[1280, 720]] } = {}) {
  const events = [], violations = [];
  const t = () => performance.now();
  if (document.visibilityState !== 'visible') violations.push(`hidden at start (${document.visibilityState})`);
  if (!document.hasFocus()) violations.push('unfocused at start');
  if (devicePixelRatio !== 1) violations.push(`devicePixelRatio ${devicePixelRatio}`);
  const onVis = () => { events.push({ t: t(), type: 'visibility', value: document.visibilityState }); if (document.visibilityState !== 'visible') violations.push(`hidden at ${t().toFixed(0)}`); };
  const onBlur = () => { events.push({ t: t(), type: 'blur' }); violations.push(`window blurred at ${t().toFixed(0)}`); };
  const onFocus = () => events.push({ t: t(), type: 'focus' });
  const mq = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
  const onDpr = () => { events.push({ t: t(), type: 'dpr', value: devicePixelRatio }); violations.push(`devicePixelRatio changed to ${devicePixelRatio}`); };
  document.addEventListener('visibilitychange', onVis); addEventListener('blur', onBlur); addEventListener('focus', onFocus); mq.addEventListener('change', onDpr);
  let running = true, last = `${canvas.width}x${canvas.height}`;
  const allowed = new Set(allowedBacking.map(([w, h]) => `${w}x${h}`));
  const tick = () => {
    if (!running) return;
    const now = `${canvas.width}x${canvas.height}`;
    if (now !== last) { events.push({ t: t(), type: 'backing', value: now }); last = now; }
    if (!allowed.has(now) && !violations.some(v => v.startsWith(`unexpected backing ${now}`))) violations.push(`unexpected backing ${now}`);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return { stop() { running = false; document.removeEventListener('visibilitychange', onVis); removeEventListener('blur', onBlur); removeEventListener('focus', onFocus); mq.removeEventListener('change', onDpr); return { events, violations }; } };
}

export function observeLongTasks() {
  const tasks = [];
  const observer = new PerformanceObserver(list => tasks.push(...list.getEntries()));
  observer.observe({ type: 'longtask', buffered: true });
  return {
    // Drains records the observer has not delivered yet, so a long task at the end of the interval is not lost.
    take(startMs, endMs) {
      tasks.push(...observer.takeRecords());
      const harness = performance.getEntriesByType('measure').filter(m => m.name.startsWith('harness:'));
      return tasks.filter(x => x.startTime >= startMs && x.startTime < endMs).map(x => {
        const overlapsHarness = harness.some(h => h.startTime < x.startTime + x.duration && x.startTime < h.startTime + h.duration);
        const self = x.attribution?.some(a => a.name === 'self' || a.containerType === 'window');
        return { ms: x.duration, start: x.startTime, kind: overlapsHarness ? 'harness' : self ? 'application' : 'unattributed' };
      });
    },
    harnessMeasures: () => performance.getEntriesByType('measure').filter(m => m.name.startsWith('harness:')).length,
  };
}

export function refreshHz(samples = 61) {
  return new Promise(resolve => {
    const t = []; const f = now => { t.push(now); if (t.length < samples) requestAnimationFrame(f); else { const d = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b); resolve(1000 / d[Math.floor(d.length / 2)]); } };
    requestAnimationFrame(f);
  });
}
