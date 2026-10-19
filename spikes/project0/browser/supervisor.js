// spikes/project0/browser/supervisor.js — the page's side of the supervision protocol (T9 fix round 2, Codex T9 r2 findings 1 and 2; the Node
// side is session-utils.mjs). Every exchange goes through Node's binding window.p0Push, and every reply is bounded.
// - Outside measured windows the page heartbeats, so Node can bound its responsiveness.
// - window(name, fn): heartbeat scheduling stops and every outstanding reply is awaited; the opening declaration is sent and its acknowledgement
//   awaited *before* fn takes its start timestamp; after fn has stopped measuring, the closing declaration is sent and its reply awaited before
//   anything else (heartbeats resume afterwards). Nothing crosses into the window: a binding's reply is delivered by an evaluation in the page.
// - checkpoint(cp, abort): G12's cycle-boundary exchange, awaited (bounded, raced against the abort) before the next cycle starts.
// - closeImplicit(name): closes G2's navigation window, which Node armed before navigation.
// Without a transport (no window.p0Push: Node installed none, and then fails closed itself) the page runs unsupervised.
export function createSupervisor({ push = () => globalThis.p0Push, heartbeatMs = 1000, replyMs = 5000 } = {}) {
  let timer = null, seq = 0; const inflight = new Set();
  const available = () => typeof push() === 'function';
  const send = message => {
    const reply = Promise.resolve().then(() => push()(message));
    inflight.add(reply); reply.then(() => inflight.delete(reply), () => inflight.delete(reply));
    return reply;
  };
  const answered = (promise, what) => {
    let t;
    return Promise.race([promise, new Promise((_, reject) => { t = setTimeout(() => reject(new Error(`harness timeout: ${what} was not answered within ${replyMs} ms`)), replyMs); })]).finally(() => clearTimeout(t));
  };
  const accepted = (reply, what) => { if (!reply?.ok) throw new Error(`harness timeout: window protocol: ${what} refused (${reply?.reason ?? 'no reply'})`); };
  const sup = {
    available,
    startHeartbeats() {
      if (timer || !available()) return;
      const beat = () => { send({ type: 'heartbeat' }).catch(() => {}); };
      beat(); timer = setInterval(beat, heartbeatMs);
    },
    async quiesce() {
      const resume = timer !== null;
      if (timer) { clearInterval(timer); timer = null; }
      await answered(Promise.allSettled([...inflight]), 'an outstanding binding reply');
      return resume;
    },
    async window(name, fn) {
      if (!available()) return fn();
      const resume = await sup.quiesce(), id = ++seq;
      accepted(await answered(send({ type: 'window-open', id, name }), `the window ${name} open`), `open of ${name}`);
      let result, failed = null;
      try { result = await fn(); } catch (error) { failed = error; }
      try { accepted(await answered(send({ type: 'window-close', id, name }), `the window ${name} close`), `close of ${name}`); }
      catch (error) { failed ??= error; }
      if (resume) sup.startHeartbeats();
      if (failed) throw failed;
      return result;
    },
    async closeImplicit(name) {
      if (!available()) return;
      accepted(await answered(send({ type: 'window-close', id: 0, name }), `the window ${name} close`), `close of ${name}`);
    },
    async checkpoint(checkpoint, abort = { race: p => p }) {
      if (!available()) return;
      const reply = await abort.race(answered(send({ type: 'checkpoint', checkpoint }), 'the cycle-boundary checkpoint'));
      if (reply !== true) throw new Error(`harness timeout: window protocol: checkpoint refused (${reply?.reason ?? 'no reply'})`);
    },
  };
  return sup;
}

let page = null;
export const pageSupervisor = () => (page ??= createSupervisor());
