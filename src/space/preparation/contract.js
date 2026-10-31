// GPU-independent prepared-region records. This does not register a scene model.
import { canonicalJson, deepFreeze, fnv1a64, isPlainObject } from '../../shared/scene.js';

export const PREPARATION_VERSION = 1;
export const IDENTITY_FORMAT = 'atlas-canonical-json-v1/fnv1a64';
export class PreparationError extends Error {
  constructor(message) { super(message); this.name = 'PreparationError'; this.code = 'invalid-preparation'; }
}
const invalid = message => { throw new PreparationError(message); };
function object(value, keys, name) {
  if (!isPlainObject(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) invalid(`${name} requires exactly ${keys.join(', ')}`);
  return value;
}
function text(value, name) {
  if (typeof value !== 'string' || !value.trim()) invalid(`${name} must be a non-empty string`);
  return value;
}
function count(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) invalid(`${name} must be a nonnegative safe integer`);
  return value;
}
function number(value, name, positive = false) {
  if (!Number.isFinite(value) || value < 0 || (positive && value === 0)) invalid(`${name} must be finite and ${positive ? 'positive' : 'nonnegative'}`);
  return value;
}
function vector(value, name) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) invalid(`${name} must contain three finite coordinates`);
}
function list(value, name) { if (!Array.isArray(value)) invalid(`${name} must be an array`); return value; }
function unique(values, name) { if (new Set(values).size !== values.length) invalid(`${name} must be unique`); }
function sha256(value) { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) invalid('expected a SHA-256 content digest'); }
function digestList(value, name) {
  list(value, name).forEach(item => { object(item, ['role', 'sha256'], name); text(item.role, 'role'); sha256(item.sha256); });
  unique(value.map(item => item.role), `${name} roles`);
}
function snapshot(value) {
  // Own data rather than freezing the caller's mutable input. canonicalJson also
  // rejects handles, undefined and nonfinite values anywhere in the record.
  return deepFreeze(JSON.parse(canonicalJson(value)));
}
function envelope(value, kind, fields) {
  object(value, ['schema', 'schemaVersion', ...fields], kind);
  if (value.schema !== `atlas.preparation.${kind}` || value.schemaVersion !== PREPARATION_VERSION) invalid(`unsupported ${kind} schema/version`);
}
function worldRef(value) {
  object(value, ['id', 'definitionKey'], 'world reference'); text(value.id, 'world.id'); text(value.definitionKey, 'world.definitionKey');
}
function identity(value) {
  object(value, ['runtimeId', 'epoch', 'requestId'], 'identity');
  text(value.runtimeId, 'runtimeId'); count(value.epoch, 'epoch'); text(value.requestId, 'requestId');
}
function producer(value) {
  object(value, ['instanceId', 'epoch'], 'producer'); text(value.instanceId, 'producer.instanceId'); count(value.epoch, 'producer.epoch');
}
function bounds(value) {
  object(value, ['min', 'max'], 'bounds'); vector(value.min, 'bounds.min'); vector(value.max, 'bounds.max');
  if (value.min.some((v, i) => v >= value.max[i] || !Number.isFinite(value.max[i] - v))) invalid('bounds must have positive finite extent');
}
export function containsBounds(outer, inner) {
  bounds(outer); bounds(inner);
  return inner.min.every((v, i) => outer.min[i] <= v && outer.max[i] >= inner.max[i]);
}
function intent(value) { if (!['view', 'interaction'].includes(value)) invalid('unknown preparation intent'); }
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const ref = world => ({ id: world.id, definitionKey: world.definitionKey });
export function worldReference(world) {
  const { definitionKey, ...definition } = world;
  const checked = createWorldRecord(definition);
  if (definitionKey !== checked.definitionKey) invalid('world definition key mismatch');
  return snapshot(ref(checked));
}

export function createWorldRecord(value) {
  object(value, ['id', 'generator', 'parameters', 'assets', 'lineage'], 'world definition');
  text(value.id, 'world.id'); object(value.generator, ['id', 'version'], 'generator');
  text(value.generator.id, 'generator.id'); text(value.generator.version, 'generator.version');
  if (!isPlainObject(value.parameters)) invalid('world.parameters must be a plain object');
  digestList(value.assets, 'assets');
  const previous = new Set();
  for (const item of list(value.lineage, 'lineage')) {
    object(item, ['id', 'parent'], 'lineage'); text(item.id, 'feature id');
    if (previous.has(item.id) || (item.parent !== null && !previous.has(item.parent))) invalid('lineage requires unique features with preceding parents');
    previous.add(item.id);
  }
  if (!previous.size) invalid('world lineage is required');
  const definition = snapshot({ ...value, assets: [...value.assets].sort((a, b) => a.role < b.role ? -1 : a.role > b.role ? 1 : 0) });
  return deepFreeze({ ...definition, definitionKey: fnv1a64(canonicalJson(definition)) });
}

export function createPreparationRequest(value) {
  envelope(value, 'request', ['identity', 'producer', 'world', 'bounds', 'intent', 'requirements']);
  identity(value.identity); producer(value.producer); worldRef(value.world); bounds(value.bounds); intent(value.intent);
  object(value.requirements, ['maxErrorM', 'bodyDiameterM'], 'requirements');
  number(value.requirements.maxErrorM, 'maxErrorM', true);
  if (value.intent === 'view') { if (value.requirements.bodyDiameterM !== null) invalid('view has no interaction body'); }
  else number(value.requirements.bodyDiameterM, 'bodyDiameterM', true);
  return snapshot(value);
}

export function createPreparedArtifact(value) {
  envelope(value, 'artifact', ['world', 'bounds', 'transform', 'intent', 'classification', 'classificationBasis', 'qualification', 'representation', 'buffers']);
  worldRef(value.world); bounds(value.bounds); intent(value.intent);
  object(value.transform, ['originM', 'metresPerUnit'], 'transform'); vector(value.transform.originM, 'originM');
  number(value.transform.metresPerUnit, 'metresPerUnit', true);
  if (!['surface', 'empty-air', 'full-solid'].includes(value.classification)) invalid('explicit region classification required');
  object(value.classificationBasis, ['kind', 'method', 'evidenceId', 'volumeM3'], 'classificationBasis');
  if (value.classificationBasis.kind !== 'constructed-approximation') invalid('classification must name its approximation basis');
  text(value.classificationBasis.method, 'classification method'); text(value.classificationBasis.evidenceId, 'classification evidence');
  const volume = number(value.classificationBasis.volumeM3, 'composed volume');
  const boxVolume = value.bounds.min.reduce((v, x, i) => v * (value.bounds.max[i] - x), 1);
  if (!Number.isFinite(boxVolume) || !boxVolume || volume > boxVolume * (1 + 1e-6)) invalid('composed volume outside bounds');
  if (value.classification === 'empty-air' && volume !== 0) invalid('empty-air requires zero composed volume');
  if (value.classification === 'surface' && volume === 0) invalid('surface requires a nonzero composed solid');
  if (value.classification === 'full-solid' && Math.abs(volume - boxVolume) > boxVolume * 1e-6) invalid('full-solid requires the full composed box volume');
  const q = value.qualification;
  object(q, ['kind', 'toleranceM', 'referenceSamples', 'meshSamples', 'limits', 'evidenceId', 'denseValidation'], 'qualification');
  if (q.kind !== 'empirical') invalid('v1 carries empirical qualification, not a mathematical guarantee');
  number(q.toleranceM, 'declared tolerance', true); count(q.referenceSamples, 'referenceSamples'); count(q.meshSamples, 'meshSamples');
  list(q.limits, 'qualification limits').forEach(item => text(item, 'qualification limit')); text(q.evidenceId, 'qualification evidence');
  if (typeof q.denseValidation !== 'boolean') invalid('denseValidation must be explicit');
  if ((!q.referenceSamples || !q.meshSamples) && !q.limits.length) invalid('missing reference coverage requires an explicit qualification limit');
  const r = value.representation;
  object(r, ['builder', 'sampling', 'dependencies', 'features'], 'representation');
  object(r.builder, ['id', 'version', 'sourceDigests'], 'builder'); text(r.builder.id, 'builder.id'); text(r.builder.version, 'builder.version');
  digestList(r.builder.sourceDigests, 'canonical sources'); if (!r.builder.sourceDigests.length) invalid('canonical sources required');
  const uniform = r.sampling?.method === 'bilinear-grid-v1';
  object(r.sampling, uniform ? ['method', 'cells', 'stepM', 'tileWidthM', 'maxSurfaceErrorM', 'coordinateType'] : ['cells', 'stepM', 'tileWidthM', 'rtinToleranceM', 'coordinateType'], 'sampling');
  count(r.sampling.cells, 'cells'); if (!r.sampling.cells) invalid('sampling cells must be positive');
  for (const key of ['stepM', 'tileWidthM', uniform ? 'maxSurfaceErrorM' : 'rtinToleranceM']) number(r.sampling[key], key, true);
  if (r.sampling.coordinateType !== 'float32-local-metres-per-unit') invalid('unsupported numerical format');
  digestList(r.dependencies, 'representation dependencies'); list(r.features, 'features').forEach(item => text(item, 'feature')); unique(r.features, 'features');
  list(value.buffers, 'buffers').forEach(item => {
    object(item, ['role', 'byteLength', 'sha256'], 'buffer'); text(item.role, 'buffer role'); count(item.byteLength, 'byteLength'); sha256(item.sha256);
    if (item.byteLength % 12) invalid('triangle/vertex payloads require 12-byte tuples');
  });
  const roles = value.buffers.map(item => item.role), expected = value.intent === 'view' ? ['vertices', 'surface-indices'] : ['vertices', 'surface-indices', 'solid-indices'];
  if (!same([...roles].sort(), [...expected].sort())) invalid('buffer roles do not match intent');
  const sizes = Object.fromEntries(value.buffers.map(item => [item.role, item.byteLength]));
  if (value.classification === 'surface' && (!sizes.vertices || !sizes['surface-indices'] || (value.intent === 'interaction' && !sizes['solid-indices']))) invalid('surface requires explicit geometry');
  if (value.classification === 'empty-air' && Object.values(sizes).some(Boolean)) invalid('empty-air requires empty geometry');
  if (value.classification === 'full-solid' && sizes['surface-indices']) invalid('full-solid has no interior visible surface');
  const ordered = items => [...items].sort((a, b) => a.role < b.role ? -1 : a.role > b.role ? 1 : 0);
  return snapshot({ ...value, buffers: ordered(value.buffers), representation: { ...r,
    builder: { ...r.builder, sourceDigests: ordered(r.builder.sourceDigests) }, dependencies: ordered(r.dependencies), features: [...r.features].sort() } });
}

export function representationKey(artifact) {
  const a = createPreparedArtifact(artifact);
  // Qualification outcomes/validation mode do not change the geometry identity.
  return fnv1a64(canonicalJson({ world: a.world, bounds: a.bounds, transform: a.transform, intent: a.intent,
    classification: a.classification, representation: a.representation, toleranceM: a.qualification.toleranceM, buffers: a.buffers }));
}

export function createPreparationResult(value) {
  envelope(value, 'result', ['identity', 'producer', 'status', 'reason', 'artifact']); identity(value.identity); producer(value.producer);
  if (!['prepared', 'cancelled', 'unsupported', 'unresolved', 'failed'].includes(value.status)) invalid('unknown producer result status');
  if (value.status === 'prepared') {
    if (value.reason !== null) invalid('prepared result has no failure reason'); createPreparedArtifact(value.artifact);
  } else { text(value.reason, 'result reason'); if (value.artifact !== null) invalid('nonprepared results grant no artifact'); }
  return snapshot(value);
}

export function assertResultForRequest(result, request) {
  const r = createPreparationResult(result), q = createPreparationRequest(request);
  if (!same(r.identity, q.identity) || !same(r.producer, q.producer)) invalid('stale request or producer identity');
  if (r.status === 'prepared') {
    const a = r.artifact;
    if (!same(a.world, q.world) || a.intent !== q.intent || !containsBounds(a.bounds, q.bounds)) invalid('artifact world/intent/coverage mismatch');
    if (a.qualification.toleranceM > q.requirements.maxErrorM) invalid('declared tolerance does not satisfy request');
  }
  return r;
}

export function assertPreparationReceipt(receipt, artifact) {
  object(receipt, ['renderRevision', 'collisionRevision', 'collisionKind', 'lease'], 'preparation receipt');
  const key = representationKey(artifact);
  if (receipt.renderRevision !== key) invalid('render revision mismatch');
  if (artifact.intent === 'view') {
    if (receipt.collisionRevision !== null || receipt.collisionKind !== null) invalid('view cannot acquire interaction eligibility');
  } else if (receipt.collisionRevision !== key || receipt.collisionKind !== artifact.classification) invalid('collision revision/classification mismatch');
  return receipt;
}
