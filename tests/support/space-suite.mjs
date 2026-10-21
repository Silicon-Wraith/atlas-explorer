// Pure helpers for the headed Space suite (tests/space.mjs): the recorded Project 0 launch profile,
// the fail-closed chrome://gpu identity reader (re-expressed from Project 0; nothing is imported
// from spikes/), the requested-versus-effective argument check and the spike-document renderer.
// Nothing here launches a browser or touches the GPU, so the unit runner can exercise it.

// Spec §9.1 "Launch (tests)" / plan Global Constraints: the complete recorded Project 0 profile.
export const PROJECT0_LAUNCH_ARGS = Object.freeze([
  '--enable-gpu', '--use-angle=vulkan', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--enable-webgpu-developer-features',
]);
export const SPIKE_DOCUMENT_PATH = 'docs/reports/project1b/2026-10-21-coexistence-spike.md';

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
export function graphicsFeatureStatus(text, feature) {
  const lines = String(text ?? '').split('\n').map(line => line.trim());
  const start = lines.indexOf('Graphics Feature Status');
  if (start < 0) return 'unavailable';
  for (let index = start + 1; index < lines.length; index++) {
    if (lines[index] === 'Driver Information' || /^GPU\d+/.test(lines[index])) break;
    const match = new RegExp(`^\\*?\\s*${feature}(?::\\s*(.*)|\\s*)$`).exec(lines[index]);
    if (!match) continue;
    if (match[1]) return match[1].trim();
    let next = index + 1;
    while (next < lines.length && !lines[next]) next++;
    return next < lines.length && !/:\s*$/.test(lines[next]) ? lines[next] : 'unavailable';
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
  };
}

const ms = value => (Number.isFinite(value) ? `${Number(value.toFixed(1))} ms` : 'unavailable');
const show = value => (value === undefined || value === null ? 'unavailable' : typeof value === 'object' ? JSON.stringify(value) : String(value));
const identityCell = field => (field && typeof field === 'object' ? `\`${field.value}\` (source: ${field.source})` : `\`${show(field)}\``);
const entryNamed = (report, name) => report.find(entry => entry?.name === name);

// The spike document, generated from the suite report so that a rerun reproduces it. `runs` adds the
// repeat runs' preparation timings (each `{ label, report }`); `report` is the run the tables describe.
export function renderSpikeDocument(report, { generatedAt, commit, runs = [] } = {}) {
  if (!Array.isArray(report) || !report.length) throw new Error('the suite report is empty');
  if (report.some(entry => entry?.name === 'FAIL')) throw new Error('the suite report records a failure; the spike document is generated only from a passing run');
  const env = entryNamed(report, 'environment');
  if (!env) throw new Error('the suite report has no environment entry');
  const coexist = entryNamed(report, 'WebGL 2 and WebGPU contexts coexist in one page') ?? {};
  const identity = entryNamed(report, 'Adapter identity reports observed or unavailable fields truthfully') ?? {};
  const prepared = entryNamed(report, 'A representative pipeline set prepares within the bound with progress events') ?? {};
  const destroyed = entryNamed(report, 'WebGPU device destroyed without disturbing WebGL') ?? {};
  const lines = [];
  const push = (...items) => lines.push(...items);
  push('# Project 1b.1 B01 — WebGL 2 and WebGPU coexistence spike', '',
    `Generated from the suite report of \`tests/space.mjs --group coexistence\` (plan B01; spec §18, §15, §7.4, §9.1). Generated ${generatedAt} from the working tree based on commit \`${commit}\` (the B01 commit itself contains this file). Headed only (Project 0 E7): a headless or software-device result never satisfies a Space requirement (§16.5).`, '',
    '## Conditions', '',
    '| Condition | Value |', '|---|---|',
    `| Browser | ${show(env.browser)} ${show(env.chromeVersion)} (headed: ${show(env.headed)}, chromiumSandbox: ${show(env.chromiumSandbox)}) |`,
    `| User agent | ${show(env.userAgent)} |`,
    `| Requested launch arguments | ${(env.requestedArgs ?? []).map(flag => `\`${flag}\``).join(' ')} |`,
    `| Effective arguments present | ${(env.effectiveArguments?.present ?? []).map(flag => `\`${flag}\``).join(' ') || 'none'} |`,
    `| Effective arguments missing | ${(env.effectiveArguments?.missing ?? []).map(flag => `\`${flag}\``).join(' ') || 'none'} |`,
    `| Sandbox / headless / GPU watchdog | no-sandbox: ${show(env.effectiveArguments?.noSandbox)}; headless: ${show(env.effectiveArguments?.headless)}; watchdog disabled: ${show(env.effectiveArguments?.gpuWatchdogDisabled)} |`,
    `| chrome://gpu active record | ${env.chromeGpu?.record ? `vendor 0x${env.chromeGpu.vendorId.toString(16)}, device 0x${env.chromeGpu.deviceId.toString(16)}, driver ${env.chromeGpu.driverVendor} ${env.chromeGpu.driverVersion}` : `unavailable (${show(env.chromeGpu?.reason)})`} |`,
    `| chrome://gpu Graphics Feature Status: WebGPU | ${show(env.webgpuStatus)} |`,
    `| Suite started | ${show(env.startedAt)} |`,
    `| Viewport | ${show(env.viewport?.width)} × ${show(env.viewport?.height)}, device scale factor ${show(env.viewport?.deviceScaleFactor)} |`, '',
    '## 1. Both contexts live in one page', '',
    `WebGL 2 (Plane): renderer \`${show(coexist.webgl?.renderer)}\`, vendor \`${show(coexist.webgl?.vendor)}\`, ${show(coexist.webgl?.version)}.`, '',
    `WebGPU: device attempt \`${show(coexist.webgpu?.attemptId)}\`; a second canvas configured with the preferred format \`${show(coexist.webgpu?.canvasFormat)}\`; compute probe ${show(coexist.webgpu?.probe)}.`, '',
    `Plane after acquisition: wheel step zoom ${show(coexist.plane?.zoomBefore)} → ${show(coexist.plane?.zoomAfter)}, full resolution ${show(coexist.plane?.width)} × ${show(coexist.plane?.height)}.`, '',
    `WebGL drains (fence + readback) with the WebGPU device alive: after acquisition ${show(coexist.drains?.afterAcquire)}; after WebGPU work ${show(coexist.drains?.afterWebGpuWork)}.`, '',
    `Destroying the WebGPU device: \`device.lost\` reason ${show(destroyed.lost?.reason)}; WebGL drain afterwards ${show(destroyed.webglAfterDestroy)}.`, '',
    '## 2. Adapter identity (as observed; nothing invented)', '',
    '| Field | Observation |', '|---|---|');
  for (const field of ['vendor', 'architecture', 'device', 'description']) push(`| ${field} | ${identityCell(identity.identity?.[field])} |`);
  push(`| isFallbackAdapter | ${identityCell(identity.isFallbackAdapter)} |`,
    `| features requested / granted | ${show(identity.features?.requested)} / ${show(identity.features?.granted)} (timestamp-query granted: ${show(identity.features?.timestampQuery)}) |`,
    `| features available | ${show(identity.features?.available)} |`, '',
    '| Limit | Value |', '|---|---|');
  for (const [key, value] of Object.entries(identity.limits ?? {})) push(`| ${key} | ${show(value)} |`);
  push('', '## 3. Representative pipeline preparation', '',
    `Bound ${show(prepared.boundMs)} ms per attempt (plan default 60 s). Cold total ${ms(prepared.totalMs)}; progress events ${show(prepared.events?.length)}; warm re-preparation total ${ms(prepared.warm?.totalMs)}.`, '',
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
    push('## Repeat runs (ordered by start time)', '', '| Run | Started | Cold total | trace | normals | display | Warm total | Dispatch queue completion |', '|---|---|---|---|---|---|---|---|');
    const started = run => entryNamed(run.report ?? [], 'environment')?.startedAt ?? '';
    for (const run of [...runs].sort((a, b) => started(a).localeCompare(started(b)))) {
      const e = entryNamed(run.report ?? [], 'environment') ?? {}, p = entryNamed(run.report ?? [], 'A representative pipeline set prepares within the bound with progress events') ?? {};
      const stage = id => ms((p.stages ?? []).find(item => item.id === id)?.totalMs);
      push(`| ${run.label} | ${show(e.startedAt)} | ${ms(p.totalMs)} | ${stage('trace')} | ${stage('normals')} | ${stage('display')} | ${ms(p.warm?.totalMs)} | ${ms(p.dispatch?.queueCompletionMs)} |`);
    }
    push('');
  }
  push('## Passes recorded', '');
  for (const entry of report) if (entry.name !== 'environment') push(`- ${entry.name}`);
  push('', '## Reading these results', '',
    '- Coexistence is established for this page, profile and host only; the suite re-establishes it on every gated commit.',
    '- Identity fields are recorded as observed or `unavailable`; physical-GPU acceptance rests on the corroborating chrome://gpu record and the WebGL renderer string, never on an invented device string (§7.4, §9.1).',
    '- Preparation times are representative of the spike kernels, not of the product pipeline set; B11 verifies complete product prewarming (§15 first-use compilation).',
    '- "Cold" means a fresh browser profile and a fresh device in a fresh page; the GPU driver keeps an on-disk shader cache across browser processes, so only the first run after a kernel change compiles from scratch. The first row of the repeat-run table shows that case; "warm" re-prepares identical sources in the same device.',
    '- In-page times come from `performance.now()`, which this non-isolated page quantizes to 0.1 ms; sub-millisecond values are bounds, not measurements.',
    '- Launches without the complete recorded profile are separately identified portability experiments and are not represented here.', '');
  return lines.join('\n');
}
