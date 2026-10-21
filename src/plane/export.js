// Immutable Plane image export (spec §14). The request is captured and the renderer reserved
// synchronously, before the first asynchronous wait. The lease covers admission, rendering,
// coloring and encoding; live edits during it change only the live scene.
// The export job reports from reservation to its terminal stage: every outcome — admission,
// render or encoding failure, or success — has a job report that matches it. The render
// stage's own report is kept separately as `renderReport`.
export const EXPORT_LIMITS = Object.freeze({ admissionMs: 60_000, renderMs: 120_000, encodeMs: 30_000 });
export const EXPORT_STAGES = Object.freeze(['reserved', 'admission', 'render-submitted', 'encoding', 'finished']);

class ExportTimeout extends Error {
  constructor(stage) { super(`${stage} exceeded its time limit`); this.name = 'ExportTimeout'; }
}
function within(promise, ms, stage) {
  let timer;
  return Promise.race([Promise.resolve(promise), new Promise((_, reject) => { timer = setTimeout(() => reject(new ExportTimeout(stage)), ms); })]).finally(() => clearTimeout(timer));
}

// hooks (tests and diagnostics only): stage(name) is called synchronously as each stage
// begins; its exceptions are isolated from the job and the lease, and collected as diagnostics in
// the result's `hookErrors` so a broken observer never passes unnoticed (plan amendment F,
// finalized in T08 fix round 1). hold(name) may return a promise the stage waits for (bounded by
// that stage's limit).
// → { request, done: Promise<{ outcome, reason, blob?, report, renderReport?, request, deferredScene, hookErrors }> }
export function startExport({ adapter, request, encode, limits = EXPORT_LIMITS, hooks = {} }) {
  const lease = adapter.reserveExclusive(request);
  const job = lease.jobReport;
  const hookErrors = [];
  const stage = name => {
    try { hooks.stage?.(name); }
    catch (error) { hookErrors.push(Object.freeze({ stage: name, message: error?.message || String(error) })); }
  };
  stage('reserved');
  const done = (async () => {
    let result, renderReport = null;
    const finish = (outcome, reason, extra = {}) => ({ outcome, reason, ...extra, report: job.finish(outcome, { reason, completed: renderReport?.completed ?? null, details: { renderReportId: renderReport?.reportId ?? null, deviceLost: lease.lost(), retired: adapter.retired } }) });
    const LOST = 'the graphics device was lost during the export; nothing was published';
    try {
      stage('admission');
      await within(Promise.resolve(hooks.hold?.('admission')), limits.admissionMs, 'admission');
      const admitted = await lease.admit({ timeoutMs: limits.admissionMs });
      // A deadline reports its own cause even if device loss happened while waiting.
      if (!admitted.ok) result = finish('interrupted', admitted.reason);
      else if (lease.lost()) result = finish('interrupted', LOST);
      else {
        job.mark('admitted'); job.mark('submitted');
        const rendering = lease.render({ timeoutMs: limits.renderMs });
        stage('render-submitted');
        renderReport = await rendering;
        // The lease classifies render stops, including timeouts, before returning its report.
        // A completed render still needs a loss check across this asynchronous boundary.
        if (renderReport.outcome !== 'completed') result = finish(renderReport.outcome, renderReport.reason, { renderReport });
        else if (lease.lost()) result = finish('interrupted', LOST, { renderReport });
        else if (!lease.current()) result = finish('interrupted', 'the renderer was retired during the export', { renderReport });
        else {
          job.mark('completed');
          stage('encoding');
          try {
            const blob = await within((async () => { await hooks.hold?.('encoding'); return encode(lease.canvas); })(), limits.encodeMs, 'image encoding');
            if (lease.lost()) result = finish('interrupted', LOST, { renderReport });
            else if (blob) { job.mark('published'); result = finish('completed', '', { blob, renderReport }); }
            else result = finish('failed', 'Image export is unavailable.', { renderReport });
          } catch (error) {
            const timedOut = error instanceof ExportTimeout;
            if (timedOut) lease.retire();
            result = !timedOut && lease.lost() ? finish('interrupted', LOST, { renderReport }) : finish(timedOut ? 'interrupted' : 'failed', error?.message || String(error), { renderReport });
          }
        }
      }
    } catch (error) {
      const timedOut = error instanceof ExportTimeout;
      if (timedOut) lease.retire();
      result = !timedOut && lease.lost() ? finish('interrupted', LOST, { renderReport }) : finish(timedOut ? 'interrupted' : 'failed', error?.message || String(error), { renderReport });
    }
    stage('finished');
    return { ...result, request, deferredScene: lease.release(), hookErrors: Object.freeze([...hookErrors]) };
  })();
  return { request, done };
}
