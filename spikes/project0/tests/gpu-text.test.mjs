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
