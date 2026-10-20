// Plane ↔ scene (spec §5.2, §12, §14): the plane-mandelbrot@1 model codec, the
// detail/zoom iteration policy, native share links and native scene files.
import { PALETTES } from './palettes.js';
import { INITIAL_VIEW, validateView } from './math.js';
import { createSceneCodec, canonicalJson, SceneError, requireObject, utf8Bytes, MAX_SCENE_BYTES, APPLICATION_VERSION } from '../shared/scene.js';

export const PLANE_MODEL = Object.freeze({ id: 'plane-mandelbrot', version: 1 });
export const PLANE_CONVENTIONS = 'atlas-plane-v1';
export const PLANE_ITERATION_POLICY = 'plane-detail-zoom-v1';
export const DETAIL_LEVELS = Object.freeze([512, 1024, 2048, 4096, 8192, 16384]);
export const PLANE_DEFAULTS = Object.freeze({ palette: 'ember', phase: 0.11, frequency: 1, relief: 1, detail: 1 });
// Resource budget for exact decimal coordinates, checked lexically, before anything is
// materialized: the mantissa has at most this many digits, the required precision
// (precisionFor(zoom) = ceil(zoom) + 36) is at most this many digits, and the fixed-point
// scaling power |precision + exponent − fraction digits| is at most this many digits. So every
// fixed-point value math.js materializes has at most 2 × 200,000 decimal digits.
export const DECIMAL_BUDGET_DIGITS = 200_000;
export const MAX_PLANE_ZOOM = DECIMAL_BUDGET_DIGITS - 36;
const MIN_PLANE_ZOOM = -0.6;
const DECIMAL = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?)(\d+))?$/i;

export function planeIterations(detail, zoom) {
  return DETAIL_LEVELS[detail] + Math.max(0, Math.ceil((zoom - 3) * 32));
}

// Lexical parts of a decimal string; never converts it to a number or BigInt.
function decimalParts(text, path) {
  if (typeof text !== 'string') throw new SceneError('invalid-value', 'must be a decimal string', path);
  const match = text.match(DECIMAL);
  if (!match || !(match[2] || match[3])) throw new SceneError('invalid-value', 'must be a decimal string', path);
  const digits = match[2].length + (match[3] || '').length;
  if (digits > DECIMAL_BUDGET_DIGITS) throw new SceneError('resource-limit', `has ${digits} digits; the budget is ${DECIMAL_BUDGET_DIGITS}`, path);
  const exponentDigits = (match[5] || '0').replace(/^0+(?=\d)/, '');
  if (exponentDigits.length > String(DECIMAL_BUDGET_DIGITS).length || Number(exponentDigits) > DECIMAL_BUDGET_DIGITS) throw new SceneError('resource-limit', `exponent exceeds the ${DECIMAL_BUDGET_DIGITS}-digit budget`, path);
  return { exponent: (match[4] === '-' ? -1 : 1) * Number(exponentDigits), fractionDigits: (match[3] || '').length };
}

export function checkDecimal(text, path) { decimalParts(text, path); return text; }

// The fixed-point scaling power math.js would use for this coordinate at this zoom.
function checkExpansion(text, zoom, path) {
  const { exponent, fractionDigits } = decimalParts(text, path);
  const power = Math.max(40, Math.ceil(zoom) + 36) + exponent - fractionDigits;
  if (Math.abs(power) > DECIMAL_BUDGET_DIGITS) throw new SceneError('resource-limit', `needs a ${Math.abs(power)}-digit fixed-point expansion; the budget is ${DECIMAL_BUDGET_DIGITS}`, path);
  return text;
}

// The pure lexical and resource preflight. Every entry path runs it before validateView, fixed
// or anything else that materializes fixed-point values. It never rewrites the text.
export function preflightView(input) {
  if (!input || typeof input !== 'object') throw new SceneError('invalid-value', 'a view must be an object');
  const zoom = input.zoom;
  if (typeof zoom !== 'number' || !Number.isFinite(zoom)) throw new SceneError('invalid-value', 'must be a finite number', 'zoom');
  if (zoom > MAX_PLANE_ZOOM) throw new SceneError('resource-limit', `zoom exceeds ${MAX_PLANE_ZOOM}, the limit of the decimal budget`, 'zoom');
  checkExpansion(input.re, zoom, 're');
  checkExpansion(input.im, zoom, 'im');
  return input;
}

// Coordinate entry and jumps: the preflight first, then the existing coordinate-entry bounds.
export function admitEnteredView(input, validate = validateView) {
  preflightView(input);
  return validate(input);
}

function checkRange(value, min, max, path) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new SceneError('invalid-value', `must be a number in [${min}, ${max}]`, path);
  return Object.is(value, -0) ? 0 : value;
}

function validateModel(input) {
  if (input.conventions !== PLANE_CONVENTIONS) throw new SceneError('invalid-value', `must be ${PLANE_CONVENTIONS}`, 'conventions');
  requireObject(input.parameters, 'parameters', []);
  if (!Array.isArray(input.slices) || input.slices.length) throw new SceneError('invalid-value', 'must be an empty list', 'slices');
  if (input.tracing !== null) throw new SceneError('invalid-value', 'must be null for Plane', 'tracing');
  const sampling = requireObject(input.sampling, 'sampling', ['seed', 'sequence', 'targetSamples']);
  if (sampling.seed !== 0 || sampling.sequence !== 'plane-single-v1' || sampling.targetSamples !== 1) throw new SceneError('invalid-value', 'must be { seed: 0, sequence: "plane-single-v1", targetSamples: 1 }', 'sampling');
  const camera = requireObject(input.camera, 'camera', ['re', 'im', 'zoom']);
  if (typeof camera.zoom === 'number' && camera.zoom > MAX_PLANE_ZOOM) throw new SceneError('resource-limit', `zoom exceeds ${MAX_PLANE_ZOOM}, the limit of the decimal budget`, 'camera.zoom');
  const zoom = checkRange(camera.zoom, MIN_PLANE_ZOOM, MAX_PLANE_ZOOM, 'camera.zoom');
  const iteration = requireObject(input.iteration, 'iteration', ['policy', 'detail']);
  if (iteration.policy !== PLANE_ITERATION_POLICY) throw new SceneError('invalid-value', `must be ${PLANE_ITERATION_POLICY}`, 'iteration.policy');
  if (!Number.isInteger(iteration.detail) || iteration.detail < 0 || iteration.detail > 5) throw new SceneError('invalid-value', 'must be an integer from 0 to 5', 'iteration.detail');
  const appearance = requireObject(input.appearance, 'appearance', ['palette', 'phase', 'frequency', 'relief']);
  if (!PALETTES.some(palette => palette.id === appearance.palette)) throw new SceneError('invalid-value', 'must name a registered palette', 'appearance.palette');
  return {
    conventions: PLANE_CONVENTIONS, parameters: {}, slices: [], tracing: null,
    sampling: { seed: 0, sequence: 'plane-single-v1', targetSamples: 1 },
    camera: { re: checkExpansion(camera.re, zoom, 'camera.re'), im: checkExpansion(camera.im, zoom, 'camera.im'), zoom },
    iteration: { policy: PLANE_ITERATION_POLICY, detail: iteration.detail },
    appearance: {
      palette: appearance.palette,
      phase: checkRange(appearance.phase, 0, 1, 'appearance.phase'),
      frequency: checkRange(appearance.frequency, 0.2, 2.5, 'appearance.frequency'),
      relief: checkRange(appearance.relief, 0, 1, 'appearance.relief'),
    },
  };
}

export const planeModelCodec = Object.freeze({ workspace: 'plane', ...PLANE_MODEL, validateModel });
export const sceneCodec = createSceneCodec({ modelCodecs: [planeModelCodec] });

// Native creation may use documented defaults; loading never does (sceneCodec.validate).
export function createPlaneScene({ view, settings = {}, applicationVersion = APPLICATION_VERSION }) {
  const merged = { ...PLANE_DEFAULTS, ...settings };
  return sceneCodec.validate({
    application: 'ATLAS', schema: 'atlas.scene', schemaVersion: 1, applicationVersion,
    workspace: 'plane', model: { ...PLANE_MODEL }, conventions: PLANE_CONVENTIONS,
    parameters: {}, camera: { re: view.re, im: view.im, zoom: view.zoom }, slices: [],
    iteration: { policy: PLANE_ITERATION_POLICY, detail: merged.detail }, tracing: null,
    appearance: { palette: merged.palette, phase: merged.phase, frequency: merged.frequency, relief: merged.relief },
    sampling: { seed: 0, sequence: 'plane-single-v1', targetSamples: 1 },
    provenance: { createdBy: 'atlas' },
  });
}

export const PLANE_INITIAL_SCENE = createPlaneScene({ view: INITIAL_VIEW });

// The renderer-facing state; iterations always come from the named policy.
export function toPlaneState(scene) {
  const { camera, appearance, iteration } = scene;
  return {
    view: { re: camera.re, im: camera.im, zoom: camera.zoom },
    settings: { ...appearance, detail: iteration.detail, iterations: planeIterations(iteration.detail, camera.zoom) },
  };
}

// Resolved pass inputs for render keys: geometry vs appearance (spec §7.2).
export function planeDependencies(scene) {
  return {
    geometry: canonicalJson({ model: scene.model, camera: scene.camera, iteration: scene.iteration }),
    appearance: canonicalJson(scene.appearance),
  };
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new SceneError('invalid-link', 'the link payload is not base64url');
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export const SHARE_PREFIX = '#scene=';
const MAX_LINK_PAYLOAD = Math.ceil(MAX_SCENE_BYTES * 4 / 3) + 4;

export function encodeShareHash(scene) {
  return SHARE_PREFIX + base64UrlEncode(utf8Bytes(sceneCodec.serialize(scene)));
}

// → { kind: 'none' } | { kind: 'scene', scene } | { kind: 'unsupported', error: SceneError }
export function decodeShareHash(hash) {
  if (!hash || hash === '#') return { kind: 'none' };
  try {
    if (!hash.startsWith(SHARE_PREFIX)) {
      const earlier = new URLSearchParams(hash.slice(1)).has('re');
      throw new SceneError(earlier ? 'earlier-format' : 'unrecognized-link', earlier ? 'this link is from an earlier ATLAS format' : 'this link is not an ATLAS scene link');
    }
    const payload = hash.slice(SHARE_PREFIX.length);
    if (payload.length > MAX_LINK_PAYLOAD) throw new SceneError('too-large', 'the link is too large');
    const bytes = base64UrlDecode(payload);
    if (bytes.length > MAX_SCENE_BYTES) throw new SceneError('too-large', 'the link is too large');
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new SceneError('invalid-link', 'the link payload is not UTF-8'); }
    return { kind: 'scene', scene: sceneCodec.parse(text) };
  } catch (error) {
    if (error instanceof SceneError) return { kind: 'unsupported', error };
    return { kind: 'unsupported', error: new SceneError('invalid-link', error.message) };
  }
}

// Pretty-printed when that fits the import limit; otherwise the canonical form, which admission bounds.
export function encodeSceneFile(scene) {
  const canonical = sceneCodec.serialize(scene);
  const pretty = `${JSON.stringify(JSON.parse(canonical), null, 2)}\n`;
  return utf8Bytes(pretty).length <= MAX_SCENE_BYTES ? pretty : canonical;
}

export function decodeSceneFile(text) {
  if (typeof text === 'string' && utf8Bytes(text).length <= MAX_SCENE_BYTES) {
    let data = null;
    try { data = JSON.parse(text); } catch { /* reported by sceneCodec.parse */ }
    if (data && data.application === 'ATLAS' && data.version === 1 && !('schema' in data)) throw new SceneError('unsupported-format', 'this location file is from an earlier ATLAS format');
  }
  return sceneCodec.parse(text);
}
