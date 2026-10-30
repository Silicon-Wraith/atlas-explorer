import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../../src/shared/scene.js';

export async function deadline(promise, ms, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + ' deadline')), ms); })]); }
  finally { clearTimeout(timer); }
}

export function createNativeController({ bundle, output, python = '/mnt/ml_storage/scratch/venvs/gpu/bin/python', onEvent = () => {} }) {
  let resolveReady, rejectReady, resetWaiter, stopped = false, closed = false, sequence = 0, hello = null;
  const pending = new Map(), diagnostics = [];
  const worker = spawn(python, [fileURLToPath(new URL('./native-worker.py', import.meta.url)), '--bundle', bundle, '--output', output], {
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', TMPDIR: '/mnt/ml_storage/scratch/atlas-1a-tmp', CUPY_CACHE_DIR: output + '/cupy-cache', CUDA_CACHE_PATH: output + '/cuda-cache' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const startup = new Promise((r, j) => { resolveReady = r; rejectReady = j; });
  const exited = new Promise(resolve => worker.once('close', (code, signal) => {
    const error = new Error('native worker exited');
    rejectReady(error); for (const job of pending.values()) job.reject(error); pending.clear(); resetWaiter?.reject(error);
    onEvent({ type: 'worker-exit', pid: worker.pid, code, signal }); resolve({ code, signal });
  }));
  worker.once('error', rejectReady);
  worker.stdin.on('error', error => { if (!closed) diagnostics.push(error.message); });
  worker.stderr.on('data', data => { diagnostics.push(data.toString().slice(0, 4096)); if (diagnostics.length > 128) diagnostics.shift(); });
  createInterface({ input: worker.stdout }).on('line', line => {
    let value;
    try { value = JSON.parse(line); } catch { diagnostics.push(line.slice(0, 4096)); return; }
    if (value.type === 'ready') { hello = value; resolveReady(value); onEvent({ type: 'worker-ready', pid: worker.pid, producer: value.producer }); return; }
    if (value.type === 'stopped') { stopped = true; return; }
    if (value.type === 'reset') { hello = { ...hello, producer: value.producer }; resetWaiter?.resolve(value.producer); resetWaiter = null; return; }
    if (value.type !== 'result') { diagnostics.push('unexpected native message'); return; }
    const job = pending.get(value.job);
    if (!job) { diagnostics.push('unowned native completion'); return; }
    pending.delete(value.job);
    if (canonicalJson(value.identity) !== canonicalJson(job.request.identity) || canonicalJson(value.producer) !== canonicalJson(job.request.producer)) job.reject(new Error('stale native completion identity'));
    else job.resolve(value);
  });
  const ready = deadline(startup, 30000, 'native startup');
  // Ownership exists before the caller awaits readiness. Close remains available
  // on startup failure, including a process that fails before its first JSON line.
  ready.catch(() => {});
  return Object.freeze({ ready, pid: worker.pid,
    hello: () => hello,
    async run(request) {
      if (closed || pending.size) throw new Error('native worker closed or already active');
      const job = ++sequence;
      const result = new Promise((resolve, reject) => { pending.set(job, { resolve, reject, request }); });
      worker.stdin.write(JSON.stringify({ ...request, job }) + '\n');
      try { return await deadline(result, 120000, 'native job'); }
      catch (error) { worker.kill('SIGTERM'); throw error; }
    },
    async reset() {
      if (closed || pending.size || resetWaiter) throw new Error('native reset requires idle worker');
      const wait = new Promise((resolve, reject) => { resetWaiter = { resolve, reject }; });
      worker.stdin.write(JSON.stringify({ type: 'reset' }) + '\n');
      return deadline(wait, 5000, 'native reset');
    },
    async close() {
      if (!closed) { closed = true; worker.stdin.end(JSON.stringify({ type: 'stop' }) + '\n'); }
      let exit;
      for (const [ms, signal] of [[5000, null], [3000, 'SIGTERM'], [3000, 'SIGKILL']]) {
        if (signal) worker.kill(signal);
        try { exit = await deadline(exited, ms, 'native close'); break; } catch { /* bounded escalation */ }
      }
      const result = { cleanup: !!exit, pid: worker.pid, exit, stopped, diagnostics };
      await fs.writeFile(output + '-controller.json', JSON.stringify(result, null, 2) + '\n');
      if (!result.cleanup) throw new Error('native process cleanup unconfirmed');
      return result;
    },
  });
}
