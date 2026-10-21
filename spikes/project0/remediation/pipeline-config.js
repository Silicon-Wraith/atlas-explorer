// spikes/project0/remediation/pipeline-config.js — browser-safe: the arithmetic module's entry points and pipeline descriptors, shared by the
// page (gpu/webgpu.js prepare, which records them beside the source it compiled) and the read-time check (remediation/validate.mjs
// expectedShader), so a G5 record's reported shader identity is compared with the reviewed configuration exactly (fix round 1, finding 4).
// G5-D (prereg §8.4) appends qjulia_operational; the historical G5-A configuration (seven entry points) is pinned in remediation/validate.mjs.
export const ARITHMETIC_ENTRY_POINTS = Object.freeze(['bulb_samples', 'qjulia_plane', 'qjulia_offplane', 'derivative_policy', 'remediation_primitives', 'remediation_dot', 'remediation_updates', 'qjulia_operational']);
export const arithmeticPipelines = () => ARITHMETIC_ENTRY_POINTS.map(entryPoint => ({ entryPoint, module: 'arithmetic', layout: 'auto', label: entryPoint, constants: null }));
