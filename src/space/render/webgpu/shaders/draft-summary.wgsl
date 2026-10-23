// draft-summary-v1: exact integer reduction, 64 B or 96 B. The backend clears the
// counters before dispatch. Headers identify the producer, not the readback caller.
struct SummaryUniforms { origin: vec2<u32>, size: vec2<u32>, internal_size: vec2<u32>, stride: u32, producer: u32 };
@group(0) @binding(0) var<uniform> u: SummaryUniforms;
@group(0) @binding(1) var<storage, read> packet: array<u32>;
@group(0) @binding(2) var<storage, read_write> summary: array<atomic<u32>>;
fn bad(flag: u32) { atomicOr(&summary[2], flag); }
@compute @workgroup_size(8, 8, 1)
fn reduce_draft_summary(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= u.size.x || gid.y >= u.size.y) { return; }
  let px = u.origin + gid.xy;
  if (px.x >= u.internal_size.x || px.y >= u.internal_size.y) { return; }
  if (all(px == vec2<u32>(0u))) {
    atomicStore(&summary[0], 0x41545301u); atomicStore(&summary[1], u.producer);
    if (arrayLength(&packet) != u.internal_size.x * u.internal_size.y * u.stride) { bad(16u); }
  }
  let offset = (px.y * u.internal_size.x + px.x) * u.stride;
  atomicAdd(&summary[3], 1u);
  let word = packet[offset]; let marker = packet[offset + 1u];
  let status = word & 15u; let reason = (word >> 4u) & 15u; let subreason = (word >> 8u) & 15u;
  if ((marker & 0xfffffffeu) != (u.producer << 1u)) { bad(1u); }
  if (status == 0u) { atomicAdd(&summary[4], 1u); if ((marker & 1u) == 0u) { atomicAdd(&summary[12], 1u); } }
  else if (status == 1u) { atomicAdd(&summary[5], 1u); }
  else if (status == 3u) { atomicAdd(&summary[6], 1u); }
  else if (status == 2u) {
    if (reason >= 1u && reason <= 3u) { atomicAdd(&summary[6u + reason], 1u); }
    else if (reason == 4u && (subreason == 1u || subreason == 2u)) { atomicAdd(&summary[9u + subreason], 1u); }
    else { bad(4u); }
  } else { bad(2u); }
  if (u.stride != 3u) { return; }
  let recovery = packet[offset + 2u]; if (recovery == 0u) { return; }
  let outcome = (recovery >> 8u) & 15u; let stop = (recovery >> 12u) & 15u;
  let matches = (outcome == 1u && status == 0u) || (outcome == 2u && status == 3u) ||
    (outcome == 3u && status == 2u && reason == 2u) || (outcome == 4u && status == 2u && reason == 1u);
  if (recovery > 0xffffu || !matches || ((stop != 0u) != (outcome == 4u)) || stop > 4u || (recovery & 15u) > 8u) { bad(8u); return; }
  atomicAdd(&summary[12u + outcome], 1u);
  if (stop != 0u) { atomicAdd(&summary[16u + stop], 1u); }
  atomicAdd(&summary[21], recovery & 15u); atomicAdd(&summary[22], (recovery >> 4u) & 15u); atomicAdd(&summary[23], 1u);
}
