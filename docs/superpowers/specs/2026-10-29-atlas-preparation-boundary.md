# PC1: prepared-region boundary, version 1

**Status:** Owner design following independent card challenge `20261029T224805Z-659ba4`, 2026-10-29. Implements the frozen [PC1 card](../../reports/project1-interactive/PC1-CARD-2026-10-29.md). The first CPU slice is implemented and replay-tested; evidence review `20261029T230131Z-a497ca` confirms its scoped closure. No application default or scene-format change is selected here.

## Existing responsibilities

The North Star and fixed-world clarification govern this addition. `shared/scene.js` owns scene envelopes and model codecs; `shared/render-request.js` separates dependency keys from publication generations. `space/render/backend.js` owns Space render descriptors and backend resource handles. `space/workspace.js` owns scene/history, activation and recovery. The current Space scene codec describes the implemented implicit models and its anchored camera. A prepared mathematical world is not silently added to that codec or its persistence format.

PC1 adds GPU-independent data validation and a lifecycle under `src/space/preparation/`. It may reuse canonical serialization/freezing from `shared/scene.js`; shared code acquires no geometry, physics, native or GPU dependency. The native adapter remains a scratch control, configured on the producer side. BI1 will specify the application model, camera conversion, recovery wiring and acceptance before integrating it.

## Identity and requests

All boundary records are finite JSON, versioned as `atlas.preparation.*`, version 1. Reject unsupported versions and unknown fields. Own immutable snapshots; do not freeze caller-owned handles or typed arrays. Binary payloads and local runtime resources travel separately from their JSON descriptors.

A portable world record contains the existing opaque world ID, generator ID/version, fixed construction parameters, a role-to-content-digest asset manifest and stable feature lineage. Its definition digest is computed from that portable record. Preserve BW1's legacy ID as an alias to the exact original construction: its old identity calculation includes filesystem paths, so replacing its identity formula would change the recorded identity. Keep the original path-bearing provenance in the producer's preserved ledger and bind it to the portable asset manifest. Browser requests name world identity/definition digest, never native filenames. This describes portable inputs; it does not claim an independently installed generator can already reconstruct the world.

A request contains:

- An explicit schema/version, unique request ID and runtime identity/epoch. A caller owns a pending request handle; a new handle never revives a retired one. A recovery epoch invalidates all previous handles. Identical representation keys never override execution freshness.
- A world record with generator and feature lineage identity.
- Absolute three-dimensional bounds in metres (`min`, `max`). Current adapters support axis-aligned cubes; other boxes receive `unsupported`, not silent rounding to another region.
- `view` or `interaction` intent and an absolute maximum approximation error. Interaction additionally requires a positive body diameter; view intent carries no movement clearance promise.

Mathematical identity contains neither body diameter nor mesh density. Representation identity includes the world definition, covered bounds, transform, selected fixed construction/feature lineage, builder version/content digest, sampling and approximation policy, and relevant dependencies. Reuse must satisfy requested coverage and accuracy, regardless of cache history. Output content digests bind render and collision revisions to their actual payloads. These are identity/consistency checks, not authentication against a malicious generator.

## Producer results and eligibility

The lifecycle begins `pending`. Terminal producer results are `prepared`, `cancelled`, `unsupported`, `unresolved` and `failed`; pending work remains owned by its tracked promise. Every result echoes the request identity. Non-prepared results have a reason and no coverage-granting artifact. An unresolved mathematical result is never encoded as an empty region. A structurally invalid result is a contract error, not a negative collision test.

A prepared artifact contains world identity, bounds, local-to-world transform (`originM + metresPerUnit * local`), representation identity/dependencies, explicit classification, qualification record and buffer descriptors. Classifications are `surface`, `empty-air` and `full-solid`. Empty-air/full-solid mean the constructed approximate solid, with a named construction/classification basis. They are not global proofs about the exact mathematical field. Missing surface or solid buffers cannot establish empty air. Full-solid is an explicit blocking occupancy representation even if there is no visible triangle inside the requested cube.

Qualification records distinguish an empirical sampled check from a mathematical guarantee. Carry the tolerance, sample counts, reference directions, missing-reference limits and evidence identity. A missing forward-reference sample remains a missing completeness check. Never promote an empirical target to an error bound proved everywhere. Reject an artifact whose declared accuracy does not satisfy the request.

The producer's `prepared` result means payload construction completed. The consumer then owns preparation/publication:

1. Validate the immutable result and binary lengths/digests; accept ownership through a local resource lease.
2. Prepare render resources. For interaction, also prepare collision/occupancy structures with the same representation revision.
3. Check current request handle/runtime epoch and dependencies again after asynchronous work.
4. Publish a compatible pair and mark `view-ready` or `interaction-ready` only after the relevant preparation receipt succeeds. View intent cannot accept an interaction receipt. Rendering-only success cannot make an interaction request ready for movement.

A ready receipt establishes the representation's availability, not that a particular incoming body is clear. Coverage selection, incoming body/corridor clearance, joins and atomic active-region handoff remain consumer responsibilities. A full-solid interaction representation is ready to reject entry. During replacement the application retains the previous active lease until a safe handoff; starting a new request does not itself retire the old active region.

## Ownership, cancellation and recovery

Each request handle owns its accepted payload lease until it transfers ownership to a ready region. Runtime resources are represented by a local lease with one asynchronous release operation; they never enter portable JSON. The builder owns partial allocations until it returns a receipt and must release them if it throws. A lease release drains outstanding work before destroying GPU/collision resources, and release is attempted exactly once by this boundary. A release error remains observable and prevents reporting successful cleanup.

Cancellation invalidates publication immediately. It does not assume a native job can be preempted: cancel the producer if supported; otherwise dispose its late result. Pending asynchronous consumer preparation may finish, but its receipt is retired instead of published. Shutdown invalidates all handles, cancels pending producers, retires accepted leases and awaits owned preparations/releases. An epoch change supports device or preparation recovery while leaving world/scene state to the existing workspace owner.

The boundary manages resources explicitly handed to it; it cannot claim to own the native global caches or physics engine retained capacities merely by counting leases. The adapter reports those categories separately. Serialization buffers, native source/validation/topology caches, worker collision structures, main collision structures and backend GPU buffers have distinct owners and disposal points.

## Native replay control and scope

Replay preserved BW1 records for an interaction surface, constructed empty air and view context, plus the canonical fine formation when available. Resolve requests by world/bounds/intent/requirements against producer-owned records. Old fixture numbers and native paths remain private adapter configuration. An unsupported spatial box receives an honest unsupported result. Require the original metadata/source identities and actual binary digests; do not manufacture geometry for the replay.

The view adapter loads only rendering buffers and never calls the collision preparer or asks for solid triangles. The current payload's visible indices happen to be the same array used for surface collision; that shared file format does not make the returned view eligible for movement. Interaction requires both the visible surface and the occupancy representation/classification. Full-solid behavior can be exercised by an explicitly synthetic contract fixture if BW1 contains no such result; label it separately from recorded evidence.

CPU replay establishes the boundary. It does not revalidate BW1's geometry, prove continuous coverage, measure browser performance or choose a deployment architecture. Existing BW1 limits and existing product acceptance remain in force.

## Card-review resolutions

- The legacy ID is opaque to JavaScript. The producer verifies it using original native metadata, not the JavaScript server report: `64.0` becomes `64` in the latter and changes the legacy Python serialization hash. The portable boundary uses the repository's existing `canonicalJson` (JavaScript finite JSON numbers, UTF-16 key ordering, UTF-8 encoding) and `fnv1a64` identity function. This is named `atlas-canonical-json-v1/fnv1a64`, not claimed as an implementation of a separate canonicalization standard. A non-JavaScript producer consumes the canonical UTF-8 record when checking this key; it must not reserialize a Python dictionary with default JSON rules. Cross-language byte-hash vectors cover integer-valued floats, negative zero, exponents and Unicode. SHA-256 continues to identify exact asset/buffer contents.
- Representation keys exclude BW1 addresses and include intent, source digests, actual spatial bounds, transform, sampling cells/step/tile width, RTIN tolerance, numerical format, declared approximation tolerance, fixed content dependencies and payload digests. Dense validation and finite sample outcomes are qualification provenance rather than geometry identity. Fine replay names the retained parent-reference NPZ by content digest.
- Classification has no default. Require a named construction method and explicit composed-solid volume/triangle evidence. The fine builder's legacy default label is independently checked against its composed-solid payload during replay; omission never means empty space.
- Request and result identities include a producer instance nonce and epoch as well as the consumer runtime/request/epoch. This defends against reused native job numbers after producer restart; it is not a claim that a cross-restart failure was observed in BW1.
- Returned bounds must contain requested bounds, and the actual bounds are reported. A smaller cubic request can reuse a containing prepared cube. The replay adapter explicitly declines non-cubic requests and boxes not contained in its recorded cubes; it does not round them to a nearby address.
- Eligibility compares the artifact's declared policy tolerance with the requested maximum error, never its sampled maximum. Empirical qualification and missing-reference limits remain attached without becoming an everywhere error guarantee.
- The lifecycle starts/tracks the producer promise itself, so shutdown can drain a late producer result as well as consumer work. Partial consumer allocations remain the consumer builder's responsibility until it returns a resource lease. A ready lease remains separate from selection as the active collision region.

These corrections refine the same CPU boundary criteria and do not add a visual, geometry or GPU acceptance gate. WC2's forthcoming card will own prediction, throughput and priority under the broader movement workload.

The final native replay control verifies sampling policy against preserved build metadata and recorded source AST (policy provenance r1), including the 4D view case. Live native generation and actual GPU/physics receipts remain WC2/BI1 work.
