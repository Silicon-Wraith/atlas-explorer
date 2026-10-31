// GPU-independent live pose/admission. scene-adapter.js owns portable scene files.
import { canonicalJson, deepFreeze, isPlainObject, requireObject } from '../../shared/scene.js';
import { worldReference } from './contract.js';

export const PREPARED_CONVENTION = 'atlas-prepared-yup-metres-v1';
export const PREPARED_CAMERA_KIND = 'prepared-pose-v1';
export const PREPARED_DEFAULT_FOV = 2 * Math.atan(1 / 1.3) * 180 / Math.PI;
const fields = ['kind', 'conventions', 'world', 'originM', 'positionLocalM', 'orientationWxyz', 'bodyDiameterM', 'verticalFovDegrees'];
const vector = (value, n, name) => {
  if (!Array.isArray(value) || value.length !== n || !value.every(Number.isFinite)) throw new TypeError(`${name} requires ${n} finite components`);
  return [...value];
};

// The camera's canonical forward is -Z; movement/rendering use Y-up world axes.
export function preparedOrientation(yaw, pitch) {
  if (![yaw, pitch].every(Number.isFinite) || Math.abs(pitch) > Math.PI / 2) throw new RangeError('finite yaw/pitch within the prepared camera range required');
  const y = (yaw + Math.PI) / 2, p = pitch / 2;
  return [Math.cos(y) * Math.cos(p), Math.cos(y) * Math.sin(p), Math.sin(y) * Math.cos(p), -Math.sin(y) * Math.sin(p)];
}
export function preparedForward(pose) {
  const [w, x, y, z] = pose.orientationWxyz;
  return [-2 * (x * z + w * y), 2 * (w * x - y * z), 2 * (x * x + y * y) - 1];
}
// A restored quaternion also owns the image's up direction (including roll).
export function preparedUp(pose) {
  const [w, x, y, z] = pose.orientationWxyz;
  return [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)];
}

export function createPreparedPoseModel({ world, grid, fineBounds }) {
  const reference = worldReference(world), { origin, diameter: D, axes, domain, spacing } = grid.config;
  const originM = [...origin], fineD = D / 4;
  const fine = { min: vector(fineBounds.min, 3, 'fine min'), max: vector(fineBounds.max, 3, 'fine max') };
  if (fine.min.some((x, i) => x >= fine.max[i])) throw new RangeError('ordered fine bounds required');
  const localBounds = { min: [], max: [] };
  for (let k = 0; k < 3; k++) {
    localBounds.min[k] = spacing * D * axes.reduce((sum, axis, i) => sum + Math.min(axis[k] * domain[i][0], axis[k] * domain[i][1]), 0) - D;
    localBounds.max[k] = spacing * D * axes.reduce((sum, axis, i) => sum + Math.max(axis[k] * domain[i][0], axis[k] * domain[i][1]), 0) + D;
  }
  // Conservative bound for adding/subtracting the bounded local offset. This
  // finite control does not claim the implicit camera's arbitrary precision.
  const roundoffBoundM = 4 * Number.EPSILON * (1 + Math.max(...originM.map(Math.abs)) + Math.max(...[...localBounds.min, ...localBounds.max].map(Math.abs)));
  if (roundoffBoundM >= 1e-8 * fineD) throw new RangeError('prepared origin/scale exceeds the finite numerical budget');
  function validate(input) {
    requireObject(input, 'prepared pose', fields);
    if (input.kind !== PREPARED_CAMERA_KIND || input.conventions !== PREPARED_CONVENTION) throw new RangeError('unsupported prepared camera convention');
    if (canonicalJson(input.world) !== canonicalJson(reference)) throw new RangeError('prepared pose world mismatch');
    const anchor = vector(input.originM, 3, 'origin'), local = vector(input.positionLocalM, 3, 'local position');
    if (anchor.some((x, i) => x !== originM[i])) throw new RangeError('prepared pose must retain its canonical origin');
    if (local.some((x, i) => x < localBounds.min[i] || x > localBounds.max[i])) throw new RangeError('pose outside finite prepared domain');
    if (![D, fineD].includes(input.bodyDiameterM)) throw new RangeError('unsupported prepared body diameter');
    if (!Number.isFinite(input.verticalFovDegrees) || input.verticalFovDegrees < 10 || input.verticalFovDegrees > 120) throw new RangeError('prepared FOV must be in [10, 120] degrees');
    const orientation = vector(input.orientationWxyz, 4, 'orientation'), norm = Math.hypot(...orientation);
    if (Math.abs(norm - 1) > 1e-6) throw new RangeError('prepared orientation must be unit length');
    const sign = orientation.find(x => x !== 0) < 0 ? -1 : 1;
    if (input.bodyDiameterM === fineD && local.some((x, i) => {
      const absolute = originM[i] + x, radius = .501 * fineD + roundoffBoundM;
      return absolute - radius < fine.min[i] || absolute + radius > fine.max[i];
    })) throw new RangeError('fine pose outside its prepared formation');
    return deepFreeze({ kind: PREPARED_CAMERA_KIND, conventions: PREPARED_CONVENTION, world: { ...reference }, originM: anchor,
      positionLocalM: local, orientationWxyz: orientation.map(x => x === 0 ? 0 : sign * x),
      bodyDiameterM: input.bodyDiameterM, verticalFovDegrees: input.verticalFovDegrees });
  }
  function create(values = {}) {
    if (!isPlainObject(values) || Object.keys(values).some(key => !fields.includes(key))) throw new TypeError('known prepared pose fields required');
    return validate({ kind: PREPARED_CAMERA_KIND, conventions: PREPARED_CONVENTION, world: reference, originM,
      positionLocalM: [0, 0, 0], orientationWxyz: preparedOrientation(0, 0), bodyDiameterM: D, verticalFovDegrees: PREPARED_DEFAULT_FOV, ...values });
  }
  function supportsPositionM(position, bodyDiameterM) {
    if (!Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite) || ![D, fineD].includes(bodyDiameterM)) return false;
    if (position.some((x, i) => x - originM[i] < localBounds.min[i] || x - originM[i] > localBounds.max[i])) return false;
    const radius = .501 * fineD + roundoffBoundM;
    return bodyDiameterM !== fineD || position.every((x, i) => {
      const absolute = originM[i] + (x - originM[i]);
      return absolute - radius >= fine.min[i] && absolute + radius <= fine.max[i];
    });
  }
  return Object.freeze({ D, fineD, reference, originM: deepFreeze(originM), localBounds: deepFreeze(localBounds), roundoffBoundM, create, validate,
    supportsPositionM, positionM: pose => pose.positionLocalM.map((x, i) => originM[i] + x),
    withPositionM(pose, position, patch = {}) { vector(position, 3, 'absolute position'); return create({ ...pose, ...patch, positionLocalM: position.map((x, i) => x - originM[i]) }); },
  });
}
