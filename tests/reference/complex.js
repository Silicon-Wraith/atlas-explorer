// Deliberately separate complex recurrence: it does not call quaternion arithmetic.
export function complexOrbit(z0, c, cap) {
  if (![...z0, ...c].every(Number.isFinite) || z0.length !== 2 || c.length !== 2 || !Number.isInteger(cap) || cap < 1) return { status: 'numerical failure' };
  const bound = Math.max(2, (1 + Math.sqrt(1 + 4 * Math.hypot(...c))) / 2);
  let [x, y] = z0;
  for (let n = 0; n <= cap; n++) {
    const radius = Math.sqrt(x * x + y * y);
    if (radius > bound) return { status: 'escaped', escapeIndex: n, value: [x, y] };
    if (n === cap) return { status: 'not escaped within iteration budget', escapeIndex: null, value: [x, y] };
    const real = x * x - y * y + c[0];
    y = 2 * x * y + c[1]; x = real;
  }
}
