// Bounded direction-of-travel prediction, independent of terrain/renderer state.
export function predictRegionAddresses(grid, positionM, velocityMps, horizonSeconds, { max = 3, exclude = [] } = {}) {
  if (!Number.isFinite(horizonSeconds) || horizonSeconds < 0 || horizonSeconds > 4 || !Number.isSafeInteger(max) || max < 0) throw new RangeError('bounded horizon and count required');
  if (positionM.length !== 3 || velocityMps.length !== 3 || ![...positionM, ...velocityMps].every(Number.isFinite)) throw new TypeError('finite position/velocity required');
  const seen = new Set(exclude), addresses = [];
  for (let i = 0; i <= 16 && addresses.length < max; i++) {
    const point = positionM.map((x, k) => x + velocityMps[k] * horizonSeconds * i / 16), address = grid.nearest(point);
    if (!address) continue; const key = grid.key(address);
    if (!seen.has(key)) { seen.add(key); addresses.push(address); }
  }
  return addresses;
}
