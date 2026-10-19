import {
  ARITH_STATUS, RAY_STATUS, UNRESOLVED_REASON, assertArithmeticStatus
} from '../contract.js';
import { add, scale, norm, checkRay } from './camera.js';
import { sphereInterval } from './geometry.js';
import { bulb } from './bulb.js';

const [ESCAPED,BUDGET,ARITH_FAILURE] = ARITH_STATUS;
const [HIT,MISS,UNRESOLVED,FAILURE] = RAY_STATUS;
const [POINT,STEPS] = UNRESOLVED_REASON;

const draft = {
  W: 640, H: 360, iterations: 64, steps: 256,
  k: .9, floor: 1e-6, factor: .5
};
const settled = {
  W: 1280, H: 720, iterations: 128, steps: 512,
  k: .9, floor: 1e-6, factor: .5
};

export const profiles = Object.freeze(Object.fromEntries(Object.entries({
  draft,
  settled,
  stress: { ...draft, k: .25, floor: 1e-7, factor: 0 },
  g3: { ...settled, iterations: 0, k: 1, floor: 1e-6, factor: 0 },
  precision: { ...settled, floor: 0, factor: .005 },
  precisionTight: { ...settled, floor: 0, factor: .0005 },
  anchor: {
    ...settled, iterations: 256, steps: 4096,
    k: .5, floor: 1e-13, factor: 0
  },
  anchorTight: {
    ...settled, iterations: 256, steps: 4096,
    k: .5, floor: 1e-15, factor: 0
  }
}).map(([key,value]) => [key,Object.freeze(value)])));

export const angularPixelSize = profile =>
  2*Math.tan(Math.PI/6)/profile.H;

export const tolerance = (profile,t) =>
  Math.max(profile.floor,profile.factor*angularPixelSize(profile)*t);

const result = (status,t,steps,reason=null) =>
  ({ status, t, steps, reason });

export function trace(ray,profile,field,range) {
  checkRay(ray);
  if (!range || range[1] < Math.max(0,range[0])) {
    return result(MISS,null,0);
  }
  if (!range.every(Number.isFinite)) {
    throw new RangeError('finite tracing interval required');
  }

  let t = Math.max(0,range[0]);
  for (let step=0; step<profile.steps; step++) {
    if (t > range[1]) return result(MISS,null,step);
    const value = field(add(ray.origin,scale(ray.direction,t)));
    assertArithmeticStatus(value);

    if (value.status === BUDGET) return result(UNRESOLVED,t,step+1,POINT);
    if (value.status === ARITH_FAILURE) return result(FAILURE,t,step+1);
    if (!Number.isFinite(value.de)) throw new Error('invalid CPU distance');
    if (value.de < tolerance(profile,t)) return result(HIT,t,step+1);

    t += profile.k*value.de;
    if (!Number.isFinite(t)) throw new Error('double marcher overflow');
  }

  return t > range[1]
    ? result(MISS,null,profile.steps)
    : result(UNRESOLVED,t,profile.steps,STEPS);
}

export function traceBulb(ray,profile,visit) {
  return trace(
    ray, profile,
    p => bulb(p,profile.iterations,visit),
    sphereInterval(ray.origin,ray.direction,1.25)
  );
}

export function normalBulb(ray,hit,profile,visit) {
  if (hit.status !== HIT) return { available: false, normal: null };

  const p = add(ray.origin,scale(ray.direction,hit.t));
  const eps = .5*tolerance(profile,hit.t);
  const gradient = [];
  if (!(eps > 0)) return { available: false, normal: null };

  let available = true;
  for (let axis=0; axis<3; axis++) {
    const a = [...p];
    const b = [...p];
    a[axis] += eps;
    b[axis] -= eps;
    const x = bulb(a,profile.iterations,visit);
    const y = bulb(b,profile.iterations,visit);
    if (x.status !== ESCAPED || y.status !== ESCAPED) {
      available = false;
      gradient.push(0);
    } else {
      gradient.push((x.de-y.de)/(2*eps));
    }
  }

  if (
    !available || !gradient.every(Number.isFinite) ||
    !(Math.hypot(...gradient) > 0)
  ) {
    return { available: false, normal: null };
  }
  return { available: true, normal: norm(gradient) };
}
