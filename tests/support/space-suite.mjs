// Pure helpers for the headed Space suite (tests/space.mjs): the recorded Project 0 launch profile,
// the fail-closed chrome://gpu identity reader (re-expressed from Project 0; nothing is imported
// from spikes/), the requested-versus-effective argument check and the spike-document renderer.
// Nothing here launches a browser or touches the GPU, so the unit runner can exercise it.

// Spec §9.1 "Launch (tests)" / plan Global Constraints: the complete recorded Project 0 profile.
export const PROJECT0_LAUNCH_ARGS = Object.freeze([
  '--enable-gpu', '--use-angle=vulkan', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--enable-webgpu-developer-features',
]);
export const SPIKE_DOCUMENT_PATH = 'docs/reports/project1b/2026-10-21-coexistence-spike.md';
export const DEVELOPER_FLAG = '--enable-webgpu-developer-features';

// Long tasks attributed by interval overlap with recorded phases ({start, end} in performance.now()
// time). A task before the first phase is page startup; a task after every phase is `outside`; a task
// that starts inside a phase and ends after it (terminal synchronous work) belongs to that phase.
export function longTasksByPhase(entries, phases) {
  const names = Object.keys(phases);
  for (const name of names) { const { start, end } = phases[name]; if (!(Number.isFinite(start) && Number.isFinite(end) && end >= start)) throw new RangeError(`phase ${name} needs finite start ≤ end`); }
  const firstStart = Math.min(...names.map(name => phases[name].start));
  const byPhase = Object.fromEntries(names.map(name => [name, []]));
  const startup = [], outside = [];
  for (const entry of entries ?? []) {
    const taskStart = entry.startTime, taskEnd = entry.startTime + entry.duration;
    const task = { name: entry.name, startTime: entry.startTime, duration: entry.duration };
    const overlapping = names.filter(name => taskStart < phases[name].end && taskEnd > phases[name].start);
    if (overlapping.length) for (const name of overlapping) byPhase[name].push(task);
    else if (taskEnd <= firstStart) startup.push(task);
    else outside.push(task);
  }
  return { phases, byPhase, startup, outside, total: (entries ?? []).length };
}

// The served source set, file by file, against the checkout (injected IO so the unit runner can
// exercise it). `files` are the tracked application files; a mismatch or a missing file refuses.
export async function verifyServedSource({ files, readLocal, fetchServed }) {
  if (!Array.isArray(files) || !files.length) throw new Error('verifyServedSource: no files to verify');
  const mismatched = [], missing = [];
  let matched = 0;
  for (const path of files) {
    const local = Buffer.from(await readLocal(path)), served = await fetchServed(path);
    if (served === null || served === undefined) { missing.push(path); continue; }
    if (Buffer.compare(local, Buffer.from(served)) === 0) matched++; else mismatched.push(path);
  }
  return { files: files.length, matched, mismatched, missing, matches: mismatched.length === 0 && missing.length === 0 };
}

// Server readiness first, then the served source: a probe taken while nothing listens is never kept.
export async function startupSequence({ ensureServer, identifySource }) {
  const serverOwnership = await ensureServer();
  const source = await identifySource();
  return { serverOwnership, source };
}
// The manifest's requiredPasses for space-coexistence (a unit test keeps the two identical).
export const COEXISTENCE_REQUIRED_PASSES = Object.freeze([
  'WebGL 2 and WebGPU contexts coexist in one page',
  'Adapter identity reports observed or unavailable fields truthfully',
  'A representative pipeline set prepares within the bound with progress events',
]);

// A coexistence report is evidence only when it is a non-empty list with an environment entry, no
// FAIL entry and every required pass (the gate's validateEvidence rule, applied to document inputs).
export function validateCoexistenceReport(report, label = 'the suite report') {
  if (!Array.isArray(report) || !report.length) throw new Error(`${label} is empty or not a list`);
  if (report.some(entry => entry?.name === 'FAIL')) throw new Error(`${label} records a failure; the spike document is generated only from passing runs`);
  if (!report.some(entry => entry?.name === 'environment')) throw new Error(`${label} has no environment entry`);
  const names = new Set(report.map(entry => entry?.name));
  const absent = COEXISTENCE_REQUIRED_PASSES.filter(name => !names.has(name));
  if (absent.length) throw new Error(`${label}: missing passes: ${absent.join('; ')}`);
  return { ok: true };
}

// The spike document may be written only after the run passed, its report was persisted and every
// page, context and browser was drained and closed with cleanup confirmed.
export function canWriteSpikeDocument({ report, cleanupFailed, reportPersisted, exitCode }) {
  try { validateCoexistenceReport(report); } catch (error) { return { ok: false, reason: error.message }; }
  if (!reportPersisted) return { ok: false, reason: 'the suite report was not persisted' };
  if (cleanupFailed) return { ok: false, reason: 'cleanup (drain or close) failed or was unconfirmed' };
  if (exitCode !== undefined && exitCode !== 0) return { ok: false, reason: `the suite is exiting with code ${exitCode}` };
  return { ok: true, reason: 'run passed, report persisted, cleanup confirmed' };
}

// chrome://gpu renders into open shadow roots filled in asynchronously, so body.innerText is empty.
// Self-contained: Playwright serialises it into the page.
export function collectVisibleText() {
  const SKIP = new Set(['STYLE', 'SCRIPT']), INLINE = new Set(['A', 'B', 'I', 'EM', 'STRONG', 'CODE', 'SPAN']);
  const walk = node => {
    let out = node.shadowRoot ? walk(node.shadowRoot) : '';
    for (const child of node.childNodes) {
      if (child.nodeType === 3) out += child.textContent;
      else if (child.nodeType === 1 && !SKIP.has(child.tagName)) out += walk(child) + (INLINE.has(child.tagName) ? '' : '\n');
    }
    return out;
  };
  return walk(document.body);
}

// The driver identity of the single *ACTIVE* GPU record, fail closed: a `GPUn` label's value is the
// rest of its line or the next non-blank line (never another label); record indices are unique;
// exactly one record is active; VENDOR= and DEVICE= are 0x hexadecimal tokens (with an optional
// bracketed name) occurring once each; DRIVER_VENDOR= and DRIVER_VERSION= are non-empty and unique.
// A field value ends at `,` or `*` (DEVICE=[ANGLE (NVIDIA, Vulkan …)] is full of commas, so a
// bracketed name may be truncated; the hexadecimal token is what is parsed). Every refusal throws.
const GPU_LABEL = /^GPU(\d+)[ \t]*:?[ \t]*(.*)$/, ANY_LABEL = /^[^:]*\S[ \t]*:[ \t]*$/;
export function activeGpuIdentity(text) {
  const fail = why => { throw new Error(`chrome://gpu identity: ${why}`); };
  const lines = String(text ?? '').split('\n'), records = [];
  lines.forEach((line, index) => {
    const label = GPU_LABEL.exec(line.trim());
    if (!label) return;
    let value = label[2].trim();
    if (!value) {
      let next = index + 1;
      while (next < lines.length && !lines[next].trim()) next++;
      const candidate = next < lines.length ? lines[next].trim() : '';
      value = GPU_LABEL.test(candidate) || ANY_LABEL.test(candidate) ? '' : candidate;
    }
    records.push({ index: label[1], value });
  });
  if (!records.length) fail('the page lists no GPU records');
  if (new Set(records.map(record => record.index)).size !== records.length) fail('a GPU record is listed twice');
  const empty = records.find(record => !record.value);
  if (empty) fail(`GPU${empty.index} has no value`);
  const active = records.filter(record => record.value.includes('*ACTIVE*'));
  if (active.length !== 1) fail(`${active.length} active GPU records (exactly one required)`);
  const record = active[0].value;
  const field = key => [...record.matchAll(new RegExp(`(?:^|[\\s,])${key}=([^,*\\n]*)`, 'g'))].map(match => match[1].trim()).map(value => (/[A-Z_]+=/.test(value) ? '' : value));
  const unique = key => { const values = field(key); if (values.length !== 1 || !values[0]) fail(`${key}= must occur exactly once with a value (found ${JSON.stringify(values)})`); return values[0]; };
  const id = key => {
    const match = /^0x([0-9a-fA-F]{1,8})(?:\s*\[[^\]]*\]?)?$/.exec(unique(key));
    if (!match) fail(`${key}= is not a 0x hexadecimal token with an optional bracketed name`);
    return parseInt(match[1], 16);
  };
  return { record, vendorId: id('VENDOR'), deviceId: id('DEVICE'), driverVendor: unique('DRIVER_VENDOR'), driverVersion: unique('DRIVER_VERSION') };
}

// The Graphics Feature Status line for one feature (e.g. 'WebGPU'; Chrome 155 renders
// `*   WebGPU: Hardware accelerated`): the value on the feature's own line or on the next non-blank
// line; a longer name (`WebGPU interop`) is a different feature; 'unavailable' when absent.
// Parsing stays inside the section: it ends at the next section (`Driver Information`, a `[Section]`
// heading, a `GPUn` record) and a following feature label (`* Name: …`, `Name:`) or boundary is never
// read as a value.
// A section boundary is a named section, a `[Section]` heading, a `GPUn` record, or any plain line
// underlined by `===`/`---` on the next line (chrome://gpu's `Version Information` and the like).
const SECTION_BOUNDARY = /^(Driver Information|GPU\d+\b.*|\[[^\]]*\])$/;
const UNDERLINE = /^[=-]{3,}$/;
const FEATURE_LABEL = /^\*?\s*[A-Za-z][^:]*:(\s.*)?$/;
export function graphicsFeatureStatus(text, feature) {
  const lines = String(text ?? '').split('\n').map(line => line.trim());
  const start = lines.indexOf('Graphics Feature Status');
  if (start < 0) return 'unavailable';
  const boundary = index => SECTION_BOUNDARY.test(lines[index]) || (lines[index] !== '' && !UNDERLINE.test(lines[index]) && UNDERLINE.test(lines[index + 1] ?? ''));
  for (let index = start + 1; index < lines.length; index++) {
    if (UNDERLINE.test(lines[index])) continue; // the section's own underline
    if (boundary(index)) break;
    const match = new RegExp(`^\\*?\\s*${feature}(?::\\s*(.*)|\\s*)$`).exec(lines[index]);
    if (!match) continue;
    if (match[1]) return match[1].trim();
    let next = index + 1;
    while (next < lines.length && !lines[next]) next++;
    if (next >= lines.length) return 'unavailable';
    return boundary(next) || UNDERLINE.test(lines[next]) || FEATURE_LABEL.test(lines[next]) ? 'unavailable' : lines[next];
  }
  return 'unavailable';
}

// Which requested switches reached Chrome's effective command line (chrome://version), and whether
// the launch is sandboxed, headed and watched (Project 0's assertSandboxed, re-expressed).
export function checkEffectiveArguments(commandLine, requested) {
  const tokens = String(commandLine ?? '').split(/\s+/).filter(Boolean);
  const has = flag => tokens.includes(flag);
  const present = [...requested].filter(has), missing = [...requested].filter(flag => !has(flag));
  return {
    present, missing,
    noSandbox: has('--no-sandbox'),
    headless: tokens.some(token => token === '--headless' || token.startsWith('--headless=')),
    gpuWatchdogDisabled: has('--disable-gpu-watchdog'),
    developerFeatures: has(DEVELOPER_FLAG),
  };
}

const ms = value => (Number.isFinite(value) ? `${Number(value.toFixed(1))} ms` : 'unavailable');
const show = value => (value === undefined || value === null ? 'unavailable' : typeof value === 'object' ? JSON.stringify(value) : String(value));
const identityCell = field => (field && typeof field === 'object' ? `\`${field.value}\` (source: ${field.source})` : `\`${show(field)}\``);
const entryNamed = (report, name) => report.find(entry => entry?.name === name);

// The spike document, generated from the suite report so that a rerun reproduces it. `runs` adds the
// repeat runs (each `{ label, report }`); `experiment` is the developer-flag experiment's report;
// `report` is the run the tables describe. Every input is validated as evidence first.
const sourceCell = env => (env?.source?.commit ? `\`${env.source.commit}\` (${env.source.dirty ? 'dirty' : 'clean'})` : 'unavailable');
const taskList = tasks => (tasks.length ? ` (${tasks.map(task => `${show(task.name)} at ${ms(task.startTime)} for ${ms(task.duration)}`).join('; ')})` : '');
// Long tasks per recorded phase (PerformanceObserver `longtask`, filtered by interval overlap).
const longTasksCell = longTasks => {
  if (!longTasks?.byPhase) return 'Long tasks: not recorded.';
  if (longTasks.observerError) return `Long tasks (PerformanceObserver \`longtask\`): unavailable, the observer could not be installed (${show(longTasks.observerError)}); no long-task count is reported for preparation, dispatch or startup.`;
  const phase = name => `${(longTasks.byPhase[name] ?? []).length}${taskList(longTasks.byPhase[name] ?? [])}`;
  const phaseSpan = name => (longTasks.phases?.[name] ? `${ms(longTasks.phases[name].start)}–${ms(longTasks.phases[name].end)}` : 'unavailable');
  return `Long tasks (PerformanceObserver \`longtask\`, attributed by interval overlap, collected through the terminal task): overlapping the preparation phase: ${phase('preparation')} [${phaseSpan('preparation')}]; overlapping the dispatch phase: ${phase('dispatch')} [${phaseSpan('dispatch')}]; page startup tasks before preparation (recorded separately, not attributed to preparation or dispatch): ${longTasks.startup?.length ?? 0}${taskList(longTasks.startup ?? [])}; after every phase: ${longTasks.outside?.length ?? 0}${taskList(longTasks.outside ?? [])}.`;
};
const waitsCell = waits => Object.entries(waits ?? {}).map(([key, wait]) => `${key}: armed ${show(wait.armed)}, rearmed ${show(wait.rearmed)}, fired ${show(wait.fired)}`).join('; ') || 'none recorded';
export function renderSpikeDocument(report, { generatedAt, commit, runs = [], experiment = null } = {}) {
  validateCoexistenceReport(report, 'the suite report');
  for (const run of runs) validateCoexistenceReport(run.report, `included run ${run.label}`);
  if (experiment !== null) {
    if (!Array.isArray(experiment) || !experiment.length) throw new Error('the experiment report is empty or not a list');
    if (experiment.some(entry => entry?.name === 'FAIL')) throw new Error('the experiment report records a failure');
    for (const launch of ['with-developer-flag', 'without-developer-flag']) {
      if (!experiment.some(entry => entry?.name === 'environment' && entry.launch === launch) || !experiment.some(entry => entry?.launch === launch && entry.identity)) throw new Error(`the experiment report must carry both launches (${launch} missing)`);
    }
  }
  const env = entryNamed(report, 'environment');
  const coexist = entryNamed(report, 'WebGL 2 and WebGPU contexts coexist in one page') ?? {};
  const identity = entryNamed(report, 'Adapter identity reports observed or unavailable fields truthfully') ?? {};
  const prepared = entryNamed(report, 'A representative pipeline set prepares within the bound with progress events') ?? {};
  const destroyed = entryNamed(report, 'WebGPU device destroyed without disturbing WebGL') ?? {};
  const lines = [];
  const push = (...items) => lines.push(...items);
  push('# Project 1b.1 B01 — WebGL 2 and WebGPU coexistence spike', '',
    `Generated from the suite report of \`tests/space.mjs --group coexistence\` (plan B01; spec §18, §15, §7.4, §9.1). Generated ${generatedAt} from the source checkout at commit \`${commit}\` (each run below names the commit it ran on; this document is committed separately from the code it describes). Headed only (Project 0 E7): a headless or software-device result never satisfies a Space requirement (§16.5).`, '',
    '## Conditions', '',
    '| Condition | Value |', '|---|---|',
    `| Browser | ${show(env.browser)} ${show(env.chromeVersion)} (headed: ${show(env.headed)}, chromiumSandbox: ${show(env.chromiumSandbox)}) |`,
    `| User agent | ${show(env.userAgent)} |`,
    `| Requested launch arguments | ${(env.requestedArgs ?? []).map(flag => `\`${flag}\``).join(' ')} |`,
    `| Effective arguments present | ${(env.effectiveArguments?.present ?? []).map(flag => `\`${flag}\``).join(' ') || 'none'} |`,
    `| Effective arguments missing | ${(env.effectiveArguments?.missing ?? []).map(flag => `\`${flag}\``).join(' ') || 'none'} |`,
    `| Sandbox / headless / GPU watchdog | no-sandbox: ${show(env.effectiveArguments?.noSandbox)}; headless: ${show(env.effectiveArguments?.headless)}; watchdog disabled: ${show(env.effectiveArguments?.gpuWatchdogDisabled)} |`,
    `| chrome://gpu active record | ${env.chromeGpu?.record ? `vendor 0x${env.chromeGpu.vendorId.toString(16)}, device 0x${env.chromeGpu.deviceId.toString(16)}, driver ${env.chromeGpu.driverVendor} ${env.chromeGpu.driverVersion} (${show(env.chromeGpu.polls)} poll(s))` : `unavailable (${show(env.chromeGpu?.reason)})`} |`,
    `| chrome://gpu Graphics Feature Status: WebGPU | ${show(env.webgpuStatus)} |`,
    `| GPU handoff (ATLAS_GPU_HANDOFF) | ${show(env.handoff)} |`,
    `| Source | commit ${sourceCell(env)}; served from ${show(env.source?.servedUrl)} (server ${show(env.serverOwnership)} by the suite); served source set verified against the checkout: ${show(env.source?.servedSource?.matched)} of ${show(env.source?.servedSource?.files)} tracked application files match${env.source?.servedSource?.matches ? '' : ` — MISMATCH ${show(env.source?.servedSource)}`} |`,
    `| Suite started | ${show(env.startedAt)} |`,
    `| Viewport | ${show(env.viewport?.width)} × ${show(env.viewport?.height)}, device scale factor ${show(env.viewport?.deviceScaleFactor)} |`, '',
    'Full effective command line (chrome://version):', '', '```', show(env.effectiveCommandLine), '```', '',
    '## 1. Both contexts live in one page', '',
    `WebGL 2 (Plane): renderer \`${show(coexist.webgl?.renderer)}\`, vendor \`${show(coexist.webgl?.vendor)}\`, ${show(coexist.webgl?.version)}.`, '',
    `WebGPU: device attempt \`${show(coexist.webgpu?.attemptId)}\`; a second canvas configured with the preferred format \`${show(coexist.webgpu?.canvasFormat)}\`; compute probe ${show(coexist.webgpu?.probe)}.`, '',
    `Plane after acquisition: wheel step zoom ${show(coexist.plane?.zoomBefore)} → ${show(coexist.plane?.zoomAfter)}, full resolution ${show(coexist.plane?.width)} × ${show(coexist.plane?.height)}.`, '',
    `WebGL drains (fence + readback) with the WebGPU device alive: after acquisition ${show(coexist.drains?.afterAcquire)}; after WebGPU work ${show(coexist.drains?.afterWebGpuWork)}.`, '',
    `Destroying the WebGPU device: \`device.lost\` reason ${show(destroyed.lost?.reason)}; WebGL drain afterwards ${show(destroyed.webglAfterDestroy)}; waits: ${waitsCell(destroyed.waits)}.`, '',
    '## 2. Adapter identity (as observed; nothing invented)', '',
    '| Field | Observation |', '|---|---|');
  for (const field of ['vendor', 'architecture', 'device', 'description']) push(`| ${field} | ${identityCell(identity.identity?.[field])} |`);
  push(`| isFallbackAdapter | ${identityCell(identity.isFallbackAdapter)} |`,
    `| features requested / granted | ${show(identity.features?.requested)} / ${show(identity.features?.granted)} (timestamp-query granted: ${show(identity.features?.timestampQuery)}) |`,
    `| features available | ${show(identity.features?.available)} |`, '',
    '| Limit | Value |', '|---|---|');
  for (const [key, value] of Object.entries(identity.limits ?? {})) push(`| ${key} | ${show(value)} |`);
  push('', '## 3. Representative pipeline preparation', '',
    `Bound ${show(prepared.boundMs)} ms per attempt (plan default 60 s). First preparation in this fresh browser profile ${ms(prepared.totalMs)} (driver-cache state unmeasured); progress events ${show(prepared.events?.length)}; warm re-preparation of identical sources in the same device ${ms(prepared.warm?.totalMs)}.`, '',
    `Timer: \`performance.now()\` resolution measured in page ${show(prepared.timer?.resolutionMs)} ms (smallest positive delta over ${show(prepared.timer?.samples)} samples, ${show(prepared.timer?.distinctDeltas)} distinct deltas); in-page times at or below that resolution are bounds, not measurements. ${longTasksCell(prepared.longTasks)} Scheduled waits (armed / rearmed / fired): ${waitsCell(prepared.waits)}.`, '',
    '| Stage | Module | Pipeline (createComputePipelineAsync) | Total | Warm total | Compilation messages |', '|---|---|---|---|---|---|');
  for (const stage of prepared.stages ?? []) {
    const warm = (prepared.warm?.stages ?? []).find(item => item.id === stage.id);
    push(`| ${stage.id} | ${ms(stage.moduleMs)} | ${ms(stage.pipelineMs)} | ${ms(stage.totalMs)} | ${ms(warm?.totalMs)} | ${stage.messages?.length ? stage.messages.map(show).join('; ') : 'none'} |`);
  }
  push('', `Progress events: ${show(prepared.events)}`, '');
  if (prepared.dispatch) {
    const d = prepared.dispatch;
    push(`Representative trace dispatch (recorded, not a requirement): ${show(d.width)} × ${show(d.height)} rays, submission ${ms(d.submissionMs)}, queue completion ${ms(d.queueCompletionMs)} (labelled queue-completion; a fence includes preceding work), termination counts ${show(d.counts)}.`, '');
  }
  if (runs.length) {
    push('## Repeat runs (ordered by start time; fresh browser profile each; driver-cache state unmeasured)', '', '| Run | Started | Source | First preparation | trace | normals | display | Warm total | Dispatch queue completion | Long tasks preparation / dispatch |', '|---|---|---|---|---|---|---|---|---|---|');
    const started = run => entryNamed(run.report ?? [], 'environment')?.startedAt ?? '';
    for (const run of [...runs].sort((a, b) => started(a).localeCompare(started(b)))) {
      const e = entryNamed(run.report ?? [], 'environment') ?? {}, p = entryNamed(run.report ?? [], 'A representative pipeline set prepares within the bound with progress events') ?? {};
      const stage = id => ms((p.stages ?? []).find(item => item.id === id)?.totalMs);
      const tasks = !p.longTasks?.byPhase ? 'not recorded' : p.longTasks.observerError ? `unavailable (${show(p.longTasks.observerError)})` : `${p.longTasks.byPhase.preparation?.length ?? 0} / ${p.longTasks.byPhase.dispatch?.length ?? 0} (startup ${p.longTasks.startup?.length ?? 0})`;
      push(`| ${run.label} | ${show(e.startedAt)} | ${sourceCell(e)} | ${ms(p.totalMs)} | ${stage('trace')} | ${stage('normals')} | ${stage('display')} | ${ms(p.warm?.totalMs)} | ${ms(p.dispatch?.queueCompletionMs)} | ${tasks} |`);
    }
    push('');
  }
  if (experiment) {
    push('## Developer-flag experiment (two fresh-profile launches differing only in `--enable-webgpu-developer-features`)', '',
      'The flag-absent launch is a **portability experiment**: it is never qualification and never replaces acceptance under the complete recorded profile.', '',
      '| Launch | Developer flag effective | vendor | architecture | device | description | isFallbackAdapter | timestamp-query granted | Probe |', '|---|---|---|---|---|---|---|---|---|');
    for (const launch of ['with-developer-flag', 'without-developer-flag']) {
      const e = experiment.find(entry => entry?.name === 'environment' && entry.launch === launch) ?? {};
      const r = experiment.find(entry => entry?.launch === launch && entry.identity) ?? {};
      push(`| ${launch} | ${show(e.effectiveArguments?.developerFeatures)} | ${identityCell(r.identity?.vendor)} | ${identityCell(r.identity?.architecture)} | ${identityCell(r.identity?.device)} | ${identityCell(r.identity?.description)} | ${identityCell(r.isFallbackAdapter)} | ${show(r.features?.granted?.includes('timestamp-query'))} | ${show(r.probe)} |`);
    }
    push('');
  }
  push('## Passes recorded', '');
  for (const entry of report) if (entry.name !== 'environment') push(`- ${entry.name}`);
  push('', '## Reading these results', '',
    '- Coexistence is established for this page, profile and host only; the suite re-establishes it on every gated commit.',
    '- Identity fields are recorded as observed or `unavailable`; physical-GPU acceptance rests on the corroborating chrome://gpu record and the WebGL renderer string, never on an invented device string (§7.4, §9.1).',
    '- Preparation times are representative of the spike kernels, not of the product pipeline set; B11 verifies complete product prewarming (§15 first-use compilation).',
    '- Each run uses a fresh browser profile and a fresh device in a fresh page; the GPU driver-cache state is unmeasured (no cache isolation, clearing or hit/miss observation was performed), so differences between runs are reported, not attributed.',
    '- Launches without the complete recorded profile are separately identified portability experiments and are not represented here except in the labelled experiment section.', '');
  return lines.join('\n');
}
