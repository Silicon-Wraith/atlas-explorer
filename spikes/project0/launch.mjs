// spikes/project0/launch.mjs — Node-side launcher. Never requests a GPU adapter or device.
import { spawn as nodeSpawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const ATTEMPT1_ARGS = Object.freeze(['--enable-gpu', '--use-angle=vulkan', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan']);
export const HARNESS_PATH = '/spikes/project0/index.html';
export const PORT = 5180;
// Chrome's SingletonSocket (<TMPDIR>/com.google.Chrome.XXXXXX/SingletonSocket) must fit the 107-byte sun_path limit, so its TMPDIR is short and on ZFS.
export const CHROME_TMPDIR = '/mnt/ml_storage/scratch/atlas-p0-tmp';

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
    if (!(await exited(child, stopMs))) {
      child.kill('SIGKILL');
      if (!(await exited(child, stopMs))) throw new Error(`owned server on port ${port} did not exit after SIGTERM and SIGKILL`);
    }
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
  await mkdir(CHROME_TMPDIR, { recursive: true });
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chrome', chromiumSandbox: true, headless, args: [...args], env: { ...process.env, TMPDIR: CHROME_TMPDIR },
    viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, timeout: 30000,
  });
  return { context, profile, requestedArgs: [...args], headless };
}

export async function effectiveCommandLine(context) {
  const page = await context.newPage();
  try { await page.goto('chrome://version'); return await page.locator('#command_line').innerText(); }
  finally { await page.close(); }
}

// chrome://gpu (Chrome 151) renders into <info-view> open shadow roots, filled in asynchronously, so body.innerText is empty. This walks the
// open shadow roots; it must stay self-contained because Playwright serialises it into the page.
export function collectVisibleText() {
  const SKIP = new Set(['STYLE', 'SCRIPT']), INLINE = new Set(['A', 'B', 'I', 'EM', 'STRONG', 'CODE', 'SPAN']);
  const walk = node => {
    let out = node.shadowRoot ? walk(node.shadowRoot) : '';
    for (const child of node.childNodes) {
      if (child.nodeType === 3) out += child.textContent;
      else if (child.nodeType === 1 && !SKIP.has(child.tagName)) out += walk(child) + (INLINE.has(child.tagName) ? '' : '\n');
    }
    return out;
  };
  return walk(document.body);
}
// The chrome://gpu driver identity, fail closed. Chrome 151 lists each GPU as a `GPUn   :` label whose value is the next non-empty line (or the
// rest of the label line). Exactly one record must be `*ACTIVE*`, with exactly one non-empty DRIVER_VENDOR and DRIVER_VERSION; that record is the
// identity, whatever its vendor. Text outside the records is ignored. The legacy `Driver vendor`/`Driver version` rows are read only when the
// page has no GPU records at all, and each must then appear exactly once with a value.
export function activeGpuDriver(text) {
  const fail = why => { throw new Error(`chrome://gpu driver identity: ${why}`); };
  const unique = (values, what) => (values.length === 1 && values[0] ? values[0] : fail(`no unique non-empty driver ${what} ${values.length ? `(found ${JSON.stringify(values)})` : '(absent)'}`));
  const records = [...text.matchAll(/^GPU(\d+)[ \t]*:[ \t]*(?:\n[ \t]*)*([^\n]*)/gm)].map(([, index, value]) => ({ index, value }));
  if (!records.length) {
    const row = name => [...text.matchAll(new RegExp(`^[ \\t]*Driver ${name}[ \\t]*:?[ \\t]*(?:\\n[ \\t]*)*([^\\n]*)`, 'gm'))].map(m => m[1].trim());
    return { vendor: unique(row('vendor'), 'vendor row'), version: unique(row('version'), 'version row') };
  }
  if (new Set(records.map(r => r.index)).size !== records.length) fail('a GPU record is listed twice');
  const active = records.filter(r => r.value.includes('*ACTIVE*'));
  if (active.length !== 1) fail(`${active.length} active GPU records (exactly one required)`);
  const field = key => [...active[0].value.matchAll(new RegExp(`(?:^|[\\s,])${key}=([^,*\\n]*)`, 'g'))].map(m => m[1].trim());
  return { vendor: unique(field('DRIVER_VENDOR'), 'vendor in the active GPU record'), version: unique(field('DRIVER_VERSION'), 'version in the active GPU record') };
}
const GPU_READY = text => { if (!text.includes('Graphics Feature Status')) return false; try { activeGpuDriver(text); return true; } catch { return false; } };

// Bounded capture of the full visible chrome://gpu text (no WebGPU adapter is requested). Waits until the sections the environment identity needs
// are present and the active driver is unambiguous; expiry is a classified `browser hang` (a stop) whose error carries the latest text as
// `capturedText`. The page is always closed.
export async function chromeGpuText(context, { timeoutMs = 20000, pollMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs, left = () => Math.max(1, deadline - Date.now());
  const hang = what => new Error(`browser hang: chrome://gpu ${what} within ${timeoutMs} ms`);
  const within = async (promise, what) => { let timer; try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(hang(what)), left()); })]); } finally { clearTimeout(timer); } };
  const opening = context.newPage();
  const page = await within(opening, 'did not open').catch(error => { opening.then(late => late.close().catch(() => {}), () => {}); throw error; });   // a late page is closed
  let latest = '';
  try {
    await within(page.goto('chrome://gpu'), 'did not load');
    for (;;) {
      latest = await within(page.evaluate(collectVisibleText), 'did not answer');
      if (GPU_READY(latest)) return latest;
      if (Date.now() >= deadline) throw hang('did not fill in');
      await new Promise(r => setTimeout(r, Math.min(pollMs, left())));
    }
  } catch (error) { error.capturedText = latest; throw error; }   // the latest snapshot is evidence even when the capture fails
  finally { let timer; await Promise.race([page.close(), new Promise(r => { timer = setTimeout(r, 2000); })]).catch(() => {}); clearTimeout(timer); }
}

export function assertSandboxed(commandLine) {
  if (/(^|\s)--no-sandbox(\s|$)/.test(commandLine)) throw new Error('Chrome launched without its sandbox');
  if (/--disable-gpu-watchdog/.test(commandLine)) throw new Error('Chrome launched with the GPU watchdog disabled');
}

// Bounded `google-chrome --version`: a hung subprocess is killed and rejects instead of stalling the preflight.
export async function chromeVersion({ command = 'google-chrome', args = ['--version'], timeoutMs = 10000 } = {}) {
  return (await promisify(execFile)(command, args, { timeout: timeoutMs, killSignal: 'SIGKILL' })).stdout.trim();
}
