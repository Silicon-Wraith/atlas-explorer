import { createBrowserProducer } from './browser-producer.js';

export function createApplicationPreparationClient({ runtimeId, fetcher = fetch, onEvent = () => {} }) {
  const controller = new AbortController(), headers = { 'Content-Type': 'application/json', 'X-Atlas-Client': runtimeId };
  const producer = createBrowserProducer({ baseUrl: '/api/preparation', headers, fetcher, onEvent });
  let opening, closing, closed = false;
  return Object.freeze({ produce: producer.produce, snapshot: producer.snapshot,
    cancelOpening() { closed = true; controller.abort(); },
    open() {
      if (closed) return Promise.reject(new Error('Landscape opening was cancelled'));
      return opening ??= (async () => {
        const timer = setTimeout(() => controller.abort(), 35000);
        try {
          const response = await fetcher('/api/preparation/open', { method: 'POST', headers, body: JSON.stringify({ runtimeId }), signal: controller.signal });
          if (response.status === 404) throw new Error('Landscape preparation is unavailable. Start ATLAS with npm run dev:world, then retry Landscape.');
          const output = await response.json(); if (!response.ok) throw new Error(output.error ?? 'Landscape preparation is unavailable');
          if (closed) throw new Error('Landscape opening was superseded'); return output;
        } finally { clearTimeout(timer); }
      })();
    },
    close() {
      if (closing) return closing; closed = true; controller.abort();
      closing = (async () => {
        const cancellation = new AbortController(), timer = setTimeout(() => cancellation.abort(), 5000);
        try { const response = await fetcher('/api/preparation/close', { method: 'POST', headers, body: JSON.stringify({ runtimeId }), signal: cancellation.signal }); if (!response.ok && response.status !== 404) throw new Error('Landscape client release failed'); }
        finally { clearTimeout(timer); }
      })(); return closing;
    },
  });
}
