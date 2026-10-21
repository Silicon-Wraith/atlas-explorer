import { arithmetic, derivativeUpdate, orbitResult } from './f32.js';

export function bulbOrbit(p, power, cap, { precision = 'f64', history = false } = {}) {
  const fail = () => ({ status: 'numerical failure', escapeIndex: null, estimateAvailable: false, log2DE: null });
  if (!Array.isArray(p) || p.length !== 3 || p.some(x => !Number.isFinite(x) || Math.abs(x) > (precision === 'f32' ? 2 ** 62 : 2 ** 510)) ||
      !Number.isInteger(power) || power < 2 || power > 8 || !Number.isInteger(cap) || cap < 1 || cap > 512) return fail();
  const { round, mul, add, norm } = arithmetic(precision), parameter = p.map(round);
  let z = [0, 0, 0], derivative = { zero: true, mantissa: 0, exponent: 0 };
  const orbit = history ? [[...z]] : null, derivatives = history ? [0] : null;
  for (let n = 1; n <= cap; n++) {
    const r = norm(z);
    // r <= 2 before every update; powers <= 8 and angles <= 8*pi are safe.
    const factor = mul(power, round(r ** (power - 1)));
    derivative = derivative && derivativeUpdate(derivative, factor, 1, precision);
    if (r === 0) z = [...parameter];
    else if (z[0] === 0 && z[1] === 0) {
      // Exact spherical limit; phi=0, sin(p*pi)=0 for integer powers.
      z = [parameter[0], parameter[1], add(round(z[2] ** power), parameter[2])];
    } else {
      const theta = round(Math.acos(Math.max(-1, Math.min(1, round(z[2] / r)))));
      const phi = round(Math.atan2(z[1], z[0]));
      const pt = mul(power, theta), pp = mul(power, phi), rp = round(r ** power);
      const st = round(Math.sin(pt));
      z = [add(mul(mul(rp, st), round(Math.cos(pp))), parameter[0]),
        add(mul(mul(rp, st), round(Math.sin(pp))), parameter[1]), add(mul(rp, round(Math.cos(pt))), parameter[2])];
    }
    if (history) { orbit.push([...z]); derivatives.push(derivative.zero ? 0 : derivative.mantissa * 2 ** derivative.exponent); }
    if (norm(z) > 2) return orbitResult('escaped', z, n, derivative, history ? { orbit, derivatives } : {});
  }
  return orbitResult('not escaped within iteration budget', z, null, derivative, history ? { orbit, derivatives } : {});
}
