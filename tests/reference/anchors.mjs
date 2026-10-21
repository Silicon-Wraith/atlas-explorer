import { traceModel } from './trace.js';
import { lookCamera, rayFor, overviewCamera } from './camera.js';
import { modelRadius } from './trace.js';

export function prepareAnchor(model, effective, ray) {
  const tolerances = [1e-13, 1e-15];
  const results = tolerances.map(tolerance => traceModel(model, effective, ray, { name: 'anchor-v1', maxIterations: 256, maxSteps: 4096, stepMultiplier: 0.5, tolerance }));
  const deltaT = Math.abs(results[0].t - results[1].t), limit = 1e-4;
  return { anchor: ray.origin.map((v, i) => v + results[0].t * ray.direction[i]), t: results[0].t,
    convergence: { tolerances, depths: results.map(r => r.t), statuses: results.map(r => r.status), deltaT, limit,
      rule: 'both approximate hit; deltaT <= 1e-3 * largest ladder distance (0.1); each ladder row rechecks deltaT <= 1e-3 * distance',
      converged: results.every(r => r.status === 'approximate hit') && deltaT <= limit } };
}
export function anchorSeed(model, effective, side) {
  const overview = overviewCamera(modelRadius(model, effective));
  // Two predetermined opposite azimuths, not selected using GPU or ladder outcomes.
  const p = overview.positionLocal.map((v, i) => i < 2 && side === 1 ? -v : v);
  const camera = lookCamera(p);
  return rayFor(camera, 639.5, 359.5, 1280, 720);
}
export function detailCamera(anchor, distance) {
  return lookCamera(anchor.anchor.map((v, i) => v - distance * anchor.seedRay.direction[i]), anchor.anchor);
}
