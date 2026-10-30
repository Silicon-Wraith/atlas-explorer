// Observe exported WASM capacity during the one owned initialization, restoring
// the host APIs on success or failure. Capacity is not a live-allocation count.
export async function observeWasmInitialization(initialize) {
  const memories = new Set(), originals = {};
  for (const name of ['instantiate', 'instantiateStreaming']) {
    if (typeof WebAssembly[name] !== 'function') continue;
    originals[name] = WebAssembly[name];
    WebAssembly[name] = async function (...args) {
      const result = await originals[name].apply(WebAssembly, args), instance = result.instance ?? result;
      for (const value of Object.values(instance.exports ?? {})) if (value instanceof WebAssembly.Memory) memories.add(value);
      return result;
    };
  }
  try { await initialize(); }
  finally { for (const [name, fn] of Object.entries(originals)) WebAssembly[name] = fn; }
  if (!memories.size) throw new Error('WASM capacity instrumentation unavailable');
  return Object.freeze({ bytes: () => [...memories].reduce((sum, memory) => sum + memory.buffer.byteLength, 0) });
}
