import { packStatus } from '../../src/space/render/status.js';
import { packRecoveryWord } from '../../src/space/render/webgpu/passes.js';
const status = (s, reason = 0, subreason = 0) => packStatus({ status: s, reason, subreason, steps: 19 });
const recovered = (outcome, stop = 'none') => packRecoveryWord({ attempted: true, outcome, stop, midpoints: 5, encounters: 3 });
const cases = [
  [status(0), 1, recovered('approximate hit')], [status(0), 0, 0], [status(1), 0, 0],
  [status(3), 0, recovered('numerical failure')], [status(2, 2), 1, recovered('estimate-unavailable')],
  ...['midpoint-limit', 'parameter-collapse', 'coordinate-collapse', 'evaluation-cap'].map(stop => [status(2, 1), 0, recovered('point-budget', stop)]),
  [status(2, 3), 0, 0], [status(2, 4, 1), 1, 0], [status(2, 4, 2), 0, 0],
];
export function packetFixture({ width = 13, height = 9, recovery = true, producerToken = 0 } = {}) {
  const stride = recovery ? 3 : 2, words = new Uint32Array(width * height * stride);
  for (let i = 0; i < width * height; i++) {
    const row = cases[i % cases.length];
    words[i * stride] = row[0]; words[i * stride + 1] = (producerToken ? producerToken * 2 : 0x41540000) | row[1];
    if (recovery) words[i * stride + 2] = row[2];
  }
  return new Uint8Array(words.buffer);
}
