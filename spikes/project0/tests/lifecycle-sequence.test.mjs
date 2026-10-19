// spikes/project0/tests/lifecycle-sequence.test.mjs — the complete G13 sequence against fake sessions, evaluated only after it finishes.
import test from 'node:test';
import assert from 'node:assert/strict';
const { runLifecycle } = await import('../browser/drivers/lifecycle.js');
const { metricsFor } = await import('../measure/index.mjs');
const { CORRECTNESS_ONLY } = await import('../timing-contract.js');

function fakeWorld({ failRecovery = false, lossBeforeArm = false } = {}) {
  let epoch = 0, seq = 0; const handlers = new Set();
  const signal = (reason, injected) => { const lost = epoch; epoch++; for (const h of [...handlers]) h({ epoch: lost, reason, message: '', injected }); };
  const counts = { total: 921600, hit: 250000, miss: 671600, point: 0, steps: 0, failure: 0 };
  const open = async () => {
    const e = ++epoch, events = [], pubs = new Set();
    // Epoch-bound, as T7's Renderer is (Codex T7 r1, finding 3): once the epoch it was built in retires, render() throws, so a recovery must
    // come from a fresh session. The check precedes any loss render() itself signals, as the real renderer's does.
    const renderer = { render: () => { if (epoch !== e) throw new Error(`renderer device epoch ${e} has retired (current epoch ${epoch}): a replacement device needs a replacement renderer`); const id = ++seq; if (lossBeforeArm) { signal('unknown', false); return id; } events.push({ type: 'submit', requestId: id, generation: 1, epoch: e, batch: 1, t: 1 }); return id; }, onPublish: h => { pubs.add(h); return () => pubs.delete(h); } };
    return { epoch: e, renderer, events: { list: () => events }, device: { destroy: () => signal('destroyed', false), queue: { onSubmittedWorkDone: async () => {} } }, armExpectedLoss() {}, close() {} };
  };
  let opened = 0;
  return {
    open: async () => { opened++; return open(); }, opened: () => opened, onLoss: h => { handlers.add(h); return () => handlers.delete(h); }, injectLoss: () => signal('unknown', true), sleep: ms => new Promise(r => setTimeout(r, Math.min(ms, 2))),
    renderOnce: async (renderer, req) => {
      if (failRecovery) throw Object.assign(new Error('aborted: device-lost (unknown)'), { abort: { kind: 'device-lost', message: 'unknown' } });
      const id = renderer.render(req); return { requestId: id, generation: 1, epoch, view: req.view, label: req.view, W: 1280, H: 720, counts, t: 5 };
    },
  };
}

test('intentional, injected, recovery and repeated loss: all three slots pass, and the injected record keeps its own loss epoch', async () => {
  const { slots } = await runLifecycle(fakeWorld());
  assert.deepEqual(slots.map(s => s.slot), ['intentional', 'injected', 'repeated']);
  for (const s of slots) assert.deepEqual(s.timingMethod, CORRECTNESS_ONLY, s.slot);
  const fx = { profiles: { settled: { W: 1280, H: 720 } } };
  for (const s of slots.filter(x => x.slot !== 'repeated')) assert.deepEqual(await metricsFor('G13', s.slot, s.raw, fx), { interrupted: 1, successes: 0, requestPreserved: 1, latePublications: 0, validRecovery: 1 });
  assert.deepEqual(await metricsFor('G13', 'repeated', slots[2].raw, fx), { automaticRetriesAfterRepeat: 0 });
  const injected = slots[1].raw;
  assert.equal(injected.loss.epoch, injected.submittedBeforeLoss.epoch, 'the repeated notification must not overwrite the stored loss');
  assert.ok(injected.recovery.epoch > injected.loss.epoch);
});

test('an unexpected loss during the first recovery ends G13 after exactly two acquisitions, with no injected sequence', async () => {
  const world = fakeWorld({ failRecovery: true });
  const out = await runLifecycle(world);
  assert.equal(world.opened(), 2);
  assert.deepEqual(out.slots.map(s => s.slot), ['intentional']); assert.match(out.slots[0].raw.error, /aborted: device-lost/);
  assert.deepEqual(out.slots[0].timingMethod, CORRECTNESS_ONLY);
  assert.ok(out.invalidations.length === 1 && /device lost/.test(out.invalidations[0]), JSON.stringify(out.invalidations));
});

test('a loss before the intentional loss is armed is unexpected, and ends the invocation', async () => {
  const world = fakeWorld({ lossBeforeArm: true });
  const out = await runLifecycle(world);
  assert.equal(world.opened(), 1);
  assert.match(out.slots[0].raw.error, /unexpected loss/); assert.match(out.invalidations[0], /device lost/);
  assert.deepEqual(out.slots[0].timingMethod, CORRECTNESS_ONLY);
});
