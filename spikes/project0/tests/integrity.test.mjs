// spikes/project0/tests/integrity.test.mjs — T9 fix round 1 (Codex T9 r1, finding 2): the integrity observer itself, against a fake DOM. The
// backing size is checked at the start and at stop, and every width/height mutation is replayed in order, including one reverted before the next
// animation frame; G12's deliberate resizes go through the observer and are not interference.
import test from 'node:test';
import assert from 'node:assert/strict';
const { observeIntegrity } = await import('../browser/integrity.js');

// A MutationObserver that, like the browser's, queues attribute records with their old values and delivers them in one microtask batch.
class FakeMutationObserver {
  static all = new Set();
  constructor(callback) { this.callback = callback; this.queue = []; this.target = null; FakeMutationObserver.all.add(this); }
  observe(target, options) { this.target = target; this.options = options; }
  takeRecords() { return this.queue.splice(0); }
  disconnect() { this.target = null; FakeMutationObserver.all.delete(this); }
  enqueue(record) {
    if (!this.options.attributeFilter.includes(record.attributeName)) return;
    this.queue.push({ ...record, oldValue: this.options.attributeOldValue ? record.oldValue : null });
    if (!this.scheduled) { this.scheduled = true; queueMicrotask(() => { this.scheduled = false; const r = this.takeRecords(); if (r.length) this.callback(r, this); }); }
  }
}
function fakeCanvas(width, height) {
  const c = { _width: width, _height: height };
  for (const a of ['width', 'height']) Object.defineProperty(c, a, { get() { return this[`_${a}`]; }, set(v) { const oldValue = String(this[`_${a}`]); this[`_${a}`] = v; for (const o of FakeMutationObserver.all) if (o.target === this) o.enqueue({ type: 'attributes', attributeName: a, oldValue }); } });
  return c;
}
// A page environment whose animation frames run only when the test asks: the observer must not depend on them.
function environment() {
  const frames = [];
  const saved = Object.fromEntries(['document', 'addEventListener', 'removeEventListener', 'devicePixelRatio', 'matchMedia', 'requestAnimationFrame', 'MutationObserver'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  Object.assign(globalThis, {
    document: { visibilityState: 'visible', hasFocus: () => true, addEventListener() {}, removeEventListener() {} },
    addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1, matchMedia: () => ({ addEventListener() {}, removeEventListener() {} }),
    requestAnimationFrame: fn => frames.push(fn), MutationObserver: FakeMutationObserver });
  return { frame: () => { const f = frames.splice(0); f.forEach(fn => fn(performance.now())); },
    restore() { for (const [k, d] of Object.entries(saved)) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; } } };
}
const flush = () => new Promise(r => setImmediate(r));

test('an invalid backing at the start is a violation even when stop() follows at once (Codex reproduction 1)', () => {
  const env = environment();
  try {
    const r = observeIntegrity(fakeCanvas(800, 600)).stop();
    assert.ok(r.violations.some(v => /^unexpected backing 800x600/.test(v)), JSON.stringify(r.violations));
  } finally { env.restore(); }
});

test('a size changed and restored before the next animation frame is a violation (Codex reproduction 2)', async () => {
  const env = environment();
  try {
    const canvas = fakeCanvas(1280, 720), watch = observeIntegrity(canvas);
    canvas.width = 800; await flush(); canvas.width = 1280; await flush();        // two separate batches, no frame in between
    const r = watch.stop();
    assert.ok(r.violations.some(v => /^unexpected backing 800x720/.test(v)), JSON.stringify(r.violations));
    assert.deepEqual(r.events.filter(e => e.type === 'backing').map(e => e.value), ['800x720', '1280x720']);
  } finally { env.restore(); }
});

test('a change reverted within one task (one mutation batch) is replayed from the records\' old values', async () => {
  const env = environment();
  try {
    const canvas = fakeCanvas(1280, 720), watch = observeIntegrity(canvas);
    canvas.height = 10; canvas.height = 720; await flush();
    assert.ok(watch.stop().violations.some(v => /^unexpected backing 1280x10/.test(v)));
  } finally { env.restore(); }
});

test('a mutation still undelivered when stop() is called is drained, and the final state is checked', () => {
  const env = environment();
  try {
    const canvas = fakeCanvas(1280, 720), watch = observeIntegrity(canvas);
    canvas.width = 640;                                                            // no microtask has run: the record is still queued
    const r = watch.stop();
    assert.ok(r.violations.some(v => /^unexpected backing 640x720/.test(v)), JSON.stringify(r.violations));
  } finally { env.restore(); }
});

test('G12: a deliberate resize between allowed sizes is not interference; the same change made outside the observer is', async () => {
  const env = environment();
  try {
    const allowedBacking = [[1280, 720], [1920, 1080], [960, 540]];
    const canvas = fakeCanvas(1280, 720), watch = observeIntegrity(canvas, { allowedBacking });
    watch.resize([1920, 1080]); await flush(); watch.resize([960, 540]); await flush(); watch.resize([1280, 720]); env.frame();
    const r = watch.stop();
    assert.deepEqual(r.violations, []);
    assert.deepEqual(r.events.filter(e => e.type === 'backing').map(e => [e.value, e.deliberate]), [['1920x1080', true], ['960x540', true], ['1280x720', true]]);
    const other = fakeCanvas(1280, 720), w2 = observeIntegrity(other, { allowedBacking });
    other.width = 1920; other.height = 1080; await flush();                       // passes through 1920x720, which is not an allowed size
    assert.ok(w2.stop().violations.some(v => /^unexpected backing 1920x720/.test(v)));
    const bad = fakeCanvas(1280, 720), w3 = observeIntegrity(bad, { allowedBacking });
    w3.resize([800, 600]);
    assert.ok(w3.stop().violations.some(v => /^unexpected backing 800x600/.test(v)), 'a deliberate resize to a size outside the frozen list is still refused');
  } finally { env.restore(); }
});

test('hidden or unfocused at stop is a violation', () => {
  const env = environment();
  try {
    const watch = observeIntegrity(fakeCanvas(1280, 720));
    globalThis.document.visibilityState = 'hidden'; globalThis.document.hasFocus = () => false;
    const r = watch.stop();
    assert.ok(r.violations.includes('hidden at stop (hidden)') && r.violations.includes('unfocused at stop'), JSON.stringify(r.violations));
  } finally { env.restore(); }
});

test('a clean interval has no violations', async () => {
  const env = environment();
  try { const watch = observeIntegrity(fakeCanvas(1280, 720)); env.frame(); await flush(); assert.deepEqual(watch.stop().violations, []); } finally { env.restore(); }
});
