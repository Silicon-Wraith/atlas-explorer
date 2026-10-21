import { createRenderRequest, RUNTIME_ID } from '../shared/render-request.js';
import { BackendError } from './render/backend.js';

export const RECOVERY_POLICY = Object.freeze({ maxAutomaticRecoveries: 1 });
const ALLOCATION_CHOICES = Object.freeze(['release-and-retry', 'lower-resolution', 'fewer-samples']);
let nextExecution = 0;

/**
 * A workspace uses this facade's prepare/render/cancel so recovery retains the immutable
 * viewport request, even before its first report. B09 remains the only owner of
 * pipeline preparation (including the ATLS probe), configuration and render plans.
 * No scene store, command stack or camera history is accepted here.
 *
 * Notices carry explicit actions: budget.accept(request?) submits a fresh plan;
 * allocation choices are offered to the workspace, which constructs any cheaper
 * request itself. Neither choice edits a scene or silently reduces requested work.
 *
 * The renderer judges obsolete cache ownership against the live request and
 * preserves publication/leases. Allocation notices forward its per-call receipt:
 * released bytes were freed; retiring bytes remain tracked until their leases end.
 */
export function createRecovery({ backend, renderer, scheduler, clock, policy = RECOVERY_POLICY, onNotice = () => {} }) {
  const now = typeof clock === 'function' ? clock : clock?.now;
  if (typeof now !== 'function' || typeof onNotice !== 'function') throw new TypeError('recovery requires a clock and notice callback');
  const maximum = policy?.maxAutomaticRecoveries;
  if (!Number.isInteger(maximum) || maximum < 0 || maximum > RECOVERY_POLICY.maxAutomaticRecoveries) {
    throw new RangeError('at most one automatic recovery is permitted');
  }
  let epoch = backend.currentEpoch(), phase = epoch ? 'ready' : 'preparing', lastLoss = null;
  let automaticRecoveries = 0, lostThrough = 0, destroyed = false, attempt = null, current = null;
  const budgetChoices = new Map();
  const state = () => Object.freeze({ epoch, phase, lastLoss, automaticRecoveries });
  function notice(value) {
    if (destroyed) return;
    try { onNotice(Object.freeze({ ...value, state: state() })); } catch { /* observers cannot strand recovery */ }
  }
  function usable() {
    if (destroyed || phase === 'stopped' || phase === 'recovering') throw new BackendError('unavailable', `recovery is ${phase}`);
  }
  function stillCurrent(record) {
    if (!record || record !== current || !record.restart) return false;
    const generation = typeof record.options.currentGeneration === 'function'
      ? record.options.currentGeneration() : record.options.currentGeneration ?? record.job.request.generation;
    return ['viewRevision', 'geometryRevision', 'appearanceRevision'].every(key => generation[key] === record.job.request.generation[key]);
  }
  function freshRequest(request) {
    const id = `${RUNTIME_ID}-recovery-${++nextExecution}`;
    return createRenderRequest({ ...request, requestId: `request-${id}`, jobId: `job-${id}`,
      generation: { ...request.generation, deviceEpoch: backend.currentEpoch() } });
  }
  function reboundOptions(request, original = {}) {
    const options = { ...original }, source = options.currentGeneration;
    if (source) options.currentGeneration = () => ({ ...(typeof source === 'function' ? source() : source), deviceEpoch: request.generation.deviceEpoch });
    return options;
  }
  function render(request, options = {}) {
    usable();
    const job = renderer.render(request, options);
    const record = { job, options: { ...options }, restart: true };
    if (request.output.purpose === 'interactive') current = record;
    job.done.then(result => {
      if (destroyed) return;
      if (result.outcome === 'budget-exceeded') onBudgetExceeded({ ...job, ...result });
      else if (result.outcome === 'failed') {
        // Classify failures only by the renderer's structured code, never message text.
        if (result.errorCode === 'allocation-failed') {
          onAllocationFailure({ request: job.request, failed: new BackendError(result.errorCode, result.reason) });
        } else {
          if (result.errorCode === 'preparation-failed' && current === record) phase = 'stopped';
          notice({ type: 'failed', request: job.request, result });
        }
      }
      else if (result.outcome === 'interrupted' && request.output.purpose !== 'interactive') {
        // Non-viewport jobs are never automatically restarted.
        notice({ type: 'interrupted', request: job.request, result });
      }
    });
    return job;
  }
  function restartViewport() {
    const previous = current;
    if (!stillCurrent(previous)) return null;
    const request = freshRequest(previous.job.request);
    return render(request, reboundOptions(request, previous.options));
  }
  function begin({ recovering = false, restart = false } = {}) {
    const token = {};
    phase = recovering ? 'recovering' : 'preparing';
    // Yield past all loss observers and old job settlement before reacquiring.
    // B09's prepare owns acquire, prepare, configureTargets and the probe leases.
    const promise = Promise.resolve().then(() => {
      if (destroyed || attempt?.token !== token) return null;
      return renderer.prepare();
    }).then(receipt => {
      if (destroyed || attempt?.token !== token) return null;
      if (!receipt || !receipt.epoch || receipt.epoch !== backend.currentEpoch()) throw new BackendError('device-lost', 'preparation belongs to a retired epoch');
      epoch = receipt.epoch;
      if (scheduler.snapshot().epoch !== epoch) scheduler.setEpoch(epoch);
      phase = 'ready';
      const job = restart ? restartViewport() : null;
      attempt = null;
      notice({ type: restart ? 'recovered' : 'ready', job, receipt });
      return receipt;
    }).catch(error => {
      if (destroyed || attempt?.token !== token) return null;
      attempt = null; epoch = backend.currentEpoch(); phase = 'stopped';
      notice({ type: 'stopped', reason: error.code ?? 'preparation-failed', message: error.message });
      throw error;
    });
    attempt = { token, promise };
    // Loss subscriptions have no promise consumer; explicit prepare/retry still
    // receive the original rejection, including preparation-failed probe errors.
    promise.catch(() => {});
    notice({ type: phase });
    return promise;
  }
  function onLoss(event) {
    if (destroyed) return 'stopped';
    if (!Number.isSafeInteger(event?.epoch) || event.epoch < 1) throw new TypeError('loss requires a positive epoch');
    if (event.epoch <= lostThrough || event.epoch < Math.max(epoch, backend.currentEpoch())) {
      return phase === 'stopped' ? 'stopped' : 'recover';
    }
    lostThrough = event.epoch;
    lastLoss = Object.freeze({ epoch: event.epoch, reason: event.reason, message: event.message, at: now() });
    attempt = null;
    // B09 also observes loss. Both operations are idempotent, and this ordering
    // is required even when B09 already settled the epoch before our observer.
    scheduler.interrupted(event.epoch); scheduler.setEpoch(0); epoch = 0;
    if (automaticRecoveries >= maximum) {
      phase = 'stopped'; notice({ type: 'stopped', reason: 'repeated-device-loss', loss: lastLoss });
      return 'stopped';
    }
    automaticRecoveries++;
    begin({ recovering: true, restart: true });
    return 'recover';
  }
  function onAllocationFailure({ request, failed }) {
    if (destroyed) throw new BackendError('unavailable', 'recovery destroyed');
    if (failed?.code !== 'allocation-failed') throw new TypeError('allocation recovery requires allocation-failed evidence');
    const { freed, retiring } = renderer.releaseObsolete();
    const result = Object.freeze({ choices: ALLOCATION_CHOICES, released: freed, retiring });
    notice({ type: 'allocation-failed', request, reason: failed.message, ...result });
    return result;
  }
  function onBudgetExceeded(job) {
    if (destroyed) throw new BackendError('unavailable', 'recovery destroyed');
    if (job?.outcome !== 'budget-exceeded' || !job.request) throw new TypeError('continuation requires a budget-exceeded job and its request');
    if (!job.jobId || job.jobId !== job.request.jobId) throw new TypeError('continuation requires the owning jobId');
    const continuation = job.continuation;
    if (!['resume', 'lower-cost'].includes(continuation)) throw new TypeError('continuation must be supplied by the scheduler');
    // Automatic settlement and an explicit notification share one action, even
    // for non-viewport jobs whose acceptance does not replace current.
    if (budgetChoices.has(job.jobId)) return budgetChoices.get(job.jobId);
    const previous = current;
    let accepted = null;
    const result = Object.freeze({ continuation, accept(request = job.request) {
      if (accepted) return accepted;
      usable();
      if (!backend.currentEpoch()) throw new BackendError('unavailable');
      if (job.request.output.purpose === 'interactive' && (current !== previous || current?.job.request !== job.request || !stillCurrent(previous))) {
        throw new BackendError('stale-epoch', 'continuation was replaced by a newer request');
      }
      if (request.viewId !== job.request.viewId || request.output.purpose !== job.request.output.purpose) throw new TypeError('continuation must keep its view and purpose');
      if (continuation === 'lower-cost') {
        const old = job.request.quality, next = request.quality;
        const smaller = next.internalSize.width * next.internalSize.height < old.internalSize.width * old.internalSize.height;
        const fewer = next.sampling.targetSamples < old.sampling.targetSamples;
        if (!smaller && !fewer) throw new TypeError('choose an explicit lower-cost request');
      }
      const next = freshRequest(request);
      accepted = render(next, reboundOptions(next, previous?.job.request === job.request ? previous.options : {}));
      return accepted;
    } });
    budgetChoices.set(job.jobId, result);
    notice({ type: 'budget-exceeded', request: job.request, reason: job.reason, ...result });
    return result;
  }
  const unsubscribeLoss = backend.onLoss(onLoss);
  const unsubscribeStatus = renderer.onStatus(status => {
    if (destroyed || phase === 'stopped') return;
    if (status.phase === 'preparing') {
      if (phase !== 'recovering') phase = 'preparing';
      notice({ type: 'preparing', progress: status });
    } else if (status.phase === 'prepared' && status.epoch === backend.currentEpoch() && !attempt) {
      epoch = status.epoch; phase = 'ready';
    }
  });
  return Object.freeze({ state, render, onLoss, onAllocationFailure, onBudgetExceeded,
    prepare() {
      if (attempt) return attempt.promise;
      try { usable(); return begin(); }
      catch (error) { return Promise.reject(error); }
    },
    retry() {
      if (destroyed) return Promise.reject(new BackendError('unavailable', 'recovery destroyed'));
      if (phase !== 'stopped') return Promise.resolve(null);
      automaticRecoveries = 0;
      return begin({ restart: true });
    },
    cancel(jobId) {
      if (destroyed) throw new BackendError('unavailable', 'recovery destroyed');
      const result = renderer.cancel(jobId);
      if (result.accepted && current?.job.jobId === jobId) current.restart = false;
      return result;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true; attempt = null; current = null; phase = 'stopped';
      budgetChoices.clear();
      unsubscribeLoss(); unsubscribeStatus();
      // Backend, renderer, scheduler and their pending leases remain caller-owned.
    },
  });
}
