import { canonicalJson, deepFreeze } from '../../shared/scene.js';
let nextFrame = 0;
export function createDraftRecords({ clock, onUpdate = () => {}, capacity = 2, historyLimit = 128 } = {}) {
  if (typeof clock !== 'function' || capacity !== 2 || !Number.isInteger(historyLimit) || historyLimit < 2) throw new TypeError('draft records require a clock and a two-slot ring');
  const records = new Map(); let active = 0, displayed = null;
  function terminal(frameId, identity, diagnosticsState, detail = {}) {
    const entry = records.get(frameId);
    if (!entry) throw new RangeError('unknown frame record');
    if (canonicalJson(entry.original.identity) !== canonicalJson(identity)) throw new RangeError('frame identity mismatch');
    if (entry.update) return false;
    const observedAt = clock();
    if (!Number.isFinite(observedAt) || observedAt < entry.original.presentationSubmittedAt) throw new RangeError('invalid confirmation clock');
    entry.update = deepFreeze({ ...structuredClone(detail), frameId, identity: structuredClone(identity), diagnosticsState, observedAt,
      ...(diagnosticsState === 'confirmed' ? { confirmationAt: observedAt, acceptanceAt: Math.max(observedAt, entry.original.presentationSubmittedAt) } : {}),
      historical: displayed !== frameId });
    active--;
    try { onUpdate(entry.update); } catch { /* observers cannot strand a summary slot */ }
    for (const [id, old] of records) {
      if (records.size <= historyLimit + capacity) break;
      if (old.update && id !== displayed) records.delete(id);
    }
    return entry.update;
  }
  return Object.freeze({
    begin(event) {
      if (event.eligible !== true) throw new RangeError('frame was not eligible for presentation');
      if (active >= capacity) throw new RangeError('draft record ring at capacity');
      if (!Number.isFinite(event.presentationSubmittedAt) || !event.identity?.generation?.deviceEpoch || event.sampleIndex !== 0) throw new RangeError('invalid frame identity/time/sample');
      const original = deepFreeze({ ...structuredClone(event), frameId: `draft-frame-${event.identity.generation.deviceEpoch}-${++nextFrame}`,
        diagnosticsState: 'pending', rayTermination: null });
      records.set(original.frameId, { original, update: null }); active++; return original;
    },
    displayed(frameId) { if (!records.has(frameId)) throw new RangeError('unknown displayed frame'); displayed = frameId; },
    displayedFrame: () => displayed,
    supersedeDisplay() { displayed = null; },
    confirm: (frameId, identity, evidence) => terminal(frameId, identity, 'confirmed', evidence),
    reject: (frameId, identity, reason) => terminal(frameId, identity, 'failed', { reason }),
    interrupt(epoch, reason = 'device-lost') {
      const updates = [];
      for (const [frameId, entry] of records) if (!entry.update && entry.original.identity.generation.deviceEpoch === epoch) updates.push(terminal(frameId, entry.original.identity, 'interrupted', { reason }));
      return updates;
    },
    pending: () => active,
  });
}
