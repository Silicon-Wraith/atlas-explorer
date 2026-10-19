// spikes/project0/tests/launch.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { EventEmitter } from 'node:events';
import { ROOT, PORT, freshProfile, startServer, assertSandboxed, ATTEMPT1_ARGS } from '../launch.mjs';

async function scratchRoot() {
  const base = resolve(ROOT, 'artifacts/runtime'); await mkdir(base, { recursive: true });
  return mkdtemp(join(base, 'p0-launch-test-'));
}
function fakeChild({ exitOnTerm = true } = {}) {
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), signals: [], exitCode: null });
  child.kill = sig => { child.signals.push(sig); if (sig === 'SIGKILL' || exitOnTerm) setImmediate(() => { child.exitCode = 0; child.emit('exit', 0); }); };
  return child;
}

test('attempt-1 flags are exactly the documented Vulkan set, and the port is dedicated', () => {
  assert.deepEqual([...ATTEMPT1_ARGS], ['--enable-gpu', '--use-angle=vulkan', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan']);
  assert.equal(PORT, 5180);
});

test('freshProfile creates a new empty directory and refuses to reuse one', async () => {
  const root = await scratchRoot();
  try {
    const fixed = { root, now: () => new Date('2026-10-18T00:00:00Z'), rand: () => 'abcd' };
    const dir = await freshProfile('headed', fixed);
    assert.ok(dir.startsWith(resolve(root, 'artifacts/runtime/project0-headed-')));
    assert.deepEqual(await readdir(dir), []);
    await assert.rejects(freshProfile('headed', fixed), /profile already exists/);
    await assert.rejects(freshProfile('../evil', fixed), /invalid profile kind/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('an occupied port is refused — even a foreign server serving identical HTML — and nothing is spawned', async () => {
  let spawned = false;
  await assert.rejects(startServer({ probeFn: async () => true, spawnFn: () => { spawned = true; } }), /port 5180 is in use/);
  assert.equal(spawned, false);
});

test('the owned server gets PORT in its environment and --port, and stop() awaits its exit', async () => {
  const child = fakeChild(); let seen;
  const spawnFn = (cmd, args, opts) => { seen = { args, env: opts.env }; setImmediate(() => child.stdout.emit('data', 'ATLAS is ready')); return child; };
  const server = await startServer({ probeFn: async () => false, spawnFn });
  assert.deepEqual(seen.args, ['scripts/serve.mjs', '--port', '5180']); assert.equal(seen.env.PORT, '5180');
  assert.equal(server.url, 'http://127.0.0.1:5180');
  await server.stop();
  assert.deepEqual(child.signals, ['SIGTERM']); assert.equal(child.exitCode, 0);
});

test('stop() escalates to SIGKILL when the server ignores SIGTERM', async () => {
  const child = fakeChild({ exitOnTerm: false });
  const server = await startServer({ probeFn: async () => false, spawnFn: () => { setImmediate(() => child.stdout.emit('data', 'ready')); return child; }, stopMs: 50 });
  await server.stop();
  assert.deepEqual(child.signals, ['SIGTERM', 'SIGKILL']);
});

test('a server that never becomes ready is killed and reported', async () => {
  const child = fakeChild();
  await assert.rejects(startServer({ probeFn: async () => false, spawnFn: () => child, startMs: 50 }), /did not become ready/);
  assert.deepEqual(child.signals, ['SIGTERM']);
});

test('assertSandboxed rejects a command line without the sandbox or watchdog', () => {
  assert.doesNotThrow(() => assertSandboxed('/opt/google/chrome/chrome --enable-gpu --use-angle=vulkan'));
  assert.throws(() => assertSandboxed('/opt/google/chrome/chrome --no-sandbox --enable-gpu'), /sandbox/);
  assert.throws(() => assertSandboxed('chrome --disable-gpu-watchdog'), /watchdog/);
});
