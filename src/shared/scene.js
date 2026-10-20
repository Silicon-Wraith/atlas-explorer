// Scene envelope, canonical serialization and fingerprints (spec §5).
// Workspace-independent: model-specific fields are validated by registered model codecs.
export const APPLICATION = 'ATLAS';
export const SCENE_SCHEMA = 'atlas.scene';
export const SCENE_SCHEMA_VERSION = 1;
export const APPLICATION_VERSION = '1.0.0';
// The default admission limit; each codec is configured with its own (createSceneCodec maxSceneBytes).
export const DEFAULT_MAX_SCENE_BYTES = 2_000_000;

const ENVELOPE_KEYS = ['application', 'schema', 'schemaVersion', 'applicationVersion', 'workspace', 'model', 'conventions', 'parameters', 'camera', 'slices', 'iteration', 'tracing', 'appearance', 'sampling', 'provenance'];
export const MODEL_FIELDS = Object.freeze(['conventions', 'parameters', 'camera', 'slices', 'iteration', 'tracing', 'appearance', 'sampling']);

export class SceneError extends Error {
  constructor(code, message, path = '') {
    super(path ? `${path}: ${message}` : message);
    this.name = 'SceneError';
    this.code = code;
    this.path = path;
  }
}

export const isPlainObject = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

// Deterministic JSON: object keys sorted by code unit, arrays in order, finite numbers only, −0 written as 0.
export function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new SceneError('invalid-value', 'numbers must be finite');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map(key => {
      if (value[key] === undefined) throw new SceneError('invalid-value', `undefined value at ${key}`);
      return `${JSON.stringify(key)}:${canonicalJson(value[key])}`;
    }).join(',')}}`;
  }
  throw new SceneError('invalid-value', `cannot serialize a ${typeof value}`);
}

export const utf8Bytes = text => new TextEncoder().encode(text);

// FNV-1a over the UTF-8 bytes, modulo 2^64. An identifier, not authentication.
export function fnv1a64(text) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of utf8Bytes(text)) hash = ((hash ^ BigInt(byte)) * 0x100000001b3n) & 0xffffffffffffffffn;
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

export function requireObject(value, path, keys) {
  if (!isPlainObject(value)) throw new SceneError('invalid-value', 'must be an object', path);
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new SceneError('unknown-field', `unknown field ${key}`, path);
  for (const key of keys) if (!(key in value)) throw new SceneError('missing-field', `missing field ${key}`, path);
  return value;
}

// maxSceneBytes bounds both the input text and the canonical serialization, in UTF-8 bytes.
// It is admission policy: it never enters scene data or fingerprints.
export function createSceneCodec({ modelCodecs, maxSceneBytes = DEFAULT_MAX_SCENE_BYTES }) {
  if (!Number.isSafeInteger(maxSceneBytes) || maxSceneBytes <= 0) throw new RangeError(`maxSceneBytes must be a positive safe integer, not ${String(maxSceneBytes)}`);
  const registered = [...modelCodecs];

  function validate(input, depth = 0) {
    if (!isPlainObject(input)) throw new SceneError('invalid-value', 'a scene must be an object');
    if (input.application !== APPLICATION || input.schema !== SCENE_SCHEMA) throw new SceneError('unsupported-format', 'not an ATLAS scene');
    if (input.schemaVersion !== SCENE_SCHEMA_VERSION) throw new SceneError('unsupported-version', `scene schema version ${JSON.stringify(input.schemaVersion)} is not supported`, 'schemaVersion');
    requireObject(input, '', ENVELOPE_KEYS);
    if (typeof input.applicationVersion !== 'string' || !input.applicationVersion || input.applicationVersion.length > 64) throw new SceneError('invalid-value', 'must be a short string', 'applicationVersion');
    const model = requireObject(input.model, 'model', ['id', 'version']);
    if (typeof model.id !== 'string') throw new SceneError('invalid-value', 'must be a string', 'model.id');
    if (!Number.isInteger(model.version)) throw new SceneError('invalid-value', 'must be an integer', 'model.version');
    const codec = registered.find(candidate => candidate.id === model.id && candidate.version === model.version);
    if (!codec) throw new SceneError('unsupported-model', `model ${JSON.stringify(model.id)}@${JSON.stringify(model.version)} is not supported`, 'model');
    if (input.workspace !== codec.workspace) throw new SceneError('invalid-value', `must be ${codec.workspace}`, 'workspace');
    const provenanceIn = input.provenance;
    if (!isPlainObject(provenanceIn)) throw new SceneError('invalid-value', 'must be an object', 'provenance');
    for (const key of Object.keys(provenanceIn)) if (key !== 'createdBy' && key !== 'bridgedFrom') throw new SceneError('unknown-field', `unknown field ${key}`, 'provenance');
    if (provenanceIn.createdBy !== 'atlas') throw new SceneError('invalid-value', 'must be "atlas"', 'provenance.createdBy');
    const provenance = { createdBy: 'atlas' };
    if ('bridgedFrom' in provenanceIn) {
      if (depth > 0) throw new SceneError('invalid-value', 'a bridged scene cannot itself be bridged', 'provenance.bridgedFrom');
      provenance.bridgedFrom = validate(provenanceIn.bridgedFrom, depth + 1);
    }
    const fields = codec.validateModel(input);
    for (const key of MODEL_FIELDS) if (!(key in fields)) throw new SceneError('invalid-value', `model codec omitted ${key}`);
    const scene = {
      application: APPLICATION, schema: SCENE_SCHEMA, schemaVersion: SCENE_SCHEMA_VERSION,
      applicationVersion: input.applicationVersion, workspace: codec.workspace,
      model: { id: codec.id, version: codec.version }, ...fields, provenance,
    };
    if (utf8Bytes(canonicalJson(scene)).length > maxSceneBytes) throw new SceneError('too-large', `the scene serializes to more than ${maxSceneBytes} bytes`);
    return deepFreeze(scene);
  }

  const serialize = scene => canonicalJson(scene);

  function parse(text) {
    if (typeof text !== 'string') throw new SceneError('invalid-value', 'scene text must be a string');
    if (utf8Bytes(text).length > maxSceneBytes) throw new SceneError('too-large', `scene text exceeds ${maxSceneBytes} bytes`);
    let data;
    try { data = JSON.parse(text); } catch { throw new SceneError('invalid-json', 'scene text is not valid JSON'); }
    return validate(data);
  }

  function fingerprint(scene) {
    const canonical = serialize(scene);
    return { canonical, sceneHash: fnv1a64(canonical) };
  }

  return Object.freeze({ maxSceneBytes, validate: input => validate(input), parse, serialize, fingerprint, equal: (a, b) => serialize(a) === serialize(b) });
}
