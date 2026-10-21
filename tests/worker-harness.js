import { parentPort } from 'node:worker_threads';
globalThis.self = globalThis;
globalThis.postMessage = (message, transfer) => parentPort.postMessage(message, transfer);
await import('../src/plane/reference.worker.js');
parentPort.on('message', data => globalThis.onmessage({ data }));
