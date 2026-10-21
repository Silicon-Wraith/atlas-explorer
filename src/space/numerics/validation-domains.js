// Supported requests are admission policy; validation records are separately
// supplied product evidence. No Project 0 record is implicitly applicable here.
import { SceneError, isPlainObject, requireObject, canonicalJson, deepFreeze } from '../../shared/scene.js';
import { effectiveParameters } from './parameters.js';

// The five substantive sentences of the binding plan's Precision carry-forward
// paragraph, verbatim with prose line wraps joined. Product-record producers
// include every entry; the generic registry also permits synthetic test records.
export const PRECISION_CARRY_FORWARD_LIMITATIONS = Object.freeze([
  'Project 0 records are historical evidence bound to their original implementation, profile, inputs and limitations; they do not constitute product validation.',
  "Product validation records (B02's registry) distinguish arithmetic, tracing and geometric evidence classes; each carries the implementation-source hashes, the reference and generator hashes, the matrix hash, the profile and the exact tested input or spatial sampling domain; a lookup matches only the conditions its evidence class represents, and a local detail record never matches another camera patch merely because parameters and image height match.",
  "The power-8 10⁻⁴/10⁻⁵ observations at the frozen anchor belong in historical context, not in the product's applicable tested-coverage record, and are never a navigation clamp.",
  "Product validation records identify the product kernel and profile and B04's matrix results, including eligible counts, exclusions, inconclusive strata and unsupported claims.",
  "Project 0's amended G5 validated sampled off-plane recurrence behaviour for escape indices 0–11 and bounded orbits through 128 updates; it did not validate off-plane rendering, long-escape behaviour generally (E9: no validated long-escape band at f32), or any independently implemented product kernel.",
]);

// Tagged admission metadata: sets enumerate selectors; intervals are inclusive
// exact requested-decimal ranges. Registry arrays below remain enumerations.
export const SUPPORTED_DOMAINS = deepFreeze({
  sphere: {}, box: {}, menger: { depth: { kind: 'set', values: [1, 2] } },
  mandelbulb: { power: { kind: 'set', values: ['2', '3', '4', '5', '6', '7', '8'] } },
  'quaternion-julia': {
    C: Array.from({ length: 4 }, () => ({ kind: 'interval', min: '-4', max: '4' })),
    kappa: { kind: 'interval', min: '-4', max: '4' },
  },
});

export function inSupportedDomain(modelId, parameters) {
  try {
    effectiveParameters(modelId, parameters);
    return { ok: true, violations: [] };
  } catch (error) {
    if (!(error instanceof SceneError)) throw error;
    return { ok: false, violations: [{ path: error.path, reason: error.message }] };
  }
}

export const VALIDATION_RECORD_FIELDS = Object.freeze([
  'recordId', 'modelId', 'evidenceClass', 'implementationHashes', 'referenceHashes', 'matrixHash', 'profile',
  'testedParameters', 'testedSamplingConditions', 'testedDomain', 'coverage', 'inconclusive', 'limitations',
]);
const EVIDENCE_CLASSES = ['arithmetic', 'tracing', 'geometric'];
const invalid = (message, path) => { throw new SceneError('invalid-value', message, path); };

// Validate and copy data before canonical equality or storage. In particular,
// functions, sparse arrays, cycles and non-finite numbers cannot become evidence.
function copyData(value, path, parents = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!Array.isArray(value) && !isPlainObject(value)) invalid('must contain finite JSON data', path);
  if (parents.has(value)) invalid('must not contain cycles', path);
  parents.add(value);
  const copy = Array.isArray(value)
    ? Array.from({ length: value.length }, (_, i) => copyData(value[i], `${path}[${i}]`, parents))
    : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyData(item, `${path}.${key}`, parents)]));
  parents.delete(value);
  return copy;
}

function object(value, path, nonempty = false) {
  if (!isPlainObject(value) || (nonempty && !Object.keys(value).length)) invalid('must be a plain object' + (nonempty ? ' with explicit entries' : ''), path);
}
function string(value, path) {
  if (typeof value !== 'string' || !value.trim()) invalid('must be a nonempty string', path);
}
function hashes(value, path) {
  object(value, path, true);
  for (const [key, hash] of Object.entries(value)) string(hash, `${path}.${key}`);
}

// Only the aliases used by the plan are recognized; no guessed pluralization or
// numeric interval interpretation. Parameter/sampling arrays enumerate values
// (C vectors are alternatives such as C: [[a,b,c,d], ...]). Domain arrays are
// exact data, except heights/distances, which enumerate height/distance.
const ALIASES = { heights: 'height', distances: 'distance' };
function validateConditions(value, path) {
  object(value, path);
  for (const [key, condition] of Object.entries(value)) {
    if (Array.isArray(condition) && !condition.length) invalid('a tested set must not be empty', `${path}.${key}`);
    if (Object.hasOwn(ALIASES, key) && Object.hasOwn(value, ALIASES[key])) invalid('must not specify both the plural set and singular field', path);
  }
}

const equal = (a, b) => canonicalJson(a) === canonicalJson(b);
function matches(tested, actual, domain = false) {
  if (!isPlainObject(actual)) return false;
  const entries = Object.entries(tested);
  if (Object.keys(actual).length !== entries.length) return false;
  return entries.every(([key, condition]) => {
    const actualKey = Object.hasOwn(ALIASES, key) ? ALIASES[key] : key;
    if (!Object.hasOwn(actual, actualKey)) return false;
    const set = Array.isArray(condition) && (!domain || Object.hasOwn(ALIASES, key));
    return set ? condition.some(candidate => equal(candidate, actual[actualKey])) : equal(condition, actual[actualKey]);
  });
}

export function createValidationRegistry() {
  const records = new Map();
  function register(record) {
    requireObject(record, 'record', VALIDATION_RECORD_FIELDS);
    const snapshot = copyData(record, 'record');
    for (const key of ['recordId', 'modelId', 'matrixHash', 'profile']) string(snapshot[key], key);
    if (records.has(snapshot.recordId)) invalid('recordId is already registered', 'recordId');
    if (!Object.hasOwn(SUPPORTED_DOMAINS, snapshot.modelId)) invalid('must name a supported model', 'modelId');
    if (!EVIDENCE_CLASSES.includes(snapshot.evidenceClass)) invalid('must be arithmetic, tracing or geometric', 'evidenceClass');
    hashes(snapshot.implementationHashes, 'implementationHashes'); hashes(snapshot.referenceHashes, 'referenceHashes');
    validateConditions(snapshot.testedParameters, 'testedParameters');
    validateConditions(snapshot.testedSamplingConditions, 'testedSamplingConditions');
    object(snapshot.testedDomain, 'testedDomain', true); validateConditions(snapshot.testedDomain, 'testedDomain');
    object(snapshot.coverage, 'coverage');
    if (!Array.isArray(snapshot.inconclusive)) invalid('must be an array', 'inconclusive');
    if (!Array.isArray(snapshot.limitations) || snapshot.limitations.some(item => typeof item !== 'string')) invalid('must be an array of strings', 'limitations');
    records.set(snapshot.recordId, deepFreeze(snapshot));
    return snapshot;
  }

  function lookup(query) {
    if (!isPlainObject(query) || !isPlainObject(query.domain) || !Object.keys(query.domain).length) return null;
    try {
      const { modelId, evidenceClass, implementationHashes, profile, effective, sampling, domain } = copyData(query, 'lookup');
      for (const record of records.values()) {
        if (record.modelId === modelId && record.evidenceClass === evidenceClass && record.profile === profile
          && equal(record.implementationHashes, implementationHashes)
          && matches(record.testedParameters, effective) && matches(record.testedSamplingConditions, sampling)
          && matches(record.testedDomain, domain, true)) return record;
      }
    } catch (error) {
      if (!(error instanceof SceneError)) throw error;
    }
    return null;
  }
  return Object.freeze({ register, lookup, list: () => Object.freeze([...records.values()]) });
}
