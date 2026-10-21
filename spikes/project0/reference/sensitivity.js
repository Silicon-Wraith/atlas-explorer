import { nextDown, nextUp } from './f32.js';
import { assertArithmeticStatus } from '../contract.js';

export function sensitivity(input,evaluate,tolerances) {
  function checked(v) {
    const result = evaluate(v);
    assertArithmeticStatus(result);
    if (result.status === 'failure') {
      throw new Error('CPU reference failed during sensitivity screen');
    }
    if (
      result.status === 'escaped' &&
      Object.keys(tolerances).some(key => !Number.isFinite(result[key]))
    ) {
      throw new Error('nonfinite CPU reference quantity');
    }
    return result;
  }

  const reference = checked(input);
  const reasons = [];

  for (let coordinate=0; coordinate<input.length; coordinate++) {
    for (const [direction,move] of [['down',nextDown],['up',nextUp]]) {
      const neighbour = [...input];
      neighbour[coordinate] = move(neighbour[coordinate]);
      const other = checked(neighbour);
      const changed = [];

      if (other.status !== reference.status || other.index !== reference.index) {
        changed.push('status/index');
      }
      if (other.status === 'escaped' && reference.status === 'escaped') {
        for (const [key,rtol] of Object.entries(tolerances)) {
          if (
            Math.abs(other[key]-reference[key]) >
            .25*rtol*Math.abs(reference[key])
          ) {
            changed.push(key);
          }
        }
      }
      if (changed.length) reasons.push({ coordinate, direction, changed });
    }
  }
  return { reference, eligible: reasons.length === 0, reasons };
}
