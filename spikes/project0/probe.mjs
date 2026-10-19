// spikes/project0/probe.mjs — first GPU run. Headed and headless, fresh profiles, attempt-1 flags. Each mode runs under an outer deadline;
// every outcome ends in an evidence record; a late result cannot resume work; a stop prevents the second mode. Dependencies are
// injectable for tests.
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { ROOT, HARNESS_PATH, startServer, launchChrome, effectiveCommandLine, assertSandboxed, chromeVersion, chromeGpuText } from './launch.mjs';
import { fixtureIdentity, implementationIdentity, launchIdentity, environmentIdentity, newRunDir, writeRecord } from './evidence.mjs';
import { bounded, boundedStart, waitResult, stopReasons } from './session-utils.mjs';

export async function runProbeInvocation(deps = {}) {
  const d = { chromium, startServer, launchChrome, effectiveCommandLine, waitResult, fixtureIdentity, implementationIdentity, newRunDir, writeRecord,
    browserVersion: chromeVersion, chromeGpuText, modeMs: 180000, stepMs: 20000, log: console.log, env: process.env, ...deps };
  const fixture = await d.fixtureIdentity(), implementation = await d.implementationIdentity();
  const runDir = await d.newRunDir('probe');
  const records = []; let stopped = null, server = null;
  try {
    server = await d.startServer();
    for (const mode of ['headed', 'headless']) {
      if (stopped) { d.log(`${mode}: NOT RUN (stopped: ${stopped})`); continue; }
      const invalidations = [], state = { expired: false }; let launched = null, resultMetrics = {}, probe = { ok: false }, chromeGpuText = '', launchInfo = { requestedArgs: null, mode, display: d.env.DISPLAY ?? null, session: d.env.XDG_SESSION_TYPE ?? null }, identity = null, cleanupFailed = false;   // display context is set before any await, so a failed launch records it too
      const publish = text => { if (text && !state.expired && !state.final) chromeGpuText = text; };   // invocation-owned chrome://gpu evidence; frozen once the mode ends
      const live = () => { if (state.expired) throw new Error('browser hang: probe mode deadline passed'); };   // a late result cannot resume work
      const closeContext = c => bounded(c.close(), d.stepMs, `harness timeout: cleanup of the ${mode} browser did not finish within ${d.stepMs} ms`);
      const op = async () => {
        // T0's bounded check, before any browser or GPU work; a failure or timeout is a browser hang (a stop), not an ordinary identity error.
        const browserVersion = await d.browserVersion().catch(e => { throw new Error(`browser hang: browser version check failed: ${e.message}`); }); live();
        launched = await boundedStart(() => d.launchChrome({ headless: mode === 'headless', profileKind: `probe-${mode}`, chromium: d.chromium }), d.stepMs * 3, 'browser hang: launch');
        if (state.expired) { await closeContext(launched.context).catch(() => {}); live(); }       // a browser that launched after the outer deadline is closed, not leaked
        live();
        const commandLine = await bounded(d.effectiveCommandLine(launched.context), d.stepMs, 'browser hang: chrome://version'); live(); assertSandboxed(commandLine);
        launchInfo = { requestedArgs: launched.requestedArgs, commandLine, profile: launched.profile, mode, display: d.env.DISPLAY ?? null, session: d.env.XDG_SESSION_TYPE ?? null };   // display context is evidence, not identity
        const page = await bounded(launched.context.newPage(), d.stepMs, 'browser hang: new page'); live();
        page.on('pageerror', e => invalidations.push(`page error: ${e.message}`));
        await bounded(page.goto(`${server.url}${HARNESS_PATH}?mode=probe&runMode=${mode}`), d.stepMs, 'browser hang: navigation'); live();
        const { result } = await d.waitResult(page, { gate: 'probe', runDir, deadlineMs: d.stepMs * 3 }); live();
        resultMetrics = result.metrics ?? {};
        probe = result.error ? { ok: false, error: result.error } : result.slots[0].raw;
        invalidations.push(...(result.invalidations ?? []), ...(result.error ? [`page: ${result.error}`] : []));
        // the capture starts only with its full allowance left in the mode window; every snapshot it reads is published into this mode's state at once
        const windowLeft = modeDeadline - Date.now();
        if (windowLeft < d.stepMs) throw new Error(`harness timeout: chrome://gpu capture skipped: ${windowLeft} ms of the ${d.modeMs} ms mode window left, it needs ${d.stepMs} ms`);
        publish(await d.chromeGpuText(launched.context, { timeoutMs: d.stepMs, onSnapshot: publish }).catch(e => { publish(e?.capturedText); throw e; })); live();
        try { identity = { ...launchIdentity(launchInfo), ...environmentIdentity(chromeGpuText, { browserVersion, browserExecutable: commandLine.split(/\s+/)[0], session: d.env.XDG_SESSION_TYPE || 'unknown' }) }; }
        catch (e) { invalidations.push(`environment identity: ${e.message}`); }
      };
      const modeDeadline = Date.now() + d.modeMs;
      try { await bounded(op(), d.modeMs, `browser hang: probe ${mode} exceeded its ${d.modeMs} ms outer deadline`); }
      catch (error) { state.expired = true; invalidations.push(`session: ${error.message}`); }
      finally { await (launched ? closeContext(launched.context) : Promise.resolve()).catch(e => { cleanupFailed = true; invalidations.push(e.message); }); }
      state.final = true;   // finalisation: no snapshot arriving from here on can change the record
      identity ??= { launchHash: '0'.repeat(64), mode, browserVersion: 'unknown', browserExecutable: 'unknown', driver: 'unknown', session: 'unknown' };
      const incomplete = state.expired || cleanupFailed || stopReasons({ invalidations, metrics: { software: resultMetrics.software ? 1 : 0 } }).length > 0 || (!probe.info && !probe.readback) || !chromeGpuText;   // expiry or an unfinished required step is never a completed slot
      const record = { schema: 1, id: `probe-${mode}`, gate: 'probe', slot: incomplete ? 'incomplete' : mode, campaign: 'probe', mode, experiment: true, identity: { backend: 'webgpu', ...fixture, ...implementation, ...identity }, invalidations, metrics: { probeOk: probe.ok === true && !incomplete ? 1 : 0, ...(resultMetrics.software ? { software: 1 } : {}) } };
      records.push(await d.writeRecord(runDir, record, [
        { name: `probe-${mode}.raw.json`, data: JSON.stringify(probe) },
        { name: `probe-${mode}.launch.json`, data: JSON.stringify(launchInfo) },
        { name: `probe-${mode}.chrome-gpu.txt`, data: chromeGpuText }]));
      d.log(`${mode}: ${probe.ok && !invalidations.length ? 'PROBE OK' : 'PROBE FAILED'} ${probe.error || invalidations.join('; ')} vendor=${probe.info?.vendor} fallback=${probe.info?.isFallbackAdapter} (${probe.info?.fallbackSource}) mismatches=${probe.readback?.mismatches}`);
      if (stopReasons(record).length) stopped = `${mode}: ${stopReasons(record).join(', ')}`;
    }
  } finally { await server?.stop(); }
  return { records, runDir, stopped };
}

// The probe succeeds only if both modes completed, recorded no invalidation and passed their own readback check.
export const probeSucceeded = records => records.length === 2 &&
  records.every(r => r.slot !== 'incomplete' && r.invalidations.length === 0 && r.metrics?.probeOk === 1);

if (import.meta.url === `file://${process.argv[1]}`) {
  process.env.TMPDIR = resolve(ROOT, 'artifacts/runtime');
  const { records, runDir } = await runProbeInvocation();
  console.log(`evidence: ${runDir}`);
  process.exitCode = probeSucceeded(records) ? 0 : 1;
}
