// Numeric-only reader for the bounded portable A2.1 parent profile.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../../src/shared/scene.js';
import { createSourceRecipe, sourceRecipeKey, createParentDefinition } from '../../src/space/generation/source-recipe.js';
export const sourceDigest = bytes => createHash('sha256').update(bytes).digest('hex');
const ensure = (ok, message) => { if (!ok) throw new Error(message); };
export function readParentNpy(bytes, n) {
  ensure(Number.isSafeInteger(n) && n >= 2 && n <= 513 && bytes.length >= 10, 'Invalid parent shape/data');
  ensure(bytes.subarray(0, 8).equals(Buffer.from([147,78,85,77,80,89,1,0])), 'Unsupported numeric NPY version');
  const size = bytes.readUInt16LE(8), end = 10 + size;
  ensure(size > 0 && size <= 4096 && end <= bytes.length && bytes[end - 1] === 10, 'Invalid numeric NPY header');
  ensure(bytes.subarray(10,end).every(b=>b<128), 'Non-ASCII numeric NPY header');
  const match = bytes.subarray(10, end).toString('ascii').match(/^\{\s*'descr':\s*'<f8',\s*'fortran_order':\s*False,\s*'shape':\s*\((\d+),\s*(\d+)\),?\s*\}\s*$/);
  ensure(match && Number(match[1]) === n && Number(match[2]) === n && bytes.length === end + 8 * n * n, 'Invalid numeric NPY dtype/order/shape/length');
  const raw = bytes.subarray(end), heights = new Float64Array(n * n);
  for (let i = 0; i < heights.length; i++) {
    const value = raw.readDoubleLE(i * 8);
    ensure(Number.isFinite(value) && !Object.is(value, -0), 'Invalid numeric height'); heights[i] = value;
  }
  return { heights, logicalSha256: sourceDigest(Buffer.concat([Buffer.from(canonicalJson({ dtype:'<f8', shape:[n,n], order:'C' }) + '\0'), raw])) };
}
export async function readSourceBundle(directory) {
  const root = await fs.realpath(directory);
  async function read(name, limit = 4 * 2 ** 20) {
    const file = await fs.realpath(path.join(root, name));
    ensure(path.dirname(file) === root, 'Source file escapes bundle');
    const stat = await fs.stat(file); ensure(stat.isFile() && stat.size <= limit, 'Source file exceeds budget or is not regular');
    const bytes = await fs.readFile(file); ensure(bytes.length <= limit, 'Source file exceeds budget'); return bytes;
  }
  const manifest = JSON.parse(await read('bundle.json'));
  ensure(canonicalJson(Object.keys(manifest).sort()) === canonicalJson(['files','schema','schemaVersion']) && manifest.schema === 'atlas.generation.source-bundle' && manifest.schemaVersion === 1, 'Invalid source manifest');
  ensure(manifest.files && canonicalJson(Object.keys(manifest.files).sort()) === canonicalJson(['height.npy','recipe.json','result.json']), 'Resolved source bundle files required');
  const files = {};
  for (const [name, hash] of Object.entries(manifest.files)) {
    ensure(typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash), 'Invalid source transport hash');
    files[name] = await read(name); ensure(sourceDigest(files[name]) === hash, 'Source transport hash mismatch: ' + name);
  }
  const recipe = createSourceRecipe(JSON.parse(files['recipe.json'])), result = JSON.parse(files['result.json']);
  ensure(result.status === 'resolved' && result.requestKey === await sourceRecipeKey(recipe), 'Unresolved source or request key mismatch');
  const { heights, logicalSha256 } = readParentNpy(files['height.npy'], recipe.grid.cells + 1);
  const definition = await createParentDefinition(recipe, logicalSha256);
  ensure(canonicalJson(definition) === canonicalJson(result.definition), 'Source definition/logical array mismatch');
  return { recipe, definition, heights, inputKey: sourceDigest(canonicalJson({ definitionKey:definition.definitionKey, logicalSha256 })), transport: manifest.files };
}
