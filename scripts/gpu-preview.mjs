import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { WEBGPU_PREVIEW_ARGS } from '../src/space/render/webgpu/availability.js';

export function previewConfig(argv = [], env = process.env) {
  let selected = env.PORT || '5173';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port') selected = argv[++i];
    else if (argv[i].startsWith('--port=')) selected = argv[i].slice(7);
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  if (!/^\d+$/.test(String(selected)) || Number(selected) < 1 || Number(selected) > 65535) throw new Error('--port / PORT must be an integer from 1 to 65535');
  const port = String(Number(selected));
  const url = `http://localhost:${port}`;
  return { url, probeUrl: `http://127.0.0.1:${port}`, serverArgs: ['scripts/serve.mjs', '--port', port],
    serverEnv: { ...env, PORT: port }, browserArgs: [...WEBGPU_PREVIEW_ARGS, url] };
}

// Verified on this Linux workstation's NVIDIA RTX 6000 Ada. Use a separate
// profile so an existing Chrome process cannot discard these graphics flags.
async function main() {
const root = fileURLToPath(new URL('../', import.meta.url));
const config = previewConfig(process.argv.slice(2));
const { url } = config;
const profile = resolve(root, 'artifacts/runtime/chrome-gpu');
await mkdir(profile, { recursive: true });
let server, browser;
try {
  try { await fetch(config.probeUrl, { signal: AbortSignal.timeout(15000) }); } catch {
    server = spawn(process.execPath, config.serverArgs, { cwd: root, env: config.serverEnv, stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise((resolve, reject) => {
      server.stdout.once('data', data => { process.stdout.write(data); resolve(); });
      server.once('error', reject);
      server.once('exit', code => reject(new Error(`Preview server exited (${code}).`)));
    });
  }
  const args = [
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    ...config.browserArgs,
  ];
  console.log(`Opening ATLAS with NVIDIA/Vulkan graphics: ${url}\nSeparate Chrome profile: ${profile}\nClick the engine status in ATLAS to confirm the renderer.`);
  browser = spawn('google-chrome', args, { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
  const stop = () => { browser?.kill('SIGTERM'); server?.kill('SIGTERM'); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  await new Promise((resolve, reject) => {
    browser.once('error', reject);
    browser.once('exit', code => code ? reject(new Error(`Chrome exited (${code}).`)) : resolve());
  });
} catch (error) {
  console.error(error.message); process.exitCode = 1;
} finally { server?.kill('SIGTERM'); }

}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
