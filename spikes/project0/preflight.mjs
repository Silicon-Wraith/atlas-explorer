// spikes/project0/preflight.mjs — environment preflight. No adapter, no device, no shaders.
import { chromium } from 'playwright';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT, HARNESS_PATH, startServer, launchChrome, effectiveCommandLine, assertSandboxed } from './launch.mjs';

// Chrome's SingletonSocket path (<TMPDIR>/com.google.Chrome.XXXXXX/SingletonSocket) must fit in a 107-byte sun_path.
// artifacts/runtime is used when short enough; otherwise a short directory on the ZFS scratch dataset (never /tmp).
const runtimeDir = resolve(ROOT, 'artifacts/runtime');
process.env.TMPDIR = runtimeDir.length <= 60 ? runtimeDir : '/mnt/ml_storage/scratch/atlas-p0-tmp';
await mkdir(process.env.TMPDIR, { recursive: true });
const record = { kind: 'preflight', at: new Date().toISOString(), node: process.version, checks: [] };
let failed = false, server;
try {
  record.playwright = createRequire(import.meta.url)('playwright/package.json').version;
  record.chrome = (await promisify(execFile)('google-chrome', ['--version'])).stdout.trim();
  server = await startServer();
  const js = await fetch(`${server.url}/spikes/project0/browser/main.js`);
  record.checks.push({ name: 'module-mime', status: js.status, contentType: js.headers.get('content-type') });
  if (!js.ok || !/^text\/javascript/.test(js.headers.get('content-type') || '')) failed = true;
  for (const headless of [false, true]) {
    let launched;
    try {
      launched = await launchChrome({ headless, profileKind: headless ? 'preflight-headless' : 'preflight-headed', chromium });
      const commandLine = await effectiveCommandLine(launched.context);
      assertSandboxed(commandLine);
      const page = await launched.context.newPage();
      await page.goto(`${server.url}${HARNESS_PATH}?mode=preflight`);
      const result = await page.waitForFunction(() => window.p0Result, null, { timeout: 30000 }).then(h => h.jsonValue());
      const env = result.slots[0].raw;
      record.checks.push({ name: headless ? 'headless' : 'headed', profile: launched.profile, requestedArgs: launched.requestedArgs, commandLine, env });
      if (!env.isSecureContext || env.devicePixelRatio !== 1) failed = true;
    } finally { await launched?.context.close(); }
  }
} catch (error) { record.error = error.message; failed = true; }
finally { await server?.stop(); }
const dir = resolve(ROOT, 'artifacts/project0/preflight');
await mkdir(dir, { recursive: true });
await writeFile(resolve(dir, `${record.at.replace(/[-:.]/g, '')}.json`), JSON.stringify(record, null, 2));
console.log(JSON.stringify(record.checks.map(c => ({ name: c.name, ...(c.env ? { hasGpuObject: c.env.hasGpuObject, secure: c.env.isSecureContext } : { contentType: c.contentType }) })), null, 2));
if (failed) { console.error(`PREFLIGHT FAILED${record.error ? `: ${record.error}` : ''}`); process.exitCode = 1; } else console.log('PREFLIGHT OK');
