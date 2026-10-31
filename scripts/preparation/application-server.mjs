import { GENERATION_BUNDLE, GENERATION_CERTIFICATE } from '../generation/config.mjs';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNativeAdapter } from './native-adapter.mjs';
import { createStaticHandler } from '../static-handler.mjs';
import { applicationRequestAllowed, createApplicationClientOwner, ApplicationSessionError, APPLICATION_SESSION_POLICY } from './application-policy.mjs';

const project = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
async function readJson(req) {
  let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 65536) throw new Error('Application request too large'); }
  return JSON.parse(text);
}
export async function createApplicationServer({ runRoot, port = 5196, root = project, bundle = GENERATION_BUNDLE,
  certificatePath = process.env.ATLAS_GENERATION_CERTIFICATE ?? GENERATION_CERTIFICATE, physicsPath = '/mnt/ml_storage/scratch/atlas-prepared-demo/rapier.mjs',
  adapterFactory = createNativeAdapter, sessionPolicy = APPLICATION_SESSION_POLICY, now = () => performance.now() }) {
  runRoot = path.resolve(runRoot); if (!runRoot.startsWith('/mnt/ml_storage/scratch/')) throw new Error('Application evidence requires a scratch output root');
  const events = []; let adapter, initialization, initializationFailure, startupController, closing = false, shutdown;
  const event = e => events.push({ time: Date.now(), ...e });
  const clients = createApplicationClientOwner({ now, leaseMs: sessionPolicy.leaseMs, onEvent: e => event({ ...e, type: 'session-' + e.type }), onClose(client) {
    event({ type: 'client-retiring', id: client.id, reason: client.reason });
    for (const controller of client.controllers.values()) controller.abort();
    for (const identity of client.requests.values()) client.adapter?.cancelRequest(identity);
    for (const token of client.tokens) client.adapter?.retire(token);
    event({ type: client.reason === 'expired' ? 'client-expired' : 'client-closed', id: client.id, requests: client.requests.size, tokens: client.tokens.size });
  } });
  const sweep = setInterval(() => { try { clients.expire(); } catch { /* Admission stays fenced by the sticky owner state. */ } }, sessionPolicy.sweepMs);
  sweep.unref();
  const initialize = () => initialization ??= (async () => {
    try {
      const certificate = JSON.parse(await fs.readFile(certificatePath, 'utf8'));
      const value = await adapterFactory({ bundle, runRoot, onEvent: event, onController: c => { startupController = c; if (closing) c.close().catch(error => event({ type: 'cleanup-error', message: error.message })); } });
      adapter = value; value.installCertificate(certificate); return value;
    } catch (error) {
      try { if (adapter) await adapter.close(); else if (startupController) await startupController.close(); }
      catch (cleanup) { initializationFailure = new ApplicationSessionError('cleanup-failed', 'Preparation cleanup is unconfirmed. Restart ATLAS.', 503); event({ type: 'cleanup-error', message: cleanup.message }); throw initializationFailure; }
      initializationFailure = new ApplicationSessionError(error.code === 'preparer-lost' ? 'preparer-lost' : 'preparer-unavailable', error.code === 'preparer-lost' ? error.message : error.message + ' Save your scene and restart ATLAS before trying Landscape again.', 503);
      throw initializationFailure;
    }
  })();
  function healthy(value) {
    if (initializationFailure) throw initializationFailure;
    if (!value) throw new ApplicationSessionError('preparing', 'Landscape preparation is not ready yet.', 503);
    const failure = value.snapshot().failure;
    if (failure) throw new ApplicationSessionError('preparer-lost', 'Native preparation stopped. Save your scene and restart ATLAS.', 503);
    return value;
  }
  const staticHandler = createStaticHandler({ root });
  const server = http.createServer(async (req, res) => {
    const json = (data, code = 200) => { if (!res.destroyed) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); } };
    try {
      if (!applicationRequestAllowed({ host: req.headers.host, origin: req.headers.origin, method: req.method, contentType: req.headers['content-type'], port })) { json({ error: 'Request does not belong to this ATLAS application origin' }, 403); return; }
      const url = new URL(req.url, 'http://' + req.headers.host), endpoint = url.pathname.replace(/^\/api\/preparation\//, '');
      if (!url.pathname.startsWith('/api/preparation/')) { await staticHandler(req, res); return; }
      if (closing) { json({ error: 'ATLAS preparation is shutting down' }, 503); return; }
      if (endpoint === 'status' && req.method === 'GET') {
        const queue = adapter?.snapshot().queue;
        json({ configured: true, session: clients.snapshot(), preparer: initializationFailure || adapter?.snapshot().failure ? 'unavailable' : adapter ? 'ready' : 'not-started', cleanup: queue?.active ? 'pending-owned-work' : 'idle' }); return;
      }
      if (endpoint === 'rapier.mjs' && req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'text/javascript', 'X-Content-Type-Options': 'nosniff' }); res.end(await fs.readFile(physicsPath)); return; }
      if (endpoint === 'open' && req.method === 'POST') {
        const input = await readJson(req), id = req.headers['x-atlas-client'], nonce = req.headers['x-atlas-session'];
        if (input.runtimeId !== id) throw new ApplicationSessionError('identity', 'Opening/client identity mismatch');
        if (initializationFailure) throw initializationFailure;
        if (adapter) healthy(adapter);
        const client = clients.begin(id, nonce); event({ type: 'client-opening', id: client.id });
        try {
          const value = healthy(await initialize()); clients.require(id, nonce); client.adapter = value;
          if (closing || client.closed || clients.current() !== client) throw new ApplicationSessionError('expired', 'Landscape opening was superseded', 410);
          const a = value.hello().approach, feature = JSON.parse(await fs.readFile(path.join(bundle, 'feature-r0.json'), 'utf8'));
          clients.require(id, nonce); healthy(value);
          json({ world: value.world, producer: value.producer(), grid: value.grid.config, viewGrid: value.viewGrid.config, fineBounds: value.fineBounds,
            session: { ...clients.describe(client), heartbeatMs: sessionPolicy.heartbeatMs },
            approach: { entry: a.entry, inspection: a.inspection_eye, target: a.target, fineOrigin: a.fine_origin, fineDiameter: a.d },
            feature: { point: feature.world_point, light: feature.light_direction } });
          event({ type: 'client-opened', id: client.id });
        } catch (error) { clients.close(client.id, nonce); throw error; } return;
      }
      const id = req.headers['x-atlas-client'], nonce = req.headers['x-atlas-session'];
      if (endpoint === 'close' && req.method === 'POST') {
        const input = await readJson(req); if (input.runtimeId !== id) throw new ApplicationSessionError('identity', 'Closing/client identity mismatch');
        clients.close(id, nonce); json({ closed: true }); return;
      }
      if (endpoint === 'heartbeat' && req.method === 'POST') {
        const input = await readJson(req); healthy(clients.require(id, nonce).adapter);
        const client = clients.renew(id, nonce, input.sequence);
        json({ session: { ...clients.describe(client), heartbeatMs: sessionPolicy.heartbeatMs } }); return;
      }
      if (endpoint.startsWith('retire/') && req.method === 'POST') {
        const client = clients.cleanup(id, nonce), token = endpoint.slice(7);
        if (client.closed) {
          if (client.tokens.has(token)) json({ retired: true, alreadyRetired: true });
          else json({ error: 'This session is already retired', code: 'session-retired', sessionRetired: true }, 410);
        } else {
          if (!client.tokens.has(token)) throw new ApplicationSessionError('identity', 'Publication does not belong to this session');
          client.adapter.retire(token); client.tokens.delete(token); json({ retired: true });
        }
        return;
      }
      if (endpoint === 'cancel' && req.method === 'POST') {
        const client = clients.cleanup(id, nonce), identity = await readJson(req);
        if (identity.runtimeId !== id) throw new ApplicationSessionError('identity', 'Cancellation/client identity mismatch');
        if (!client.closed) { client.controllers.get(identity.requestId)?.abort(); client.adapter?.cancelRequest(identity); }
        json({ cancelled: true, alreadyClosed: client.closed }); return;
      }
      const client = clients.require(id, nonce), ownAdapter = healthy(client.adapter);
      if (endpoint === 'prepare' && req.method === 'POST') {
        const input = await readJson(req); if (input.identity?.runtimeId !== client.id) throw new Error('Request/client identity mismatch');
        if (client.requests.size >= 4096 && !client.requests.has(input.identity.requestId)) throw new Error('Application request accounting capacity exceeded');
        client.requests.set(input.identity.requestId, input.identity);
        const controller = new AbortController(), abort = () => { if (!res.writableEnded) controller.abort(); }; res.once('close', abort);
        client.controllers.set(input.identity.requestId, controller);
        try {
          const output = await ownAdapter.prepare(input, { signal: controller.signal });
          try { clients.require(id, nonce); healthy(ownAdapter); }
          catch (error) { if (output.token) ownAdapter.retire(output.token); throw error; }
          if (client.closed || controller.signal.aborted) {
            if (output.token) ownAdapter.retire(output.token);
            throw new ApplicationSessionError('expired', 'Landscape preparation was cancelled', 410);
          }
          if (output.token) client.tokens.add(output.token); json(output);
        } finally { res.removeListener('close', abort); client.controllers.delete(input.identity.requestId); } return;
      }
      if (endpoint.startsWith('buffer/') && req.method === 'GET') {
        const [token, role] = endpoint.slice(7).split('/'); if (!client.tokens.has(token)) throw new Error('Buffer is not owned by this client');
        const bytes = await ownAdapter.buffer(token, role); clients.require(id, nonce); healthy(ownAdapter);
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(bytes); return;
      }
      json({ error: 'Unknown preparation operation' }, 404);
    } catch (error) {
      event({ type: 'http-error', name: error.name, code: error.code, message: error.message });
      json({ error: error.message, code: error.code ?? 'unavailable' }, error.status ?? 503);
    }
  });
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); }
  catch (error) { clearInterval(sweep); server.closeAllConnections(); throw error; }
  return Object.freeze({ port, events, snapshot: () => ({ client: clients.current()?.id ?? null, session: clients.snapshot(), native: adapter?.snapshot() ?? null, startupPid: startupController?.pid }),
    close() {
      return shutdown ??= (async () => {
        closing = true; clearInterval(sweep); let sessionCleanupError = null;
        try { const client = clients.current(); if (client) clients.close(client.id, client.nonce); }
        catch (error) { sessionCleanupError = error.message; }
        server.closeAllConnections(); await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        let native = { cleanup: true, absent: true };
        if (adapter) native = await adapter.close();
        else if (initialization) { if (startupController) native = await startupController.close(); try { await initialization; } catch { /* constructor owns startup failure */ } if (adapter) native = await adapter.close(); }
        const result = { cleanup: native.cleanup && !server.listening, sessionCleanupError, native, hello: adapter?.hello() ?? null, events };
        await fs.writeFile(path.join(runRoot, 'application-server.json'), JSON.stringify(result, null, 2) + '\n'); return result;
      })();
    },
  });
}
