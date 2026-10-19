// spikes/project0/browser/integrity.js — integrity across the whole measured interval, long tasks, refresh rate.
// Backing size (T9 fix round 1, Codex T9 r1 finding 2): checked at the start and at stop, and every width/height mutation is observed with
// its old value and replayed in order, so a size changed and restored before the next animation frame, or within one task, is still seen.
// Mutations still queued when stop() is called are drained first. A deliberate resize (G12) goes through resize(): the pending records are
// replayed first, the width/height pair is set, its intermediate state (new width, old height) is discarded, and the final size is checked
// against the frozen list like any other.
export function observeIntegrity(canvas, { allowedBacking = [[1280, 720]] } = {}) {
  const events = [], violations = [];
  const t = () => performance.now();
  const allowed = new Set(allowedBacking.map(([w, h]) => `${w}x${h}`));
  const flag = (size, when) => { if (!allowed.has(size) && !violations.some(v => v.startsWith(`unexpected backing ${size} `))) violations.push(`unexpected backing ${size} ${when}`); };
  if (document.visibilityState !== 'visible') violations.push(`hidden at start (${document.visibilityState})`);
  if (!document.hasFocus()) violations.push('unfocused at start');
  if (devicePixelRatio !== 1) violations.push(`devicePixelRatio ${devicePixelRatio}`);
  const onVis = () => { events.push({ t: t(), type: 'visibility', value: document.visibilityState }); if (document.visibilityState !== 'visible') violations.push(`hidden at ${t().toFixed(0)}`); };
  const onBlur = () => { events.push({ t: t(), type: 'blur' }); violations.push(`window blurred at ${t().toFixed(0)}`); };
  const onFocus = () => events.push({ t: t(), type: 'focus' });
  const mq = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
  const onDpr = () => { events.push({ t: t(), type: 'dpr', value: devicePixelRatio }); violations.push(`devicePixelRatio changed to ${devicePixelRatio}`); };
  document.addEventListener('visibilitychange', onVis); addEventListener('blur', onBlur); addEventListener('focus', onFocus); mq.addEventListener('change', onDpr);
  const size = { width: canvas.width, height: canvas.height }, key = () => `${size.width}x${size.height}`;
  flag(key(), 'at start');
  // Each record's new value is the old value of the next record for the same attribute, or the current value for the last one.
  const replay = records => records.forEach((r, i) => {
    const a = r.attributeName; if (a !== 'width' && a !== 'height') return;
    const next = records.slice(i + 1).find(x => x.attributeName === a);
    size[a] = Number(next ? next.oldValue : canvas[a]);
    events.push({ t: t(), type: 'backing', value: key() }); flag(key(), `at ${t().toFixed(0)}`);
  });
  const mo = typeof MutationObserver === 'function' ? new MutationObserver(replay) : null;
  if (mo) mo.observe(canvas, { attributes: true, attributeFilter: ['width', 'height'], attributeOldValue: true });
  else violations.push('backing observation unavailable (no MutationObserver)');
  let running = true;
  const tick = () => { if (!running) return; flag(`${canvas.width}x${canvas.height}`, `at ${t().toFixed(0)}`); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  return {
    resize([w, h]) {
      if (mo) replay(mo.takeRecords());
      canvas.width = w; canvas.height = h;
      mo?.takeRecords();                                                             // the deliberate pair's intermediate state is not interference
      size.width = canvas.width; size.height = canvas.height;
      events.push({ t: t(), type: 'backing', value: key(), deliberate: true }); flag(key(), `after a deliberate resize at ${t().toFixed(0)}`);
    },
    stop() {
      if (!running) return { events, violations };                                     // idempotent: a second stop() changes nothing
      running = false;
      if (mo) { replay(mo.takeRecords()); mo.disconnect(); }
      flag(`${canvas.width}x${canvas.height}`, 'at stop');
      if (document.visibilityState !== 'visible') violations.push(`hidden at stop (${document.visibilityState})`);
      if (!document.hasFocus()) violations.push('unfocused at stop');
      if (devicePixelRatio !== 1 && !violations.some(v => v.startsWith('devicePixelRatio'))) violations.push(`devicePixelRatio ${devicePixelRatio} at stop`);
      document.removeEventListener('visibilitychange', onVis); removeEventListener('blur', onBlur); removeEventListener('focus', onFocus); mq.removeEventListener('change', onDpr);
      return { events, violations };
    },
  };
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
