// Space scene codecs (spec §5, §10.1, §11, §14). Only requested data is
// serialized. Field evaluation, navigation arithmetic and rendering stay outside.
import {
  createSceneCodec, SceneError, requireObject, isPlainObject, deepFreeze, utf8Bytes,
  APPLICATION, SCENE_SCHEMA, SCENE_SCHEMA_VERSION, APPLICATION_VERSION,
} from '../shared/scene.js';
// B11 moves these definitions into shared/palettes.js and preserves this re-export.
import { PALETTES } from '../plane/palettes.js';
import { ANCHOR_LIMITS, parseAnchorDecimal, effectiveParameters } from './numerics/parameters.js';

export const SPACE_CONVENTIONS = 'atlas-space-rh-zup-abcd-v1';
export const SPACE_MODELS = deepFreeze(['sphere', 'box', 'menger', 'mandelbulb', 'quaternion-julia'].map(id => ({ id, version: 1 })));
export const CAMERA_KIND = 'anchored-perspective-v1';
export const CAMERA_LIMITS = deepFreeze({ anchorDigits: ANCHOR_LIMITS.digits, anchorExponent: ANCHOR_LIMITS.exponent, exponent: [-1074, 1023], localMagnitude: 2 ** 20, fovDegrees: [10, 120] });
export const TRACING_PROFILE = 'surface-v1';
export const TRACING_LIMITS = deepFreeze({ maxIterations: [1, 512], maxSteps: [1, 1024], targetSamples: [1, 64] });
export const VIEW_MODES = Object.freeze(['shaded', 'normals', 'depth', 'steps', 'termination']);
export const SPACE_DEFAULTS = deepFreeze({
  camera: {
    kind: CAMERA_KIND, anchor: ['0', '0', '0'], scale: { mantissa: 1, exponent: 0 },
    positionLocal: [1.92, -1.44, 0.7], focusLocal: [0, 0, 0],
    // Rotates canonical forward (0,0,-1) toward the origin; right is horizontal.
    orientationWxyz: [8, 6, 3, 4].map(value => value / Math.sqrt(125)), verticalFovDegrees: 60,
  },
  iteration: { maxIterations: 128, bailoutPolicy: 'model-default' },
  tracing: { profile: TRACING_PROFILE, maxSteps: 512, stepMultiplier: 0.9 },
  appearance: { material: 'neutral', palette: 'ember', lighting: 'inspection', lightingQuality: 'full', fog: { enabled: false }, viewMode: 'shaded' },
  sampling: { seed: 1, sequence: 'atlas-aa-v1', targetSamples: 8 }, slices: [],
});
const DEFAULT_PARAMETERS = deepFreeze({
  sphere: {}, box: {}, menger: { depth: 1 }, mandelbulb: { power: '8' },
  'quaternion-julia': { C: ['-0.2', '0.8', '0', '0'], kappa: '0' },
});
const invalid = (message, path) => { throw new SceneError('invalid-value', message, path); };
function range(value, min, max, path) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) invalid(`must be a finite number in [${min}, ${max}]`, path);
  return value;
}
function integer(value, min, max, path) {
  range(value, min, max, path);
  if (!Number.isSafeInteger(value)) invalid('must be an integer', path);
  return value;
}
function oneOf(value, choices, path) {
  if (!choices.includes(value)) invalid(`must be one of ${choices.join(', ')}`, path);
  return value;
}
function vector(value, length, path, check) {
  if (!Array.isArray(value) || value.length !== length) invalid(`must contain ${length} components`, path);
  return Array.from({ length }, (_, i) => check(value[i], `${path}[${i}]`));
}

function localVector(value, path) {
  const result = vector(value, 3, path, (component, componentPath) => range(component, -CAMERA_LIMITS.localMagnitude, CAMERA_LIMITS.localMagnitude, componentPath));
  if (Math.hypot(...result) > CAMERA_LIMITS.localMagnitude) invalid(`vector magnitude exceeds ${CAMERA_LIMITS.localMagnitude}`, path);
  return result;
}
function validateCamera(value) {
  const path = 'camera';
  requireObject(value, path, ['kind', 'anchor', 'scale', 'positionLocal', 'focusLocal', 'orientationWxyz', 'verticalFovDegrees']);
  oneOf(value.kind, [CAMERA_KIND], 'camera.kind');
  const anchor = vector(value.anchor, 3, 'camera.anchor', (text, path) => { parseAnchorDecimal(text, path); return text; });
  requireObject(value.scale, 'camera.scale', ['mantissa', 'exponent']);
  const mantissa = range(value.scale.mantissa, 1, 2, 'camera.scale.mantissa');
  if (mantissa === 2) invalid('normalized scale mantissa must be in [1, 2)', 'camera.scale.mantissa');
  const exponent = integer(value.scale.exponent, ...CAMERA_LIMITS.exponent, 'camera.scale.exponent');
  const positionLocal = localVector(value.positionLocal, 'camera.positionLocal');
  const focusLocal = localVector(value.focusLocal, 'camera.focusLocal');
  const orientationWxyz = vector(value.orientationWxyz, 4, 'camera.orientationWxyz', (component, componentPath) => range(component, -Number.MAX_VALUE, Number.MAX_VALUE, componentPath));
  if (Math.abs(Math.hypot(...orientationWxyz) - 1) > 1e-6) invalid('must be a unit quaternion within 1e-6', 'camera.orientationWxyz');
  return { kind: CAMERA_KIND, anchor, scale: { mantissa, exponent }, positionLocal, focusLocal, orientationWxyz,
    verticalFovDegrees: range(value.verticalFovDegrees, ...CAMERA_LIMITS.fovDegrees, 'camera.verticalFovDegrees') };
}

function validateModel(modelId, input) {
  oneOf(input.conventions, [SPACE_CONVENTIONS], 'conventions');
  const parameters = effectiveParameters(modelId, input.parameters).requested;
  const camera = validateCamera(input.camera);
  if (!Array.isArray(input.slices) || input.slices.length !== 0) invalid('must be an empty list in 1b.1', 'slices');
  const iteration = requireObject(input.iteration, 'iteration', ['maxIterations', 'bailoutPolicy']);
  const validatedIteration = {
    maxIterations: integer(iteration.maxIterations, ...TRACING_LIMITS.maxIterations, 'iteration.maxIterations'),
    bailoutPolicy: oneOf(iteration.bailoutPolicy, ['model-default'], 'iteration.bailoutPolicy'),
  };
  const tracing = requireObject(input.tracing, 'tracing', ['profile', 'maxSteps', 'stepMultiplier']);
  const validatedTracing = {
    profile: oneOf(tracing.profile, [TRACING_PROFILE], 'tracing.profile'),
    maxSteps: integer(tracing.maxSteps, ...TRACING_LIMITS.maxSteps, 'tracing.maxSteps'),
    stepMultiplier: oneOf(tracing.stepMultiplier, [0.9], 'tracing.stepMultiplier'),
  };
  const appearance = requireObject(input.appearance, 'appearance', ['material', 'palette', 'lighting', 'lightingQuality', 'fog', 'viewMode']);
  const validatedAppearance = {
    material: oneOf(appearance.material, ['neutral'], 'appearance.material'),
    palette: oneOf(appearance.palette, PALETTES.map(palette => palette.id), 'appearance.palette'),
    lighting: oneOf(appearance.lighting, ['inspection'], 'appearance.lighting'),
    lightingQuality: oneOf(appearance.lightingQuality, ['direct', 'full'], 'appearance.lightingQuality'),
  };
  // Enabled fog is an invalid request even if it includes future fog fields.
  if (!isPlainObject(appearance.fog) || appearance.fog.enabled !== false) invalid('fog must be disabled in 1b.1', 'appearance.fog');
  requireObject(appearance.fog, 'appearance.fog', ['enabled']);
  validatedAppearance.fog = { enabled: false };
  validatedAppearance.viewMode = oneOf(appearance.viewMode, VIEW_MODES, 'appearance.viewMode');
  const sampling = requireObject(input.sampling, 'sampling', ['seed', 'sequence', 'targetSamples']);
  return {
    conventions: SPACE_CONVENTIONS, parameters, camera, slices: [], iteration: validatedIteration, tracing: validatedTracing,
    appearance: validatedAppearance,
    sampling: {
      seed: integer(sampling.seed, 0, 0xffffffff, 'sampling.seed'),
      sequence: oneOf(sampling.sequence, ['atlas-aa-v1'], 'sampling.sequence'),
      targetSamples: integer(sampling.targetSamples, ...TRACING_LIMITS.targetSamples, 'sampling.targetSamples'),
    },
  };
}

export const spaceModelCodecs = deepFreeze(SPACE_MODELS.map(model => ({ workspace: 'space', ...model, validateModel: input => validateModel(model.id, input) })));

// As with Plane, every method closes over one configured shared scene codec.
// Native creation supplies whole omitted sections; file imports supply none.
export function createSpaceSceneAdapter({ maxSceneBytes } = {}) {
  const sceneCodec = createSceneCodec({ modelCodecs: spaceModelCodecs, maxSceneBytes });
  function createSpaceScene({ model, parameters = DEFAULT_PARAMETERS[model], camera = SPACE_DEFAULTS.camera,
    iteration = SPACE_DEFAULTS.iteration, tracing = SPACE_DEFAULTS.tracing,
    appearance = SPACE_DEFAULTS.appearance, sampling = SPACE_DEFAULTS.sampling }) {
    if (typeof model !== 'string') invalid('must name a Space model', 'model');
    return sceneCodec.validate({
      application: APPLICATION, schema: SCENE_SCHEMA, schemaVersion: SCENE_SCHEMA_VERSION, applicationVersion: APPLICATION_VERSION,
      workspace: 'space', model: { id: model, version: 1 }, conventions: SPACE_CONVENTIONS,
      parameters, camera, slices: [], iteration, tracing, appearance, sampling, provenance: { createdBy: 'atlas' },
    });
  }
  function encodeSceneFile(scene) {
    const canonical = sceneCodec.serialize(sceneCodec.validate(scene));
    const pretty = `${JSON.stringify(JSON.parse(canonical), null, 2)}\n`;
    return utf8Bytes(pretty).length <= sceneCodec.maxSceneBytes ? pretty : canonical;
  }
  return Object.freeze({ sceneCodec, createSpaceScene, encodeSceneFile, decodeSceneFile: text => sceneCodec.parse(text) });
}

const defaultAdapter = createSpaceSceneAdapter();
export const { sceneCodec, createSpaceScene, encodeSceneFile, decodeSceneFile } = defaultAdapter;
export const SPACE_INITIAL_SCENE = createSpaceScene({ model: 'mandelbulb' });
