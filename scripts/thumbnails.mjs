import { writeFile } from 'node:fs/promises';
import { referenceOrbit } from '../src/math.js';
import { perturbEscape } from '../src/perturbation.js';
import { PALETTES, paletteBytes, colorPixel } from '../src/palettes.js';
import { PLACES } from '../src/places.js';
import { encodePng } from './png.mjs';
const width = 480, height = 270;
for (const place of PLACES.filter(p => !process.argv[2] || p.id === process.argv[2])) {
  const start = performance.now();
  const iterations = (place.detail === 3 ? 4096 : 1024) + Math.max(0, Math.ceil((place.zoom - 3) * 32));
  const ref = referenceOrbit(place, iterations, Float64Array);
  const palette = paletteBytes(PALETTES.find(p => p.id === place.palette));
  const rgb = new Uint8Array(width * height * 3);
  const span = 3.4 * 10 ** -place.zoom;
  let interior = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [mu, stripe] = perturbEscape(ref.orbit, ref.length, (x + .5 - width / 2) / width * span, (height / 2 - y - .5) / width * span, iterations);
    rgb.set(colorPixel(mu, stripe, palette, .11, 1, 1), (y * width + x) * 3);
    if (mu < 0) interior++;
  }
  await writeFile(`assets/${place.id}.png`, encodePng(width, height, rgb));
  console.log(`${place.name}: ${Math.round(performance.now()-start)} ms, ${(interior / width / height * 100).toFixed(1)}% interior`);
}
