import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export function observeOwnedProcesses() {
  const pids = new Set(), samples = [], errors = []; let busy = false;
  async function sample() {
    if (busy) return; busy = true;
    try {
      const { stdout } = await exec('ps', ['-e', '-o', 'pid=,ppid=,rss=,comm='], { timeout: 2000 });
      const rows = stdout.trim().split('\n').map(line => { const [pid, ppid, rss, comm] = line.trim().split(/\s+/); return { pid: +pid, ppid: +ppid, rssKiB: +rss, comm }; });
      const owned = new Set([process.pid]); let changed = true;
      while (changed) { changed = false; for (const row of rows) if (row.comm !== 'ps' && owned.has(row.ppid) && !owned.has(row.pid)) { owned.add(row.pid); changed = true; } }
      const tree = rows.filter(row => owned.has(row.pid)); for (const row of tree) if (row.pid !== process.pid) pids.add(row.pid);
      samples.push({ time: Date.now(), tree, rssKiB: tree.reduce((sum, row) => sum + row.rssKiB, 0) });
    } finally { busy = false; }
  }
  const timer = setInterval(() => sample().catch(error => { if (errors.length < 32) errors.push(error.message); }), 1000);
  return { sample, async stop() {
    clearInterval(timer); while (busy) await new Promise(resolve => setTimeout(resolve, 20));
    let alive = [];
    for (let i = 0; i < 30; i++) { alive = [...pids].filter(pid => { try { process.kill(pid, 0); return true; } catch { return false; } }); if (!alive.length) break; await new Promise(resolve => setTimeout(resolve, 100)); }
    return { ownedPids: [...pids], alive, samples, errors, peakRssKiB: Math.max(0, ...samples.map(sample => sample.rssKiB)) };
  } };
}
