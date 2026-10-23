import test from 'node:test';
import assert from 'node:assert/strict';
import { previewConfig } from '../../scripts/gpu-preview.mjs';
import { WEBGPU_PREVIEW_ARGS, webgpuUnavailable } from '../../src/space/render/webgpu/availability.js';
import { acquireDevice } from '../../src/space/render/webgpu/device.js';

test('GPU preview uses one selected port for its URL probe and spawned server', () => {
  for (const [args, env, expected] of [[[], {}, 5173], [[], { PORT: '5195' }, 5195], [['--port', '5196'], { PORT: '5173' }, 5196], [['--port=5197'], {}, 5197]]) {
    const config = previewConfig(args, env);
    assert.equal(config.url, `http://localhost:${expected}`);
    assert.equal(config.probeUrl, `http://127.0.0.1:${expected}`);
    assert.deepEqual(config.serverArgs, ['scripts/serve.mjs', '--port', String(expected)]);
    assert.equal(config.serverEnv.PORT, String(expected));
    for (const flag of WEBGPU_PREVIEW_ARGS) assert.ok(config.browserArgs.includes(flag));
  }
  for (const args of [['--port'], ['--port', '0'], ['--port', '65536'], ['--port', 'NaN'], ['--wat']]) assert.throws(() => previewConfig(args, {}));
});

test('WebGPU guidance is UI text selected by acquisition code and keeps the backend reason intact', async () => {
  for (const code of ['no-webgpu', 'no-adapter']) {
    const reason = 'original failure';
    const text = webgpuUnavailable(reason, code);
    assert.ok(text.startsWith(reason));
    assert.match(text, /HTTPS|localhost/);
    assert.match(text, /graphics acceleration/i);
    assert.match(text, /npm run dev:gpu/);
    assert.match(text, /separate.*profile/i);
    assert.doesNotMatch(text, /5195|this Linux workstation/);
    for (const flag of WEBGPU_PREVIEW_ARGS) assert.ok(text.includes(flag));
  }
  assert.equal(webgpuUnavailable('device refused for a reason', 'device-refused'), 'device refused for a reason');
  await assert.rejects(acquireDevice({gpu:null}), error => {
    assert.equal(error.code, 'no-webgpu');
    assert.equal(error.message, 'navigator.gpu is unavailable in this browser');
    return true;
  });
});
