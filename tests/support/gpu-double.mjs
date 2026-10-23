// An in-memory WebGPU device double for Node tests of src/space/render/webgpu/backend.js (B06 fix
// round 1). It renders nothing and makes no hardware claim: it records native creation and
// destruction, keeps a real error-scope stack, and lets a test hold or release fences, scope pops,
// mappings and loss notifications so ordering rules can be exercised deterministically.
const flags = (names) => Object.freeze(Object.fromEntries(names.map((name, index) => [name, 1 << index])));
export function installGpuGlobals() {
  globalThis.GPUBufferUsage ??= flags(['MAP_READ', 'MAP_WRITE', 'COPY_SRC', 'COPY_DST', 'INDEX', 'VERTEX', 'UNIFORM', 'STORAGE', 'INDIRECT', 'QUERY_RESOLVE']);
  globalThis.GPUTextureUsage ??= flags(['COPY_SRC', 'COPY_DST', 'TEXTURE_BINDING', 'STORAGE_BINDING', 'RENDER_ATTACHMENT']);
  globalThis.GPUMapMode ??= flags(['READ', 'WRITE']);
}
const DEFAULT_LIMITS = { maxBufferSize: 256 * 2 ** 20, maxStorageBufferBindingSize: 128 * 2 ** 20, maxUniformBufferBindingSize: 65536, maxTextureDimension2D: 8192,
  maxComputeWorkgroupsPerDimension: 65535, maxComputeInvocationsPerWorkgroup: 256, maxBindGroups: 4, maxStorageBuffersPerShaderStage: 8, maxStorageTexturesPerShaderStage: 4 };

function gate() {
  // A releasable queue of resolvers: held while `held`, otherwise resolved on a microtask.
  const waiting = [];
  return {
    held: false,
    wait(value) { return new Promise(resolve => { if (this.held) waiting.push(() => resolve(value())); else queueMicrotask(() => resolve(value())); }); },
    release() { this.held = false; for (const resolve of waiting.splice(0)) resolve(); },
  };
}

export function createGpuDouble({ limits = {} } = {}) {
  installGpuGlobals();
  const control = {
    fences: gate(), scopes: gate(), maps: gate(), losses: gate(),
    natives: [], submissions: [], commandBuffers: [], scopeDepthAtCreate: [],
    // One-shot injections: {op, filter, message} queued errors raised in the innermost matching scope.
    errors: [], failInitialMapping: false, failGetMappedRange: false, failMapAsync: false,
    loseDuringAcquire: false, rejectPipelines: false, devices: [],
  };
  let attempts = 0;
  function makeDevice() {
    const attemptId = `double-attempt-${++attempts}`;
    const scopes = [], listeners = [];
    let resolveLost;
    const lost = new Promise(resolve => { resolveLost = resolve; });
    const raise = op => {
      const index = control.errors.findIndex(error => error.op === op);
      if (index < 0) return;
      const [error] = control.errors.splice(index, 1);
      const scope = [...scopes].reverse().find(item => item.filter === error.filter);
      const value = { message: error.message };
      if (scope) scope.error ??= value; else listeners.forEach(listener => listener({ error: value }));
    };
    const native = (kind, descriptor, extra = {}) => {
      const item = { kind, descriptor, destroyed: false, destroy() { item.destroyed = true; }, ...extra };
      control.natives.push(item); control.scopeDepthAtCreate.push({ kind, label: descriptor.label, depth: scopes.length });
      return item;
    };
    const device = {
      attemptId, limits: { ...DEFAULT_LIMITS, ...limits }, lost, destroyed: false,
      addEventListener(type, listener) { if (type === 'uncapturederror') listeners.push(listener); },
      pushErrorScope(filter) { scopes.push({ filter, error: null }); },
      popErrorScope() { const scope = scopes.pop(); if (!scope) throw new Error('error scope stack is empty'); return control.scopes.wait(() => scope.error); },
      createBuffer(descriptor) {
        const data = new Uint8Array(descriptor.size);
        const buffer = native('buffer', descriptor, { data, mapped: !!descriptor.mappedAtCreation,
          getMappedRange() {
            if (control.failInitialMapping && buffer.mapped && descriptor.mappedAtCreation) { control.failInitialMapping = false; throw new RangeError('injected initial mapping failure'); }
            if (control.failGetMappedRange && !descriptor.mappedAtCreation) { control.failGetMappedRange = false; throw new Error('injected getMappedRange failure'); }
            return data.buffer;
          },
          unmap() { buffer.mapped = false; },
          mapAsync() {
            if (control.failMapAsync) { control.failMapAsync = false; return Promise.reject(new Error('injected mapAsync failure')); }
            return control.maps.wait(() => { buffer.mapped = true; });
          },
        });
        raise('createBuffer');
        return buffer;
      },
      createTexture(descriptor) { const texture = native('texture', descriptor, { createView: () => ({ texture }) }); raise('createTexture'); return texture; },
      createShaderModule(descriptor) { return { descriptor, getCompilationInfo: async () => ({ messages: [] }) }; },
      createComputePipelineAsync: async descriptor => { if (control.rejectPipelines) throw Object.assign(new Error('injected pipeline rejection'), { name: 'GPUPipelineError', reason: 'internal' }); return { descriptor, getBindGroupLayout: () => ({}) }; },
      createRenderPipelineAsync: async descriptor => ({ descriptor, getBindGroupLayout: () => ({}) }),
      createBindGroup(descriptor) { raise('createBindGroup'); return { descriptor }; },
      createCommandEncoder({ label } = {}) {
        const commands = [];
        const pass = { setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, draw() {}, end() {} };
        return { beginComputePass({ label } = {}) {
          const command = { label }; commands.push(command);
          return { setPipeline(pipeline) { command.pipeline = pipeline; }, setBindGroup(index, group) { command.group = group; },
            dispatchWorkgroups(...dimensions) { command.dimensions = dimensions; }, end() { command.ended = true; } };
        }, beginRenderPass: () => pass, copyTextureToBuffer() {}, copyBufferToBuffer() {}, finish() {
          const buffer = { label, commands }; control.commandBuffers.push(buffer); return buffer;
        } };
      },
      queue: {
        submit(buffers) { control.submissions.push(buffers.length); raise('submit'); },
        onSubmittedWorkDone: () => control.fences.wait(() => undefined),
      },
      destroy() { if (device.destroyed) return; device.destroyed = true; control.losses.wait(() => resolveLost({ reason: 'destroyed', message: 'device destroyed' })); },
      lose(reason = 'unknown') { resolveLost({ reason, message: `lost: ${reason}` }); },
    };
    control.devices.push(device);
    return device;
  }
  // The injected acquire: device.lost observed before returning, as acquireDevice does.
  async function acquire({ onLost } = {}) {
    const device = makeDevice();
    device.lost.then(info => onLost?.({ attemptId: device.attemptId, reason: info.reason, message: info.message }));
    if (control.loseDuringAcquire) { control.loseDuringAcquire = false; device.lose('unknown'); }
    await Promise.resolve(); await Promise.resolve();
    const identity = Object.fromEntries(['vendor', 'architecture', 'device', 'description'].map(field => [field, 'unavailable']));
    return { device, adapter: {}, attemptId: device.attemptId, identity, isFallbackAdapter: 'unavailable',
      features: { requested: [], granted: [], available: [], timestampQuery: false }, limits: device.limits, adapterLimits: device.limits, requestedLimits: {} };
  }
  const context = { configured: null, configure(value) { context.configured = value; }, unconfigure() { context.configured = null; }, getCurrentTexture: () => ({ createView: () => ({}) }) };
  const canvas = { width: 300, height: 150, getContext: type => (type === 'webgpu' ? context : null) };
  return { control, acquire, canvas, context, loadSource: async () => '// double\n' };
}
