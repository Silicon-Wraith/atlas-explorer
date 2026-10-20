// A controllable stand-in for GpuRenderer/CpuRenderer in Node tests. Each render waits
// until the test calls finish(), fail() or leaves it pending; every call is recorded.
export function createFakeRenderer({ gl = true } = {}) {
  const calls = [], pending = [];
  const renderer = {
    calls, pending, canvas: { width: 64, height: 32 }, mode: 'FAKE · DIRECT', diagnostics: { device: 'Fake device', api: 'test' },
    gl: gl ? {} : undefined,
    render(view, settings, width, height, fullResolution = false, isCurrent = () => true) {
      calls.push({ op: 'render', view: { ...view }, settings: { ...settings }, width, height, fullResolution });
      // CPU diagnostics change when a render starts; the GPU path is known at completion.
      renderer.diagnostics.device = `${Math.min(16, Math.ceil(width * height / 16384))} fake workers`;
      return new Promise((resolve, reject) => {
        pending.push({
          // ignoreCurrent: a renderer that completes without honouring cancellation.
          finish({ ignoreCurrent = false } = {}) {
            if (!ignoreCurrent && !isCurrent()) { const error = new Error('Render superseded'); error.name = 'AbortError'; reject(error); return; }
            renderer.canvas.width = width; renderer.canvas.height = height;
            renderer.mode = `FAKE · ${view.zoom < 2 ? 'DIRECT' : view.zoom < 28 ? 'DEEP ZOOM' : 'EXTENDED RANGE'}`;
            renderer.color(settings);
            resolve();
          },
          fail(message) { reject(new Error(message)); },
          cancel() { const error = new Error('Render superseded'); error.name = 'AbortError'; reject(error); },
        });
      });
    },
    color(settings) { calls.push({ op: 'color', settings: { ...settings } }); },
    cancel() {
      calls.push({ op: 'cancel' });
      for (const entry of pending.splice(0)) entry.cancel();
    },
    finishNext(options) { pending.shift().finish(options); },
    failNext(message) { pending.shift().fail(message); },
    colors() { return calls.filter(call => call.op === 'color').map(call => call.settings); },
    renders() { return calls.filter(call => call.op === 'render'); },
  };
  return renderer;
}

export const flush = () => new Promise(resolve => setImmediate(resolve));
