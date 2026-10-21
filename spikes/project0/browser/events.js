// spikes/project0/browser/events.js — one page clock for every timing event.
const log = [];
export const mark = (type, fields = {}) => { const e = { type, t: performance.now(), ...fields }; log.push(e); return e; };
export const list = () => log.slice();
export const clear = () => { log.length = 0; };
let seq = 0;
export async function harness(fn) {
  const id = `h${seq++}`; performance.mark(`${id}-start`);
  try { return await fn(); } finally { performance.mark(`${id}-end`); performance.measure(`harness:${id}`, `${id}-start`, `${id}-end`); }
}
