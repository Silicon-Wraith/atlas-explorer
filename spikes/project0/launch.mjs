// spikes/project0/launch.mjs — Node-side launcher. Never requests a GPU adapter or device.
import { spawn as nodeSpawn } from 'node:child_process';
import { mkdir, readdir } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const ATTEMPT1_ARGS = Object.freeze(['--enable-gpu', '--use-angle=vulkan', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan']);
export const HARNESS_PATH = '/spikes/project0/index.html';
export const PORT = 5180;

export async function freshProfile(kind, { root = ROOT, now = () => new Date(), rand = () => randomBytes(4).toString('hex') } = {}) {
  if (!/^[a-z0-9-]+$/.test(kind)) throw new Error(`invalid profile kind: ${kind}`);
  const base = resolve(root, 'artifacts/runtime');
  await mkdir(base, { recursive: true });
  const dir = join(base, `project0-${kind}-${now().toISOString().replace(/[-:.]/g, '')}-${rand()}`);
  try { await mkdir(dir); } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`profile already exists: ${dir}`);
    throw error;
  }
  if ((await readdir(dir)).length) throw new Error(`profile not empty: ${dir}`);
  return dir;
}

// true if something accepts TCP connections on 127.0.0.1:port.
export const portInUse = port => new Promise(done => {
  const socket = createConnection({ host: '127.0.0.1', port });
  socket.once('connect', () => { socket.destroy(); done(true); });
  socket.once('error', () => done(false));
});

const exited = (child, ms) => new Promise(done => {
  if (child.exitCode !== null) return done(true);
  const timer = setTimeout(() => done(false), ms);
  child.once('exit', () => { clearTimeout(timer); done(true); });
});

export async function startServer({ port = PORT, probeFn = portInUse, spawnFn = nodeSpawn, root = ROOT, startMs = 10000, stopMs = 5000 } = {}) {
  if (await probeFn(port)) throw new Error(`port ${port} is in use; Project 0 never adopts an existing listener`);
  const child = spawnFn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  const stop = async () => {
    child.kill('SIGTERM');
    if (!(await exited(child, stopMs))) { child.kill('SIGKILL'); await exited(child, stopMs); }
  };
  const ready = await new Promise(done => {
    const timer = setTimeout(() => done(false), startMs);
    child.stdout.once('data', () => { clearTimeout(timer); done(true); });
    child.once?.('error', () => { clearTimeout(timer); done(false); });
    child.once?.('exit', () => { clearTimeout(timer); done(false); });
  });
  if (!ready) { await stop(); throw new Error(`owned server on port ${port} did not become ready within ${startMs} ms`); }
  return { url: `http://127.0.0.1:${port}`, stop };
}

export async function launchChrome({ headless, args = ATTEMPT1_ARGS, profileKind, chromium }) {
  const profile = await freshProfile(profileKind);
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chrome', chromiumSandbox: true, headless, args: [...args],
    viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, timeout: 30000,
  });
  return { context, profile, requestedArgs: [...args], headless };
}

export async function effectiveCommandLine(context) {
  const page = await context.newPage();
  try { await page.goto('chrome://version'); return await page.locator('#command_line').innerText(); }
  finally { await page.close(); }
}

export function assertSandboxed(commandLine) {
  if (/(^|\s)--no-sandbox(\s|$)/.test(commandLine)) throw new Error('Chrome launched without its sandbox');
  if (/--disable-gpu-watchdog/.test(commandLine)) throw new Error('Chrome launched with the GPU watchdog disabled');
}
