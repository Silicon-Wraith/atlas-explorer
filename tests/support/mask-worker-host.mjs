// Execute the browser Worker entry in a real CPU thread, without a browser/GPU.
import { parentPort, isMainThread } from 'node:worker_threads';
if (isMainThread) throw new Error('mask worker host requires a CPU worker thread');
globalThis.self = { postMessage: data => parentPort.postMessage(data) };
await import('../../src/space/render/outcome-masks.worker.js');
parentPort.on('message', data => self.onmessage({ data }));
