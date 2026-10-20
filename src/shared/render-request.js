// Immutable render requests (spec §7.1, §7.2). Revisions are execution identities;
// keys identify resolved pass inputs. Equal keys never make a stale request publishable.
import { deepFreeze, isPlainObject } from './scene.js';

export const RENDER_PURPOSES = Object.freeze(['interactive', 'export', 'instrument', 'swatch', 'thumbnail']);

// A namespace created synchronously once per page or process, so request, job and report
// identities stay distinct across reloads and tabs that share one store.
export const RUNTIME_ID = globalThis.crypto?.randomUUID?.() ?? `runtime-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
export const MAX_OUTPUT_DIMENSION = 16384;
const REVISIONS = ['deviceEpoch', 'viewRevision', 'geometryRevision', 'appearanceRevision'];

export class RenderRequestError extends Error {
  constructor(message) { super(message); this.name = 'RenderRequestError'; this.code = 'invalid-render-request'; }
}

const requireString = (value, name) => { if (typeof value !== 'string' || !value) throw new RenderRequestError(`${name} must be a non-empty string`); return value; };
const requireCount = (value, name, max = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isInteger(value) || value < 0 || value > max) throw new RenderRequestError(`${name} must be an integer from 0 to ${max}`);
  return value;
};

// Callers supply a codec-validated scene and its matching fingerprint. This envelope
// neither validates model semantics nor recomputes the fingerprint. It freezes the
// snapshot in place; pass an already-frozen codec scene or an owned snapshot.
export function createRenderRequest({ requestId, jobId, viewId, sceneSnapshot, sceneHash, output, quality, generation, keys }) {
  if (!isPlainObject(sceneSnapshot)) throw new RenderRequestError('sceneSnapshot must be a scene');
  if (!RENDER_PURPOSES.includes(output?.purpose)) throw new RenderRequestError(`output.purpose must be one of ${RENDER_PURPOSES.join(', ')}`);
  const width = requireCount(output.width, 'output.width', MAX_OUTPUT_DIMENSION);
  const height = requireCount(output.height, 'output.height', MAX_OUTPUT_DIMENSION);
  if (!width || !height) throw new RenderRequestError('output dimensions must be positive');
  if (!isPlainObject(quality)) throw new RenderRequestError('quality must be an object');
  const frozenGeneration = {};
  for (const name of REVISIONS) frozenGeneration[name] = requireCount(generation?.[name], `generation.${name}`);
  return deepFreeze({
    requestId: requireString(requestId, 'requestId'), jobId: requireString(jobId, 'jobId'), viewId: requireString(viewId, 'viewId'),
    sceneSnapshot, sceneHash: requireString(sceneHash, 'sceneHash'),
    output: { width, height, purpose: output.purpose },
    quality: structuredClone(quality),
    generation: frozenGeneration,
    keys: { geometryKey: requireString(keys?.geometryKey, 'keys.geometryKey'), appearanceKey: requireString(keys?.appearanceKey, 'keys.appearanceKey') },
  });
}

// Publishable only if the device epoch, view revision and dependency revisions all still match.
export function isPublishable(request, current) {
  return REVISIONS.every(name => request.generation[name] === current[name]);
}

export const RENDER_OUTCOMES = Object.freeze(['completed', 'superseded', 'cancelled', 'interrupted', 'failed', 'budget-exceeded']);
