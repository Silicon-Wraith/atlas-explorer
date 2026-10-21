// Portable status words. Numeric codes and bit positions are the B00 / §9.1 contract.
import { deepFreeze } from '../../shared/scene.js';

export const POINT_STATUS = Object.freeze({ escaped: 0, notEscaped: 1, numericalFailure: 2 });
export const RAY_STATUS = Object.freeze({ hit: 0, miss: 1, unresolved: 2, numericalFailure: 3 });
export const UNRESOLVED_REASON = Object.freeze({ none: 0, pointBudget: 1, estimateUnavailable: 2, rayStepBudget: 3, stagnation: 4 });
export const STAGNATION = Object.freeze({ none: 0, rayParameter: 1, fieldCoordinate: 2 });
export const NORMAL_STATUS = Object.freeze({ available: 0, unavailable: 1 });
export const LIGHTING_FAILURE_FLAGS = Object.freeze({ shadow: 1, ao: 2 });
export const ESTIMATOR_CATEGORIES = Object.freeze(['exact-distance', 'heuristic']);
export const LEGEND = deepFreeze({ unresolved: [1, 0, 1], numericalFailure: [1, 0, 0], unavailableNormal: [0.5, 0.5, 0.5] });
// Indexed by the numeric code; labels are deliberately separate from JavaScript member names.
export const STATUS_LABELS = deepFreeze({
  point: ['escaped', 'not escaped within iteration budget', 'numerical failure'],
  ray: ['approximate hit', 'miss', 'unresolved', 'numerical failure'],
  reason: ['none', 'point-budget', 'estimate-unavailable', 'ray-step-budget', 'stagnation'],
  subreason: ['none', 'ray-parameter', 'field-coordinate'], normal: ['available', 'unavailable'],
});

function integer(value, max, label) {
  if (!Number.isInteger(value) || value < 0 || value > max) throw new RangeError(`${label} must be an integer in [0, ${max}]`);
  return value;
}
function codes({ status, reason, subreason }) {
  integer(status, 3, 'status'); integer(reason, 4, 'reason'); integer(subreason, 2, 'subreason');
}
export function packStatus({ status, reason, subreason, steps }) {
  codes({ status, reason, subreason }); integer(steps, 2 ** 20 - 1, 'steps');
  return (status | reason << 4 | subreason << 8 | steps << 12) >>> 0;
}
export function unpackStatus(word) {
  integer(word, 0xffffffff, 'status word');
  return { status: word & 15, reason: word >>> 4 & 15, subreason: word >>> 8 & 15, steps: word >>> 12 };
}
export function packLightingStatus({ shadow, ao }) {
  let word = 0;
  for (const [failure, flag, shift] of [[shadow, 1, 2], [ao, 2, 12]]) {
    if (failure === null) continue;
    if (!failure || ![RAY_STATUS.unresolved, RAY_STATUS.numericalFailure].includes(failure.status)) throw new RangeError('lighting records only unresolved or numerical failures');
    codes(failure);
    word |= flag | failure.status << shift | failure.reason << (shift + 2) | failure.subreason << (shift + 6);
  }
  return word >>> 0;
}
export function unpackLightingStatus(word) {
  integer(word, 0xffffffff, 'lighting word');
  const failure = (flag, shift) => word & flag ? { status: word >>> shift & 3, reason: word >>> (shift + 2) & 15, subreason: word >>> (shift + 6) & 15 } : null;
  return { shadow: failure(1, 2), ao: failure(2, 12) };
}
// Reference for B11's per-sample AO reduction. No failure sample counts are encoded.
export function reduceLightingFailures(failures) {
  if (!Array.isArray(failures)) throw new TypeError('failures must be an array');
  let result = null, numericalFailure = false;
  for (const failure of failures) {
    if (failure === null) continue;
    if (!failure || ![RAY_STATUS.unresolved, RAY_STATUS.numericalFailure].includes(failure.status)) throw new RangeError('lighting records only unresolved or numerical failures');
    codes(failure);
    if (failure.status === RAY_STATUS.numericalFailure) numericalFailure = true;
    else if (!result || failure.reason < result.reason || (failure.reason === result.reason && failure.subreason < result.subreason)) result = { ...failure };
  }
  if (numericalFailure) return { status: RAY_STATUS.numericalFailure, reason: UNRESOLVED_REASON.none, subreason: STAGNATION.none };
  return result;
}
export function wgslConstants() {
  const enums = { POINT_STATUS, RAY_STATUS, UNRESOLVED_REASON, STAGNATION, NORMAL_STATUS, LIGHTING_FAILURE_FLAGS };
  return Object.entries(enums).flatMap(([group, members]) => Object.entries(members).map(([member, value]) =>
    `const ${group}_${member.replace(/[A-Z]/g, letter => `_${letter}`).toUpperCase()}: u32 = ${value}u;`)).join('\n') + '\n';
}
