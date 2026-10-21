// Plane palettes. The definitions and interpolation live in src/shared/palettes.js (spec §4.1; plan B11)
// and are re-exported unchanged; colorPixel is Plane's own colour mapping.
export { PALETTES, paletteBytes, interpolatePalette } from '../shared/palettes.js';

export function colorPixel(mu, stripe, palette, phase, frequency, relief) {
  if (mu < 0) return [4, 8, 14];
  const t = ((Math.sqrt(Math.max(0, mu)) * .055 * frequency + phase) % 1 + 1) % 1;
  const i = Math.min(1023, Math.floor(t * 1023)) * 4;
  const light = 1 - relief * .28 + relief * .55 * stripe;
  return [0, 1, 2].map(k => Math.min(255, Math.round(palette[i + k] * light)));
}
