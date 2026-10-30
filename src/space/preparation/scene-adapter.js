// Portable requested prepared scenes. Coverage/clearance admission is separate.
import { createSceneCodec, requireObject, canonicalJson, SceneError, deepFreeze, utf8Bytes,
  APPLICATION, APPLICATION_VERSION, SCENE_SCHEMA, SCENE_SCHEMA_VERSION } from '../../shared/scene.js';
import { createWorldRecord, worldReference } from './contract.js';
import { PREPARED_CAMERA_KIND, PREPARED_CONVENTION, createPreparedPoseModel } from './pose.js';
import { createSpatialGrid } from './spatial-grid.js';

export const PREPARED_MODEL = Object.freeze({ id: 'prepared-world', version: 1 });
const cameraFields = ['kind', 'originM', 'positionLocalM', 'orientationWxyz', 'bodyDiameterM', 'verticalFovDegrees'];
const knownWorlds = new WeakSet();
const invalid = (message, path = '') => { throw new SceneError('invalid-value', message, path); };
function vector(value, length, path) {
  if (!Array.isArray(value) || value.length !== length || !Array.from(value).every(Number.isFinite)) invalid(`${length} finite components required`, path);
  return [...value];
}
function worldValue(value) {
  if (knownWorlds.has(value)) return value;
  requireObject(value, 'parameters.world', ['id', 'generator', 'parameters', 'assets', 'lineage', 'definitionKey']);
  const { definitionKey, ...definition } = value, checked = createWorldRecord(definition);
  if (definitionKey !== checked.definitionKey) invalid('world definition key mismatch', 'parameters.world');
  knownWorlds.add(checked); return checked;
}
function cameraValue(value) {
  requireObject(value, 'camera', cameraFields);
  if (value.kind !== PREPARED_CAMERA_KIND) invalid('unsupported prepared camera', 'camera.kind');
  const originM = vector(value.originM, 3, 'camera.originM'), positionLocalM = vector(value.positionLocalM, 3, 'camera.positionLocalM');
  const orientationWxyz = vector(value.orientationWxyz, 4, 'camera.orientationWxyz');
  if (Math.abs(Math.hypot(...orientationWxyz) - 1) > 1e-6) invalid('unit quaternion required', 'camera.orientationWxyz');
  const { bodyDiameterM, verticalFovDegrees } = value;
  if (!Number.isFinite(bodyDiameterM) || bodyDiameterM <= 0) invalid('positive finite body diameter required', 'camera.bodyDiameterM');
  if (!Number.isFinite(verticalFovDegrees) || verticalFovDegrees < 10 || verticalFovDegrees > 120) invalid('FOV must be in [10,120]', 'camera.verticalFovDegrees');
  if (originM.some((x, i) => !Number.isFinite(x + positionLocalM[i]))) invalid('finite absolute position required', 'camera');
  const roundoff = 4 * Number.EPSILON * (1 + Math.max(...originM.map(Math.abs)) + Math.max(...positionLocalM.map(Math.abs)));
  if (!Number.isFinite(roundoff) || roundoff >= 1e-8 * bodyDiameterM) invalid('prepared numerical budget exceeded', 'camera');
  return { kind: PREPARED_CAMERA_KIND, originM, positionLocalM, orientationWxyz, bodyDiameterM, verticalFovDegrees };
}
export function cameraFromPreparedPose(pose) {
  return Object.fromEntries(cameraFields.map(key => [key, pose[key]]));
}
export function equalPreparedCameras(a, b) {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind || a.bodyDiameterM !== b.bodyDiameterM || a.verticalFovDegrees !== b.verticalFovDegrees) return false;
  if (['originM', 'positionLocalM'].some(key => a[key].some((x, i) => x !== b[key][i]))) return false;
  return [1, -1].some(sign => a.orientationWxyz.every((x, i) => Math.abs(x - sign * b.orientationWxyz[i]) <= 8 * Number.EPSILON));
}
const validateModel = input => {
  if (input.conventions !== PREPARED_CONVENTION) invalid('unsupported prepared convention', 'conventions');
  requireObject(input.parameters, 'parameters', ['world']);
  const world = worldValue(input.parameters.world), camera = cameraValue(input.camera);
  if (!Array.isArray(input.slices) || input.slices.length || input.iteration !== null) invalid('prepared scenes require empty slices and null iteration');
  requireObject(input.tracing, 'tracing', ['profile', 'coverageProfile', 'maxErrorFraction']);
  if (input.tracing.profile !== 'prepared-triangles-v1' || input.tracing.coverageProfile !== 'pc2-half-d-r1' || input.tracing.maxErrorFraction !== .01) invalid('unsupported prepared tracing policy', 'tracing');
  requireObject(input.appearance, 'appearance', ['material', 'lighting', 'lightDirection']);
  if (input.appearance.material !== 'neutral' || input.appearance.lighting !== 'pc2-lambert-v1') invalid('unsupported prepared appearance', 'appearance');
  const lightDirection = vector(input.appearance.lightDirection, 3, 'appearance.lightDirection');
  if (Math.abs(Math.hypot(...lightDirection) - 1) > 1e-6) invalid('unit light direction required', 'appearance.lightDirection');
  requireObject(input.sampling, 'sampling', ['profile']);
  if (input.sampling.profile !== 'retained-native-r1') invalid('unsupported prepared sampling', 'sampling');
  return { conventions: PREPARED_CONVENTION, parameters: { world }, camera, slices: [], iteration: null,
    tracing: { ...input.tracing }, appearance: { ...input.appearance, lightDirection }, sampling: { ...input.sampling } };
};
export const preparedModelCodec = Object.freeze({ ...PREPARED_MODEL, workspace: 'space', validateModel });
export function createPreparedSceneAdapter({ maxSceneBytes } = {}) {
  const sceneCodec = createSceneCodec({ modelCodecs: [preparedModelCodec], maxSceneBytes });
  function createPreparedScene({ world, pose, lightDirection }) {
    if (pose.kind !== PREPARED_CAMERA_KIND || pose.conventions !== PREPARED_CONVENTION || canonicalJson(pose.world) !== canonicalJson(worldReference(world))) invalid('pose/world convention mismatch');
    return sceneCodec.validate({ application: APPLICATION, applicationVersion: APPLICATION_VERSION, schema: SCENE_SCHEMA, schemaVersion: SCENE_SCHEMA_VERSION,
      workspace: 'space', model: PREPARED_MODEL, conventions: PREPARED_CONVENTION, parameters: { world }, camera: cameraFromPreparedPose(pose), slices: [], iteration: null,
      tracing: { profile: 'prepared-triangles-v1', coverageProfile: 'pc2-half-d-r1', maxErrorFraction: .01 },
      appearance: { material: 'neutral', lighting: 'pc2-lambert-v1', lightDirection }, sampling: { profile: 'retained-native-r1' }, provenance: { createdBy: 'atlas' } });
  }
  function encodeSceneFile(scene) {
    const value = sceneCodec.validate(scene), canonical = sceneCodec.serialize(value), pretty = JSON.stringify(JSON.parse(canonical), null, 2) + '\n';
    return utf8Bytes(pretty).length <= sceneCodec.maxSceneBytes ? pretty : canonical;
  }
  return Object.freeze({ sceneCodec, createPreparedScene, encodeSceneFile, decodeSceneFile: sceneCodec.parse });
}
export const { sceneCodec, createPreparedScene, encodeSceneFile, decodeSceneFile } = createPreparedSceneAdapter();
export function poseFromPreparedScene(input) {
  const scene = sceneCodec.validate(input);
  return deepFreeze({ ...scene.camera, conventions: PREPARED_CONVENTION, world: worldReference(scene.parameters.world) });
}
export function admitPreparedScene(input, setup, poseModel = createPreparedPoseModel({ world: setup.world, grid: createSpatialGrid(setup.grid), fineBounds: setup.fineBounds })) {
  const scene = sceneCodec.validate(input);
  if (canonicalJson(scene.parameters.world) !== canonicalJson(setup.world)) throw new SceneError('unsupported-world', 'This Landscape world is not available from the current preparer.');
  if (canonicalJson(scene.appearance.lightDirection) !== canonicalJson(setup.feature.light)) throw new SceneError('unsupported-policy', 'This Landscape lighting policy is not available.');
  return poseModel.validate(poseFromPreparedScene(scene));
}
