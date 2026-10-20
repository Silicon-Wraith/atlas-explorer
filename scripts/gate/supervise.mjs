// Runs one child process under hard wall-clock bounds in its own process group (spawned detached),
// and on exit or deadline kills the whole group, bounded: SIGTERM, then SIGKILL, each phase at most
// `cleanupMs`. Cleanup is `confirmed` only when the group is observed empty (signal 0 → ESRCH) and
// the leader has closed; anything else — a surviving member, or a probe that fails for another
// reason — is `unconfirmed`, which every classifier treats as a failure. The result always arrives
// within timeoutMs + 2 × cleanupMs plus one poll.
// Scope (controller ruling, 2026-10-20): the group is the unit of ownership. Processes that leave
// it (Playwright starts the browser in a group of its own) are closed by the suite itself through
// `closeWithin`, which exits 125 when it cannot confirm the close.
export const POLL_MS = 50;
const sleep = ms => new Promise(wake => setTimeout(wake, ms));

// → 'empty' | 'alive' | 'unknown'
export function probeGroup(groupSignal, pgid) {
  try { groupSignal(pgid, 0); return 'alive'; }
  catch (error) { return error?.code === 'ESRCH' ? 'empty' : 'unknown'; }
}

// leader: { closed() → boolean }. → 'not-needed' | 'confirmed' | 'unconfirmed'
export async function cleanUpGroup({ groupSignal, pgid, leader, cleanupMs }) {
  if (!pgid) return leader.closed() ? 'not-needed' : 'unconfirmed';
  const state = () => { const group = probeGroup(groupSignal, pgid); return group === 'unknown' ? 'unknown' : group === 'empty' && leader.closed() ? 'empty' : 'alive'; };
  let current = state();
  if (current === 'empty') return 'not-needed';
  for (const name of ['SIGTERM', 'SIGKILL']) {
    if (current !== 'alive') break;
    try { groupSignal(pgid, name); } catch { /* checked by the probe */ }
    const until = Date.now() + cleanupMs;
    do { await sleep(Math.min(POLL_MS, cleanupMs)); current = state(); } while (current === 'alive' && Date.now() < until);
  }
  return current === 'empty' ? 'confirmed' : 'unconfirmed';
}

const defaultGroupSignal = (pgid, signal) => process.kill(-pgid, signal);

export function runBounded({ spawnFn, groupSignal = defaultGroupSignal, command, args = [], options = {}, timeoutMs, cleanupMs = 5000, echo = false }) {
  if (typeof spawnFn !== 'function') throw new TypeError('runBounded requires spawnFn');
  if (!(Number.isFinite(timeoutMs) && timeoutMs > 0)) throw new RangeError('runBounded requires a positive timeoutMs');
  return new Promise(resolve => {
    let child, stdout = '', stderr = '', timedOut = false, finishing = false, closed = false;
    try { child = spawnFn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options, detached: true }); }
    catch (error) { resolve({ stdout, stderr, timedOut, exitCode: null, signal: null, spawnError: error.message, cleanup: 'not-needed' }); return; }
    async function finish(result) {
      if (finishing) return;
      finishing = true;
      clearTimeout(deadline);
      const cleanup = await cleanUpGroup({ groupSignal, pgid: child.pid, leader: { closed: () => closed }, cleanupMs });
      resolve({ stdout, stderr, timedOut, ...result, cleanup });
    }
    const deadline = setTimeout(() => { timedOut = true; finish({ exitCode: null, signal: 'deadline', spawnError: null }); }, timeoutMs);
    child.stdout?.on('data', data => { stdout += data; if (echo) process.stdout.write(data); });
    child.stderr?.on('data', data => { stderr += data; if (echo) process.stderr.write(data); });
    child.once('error', error => { closed = true; finish({ exitCode: null, signal: null, spawnError: error.message }); });
    // Cleanup begins at the leader's exit, not at close: a descendant that keeps the inherited
    // stdout or stderr open delays close until the group is killed. Confirmation still needs
    // close (leader.closed) and an empty group.
    child.once('exit', (exitCode, signal) => finish({ exitCode, signal, spawnError: null }));
    child.once('close', (exitCode, signal) => { closed = true; finish({ exitCode, signal, spawnError: null }); });
  });
}
