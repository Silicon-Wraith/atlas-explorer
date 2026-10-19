// spikes/project0/campaign.mjs — node spikes/project0/campaign.mjs --name webgpu-1 [--args attempt1|remediation] [--gates G1,G4,...] [--reuse <json>]
// T10 amendments (tests/t10.test.mjs):
// - the campaign is `runCampaign(values, deps)`, run by the CLI block at the end with the real dependencies; every dependency is required, so
//   importing this module (a test) never runs a browser, and a test can only run it with fakes;
// - the name must be a qualifying campaign name before anything runs (dev, probe and precision never qualify);
// - the integrity preflight (integrity-preflight.mjs, headed, no GPU adapter or device) runs first, and must pass its seven assertions at this
//   exact implementation (qualify.mjs preflightProblems), or no gate runs; the manifest names it (verifyPreflight checks it on read);
// - the correctness verdicts that gate the performance phase, and the final verdicts, are the checked ones (evaluateGateChecked with the raw
//   payloads, through qualify.mjs gateVerdict/qualify), after recompute has verified the evidence;
// - reused records are verified and recomputed together per source manifest, so a reused G9 is bound to its reused companions.
import { parseArgs } from 'node:util';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { ROOT } from './launch.mjs';
import { buildManifest, checkCoherence, ABORTS, recompute, qualify, loadCampaign, requiredSlots, gatesOf, gateVerdict, preflightProblems, NON_QUALIFYING } from './qualify.mjs';
import { gatePlan } from './gates.js';

export const PHASES = [
  ['correctness', [['G1', 'headed'], ['G1', 'headless'], ['G4', 'headless'], ['G5', 'headless'], ['G3', 'headless'], ['G11', 'headed'], ['G13', 'headed']]],
  ['performance', [['G2', 'headed'], ['timing', 'headed'], ['G8', 'headed'], ['G10', 'headed']]],
  ['stability', [['G12', 'headed']]],
];
const DEPS = ['LAUNCH', 'runSession', 'runG2', 'runPreflight', 'implementationIdentity', 'fixtureIdentity', 'readFixtures', 'loadCampaign', 'recompute', 'writeReport', 'log'];

export async function runCampaign(values, d) {
  for (const k of DEPS) if (!d?.[k]) throw new Error(`campaign: the ${k} dependency is required (the command line supplies the real ones)`);
  if (!/^[a-z0-9-]+$/.test(values.name ?? '') || NON_QUALIFYING.has(values.name)) throw new Error(`a qualifying campaign name is required (lower-case, not dev, probe or precision): ${values.name}`);
  const args = values.args ?? 'attempt1';
  const only = values.gates?.split(','), reuse = JSON.parse(values.reuse ?? '[]');
  if (!d.LAUNCH[args]) throw new Error(`unknown launch configuration: ${args}`);
  const fixtures = await d.readFixtures();
  const fixture = await d.fixtureIdentity(), plan = gatePlan(fixtures);
  // The integrity preflight, at this exact implementation, before any GPU work.
  const implementation = await d.implementationIdentity();
  const pf = await d.runPreflight({ mode: 'headed' });
  const pfProblems = preflightProblems(pf?.record, implementation);
  if (pfProblems.length) throw new Error(`campaign refused before any gate ran: the integrity preflight does not support it (${pfProblems.join('; ')}; evidence ${pf?.runDir})`);
  const preflight = { runDir: basename(pf.runDir), implementationCommit: implementation.implementationCommit, implementationHash: implementation.implementationHash };
  const selected = [], runDirs = [], attempted = new Set(); let stopped = null, blockedBy = null;
  const reusedKeys = new Set(reuse.map(x => `${x.gate}/${x.slot}`));
  const bySource = new Map();
  for (const x of reuse) {
    const { manifest: src, records: rs } = await d.loadCampaign(x.fromManifest);
    const r = rs.find(y => y.id === x.recordId && y.gate === x.gate && y.slot === x.slot);
    if (!r) throw new Error(`cannot reuse ${x.recordId} as ${x.gate}/${x.slot}`);
    if (!bySource.has(x.fromManifest)) bySource.set(x.fromManifest, { src, records: [] });
    bySource.get(x.fromManifest).records.push(r);
    selected.push(r); attempted.add(r.gate);
  }
  for (const { src, records } of bySource.values()) await d.recompute(records, fixtures, { manifest: src });
  const draft = () => buildManifest({ records: selected, fixture, campaign: values.name, args, requestedArgs: d.LAUNCH[args], runDirs, reuse, preflight });
  for (const [phase, steps] of PHASES) {
    for (const [gate, mode] of steps) {
      if (only && !gatesOf(gate).some(g => only.includes(g))) continue;
      const required = requiredSlots(gate, mode, plan);
      if (required.every(k => reusedKeys.has(k))) continue;                                // fully supplied by valid reuse
      if (stopped) continue;
      gatesOf(gate).forEach(g => attempted.add(g));
      const out = gate === 'G2' ? await d.runG2({ args, campaign: values.name }) : await d.runSession({ gate, mode, args, campaign: values.name });
      runDirs.push(out.runDir.split('/').at(-1));
      // Select only this invocation's required, non-reused slots; other outputs stay on disk as unselected evidence.
      selected.push(...out.records.filter(r => required.includes(`${r.gate}/${r.slot}`) && !reusedKeys.has(`${r.gate}/${r.slot}`)));
      const abort = out.records.flatMap(r => ABORTS.map(f => f(r)).filter(Boolean));
      if (abort.length) stopped = `${gate}: ${[...new Set(abort)].join(', ')}`;
    }
    if (phase === 'correctness' && !stopped) {
      // Correctness before benchmarking: a numerical or functional failure is diagnosed before performance work starts. The verdict is the
      // checked one, over verified evidence and its raw payloads.
      const m = draft();
      const { raws } = await d.recompute(selected, fixtures, { manifest: m });
      for (const g of ['G1', 'G3', 'G4', 'G5', 'G11', 'G13']) {
        if (only && !only.includes(g)) continue;
        const r = gateVerdict(g, selected.filter(x => x.gate === g), m, fixtures, raws);
        if (r.status !== 'pass') { stopped = `correctness gate ${g} is ${r.status}`; if (r.status === 'fail') blockedBy = g; break; }
      }
    }
  }
  // notRun is reserved for gates that were never attempted; a partially attempted gate keeps its records and evaluates as incomplete.
  const notRun = {};
  for (const g of ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12', 'G13']) {
    if (attempted.has(g) || (only && !only.includes(g))) continue;
    notRun[g] = { status: 'not run', reason: stopped ? `campaign stopped: ${stopped}` : 'not requested', ...(stopped && blockedBy ? { blockedBy } : {}) };
  }
  const manifest = buildManifest({ records: selected, fixture, campaign: values.name, args, requestedArgs: d.LAUNCH[args], runDirs, notRun, reuse, preflight });
  checkCoherence(selected, manifest);
  const { raws } = await d.recompute(selected, fixtures, { manifest });
  const { backend, decision } = qualify(manifest, selected, fixtures, { raws });
  await d.writeReport(values.name, { ...manifest, stopped }, { backend, decision });
  for (const [g, r] of Object.entries(backend.gates)) d.log(`${g}: ${r.status}${r.reasons?.length ? ` — ${r.reasons.slice(0, 3).join('; ')}` : ''}`);
  d.log(`decision (remediation not yet closed): ${decision.outcome} — next: ${decision.next}${stopped ? `\nSTOPPED: ${stopped}` : ''}`);
  return { manifest, backend, decision, stopped };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { name: { type: 'string' }, args: { type: 'string', default: 'attempt1' }, gates: { type: 'string' }, reuse: { type: 'string', default: '[]' } } });
  const { runSession, runG2, LAUNCH } = await import('./run.mjs');
  const { runIntegrityPreflight } = await import('./integrity-preflight.mjs');
  const { fixtureIdentity, implementationIdentity } = await import('./evidence.mjs');
  const dir = resolve(ROOT, 'docs/reports/project0');
  await runCampaign(values, {
    LAUNCH, runSession, runG2, runPreflight: runIntegrityPreflight, implementationIdentity, fixtureIdentity, loadCampaign, recompute, log: console.log,
    readFixtures: async () => JSON.parse(await readFile(resolve(ROOT, 'spikes/project0/fixtures.json'), 'utf8')),
    writeReport: async (name, manifest, gates) => {
      await mkdir(dir, { recursive: true });
      await writeFile(resolve(dir, `${name}-manifest.json`), JSON.stringify(manifest, null, 2));
      await writeFile(resolve(dir, `${name}-gates.json`), JSON.stringify(gates, null, 2));
    },
  });
}
