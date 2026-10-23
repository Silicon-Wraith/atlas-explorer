import { createMaskWorkerHandler } from '../../src/space/render/mask-worker-service.js';
// Protocol double for fake renderer/DOM suites. Real CPU Worker coverage lives in
// space-mask-worker.test.js; this double preserves transfer/detachment and turns.
export class MaskWorkerDouble {
  constructor() { this.handle = createMaskWorkerHandler(); this.terminated = false; this.messages = []; this.held = false; this.waiting = []; }
  postMessage(data, transfers = []) {
    if (this.terminated) throw new Error('Worker terminated');
    const message = structuredClone(data, { transfer: transfers }); this.messages.push({ ...message, bytes: message.bytes?.byteLength });
    const run = () => {
      if (this.terminated) return;
      const reply = this.handle(message);
      if (reply) this.onmessage?.({ data: structuredClone(reply) });
    };
    if (this.held) this.waiting.push(run); else setImmediate(run);
  }
  release() { this.held = false; for (const run of this.waiting.splice(0)) setImmediate(run); }
  terminate() { this.terminated = true; this.waiting = []; }
}
export function installMaskWorkerDouble() { globalThis.Worker = MaskWorkerDouble; }
