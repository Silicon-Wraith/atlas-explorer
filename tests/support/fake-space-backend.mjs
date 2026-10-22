// A self-driving wrapper around the deterministic fake backend (plan B14), shared by the Node
// workspace tests and the headless space-shell suite (served into the page by a route, never by the
// application server). Preparation finishes and every ticket completes on the next task unless the
// test holds them; the self-check probe reads back ATLS as the real device would. It performs no
// rendering and makes no physical-device claims.
import { createFakeBackend } from './fake-backend.mjs';
import { reduceDraftPacket, draftProducerMarker } from '../../src/space/render/draft-summary.js';

const PROBE_WORD = 0x41544c53;
const words = values => new Uint8Array(Uint32Array.from(values).buffer);

// Explicit scripted diagnostic bytes for orchestration fixtures; this does not
// emulate or validate GPU shaders. GPU equivalence is checked by the headed suite.
const stagedDraftBuffers = new WeakMap();
export function stageDraftDiagnostics(fake, batch, { statusWords = [0], normals = [false], recoveryWords = [0] } = {}) {
  if (batch.passes) {
    batch.passes.forEach(member => stageDraftDiagnostics(fake, member, { statusWords, normals, recoveryWords }));
    if (batch.draft?.summary) {
      const display = batch.passes.find(member => member.pass === 'display');
      const packet = stagedDraftBuffers.get(display.outputs.draftDiagnostics);
      fake.stage(batch.draft.summary, reduceDraftPacket(packet, { width: batch.region.width, height: batch.region.height,
        recovery: batch.draft.recovery, producerToken: batch.draft.producerToken }));
    }
    return;
  }
  if (!batch.outputs?.draftDiagnostics || stagedDraftBuffers.has(batch.outputs.draftDiagnostics)) return;
  const stride = batch.uniforms.diagnosticStride;
  const bytes = fake.diagnostics().inventory.find(r => r.id === batch.outputs.draftDiagnostics.id).bytes;
  const packet = new Uint32Array(bytes / 4);
  for (let k = 0, i = 0; k < packet.length; k += stride, i++) {
    packet[k] = statusWords[i % statusWords.length]; packet[k + 1] = draftProducerMarker(batch.uniforms.producerToken ?? 0) | (normals[i % normals.length] ? 1 : 0);
    if (stride === 3) packet[k + 2] = recoveryWords[i % recoveryWords.length];
  }
  const packetBytes = new Uint8Array(packet.buffer);
  fake.stage(batch.outputs.draftDiagnostics, packetBytes);
  stagedDraftBuffers.set(batch.outputs.draftDiagnostics, packetBytes);
}

export function createDrivenFakeBackend({ clock = () => performance.now(), limits = {}, schedule = fn => setTimeout(fn, 0) } = {}) {
  const fake = createFakeBackend({ clock, limits });
  let auto = true, acquisitionGate = null, failAcquisition = null, acquisitions = 0, pickDepth = null, holdPresents = false;
  const heldPresents = [];
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
    submitBatch(batch, options) { stageDraftDiagnostics(fake, batch); return drive(fake.submitBatch(batch, options)); },
    readback(desc, options) {
      if (desc.fields.includes('probe')) fake.stage(desc.source, words([PROBE_WORD]));
      // A scripted surface for pick tests: every depth texel reads `pickDepth` (status words stay 0 = hit).
      if (pickDepth !== null && desc.fields.includes('depth')) {
        const bytes = fake.diagnostics().inventory.find(entry => entry.id === desc.source.id)?.bytes;
        if (bytes) fake.stage(desc.source, new Uint8Array(new Float32Array(bytes / 4).fill(pickDepth).buffer));
      }
      return drive(fake.readback(desc, options));
    },
    present: (desc, options) => { const ticket = fake.present(desc, options); if (holdPresents) { heldPresents.push(ticket); return ticket; } return drive(ticket); },
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
    setPickDepth(depth) { pickDepth = depth; },
    // Presentation control (B14-F2): presents are held until released, or a held one is failed.
    holdPresentation() { holdPresents = true; },
    releasePresentation() { holdPresents = false; for (const ticket of heldPresents.splice(0)) drive(ticket); },
    failHeldPresentation(message = 'injected presentation failure') { holdPresents = false; for (const ticket of heldPresents.splice(0)) schedule(() => fake.fail(ticket, new Error(message))); },
    heldPresentations: () => heldPresents.length,
  });
  return Object.freeze(backend);
}
