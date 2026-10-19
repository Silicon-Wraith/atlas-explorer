// spikes/project0/tests/evidence.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ROOT } from '../launch.mjs';
import { sha256, fixtureIdentity, launchIdentity, environmentIdentity, writeRecord } from '../evidence.mjs';

test('sha256 is the lowercase hex digest', () => {
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('fixture identity is exactly T4\'s verified identity, requested in non-candidate mode', async () => {
  const identity = { fixtureHash: 'a'.repeat(64), fixtureCommit: 'b'.repeat(40), specHash: 'c'.repeat(64) };
  let arg;
  assert.deepEqual(await fixtureIdentity({ readVerified: async candidate => { arg = candidate; return { identity }; } }), identity);
  assert.equal(arg, false);
  await assert.rejects(fixtureIdentity({ readVerified: async () => { throw new Error('fixture bytes differ from the freeze commit'); } }), /freeze commit/);
});

test('the configuration identity ignores only the verified fresh profile path', () => {
  const launch = (profile, extra = '', mode = 'headed') => ({ requestedArgs: ['--enable-gpu'], mode, profile, commandLine: `/opt/google/chrome/chrome --enable-gpu --user-data-dir=${profile}${extra}` });
  const a = launchIdentity(launch('/r/artifacts/runtime/project0-g6-1')), b = launchIdentity(launch('/r/artifacts/runtime/project0-g6-2'));
  assert.match(a.launchHash, /^[a-f0-9]{64}$/);
  assert.equal(a.launchHash, b.launchHash, 'fresh profiles are configuration-coherent');
  assert.notEqual(a.launchHash, launchIdentity(launch('/p', ' --enable-unsafe-webgpu')).launchHash, 'a changed GPU flag is detected');
  assert.notEqual(a.launchHash, launchIdentity(launch('/p', ' --no-sandbox')).launchHash, 'a sandbox change is detected');
  assert.notEqual(a.launchHash, launchIdentity(launch('/p', ' --headless', 'headless')).launchHash, 'mode and headless flags are detected');
  assert.throws(() => launchIdentity({ ...launch('/p'), profile: '/other' }), /exactly once \(found 0\)/);
  assert.throws(() => launchIdentity({ requestedArgs: [], mode: 'headed', commandLine: 'x --user-data-dir=/p --user-data-dir=/p', profile: '/p' }), /found 2/);
});

test('the persisted launch artefact recomputes the identity', () => {
  const info = { requestedArgs: ['--enable-gpu'], mode: 'headless', profile: '/p', commandLine: 'chrome --enable-gpu --user-data-dir=/p --headless' };
  assert.equal(launchIdentity(JSON.parse(JSON.stringify(info))).launchHash, launchIdentity(info).launchHash);
});

test('environment identity extracts the driver from chrome://gpu text, or refuses', () => {
  const text = 'Driver Information\nDriver vendor\tNVIDIA\nDriver version\t580.173.02\n';
  const env = environmentIdentity(text, { browserVersion: 'Google Chrome 151.0.7922.108', browserExecutable: '/opt/google/chrome/chrome', session: 'wayland' });
  assert.equal(env.driver, 'NVIDIA 580.173.02');
  assert.throws(() => environmentIdentity('nothing', { browserVersion: 'x', browserExecutable: 'y', session: 'z' }), /driver/);
});

test('writeRecord refuses artefact names that collide with each other or with the record', async () => {
  const base = resolve(ROOT, 'artifacts/runtime'); await mkdir(base, { recursive: true });
  const dir = await mkdtemp(join(base, 'p0-evidence-test-'));
  try {
    const record = { id: 'probe-headed' };
    await assert.rejects(writeRecord(dir, record, [{ name: 'probe-headed.json', data: '{}' }]), /collides with the record/);
    await assert.rejects(writeRecord(dir, record, [{ name: 'a.raw.json', data: '1' }, { name: 'a.raw.json', data: '2' }]), /duplicate artefact/);
    await writeRecord(dir, { id: 'ok' }, [{ name: 'ok.raw.json', data: '{"x":1}' }]);
    assert.deepEqual((await readdir(dir)).sort(), ['ok.json', 'ok.raw.json']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
