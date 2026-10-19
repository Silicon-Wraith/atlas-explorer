// spikes/project0/integrity-preflight.mjs — node spikes/project0/integrity-preflight.mjs [--mode headed|headless]
// T9 fix round 2 (Codex T9 r2): a bounded browser preflight, required before the GPU campaign. Real Chrome (attempt-1 flags, sandboxed, a fresh
// profile, the owned server) runs browser/integrity-preflight.js, which requests no GPU adapter or device, twice: once after navigation and once
// after a reload, each result pushed through the binding installed before navigation. The assertions are persisted as evidence; any failed or
// missing assertion, or any error, fails closed (exit 1).
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, HARNESS_PATH, ATTEMPT1_ARGS, startServer, launchChrome, effectiveCommandLine, assertSandboxed } from './launch.mjs';
import { newRunDir, implementationIdentity } from './evidence.mjs';
import { bounded, installTransport, waitResult } from './session-utils.mjs';

const backing = (r, size) => (r?.violations ?? []).some(v => v.startsWith(`unexpected backing ${size} `));
export function evaluatePreflight({ first, reload, evaluates }) {
  const loads = [first, reload].filter(Boolean);
  const every = test => Boolean(first) && loads.every(test);
  const assertions = [
    ['same-task resize and restore is a violation', every(r => backing(r.sameTaskRevert, '800x720'))],
    ['stop() drains undelivered mutations', every(r => backing(r.undeliveredAtStop, '640x720'))],
    ['deliberate allowed resizes are clean', every(r => !(r.allowedResizes?.violations ?? ['missing']).some(v => v.startsWith('unexpected backing')) && (r.allowedResizes?.events ?? []).filter(e => e.deliberate).length === 3)],
    ['the binding delivers before navigation', first?.transport === 'p0Push'],
    ['the binding delivers after a reload', reload?.transport === 'p0Push'],
    ['no Node evaluation while waiting', evaluates === 0],
  ].map(([name, ok]) => ({ name, ok }));
  return { pass: assertions.every(a => a.ok), assertions };
}

// Fix round 3 (Codex T9 r3, finding 5): the outer deadline latches `expired`; every step re-checks it after each await (`live`), and a server,
// browser or page that arrives after expiry is disposed at once and never used (the run.mjs/probe.mjs pattern). A failed first load ends the run
// before any reload. Dependencies are injectable so the stop paths are tested without a browser.
export async function runIntegrityPreflight({ mode = 'headed', totalMs = 120000, deps = {} } = {}) {
  const d = { startServer, launchChrome, effectiveCommandLine, newRunDir, implementationIdentity, installTransport, waitResult, writeFile, chromium, ...deps };
  process.env.TMPDIR = resolve(ROOT, 'artifacts/runtime');
  const runDir = await d.newRunDir(`dev-integrity-preflight-${mode}`), evidence = { mode, errors: [] }, state = { expired: false };
  let server = null, launched = null, evaluates = 0, first = null, reload = null;
  const live = () => { if (state.expired) throw new Error('browser hang: integrity preflight deadline passed'); };
  // a resource that arrives after expiry is disposed at once; `finally` has already run
  const arrived = async (resource, dispose) => { if (state.expired) { await Promise.resolve().then(() => dispose(resource)).catch(() => {}); live(); } return resource; };
  try { evidence.implementation = await d.implementationIdentity(); } catch (e) { evidence.errors.push(`implementation identity: ${e.message}`); }
  try {
    await bounded((async () => {
      server = await arrived(await d.startServer(), r => r.stop()); live();
      launched = await arrived(await d.launchChrome({ headless: mode === 'headless', args: ATTEMPT1_ARGS, profileKind: `integrity-preflight-${mode}`, chromium: d.chromium }), r => r.context.close()); live();
      const commandLine = await d.effectiveCommandLine(launched.context); live(); assertSandboxed(commandLine);
      evidence.launch = { commandLine, profile: launched.profile, requestedArgs: launched.requestedArgs };
      const page = await arrived(await launched.context.newPage(), p => p.close()); live();
      const evaluate = page.evaluate.bind(page); page.evaluate = (...a) => { evaluates++; return evaluate(...a); };   // counts any evaluation by this runner
      page.on('pageerror', e => { if (!state.expired) evidence.errors.push(`page error: ${e.message}`); });
      await d.installTransport(page, { gate: 'integrity-preflight' }); live();
      await page.goto(`${server.url}${HARNESS_PATH}?mode=integrity-preflight`); live(); await page.bringToFront?.(); live();
      first = (await d.waitResult(page, { gate: 'integrity-preflight', runDir, deadlineMs: 30000 })).result; live();
      if (first?.error) throw new Error(`first load: ${first.error}`);                // a failed first load is never reloaded
      await page.reload(); live();
      reload = (await d.waitResult(page, { gate: 'integrity-preflight', runDir, deadlineMs: 30000 })).result; live();
      if (reload?.error) throw new Error(`reload: ${reload.error}`);
    })(), totalMs, `browser hang: the integrity preflight exceeded ${totalMs} ms`);
  } catch (e) { state.expired = true; evidence.errors.push(e.message); }
  finally {
    state.expired = true;                                                           // from here on, anything arriving is disposed, never used
    if (launched) await bounded(launched.context.close(), 30000, 'cleanup').catch(e => evidence.errors.push(`cleanup: ${e.message}`));
    await server?.stop().catch(e => evidence.errors.push(`server: ${e.message}`));
  }
  const verdict = evaluatePreflight({ first: first?.error ? null : first?.slots?.[0]?.raw ?? null, reload: reload?.error ? null : reload?.slots?.[0]?.raw ?? null, evaluates });
  const pass = verdict.pass && evidence.errors.length === 0;
  const record = { schema: 1, kind: 'integrity-preflight', pass, assertions: verdict.assertions, evaluates, ...evidence, first, reload };
  await d.writeFile(resolve(runDir, 'integrity-preflight.json'), JSON.stringify(record, null, 2));
  return { pass, record, runDir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { mode: { type: 'string', default: 'headed' } } });
  const { pass, record, runDir } = await runIntegrityPreflight({ mode: values.mode });
  for (const a of record.assertions) console.log(`${a.ok ? 'PASS' : 'FAIL'} ${a.name}`);
  for (const e of record.errors) console.log(`ERROR ${e}`);
  console.log(`${pass ? 'INTEGRITY PREFLIGHT OK' : 'INTEGRITY PREFLIGHT FAILED'}\nevidence: ${runDir}`);
  process.exitCode = pass ? 0 : 1;
}
