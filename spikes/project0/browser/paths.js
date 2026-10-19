// spikes/project0/browser/paths.js — A.7 motion from fixture parameters, written from the spec (not from reference/camera.js).
const rz = (v, a) => [Math.cos(a) * v[0] - Math.sin(a) * v[1], Math.sin(a) * v[0] + Math.cos(a) * v[1], v[2]];
export function posesAt(fx, view, s) {
  const { overview, detail } = fx.motion;
  if (view === 'sphere') return { origin: [1.92, -1.44, 0.7], target: [0, 0, 0] };
  if (view === 'bulb-overview') {
    if (s === 0) return { origin: [1.92, -1.44, 0.7], target: [0, 0, 0] };
    const th = overview.initialAngle + 2 * Math.PI * s / overview.periodSeconds;
    return { origin: [overview.radius * Math.cos(th), overview.radius * Math.sin(th), overview.height], target: [0, 0, 0] };
  }
  const d = { 'bulb-detail-0.05': 0.05, 'bulb-detail-0.005': 0.005, 'bulb-stress': 0.005 }[view];
  if (d === undefined) throw new Error(`unknown view ${view}`);
  const { A, D } = fx.anchor;
  const beta = view === 'bulb-stress' ? 0 : detail.amplitudeRadians * Math.sin(2 * Math.PI * s / detail.periodSeconds);
  const v = rz([-d * D[0], -d * D[1], -d * D[2]], beta);
  return { origin: [A[0] + v[0], A[1] + v[1], A[2] + v[2]], target: [...A] };
}
export function burstSchedule(fx) {
  const b = fx.bursts, { overview } = fx.motion, out = [];
  for (let burst = 0; burst < b.burstCount; burst++) for (let index = 0; index < b.requestsPerBurst; index++) {
    const id = burst * b.requestsPerBurst + index, th = overview.initialAngle + (id + 1) * Math.PI / 180;
    out.push({ id, burst, index, offsetMs: burst * ((b.requestsPerBurst - 1) * b.spacingMs + b.quietMs) + index * b.spacingMs,
      camera: { origin: [overview.radius * Math.cos(th), overview.radius * Math.sin(th), overview.height], target: [0, 0, 0] } });
  }
  return out;
}
