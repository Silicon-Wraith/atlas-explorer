// The only route to Plane's renderer (spec §7, §14). It wraps GpuRenderer/CpuRenderer
// unchanged, turns each render into an outcome and a report, and grants an exclusive lease
// for exports. Scheduling and cadence stay in the Plane workspace.
// Production callers must await each interactive render before starting another.
// whenIdle() and lease.admit() drain that single active render; T08's busy guard must
// preserve this precondition. Overlapping fakes only exercise stale-result rejection.
//
// Every publication belongs to a complete immutable request describing the published scene:
// completed geometry shown with a newer appearance is reported under a new publication request
// that names the request which computed the geometry (`geometryRequestId`), however many recolors
// follow. Publication is checked here, after the renderer finishes: the adapter never adopts a
// stale completion. (A renderer that draws without checking can still change pixels; the
// production renderers check `isCurrent` before they write — tests/unit/renderer-guards.test.js.)
import { createReportBuilder, observed, PLANE_INAPPLICABLE_FIELDS } from '../shared/render-report.js';
import { createRenderRequest, isPublishable, RUNTIME_ID } from '../shared/render-request.js';
import { fnv1a64, canonicalJson } from '../shared/scene.js';
import { toPlaneState, sceneCodec, planeDependencies } from './scene-adapter.js';
import { createFence, awaitFence, CompletionError } from './completion.js';

let requestCounter = 0;

// A frozen Plane request. The geometry key includes the output size, because the rendered
// field depends on it; the appearance key covers palette, phase, frequency and relief.
// Identities carry the runtime namespace, so they never collide across reloads or tabs.
export function createPlaneRequest({ scene, purpose, width, height, generation, viewId = 'plane-main', runtimeId = RUNTIME_ID }) {
  const n = ++requestCounter;
  const dependencies = planeDependencies(scene);
  return createRenderRequest({
    requestId: `plane-${purpose}-${runtimeId}-${n}`, jobId: `plane-job-${runtimeId}-${n}`, viewId,
    sceneSnapshot: scene, sceneHash: sceneCodec.fingerprint(scene).sceneHash,
    output: { width, height, purpose },
    quality: { iterations: toPlaneState(scene).settings.iterations, fullResolution: purpose === 'export' },
    generation,
    keys: { geometryKey: fnv1a64(`${dependencies.geometry}|${width}x${height}`), appearanceKey: fnv1a64(dependencies.appearance) },
  });
}

// The same key createPlaneRequest derives from a scene's appearance.
export const appearanceKeyOf = ({ palette, phase, frequency, relief }) => fnv1a64(canonicalJson({ palette, phase, frequency, relief }));

export class LeaseError extends Error {
  constructor(message) { super(message); this.name = 'LeaseError'; this.code = 'renderer-unavailable'; }
}

function bounded(promise, timeoutMs) {
  let timer;
  return Promise.race([
    promise.then(value => ({ settled: true, value }), error => ({ settled: true, error })),
    new Promise(resolve => { timer = setTimeout(() => resolve({ settled: false }), timeoutMs); }),
  ]).finally(() => clearTimeout(timer));
}

// Geometry stays publishable while the device epoch and geometry revision match; appearance
// edits do not invalidate it (they are rebound at publication).
const geometryCurrent = (request, generation) => generation.deviceEpoch === request.generation.deviceEpoch && generation.geometryRevision === request.generation.geometryRevision;

export function createPlaneRenderAdapter({ renderer, clock }) {
  if (typeof clock !== 'function') throw new TypeError('createPlaneRenderAdapter requires a clock');
  // published: the image on the canvas — { request (the current publication), geometry (the request
  // that computed it), report (the publication's report), ticket (its completion fence) } | null.
  // It is the authoritative provenance of the displayed image: a lost context, a retirement, a
  // replacement clear it, and every non-null report describes the image actually retained.
  // unavailable: the graphics context was lost and the renderer has not been replaced yet.
  let current = renderer, epoch = 0, losses = 0, retired = false, unavailable = false, inFlight = null, lease = null, deferredScene = null, published = null;

  // Completion tickets (plan amendment G(3)): one fence per publication, created right after its
  // final colour pass and bound to the report, the renderer and its context, the device epoch and
  // the loss count. Only the current publication's fence is kept: a superseded fence is deleted when
  // the renderer, context and loss count are unchanged (supersession, retirement, a healthy
  // replacement) and dropped untouched once the context was lost. Tickets are remembered per report
  // (weakly) so a completion asked for after the fact can still tell interruption from supersession.
  const tickets = new WeakMap();
  const ticketFor = (report, renderer) => ({ report, renderer, gl: renderer.gl, sync: createFence(renderer.gl), deviceEpoch: epoch, losses, dropped: null });
  function dropPublication(reason = 'superseded') {
    const ticket = published?.ticket;
    if (ticket) {
      if (ticket.sync && ticket.renderer === current && ticket.losses === losses && !ticket.gl.isContextLost?.()) ticket.gl.deleteSync(ticket.sync);
      ticket.sync = null; ticket.dropped = reason;
    }
    published = null;
  }
  function publish(request, geometry, report, renderer = current) {
    dropPublication();
    published = { request, geometry, report, ticket: ticketFor(report, renderer) };
    tickets.set(report, published.ticket);
    return report;
  }

  const environment = renderer => ({
    backend: observed(renderer.mode, 'renderer.mode'),
    device: observed(renderer.diagnostics?.device, renderer.gl ? 'WebGL renderer string' : 'CPU fallback diagnostics'),
    browser: observed(globalThis.navigator?.userAgent, 'navigator.userAgent'),
  });
  // Capture the job's renderer now, but observe its diagnostics when the report finishes.
  const builderFor = (request, renderer = current) => createReportBuilder(request, {
    implementation: renderer.gl ? 'plane-webgl2-v1' : 'plane-cpu-v1', environment: () => environment(renderer),
    workspaceFields: { ...PLANE_INAPPLICABLE_FIELDS, iterations: toPlaneState(request.sceneSnapshot).settings.iterations }, clock,
  });
  // The request a publication belongs to: the original, or a newer one with the live appearance.
  function publicationFor(request, scene, generation) {
    if (sceneCodec.equal(scene, request.sceneSnapshot) && isPublishable(request, generation)) return request;
    return createPlaneRequest({ scene, purpose: request.output.purpose, width: request.output.width, height: request.output.height, generation, viewId: request.viewId });
  }

  function requireUsable() {
    if (retired) throw new LeaseError('the renderer was retired after a timeout; replace it first');
    if (unavailable) throw new LeaseError('the graphics context was lost; the renderer is unavailable until it is replaced');
  }

  // Interactive render. `currentGeneration()` and `liveScene()` describe the workspace now;
  // `isCurrent()` is the workspace's own cadence check.
  function render(request, { isCurrent = () => true, currentGeneration, liveScene }) {
    requireUsable();
    if (lease) throw new LeaseError('the renderer is reserved for an export');
    const builder = builderFor(request), myEpoch = epoch, renderer = current;
    const { view, settings } = toPlaneState(request.sceneSnapshot);
    const stillCurrent = () => {
      // Renderers may call this from a worker callback: an exception must not strand its promise.
      try { return myEpoch === epoch && isCurrent() && geometryCurrent(request, currentGeneration()); }
      catch { return false; }
    };
    builder.mark('admitted');
    const run = (async () => {
      try {
        builder.mark('submitted');
        await renderer.render(view, settings, request.output.width, request.output.height, false, stillCurrent);
        builder.mark('completed');
        if (myEpoch !== epoch) return builder.finish('interrupted', { reason: 'the renderer was replaced during the render' });
        if (!stillCurrent()) return builder.finish('superseded', { reason: 'completed after a newer view was requested; not adopted' });
        const scene = liveScene();
        if (planeDependencies(scene).geometry !== planeDependencies(request.sceneSnapshot).geometry) return builder.finish('superseded', { reason: 'the live geometry changed; not adopted' });
        const publication = publicationFor(request, scene, currentGeneration());
        renderer.color(toPlaneState(scene).settings);
        builder.mark('published');
        return publish(publication, request, builder.finish('completed', { completed: { width: renderer.canvas.width, height: renderer.canvas.height }, publication: publication === request ? null : publication }), renderer);
      } catch (error) {
        if (myEpoch !== epoch) return builder.finish('interrupted', { reason: 'the graphics context was lost or the renderer replaced during the render' });
        if (error?.name === 'AbortError') return builder.finish('superseded', { reason: 'a newer view was requested' });
        // A failure may have resized the canvas or reallocated the field before it was raised: the
        // retained image's validity is no longer established, so nothing is described.
        if (renderer === current) dropPublication('failed');
        return builder.finish('failed', { reason: error?.message || String(error) });
      }
    })();
    const tracked = run.finally(() => { if (inFlight === tracked) inFlight = null; });
    inFlight = tracked;
    return run;
  }

  // An appearance edit on the published geometry. → { status: 'applied', report } (a completed
  // report for the new publication), { status: 'deferred' } during an export lease, or
  // { status: 'retired' }. Before anything is published, it only recolors. While a different
  // geometry is still rendering, the retained geometry is republished with the live appearance:
  // the report names the image actually on the canvas, not the scene the explorer is heading to.
  function recolor(scene, generation) {
    if (lease) { deferredScene = scene; return { status: 'deferred', report: null }; }
    if (retired) return { status: 'retired', report: null };
    if (unavailable) return { status: 'unavailable', report: null };
    current.color(toPlaneState(scene).settings);
    if (!published) return { status: 'applied', report: null };
    const geometryRequest = published.geometry, retained = geometryRequest.sceneSnapshot;
    const displayed = planeDependencies(scene).geometry === planeDependencies(retained).geometry ? scene : { ...retained, appearance: scene.appearance };
    const publication = createPlaneRequest({ scene: displayed, purpose: published.request.output.purpose, width: current.canvas.width, height: current.canvas.height, generation, viewId: geometryRequest.viewId });
    const builder = builderFor(geometryRequest);
    builder.mark('published');
    return { status: 'applied', report: publish(publication, geometryRequest, builder.finish('completed', { completed: { width: current.canvas.width, height: current.canvas.height }, publication, reason: 'appearance applied to completed geometry' })) };
  }

  // GPU completion of one publication (plan amendment G(3)). `timeoutMs` is the one bound for the
  // whole wait (finite; a non-positive bound is already exhausted). Resolves once the fence created
  // at that publication signals; rejects 'interrupted' when the device was lost, retired or replaced
  // since that publication (its captured identity is checked first, and again after the fence
  // signals), 'superseded' when a newer publication replaced it (never switching to the newer one),
  // 'timeout' when the bound is exhausted. The CPU fallback paints synchronously, so its publication
  // is complete as soon as it is published. Evidence carries the identities captured at publication.
  // → frozen { reportId, requestId, deviceEpoch, source, clock, completedAt, polls, waitMs }
  async function completion(report, { timeoutMs, now = () => clock(), yieldTask } = {}) {
    if (!Number.isFinite(timeoutMs)) throw new RangeError('completion needs a finite bound');
    const ticket = tickets.get(report);
    if (!ticket) throw new CompletionError('this report was never published by this adapter', 'interrupted');
    const still = () => {
      if (ticket.renderer !== current || ticket.deviceEpoch !== epoch || ticket.losses !== losses || ticket.gl?.isContextLost?.() || ticket.dropped === 'failed') throw new CompletionError('the graphics device was lost, retired or replaced since this publication', 'interrupted');
      if (ticket.dropped || published?.ticket !== ticket) throw new CompletionError('this publication was superseded', 'superseded');
    };
    still();
    if (timeoutMs <= 0) throw new CompletionError('no time remains for GPU completion', 'timeout');
    const evidence = (source, polls, waitMs) => Object.freeze({ reportId: report.reportId, requestId: report.requestId, deviceEpoch: ticket.deviceEpoch, source, clock: 'page-performance-now', completedAt: clock(), polls, waitMs });
    if (!ticket.gl) return evidence('synchronous-paint', 0, 0);
    const { polls, waitMs } = await awaitFence({ gl: ticket.gl, sync: ticket.sync, ms: timeoutMs, stillValid: still, now, yieldTask });
    still(); // the final asynchronous boundary: a loss between the signal and this continuation
    return evidence('queue-completion', polls, waitMs);
  }

  function cancelInteractive() { if (!lease) current.cancel?.(); }

  async function whenIdle({ timeoutMs }) {
    if (!inFlight) return true;
    return (await bounded(inFlight, timeoutMs)).settled;
  }

  function retire() { retired = true; epoch++; dropPublication('retired'); }

  // Synchronous: called before the export's first await, so no live work can slip ahead.
  function reserveExclusive(request) {
    requireUsable();
    if (lease) throw new LeaseError('an export already holds the renderer');
    const own = { request }, reservedEpoch = epoch, reservedLosses = losses;
    lease = own;
    const active = () => { if (lease !== own) throw new LeaseError('this lease was released'); };
    return Object.freeze({
      request,
      get canvas() { return current.canvas; },
      // false once the device was lost or the renderer retired since reservation.
      current: () => epoch === reservedEpoch && !retired,
      // true once the graphics context was lost since reservation (a cause, distinct from retirement).
      lost: () => losses !== reservedLosses,
      // A report builder for the whole export job, started now (at reservation).
      jobReport: builderFor(request),
      async admit({ timeoutMs }) {
        active();
        if (!inFlight) return { ok: true };
        const settled = (await bounded(inFlight, timeoutMs)).settled;
        if (!settled) { retire(); return { ok: false, reason: 'the interactive render did not drain in time; the renderer was retired' }; }
        return { ok: true };
      },
      // The render stage alone; the export job's own report is produced by plane/export.js.
      async render({ timeoutMs }) {
        active(); requireUsable();
        const builder = builderFor(request), renderer = current, myEpoch = epoch;
        const { view, settings } = toPlaneState(request.sceneSnapshot);
        builder.mark('admitted'); builder.mark('submitted');
        const outcome = await bounded(renderer.render(view, settings, request.output.width, request.output.height, true, () => myEpoch === epoch), timeoutMs);
        if (!outcome.settled) { retire(); return builder.finish('interrupted', { reason: 'the export render exceeded its time limit; the renderer was retired' }); }
        // The captured epoch is checked before the result is classified or anything is colored.
        if (myEpoch !== epoch) return builder.finish('interrupted', { reason: 'the graphics context was lost during the export render' });
        if (outcome.error) {
          if (outcome.error.name !== 'AbortError') dropPublication('failed'); // see the interactive failure path
          return builder.finish(outcome.error.name === 'AbortError' ? 'interrupted' : 'failed', { reason: outcome.error.message });
        }
        builder.mark('completed');
        renderer.color(settings);
        builder.mark('published');
        // The canvas now shows the export image: that is the publication until the next render.
        return publish(request, request, builder.finish('completed', { completed: { width: renderer.canvas.width, height: renderer.canvas.height } }), renderer);
      },
      retire() { active(); retire(); },
      // → the latest live scene deferred during the lease, or null.
      release() {
        if (lease !== own) return null;
        lease = null;
        const scene = deferredScene;
        deferredScene = null;
        return scene;
      },
    });
  }

  // A lost graphics context: nothing rendered before it is publishable, an export holding the lease
  // can no longer complete, and nothing — render, recolor or export — may use the renderer until
  // replaceRenderer(). Releasing a lease does not restore it.
  function invalidate() { epoch++; losses++; dropPublication('lost'); unavailable = true; }

  return Object.freeze({
    render, recolor, cancelInteractive, whenIdle, reserveExclusive, invalidate, completion,
    get reserved() { return lease !== null; },
    get retired() { return retired; },
    get unavailable() { return unavailable; },
    get epoch() { return epoch; },
    get renderer() { return current; },
    // The request the canvas currently shows (null after an export, a loss or a replacement).
    get published() { return published?.request ?? null; },
    // The displayed image's provenance: { request, report } or null when nothing describable is shown.
    get publication() { return published ? { request: published.request, report: published.report } : null; },
    replaceRenderer(next) { if (lease) throw new LeaseError('cannot replace the renderer during an export'); dropPublication('replaced'); current = next; retired = false; unavailable = false; epoch++; inFlight = null; },
  });
}
