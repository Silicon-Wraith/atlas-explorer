// Fast GPU performance smoke check (B15). Not acceptance evidence: a ~1 minute regression signal that runs
// after every rendering change, before the full P3 harness.
// Usage: flock /mnt/ml_storage/scratch/atlas-gpu.lock node scripts/perf-smoke.mjs [--scene bulb|quaternion|menger|all]
//        [--port 5247] [--orbit-ms 10000] [--out <dir>] [--stalls]
// Reports per scene: orbit drafts/s and request->report p95, stress issuance lateness (frozen 4 ms rule), and the
// longest main-thread stall seen by a MessageChannel ping chain (unclamped, unlike setTimeout(0)).
// The probe keeps the main thread busy and itself delays issuance, so it is opt-in (--stalls); pass/fail is judged
// only without it.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { scheduleAbsolute } from '../tests/support/timing.mjs';
import { chromeLaunchEnv, CHROME_TMPDIR } from '../tests/support/bounded.mjs';
import { coldCacheEnvironment } from '../tests/support/cold-cache.mjs';
import { PROJECT0_LAUNCH_ARGS } from '../tests/support/space-suite.mjs';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const stallProbe = process.argv.includes('--stalls');
const sceneArg = arg('scene', 'all'), port = Number(arg('port', 5247)), orbitMs = Number(arg('orbit-ms', 10000));
const out = arg('out', `/mnt/ml_storage/scratch/perf-smoke/${new Date().toISOString().replace(/[:.]/g, '')}`);
if ([5173, 5180, 5195].includes(port)) throw Error(`port ${port} is reserved`);
const scenes = sceneArg === 'all' ? ['bulb', 'quaternion', 'menger'] : [sceneArg];
const LATE_MS = 4, STALL_BUDGET_MS = 4;

await mkdir(out, { recursive: true }); await mkdir(CHROME_TMPDIR, { recursive: true });
const workload = JSON.parse(await readFile('tests/reference/performance-workload.json'));
const server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { env: { ...process.env, PORT: String(port) }, stdio: 'pipe' });
await new Promise(r => server.stdout.once('data', r));
const cold = await coldCacheEnvironment(`${out}/cold`);
const browser = await chromium.launch({ channel: 'chrome', chromiumSandbox: true, headless: false, env: { ...chromeLaunchEnv(), ...cold.env }, args: ['--disable-dev-shm-usage', ...PROJECT0_LAUNCH_ARGS] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const quantile = (values, q) => { const s = [...values].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(s.length * q) - 1)] : null; };
const round = x => x == null ? null : Math.round(x * 10) / 10;

async function runScene(id) {
  const page = await context.newPage(); page.on('pageerror', e => console.error(`[${id}] pageerror`, e.message));
  await page.goto(`http://127.0.0.1:${port}`); await page.waitForFunction(() => Boolean(globalThis.atlas?.space));
  await page.evaluate(src => { globalThis.__sched = (0, eval)(`(${src})`); }, scheduleAbsolute.toString());
  await page.evaluate(async () => { const r = await atlas.workspaces.switchTo('space'); if (r.activeId !== 'space') throw Error(JSON.stringify(r)); });
  await page.evaluate(() => atlas.space.whenIdle({ timeoutMs: 115000 }));
  const scene = workload.scenes.find(s => s.id === id).scene;
  await page.evaluate(s => { const r = atlas.space.openSceneText(JSON.stringify(s)); if (r?.ok === false) throw Error(r.error); }, scene);
  await page.evaluate(() => atlas.space.whenIdle({ timeoutMs: 115000 }));
  const poses = workload.workloads.orbit.cameraPoses[id].filter(p => p.requestTimeMs < orbitMs);
  const alt = workload.workloads.stress.alternations[id];
  const result = await page.evaluate(async ([poses, alt, stallProbe]) => {
    const s = atlas.space, sched = { clock: () => performance.now(), setTimer: setTimeout };
    const requests = new Map(), reports = [];
    const stop = [s.onRequest(e => requests.set(e.identity.requestId, { at: performance.now(), profile: e.request.quality.profile })),
      s.onReport(r => reports.push({ id: r.requestId, outcome: r.outcome, at: performance.now() }))];
    let probing = true, last = performance.now(); const stalls = []; // only gaps over 1 ms are kept
    const channel = new MessageChannel(); channel.port1.onmessage = () => { const now = performance.now(); if (now - last > 1) stalls.push(now - last); last = now; if (probing) channel.port2.postMessage(0); }; if (stallProbe) channel.port2.postMessage(0);
    const phase = async (name, run) => { const from = performance.now(); const late = await run(); await new Promise(r => setTimeout(r, 400));
      return { name, from, to: performance.now(), late }; };
    const orbit = await phase('orbit', async () => { const start = performance.now() + 20;
      return (await __sched(sched, poses.map(p => start + p.requestTimeMs), (t, i) => s.requestCamera(poses[i].camera, { phase: i === poses.length - 1 ? 'commit' : 'preview' }))).lateByMs; });
    await s.whenIdle({ timeoutMs: 115000 });
    const stressStallFrom = stalls.length;
    const stress = await phase('stress', async () => { const start = performance.now() + 20;
      return (await __sched(sched, Array.from({ length: 40 }, (_, i) => start + 250 * i), (t, i) => { const r = s.editParameter(alt.path, i % 2 ? alt.base : alt.alternate); if (!r.ok) throw Error(r.error); })).lateByMs; });
    await s.whenIdle({ timeoutMs: 115000 }); probing = false; stop.forEach(f => f());
    const drafts = reports.filter(r => r.outcome === 'completed' && requests.get(r.id)?.profile === 'draft' && r.at >= orbit.from && r.at <= orbit.to);
    return { orbit, stress, orbitStalls: stalls.slice(0, stressStallFrom), stressStalls: stalls.slice(stressStallFrom),
      draftCount: drafts.length, draftLatencies: drafts.map(r => r.at - requests.get(r.id).at), orbitSeconds: (orbit.to - orbit.from - 400) / 1000 };
  }, [poses, alt, stallProbe]);
  await page.close();
  const summary = {
    scene: id, draftsPerSecond: round(result.draftCount / result.orbitSeconds), draftLatencyP95Ms: round(quantile(result.draftLatencies, 0.95)),
    orbitLateOver4: result.orbit.late.filter(x => x > LATE_MS).length, orbitLateMaxMs: round(result.orbit.late.reduce((a, b) => Math.max(a, b), 0)),
    stressLateOver4: result.stress.late.filter(x => x > LATE_MS).length, stressLateMaxMs: round(Math.max(...result.stress.late)),
    maxStallOrbitMs: round(result.orbitStalls.reduce((a, b) => Math.max(a, b), 0)), maxStallStressMs: round(result.stressStalls.reduce((a, b) => Math.max(a, b), 0)),
    stallsOverBudget: [...result.orbitStalls, ...result.stressStalls].filter(x => x > STALL_BUDGET_MS).length };
  summary.stallProbe = stallProbe;
  summary.pass = !stallProbe && summary.draftsPerSecond >= 30 && summary.draftLatencyP95Ms <= 100 && summary.orbitLateOver4 === 0 && summary.stressLateOver4 === 0;
  await writeFile(`${out}/${id}.json`, JSON.stringify({ summary, result }, null, 1));
  return summary;
}

let failed = false;
try {
  for (const id of scenes) { const s = await runScene(id); failed ||= !s.pass; console.log(JSON.stringify(s)); }
} finally { await browser.close(); server.kill(); await cold.cleanup?.(); }
console.log(`perf-smoke ${failed ? 'FAIL' : 'PASS'} -> ${out}`);
process.exitCode = failed ? 1 : 0;
