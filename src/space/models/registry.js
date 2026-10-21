// Space model records (spec §11) and CPU camera classification (§13.3).
// Records carry admission metadata (B02's tagged SUPPORTED_DOMAINS) and estimator
// semantics only. They embed no validation record and claim no tested detail range:
// product validation records live in B02's registry and come from B04/B08 evidence.
import { SceneError } from '../../shared/scene.js';
import { SUPPORTED_DOMAINS } from '../numerics/validation-domains.js';
import { ESTIMATOR_CATEGORIES, POINT_STATUS } from '../render/status.js';
import { checkBudget } from './field.js';
import * as analytic from './analytic.js';
import * as menger from './menger.js';
import * as mandelbulb from './mandelbulb.js';
import * as quaternionJulia from './quaternion-julia.js';

// FieldResult status words → B00 point-status codes (status buffers use the codes).
export const FRACTAL_POINT_STATUS = Object.freeze({
  escaped: POINT_STATUS.escaped, 'not-escaped': POINT_STATUS.notEscaped, 'numerical-failure': POINT_STATUS.numericalFailure,
});

function record({ id, estimator, model, recurrenceVersion = null, initialization = null, escapeRule = null }) {
  if (!ESTIMATOR_CATEGORIES.includes(estimator.category)) throw new Error(`unknown estimator category ${estimator.category}`);
  return Object.freeze({
    id, version: 1, recurrenceVersion, initialization, escapeRule, supportedParameters: SUPPORTED_DOMAINS[id],
    estimator: Object.freeze(estimator), enclosingVolume: model.enclosingVolume, evaluate: model.evaluate,
    ...(model.trace ? { trace: model.trace } : {}),
  });
}

const exteriorOnly = (category, derivationVersion) => ({ category, semantics: 'exterior-only', derivationVersion });

export const MODEL_RECORDS = Object.freeze(Object.fromEntries([
  record({ id: 'sphere', model: analytic.sphere, estimator: { category: 'exact-distance', semantics: 'signed', derivationVersion: 'sphere-signed-distance-v1' } }),
  record({ id: 'box', model: analytic.box, estimator: exteriorOnly('exact-distance', 'rotated-box-exterior-distance-v1') }),
  record({ id: 'menger', model: menger, estimator: exteriorOnly('exact-distance', 'menger-box-union-exterior-distance-v1') }),
  record({
    id: 'mandelbulb', model: mandelbulb, estimator: exteriorOnly('heuristic', 'mandelbulb-scalar-derivative-log-de-v1'),
    recurrenceVersion: 'mandelbulb-zpolar-v1', initialization: 'z0 = 0; d0 = 0 (zero state)', escapeRule: '|z| > 2 after each update',
  }),
  record({
    id: 'quaternion-julia', model: quaternionJulia, estimator: exteriorOnly('heuristic', 'quaternion-julia-scalar-sensitivity-log-de-v1'),
    recurrenceVersion: 'quaternion-julia-full-square-v1', initialization: 'q0 = (x, y, z, kappa); d0 = 1',
    escapeRule: '|q| > R(C), outward-rounded from the effective C, at initialization and after each update',
  }),
].map(entry => [`${entry.id}@${entry.version}`, entry])));

export function getModel(id, version) {
  const key = `${id}@${version}`;
  if (!Object.hasOwn(MODEL_RECORDS, key)) throw new SceneError('unsupported-model', `unknown Space model ${key}`, 'model');
  return MODEL_RECORDS[key];
}

// Exterior iff an analytic field reports exterior applicability with a positive
// distance, or a fractal orbit escapes with an available estimate. Everything else
// is unresolved; unresolved never asserts interior membership (§13.3).
export function classifyCamera(model, effective, worldPosition, budget) {
  if (!model || typeof model.evaluate !== 'function') throw new TypeError('classifyCamera needs a model record');
  checkBudget(budget);
  const result = model.evaluate(effective, worldPosition, { maxIterations: budget });
  let reason;
  if (result.kind === 'analytic') {
    reason = result.validity !== 'valid' ? 'numerical-failure'
      : result.applicability === 'exterior' && result.distance > 0 ? 'exterior' : result.applicability;
  } else {
    reason = result.status === 'numerical-failure' ? 'numerical-failure'
      : result.status === 'not-escaped' ? 'not-escaped'
        : result.estimate.available ? 'exterior' : result.estimate.reason;
  }
  return Object.freeze({ status: reason === 'exterior' ? 'exterior' : 'unresolved', detail: Object.freeze({ reason, result }) });
}
