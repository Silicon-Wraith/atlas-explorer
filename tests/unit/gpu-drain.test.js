import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { LIMITS, drainWebGL, drainGpuWithin, BoundedWaitTimeout, closeWithin, cleanupState } from '../support/bounded.mjs';
import { cleanupPages } from '../support/workflow-cleanup.mjs';
import { validateEvidence, classifySuiteRun } from '../../scripts/gate/lib.mjs';

// A queued GPU: a fence cannot signal without a task yield, and readback must follow the signal.
// Distinct read/draw framebuffers, a pack buffer, and nondefault pack/read state catch state leaks.
function fakeGpu({ statuses = ['TIMEOUT_EXPIRED', 'CONDITION_SATISFIED'], errorAt, loseAt, nullFence = false, readThrows = false } = {}) {
  const calls = [], framebuffer = {}, drawFramebuffer = {}, packBuffer = {}, sync = {};
  const constants = ['NO_ERROR', 'INVALID_OPERATION', 'SYNC_GPU_COMMANDS_COMPLETE', 'ALREADY_SIGNALED', 'CONDITION_SATISFIED', 'TIMEOUT_EXPIRED', 'WAIT_FAILED', 'READ_FRAMEBUFFER', 'DRAW_FRAMEBUFFER', 'READ_FRAMEBUFFER_BINDING', 'DRAW_FRAMEBUFFER_BINDING', 'READ_BUFFER', 'BACK', 'NONE', 'COLOR_ATTACHMENT0', 'PIXEL_PACK_BUFFER', 'PIXEL_PACK_BUFFER_BINDING', 'PACK_ALIGNMENT', 'PACK_ROW_LENGTH', 'PACK_SKIP_ROWS', 'PACK_SKIP_PIXELS', 'RGBA', 'UNSIGNED_BYTE'];
  const gl = Object.fromEntries(constants.map((key, index) => [key, index]));
  const state = new Map([
    [gl.READ_FRAMEBUFFER_BINDING, framebuffer], [gl.DRAW_FRAMEBUFFER_BINDING, drawFramebuffer],
    [gl.PIXEL_PACK_BUFFER_BINDING, packBuffer], [gl.PACK_ALIGNMENT, 8], [gl.PACK_ROW_LENGTH, 9],
    [gl.PACK_SKIP_ROWS, 2], [gl.PACK_SKIP_PIXELS, 3],
  ]);
  const readBuffers = new Map([[null, gl.NONE], [framebuffer, gl.COLOR_ATTACHMENT0]]);
  let clock = 0, yielded = false, signaled = false, error = gl.NO_ERROR, lost = false, poll = 0;
  const note = name => { calls.push(name); if (name === errorAt) error = gl.INVALID_OPERATION; if (name === loseAt) lost = true; };
  Object.assign(gl, {
    isContextLost: () => lost,
    getError: () => { const value = error; error = gl.NO_ERROR; return value; },
    fenceSync: (condition, flags) => { assert.equal(condition, gl.SYNC_GPU_COMMANDS_COMPLETE); assert.equal(flags, 0); note('fence'); return nullFence ? null : sync; },
    flush: () => note('flush'),
    clientWaitSync: (value, flags, timeout) => {
      assert.equal(value, sync); assert.equal(flags, 0); assert.equal(timeout, 0);
      assert.ok(yielded, 'polls must yield to a task, including the first poll'); yielded = false;
      note('poll');
      const status = gl[statuses[Math.min(poll++, statuses.length - 1)]];
      signaled = status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED;
      return status;
    },
    deleteSync: value => { assert.equal(value, sync); note('delete'); },
    getParameter: key => key === gl.READ_BUFFER ? readBuffers.get(state.get(gl.READ_FRAMEBUFFER_BINDING)) : state.get(key),
    bindFramebuffer: (target, value) => {
      assert.equal(target, gl.READ_FRAMEBUFFER, 'draw binding must never be changed');
      state.set(gl.READ_FRAMEBUFFER_BINDING, value); note('bind-read');
    },
    readBuffer: value => { readBuffers.set(state.get(gl.READ_FRAMEBUFFER_BINDING), value); note('read-buffer'); },
    bindBuffer: (target, value) => { assert.equal(target, gl.PIXEL_PACK_BUFFER); state.set(gl.PIXEL_PACK_BUFFER_BINDING, value); note('bind-pack'); },
    pixelStorei: (key, value) => { state.set(key, value); note('pack-state'); },
    readPixels: (x, y, width, height, format, type, pixel) => {
      assert.ok(signaled, 'readback validates an already-signaled fence');
      assert.deepEqual([x, y, width, height, format, type], [0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE]);
      assert.equal(state.get(gl.READ_FRAMEBUFFER_BINDING), null);
      assert.equal(readBuffers.get(null), gl.BACK);
      assert.equal(state.get(gl.PIXEL_PACK_BUFFER_BINDING), null);
      for (const key of [gl.PACK_ROW_LENGTH, gl.PACK_SKIP_ROWS, gl.PACK_SKIP_PIXELS]) assert.equal(state.get(key), 0);
      assert.equal(pixel.byteLength, 4);
      note('read'); clock += 3;
      if (readThrows) throw new Error('readback exception');
      pixel.set([17, 34, 51, 255]);
    },
  });
  const snapshot = () => ({ state: [...state], readBuffers: [...readBuffers] });
  const initial = snapshot();
  return {
    gl, calls, snapshot, initial,
    options: { gl, ms: 50, now: () => clock, yieldTask: async () => { note('yield'); clock += 5; yielded = true; } },
    lose: () => { lost = true; }, error: () => { error = gl.INVALID_OPERATION; },
  };
}

test('GPU drain yields for a fence then validates completion by readback', async () => {
  const gpu = fakeGpu();
  const result = await drainWebGL(gpu.options);
  assert.equal(result.status, 'complete');
  assert.deepEqual(gpu.calls.filter(call => ['fence', 'flush', 'yield', 'poll', 'read', 'delete'].includes(call)), ['fence', 'flush', 'yield', 'poll', 'yield', 'poll', 'read', 'delete']);
  assert.deepEqual(result.pixel, [17, 34, 51, 255]);
  assert.equal(result.polls, 2);
  assert.equal(result.fenceMs, 10);
  assert.equal(result.readbackMs, 3);
  assert.equal(result.elapsedMs, 13);
  assert.deepEqual(gpu.snapshot(), gpu.initial);
});

test('an already-signaled fence still yields once and requires readback', async () => {
  const gpu = fakeGpu({ statuses: ['ALREADY_SIGNALED'] });
  assert.equal((await drainWebGL(gpu.options)).polls, 1);
  assert.equal(gpu.calls.filter(call => call === 'read').length, 1);
});

test('a fence timeout fails without readback and deletes the sync', async () => {
  const gpu = fakeGpu({ statuses: ['TIMEOUT_EXPIRED'] });
  await assert.rejects(drainWebGL({ ...gpu.options, ms: 12 }), error => error.code === 'ATLAS_WAIT_TIMEOUT');
  assert.ok(!gpu.calls.includes('read'));
  assert.equal(gpu.calls.at(-1), 'delete');
  assert.deepEqual(gpu.snapshot(), gpu.initial);
});

test('WAIT_FAILED is a drain failure even without a GL error', async () => {
  const gpu = fakeGpu({ statuses: ['WAIT_FAILED'] });
  await assert.rejects(drainWebGL(gpu.options), /WAIT_FAILED/);
  assert.ok(!gpu.calls.includes('read'));
  assert.equal(gpu.calls.at(-1), 'delete');
});

test('an unexpected fence status fails on the first poll without readback', async () => {
  const gpu = fakeGpu({ statuses: ['BOGUS'] });
  gpu.gl.BOGUS = 0xffff;
  await assert.rejects(drainWebGL(gpu.options), error => {
    assert.equal(error.code, 'ATLAS_GPU_DRAIN_FAILED');
    assert.match(error.message, /unexpected fence status/);
    return true;
  });
  assert.equal(gpu.calls.filter(call => call === 'poll').length, 1);
  assert.ok(!gpu.calls.includes('read'));
  assert.equal(gpu.calls.at(-1), 'delete');
  assert.deepEqual(gpu.snapshot(), gpu.initial);
});

test('failure to create a fence cannot become successful readback evidence', async () => {
  const gpu = fakeGpu({ nullFence: true });
  await assert.rejects(drainWebGL(gpu.options), /fence/i);
  assert.ok(!gpu.calls.includes('read'));
  assert.ok(!gpu.calls.includes('delete'));
});

test('preexisting context loss and GL errors fail before creating a fence', async () => {
  for (const fault of ['lose', 'error']) {
    const gpu = fakeGpu(); gpu[fault]();
    await assert.rejects(drainWebGL(gpu.options), error => error.code === 'ATLAS_GPU_DRAIN_FAILED');
    assert.deepEqual(gpu.calls, []);
  }
});

for (const stage of ['fence', 'flush', 'poll', 'read', 'delete']) {
  test(`GL errors at ${stage} fail the drain and preserve bindings`, async () => {
    const gpu = fakeGpu({ errorAt: stage });
    await assert.rejects(drainWebGL(gpu.options), error => error.code === 'ATLAS_GPU_DRAIN_FAILED');
    assert.deepEqual(gpu.snapshot(), gpu.initial);
    assert.equal(gpu.calls.at(-1), 'delete');
  });
}

for (const stage of ['yield', 'read']) {
  test(`context loss during ${stage} cannot count as successful rendering`, async () => {
    const gpu = fakeGpu({ loseAt: stage });
    await assert.rejects(drainWebGL(gpu.options), /context lost/i);
    assert.equal(gpu.calls.at(-1), 'delete');
  });
}

test('readback exceptions restore all bindings and delete the sync', async () => {
  const gpu = fakeGpu({ readThrows: true });
  await assert.rejects(drainWebGL(gpu.options), /readback exception/);
  assert.deepEqual(gpu.snapshot(), gpu.initial);
  assert.equal(gpu.calls.at(-1), 'delete');
});

test('readback that exceeds the drain deadline is a failure', async () => {
  const gpu = fakeGpu({ statuses: ['ALREADY_SIGNALED'] });
  await assert.rejects(drainWebGL({ ...gpu.options, ms: 7 }), error => error.code === 'ATLAS_WAIT_TIMEOUT');
  assert.deepEqual(gpu.snapshot(), gpu.initial);
  assert.equal(gpu.calls.at(-1), 'delete');
});

test('CPU pages have an explicit no-WebGL result, not GPU completion', async () => {
  assert.deepEqual(await drainWebGL({ gl: null, ms: 50 }), { status: 'no-webgl' });
});

test('a drain requires a finite positive bound', async () => {
  for (const ms of [0, -1, Infinity, NaN]) await assert.rejects(drainWebGL({ gl: null, ms }), RangeError);
});

test('the page helper waits for application idle and serializes the drain without module closures', async () => {
  const gpu = fakeGpu({ statuses: ['ALREADY_SIGNALED'] }), calls = [];
  const sandbox = {
    atlas: { renderer: { gl: gpu.gl }, whenIdle: async () => { calls.push('idle'); } },
    performance: { now: gpu.options.now },
    setTimeout: callback => { gpu.options.yieldTask().then(callback); },
  };
  const page = { evaluate: (fn, arg) => { calls.push('evaluate'); return runInNewContext(`(${fn.toString()})(arg)`, { ...sandbox, arg }); } };
  const result = await drainGpuWithin(page, 50);
  assert.equal(result.status, 'complete');
  assert.deepEqual(calls, ['evaluate', 'idle', 'evaluate']);
  assert.deepEqual(gpu.snapshot(), gpu.initial);
});

test('an unresponsive page is bounded outside the browser', async () => {
  await assert.rejects(drainGpuWithin({ evaluate: () => new Promise(() => {}) }, 10), BoundedWaitTimeout);
});

function cleanupFixture(kind) {
  const calls = [], written = [];
  const report = kind === 'browser' ? [{ name: 'rendered' }] : ['gpu', 'cpu'].map(backend => ({ backend, frames: 2, renderedPerWheel: 1, burst: { commits: 1 } }));
  const suite = { evidence: kind, requiredPasses: ['rendered'] };
  return { calls, written, suite, options: {
    pages: ['first', 'second'], report,
    drain: async page => { calls.push(`drain ${page}`); if (page === 'first') throw new BoundedWaitTimeout('drain GPU work', 5); },
    writeReport: async entries => { calls.push('write'); written.push(JSON.parse(JSON.stringify(entries))); },
    closeAll: async () => { calls.push('close'); }, log: () => {},
  } };
}

for (const kind of ['browser', 'navigation']) {
  test(`a ${kind} drain failure fails the suite and persists before successful closes`, async () => {
    const { calls, written, suite, options } = cleanupFixture(kind);
    assert.equal(validateEvidence(suite, { report: options.report }).ok, true, 'fixture starts passing');
    assert.equal(await cleanupPages(options), true);
    assert.deepEqual(calls, ['drain first', 'drain second', 'write', 'close']);
    assert.match(written[0].find(entry => entry.name === 'FAIL').error, /drain GPU work/);
    const classified = classifySuiteRun({ exitCode: 0, signal: null, timedOut: false }, validateEvidence(suite, { report: written[0] }));
    assert.equal(classified.state, 'failed', 'persisted failure cannot be accepted even with exit zero');
  });
}

test('clean page drains keep the suite successful and write before closing', async () => {
  const { calls, options } = cleanupFixture('browser');
  options.drain = async page => { calls.push(`drain ${page}`); };
  assert.equal(await cleanupPages(options), false);
  assert.deepEqual(calls, ['drain first', 'drain second', 'write', 'close']);
  assert.ok(!options.report.some(entry => entry.name === 'FAIL'));
});

test('a failed report write still fails the suite and attempts cleanup', async () => {
  const { calls, options } = cleanupFixture('browser');
  options.drain = async () => {};
  options.writeReport = async () => { calls.push('write'); throw new Error('disk full'); };
  assert.equal(await cleanupPages(options), true);
  assert.deepEqual(calls, ['write', 'close']);
});

test('drain failure is persisted before a terminal unconfirmed close', async () => {
  const { written, options } = cleanupFixture('browser');
  class Stopped extends Error {}
  const originalError = console.error, exits = [];
  console.error = () => {};
  options.closeAll = () => closeWithin({ close: () => Promise.reject(new Error('close failed')) }, 'test', {
    exit: code => { exits.push(code); throw new Stopped(); },
  });
  try {
    await assert.rejects(cleanupPages(options), Stopped);
    assert.deepEqual(exits, [125]);
    assert.ok(written[0].some(entry => entry.name === 'FAIL'));
    assert.equal(cleanupState.unconfirmed, true);
  } finally { console.error = originalError; cleanupState.unconfirmed = false; }
});

// Execute the suites' actual finalizers with injected resources: this catches a caller that
// forgets to use the shared cleanup or ignores its failed result, without launching anything.
for (const suite of ['browser', 'navigation']) {
  for (const checkpointFails of [false, true]) test(`${suite} finalizer checkpoints before draining and persists drain failure${checkpointFails ? ' when the first write fails' : ''}`, async () => {
    const source = readFileSync(new URL(`../${suite}.mjs`, import.meta.url), 'utf8');
    const body = source.slice(source.lastIndexOf('} finally {') + '} finally {'.length, source.lastIndexOf('}'));
    const calls = [], written = [], report = [{ name: 'FAIL', error: 'original suite failure' }], processState = { exitCode: 0 };
    const page = {}, context = { pages: () => [page] };
    const write = async entries => {
      calls.push('write');
      if (checkpointFails && calls.length === 1) throw new Error('checkpoint write failed');
      written.push(JSON.parse(JSON.stringify(entries)));
    };
    await runInNewContext(`(async () => { ${body} })()`, {
      browser: { contexts: () => [context] }, server: { kill: () => calls.push('kill') },
      report, reportPath: 'unused', record: false, process: processState,
      writeReport: write, writeFile: async (path, data) => write(JSON.parse(data)),
      drainGpuWithin: async target => { assert.equal(target, page); calls.push('drain'); throw new Error('injected GPU timeout'); },
      cleanupPages: options => cleanupPages({ ...options, log: () => {} }),
      closeWithin: async () => { calls.push('close'); },
    });
    assert.equal(processState.exitCode, 1);
    assert.deepEqual(calls, ['write', 'drain', 'write', 'close', 'close', 'kill']);
    if (!checkpointFails) assert.deepEqual(written[0], [{ name: 'FAIL', error: 'original suite failure' }], 'the original failure is on disk before a drain can hang');
    assert.equal(written.length, checkpointFails ? 1 : 2);
    assert.match(written.at(-1).at(-1).error, /injected GPU timeout/);
  });

  test(`${suite} routes every close through draining and drains before each reload`, () => {
    const source = readFileSync(new URL(`../${suite}.mjs`, import.meta.url), 'utf8');
    // Like T00's bounded-call checker, this guards the suites' current source shape. The body
    // tests above/below establish that these two allowed close sites actually drain their pages.
    const helper = source.match(/async function closeDrained\([\s\S]*?\n\}/)?.[0];
    const finalizer = source.slice(source.lastIndexOf('} finally {'));
    const closeAll = finalizer.match(/    closeAll: async \(\) => \{[\s\S]*?\n    \},/)?.[0];
    assert.ok(helper && closeAll, 'both draining close sites must be identifiable');
    assert.doesNotMatch(source, /\.\s*close\s*\(/, 'raw close bypasses draining and bounded cleanup');
    assert.doesNotMatch(source.replace(helper, '').replace(closeAll, ''), /\bcloseWithin\s*\(/, 'plain close outside a draining cleanup');
    for (const reload of source.matchAll(/\b(\w+)\.reload\s*\(/g)) {
      const precedingDrain = new RegExp(`await\\s+drainGpuWithin\\(\\s*${reload[1]}\\s*\\)\\s*;\\s*(?://[^\\n]*\\n\\s*)?await\\s*$`);
      assert.match(source.slice(0, reload.index), precedingDrain, `${reload[1]}.reload must immediately follow a drain of the same page`);
    }
  });

  test(`${suite} early close persists a failed drain and aborts the suite`, async () => {
    const source = readFileSync(new URL(`../${suite}.mjs`, import.meta.url), 'utf8');
    const start = source.indexOf('async function closeDrained(');
    const declaration = source.slice(start, source.indexOf('\n}', start) + 2);
    const calls = [], written = [], page = {}, resource = suite === 'navigation' ? page : {};
    await assert.rejects(runInNewContext(`(async () => { ${declaration}; await closeDrained(resource, 'test', [page]); })()`, {
      page, resource, report: [],
      drainGpuWithin: async target => { assert.equal(target, page); calls.push('drain'); throw new Error('injected drain failure'); },
      writeReport: async entries => { calls.push('write'); written.push(JSON.parse(JSON.stringify(entries))); },
      cleanupPages: options => cleanupPages({ ...options, log: () => {} }),
      closeWithin: async target => { assert.equal(target, resource); calls.push('close'); },
    }), /GPU drain or report failed/);
    assert.deepEqual(calls, ['drain', 'write', 'close']);
    assert.match(written[0][0].error, /injected drain failure/);
  });
}

test('navigation timing excludes prior work and distinguishes submission from validated completion', async () => {
  const source = readFileSync(new URL('../browser.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('  const precedingDrain =');
  const body = source.slice(start, source.indexOf('\n  assert.ok(Math.abs(response.final', start));
  let clock = 0, drains = 0;
  const result = await runInNewContext(`(async () => { ${body}; return response; })()`, {
    page: {}, LIMITS, assert, performance: { now: () => clock },
    within: (promise, ms, label) => { assert.equal(ms, LIMITS.deep); assert.equal(label, 'repeated GPU navigation'); return promise; },
    ev: async (page, fn, arg, label, ms) => {
      assert.equal(drains, 1, 'the old backlog must be drained before navigation');
      assert.equal(ms, LIMITS.deep); clock += 10;
      return { initial: 3, final: 5, width: 1280, height: 720 };
    },
    drainGpuWithin: async (page, ms) => {
      drains++;
      if (drains === 2) assert.equal(ms, LIMITS.deep - 10, 'completion uses the remaining original bound');
      clock += drains === 1 ? 100 : 20;
      return { status: 'complete', fenceMs: 15, readbackMs: 5 };
    },
  });
  assert.equal(drains, 2);
  assert.equal(result.submissionMs, 10);
  assert.equal(result.completionMs, 30);
  assert.equal(result.completion.readbackMs, 5);
});

for (const missing of ['preceding', 'completion']) {
  test(`GPU navigation timing rejects no-webgl from the ${missing} drain`, async () => {
    const source = readFileSync(new URL('../browser.mjs', import.meta.url), 'utf8');
    const start = source.indexOf('  const precedingDrain =');
    const body = source.slice(start, source.indexOf('\n  assert.ok(Math.abs(response.final', start));
    let drains = 0;
    await assert.rejects(runInNewContext(`(async () => { ${body} })()`, {
      page: {}, LIMITS, assert, performance: { now: () => 0 },
      within: promise => promise, ev: async () => ({}),
      drainGpuWithin: async () => {
        drains++;
        return { status: drains === (missing === 'preceding' ? 1 : 2) ? 'no-webgl' : 'complete' };
      },
    }), error => error.code === 'ERR_ASSERTION' && /GPU/.test(error.message));
    assert.equal(drains, missing === 'preceding' ? 1 : 2, 'reject at the first invalid completion observation');
  });
}
