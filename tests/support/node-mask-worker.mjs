import { Worker } from 'node:worker_threads';
export function createNodeMaskWorker() {
  const thread = new Worker(new URL('./mask-worker-host.mjs', import.meta.url));
  const stopped = new Promise(resolve => thread.once('exit', resolve));
  const worker = { postMessage: (data, transfers) => thread.postMessage(data, transfers), terminate: () => thread.terminate(), stopped };
  thread.on('message', data => worker.onmessage?.({ data }));
  thread.on('error', error => worker.onerror?.({ message: error.message }));
  thread.on('messageerror', () => worker.onmessageerror?.());
  return worker;
}
