// spikes/project0/tests/scheduler.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Ledger, Planner } from '../gpu/scheduler.js';

test('the ledger allows at most two outstanding and releases each ticket once', () => {
  const l = new Ledger({ max: 2 });
  const a = l.take({ g: 1 }), b = l.take({ g: 1 });
  assert.equal(l.available(), false); assert.throws(() => l.take({ g: 2 }), /no submission credit/);
  assert.equal(l.release(a), true); assert.equal(l.release(a), false);
  assert.equal(l.outstanding(), 1); l.take({ g: 2 }); assert.equal(l.maxObserved(), 2); void b;
});

test('retiring a device epoch drops only that epoch\'s tickets', () => {
  const l = new Ledger({ max: 2 });
  l.take({ epoch: 1 }); l.take({ epoch: 1 });
  assert.equal(l.retire(1), 2); assert.equal(l.outstanding(), 0); assert.equal(l.available(), true);
});

function visits(planner, durations, rows, cols, outstanding = 2) {
  const seen = new Uint16Array(rows * cols), inflight = []; let k = 0, band;
  for (;;) {
    while (inflight.length < outstanding && (band = planner.next())) inflight.push(band);
    if (!inflight.length) break;
    const b = inflight.shift();
    for (let r = b.row0; r < b.row0 + b.rows; r++) for (let c = b.col0; c < b.col0 + b.cols; c++) seen[r * cols + c]++;
    planner.completed(b, durations[k++ % durations.length]);
  }
  return seen;
}

test('every pixel is traced exactly once while band sizes adapt in both directions with two outstanding', () => {
  for (const [rows, cols, durations] of [[360, 640, [2, 30]], [37, 1024, [200, 1, 200, 1, 3]], [64, 1024, [200, 200, 200, 1, 1, 1]], [5, 129, [100, 1]]]) {
    const p = new Planner({ rows, cols, initialRows: 8, minRange: 64 });
    const seen = visits(p, durations, rows, cols);
    const wrong = seen.findIndex(v => v !== 1);
    assert.equal(wrong, -1, `${rows}x${cols}: pixel ${wrong} was traced ${seen[wrong]} times`);
    assert.ok(p.done()); assert.equal(p.remaining, 0);
  }
});

test('Codex\'s overlap reproduction: a widening band mid-row no longer re-traces columns', () => {
  const p = new Planner({ rows: 4, cols: 128, initialRows: 1, minRange: 64, carry: { rowsPerBand: 1, colsPerBand: 64 } });
  const first = p.next(); p.completed(first, 1);                                   // fast: colsPerBand doubles to 128, the full row
  const second = p.next();
  assert.deepEqual([second.row0, second.col0], [0, 64], 'the second band continues the partial row');
});

test('slow bands shrink the band, then split a row into column ranges; the sizing carries over', () => {
  const p = new Planner({ rows: 64, cols: 1024, initialRows: 8, targetMs: 10, minRange: 64 }); let band;
  while ((band = p.next())) p.completed(band, 200);
  assert.ok(p.stats().rowsPerBand.at(-1) <= 1); assert.ok(p.stats().splits > 0);
  const q = new Planner({ rows: 64, cols: 1024, carry: p.carry() });
  assert.equal(q.next().rows, 1);
});
