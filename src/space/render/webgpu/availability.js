// Shared text/arguments keep the unavailable notice and the local launcher aligned.
export const WEBGPU_PREVIEW_ARGS = Object.freeze([
  '--enable-gpu', '--use-angle=vulkan',
  '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan',
]);
export function webgpuUnavailable(reason, code) {
  if (!['no-webgpu', 'no-adapter'].includes(code)) return reason;
  return `${reason}. Space needs WebGPU. Open ATLAS over HTTPS or localhost in current Chrome, enable graphics acceleration in Chrome Settings → System, then relaunch Chrome. Check chrome://gpu for WebGPU availability. Run npm run dev:gpu (optionally select a port with -- --port N or PORT) to open a separate Chrome profile with ${WEBGPU_PREVIEW_ARGS.join(' ')}. Availability depends on the browser, GPU and driver; Plane remains available.`;
}
