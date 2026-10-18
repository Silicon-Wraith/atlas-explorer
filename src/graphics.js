// WebGL availability alone does not establish hardware acceleration. Browser
// privacy settings can also withhold or generalize the renderer identity.
export function classifyRenderer(device, disclosed) {
  if (/swiftshader|llvmpipe|softpipe|software|swrast|lavapipe|microsoft basic render/i.test(device)) return 'software';
  if (disclosed && /nvidia|geforce|quadro|radeon|\bamd\b|\bati\b|\bintel\b|\bapple\b|adreno|mali|powervr|xclipse/i.test(device)) return 'hardware';
  return 'unknown';
}

export function graphicsInfo(gl) {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const device = gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  const vendor = gl.getParameter(info ? info.UNMASKED_VENDOR_WEBGL : gl.VENDOR);
  return { api: 'WebGL 2', acceleration: classifyRenderer(device, !!info), device, vendor, version: gl.getParameter(gl.VERSION) };
}
