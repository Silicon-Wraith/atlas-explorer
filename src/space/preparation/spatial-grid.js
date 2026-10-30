// Stable 3D materialization addresses. Bounds enclose a body; they do not clear terrain.
import { deepFreeze } from '../../shared/scene.js';

const vector = (value, name) => {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) throw new TypeError(`${name} requires three finite coordinates`);
  return value;
};
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const roundCell = x => {
  const lo = Math.floor(x), fraction = x - lo;
  // Absolute-world subtraction introduces a few ulps at exact cell ties. Choose
  // the positive-side cell consistently; the enclosure includes this tiny slack.
  const result = Math.abs(fraction - .5) <= 1e-9 ? lo + 1 : Math.round(x);
  return result === 0 ? 0 : result;
};

export function createSpatialGrid({ origin, axes, diameter, spacing = .5, domain = [[-3, 9], [-3, 3], [-2, 2]], floatSlack = 1e-8 }) {
  vector(origin, 'origin');
  if (!Array.isArray(axes) || axes.length !== 3) throw new TypeError('axes requires tangent, binormal, normal');
  axes.forEach(axis => vector(axis, 'axis'));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (Math.abs(dot(axes[i], axes[j]) - Number(i === j)) > 1e-10) throw new RangeError('frame must be orthonormal');
  if (!(Number.isFinite(diameter) && diameter > 0 && Number.isFinite(spacing) && spacing > 0 && Number.isFinite(floatSlack) && floatSlack >= 0)) throw new RangeError('positive diameter/spacing and finite slack required');
  if (!Array.isArray(domain) || domain.length !== 3 || domain.some(range => !Array.isArray(range) || range.length !== 2 || !range.every(Number.isSafeInteger) || range[0] > range[1])) throw new RangeError('finite integer domain required');
  const config = deepFreeze({ origin: [...origin], axes: axes.map(a => [...a]), diameter, spacing, domain: domain.map(d => [...d]), floatSlack });
  origin = config.origin; axes = config.axes; domain = config.domain;
  // axes stores frame vectors; sum their components for each WORLD axis.
  const worldAxisSums = [0, 1, 2].map(k => axes.reduce((sum, axis) => sum + Math.abs(axis[k]), 0));
  const enclosure = .501 + .5 * spacing * Math.max(...worldAxisSums);
  if (enclosure + .05 + floatSlack >= 1) throw new RangeError('grid cannot enclose the body and frozen maximum step');
  const valid = address => Array.isArray(address) && address.length === 3 && address.every((x, i) => Number.isSafeInteger(x) && x >= domain[i][0] && x <= domain[i][1]);
  const check = address => { if (!valid(address)) throw new RangeError('outside prepared address domain'); return address; };
  function center(address) {
    check(address);
    return origin.map((base, k) => base + diameter * spacing * axes.reduce((sum, axis, i) => sum + axis[k] * address[i], 0));
  }
  function bounds(address) {
    const c = center(address);
    return { min: c.map(x => x - diameter), max: c.map(x => x + diameter) };
  }
  function rawNearest(point) {
    vector(point, 'position'); const relative = point.map((x, i) => x - origin[i]);
    return axes.map(axis => roundCell(dot(relative, axis) / (diameter * spacing)));
  }
  function contains(address, start, end = start, radius = .501 * diameter) {
    vector(start, 'start'); vector(end, 'end');
    if (!Number.isFinite(radius) || radius < 0) throw new RangeError('finite body radius required');
    const c = center(address), margin = radius + floatSlack * diameter;
    return start.every((x, i) => Math.abs(x - c[i]) + margin <= diameter && Math.abs(end[i] - c[i]) + margin <= diameter);
  }
  function covering(start, end = start, radius = .501 * diameter) {
    const nearest = rawNearest(start), found = [];
    // Search all possible containing neighbors, including at finite-domain faces.
    // Candidate bounds are always returned explicitly; no address is clamped.
    for (let i = Math.max(domain[0][0], nearest[0] - 2); i <= Math.min(domain[0][1], nearest[0] + 2); i++)
      for (let j = Math.max(domain[1][0], nearest[1] - 2); j <= Math.min(domain[1][1], nearest[1] + 2); j++)
        for (let k = Math.max(domain[2][0], nearest[2] - 2); k <= Math.min(domain[2][1], nearest[2] + 2); k++) {
          const address = [i, j, k]; if (contains(address, start, end, radius)) found.push(address);
        }
    return found.sort((a, b) => {
      const ca = center(a), cb = center(b);
      const distance = ca.reduce((sum, x, i) => sum + (x - end[i]) ** 2, 0) - cb.reduce((sum, x, i) => sum + (x - end[i]) ** 2, 0);
      return distance || a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    });
  }
  return Object.freeze({ config, worldAxisSums: Object.freeze(worldAxisSums), enclosure,
    maxStep: .05 * diameter, center, bounds, contains, covering,
    nearest(point) { const a = rawNearest(point); return valid(a) ? a : null; },
    key(address) { return check(address).join(','); },
    parse(key) {
      if (typeof key !== 'string' || !/^-?\d+,-?\d+,-?\d+$/.test(key)) throw new RangeError('invalid 3D address');
      const a = key.split(',').map(Number); check(a); return a.map(x => x === 0 ? 0 : x);
    },
  });
}
