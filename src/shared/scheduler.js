import { RENDER_OUTCOMES } from './render-request.js';
import { deepFreeze } from './scene.js';

export const SCHEDULER_DEFAULTS = Object.freeze({ maxOutstanding: 2, batchTargetMs: 8, watchdogMs: 5000,
  budgets: Object.freeze({ draftMs: 1000, settledMs: 10000, exportMs: 120000 }), instrumentHz: 2 });
export const PRIORITIES = Object.freeze(['navigation', 'inspection', 'refinement', 'export', 'swatch']);

const deferred = () => {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
};
const nonnegative = (value, name) => {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and nonnegative`);
};
const positive = (value, name) => {
  nonnegative(value, name);
  if (!value) throw new RangeError(`${name} must be positive`);
};
const identifier = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a nonempty string`);
};

/**
 * Owns admission, never submission or resource disposal. Every returned lease must be
 * reported back, including synchronous submission failures. The exact lease object
 * identifies the reserved operation; jobId alone cannot distinguish parallel work.
 *
 * A job is {jobId, requestId, viewId, request, done}. Only this scheduler settles
 * done, with {outcome, reason, continuation?, submitted?}; the renderer adds reports.
 * cancel().done is separate: a watchdog can settle job.done while draining remains
 * unproved. An issued lease counts as submitted, even before its consume() call.
 * Unknown/retired cancellation returns {accepted: false, done: Promise<null>}.
 * Failed tickets are terminal evidence: the backend must not report failure for
 * queued work until its fence resolves. Failure before cancellation remains the
 * job outcome; failure during cancellation contributes to a cancelled drain.
 * On loss, clients call interrupted(lostEpoch) before setEpoch(nextEpoch).
 * Elapsed work accrues only while a job holds a lease and its view is eligible;
 * requestedAt remains the origin for end-to-end latency. Auxiliaries share jobId
 * cancellation ownership but have separate promises and no elapsed-work budget.
 * Budget continuations require fresh request/job IDs and a fresh plan. Settled
 * jobs never revive. Requests during a watchdog stall queue until terminal evidence
 * retires every outstanding lease; observed loss still requires a new epoch.
 *
 * Ready sets cache one reserved operation per live job, avoiding queue/history scans
 * in admit()/completed(). Plan methods and listeners are injected synchronous work
 * and must themselves be bounded. subscribe receives small change events, not a
 * full snapshot; snapshot() explicitly copies the current live state on demand.
 * A preparing plan returns null from next() and false from exhausted(). Register
 * it before preparation so Update can select its frozen request, then call
 * ready(jobId, {epoch}) when its resources become ready. This rechecks only that
 * job, never issues a lease, and returns true only for newly reserved work or
 * exhaustion. Stale, terminal and duplicate notifications have no effect.
 */
export function createScheduler({ clock, makeAdmission, setTimer, clearTimer,
  maxOutstanding = SCHEDULER_DEFAULTS.maxOutstanding,
  batchTargetMs = SCHEDULER_DEFAULTS.batchTargetMs, watchdogMs = SCHEDULER_DEFAULTS.watchdogMs,
  budgets = SCHEDULER_DEFAULTS.budgets, instrumentHz = SCHEDULER_DEFAULTS.instrumentHz,
} = {}) {
  const now = typeof clock === 'function' ? clock : clock?.now;
  for (const fn of [now, makeAdmission, setTimer, clearTimer]) {
    if (typeof fn !== 'function') throw new TypeError('clock, admission factory and timers must be injected');
  }
  if (!Number.isInteger(maxOutstanding) || maxOutstanding < 1 || maxOutstanding > 2) {
    throw new RangeError('maxOutstanding must be 1 or 2');
  }
  positive(batchTargetMs, 'batchTargetMs'); positive(watchdogMs, 'watchdogMs'); positive(instrumentHz, 'instrumentHz');
  if (instrumentHz > 2) throw new RangeError('instrumentHz must not exceed 2');
  const limits = { ...SCHEDULER_DEFAULTS.budgets, ...budgets };
  for (const [key, value] of Object.entries(limits)) positive(value, key);
  const views = new Map(), groups = new Map(), epochs = new Map(), leases = new Map(), records = new Set();
  const issuedAdmissions = new WeakSet();
  const ready = PRIORITIES.map(() => new Set()), listeners = new Set();
  let epoch = 0, highestEpoch = 0;

  function emit(type, record) {
    const event = Object.freeze({ type, epoch, jobId: record?.group.jobId ?? null, viewId: record?.view.viewId ?? null });
    // Observers cannot roll back a completed transition or strand an admission.
    for (const listener of listeners) { try { listener(event); } catch { /* observer isolation */ } }
  }
  function viewFor(viewId) {
    const view = views.get(viewId);
    if (!view) throw new RangeError(`unregistered view: ${viewId}`);
    return view;
  }
  function priorityIndex(priority) {
    const index = PRIORITIES.indexOf(priority);
    if (index < 0) throw new RangeError(`unknown priority: ${priority}`);
    return index;
  }
  const nextInstrumentAt = view => view.lastInstrumentAt + 1000 / instrumentHz;
  function eligible(record) {
    // Keep ready entries through a stall: admit() gates the epoch. Clearing a
    // stall therefore needs no backlog scan from completed()/failed().
    return record.group.epoch === epoch && epoch !== 0 && !epochs.get(epoch).lost &&
      !record.result && !record.group.cancellation && !record.view.hidden &&
      (!record.view.paused || record.view.updateJob === record) &&
      (!record.instrument || record.admittedAt !== null ||
        (record.view.instruments.values().next().value === record && now() >= nextInstrumentAt(record.view)));
  }
  function workElapsed(record) {
    return record.elapsedWorkMs + (record.activeAt === null ? 0 : now() - record.activeAt);
  }
  function stopClock(record) {
    if (record.activeAt !== null) record.elapsedWorkMs += now() - record.activeAt;
    record.activeAt = null;
    if (record.budgetTimer !== null) clearTimer(record.budgetTimer);
    record.budgetTimer = null;
  }
  function syncClock(record) {
    if (!record.plan || !record.outstanding || !eligible(record) || epochs.get(record.group.epoch).stalled) { stopClock(record); return; }
    if (record.activeAt !== null) return;
    record.activeAt = now();
    record.budgetTimer = setTimer(() => {
      record.budgetTimer = null;
      if (!record.result && eligible(record) && workElapsed(record) >= record.budgetMs) {
        settle(record, 'budget-exceeded', 'elapsed-work', { continuation: 'resume' }); emit('settled', record);
      }
    }, Math.max(0, Math.ceil(record.budgetMs - record.elapsedWorkMs)));
  }
  function queue(record) {
    const set = ready[record.rank];
    if (record.next && eligible(record)) set.add(record); else set.delete(record);
    syncClock(record);
  }
  function reserve(record) {
    if (record.result || record.group.cancellation) return;
    if (record.plan && !record.next) record.next = record.plan.next();
    if (record.plan && record.plan.exhausted()) settle(record, 'completed', null);
    else queue(record);
  }
  function cleanup(record) {
    if (!record.result || record.outstanding) return;
    records.delete(record); record.view.members.delete(record); record.group.members.delete(record);
    if (record.group.main === record) record.group.main = null;
    cleanupGroup(record.group);
  }
  function cleanupGroup(group) {
    if (!group.members.size && !group.outstanding) groups.delete(group.jobId);
  }
  function refreshInstruments(view) {
    if (view.instrumentTimer !== null) clearTimer(view.instrumentTimer);
    view.instrumentTimer = null;
    const first = view.instruments.values().next().value;
    if (!first) return;
    queue(first);
    const remaining = nextInstrumentAt(view) - now();
    if (remaining > 0) view.instrumentTimer = setTimer(() => {
      view.instrumentTimer = null;
      const next = view.instruments.values().next().value;
      if (next) { queue(next); emit('ready', next); }
    }, Math.ceil(remaining));
  }
  function settle(record, outcome, reason, extra = {}) {
    if (record.result) return;
    if (!RENDER_OUTCOMES.includes(outcome)) throw new RangeError(`unknown render outcome: ${outcome}`);
    stopClock(record); ready[record.rank].delete(record); record.next = null;
    if (record.view.instruments.delete(record)) refreshInstruments(record.view);
    record.result = Object.freeze({ outcome, reason, ...extra }); record.done.resolve(record.result);
    if (record.view.pending === record) record.view.pending = null;
    record.view.running.delete(record);
    if (record.view.updateJob === record) record.view.updateJob = null;
    cleanup(record);
  }
  function groupFor(jobId, view, targetEpoch) {
    identifier(jobId, 'jobId');
    const existing = groups.get(jobId);
    if (existing) {
      if (existing.view !== view || existing.epoch !== targetEpoch || existing.cancellation || existing.closed) {
        throw new RangeError('jobId belongs to a different view, epoch or terminal job');
      }
      return existing;
    }
    const group = { jobId, view, epoch: targetEpoch, members: new Set(), main: null,
      outstanding: 0, submitted: 0, cancellation: null, lost: false, closed: false };
    groups.set(jobId, group); return group;
  }
  function newRecord(group, rank, plan = null, kind = null) {
    const record = { group, view: group.view, rank, plan, kind, next: null, done: deferred(), result: null,
      outstanding: 0, requestedAt: now(), admittedAt: null, elapsedWorkMs: 0, activeAt: null,
      budgetTimer: null, instrument: plan?.request.output?.purpose === 'instrument',
      budgetMs: plan?.request.output?.purpose === 'export' ? limits.exportMs : limits[`${kind}Ms`],
    };
    records.add(record); group.members.add(record); record.view.members.add(record); return record;
  }
  function cancellationResult(group) {
    if (!group.cancellation || group.outstanding) return;
    const submitted = group.lost && group.submitted ? 'interrupted' : group.submitted ? 'drained' : 'none';
    group.cancellation.resolve(Object.freeze({ outcome: 'cancelled', submitted }));
    // cancel() removed unsubmitted auxiliaries immediately; remaining members are
    // the main job and at most maxOutstanding issued auxiliary operations.
    for (const member of group.members) settle(member, 'cancelled', 'cancelled', { submitted });
    cleanupGroup(group);
  }
  function cancelGroup(group) {
    if (group.cancellation) return { accepted: true, done: group.cancellation.promise };
    group.cancellation = deferred();
    for (const member of group.members) {
      ready[member.rank].delete(member); member.next = null; stopClock(member);
      if (member.view.pending === member) member.view.pending = null;
      if (member.view.updateJob === member) member.view.updateJob = null;
      member.view.running.delete(member);
      if (member.view.instruments.delete(member)) refreshInstruments(member.view);
      if (!member.plan && !member.outstanding) settle(member, 'cancelled', 'cancelled', { submitted: 'none' });
    }
    cancellationResult(group);
    return { accepted: true, done: group.cancellation.promise };
  }
  function armWatchdog(state, progress = false) {
    if (state.timer !== null) clearTimer(state.timer);
    state.timer = null;
    if (!state.outstanding || state.stalled || state.lost) return;
    if (progress || state.progressAt === null) state.progressAt = now();
    const deadline = state.progressAt + watchdogMs;
    state.timer = setTimer(() => {
      state.timer = null;
      if (!state.outstanding || state.lost || state.stalled) return;
      state.stalled = true;
      // Only lease holders are implicated. Unissued jobs keep their ready entries,
      // including jobs requested during the stall. No resource retirement occurs.
      const affected = new Set();
      for (const { record } of leases.values()) if (record.group.epoch === state.epoch) affected.add(record.group);
      for (const group of affected) {
        group.closed = true;
        for (const record of group.members) settle(record, 'budget-exceeded', 'watchdog', { continuation: 'lower-cost' });
      }
      emit('watchdog');
    }, Math.max(0, Math.ceil(deadline - now())));
  }
  function releaseLease(admission, record) {
    leases.delete(admission); record.outstanding--; record.group.outstanding--;
    const state = epochs.get(record.group.epoch); state.outstanding--;
    if (!state.outstanding) { state.progressAt = null; state.stalled = false; }
    armWatchdog(state, true); syncClock(record);
  }
  function changeView(viewId, change) {
    const view = viewFor(viewId); change(view);
    for (const record of view.members) queue(record);
    emit('view');
  }
  function endUpdate(view) {
    const selected = view.updateJob;
    view.updateJob = null;
    if (selected && view.pending) cancelGroup(selected.group);
  }

  return Object.freeze({
    registerView(viewId, { hidden = false } = {}) {
      identifier(viewId, 'viewId');
      if (views.has(viewId)) throw new RangeError(`view already registered: ${viewId}`);
      views.set(viewId, { viewId, hidden: Boolean(hidden), paused: false, updateJob: null, pending: null,
        members: new Set(), running: new Set(), instruments: new Set(), instrumentTimer: null, lastInstrumentAt: -Infinity });
      emit('view');
    },
    setEpoch(value) {
      if (!Number.isSafeInteger(value) || value < 0 || (value !== 0 && value < highestEpoch)) {
        throw new RangeError('epoch must be zero or a nondecreasing positive integer');
      }
      epoch = value; highestEpoch = Math.max(highestEpoch, value);
      if (value && !epochs.has(value)) epochs.set(value, { epoch: value, outstanding: 0, stalled: false, lost: false, progressAt: null, timer: null });
      // Changing the current epoch is not evidence that old resources were lost.
      for (const record of records) queue(record);
      emit('epoch');
    },
    request(viewId, { jobId, requestId, priority, kind, plan }) {
      const view = viewFor(viewId), rank = priorityIndex(priority);
      identifier(requestId, 'requestId');
      if (!['draft', 'settled'].includes(kind)) throw new RangeError('kind must be draft or settled');
      if (!plan || ['next', 'advance', 'exhausted'].some(method => typeof plan[method] !== 'function')) {
        throw new TypeError('request requires a JobPlan');
      }
      const request = plan.request;
      if (!epoch || epochs.get(epoch).lost || request?.jobId !== jobId || request.requestId !== requestId ||
        request.viewId !== viewId || request.generation?.deviceEpoch !== epoch) throw new RangeError('plan request identity must match the current epoch and job');
      if (groups.get(jobId)?.main) throw new RangeError('job already requested');
      const group = groupFor(jobId, view, epoch);
      const record = newRecord(group, rank, plan, kind); group.main = record;
      record.public = Object.freeze({ jobId, requestId, viewId, request: deepFreeze(structuredClone(request)), done: record.done.promise });
      const interactive = !request.output?.purpose || request.output.purpose === 'interactive';
      record.interactive = interactive;
      if (interactive) {
        if (view.pending) {
          const previous = view.pending.group;
          for (const member of previous.members) settle(member, 'superseded', 'newer-request');
        }
        // Input coalesces only unissued work. Clients explicitly cancel running
        // jobs when necessary; input cadence must not determine render cadence.
        view.pending = record;
      }
      // Instruments start at most twice a second per view. Continuation batches of
      // that same snapshot are not throttled. No controller-specific cadence exists.
      if (record.instrument) view.instruments.add(record);
      reserve(record);
      if (record.instrument) refreshInstruments(view);
      emit('request', record); return record.public;
    },
    ready(jobId, { epoch: readyEpoch } = {}) {
      const record = groups.get(jobId)?.main;
      if (!record || !epoch || readyEpoch !== epoch || record.group.epoch !== epoch || epochs.get(epoch).lost ||
        record.result || record.group.cancellation || record.group.closed || record.next) return false;
      // Reuse reservation and eligibility; admission alone owns the lease limit.
      // A cached operation makes duplicates a no-op, including from a listener.
      reserve(record);
      if (!record.next && !record.result) return false;
      emit(record.result ? 'settled' : 'ready', record); return true;
    },
    requestAuxiliary(viewId, { jobId, priority, operation }) {
      const view = viewFor(viewId), rank = priorityIndex(priority);
      const identity = (operation?.batch ?? operation?.descriptor)?.identity;
      if (!epoch || epochs.get(epoch).lost || identity?.jobId !== jobId || identity.viewId !== viewId || identity.generation?.deviceEpoch !== epoch) {
        throw new RangeError('auxiliary operation identity must match its view, job and current epoch');
      }
      const record = newRecord(groupFor(jobId, view, epoch), rank); record.next = operation;
      queue(record); emit('request', record); return Object.freeze({ done: record.done.promise });
    },
    admit() {
      const state = epochs.get(epoch), admitted = [];
      if (!state || state.stalled || state.lost) return admitted;
      // Exactly five priority checks per available slot, independent of backlog.
      for (let slot = state.outstanding; slot < maxOutstanding; slot++) {
        let record;
        for (const set of ready) if (set.size) { record = set.values().next().value; break; }
        if (!record) break;
        let admission;
        try {
          admission = makeAdmission({ epoch, jobId: record.group.jobId });
          if (!admission || admission.epoch !== epoch || admission.jobId !== record.group.jobId ||
            typeof admission.consume !== 'function' || issuedAdmissions.has(admission)) throw new TypeError('invalid admission factory result');
        } catch (error) {
          // Deliver any leases already issued by this call. The failing operation
          // remains ready; a subsequent attempt with no successes surfaces error.
          if (!admitted.length) throw error;
          break;
        }
        issuedAdmissions.add(admission);
        const operation = record.next; record.next = null; ready[record.rank].delete(record);
        leases.set(admission, { record, operation }); record.outstanding++; record.group.outstanding++; record.group.submitted++; state.outstanding++;
        if (record.admittedAt === null) {
          record.admittedAt = now();
          if (record.instrument) {
            record.view.lastInstrumentAt = now(); record.view.instruments.delete(record); refreshInstruments(record.view);
          }
        }
        // An owner's first auxiliary lease also makes that job running: a later
        // request cannot supersede it merely because its plan has not issued yet.
        const owner = record.group.main;
        if (record.view.pending === owner) record.view.pending = null;
        if (owner?.interactive && !owner.result) record.view.running.add(owner);
        armWatchdog(state); syncClock(record);
        admitted.push(Object.freeze({ operation, admission }));
        if (record.plan) reserve(record);
      }
      if (admitted.length) emit('admitted');
      return admitted;
    },
    completed(admission, evidence) {
      const item = leases.get(admission);
      if (!item || evidence?.epoch !== epoch || item.record.group.epoch !== epoch) return false;
      nonnegative(evidence.elapsedMs, 'elapsedMs');
      if (evidence.timestampMs !== undefined) nonnegative(evidence.timestampMs, 'timestampMs');
      const { record, operation } = item;
      const completion = { epoch, elapsedMs: evidence.elapsedMs,
        ...(evidence.timestampMs === undefined ? {} : { timestampMs: evidence.timestampMs }), targetMs: batchTargetMs };
      if (record.plan && !record.result && !record.group.cancellation) {
        try { record.plan.advance(operation, completion); }
        catch (error) { settle(record, 'failed', String(error.message ?? error)); }
      }
      releaseLease(admission, record);
      if (record.group.cancellation) cancellationResult(record.group);
      else if (!record.result) {
        if (record.plan) reserve(record); else settle(record, 'completed', null);
      }
      cleanup(record); emit('completed', record); return true;
    },
    failed(admission, error) {
      const item = leases.get(admission);
      if (!item || item.record.group.epoch !== epoch) return false;
      const { record } = item;
      // B06 must report failure only before queue entry or after the queue fence.
      // An earlier failure wins the job outcome; a later failure drains a cancel.
      if (!record.group.cancellation) {
        record.group.closed = true;
        for (const member of record.group.members) settle(member, 'failed', String(error?.message ?? error));
      }
      releaseLease(admission, record); cancellationResult(record.group);
      cleanup(record); emit('failed', record); return true;
    },
    interrupted(lostEpoch) {
      const state = epochs.get(lostEpoch);
      if (!state || state.lost) return false;
      state.lost = true;
      state.stalled = false; state.progressAt = null;
      if (state.timer !== null) clearTimer(state.timer);
      state.timer = null;
      for (const [admission, { record }] of leases) if (record.group.epoch === lostEpoch) {
        leases.delete(admission); record.outstanding--; record.group.outstanding--; state.outstanding--;
      }
      for (const group of groups.values()) if (group.epoch === lostEpoch) {
        group.lost = true;
        if (group.cancellation) cancellationResult(group);
        else for (const record of group.members) settle(record, 'interrupted', 'device-lost');
        for (const record of group.members) cleanup(record);
        cleanupGroup(group);
      }
      emit('interrupted'); return true;
    },
    pause(viewId) { changeView(viewId, view => { view.paused = true; endUpdate(view); }); },
    resume(viewId) { changeView(viewId, view => { view.paused = false; endUpdate(view); }); },
    update(viewId) {
      const view = viewFor(viewId);
      // The supplied JobPlan already owns the frozen scene. Pin its identity now,
      // before admission, so a later edit occupies only the coalesced pending slot.
      const record = view.updateJob ?? view.pending ?? view.running.values().next().value ?? null;
      view.paused = true; view.updateJob = record;
      if (view.pending === record) view.pending = null;
      if (record?.interactive) view.running.add(record);
      for (const member of view.members) queue(member);
      emit('view');
    },
    hidden(viewId, value) { changeView(viewId, view => { view.hidden = Boolean(value); }); },
    cancel(jobId) {
      const group = groups.get(jobId);
      if (!group) return { accepted: false, done: Promise.resolve(null) };
      const result = cancelGroup(group); emit('cancel'); return result;
    },
    snapshot() {
      return deepFreeze({ epoch, stalled: epochs.get(epoch)?.stalled ?? false, outstanding: epochs.get(epoch)?.outstanding ?? 0,
        views: [...views.values()].map(view => ({ viewId: view.viewId, paused: view.paused, hidden: view.hidden,
          updating: view.updateJob?.group.jobId ?? null, pending: view.pending?.group.jobId ?? null })),
        jobs: [...records].map(record => ({ jobId: record.group.jobId, requestId: record.plan?.request.requestId ?? null,
          viewId: record.view.viewId, epoch: record.group.epoch, auxiliary: !record.plan,
          priority: PRIORITIES[record.rank], kind: record.kind, outcome: record.result?.outcome ?? null,
          requestedAt: record.requestedAt, admittedAt: record.admittedAt,
          elapsedMs: now() - record.requestedAt, elapsedWorkMs: workElapsed(record), outstanding: record.outstanding,
        })),
      });
    },
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('listener must be a function');
      listeners.add(listener); return () => listeners.delete(listener);
    },
  });
}
