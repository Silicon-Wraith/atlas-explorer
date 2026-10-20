export const PALETTES = [
  { id: 'ember', name: 'Solar flare', description: 'Copper · gold · midnight', stops: ['#071b2b', '#123d50', '#27848a', '#e7d6ac', '#f7b457', '#c55726', '#4c1e29', '#071b2b'] },
  { id: 'aurora', name: 'Aurora', description: 'Violet · ice · electric blue', stops: ['#080d2a', '#28205e', '#7430a2', '#c66cbc', '#d6f1ed', '#4ebec9', '#235a94', '#080d2a'] },
  { id: 'ocean', name: 'Abyss', description: 'Deep blue · cyan · pearl', stops: ['#020d1b', '#063951', '#087f95', '#69dbcf', '#eff5d4', '#1985b1', '#14315b', '#020d1b'] },
  { id: 'rose', name: 'Velvet', description: 'Burgundy · rose · champagne', stops: ['#190e24', '#5c173d', '#ae3762', '#e88a83', '#ffe3be', '#7f669c', '#2b224c', '#190e24'] },
  { id: 'mono', name: 'Silver', description: 'Graphite · platinum · light', stops: ['#080c13', '#262e3a', '#637380', '#c1cbd0', '#fff9e9', '#777f8d', '#242e40', '#080c13'] },
  { id: 'acid', name: 'Electric', description: 'Cobalt · citron · ultraviolet', stops: ['#0d1032', '#2839b3', '#5c5ce8', '#c7efd7', '#edfc80', '#74ad53', '#254248', '#0d1032'] },
];

export function paletteBytes(palette, size = 1024) {
  const stops = palette.stops.map(hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)));
  const bytes = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const t = i / (size - 1) * (stops.length - 1);
    const j = Math.min(stops.length - 2, Math.floor(t));
    const f = t - j, blend = f * f * (3 - 2 * f);
    for (let k = 0; k < 3; k++) bytes[i * 4 + k] = Math.round(stops[j][k] * (1 - blend) + stops[j + 1][k] * blend);
    bytes[i * 4 + 3] = 255;
  }
  return bytes;
}

export function colorPixel(mu, stripe, palette, phase, frequency, relief) {
  if (mu < 0) return [4, 8, 14];
  const t = ((Math.sqrt(Math.max(0, mu)) * .055 * frequency + phase) % 1 + 1) % 1;
  const i = Math.min(1023, Math.floor(t * 1023)) * 4;
  const light = 1 - relief * .28 + relief * .55 * stripe;
  return [0, 1, 2].map(k => Math.min(255, Math.round(palette[i + k] * light)));
}
