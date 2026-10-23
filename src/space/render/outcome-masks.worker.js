import { createMaskWorkerHandler } from './mask-worker-service.js';
const handle = createMaskWorkerHandler();
self.onmessage = ({ data }) => {
  const reply = handle(data);
  if (reply) self.postMessage(reply);
};
