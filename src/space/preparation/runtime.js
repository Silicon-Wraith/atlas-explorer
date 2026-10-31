// Prepared-region ownership and motion, independent of DOM, GPU and field math.
import { createPreparationSession } from './lifecycle.js';
import { representationKey, worldReference } from './contract.js';
import { regionCovers, regionClear, sweepRegion } from './region-navigation.js';
import { predictRegionAddresses } from './prediction.js';

const add = (a, b) => a.map((x, i) => x + b[i]);
const length = v => Math.hypot(...v);
export function createPreparedRuntime({ runtimeId, world, producerIdentity, grid, viewGrid, fineBounds, poseModel, produce, prepare,
  now = () => performance.timeOrigin + performance.now(), onEvent = () => {} }) {
  const session = createPreparationSession({ runtimeId, producer: producerIdentity, maxLive: 13 });
  const residents = new Map(), pending = new Map(), retiring = new Map(), retiringBody = new Set(), retiringViews = new Set();
  const D = grid.config.diameter;
  let pose = poseModel.create(), active = null, view = null, closed = false, startup = false, disposal;
  let horizon = 2, clock = 0, wanted = new Set(), fineWanted = false, fatal = null;
  const event = (type, data = {}) => onEvent({ type, time: now(), ...data });
  const fail = error => { fatal ??= error; event('runtime-error', { message: error.message }); };
  const bodyCount = () => [...residents.values()].filter(r => r.kind !== 'view').length + [...pending.values()].filter(p => p.kind !== 'view').length + retiringBody.size;
  const viewCount = () => [...residents.values()].filter(r => r.kind === 'view').length + [...pending.values()].filter(p => p.kind === 'view').length + retiringViews.size;
  const protectedKeys = () => new Set([active?.addressKey, ...wanted, ...(fineWanted || pose.bodyDiameterM === D / 4 ? ['fine', '0,0,0'] : [])]);
  function retire(region) {
    if (!region) return Promise.resolve();
    if (retiring.has(region.addressKey)) return retiring.get(region.addressKey);
    if (region === active) return Promise.reject(new Error('Cannot retire active interaction coverage'));
    if (residents.get(region.addressKey) === region) residents.delete(region.addressKey);
    if (view === region) view = null;
    if (region.kind !== 'view') retiringBody.add(region); else retiringViews.add(region);
    const task = region.ticket.retire().then(() => event('retired', { addressKey: region.addressKey, key: region.key })).finally(() => {
      retiringBody.delete(region); retiringViews.delete(region); if (retiring.get(region.addressKey) === task) retiring.delete(region.addressKey);
    });
    retiring.set(region.addressKey, task); return task;
  }
  function makeRoom() {
    if (bodyCount() < 8) return true;
    const protectedSet = protectedKeys(), victim = [...residents.values()].filter(r => r.kind !== 'view' && !protectedSet.has(r.addressKey)).sort((a, b) => a.used - b.used)[0];
    if (victim) retire(victim).catch(fail);
    return bodyCount() < 8;
  }
  function request(kind, address = [0, 0, 0]) {
    if (closed || fatal) return Promise.resolve(null);
    const g = kind === 'view' ? viewGrid : grid, key = kind === 'fine' ? 'fine' : (kind === 'view' ? 'v:' : '') + g.key(address);
    if (residents.has(key)) return Promise.resolve(residents.get(key));
    if (pending.has(key)) return pending.get(key).done;
    if (retiring.has(key) || pending.size >= 3 || kind === 'view' && viewCount() >= 2 || kind !== 'view' && !makeRoom()) return Promise.resolve(null);
    const started = now(), unit = kind === 'fine' ? D / 4 : kind === 'view' ? 4 * D : D;
    let resources;
    const ticket = session.start({ world: worldReference(world), bounds: kind === 'fine' ? fineBounds : g.bounds(address), intent: kind === 'view' ? 'view' : 'interaction',
      requirements: { maxErrorM: .01 * unit, bodyDiameterM: kind === 'view' ? null : unit } }, {
      produce, prepare: async (artifact, payload, signal) => { const receipt = await prepare(artifact, payload, signal); resources = receipt.lease.value; return receipt; },
    });
    event('request', { requestId: ticket.request.identity.requestId, kind, address, addressKey: key, started });
    const item = { kind, ticket, done: null }; pending.set(key, item);
    item.done = ticket.done.then(async result => {
      if (pending.get(key) === item) pending.delete(key);
      if (result.interactionEligible || result.viewEligible) {
        if (closed) { await ticket.retire(); return null; }
        const region = { ...resources, artifact: result.artifact, key: representationKey(result.artifact), kind, address, addressKey: key, ticket, used: ++clock, ready: now() };
        residents.set(key, region);
        if (kind === 'view') { const previous = view; view = region; if (previous) await retire(previous); }
        horizon = Math.min(4, Math.max(2, (region.ready - started) / 1000 + .25));
        event('ready', { requestId: ticket.request.identity.requestId, addressKey: key, kind, address, key: region.key, artifact: region.artifact, readinessMs: region.ready - started });
        return region;
      }
      event('request-settled', { requestId: ticket.request.identity.requestId, addressKey: key, state: result.state, reason: result.reason });
      if (['failed', 'unresolved'].includes(result.state) || result.state === 'unsupported' && !/capacity/i.test(result.reason ?? '')) throw new Error('Preparation ' + result.state + ': ' + result.reason);
      return null;
    }).catch(error => { fail(error); return null; });
    return item.done;
  }
  function select(region) {
    if (active === region) return;
    const previous = active?.addressKey; active = region; active.used = ++clock;
    event('entry', { addressKey: active.addressKey, address: active.address, previous, key: active.key, renderRevision: active.key, collisionRevision: active.key, position: poseModel.positionM(pose), bodyD: pose.bodyDiameterM });
  }
  async function start(requestedPose) {
    if (closed || active || startup) throw new Error('Runtime already active, starting or closed');
    startup = true; pose = poseModel.validate(requestedPose);
    try {
      const position = poseModel.positionM(pose), fine = pose.bodyDiameterM === D / 4;
      const address = fine ? [0, 0, 0] : grid.nearest(position) ?? grid.covering(position)[0];
      if (!address) throw new Error('Requested pose has no supported prepared coverage');
      wanted = new Set([grid.key(address), ...(fine ? ['fine', '0,0,0'] : [])]);
      const home = await request('coarse', address), selected = fine ? await request('fine') : home;
      if (closed) throw new Error('Activation superseded during preparation');
      if (!selected || !regionClear(selected, position, pose.bodyDiameterM) || fine && !residents.has('0,0,0')) throw fatal ?? new Error('Requested pose lacks prepared body clearance');
      select(selected); const viewAddress = viewGrid.nearest(position);
      if (viewAddress) await request('view', viewAddress);
      if (closed || fatal) throw fatal ?? new Error('Activation superseded');
      return snapshot();
    } finally { startup = false; }
  }
  function predict(velocityMps) {
    if (closed || fatal || !active) return;
    const position = poseModel.positionM(pose), addresses = pose.bodyDiameterM === D ? predictRegionAddresses(grid, position, velocityMps, horizon, { max: 3 }) : [];
    wanted = new Set(addresses.map(address => grid.key(address)));
    for (const [key, item] of pending) if (item.kind === 'coarse' && !wanted.has(key) && key !== active.addressKey && !(fineWanted && key === '0,0,0')) item.ticket.cancel('obsolete prediction').catch(fail);
    for (const address of addresses) request('coarse', address);
    if (fineWanted || pose.bodyDiameterM === D / 4) { request('coarse'); request('fine'); }
    if (![...pending.values()].some(item => item.kind !== 'view') && addresses.every(address => residents.has(grid.key(address)))) {
      const address = viewGrid.nearest(position);
      if (address && 'v:' + viewGrid.key(address) !== view?.addressKey && ![...pending.values()].some(item => item.kind === 'view')) request('view', address);
    }
  }
  function move(deltaM) {
    if (closed || fatal || !active) throw fatal ?? new Error('Movement has no active runtime');
    if (!Array.isArray(deltaM) || deltaM.length !== 3 || !deltaM.every(Number.isFinite) || length(deltaM) > .05 * pose.bodyDiameterM + 1e-12) throw new RangeError('Movement exceeds the bounded prepared step');
    const began = now(), start = poseModel.positionM(pose), end = add(start, deltaM); let candidate = active;
    if (!poseModel.supportsPositionM(end, pose.bodyDiameterM)) {
      event('navigation', { ms: now() - began, waiting: true, reason: 'finite-domain', firstSurface: false, bodyD: pose.bodyDiameterM });
      return { waiting: true, reason: 'finite-domain', hit: null };
    }
    if (pose.bodyDiameterM === D) {
      const nearest = grid.nearest(end), best = nearest && residents.get(grid.key(nearest));
      if (best && best !== active && regionCovers(best, start, end, D) && regionClear(best, start, D)) candidate = best;
      if (!regionCovers(candidate, start, end, D)) candidate = [...residents.values()].find(r => r.kind === 'coarse' && regionCovers(r, start, end, D) && regionClear(r, start, D));
    }
    if (!candidate || !regionCovers(candidate, start, end, pose.bodyDiameterM)) { event('navigation', { ms: now() - began, waiting: true, firstSurface: false, bodyD: pose.bodyDiameterM }); return { waiting: true, hit: null }; }
    select(candidate);
    const firstSurface = candidate.artifact.classification === 'surface' && candidate.castQueries === 0, result = sweepRegion(candidate, start, deltaM, pose.bodyDiameterM);
    pose = poseModel.withPositionM(pose, add(start, deltaM.map(x => x * result.fraction))); active.used = ++clock;
    if (result.hit) event('contact', { addressKey: active.addressKey, key: active.key, start, position: poseModel.positionM(pose), delta: deltaM, hit: result.hit, bodyD: pose.bodyDiameterM });
    event('navigation', { ms: now() - began, waiting: false, classification: active.artifact.classification, kind: active.kind, firstSurface, contact: !!result.hit, bodyD: pose.bodyDiameterM });
    return { waiting: false, hit: result.hit };
  }
  function scale(smaller) {
    if (closed || !active) return false;
    const bodyDiameterM = smaller ? D / 4 : D;
    if (bodyDiameterM === pose.bodyDiameterM) return true;
    const candidate = residents.get(smaller ? 'fine' : '0,0,0'), position = poseModel.positionM(pose);
    if (!candidate || smaller && !residents.has('0,0,0')) { if (smaller) requestFine(); event('scale-deferred', { reason: 'preparation', smaller }); return false; }
    if (!regionClear(candidate, position, bodyDiameterM)) { event('scale-deferred', { reason: 'clearance-or-coverage', smaller }); return false; }
    pose = poseModel.create({ ...pose, bodyDiameterM }); select(candidate); fineWanted = smaller;
    event('scale', { bodyD: bodyDiameterM, position, displacement: 0 });
    if (!smaller) retire(residents.get('fine')).catch(fail);
    return true;
  }
  function requestFine() { fineWanted = true; request('coarse'); return request('fine'); }
  function snapshot() { return { pose, active: active?.addressKey ?? null, key: active?.key ?? null, pending: [...pending.keys()], resident: [...residents.keys()], ownedInteraction: bodyCount(), ownedView: viewCount(), session: session.diagnostics(), error: fatal?.message ?? null }; }
  function suspend() {
    if (disposal) return disposal;
    closed = true; active = null; view = null; event('suspended');
    disposal = (async () => { await session.shutdown({ timeoutMs: 25000 }); await Promise.all(retiring.values()); residents.clear(); pending.clear(); return { cleanup: true, session: session.diagnostics() }; })();
    return disposal;
  }
  return Object.freeze({ start, predict, move, scale, requestFine, snapshot, suspend,
    pose: () => pose, frame: () => ({ active, view, home: residents.get('0,0,0'), pose }),
    orient(q) { if (closed) return; pose = poseModel.create({ ...pose, orientationWxyz: q }); },
  });
}
