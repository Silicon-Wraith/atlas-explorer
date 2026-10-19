// chrome://gpu capture: Chrome 151 renders it into <info-view> shadow roots, filled in asynchronously; body.innerText is empty.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromeGpuText } from '../launch.mjs';

const text = s => ({ nodeType: 3, textContent: s });
const el = (tagName, children = [], shadow = null) => ({ nodeType: 1, tagName, childNodes: children, shadowRoot: shadow });
const root = children => ({ nodeType: 11, childNodes: children, shadowRoot: null });
const READY = 'Graphics Feature Status\nVulkan: Enabled\nDriver Information\nGPU0 : VENDOR= 0x10de, DRIVER_VENDOR=NVIDIA, DRIVER_VERSION=580.173.2.0 *ACTIVE*\n';
// A body with no light-DOM text whose content lives two shadow roots deep.
const nested = s => el('BODY', [el('INFO-VIEW', [], root([el('DIV', [], root([el('SPAN', [text(s)])]))]))]);

function fakeContext(bodyFor) {
  const closed = []; const t0 = Date.now();
  const page = {
    goto: async () => {}, close: async () => { closed.push(1); },
    locator: () => ({ innerText: async () => '' }),                   // what the old capture used: always empty
    evaluate: async fn => { globalThis.document = { body: bodyFor(Date.now() - t0) }; try { return fn(); } finally { delete globalThis.document; } },
  };
  return { context: { newPage: async () => page }, closed };
}

test('text that lives only in nested shadow roots is captured', async () => {
  const { context, closed } = fakeContext(() => nested(READY));
  const out = await chromeGpuText(context, { timeoutMs: 1000, pollMs: 5 });
  assert.match(out, /Graphics Feature Status/); assert.match(out, /DRIVER_VERSION=580\.173\.2\.0/); assert.equal(closed.length, 1);
});

test('it waits for the asynchronous fill, then returns', async () => {
  const { context } = fakeContext(ms => nested(ms < 60 ? 'Loading…' : READY));
  assert.match(await chromeGpuText(context, { timeoutMs: 1000, pollMs: 5 }), /DRIVER_VERSION/);
});

test('content that never fills in is a classified browser hang, and the page is closed', async () => {
  const { context, closed } = fakeContext(() => nested('Loading…'));
  await assert.rejects(chromeGpuText(context, { timeoutMs: 80, pollMs: 5 }), /^Error: browser hang: chrome:\/\/gpu/);
  assert.equal(closed.length, 1);
});

test('a page whose evaluate never answers is also a classified hang within the bound', async () => {
  const context = { newPage: async () => ({ goto: async () => {}, close: async () => {}, evaluate: () => new Promise(() => {}) }) };
  const t0 = Date.now();
  await assert.rejects(chromeGpuText(context, { timeoutMs: 80, pollMs: 5 }), /browser hang/); assert.ok(Date.now() - t0 < 1000);
});

// Fix round 4: readiness is complete, unambiguous identity; evidence survives a timeout; nothing is left behind.
const REC = (n, value) => `GPU${n}                            :\n\n${value}\n\n`;
const INACTIVE_IGPU = REC(0, 'VENDOR= 0x8086 [Google Inc. (Intel)], DEVICE=0x46a6, DRIVER_VENDOR=Intel, DRIVER_VERSION=24.0.5');
const ACTIVE_NV = REC(1, 'VENDOR= 0x10de [Google Inc. (NVIDIA)], DEVICE=0x26b1, DRIVER_VENDOR=NVIDIA, DRIVER_VERSION=580.173.2.0 *ACTIVE*');

test('staged population: an inactive integrated-GPU row first is not ready; the capture waits for the active record', async () => {
  let polls = 0;
  const { context } = fakeContext(ms => { polls++; return nested(`Graphics Feature Status\n${INACTIVE_IGPU}${ms < 60 ? '' : ACTIVE_NV}`); });
  const out = await chromeGpuText(context, { timeoutMs: 1000, pollMs: 5 });
  assert.ok(polls > 1, `captured after ${polls} poll(s)`); assert.match(out, /DRIVER_VERSION=580\.173\.2\.0 \*ACTIVE\*/); assert.match(out, /DRIVER_VENDOR=Intel/);
});

test('a page that never becomes unambiguous keeps its latest text on the classified hang', async () => {
  const partial = `Graphics Feature Status\nWebGPU: Hardware accelerated\nProblems Detected\n${INACTIVE_IGPU}`;
  const { context, closed } = fakeContext(() => nested(partial));
  const error = await chromeGpuText(context, { timeoutMs: 80, pollMs: 5 }).then(() => null, e => e);
  assert.match(error?.message, /^browser hang: chrome:\/\/gpu did not fill in/);
  assert.match(error.capturedText, /WebGPU: Hardware accelerated/); assert.match(error.capturedText, /DRIVER_VENDOR=Intel/);
  assert.equal(closed.length, 1);
});

test('a page that resolves after the opening deadline is closed', async () => {
  const closed = [];
  const context = { newPage: () => new Promise(r => setTimeout(() => r({ close: async () => { closed.push(1); } }), 60)) };
  await assert.rejects(chromeGpuText(context, { timeoutMs: 20, pollMs: 5 }), /did not open/);
  await new Promise(r => setTimeout(r, 120));
  assert.equal(closed.length, 1);
});

test('a successful capture leaves no timer behind', async () => {
  const timers = () => process.getActiveResourcesInfo().filter(r => r === 'Timeout').length;
  const { context } = fakeContext(() => nested(READY));
  const before = timers();
  await chromeGpuText(context, { timeoutMs: 1000, pollMs: 5 });
  assert.equal(timers() - before, 0);
});
