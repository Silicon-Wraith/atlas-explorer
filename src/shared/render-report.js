// Render reports (spec §7.4). Unavailable facts are marked unavailable, and fields that
// do not apply to a workspace are marked inapplicable rather than invented.
import { deepFreeze } from './scene.js';
import { RENDER_OUTCOMES } from './render-request.js';

export const UNAVAILABLE = 'unavailable';
export const INAPPLICABLE = 'inapplicable';
const EVENTS = Object.freeze(['admitted', 'submitted', 'completed', 'published', 'readback', 'preparing', 'prepared']);

// An identity field is { value, source } when observed, or 'unavailable'.
export function observed(value, source) {
  return typeof value === 'string' && value.trim() ? { value, source } : UNAVAILABLE;
}

let reportCounter = 0;

// environment may be an object or a thunk, evaluated once at finish so render-time
// diagnostics describe the job that ran rather than the preceding frame.
export function createReportBuilder(request, { implementation, environment = {}, workspaceFields = {}, clock }) {
  if (typeof clock !== 'function') throw new TypeError('createReportBuilder requires a clock');
  const requestedAt = clock();
  const marks = {};
  let finished = null;
  return Object.freeze({
    mark(event) {
      if (!EVENTS.includes(event)) throw new RangeError(`unknown report event ${event}`);
      if (marks[event] === undefined) marks[event] = clock() - requestedAt;
    },
    // `publication`: when completed geometry is published under a newer request (an appearance
    // edit), the report describes that request — the published scene — and records the request
    // that computed the geometry as `geometryRequestId`.
    finish(outcome, { reason = '', completed = null, publication = null, details = {} } = {}) {
      if (finished) return finished;
      if (!RENDER_OUTCOMES.includes(outcome)) throw new RangeError(`unknown outcome ${outcome}`);
      const described = publication ?? request;
      const observedEnvironment = typeof environment === 'function' ? environment() : environment;
      finished = deepFreeze({
        reportId: `report-${described.requestId}-${++reportCounter}`,
        sceneHash: described.sceneHash, requestId: described.requestId, jobId: described.jobId, viewId: described.viewId,
        geometryRequestId: request.requestId,
        purpose: described.output.purpose, model: { ...described.sceneSnapshot.model }, implementation,
        environment: { backend: observedEnvironment.backend ?? UNAVAILABLE, browser: observedEnvironment.browser ?? UNAVAILABLE, device: observedEnvironment.device ?? UNAVAILABLE },
        requested: { width: described.output.width, height: described.output.height, quality: described.quality },
        completed, outcome, reason,
        keys: { ...described.keys },
        appearanceRebound: described !== request,
        generation: described.generation,
        timings: { clock: 'page-performance-now', ...marks, gpu: UNAVAILABLE },
        ...workspaceFields, ...details,
      });
      return finished;
    },
  });
}

// Fields a Plane report never manufactures (spec §7.4).
export const PLANE_INAPPLICABLE_FIELDS = Object.freeze({
  rayTermination: INAPPLICABLE, unavailableNormals: INAPPLICABLE, estimator: INAPPLICABLE, samples: INAPPLICABLE,
});
