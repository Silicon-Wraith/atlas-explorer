// WGSL sources (plan B06). A pipeline descriptor's sourceIds name files in ./shaders/ (`<id>.wgsl`),
// fetched relative to this module's URL; the module code is wgslConstants() followed by the
// sources in order, so every shader sees the B00 status enums under their frozen names.
import { wgslConstants } from '../status.js';

const SOURCE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const cache = new Map();

export function shaderUrl(sourceId) {
  if (typeof sourceId !== 'string' || !SOURCE_ID.test(sourceId)) throw new TypeError(`invalid WGSL source id ${JSON.stringify(sourceId)}`);
  return new URL(`./shaders/${sourceId}.wgsl`, import.meta.url);
}

// Cached per id for the document's lifetime; a failed fetch is not cached.
export function loadShaderSource(sourceId, { fetchFn = globalThis.fetch } = {}) {
  const url = shaderUrl(sourceId);
  if (!cache.has(sourceId)) {
    const pending = Promise.resolve(fetchFn(url)).then(async response => {
      if (!response.ok) throw new Error(`WGSL source ${sourceId}: HTTP ${response.status}`);
      return response.text();
    });
    pending.catch(() => cache.delete(sourceId));
    cache.set(sourceId, pending);
  }
  return cache.get(sourceId);
}

export async function shaderCode(sourceIds, load = loadShaderSource) {
  const parts = await Promise.all(sourceIds.map(id => load(id)));
  return `${wgslConstants()}\n${parts.join('\n')}`;
}
