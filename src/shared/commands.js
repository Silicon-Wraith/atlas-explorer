// Scene commands (spec §6). Each command declares the domains it owns; the
// domains a change actually touched are derived from the before and after scenes,
// so a caller cannot label a mathematical change as appearance-only.
import { SceneError, canonicalJson } from './scene.js';

export const DOMAIN_FIELDS = Object.freeze({
  mathematics: Object.freeze(['model', 'conventions', 'parameters', 'iteration']),
  tracing: Object.freeze(['tracing', 'sampling']),
  appearance: Object.freeze(['appearance']),
  camera: Object.freeze(['camera']),
  slice: Object.freeze(['slices']),
});
export const DOMAINS = Object.freeze(Object.keys(DOMAIN_FIELDS));
export const WHOLE_SCENE = 'whole-scene';

export function changedDomains(before, after) {
  return DOMAINS.filter(domain => DOMAIN_FIELDS[domain].some(field => canonicalJson(before[field]) !== canonicalJson(after[field])));
}

// A plain copy of `scene` with the fields of `domains` taken from `source`.
export function withDomains(scene, source, domains) {
  const result = { ...scene };
  for (const domain of domains) for (const field of DOMAIN_FIELDS[domain]) result[field] = source[field];
  return result;
}

const COMMANDS = Object.freeze({
  setCamera: { owns: ['camera'], apply: (scene, command) => ({ ...scene, camera: command.camera }) },
  setAppearance: { owns: ['appearance'], apply: (scene, command) => ({ ...scene, appearance: { ...scene.appearance, ...command.patch } }) },
  setIteration: { owns: ['mathematics'], apply: (scene, command) => ({ ...scene, iteration: { ...scene.iteration, ...command.patch } }) },
  setParameters: { owns: ['mathematics'], apply: (scene, command) => ({ ...scene, parameters: command.parameters }) },
  setTracing: { owns: ['tracing'], apply: (scene, command) => ({ ...scene, tracing: command.tracing }) },
  setSlices: { owns: ['slice'], apply: (scene, command) => ({ ...scene, slices: command.slices }) },
  restoreScene: { owns: [WHOLE_SCENE], apply: (scene, command) => command.scene },
});
export const COMMAND_TYPES = Object.freeze(Object.keys(COMMANDS));

// → { scene, ownedDomains, changed }; the result is a validated, frozen scene.
export function reduceCommand(scene, command, codec) {
  const definition = COMMANDS[command?.type];
  if (!definition) throw new SceneError('unknown-command', `unknown command ${JSON.stringify(command?.type)}`);
  const next = codec.validate(definition.apply(scene, command));
  if (next.workspace !== scene.workspace) throw new SceneError('workspace-mismatch', `a ${scene.workspace} history cannot hold a ${next.workspace} scene`);
  const changed = changedDomains(scene, next);
  if (!definition.owns.includes(WHOLE_SCENE)) {
    const foreign = changed.filter(domain => !definition.owns.includes(domain));
    if (foreign.length) throw new SceneError('command-domain-violation', `${command.type} changed ${foreign.join(', ')}`);
  }
  return { scene: next, ownedDomains: definition.owns, changed };
}
