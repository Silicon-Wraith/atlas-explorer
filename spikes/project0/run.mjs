// spikes/project0/run.mjs — node spikes/project0/run.mjs --gate G4 [--mode headed|headless] [--args attempt1|remediation] [--campaign <name>]
// One evidence-finalisation path for every outcome: success, page error, unanswered page, outer deadline, watchdog stop, launch failure.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify, parseArgs } from 'node:util';
import { ROOT, HARNESS_PATH, ATTEMPT1_ARGS, startServer, launchChrome, effectiveCommandLine, assertSandboxed, chromeGpuText as captureChromeGpuText } from './launch.mjs';
import { fixtureIdentity, implementationIdentity, launchIdentity, environmentIdentity, newRunDir, writeRecord } from './evidence.mjs';
import { metricsFor } from './measure/index.mjs';
import { bounded, boundedStart, waitResult, stopReasons } from './session-utils.mjs';

process.env.TMPDIR = resolve(ROOT, 'artifacts/runtime');
const REMEDIATION = resolve(ROOT, 'spikes/project0/launch-remediation.json');
export const LAUNCH = { attempt1: ATTEMPT1_ARGS, ...(existsSync(REMEDIATION) ? { remediation: JSON.parse(readFileSync(REMEDIATION, 'utf8')) } : {}) };
export const DEADLINE = { G1: 120000, G3: 300000, G4: 120000, G5: 120000, 'derivative-policy': 120000, smoke: 300000, G11: 300000, G13: 300000, timing: 1200000, G8: 300000, G10: 300000, G12: 1200000, visible: 300000, precision: 3600000 };
const EXPERIMENTS = new Set(['derivative-policy', 'smoke', 'visible', 'precision']);   // not gates: no metric derivation
export { waitResult } from './session-utils.mjs';

// Chrome 151 renders chrome://gpu into open shadow roots, asynchronously, so body.innerText is empty: the shared bounded capture (launch.mjs), as
// probe.mjs uses it. Every snapshot is handed to `publish` as it is read, so a capture timeout or the session's outer deadline keeps the latest
// text as evidence; a timeout is a classified browser hang (a stop) and is rethrown.
export const GPU_TEXT_MS = 20000;
export async function environment(context, commandLine, invalidations, publish = () => {}, { gpuTextMs = GPU_TEXT_MS } = {}) {
  const chromeGpuText = await captureChromeGpuText(context, { timeoutMs: gpuTextMs, onSnapshot: publish }).catch(e => { publish(e?.capturedText); throw e; });
  publish(chromeGpuText);
  const browserVersion = (await promisify(execFile)('google-chrome', ['--version'])).stdout.trim();
  const base = { browserVersion, browserExecutable: commandLine.split(/\s+/)[0], session: process.env.XDG_SESSION_TYPE || 'unknown' };
  try { return { chromeGpuText, env: environmentIdentity(chromeGpuText, base) }; }
  catch (e) { invalidations.push(`environment identity: ${e.message}`); return { chromeGpuText, env: { ...base, driver: 'unknown' } }; }
}


export async function finalise({ gate, mode, campaign, runDir, identity, launchInfo, chromeGpuText, outcome, invalidations, fixtures, experiment, write = writeRecord }) {
  const records = [], stamp = runDir.split('/').at(-1), result = outcome?.result;
  const slots = result?.slots?.length ? result.slots : [{ slot: 'incomplete', raw: { error: result?.error ?? 'no result', lastCheckpoint: outcome?.lastCheckpoint ?? null } }];
  for (const s of slots) {
    const slotGate = s.gate ?? gate;
    const recordInvalidations = [...invalidations, ...(result?.invalidations ?? []), ...(s.invalidations ?? []), ...(result?.error ? [`page: ${result.error}`] : []), ...(s.slot === 'incomplete' ? ['incomplete: the session produced no result'] : [])];
    let raw = slotGate === 'G1' ? { ...s.raw, chromeGpuText } : s.raw;
    const extra = [];
    if (slotGate === 'visible' && outcome?.captures?.length) {
      const { decodePng, classify } = await import('./measure/png.mjs');          // T9; loaded only for the visible experiment
      raw = { ...raw, presented: {} };
      for (const c of outcome.captures) { extra.push({ name: `${stamp}-presented-${c.name}.png`, data: c.png }); raw.presented[c.name] = classify(decodePng(c.png)); }
    }
    let metrics = {};
    if (!experiment && s.slot !== 'incomplete') { try { metrics = await metricsFor(slotGate, s.slot, raw, fixtures); } catch (e) { recordInvalidations.push(`metrics: ${e.message}`); } }
    const id = `${slotGate}-${s.slot.replace(/[^A-Za-z0-9.-]/g, '_')}-${stamp}`;
    const record = { schema: 1, id, gate: slotGate, slot: s.slot, campaign, mode, experiment: Boolean(experiment), identity, invalidations: recordInvalidations, metrics };
    records.push(await write(runDir, record, [
      { name: `${id}.raw.json`, data: JSON.stringify(raw) },
      { name: `${id}.launch.json`, data: JSON.stringify(launchInfo) },
      { name: `${id}.chrome-gpu.txt`, data: chromeGpuText ?? '' },
      ...extra.map(e => ({ ...e, name: `${id}.${e.name}` }))]));
  }
  return records;
}

const fallbackIdentity = (fixture, implementation, mode) => ({ backend: 'webgpu', ...fixture, ...implementation, launchHash: '0'.repeat(64), mode, browserVersion: 'unknown', browserExecutable: 'unknown', driver: 'unknown', session: 'unknown' });

export async function runSession({ gate, mode = 'headless', args = 'attempt1', campaign = 'dev', extra = '' }) {
  if (!LAUNCH[args]) throw new Error(`unknown launch configuration: ${args}`);
  if (!/^[a-z0-9-]+$/.test(campaign)) throw new Error('campaign identity required');
  const experiment = EXPERIMENTS.has(gate);
  const fixtures = JSON.parse(await readFile(resolve(ROOT, 'spikes/project0/fixtures.json'), 'utf8'));
  const fixture = await fixtureIdentity(), implementation = await implementationIdentity();
  const runDir = await newRunDir(`${campaign}-${gate.toLowerCase()}-${mode}`);
  const invalidations = [], state = { expired: false, final: false }; let server, launched, outcome = null, chromeGpuText = '', identity = null, launchInfo = { args, requestedArgs: LAUNCH[args] };
  const publish = text => { if (text && !state.expired && !state.final) chromeGpuText = text; };   // session-owned chrome://gpu evidence; frozen once the session ends
  const deadlineMs = DEADLINE[gate] ?? 900000;
  try {
    await bounded((async () => {
      server = await startServer();
      launched = await boundedStart(() => launchChrome({ headless: mode === 'headless', args: LAUNCH[args], profileKind: `${gate.toLowerCase()}-${mode}`, chromium }), 60000, 'browser hang: launch exceeded 60000 ms');
      const commandLine = await effectiveCommandLine(launched.context); assertSandboxed(commandLine);
      launchInfo = { args, requestedArgs: launched.requestedArgs, commandLine, profile: launched.profile, mode };
      const environmentInfo = await environment(launched.context, commandLine, invalidations, publish);
      publish(environmentInfo.chromeGpuText);
      identity = { backend: 'webgpu', ...fixture, ...implementation, ...launchIdentity(launchInfo), ...environmentInfo.env };
      const page = await launched.context.newPage();
      page.on('pageerror', e => invalidations.push(`page error: ${e.message}`));
      page.on('console', m => { if (m.type() === 'error') invalidations.push(`console error: ${m.text()}`); });
      await page.goto(`${server.url}${HARNESS_PATH}?mode=gate&gate=${encodeURIComponent(gate)}&runMode=${mode}${extra}`);
      outcome = await waitResult(page, { gate, runDir, deadlineMs });
    })(), deadlineMs + 120000, `browser hang: session exceeded its ${deadlineMs + 120000} ms outer bound`);
  } catch (error) {
    state.expired = true; invalidations.push(`session: ${error.message}`);
  } finally {
    await bounded(launched?.context.close() ?? Promise.resolve(), 30000, 'close').catch(e => invalidations.push(`close: ${e.message}`));
    await server?.stop();
  }
  state.final = true;   // finalisation: no snapshot arriving from here on can change the record
  identity ??= fallbackIdentity(fixture, implementation, mode);
  const records = await finalise({ gate, mode, campaign, runDir, identity, launchInfo, chromeGpuText, outcome, invalidations, fixtures, experiment });
  return { records, runDir, outcome };
}

// G2: three fresh processes with fresh empty profiles; navigation first, chrome://gpu only after the measurement. Each run is inspected
// for a stop immediately; if fresh-2 stops there is no warm reload; the shared classifier decides. Dependencies are injectable for tests.
export async function runG2({ args = 'attempt1', campaign = 'dev' } = {}, deps = {}) {
  const d = { startServer, launchChrome, effectiveCommandLine, waitResult, environment, fixtureIdentity, implementationIdentity, newRunDir, chromium,
    fixtures: async () => JSON.parse(await readFile(resolve(ROOT, 'spikes/project0/fixtures.json'), 'utf8')), launchMs: 60000, ...deps };
  if (!LAUNCH[args]) throw new Error(`unknown launch configuration: ${args}`);
  const fixtures = await d.fixtures();
  const fixture = await d.fixtureIdentity(), implementation = await d.implementationIdentity();
  const runDir = await d.newRunDir(`${campaign}-g2-headed`), records = [];
  for (let i = 0; i < 3; i++) {
    const invalidations = [], slots = [], state = { expired: false, final: false }; let server, launched, chromeGpuText = '', identity = null, launchInfo = { args, requestedArgs: LAUNCH[args] };
    const publish = text => { if (text && !state.expired && !state.final) chromeGpuText = text; };   // run-owned chrome://gpu evidence; frozen once the run ends
    try {
      await bounded((async () => {
        server = await d.startServer();
        launched = await boundedStart(() => d.launchChrome({ headless: false, args: LAUNCH[args], profileKind: `g2-fresh-${i}`, chromium: d.chromium }), d.launchMs, `browser hang: launch exceeded ${d.launchMs} ms`);
        const page = await launched.context.newPage();
        page.on('pageerror', e => invalidations.push(`page error: ${e.message}`));
        page.on('console', m => { if (m.type() === 'error') invalidations.push(`console error: ${m.text()}`); });
        await page.goto(`${server.url}${HARNESS_PATH}?mode=gate&gate=G2&runMode=headed`);
        const first = (await d.waitResult(page, { gate: 'G2', runDir, deadlineMs: 60000 })).result;
        const firstInvalidations = [...(first.invalidations ?? []), ...(first.error ? [`page: ${first.error}`] : [])];
        slots.push({ slot: `fresh-${i}`, raw: { ...(first.slots?.[0]?.raw ?? { error: first.error }), emptyProfile: 1, freshProcess: 1 }, invalidations: firstInvalidations });
        const stopNow = stopReasons({ invalidations: [...invalidations, ...firstInvalidations] }).length > 0;
        if (i === 2 && !stopNow) {                                                            // never reload after a stop
          await page.reload();
          const warm = (await d.waitResult(page, { gate: 'G2', runDir, deadlineMs: 60000 })).result;
          slots.push({ slot: 'warm', raw: warm.slots?.[0]?.raw ?? { error: warm.error }, invalidations: [...(warm.invalidations ?? []), ...(warm.error ? [`page: ${warm.error}`] : [])] });
        }
        const commandLine = await d.effectiveCommandLine(launched.context); assertSandboxed(commandLine);
        launchInfo = { args, requestedArgs: launched.requestedArgs, commandLine, profile: launched.profile, mode: 'headed' };
        const environmentInfo = await d.environment(launched.context, commandLine, invalidations, publish);
        publish(environmentInfo.chromeGpuText);
        identity = { backend: 'webgpu', ...fixture, ...implementation, ...launchIdentity(launchInfo), ...environmentInfo.env };
      })(), 180000, 'browser hang: G2 launch exceeded 180000 ms');
    } catch (error) { state.expired = true; invalidations.push(`session: ${error.message}`); }
    finally {
      await bounded(launched?.context.close() ?? Promise.resolve(), 30000, 'close').catch(e => invalidations.push(`close: ${e.message}`));
      await server?.stop();
    }
    state.final = true;   // finalisation: no snapshot arriving from here on can change the record
    identity ??= fallbackIdentity(fixture, implementation, 'headed');
    const produced = await finalise({ gate: 'G2', mode: 'headed', campaign, runDir, identity, launchInfo, chromeGpuText, outcome: { result: { slots, invalidations: [] } }, invalidations, fixtures, experiment: false, write: d.writeRecord ?? writeRecord });
    records.push(...produced);
    if (produced.some(rec => stopReasons(rec).length)) break;                                  // evidence is finalised first, then the invocation ends
  }
  return { records, runDir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { gate: { type: 'string' }, mode: { type: 'string', default: 'headless' }, args: { type: 'string', default: 'attempt1' }, campaign: { type: 'string', default: 'dev' } } });
  const { records, runDir } = values.gate === 'G2' ? await runG2(values) : await runSession(values);
  for (const r of records) console.log(`${r.gate} ${r.slot}: ${JSON.stringify(r.metrics)}${r.invalidations.length ? ` INVALIDATIONS ${r.invalidations.join('; ')}` : ''}`);
  if (values.gate === 'derivative-policy') {
    const fixtures = JSON.parse(await readFile(resolve(ROOT, 'spikes/project0/fixtures.json'), 'utf8'));
    const raw = JSON.parse(await readFile(resolve(ROOT, 'artifacts/project0', records[0].artifacts[0].path), 'utf8'));
    const bad = (raw.fits ?? []).length !== fixtures.derivativePolicy.length ? ['length mismatch'] : fixtures.derivativePolicy.filter((v, i) => Boolean(raw.fits[i]) !== v.fits);
    console.log(`derivative policy: ${bad.length} mismatches of ${fixtures.derivativePolicy.length}`);
    process.exitCode = bad.length || records[0].invalidations.length ? 1 : 0;
  }
  console.log(`evidence: ${runDir}`);
}
