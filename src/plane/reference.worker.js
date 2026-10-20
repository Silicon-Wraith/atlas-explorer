import { referenceOrbit, fixed, spanFixed, precisionFor, escapeTime, floatExp } from './math.js';
import { prepareOrbit, perturbEscape, perturbEscapeExtended } from './perturbation.js';
let generation = 0;
self.onmessage = async ({ data }) => {
  const current = ++generation;
  try {
    if (data.type === 'reference') {
      const result = referenceOrbit(data.view, data.iterations, data.precision === 'double' ? Float64Array : Float32Array);
      self.postMessage({ ...result, id: data.id }, [result.orbit.buffer]);
    } else if (data.type === 'cpu') {
      const { view, iterations, width, height, id } = data;
      const digits = precisionFor(view.zoom);
      const span = spanFixed(view.zoom, digits);
      const re = fixed(view.re, digits), im = fixed(view.im, digits);
      const reference = view.zoom >= 8 ? referenceOrbit(view, iterations, Float64Array) : null;
      const ordinary = view.zoom < 280;
      const orbit = reference && ordinary ? prepareOrbit(reference.orbit) : reference?.orbit;
      const xs = ordinary ? new Float64Array(width) : null;
      // Convert each column once. Deep deltas are formed with BigInt before
      // conversion, so the small displacement never vanishes into the centre.
      if (ordinary) for (let x = 0; x < width; x++) {
        const offset = span * BigInt(2 * x + 1 - width) / BigInt(2 * width);
        if (!reference) xs[x] = Number(re + offset) / 10 ** digits;
        else { const [r, , e] = floatExp(offset, 0n, digits); xs[x] = r * 2 ** e; }
      }
      const tileRows = data.tileRows || 8, stride = data.rowStride || tileRows;
      for (let y = data.yStart || 0; y < height; y += stride) {
        if (current !== generation) return;
        const rows = Math.min(tileRows, height - y);
        const pixels = new Float32Array(width * rows * 4);
        for (let row = 0; row < rows; row++) {
          const ci = im + span * BigInt(height - 2 * (y + row) - 1) / BigInt(2 * width);
          const [, i, e] = ordinary && reference ? floatExp(0n, ci - im, digits) : [0, 0, 0];
          const cy = !reference ? Number(ci) / 10 ** digits : i * 2 ** e;
          for (let x = 0; x < width; x++) {
            const index = (row * width + x) * 4;
            let result;
            if (!reference) result = [escapeTime(xs[x], cy, iterations), .5];
            else if (ordinary) result = perturbEscape(orbit, reference.length, xs[x], cy, iterations, true);
            else {
              const dx = span * BigInt(2 * x + 1 - width) / BigInt(2 * width);
              result = perturbEscapeExtended(orbit, reference.length, floatExp(dx, ci - im, digits), iterations);
            }
            pixels[index] = result[0];
            pixels[index + 1] = result[1];
            pixels[index + 3] = 1;
          }
        }
        self.postMessage({ id, pixels, y, width, height, rows, done: y + stride >= height }, [pixels.buffer]);
        // Let a new view cancel obsolete tiles without restarting the worker.
        if (y + stride < height) await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  } catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};
