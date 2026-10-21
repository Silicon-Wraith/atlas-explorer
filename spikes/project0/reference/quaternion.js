export function quaternionOrbit(q, C, count) {
  if (
    q.length !== 4 || C.length !== 4 ||
    [...q, ...C].some(value => !Number.isFinite(value)) ||
    !Number.isInteger(count) || count < 0
  ) {
    throw new TypeError('finite quaternion inputs and nonnegative integer count required');
  }

  const orbit = [];
  for (let n = 0; n < count; n++) {
    const [a, b, c, d] = q;
    q = [
      a * a - b * b - c * c - d * d + C[0],
      a * b + b * a + C[1],
      a * c + c * a + C[2],
      a * d + d * a + C[3]
    ];
    if (!q.every(Number.isFinite)) {
      throw new RangeError('double reference overflow');
    }
    orbit.push(q);
  }
  return orbit;
}
