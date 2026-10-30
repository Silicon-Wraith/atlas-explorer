// Prepared spatial queries only. No field evaluation, GPU or source-generation work.
const vec = v => ({ x: v[0], y: v[1], z: v[2] });
const xyz = p => [p.x, p.y, p.z];
const rotation = { x: 0, y: 0, z: 0, w: 1 };
export const regionLocal = (region, pointM) => pointM.map((x, i) => (x - region.artifact.transform.originM[i]) / region.artifact.transform.metresPerUnit);

export function regionCovers(region, startM, endM, bodyDiameterM) {
  if (!(Number.isFinite(bodyDiameterM) && bodyDiameterM > 0)) throw new RangeError('positive body diameter required');
  const b = region.artifact.bounds, radius = .501 * bodyDiameterM + 1e-8 * bodyDiameterM;
  return startM.every((x, i) => Number.isFinite(x) && Number.isFinite(endM[i]) && x - radius >= b.min[i] && x + radius <= b.max[i] && endM[i] - radius >= b.min[i] && endM[i] + radius <= b.max[i]);
}

export function regionClear(region, pointM, bodyDiameterM) {
  if (!regionCovers(region, pointM, pointM, bodyDiameterM)) return false;
  const kind = region.artifact.classification;
  if (kind === 'empty-air') return true;
  if (kind === 'full-solid') return false;
  if (kind !== 'surface' || !region.surface || !region.collider) throw new Error('Unresolved collision representation');
  const p = regionLocal(region, pointM);
  if (region.collider.containsPoint(vec(p))) return false;
  const closest = region.surface.projectPoint(vec(p), false);
  if (!closest) throw new Error('Surface query unavailable, not empty air');
  return Math.hypot(...p.map((x, i) => x - xyz(closest.point)[i])) * region.artifact.transform.metresPerUnit >= .501 * bodyDiameterM;
}

export function sweepRegion(region, startM, deltaM, bodyDiameterM) {
  const endM = startM.map((x, i) => x + deltaM[i]);
  if (!regionCovers(region, startM, endM, bodyDiameterM)) throw new Error('Movement outside prepared body/sweep coverage');
  const kind = region.artifact.classification;
  if (kind === 'empty-air') return { fraction: 1, hit: null };
  if (kind === 'full-solid') return { fraction: 0, hit: { occupancy: 'full-solid' } };
  const scale = region.artifact.transform.metresPerUnit;
  if (kind !== 'surface' || !region.surface || !region.shape || Math.abs(bodyDiameterM / scale - 1) > 1e-10) throw new Error('Unresolved or mismatched prepared collision scale');
  const local = regionLocal(region, startM), delta = deltaM.map(x => x / scale);
  const hit = region.surface.castShape(vec(local), rotation, vec(delta), region.shape, 0, 1, true);
  region.castQueries++;
  const fraction = hit ? Math.max(0, Math.min(1, hit.time_of_impact - .001 / Math.max(Math.hypot(...delta), 1e-9))) : 1;
  return { fraction, hit: hit ? { toi: hit.time_of_impact, point: xyz(hit.witness1), normal: xyz(hit.normal1), localStart: local, localDelta: delta } : null };
}
