// A binary32 mirror of trace.wgsl's enclosing-interval and step-advance arithmetic (plan B10 fix round 1,
// B10-F1/F2). Every elementary operation rounds to nearest binary32 (an unfused evaluation, which WGSL
// permits); any intermediate that leaves the finite binary32 range sets `overflow`, which the kernel must
// never do (spec §10.2: after an overflow the WGSL value is indeterminate). Node-only, test support.
const F32_MAX = 3.4028234663852886e38;
export function f32Context() {
  const ctx = { overflow: false, ops: 0 };
  const r = x => { const v = Math.fround(x); ctx.ops++; if (!Number.isFinite(v)) ctx.overflow = true; return v; };
  ctx.r = r;
  ctx.add = (a, b) => r(a + b); ctx.sub = (a, b) => r(a - b); ctx.mul = (a, b) => r(a * b); ctx.div = (a, b) => r(a / b);
  ctx.sqrt = a => r(Math.sqrt(a));
  ctx.dot = (a, b) => ctx.add(ctx.add(ctx.mul(a[0], b[0]), ctx.mul(a[1], b[1])), ctx.mul(a[2], b[2]));
  ctx.cross = (a, b) => [ctx.sub(ctx.mul(a[1], b[2]), ctx.mul(a[2], b[1])), ctx.sub(ctx.mul(a[2], b[0]), ctx.mul(a[0], b[2])), ctx.sub(ctx.mul(a[0], b[1]), ctx.mul(a[1], b[0]))];
  ctx.position = (high, low, d, t) => high.map((h, i) => ctx.add(ctx.add(h, ctx.mul(t, d[i])), low[i]));
  return ctx;
}
export const F32 = Object.freeze({ MAX: F32_MAX });

const T_REACH = 2 ** 100, INFLATION = 2 ** -8, ROUNDING = 2 ** -17;
// Mirror of enclosing_sphere (kind 0 ordinary, 1 empty, 2 invalid).
export function enclosingSphere(high, low, d, radius) {
  const c = f32Context(), abs3 = v => c.add(c.add(Math.abs(v[0]), Math.abs(v[1])), Math.abs(v[2]));
  const extent = abs3(high), margin = c.add(c.add(c.mul(INFLATION, radius), abs3(low)), c.mul(ROUNDING, c.add(extent, radius)));
  const r = c.add(radius, margin), dd = c.dot(d, d), p = c.cross(high, d);
  const disc = c.sub(c.mul(dd, c.mul(r, r)), c.dot(p, p));
  if (disc < 0) return { kind: 1, overflow: c.overflow };
  const half = c.div(c.sqrt(disc), dd), mid = c.div(-c.dot(high, d), dd);
  return { kind: 0, enter: c.sub(c.sub(mid, half), margin), exit: c.add(c.add(mid, half), margin), overflow: c.overflow };
}
function slabQuotient(c, n, d) {
  if (Math.abs(n) >= c.mul(Math.abs(d), T_REACH)) return (n > 0) === (d > 0) ? T_REACH : -T_REACH;
  return c.div(n, d);
}
// Mirror of enclosing_box.
export function enclosingBox(high, low, d) {
  const c = f32Context(), extent = c.add(c.add(Math.abs(high[0]), Math.abs(high[1])), Math.abs(high[2]));
  let enter = -F32_MAX, exit = F32_MAX;
  for (let axis = 0; axis < 3; axis++) {
    const half = c.add(c.add(c.add(1, INFLATION), Math.abs(low[axis])), c.mul(ROUNDING, c.add(extent, 2))), o = high[axis];
    if (d[axis] === 0) { if (Math.abs(o) > half) return { kind: 1, overflow: c.overflow }; continue; }
    const a = slabQuotient(c, c.sub(-half, o), d[axis]), b = slabQuotient(c, c.sub(half, o), d[axis]);
    const pad = c.mul(ROUNDING, c.add(Math.abs(a), Math.abs(b)));
    enter = Math.max(enter, c.sub(Math.min(a, b), pad)); exit = Math.min(exit, c.add(Math.max(a, b), pad));
  }
  if (exit < enter) return { kind: 1, overflow: c.overflow };
  return { kind: 0, enter, exit, overflow: c.overflow };
}
// Mirror of the step advance in march(): the bounded step, its guard, the candidate, the reach guard.
export function advance(t, distance, multiplier, exit = F32_MAX) {
  const c = f32Context(), step = c.mul(multiplier, distance);
  if (!(step <= c.sub(F32_MAX, t))) return { failure: true, overflow: c.overflow };
  const candidate = c.add(t, step);
  if (candidate > exit) return { miss: true, overflow: c.overflow };
  if (candidate > T_REACH) return { failure: true, overflow: c.overflow };
  return { failure: false, candidate, overflow: c.overflow };
}
