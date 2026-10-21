// spikes/project0/gpu/alloc.js — every explicit harness buffer and texture goes through this (spec A.8 accounting).
// A child allocator attributes bytes to itself while every allocation is also admitted against its parent's (session-wide) cap.
export const BYTES_PER_TEXEL = Object.freeze({ r32float: 4, rgba16float: 8, r32uint: 4, rgba32float: 16, rgba8unorm: 4 });
export function textureBytes({ size: [w, h], format }) {
  if (!(format in BYTES_PER_TEXEL)) throw new Error(`untracked texture format ${format}`);
  return w * h * BYTES_PER_TEXEL[format];
}
export function createAllocator({ capBytes, parent = null }) {
  const inv = { bytes: 0, textures: 0, buffers: 0, pipelines: 0, bindGroups: 0, peakBytes: 0 };
  const live = new Set(), children = new Set();
  const self = {
    admit(bytes) {
      if (inv.bytes + bytes > capBytes) throw new Error(`allocation cap exceeded: ${inv.bytes} + ${bytes} > ${capBytes}`);
      parent?.admit(bytes);
    },
    charge(bytes, key, delta) { inv.bytes += delta * bytes; inv[key] += delta; inv.peakBytes = Math.max(inv.peakBytes, inv.bytes); parent?.charge(bytes, key, delta); },
  };
  function track(resource, bytes, key) {
    self.charge(bytes, key, +1); live.add(resource);
    const original = resource.destroy.bind(resource); let alive = true;
    resource.destroy = () => { if (alive) { alive = false; self.charge(bytes, key, -1); live.delete(resource); original(); } };
    return resource;
  }
  return Object.assign(self, {
    texture(device, desc) { const bytes = textureBytes(desc); self.admit(bytes); return track(device.createTexture(desc), bytes, 'textures'); },
    buffer(device, desc) { self.admit(desc.size); return track(device.createBuffer(desc), desc.size, 'buffers'); },
    pipeline(p) { inv.pipelines++; parent?.pipeline(p); return p; },
    bindGroup(g) { inv.bindGroups++; parent?.bindGroup(g); return g; },
    child() { const c = createAllocator({ capBytes, parent: self }); children.add(c); return c; },
    inventory: () => ({ ...inv }),
    destroyAll() { for (const c of [...children]) c.destroyAll(); for (const r of [...live]) r.destroy(); },   // recursive: children first
  });
}
