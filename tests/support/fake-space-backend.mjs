// A self-driving wrapper around the deterministic fake backend (plan B14), shared by the Node
// workspace tests and the headless space-shell suite (served into the page by a route, never by the
// application server). Preparation finishes and every ticket completes on the next task unless the
// test holds them; the self-check probe reads back ATLS as the real device would. It performs no
// rendering and makes no physical-device claims.
import { createFakeBackend } from './fake-backend.mjs';

const PROBE_WORD = 0x41544c53;
const words = values => new Uint8Array(Uint32Array.from(values).buffer);

export function createDrivenFakeBackend({ clock = () => performance.now(), limits = {}, schedule = fn => setTimeout(fn, 0) } = {}) {
  const fake = createFakeBackend({ clock, limits });
  let auto = true, acquisitionGate = null, failAcquisition = null, acquisitions = 0;
  const held = [];
  const drive = ticket => { if (auto) schedule(() => fake.complete(ticket)); else held.push(ticket); return ticket; };
  const backend = {
    ...fake,
    async acquire() {
      acquisitions++;
      if (acquisitionGate) await acquisitionGate.promise;
      if (failAcquisition) { const error = failAcquisition; failAcquisition = null; throw error; }
      return fake.acquire();
    },
    prepare(args) {
      const result = fake.prepare(args);
      schedule(() => fake.finishPrepare());
      return result;
    },
    submitBatch: (batch, options) => drive(fake.submitBatch(batch, options)),
    readback(desc, options) {
      if (desc.fields.includes('probe')) fake.stage(desc.source, words([PROBE_WORD]));
      return drive(fake.readback(desc, options));
    },
    present: (desc, options) => drive(fake.present(desc, options)),
  };
  // Test controls (outside BACKEND_METHODS).
  backend.control = Object.freeze({
    get acquisitions() { return acquisitions; },
    holdAcquisition() { let resolve; acquisitionGate = { promise: new Promise(yes => { resolve = yes; }), resolve: () => resolve() }; },
    releaseAcquisition() { const gate = acquisitionGate; acquisitionGate = null; gate?.resolve(); },
    failNextAcquisition(error) { failAcquisition = error; },
    pause() { auto = false; },
    resume() { auto = true; for (const ticket of held.splice(0)) schedule(() => fake.complete(ticket)); },
    heldTickets: () => held.length,
  });
  return Object.freeze(backend);
}
