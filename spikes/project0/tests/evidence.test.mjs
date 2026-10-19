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

test('environment identity reads the Chrome 151 GPU0 line (DRIVER_VENDOR/DRIVER_VERSION, ACTIVE device)', () => {
  const text = 'GPU0 : VENDOR= 0x10de, DRIVER_VENDOR=NVIDIA, DRIVER_VERSION=580.173.2.0 *ACTIVE*\nGPU1 : DRIVER_VENDOR=Other, DRIVER_VERSION=1.0\n';
  assert.equal(environmentIdentity(text, { browserVersion: 'x', browserExecutable: 'y', session: 'z' }).driver, 'NVIDIA 580.173.2.0');
});

// Fix round 4: the GPU records are parsed explicitly and fail closed. Fixtures use the real Chrome 151 shape: a `GPUn   :` label line,
// a blank line, then the record's value line.
const ENV = { browserVersion: 'x', browserExecutable: 'y', session: 'z' };
const rec = (n, value) => `GPU${n}                            :\n\n${value}\n\n`;
const NV = 'VENDOR= 0x10de [Google Inc. (NVIDIA)], DEVICE=0x26b1 [ANGLE (NVIDIA, Vulkan 1.4.312 (NVIDIA RTX 6000 Ada Generation (0x000026B1)), NVIDIA-580.173.2.0)], DRIVER_VENDOR=NVIDIA, DRIVER_VERSION=580.173.2.0';
const INTEL = 'VENDOR= 0x8086 [Google Inc. (Intel)], DEVICE=0x46a6 [ANGLE (Intel, Vulkan 1.3 (Intel(R) Graphics))], DRIVER_VENDOR=Intel, DRIVER_VERSION=24.0.5';
const driverOf = text => environmentIdentity(text, ENV).driver;

test('the real multi-line Chrome 151 GPU record gives the active driver', () => {
  assert.equal(driverOf(`Sandboxed :\n\nfalse\n\n${rec(0, `${NV} *ACTIVE*`)}Optimus :\n\nfalse\n`), 'NVIDIA 580.173.2.0');
});
test('a uniquely active integrated GPU keeps its own identity; an inactive NVIDIA entry does not replace it', () => {
  assert.equal(driverOf(rec(0, `${INTEL} *ACTIVE*`) + rec(1, NV)), 'Intel 24.0.5');
  assert.equal(driverOf(rec(0, NV) + rec(1, `${INTEL} *ACTIVE*`)), 'Intel 24.0.5');
});
test('two active GPU records are ambiguous and refused', () => {
  assert.throws(() => driverOf(rec(0, `${NV} *ACTIVE*`) + rec(1, `${INTEL} *ACTIVE*`)), /driver.*2 active/);
});
test('GPU records with no active marker are refused, even when legacy rows are present', () => {
  assert.throws(() => driverOf(rec(0, NV) + rec(1, INTEL) + 'Driver vendor\tLegacy\nDriver version\t1.0\n'), /driver.*0 active/);
});
test('an active record missing its vendor or version is refused, even when legacy rows are present', () => {
  const legacy = 'Driver vendor\tLegacy\nDriver version\t1.0\n';
  assert.throws(() => driverOf(rec(0, 'VENDOR= 0x10de, DRIVER_VERSION=580.173.2.0 *ACTIVE*') + legacy), /driver vendor/);
  assert.throws(() => driverOf(rec(0, 'VENDOR= 0x10de, DRIVER_VENDOR=NVIDIA *ACTIVE*') + legacy), /driver version/);
  assert.throws(() => driverOf(rec(0, 'VENDOR= 0x10de, DRIVER_VENDOR= , DRIVER_VERSION=580 *ACTIVE*')), /driver vendor/);
});
test('DRIVER_VERSION=, is an empty version, not ","', () => {
  assert.throws(() => driverOf(rec(0, 'VENDOR= 0x10de, DRIVER_VENDOR=NVIDIA, DRIVER_VERSION=, *ACTIVE*')), /driver version/);
});
test('a record with a repeated driver field is ambiguous and refused', () => {
  assert.throws(() => driverOf(rec(0, 'DRIVER_VENDOR=NVIDIA, DRIVER_VERSION=1, DRIVER_VERSION=2 *ACTIVE*')), /driver version/);
});
test('matching text outside any GPU record is ignored', () => {
  const stray = 'Log Messages\n[1:1] DRIVER_VENDOR=Evil, DRIVER_VERSION=6.6.6 *ACTIVE*\n';
  assert.throws(() => driverOf(stray), /driver/);                                       // no record and no legacy rows: refused
  assert.equal(driverOf(stray + rec(0, `${NV} *ACTIVE*`)), 'NVIDIA 580.173.2.0');        // the record decides, the stray line does not
  assert.equal(driverOf(rec(0, INTEL) + stray + rec(1, `${NV} *ACTIVE*`)), 'NVIDIA 580.173.2.0');
});
test('legacy rows are used only without modern records, and must themselves be unambiguous', () => {
  assert.equal(driverOf('Driver vendor   :\n\nNVIDIA\n\nDriver version   :\n\n580.1\n'), 'NVIDIA 580.1');
  assert.throws(() => driverOf('Driver vendor\tA\nDriver vendor\tB\nDriver version\t1\n'), /driver vendor/);
  assert.throws(() => driverOf('Driver vendor\tA\n'), /driver version/);
});
test('a GPU record label listed twice is ambiguous and refused', () => {
  assert.throws(() => driverOf(rec(0, `${NV} *ACTIVE*`) + rec(0, INTEL)), /listed twice/);
});

// Fix round 5: labels and values are tokenised separately. A recognised label that comes before a value means the value is missing; a value never
// swallows the next label, row or field.
test('adjacent legacy labels: a label never becomes the previous row\'s value (Codex r5)', () => {
  assert.throws(() => driverOf('Driver vendor\nDriver version\t580.1\n'), /driver vendor/);
  assert.throws(() => driverOf('Driver vendor\tNVIDIA\nDriver version\nDriver vendor\tNVIDIA\n'), /driver (vendor|version)/);
  assert.throws(() => driverOf('Driver version   :\n\nDriver vendor   :\n\nNVIDIA\n'), /driver version/);
});
test('an empty GPU record does not swallow the next record label, so duplicates stay visible (Codex r5)', () => {
  assert.throws(() => driverOf(`GPU0                            :\n\n${rec(0, `${NV} *ACTIVE*`)}`), /listed twice/);
  assert.throws(() => driverOf(`GPU0                            :\n\n${rec(1, `${NV} *ACTIVE*`)}`), /GPU0 has no value/);
});
test('a GPU record followed by an unrelated label has a missing value', () => {
  assert.throws(() => driverOf(`GPU0                            :\n\nOptimus                         :\n\nfalse\n\n${rec(1, `${NV} *ACTIVE*`)}`), /GPU0 has no value/);
});
test('a driver field value never swallows the next field', () => {
  assert.throws(() => driverOf(rec(0, 'VENDOR= 0x10de, DRIVER_VENDOR= DRIVER_VERSION=580.173.2.0 *ACTIVE*')), /driver vendor/);
});
