// Prepared triangle rendering only. World generation and collision stay outside.
export const PREPARED_REGION_SHADER = `
struct U {eye:vec4f,right:vec4f,up:vec4f,forward:vec4f,offset:vec4f,projection:vec4f,clip:vec4f,detail:vec4f,light:vec4f,farClip:vec4f};
@group(0) @binding(0) var<uniform> u:U;
struct Out {@builtin(position) clip:vec4f,@location(0) world:vec3f,@location(1) @interpolate(flat) normal:vec3f};
@vertex fn vs(@location(0) p:vec3f,@location(1) normal:vec3f)->Out {
 var o:Out;let world=p*u.offset.w+u.offset.xyz;let r=world-u.eye.xyz;let z=dot(r,u.forward.xyz);let near=u.projection.z;let far=u.projection.w;
 o.clip=vec4f(dot(r,u.right.xyz)*u.projection.x,dot(r,u.up.xyz)*u.projection.y,far/(far-near)*z-far*near/(far-near),z);o.world=world;o.normal=normal;return o;
}
@fragment fn fs(i:Out)->@location(0) vec4f {
 if(u.detail.x==0.&&u.clip.w>0.&&all(abs(i.world-u.clip.xyz)<vec3f(u.clip.w))){discard;}
 if(u.detail.y==1.&&u.farClip.w>0.&&all(abs(i.world-u.farClip.xyz)<vec3f(u.farClip.w))){discard;}
 let diffuse=.15+.85*max(dot(normalize(i.normal),normalize(u.light.xyz)),0.);return vec4f(vec3f(.65)*diffuse,1.);
}`;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = v => { const n = Math.hypot(...v); if (!n) throw new Error('Camera direction is zero'); return v.map(x => x / n); };
export function preparedViewBasis(direction, cameraUp = [0, 1, 0]) {
  const forward = norm(direction); let right = cross(forward, cameraUp);
  right = Math.hypot(...right) < 1e-9 ? [1, 0, 0] : norm(right);
  return { forward, right, up: cross(right, forward) };
}

export async function createPreparedRenderer({ canvas, anchor, diameter, lightDirection, onError = () => {} }) {
  let device, context, depth, disposed = false;
  const resources = new Set();
  try {
    const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('Hardware WebGPU adapter unavailable');
    device = await adapter.requestDevice();
    device.addEventListener('uncapturederror', event => onError(event.error.message));
    device.lost.then(info => { if (!disposed) onError('GPU device lost: ' + info.message); });
    context = canvas.getContext('webgpu'); const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'opaque' });
    depth = device.createTexture({ size: [canvas.width, canvas.height], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
    const shader = device.createShaderModule({ code: PREPARED_REGION_SHADER });
    const info = await shader.getCompilationInfo();
    if (info.messages.some(m => m.type === 'error')) throw new Error(info.messages.map(m => m.message).join('\n'));
    const pipeline = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: shader, entryPoint: 'vs', buffers: [{ arrayStride: 24, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }] }] },
      fragment: { module: shader, entryPoint: 'fs', targets: [{ format }] }, primitive: { topology: 'triangle-list', cullMode: 'none' }, depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' } });
    async function upload(artifact, expanded) {
      if (disposed || !(expanded instanceof Float32Array) || expanded.length % 18 || expanded.byteLength > 64 * 2 ** 20) throw new Error('Invalid/over-budget prepared GPU payload');
      let buffer, uniform;
      try {
        if (expanded.length) {
          buffer = device.createBuffer({ size: expanded.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
          device.queue.writeBuffer(buffer, 0, expanded);
          uniform = device.createBuffer({ size: 160, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        }
        const bind = uniform ? device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }] }) : null;
        const offset = artifact.transform.originM.map((x, i) => (x - anchor[i]) / diameter);
        const region = { buffer, uniform, bind, offset, scale: artifact.transform.metresPerUnit / diameter,
          half: (artifact.bounds.max[0] - artifact.bounds.min[0]) / (2 * diameter), count: expanded.length / 6, bytes: expanded.byteLength + (uniform ? 160 : 0), retired: false };
        await device.queue.onSubmittedWorkDone(); resources.add(region); return region;
      } catch (error) { buffer?.destroy(); uniform?.destroy(); throw error; }
    }
    async function retire(region) {
      if (region.retired) return; region.retired = true;
      try { await device.queue.onSubmittedWorkDone(); }
      finally { region.buffer?.destroy(); region.uniform?.destroy(); resources.delete(region); }
    }
    function encodeFrame({ position, forward, up: cameraUp, bodyScale = 1, view, active, home, verticalFovDegrees }, colorView, depthView, width, height) {
      const fine = active?.kind === 'fine' ? active : null;
      const visible = [view && [view, 'view'], ...(fine ? [[home, 'coarse'], [active, 'fine']] : [[active, 'coarse']])].filter(item => item?.[0]);
      const basis = preparedViewBasis(forward, cameraUp); forward = basis.forward;
      const { right, up } = basis;
      const encoder = device.createCommandEncoder(), pass = encoder.beginRenderPass({
        colorAttachments: [{ view: colorView, clearValue: { r: .035, g: .064, b: .105, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
        depthStencilAttachment: { view: depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
      pass.setPipeline(pipeline);
      for (const [entry, role] of visible) {
        const p = entry.gpu; if (!p.count) continue; if (p.retired) throw new Error('Rendering retired prepared region');
        const u = new Float32Array(40); u.set(position, 0); u.set(right, 4); u.set(up, 8); u.set(forward, 12); u.set(p.offset, 16); u[19] = p.scale;
        const focalY = verticalFovDegrees == null ? 1.3 : 1 / Math.tan(verticalFovDegrees * Math.PI / 360);
        u.set([focalY / (width / height), focalY, .02 * bodyScale, 40], 20);
        if (fine) { u.set(fine.gpu.offset, 24); u[27] = fine.gpu.half; }
        u[28] = role === 'coarse' ? 0 : 1; u[29] = role === 'view' ? 1 : 0; u.set(lightDirection, 32);
        if (role === 'view') { const covered = fine ? home : active; u.set(covered.gpu.offset, 36); u[39] = covered.gpu.half; }
        device.queue.writeBuffer(p.uniform, 0, u); pass.setBindGroup(0, p.bind); pass.setVertexBuffer(0, p.buffer); pass.draw(p.count);
      }
      pass.end(); return encoder;
    }
    async function controls() {
      // Synthetic GPU controls exercise this exact shader, not another fixture shader.
      const created = []; let color, z, read;
      try {
        const make = async (h, n, kind) => {
          const positions = [[-h, -h, 0], [h, -h, 0], [h, h, 0], [-h, h, 0]], ids = [0, 1, 2, 0, 2, 3], data = new Float32Array(36);
          ids.forEach((id, i) => { data.set(positions[id], i * 6); data.set(n, i * 6 + 3); });
          const artifact = { transform: { originM: anchor, metresPerUnit: diameter }, bounds: { min: anchor.map(x => x - h * diameter), max: anchor.map(x => x + h * diameter) } };
          const gpu = await upload(artifact, data); created.push(gpu); return { gpu, kind };
        };
        const view = await make(4, [0, 0, 1], 'view'), home = await make(1, [Math.sqrt(.75), 0, .5], 'coarse'), fine = await make(.25, [Math.sqrt(.4375), 0, .75], 'fine');
        color = device.createTexture({ size: [64, 64], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
        z = device.createTexture({ size: [64, 64], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
        read = device.createBuffer({ size: 64 * 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        const savedLight = lightDirection; lightDirection = [0, 0, 1];
        const encoder = encodeFrame({ position: [0, 0, 4], forward: [0, 0, -1], view, home, active: fine }, color.createView(), z.createView(), 64, 64);
        lightDirection = savedLight; encoder.copyTextureToBuffer({ texture: color }, { buffer: read, bytesPerRow: 256 }, [64, 64]); device.queue.submit([encoder.finish()]);
        await read.mapAsync(GPUMapMode.READ);
        const mapped = read.getMappedRange();
        const pixels = [[32, 32, 131], [38, 32, 95], [49, 32, 166]].map(([x, y, expected]) => {
          const rgba = [...new Uint8Array(mapped, y * 256 + x * 4, 4)]; return { x, y, expected, rgba, pass: rgba.slice(0, 3).every(v => Math.abs(v - expected) <= 2) && rgba[3] === 255 };
        });
        read.unmap(); if (pixels.some(p => !p.pass)) throw new Error('Nested prepared-render GPU control failed: ' + JSON.stringify(pixels));
        return { synthetic: true, pixels, pass: true };
      } finally { read?.destroy(); color?.destroy(); z?.destroy(); for (const gpu of created) await retire(gpu); }
    }
    const adapterInfo = adapter.info ?? await adapter.requestAdapterInfo?.();
    return Object.freeze({ upload, retire, controls,
      adapterInfo: { vendor: adapterInfo?.vendor, architecture: adapterInfo?.architecture, device: adapterInfo?.device, description: adapterInfo?.description },
      render(frame) { if (!disposed) device.queue.submit([encodeFrame(frame, context.getCurrentTexture().createView(), depth.createView(), canvas.width, canvas.height).finish()]); },
      done: () => device.queue.onSubmittedWorkDone(),
      async resize(width, height) {
        if (disposed || ![width, height].every(Number.isSafeInteger) || width < 1 || height < 1 || width * height > 2300000) throw new RangeError('Prepared viewport exceeds its pixel budget');
        if (width === canvas.width && height === canvas.height) return;
        const replacement = device.createTexture({ size: [width, height], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
        try { await device.queue.onSubmittedWorkDone(); }
        catch (error) { replacement.destroy(); throw error; }
        const old = depth; depth = replacement; canvas.width = width; canvas.height = height; old.destroy();
      },
      bytes: () => [...resources].reduce((sum, p) => sum + p.bytes, canvas.width * canvas.height * 4),
      async dispose() {
        if (disposed) return; disposed = true;
        try { for (const region of [...resources]) await retire(region); }
        finally { depth.destroy(); context.unconfigure(); device.destroy(); }
      },
    });
  } catch (error) { disposed = true; for (const r of resources) { r.buffer?.destroy(); r.uniform?.destroy(); } depth?.destroy(); context?.unconfigure(); device?.destroy(); throw error; }
}
