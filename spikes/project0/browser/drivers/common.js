// spikes/project0/browser/drivers/common.js — shared driver helpers. Each session owns one abort signal, wired to the watchdog and,
// to unexpected device loss — all installed before the first submission. Only an explicitly armed loss (G13) is exempt: the exemption
// is consumed by the first loss of the armed epoch and covers nothing else.
import { acquire, destroy, onLoss } from '../../gpu/device.js';
import { prepareViewport, Renderer } from '../../gpu/renderer.js';
import { createAllocator } from '../../gpu/alloc.js';
import { createWatchdog } from '../../gpu/watchdog.js';
import { createAbort, invalidationFor } from '../../gpu/abort.js';
import * as events from '../events.js';

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function session(fixtures, status, { alloc = createAllocator({ capBytes: fixtures.resources.capBytes }) } = {}) {
  const abort = createAbort(), losses = []; let armed = null;
  const watchdog = createWatchdog({ onStall: stall => abort.abort({ kind: 'stall', outstanding: stall.outstanding }) });
  const off = onLoss(info => {
    losses.push(info);
    if (armed !== null && info.epoch === armed) { armed = null; return; }            // the one deliberately armed loss
    abort.abort({ kind: 'device-lost', message: info.reason });
  });
  events.clear();
  let device, info, epoch, viewport, renderer;
  try {
    ({ device, info, epoch } = await acquire({ requiredFeatures: ['timestamp-query'] }));
    viewport = await prepareViewport(device, alloc, status);
    renderer = new Renderer({ device, viewport, canvas: document.getElementById('view'), fixtures, events, alloc, watchdog, abort });
  } catch (error) {                                                                 // initialisation failure: release everything installed so far
    off(); watchdog.dispose(); destroy(); alloc.destroyAll();
    throw error;
  }
  let closed = false;
  return {
    device, info, epoch, viewport, renderer, alloc, watchdog, abort, losses, events,
    armExpectedLoss() { armed = epoch; },
    close() { if (closed) return; closed = true; off(); watchdog.dispose(); renderer.destroy(); destroy(); alloc.destroyAll(); },
  };
}

export function frameOf(p) { return { requestId: p.requestId, generation: p.generation, epoch: p.epoch, view: p.view, label: p.label, W: p.W, H: p.H, counts: p.counts, t: p.publishedMs }; }

// A harness deadline that expired. It latches the session abort where one exists, so every other wait wakes, and returns the
// tagged error whose invalidation (`harness timeout: …`) T5's shared stop classifier recognises.
export function harnessTimeout(abort, message) {
  const reason = { kind: 'harness-timeout', message };
  abort?.abort?.(reason);
  return Object.assign(new Error(invalidationFor(reason)), { abort: reason });
}

export function renderOnce(renderer, args, { timeoutMs = 20000, abort = renderer.abort } = {}) {
  let off = null, timer = null;
  const published = new Promise((resolve, reject) => {
    let id = null;
    timer = setTimeout(() => reject(harnessTimeout(abort, `no publication within ${timeoutMs} ms`)), timeoutMs);
    off = renderer.onPublish(p => { if (p.requestId === id) resolve(frameOf(p)); });
    id = renderer.render(args);
  });
  return (abort?.race ? abort.race(published) : published).finally(() => { clearTimeout(timer); off?.(); });
}

// The invalidation text for an aborted or failed driver step; T10's ABORTS recognises the abort forms.
export const failure = (s, error) => s?.abort?.invalidation() ?? (error?.abort ? invalidationFor(error.abort) : `driver error: ${error.message}`);
