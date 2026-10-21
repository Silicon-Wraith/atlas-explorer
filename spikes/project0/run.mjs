// spikes/project0/run.mjs — node spikes/project0/run.mjs --gate G4 [--mode headed|headless] [--args attempt1|remediation] [--campaign <name>]
// One evidence-finalisation path for every outcome: success, page error, unanswered page, outer deadline, watchdog stop, launch failure.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, HARNESS_PATH, ATTEMPT1_ARGS, startServer, launchChrome, effectiveCommandLine, assertSandboxed, chromeVersion, chromeGpuText as captureChromeGpuText, browserProcess, launchDisclosures } from './launch.mjs';
import { fixtureIdentity, implementationIdentity, launchIdentity, environmentIdentity, newRunDir, writeRecord, validateRecordTiming, notMeasured } from './evidence.mjs';
import { metricsFor } from './measure/index.mjs';
import { validateSources } from './measure/timing.mjs';
import { bounded, boundedStart, waitResult, installTransport, armWindow, ROUND_TRIP_MS, stopReasons } from './session-utils.mjs';

process.env.TMPDIR = resolve(ROOT, 'artifacts/runtime');
const REMEDIATION = resolve(ROOT, 'spikes/project0/launch-remediation.json');
export const LAUNCH = { attempt1: ATTEMPT1_ARGS, ...(existsSync(REMEDIATION) ? { remediation: JSON.parse(readFileSync(REMEDIATION, 'utf8')) } : {}) };
export const DEADLINE = { G1: 120000, G3: 300000, G4: 120000, G5: 120000, 'derivative-policy': 120000, smoke: 300000, G11: 300000, G13: 300000, timing: 1200000, G8: 300000, G10: 300000, G12: 1200000, visible: 300000, precision: 3600000 };
const EXPERIMENTS = new Set(['derivative-policy', 'smoke', 'visible', 'precision']);   // not gates: no metric derivation
export { waitResult } from './session-utils.mjs';

// Chrome 151 renders chrome://gpu into open shadow roots, asynchronously, so body.innerText is empty: the shared bounded capture (launch.mjs), as
// probe.mjs uses it. Every snapshot is handed to `publish` as it is read, so a capture timeout or the session's outer deadline keeps the latest
// text as evidence; a timeout is a classified browser hang (a stop) and is rethrown. The browser version comes from T0's bounded chromeVersion()
// (a hung subprocess is killed); its failure or timeout is a browser hang too, as in probe.mjs.
export const GPU_TEXT_MS = 20000, VERSION_MS = 10000;
export async function environment(context, commandLine, invalidations, publish = () => {}, { gpuTextMs = GPU_TEXT_MS, versionMs = VERSION_MS, browserVersion: version = () => chromeVersion({ timeoutMs: versionMs }) } = {}) {
  const chromeGpuText = await captureChromeGpuText(context, { timeoutMs: gpuTextMs, onSnapshot: publish }).catch(e => { publish(e?.capturedText); throw e; });
  publish(chromeGpuText);
  const browserVersion = await version().catch(e => { throw new Error(`browser hang: browser version check failed: ${e.message}`); });
  const base = { browserVersion, browserExecutable: commandLine.split(/\s+/)[0], session: process.env.XDG_SESSION_TYPE || 'unknown' };
  try { return { chromeGpuText, env: environmentIdentity(chromeGpuText, base) }; }
  catch (e) { invalidations.push(`environment identity: ${e.message}`); return { chromeGpuText, env: { ...base, driver: 'unknown' } }; }
}


// G1 raws gain the session's own evidence (G1-A §3.2): the chrome://gpu text captured before the page, the capture after the probe and the
// run/browser-process/target binding. These come from Node only; a page-supplied value under the same names is overwritten.
export async function finalise({ gate, mode, campaign, runDir, identity, launchInfo, chromeGpuText, outcome, invalidations, fixtures, experiment, write = writeRecord, g1Evidence = null }) {
  const records = [], raws = new Map(), stamp = runDir.split('/').at(-1), result = outcome?.result;
  const slots = result?.slots?.length ? result.slots : [{ slot: 'incomplete', raw: { error: result?.error ?? 'no result', lastCheckpoint: outcome?.lastCheckpoint ?? null } }];
  for (const s of slots) {
    const slotGate = s.gate ?? gate;
    const recordInvalidations = [...invalidations, ...(result?.invalidations ?? []), ...(s.invalidations ?? []), ...(result?.error ? [`page: ${result.error}`] : []), ...(s.slot === 'incomplete' ? ['incomplete: the session produced no result'] : [])];
    let raw = slotGate === 'G1' ? { ...s.raw, chromeGpuText, chromeGpuTextAfter: g1Evidence?.chromeGpuTextAfter, session: g1Evidence?.session } : s.raw;
    if (Array.isArray(result?.acquisitions) && raw && typeof raw === 'object') raw = { ...raw, acquisitions: result.acquisitions };   // §3.5: every acquisition's features
    // G1-A §3.5: timestamp-derived values under the developer flag are labelled, and never compared with attempt-1 timestamp values
    if (launchInfo?.disclosures?.developerFeatures && raw && typeof raw === 'object' && ('timestamps' in raw || 'timestampQuery' in raw)) raw = { ...raw, timestampLabel: launchInfo.disclosures.timestampQuantization };
    const extra = [];
    if (slotGate === 'visible' && outcome?.captures?.length) {
      const { decodePng, classify } = await import('./measure/png.mjs');          // T9; loaded only for the visible experiment
      raw = { ...raw, presented: {} };
      for (const c of outcome.captures) { extra.push({ name: `${stamp}-presented-${c.name}.png`, data: c.png }); raw.presented[c.name] = classify(decodePng(c.png)); }
    }
    let metrics = {};
    if (!experiment && s.slot !== 'incomplete') { try { metrics = await metricsFor(slotGate, s.slot, raw, fixtures, { identity }); } catch (e) { recordInvalidations.push(`metrics: ${e.message}`); } }
    // A slot that names source windows (G9, T9 fix round 2) is bound to its companion records of the same invocation: a missing or invalid
    // companion invalidates it, whatever its own raw says. The companions precede it in the slot order, so they are already finalised.
    // Fix round 3: the binding compares each source interval with the companion's own raw observation (validateSources, also for read time).
    if (Array.isArray(raw?.sources)) recordInvalidations.push(...validateSources(raw, (g, sl) => { const r = records.find(x => x.gate === g && x.slot === sl); return r ? { invalidations: r.invalidations, raw: raws.get(r.id) } : null; }));
    // The producer (the page driver) supplies each slot's timing method; a missing or invalid one invalidates the record and is never guessed.
    let timingMethod = s.slot === 'incomplete' ? notMeasured('incomplete: the session produced no result') : s.timingMethod;
    // Shape and meaning: the descriptor this gate expects, and the raw measurement it names (validateRecordTiming, timing-contract.js).
    try { validateRecordTiming({ gate: slotGate, slot: s.slot, timingMethod, invalidations: recordInvalidations }, raw); } catch (e) { recordInvalidations.push(e.message); timingMethod = notMeasured(e.message); }
    const id = `${slotGate}-${s.slot.replace(/[^A-Za-z0-9.-]/g, '_')}-${stamp}`;
    const record = { schema: 1, id, gate: slotGate, slot: s.slot, campaign, mode, experiment: Boolean(experiment), identity, invalidations: recordInvalidations, metrics, timingMethod };
    raws.set(id, raw);
    records.push(await write(runDir, record, [
      { name: `${id}.raw.json`, data: JSON.stringify(raw) },
      { name: `${id}.launch.json`, data: JSON.stringify(launchInfo) },
      { name: `${id}.chrome-gpu.txt`, data: chromeGpuText ?? '' },
      ...extra.map(e => ({ ...e, name: `${id}.${e.name}` }))]));
  }
  return records;
}

// Cleanup that does not finish, or fails, may leave a browser running: a classified stop, so no further browser is launched after it.
async function cleanup(launched, ms, what, invalidations) {
  if (!launched) return;
  try { await bounded(launched.context.close(), ms, `harness timeout: cleanup of the ${what} browser did not finish within ${ms} ms`); }
  catch (e) { invalidations.push(/^harness timeout:/.test(e.message) ? e.message : `harness timeout: cleanup of the ${what} browser failed: ${e.message}`); }
}

// A server that does not stop leaves the port (and its child) behind: a classified stop, recorded before the evidence is finalised.
async function stopServer(server, invalidations) {
  try { await server?.stop(); } catch (e) { invalidations.push(`harness timeout: the harness server did not stop: ${e.message}`); }
}
// A resource (server or browser) that arrives after the session expired is disposed at once and never used: `finally` has already run.
async function arrived(resource, state, dispose, live) {
  if (state.expired) { await Promise.resolve().then(() => dispose(resource)).catch(() => {}); live(); }
  return resource;
}

// Page diagnostics: a console error keeps its original text and gains its source location; an HTTP error response (which `requestfailed`
// never reports) is recorded with its status and URL. Nothing is filtered.
function watchPage(page, note) {
  page.on('pageerror', e => note(`page error: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') { const l = m.location?.() ?? {}; note(`console error: ${m.text()}${l.url ? ` (at ${l.url}:${l.lineNumber}:${l.columnNumber})` : ''}`); } });
  page.on('response', r => { if (r.status() >= 400) note(`http error: ${r.status()} ${r.url()}`); });
}

const fallbackIdentity = (fixture, implementation, mode) => ({ backend: 'webgpu', ...fixture, ...implementation, launchHash: '0'.repeat(64), mode, browserVersion: 'unknown', browserExecutable: 'unknown', driver: 'unknown', session: 'unknown' });

// Dependencies are injectable for tests, as in runG2.
export async function runSession({ gate, mode = 'headless', args = 'attempt1', campaign = 'dev', extra = '' }, deps = {}) {
  const d = { startServer, launchChrome, effectiveCommandLine, waitResult, environment, fixtureIdentity, implementationIdentity, newRunDir, writeRecord, chromium, browserProcess,
    postGpuText: (context, publishAfter) => captureChromeGpuText(context, { timeoutMs: GPU_TEXT_MS, onSnapshot: publishAfter }),
    pageTarget: async (context, page) => { const cdp = await context.newCDPSession(page); try { return (await cdp.send('Target.getTargetInfo')).targetInfo.targetId; } finally { await cdp.detach().catch(() => {}); } },
    fixtures: async () => JSON.parse(await readFile(resolve(ROOT, 'spikes/project0/fixtures.json'), 'utf8')), launchMs: 60000, closeMs: 30000, deadlineMs: DEADLINE[gate] ?? 900000, ...deps };
  if (!LAUNCH[args]) throw new Error(`unknown launch configuration: ${args}`);
  if (!/^[a-z0-9-]+$/.test(campaign)) throw new Error('campaign identity required');
  const experiment = EXPERIMENTS.has(gate);
  const fixtures = await d.fixtures();
  const fixture = await d.fixtureIdentity(), implementation = await d.implementationIdentity();
  const runDir = await d.newRunDir(`${campaign}-${gate.toLowerCase()}-${mode}`);
  const invalidations = [], state = { expired: false, final: false }; let server, launched, outcome = null, chromeGpuText = '', identity = null, launchInfo = { args, requestedArgs: LAUNCH[args], disclosures: launchDisclosures(LAUNCH[args]) };
  const publish = text => { if (text && !state.expired && !state.final) chromeGpuText = text; };   // session-owned chrome://gpu evidence; frozen once the session ends
  const isG1 = gate === 'G1', stamp = runDir.split('/').at(-1);
  const g1Evidence = isG1 ? { chromeGpuTextAfter: undefined, session: { run: stamp, browser: { before: null, after: null }, target: { before: null, after: null }, mainFrameNavigations: 0, crashed: false, closed: false } } : null;
  const publishAfter = text => { if (text && !state.expired && !state.final) g1Evidence.chromeGpuTextAfter = text; };
  const note = x => { if (!state.final) invalidations.push(x); };
  const live = () => { if (state.expired) throw new Error('browser hang: session deadline passed'); };   // a late result cannot resume work
  const deadlineMs = d.deadlineMs, outerMs = d.outerMs ?? deadlineMs + 120000;
  try {
    await bounded((async () => {
      server = await arrived(await d.startServer(), state, s => s.stop(), live); live();
      launched = await arrived(await boundedStart(() => d.launchChrome({ headless: mode === 'headless', args: LAUNCH[args], profileKind: `${gate.toLowerCase()}-${mode}`, chromium: d.chromium }), d.launchMs, `browser hang: launch exceeded ${d.launchMs} ms`), state, r => bounded(r.context.close(), d.closeMs, 'late close'), live); live();
      const commandLine = await d.effectiveCommandLine(launched.context); live(); assertSandboxed(commandLine);
      launchInfo = { args, requestedArgs: launched.requestedArgs, commandLine, profile: launched.profile, mode, disclosures: launchDisclosures(launched.requestedArgs) };
      const environmentInfo = await d.environment(launched.context, commandLine, invalidations, publish); live();
      publish(environmentInfo.chromeGpuText);
      identity = { backend: 'webgpu', ...fixture, ...implementation, ...launchIdentity(launchInfo), ...environmentInfo.env };
      const page = await launched.context.newPage();
      if (state.expired) page.close().catch(() => {});                                          // a late page is closed, never navigated
      live();
      watchPage(page, note);
      if (isG1) {                                                                                  // G1-A §3.2 step 1: the binding, before navigation
        const g = g1Evidence.session;
        page.on('framenavigated', frame => { if (!state.final && frame === page.mainFrame()) g.mainFrameNavigations++; });
        page.on('crash', () => { if (!state.final) g.crashed = true; });
        page.on('close', () => { if (!state.final && !state.closing) g.closed = true; });
        g.browser.before = await bounded(d.browserProcess(launched.profile), ROUND_TRIP_MS, 'browser hang: browser process identity'); live();
        g.target.before = await bounded(d.pageTarget(launched.context, page), ROUND_TRIP_MS, 'browser hang: page target identity'); live();
      }
      await bounded(installTransport(page, { gate }), ROUND_TRIP_MS, `browser hang: the result transport was not installed within ${ROUND_TRIP_MS} ms`); live();   // before navigation: the page pushes, Node supervises its gate's fixed window plan
      await page.goto(`${server.url}${HARNESS_PATH}?mode=gate&gate=${encodeURIComponent(gate)}&runMode=${mode}${extra}${isG1 ? `&run=${encodeURIComponent(stamp)}` : ''}`); live();
      const result = await d.waitResult(page, { gate, runDir, deadlineMs }); live();
      if (isG1) {                                                                                  // §3.2 step 7: same browser, after the probe, before teardown
        const g = g1Evidence.session;
        g.target.after = await bounded(d.pageTarget(launched.context, page), ROUND_TRIP_MS, 'browser hang: page target identity').catch(e => { note(`G1 binding: ${e.message}`); return null; }); live();
        publishAfter(await d.postGpuText(launched.context, publishAfter).catch(e => { publishAfter(e?.capturedText); note(`G1 post-probe chrome://gpu: ${e.message}`); return ''; })); live();
        g.browser.after = await bounded(d.browserProcess(launched.profile), ROUND_TRIP_MS, 'browser hang: browser process identity'); live();
      }
      // the supervision record (T9 fix round 3): every window's open/close times and checkpoints, and whether the plan completed
      if (result?.supervision) await writeFile(resolve(runDir, 'supervision.json'), JSON.stringify(result.supervision));
      outcome = result;
    })(), outerMs, `browser hang: session exceeded its ${outerMs} ms outer bound`);
  } catch (error) {
    state.expired = true; invalidations.push(`session: ${error.message}`);
  } finally {
    state.closing = true;                                                                          // the harness's own teardown is not a page close
    await cleanup(launched, d.closeMs, gate, invalidations);
    await stopServer(server, invalidations);
  }
  state.final = true;   // finalisation: no snapshot arriving from here on can change the record
  identity ??= fallbackIdentity(fixture, implementation, mode);
  const records = await finalise({ gate, mode, campaign, runDir, identity, launchInfo, chromeGpuText, outcome, invalidations, fixtures, experiment, write: d.writeRecord, g1Evidence });
  return { records, runDir, outcome };
}

// WebGPU remediation (prereg rev 2 §3.5): a G2 slot keeps its own document's acquisition log (each browser and the warm reload is a new document).
const acquisitionsOf = result => (Array.isArray(result?.acquisitions) ? { acquisitions: result.acquisitions } : {});

// G2: three fresh processes with fresh empty profiles; navigation first, chrome://gpu only after the measurement. Each run is inspected
// for a stop immediately; if fresh-2 stops there is no warm reload; the shared classifier decides. Dependencies are injectable for tests.
export async function runG2({ args = 'attempt1', campaign = 'dev' } = {}, deps = {}) {
  const d = { startServer, launchChrome, effectiveCommandLine, waitResult, environment, fixtureIdentity, implementationIdentity, newRunDir, chromium,
    fixtures: async () => JSON.parse(await readFile(resolve(ROOT, 'spikes/project0/fixtures.json'), 'utf8')), launchMs: 60000, runMs: 180000, closeMs: 30000, gpuTextMs: GPU_TEXT_MS, versionMs: VERSION_MS, ...deps };
  if (!LAUNCH[args]) throw new Error(`unknown launch configuration: ${args}`);
  const fixtures = await d.fixtures();
  const fixture = await d.fixtureIdentity(), implementation = await d.implementationIdentity();
  const runDir = await d.newRunDir(`${campaign}-g2-headed`), records = [];
  for (let i = 0; i < 3; i++) {
    const invalidations = [], slots = [], state = { expired: false, final: false }; let server, launched, chromeGpuText = '', identity = null, launchInfo = { args, requestedArgs: LAUNCH[args], disclosures: launchDisclosures(LAUNCH[args]) };
    const publish = text => { if (text && !state.expired && !state.final) chromeGpuText = text; };   // run-owned chrome://gpu evidence; frozen once the run ends
    const note = x => { if (!state.final) invalidations.push(x); };
    const live = () => { if (state.expired) throw new Error('browser hang: G2 run deadline passed'); };   // a late result cannot resume work
    const runDeadline = Date.now() + d.runMs;
    try {
      await bounded((async () => {
        server = await arrived(await d.startServer(), state, s => s.stop(), live); live();
        launched = await arrived(await boundedStart(() => d.launchChrome({ headless: false, args: LAUNCH[args], profileKind: `g2-fresh-${i}`, chromium: d.chromium }), d.launchMs, `browser hang: launch exceeded ${d.launchMs} ms`), state, r => bounded(r.context.close(), d.closeMs, 'late close'), live); live();
        const page = await launched.context.newPage();
        if (state.expired) page.close().catch(() => {});                                        // a late page is closed, never navigated
        live();
        watchPage(page, note);
        await bounded(installTransport(page, { gate: 'G2' }), ROUND_TRIP_MS, `browser hang: the result transport was not installed within ${ROUND_TRIP_MS} ms`); live();   // before navigation; it survives the warm reload
        armWindow(page, 'G2/navigation');                                                   // Node's navigation deadline is armed before goto; nothing is exchanged inside it
        await page.goto(`${server.url}${HARNESS_PATH}?mode=gate&gate=G2&runMode=headed`); live();
        const firstWait = await d.waitResult(page, { gate: 'G2', runDir, deadlineMs: 60000 }), first = firstWait.result; live();
        if (firstWait?.supervision) await writeFile(resolve(runDir, `supervision-fresh-${i}.json`), JSON.stringify(firstWait.supervision));
        const firstInvalidations = [...(first.invalidations ?? []), ...(first.error ? [`page: ${first.error}`] : [])];
        slots.push({ slot: `fresh-${i}`, raw: { ...(first.slots?.[0]?.raw ?? { error: first.error }), ...acquisitionsOf(first), emptyProfile: 1, freshProcess: 1 }, invalidations: firstInvalidations, timingMethod: first.slots?.[0]?.timingMethod });
        const stopNow = stopReasons({ invalidations: [...invalidations, ...firstInvalidations] }).length > 0;
        if (i === 2 && !stopNow) {                                                            // never reload after a stop
          live(); armWindow(page, 'G2/navigation'); await page.reload(); live();
          const warmWait = await d.waitResult(page, { gate: 'G2', runDir, deadlineMs: 60000 }), warm = warmWait.result; live();
          if (warmWait?.supervision) await writeFile(resolve(runDir, 'supervision-warm.json'), JSON.stringify(warmWait.supervision));
          slots.push({ slot: 'warm', raw: { ...(warm.slots?.[0]?.raw ?? { error: warm.error }), ...acquisitionsOf(warm) }, invalidations: [...(warm.invalidations ?? []), ...(warm.error ? [`page: ${warm.error}`] : [])], timingMethod: warm.slots?.[0]?.timingMethod });
        }
        const commandLine = await d.effectiveCommandLine(launched.context); live(); assertSandboxed(commandLine);
        launchInfo = { args, requestedArgs: launched.requestedArgs, commandLine, profile: launched.profile, mode: 'headed', disclosures: launchDisclosures(launched.requestedArgs) };
        // as in probe.mjs: the capture (and its version check) starts only with its full allowance left in the run window
        const windowLeft = runDeadline - Date.now(), allowance = d.gpuTextMs + d.versionMs;
        if (windowLeft < allowance) throw new Error(`harness timeout: chrome://gpu capture skipped: ${windowLeft} ms of the ${d.runMs} ms run window left, it needs ${allowance} ms`);
        const environmentInfo = await d.environment(launched.context, commandLine, invalidations, publish, { gpuTextMs: d.gpuTextMs, versionMs: d.versionMs }); live();
        publish(environmentInfo.chromeGpuText);
        identity = { backend: 'webgpu', ...fixture, ...implementation, ...launchIdentity(launchInfo), ...environmentInfo.env };
      })(), d.runMs, `browser hang: G2 launch exceeded ${d.runMs} ms`);
    } catch (error) { state.expired = true; invalidations.push(`session: ${error.message}`); }
    finally {
      await cleanup(launched, d.closeMs, `G2 fresh-${i}`, invalidations);
      await stopServer(server, invalidations);
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
