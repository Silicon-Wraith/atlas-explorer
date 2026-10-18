import { vertex, directFragment, perturbFragment, extendedFragment, colorFragment } from './shaders.js';
import { paletteBytes, colorPixel, PALETTES } from './palettes.js';
import { LOG2_10 } from './math.js';
import { graphicsInfo } from './graphics.js';

function superseded() {
  const error = new Error('Render superseded'); error.name = 'AbortError';
  return error;
}

function program(gl, fragment, label) {
  const shaders = [gl.VERTEX_SHADER, gl.FRAGMENT_SHADER].map((type, i) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, i ? fragment : vertex); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`${label} shader compilation failed: ${gl.getShaderInfoLog(shader)}`);
    return shader;
  });
  const p = gl.createProgram();
  shaders.forEach(shader => gl.attachShader(p, shader)); gl.linkProgram(p);
  shaders.forEach(shader => gl.deleteShader(shader));
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`${label} shader linking failed: ${gl.getProgramInfoLog(p)}`);
  return p;
}

export class GpuRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    let creationError = '', gl;
    const onCreationError = event => { creationError = event.statusMessage || ''; };
    canvas.addEventListener('webglcontextcreationerror', onCreationError);
    try { gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' }); }
    finally { canvas.removeEventListener('webglcontextcreationerror', onCreationError); }
    if (!gl) throw new Error(`WebGL 2 context creation failed.${creationError ? ` ${creationError}` : ' The browser did not provide a graphics context.'}`);
    this.gl = gl;
    this.diagnostics = graphicsInfo(gl);
    try {
      if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('WebGL 2 is available, but EXT_color_buffer_float is missing. ATLAS needs floating-point render targets.');
      this.programs = [directFragment, perturbFragment, extendedFragment].map((source, index) => program(gl, source, ['Direct', 'Perturbation', 'Extended range'][index]));
      this.colorProgram = program(gl, colorFragment, 'Color');
    } catch (error) { error.graphics = this.diagnostics; throw error; }
    this.framebuffer = gl.createFramebuffer();
    this.field = this.texture(gl.NEAREST);
    this.reference = this.texture(gl.NEAREST);
    this.palette = this.texture(gl.LINEAR);
    this.worker = new Worker(new URL('./reference.worker.js', import.meta.url), { type: 'module' });
    this.worker.onerror = event => { this.reject?.(new Error(event.message || 'Reference worker failed.')); this.reject = null; };
    this.worker.onmessage = ({ data }) => {
      if (data.error) this.reject?.(new Error(data.error));
      else this.resolve?.(data);
      this.resolve = this.reject = null;
    };
    this.setPalette('ember');
    this.engine = this.diagnostics.acceleration === 'hardware' ? 'GPU' : this.diagnostics.acceleration === 'software' ? 'SOFTWARE WEBGL' : 'WEBGL';
    this.mode = this.engine;
  }
  texture(filter) {
    const gl = this.gl, texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }
  setPalette(id) {
    this.paletteId = id;
    const gl = this.gl, bytes = paletteBytes(PALETTES.find(p => p.id === id) || PALETTES[0]);
    gl.bindTexture(gl.TEXTURE_2D, this.palette);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1024, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  }
  uniform(p, name, type, ...values) { this.gl[type](this.gl.getUniformLocation(p, name), ...values); }
  resize(width, height) {
    if (this.canvas.width === width && this.canvas.height === height && this.allocated) return;
    const gl = this.gl;
    this.canvas.width = width; this.canvas.height = height;
    gl.bindTexture(gl.TEXTURE_2D, this.field);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.field, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Cannot allocate rendering surface.');
    this.allocated = true;
  }
  async render(view, settings, width, height, fullResolution = false, isCurrent = () => true) {
    const gl = this.gl;
    const mode = view.zoom < 2 ? 0 : view.zoom < 28 ? 1 : 2;
    let reference;
    if (mode) {
      const key = `${view.re}|${view.im}|${settings.iterations}|${mode}|${Math.ceil(view.zoom)}`;
      if (this.referenceKey !== key) {
        reference = await new Promise((resolve, reject) => {
          this.resolve = resolve; this.reject = reject;
          this.worker.postMessage({ type: 'reference', view, iterations: settings.iterations, precision: mode === 1 ? 'double' : 'single' });
        });
        const data = new Float32Array(Math.ceil(reference.length / 1024) * 1024 * 4);
        data.set(reference.orbit);
        if (mode === 1) for (let i = 0; i < reference.length; i++) {
          const scale = 2 ** reference.orbit[i * 4 + 2];
          const re = reference.orbit[i * 4] * scale, im = reference.orbit[i * 4 + 1] * scale;
          data[i * 4] = re; data[i * 4 + 1] = im;
          data[i * 4 + 2] = re - data[i * 4]; data[i * 4 + 3] = im - data[i * 4 + 1];
        }
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.reference);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1024, data.length / 4096, 0, gl.RGBA, gl.FLOAT, data);
        this.referenceLength = reference.length;
        this.referenceKey = key;
      }
    }
    if (!isCurrent()) throw superseded();
    this.resize(width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, width, height);
    const p = this.programs[mode];
    gl.useProgram(p);
    this.uniform(p, 'u_resolution', 'uniform2f', width, height);
    this.uniform(p, 'u_center', 'uniform2f', Number(view.re), Number(view.im));
    const binaryScale = Math.log2(3.4) - view.zoom * LOG2_10;
    const exponent = Math.floor(binaryScale);
    this.uniform(p, 'u_span', 'uniform1f', mode === 2 ? 2 ** (binaryScale - exponent) : 3.4 * 10 ** -view.zoom);
    const step = 3.4 * 10 ** -view.zoom / width, stepHigh = Math.fround(step);
    this.uniform(p, 'u_step', 'uniform2f', stepHigh, step - stepHigh);
    this.uniform(p, 'u_round', 'uniform1f', 1);
    this.uniform(p, 'u_exponent', 'uniform1f', exponent);
    this.uniform(p, 'u_iterations', 'uniform1i', settings.iterations);
    this.uniform(p, 'u_length', 'uniform1i', this.referenceLength || 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.reference);
    this.uniform(p, 'u_reference', 'uniform1i', 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.mode = `${this.engine} · ${['DIRECT', 'DEEP ZOOM', 'EXTENDED RANGE'][mode]}`;
    this.color(settings);
  }
  color(settings) {
    if (!this.allocated) return;
    const gl = this.gl, p = this.colorProgram;
    if (settings.palette !== this.paletteId) this.setPalette(settings.palette);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.field);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.palette);
    this.uniform(p, 'u_field', 'uniform1i', 0);
    this.uniform(p, 'u_palette', 'uniform1i', 1);
    this.uniform(p, 'u_phase', 'uniform1f', settings.phase);
    this.uniform(p, 'u_frequency', 'uniform1f', settings.frequency);
    this.uniform(p, 'u_relief', 'uniform1f', settings.relief);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  readField() {
    const gl = this.gl;
    const data = new Float32Array(this.canvas.width * this.canvas.height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.readPixels(0, 0, this.canvas.width, this.canvas.height, gl.RGBA, gl.FLOAT, data);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return data;
  }
  destroy() {
    this.worker.terminate();
    this.reject?.(new Error('Renderer stopped.'));
    const gl = this.gl;
    for (const p of [...this.programs, this.colorProgram]) gl.deleteProgram(p);
    for (const t of [this.field, this.reference, this.palette]) gl.deleteTexture(t);
    gl.deleteFramebuffer(this.framebuffer);
  }
}

export class CpuRenderer {
  constructor(canvas, failure) {
    this.canvas = canvas; this.context = canvas.getContext('2d', { alpha: false }); this.mode = 'CPU · ADAPTIVE PRECISION';
    this.diagnostics = { api: 'Canvas 2D + worker', acceleration: 'cpu', device: 'CPU worker', reason: failure?.message || 'CPU renderer selected.', attemptedDevice: failure?.graphics?.device || '' };
    this.workers = []; this.job = 0;
  }
  async render(view, settings, width, height, fullResolution = false, isCurrent = () => true) {
    this.cancel();
    // Accumulate the next frame without clearing or partially overwriting the
    // displayed image. Cancellation leaves the last completed frame intact.
    const frame = new Float32Array(width * height * 4);
    this.pendingFrame = frame;
    this.settings = { ...settings };
    const count = Math.min(16, Math.max(1, (navigator.hardwareConcurrency || 4) - 2), Math.ceil(width * height / 16384), Math.ceil(height / 16));
    while (this.workers.length < count) this.workers.push(new Worker(new URL('./reference.worker.js', import.meta.url), { type: 'module' }));
    this.diagnostics.workers = count;
    this.diagnostics.device = `${count} CPU worker${count === 1 ? '' : 's'}`;
    const id = this.job;
    await new Promise((resolve, reject) => {
      this.pendingReject = reject;
      let remaining = count;
      for (let index = 0; index < count; index++) {
        const worker = this.workers[index];
        worker.onerror = event => { if (this.pendingFrame === frame) { reject(new Error(event.message)); this.cancel(); } };
        worker.onmessage = ({ data }) => {
          if (this.pendingFrame !== frame || data.id !== id) return;
          if (data.error) { reject(new Error(data.error)); this.cancel(); return; }
          frame.set(data.pixels, data.y * width * 4);
          if (!data.done || --remaining) return;
          this.pendingReject = null; this.pendingFrame = null;
          if (!isCurrent()) { reject(superseded()); return; }
          this.data = frame;
          if (this.canvas.width !== width) this.canvas.width = width;
          if (this.canvas.height !== height) this.canvas.height = height;
          this.image = this.context.createImageData(width, height);
          this.color(this.settings);
          resolve();
        };
        worker.postMessage({ type: 'cpu', id, view, iterations: settings.iterations, width, height, tileRows: 16, yStart: index * 16, rowStride: count * 16 });
      }
    });
  }
  color(settings) {
    this.settings = { ...settings };
    if (!this.data) return;
    const colorKey = `${settings.palette}|${settings.phase}|${settings.frequency}|${settings.relief}`;
    if (this.coloredData === this.data && this.colorKey === colorKey) return;
    if (this.paletteId !== settings.palette) {
      this.paletteId = settings.palette;
      this.paletteBytes = paletteBytes(PALETTES.find(p => p.id === settings.palette) || PALETTES[0]);
    }
    for (let i = 0; i < this.data.length; i += 4) {
      const rgb = colorPixel(this.data[i], this.data[i + 1], this.paletteBytes, settings.phase, settings.frequency, settings.relief);
      this.image.data[i] = rgb[0]; this.image.data[i + 1] = rgb[1]; this.image.data[i + 2] = rgb[2]; this.image.data[i + 3] = 255;
    }
    this.context.putImageData(this.image, 0, 0);
    this.coloredData = this.data; this.colorKey = colorKey;
  }
  cancel() {
    this.job++;
    if (this.pendingFrame) for (const worker of this.workers) worker.postMessage({ type: 'cancel' });
    this.pendingFrame = null;
    this.pendingReject?.(superseded()); this.pendingReject = null;
  }
  destroy() { this.cancel(); this.workers.forEach(worker => worker.terminate()); this.workers = []; }
}
