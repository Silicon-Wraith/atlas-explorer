// Test-only delivery fault boundary that survives browser/page teardown.
import http from 'node:http';
import { once } from 'node:events';

export async function createSessionLossProxy(upstream) {
  const target = new URL(upstream);
  const suppressed = { heartbeat: 0, close: 0, cancel: 0, retire: 0 };
  let blockedClient = null, origin;
  const server = http.createServer((request, response) => {
    const operation = new URL(request.url, origin).pathname.split('/')[3];
    if (blockedClient && request.headers['x-atlas-client'] === blockedClient && operation in suppressed) {
      suppressed[operation]++;
      request.resume();
      response.writeHead(503, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Test delivery withheld' }));
      return;
    }
    const headers = { ...request.headers, host: target.host };
    if (headers.origin === origin) headers.origin = target.origin;
    const outgoing = http.request({ hostname: target.hostname, port: target.port, path: request.url,
      method: request.method, headers }, incoming => {
      response.writeHead(incoming.statusCode, incoming.headers);
      incoming.pipe(response);
    });
    outgoing.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
    request.on('aborted', () => outgoing.destroy());
    response.on('close', () => { if (!response.writableFinished) outgoing.destroy(); });
    request.pipe(outgoing);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin, suppressed,
    block(client) { blockedClient = client; },
    async close() {
      const closed = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      server.closeAllConnections();
      await closed;
    }
  };
}
