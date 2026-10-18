import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Verified on this Linux workstation's NVIDIA RTX 6000 Ada. Use a separate
// profile so an existing Chrome process cannot discard these graphics flags.
const root = fileURLToPath(new URL('../', import.meta.url));
const url = 'http://localhost:5173';
const profile = resolve(root, 'artifacts/runtime/chrome-gpu');
await mkdir(profile, { recursive: true });
let server, browser;
try {
  try { await fetch('http://127.0.0.1:5173'); } catch {
    server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise((resolve, reject) => {
      server.stdout.once('data', data => { process.stdout.write(data); resolve(); });
      server.once('error', reject);
      server.once('exit', code => reject(new Error(`Preview server exited (${code}).`)));
    });
  }
  const args = [
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--enable-gpu', '--use-angle=vulkan',
    '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', url,
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
