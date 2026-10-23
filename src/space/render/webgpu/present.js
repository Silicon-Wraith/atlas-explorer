// Presentation (spec §9.1 "Pipelines"; plan B06): the separately prepared fullscreen render pipeline
// draws the completed display texture into the canvas's preferred unorm format at the output size,
// with explicit nearest scaling and no further transfer function. The display texture is never
// copied to the canvas (rgba8unorm and bgra8unorm are not copy-compatible). The presenter only
// encodes; admission, the uniform snapshot and the ticket belong to the backend.
export function createPresenter({ device, canvas, format = globalThis.navigator?.gpu?.getPreferredCanvasFormat?.() }) {
  const context = canvas?.getContext?.('webgpu');
  if (!context) throw new Error('canvas.getContext("webgpu") returned no context');
  if (!['bgra8unorm', 'rgba8unorm'].includes(format)) throw new Error(`the preferred canvas format ${format} is not a unorm presentation format`);
  context.configure({ device, format, alphaMode: 'opaque' });
  let configured = true;
  return Object.freeze({
    format,
    resize({ width, height }) { if (canvas.width !== width) canvas.width = width; if (canvas.height !== height) canvas.height = height; },
    size: () => ({ width: canvas.width, height: canvas.height }),
    // Encodes one render pass into the current canvas texture; bind group from the pipeline's own layout.
    encode(encoder, { pipeline, display, uniforms, summary }) {
      const bindGroup = device.createBindGroup({ label: 'present', layout: pipeline.getBindGroupLayout(0), entries: [
        { binding: 0, resource: { buffer: uniforms } }, { binding: 1, resource: display.createView() },
        ...(summary ? [{ binding: 2, resource: { buffer: summary } }] : []),
      ] });
      const pass = encoder.beginRenderPass({ label: 'present', colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
      pass.setPipeline(pipeline); pass.setBindGroup(0, bindGroup); pass.draw(3); pass.end();
    },
    unconfigure() { if (!configured) return; configured = false; try { context.unconfigure(); } catch { /* already unconfigured */ } },
  });
}
