import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNativeAdapter } from './native-adapter.mjs';

const project = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function readJson(req) {
  let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 65536) throw new Error('Request too large'); }
  return JSON.parse(text);
}

export async function createPc2Server({ runRoot, port = 5280, bundle = '/mnt/ml_storage/scratch/atlas-bw1-runtime-r1', certificatePath = '/mnt/ml_storage/scratch/atlas-pc2/native-smoke-r0/policy-certificate.json' }) {
  const events = []; let adapter, server, delayUntil = 0;
  const event = value => events.push({ time: Date.now(), ...value });
  try {
    const certificate = JSON.parse(await fs.readFile(certificatePath, 'utf8'));
    adapter = await createNativeAdapter({ bundle, runRoot, onEvent: event }); adapter.installCertificate(certificate);
    const feature = JSON.parse(await fs.readFile(path.join(bundle, 'feature-r0.json'), 'utf8'));
    server = http.createServer(async (req, res) => {
      const json = (data, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
      try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/pc2/world') {
          const hello = adapter.hello(), a = hello.approach;
          json({ world: adapter.world, producer: adapter.producer(), grid: adapter.grid.config, viewGrid: adapter.viewGrid.config, fineBounds: adapter.fineBounds,
            approach: { entry: a.entry, target: a.target, inspection: a.inspection_eye, fineOrigin: a.fine_origin, fineDiameter: a.d },
            feature: { point: feature.world_point, light: feature.light_direction }, policy: certificate.evidenceId }); return;
        }
        if (url.pathname === '/pc2/prepare' && req.method === 'POST') {
          const input = await readJson(req), controller = new AbortController();
          const abort = () => { if (!res.writableEnded) controller.abort(); };
          res.once('close', abort);
          try {
            const output = await adapter.prepare(input, { signal: controller.signal });
            if (output.result.status === 'prepared' && input.intent === 'interaction' && Date.now() < delayUntil) {
              event({ type: 'injected-delay', requestId: input.identity.requestId, delayMs: delayUntil - Date.now() });
              await pause(delayUntil - Date.now());
            }
            if (controller.signal.aborted) { if (output.token) adapter.retire(output.token); return; }
            json(output);
          } finally { res.removeListener('close', abort); }
          return;
        }
        if (url.pathname.startsWith('/pc2/buffer/')) {
          const [token, role] = url.pathname.slice('/pc2/buffer/'.length).split('/');
          const data = await adapter.buffer(token, role); res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data); return;
        }
        if (url.pathname.startsWith('/pc2/retire/') && req.method === 'POST') { adapter.retire(url.pathname.slice('/pc2/retire/'.length)); json({ retired: true }); return; }
        if (url.pathname === '/pc2/cancel' && req.method === 'POST') { adapter.cancelRequest(await readJson(req)); json({ cancelled: true }); return; }
        if (url.pathname === '/pc2/status') { json(adapter.snapshot()); return; }
        if (url.pathname === '/pc2/reset' && req.method === 'POST') { delayUntil = 0; const producer = await adapter.reset(); json({ producer }); return; }
        if (url.pathname === '/pc2/late' && req.method === 'POST') { delayUntil = Date.now() + 3000; json({ delayUntil }); return; }
        let filename;
        if (url.pathname === '/native/rapier.mjs') filename = '/mnt/ml_storage/scratch/atlas-prepared-demo/rapier.mjs';
        else if (url.pathname === '/' || url.pathname === '/index.html') filename = path.join(project, 'tests/fixtures/pc2/index.html');
        else if (url.pathname.startsWith('/src/') || url.pathname.startsWith('/tests/fixtures/pc2/')) {
          filename = path.resolve(project, '.' + decodeURIComponent(url.pathname));
          if (!filename.startsWith(project + path.sep)) throw new Error('Invalid static path');
        } else { json({ error: 'Unknown resource' }, 404); return; }
        const bytes = await fs.readFile(filename); res.writeHead(200, { 'Content-Type': filename.endsWith('.html') ? 'text/html' : 'text/javascript', 'Cache-Control': 'no-store' }); res.end(bytes);
      } catch (error) { event({ type: 'http-error', name: error.name, message: error.message }); if (!res.destroyed) json({ error: error.message }, 500); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    return { adapter, events, port,
      async close() {
        if (server.listening) { server.closeAllConnections(); await new Promise((r, j) => server.close(error => error ? j(error) : r())); }
        const native = await adapter.close();
        const result = { cleanup: native.cleanup && !server.listening, native, events };
        await fs.writeFile(path.join(runRoot, 'server.json'), JSON.stringify(result, null, 2) + '\n'); return result;
      },
    };
  } catch (error) {
    if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (adapter) await adapter.close(); throw error;
  }
}
