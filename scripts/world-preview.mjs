import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createApplicationServer } from './preparation/application-server.mjs';
import { observeOwnedProcesses } from './preparation/process-observer.mjs';
import { ownPreviewPages } from './preparation/page-lifetime.mjs';
import { PROJECT0_LAUNCH_ARGS } from '../tests/support/space-suite.mjs';
import { CHROME_TMPDIR, chromeLaunchEnv, within } from '../tests/support/bounded.mjs';

async function main() {
  if (process.env.ATLAS_GPU_DEFERRED) throw new Error('GPU work is deferred: ' + process.env.ATLAS_GPU_DEFERRED);
  if (process.env.ATLAS_WORLD_LOCKED !== '1') {
    const child = spawn('flock', ['-n', '--no-fork', '/mnt/ml_storage/scratch/atlas-gpu.lock', process.execPath, fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
      stdio: 'inherit', detached: true, env: { ...process.env, ATLAS_WORLD_LOCKED: '1', ATLAS_GPU_HANDOFF: process.env.ATLAS_GPU_HANDOFF ?? 'ATLAS prepared-world launcher, ' + new Date().toISOString() },
    });
    let stopping = false;
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => { if (!stopping) { stopping = true; child.kill(signal); } });
    process.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => resolve(code ?? 1)); }); return;
  }
  let port = 5196, runRoot, noBrowser = false, sourceWorld = null;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port') port = Number(argv[++i]); else if (argv[i] === '--run-root') runRoot = argv[++i]; else if (argv[i] === '--source-world') { if (!argv[i+1]) throw new Error('Source bundle path required'); sourceWorld = path.resolve(argv[++i]); } else if (argv[i] === '--no-browser') noBrowser = true; else throw new Error('Unknown argument ' + argv[i]);
  }
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535 || port === 5190) throw new Error('Choose a private application port');
  await fs.mkdir('/mnt/ml_storage/scratch/atlas-pc4', { recursive: true });
  runRoot = runRoot ? path.resolve(runRoot) : await fs.mkdtemp('/mnt/ml_storage/scratch/atlas-pc4/preview-');
  await runOwnedPreview({ runRoot, port, noBrowser, sourceWorld });
}

// Internal composition seam also exercises the actual launcher lifetime in the
// maintained headed suite. It is not a browser/debug HTTP endpoint.
export async function runOwnedPreview({ runRoot, port = 5196, noBrowser = false, sourceWorld = null, onReady = async () => {} }) {
  if (!process.env.ATLAS_GPU_HANDOFF || process.env.ATLAS_GPU_DEFERRED) throw new Error('Explicit hardware handoff required');
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535 || port === 5190) throw new Error('Choose a private application port');
  runRoot = path.resolve(runRoot);
  if (!runRoot.startsWith('/mnt/ml_storage/scratch/')) throw new Error('Transient world data requires a scratch output directory');
  await fs.mkdir(runRoot, { recursive: true }); await fs.mkdir(CHROME_TMPDIR, { recursive: true }); process.env.TMPDIR = CHROME_TMPDIR;
  const observer = observeOwnedProcesses(), report = { handoff: process.env.ATLAS_GPU_HANDOFF, runRoot, port, started: Date.now() }; let service, browser, context, pageOwner, finish, stopping = false;
  const done = new Promise(resolve => { finish = () => { stopping = true; resolve(); }; });
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, finish);
  try {
    service = await createApplicationServer({ runRoot, port, sourceWorld }); console.log('ATLAS prepared world is ready at http://127.0.0.1:' + port);
    if (!noBrowser && !stopping) {
      browser = await chromium.launch({ channel: 'chrome', headless: false, chromiumSandbox: true, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false, timeout: 30000, env: chromeLaunchEnv(), args: ['--disable-dev-shm-usage', ...PROJECT0_LAUNCH_ARGS] });
      context = await browser.newContext({ viewport: { width: 1280, height: 720 } }); pageOwner = ownPreviewPages({ context, browser, onEmpty: finish });
      const page = await context.newPage(); await page.goto('http://127.0.0.1:' + port); report.openedUrl = page.url(); report.title = await page.title(); report.browser = browser.version();
    }
    await onReady({ service, browser, context, finish, pageOwner });
    await observer.sample(); await done;
  } finally {
    pageOwner?.dispose(); for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.off(signal, finish);
    const errors = []; for (const [operation, ms] of [[() => context?.close(), 5000], [() => browser?.close(), 5000], [() => service?.close(), 20000]]) try { await within(operation(), ms, 'prepared-world shutdown'); } catch (error) { errors.push(error.message); }
    report.processes = await observer.stop(); report.cleanupErrors = errors; report.cleanup = !errors.length && !report.processes.alive.length && !report.processes.errors.length; report.ended = Date.now();
    await fs.writeFile(path.join(runRoot, 'launcher.json'), JSON.stringify(report, null, 2) + '\n'); if (!report.cleanup) throw new Error('Owned launcher cleanup unconfirmed');
  }
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
