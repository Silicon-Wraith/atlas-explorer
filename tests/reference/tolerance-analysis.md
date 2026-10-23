# B04 preregistered comparison analysis

This document fixes the proposed P1 tolerances before any product GPU comparison.
The references are independent binary64 computations at the effective binary32
inputs; requested-input rendering is a separately labelled experiment. This is a
conditional engineering error budget, not a proof of fractal geometry or a global
binary32 error bound. CPU screening is empirical. A failed mandatory floor blocks
qualification; floors change only through a recorded, user-approved amendment. The 2026-10-21
amendment below was approved before any GPU comparison. The rev 4.8 analytic-depth
amendment (#depth, user-approved 2026-10-21) is post-discovery; the original failed
evidence keeps its original matrix identity.

<a id="arithmetic"></a>
## Arithmetic, fusion and conditioning

Let u32 = 2^-24 and u64 = 2^-53. For n normal rounded operations, gamma(n) =
n*u/(1-n*u). One quaternion update has four squares, three real-component
subtractions, four parameter additions and three doubled products. A component's
unfused local absolute budget is bounded by gamma(8) times the sum of the
magnitudes of its terms (8 is conservative for each component's evaluation).
Fused multiply-add can remove roundings; its absolute error is bounded using the
same sum-of-magnitudes budget, not a relative error in a cancelling result.
Reassociation changes that sum's evaluation but does not remove cancellation.
The real component's relative condition number can be arbitrarily large.

For an orbit error e_n, a norm bound for quaternion recurrence perturbations is
|e_(n+1)| <= (2|q_n| + |e_n|)|e_n| + local_rounding + parameter_error.
This can amplify very small local errors over a long orbit. Bulb angular power
maps similarly amplify angular errors by p and radial errors by p*r^(p-1).
No uniform component or escape-index accuracy follows for 512 updates. Binary64
is a reference precision, not exact arithmetic. The CPU adjacent-input screen
perturbs each relevant effective f32 input individually in both directions;
it is a sensitivity measurement, not an upper bound on accumulated error.

Binary32 emulation rounds each basic operation and transcendental output. It is
one unfused realization, not an emulator of every permitted WGSL execution.
Bulb polar-axis values use the exact integer-power limit with azimuth zero.
Generic comparisons do not use this branch. Axis tests are semantic and never
screened out; shader trigonometric remnants must not alter those semantics.

<a id="status"></a>
## Status and escape index

Point-status and escape-index tolerance is zero. Strict escape is checked at the specified initialization or
post-update point. Every generic candidate retains its status and index. If any
adjacent effective input changes either, all its continuous comparisons are
excluded, with status/index eligibility and exclusions recorded separately.
Origins, polar axes, supported boundaries and adversarial inputs are never
screened. Numerical failure is a separate result, not an exclusion that counts
as passing. Bounded points have no escape components, ln R or log2 DE and do not
supply the literal continuous-comparison floor.

<a id="components"></a>
## Quaternion escape components

The acceptance interval for component v is max(10^-6, 10^-4*|v|). Here "absolute
floor" means max, not an added 10^-6. The quarter-tolerance screen uses that
same definition. At unit magnitude, 10^-4 is about 1,678 unit roundoffs; the
local gamma(8) budget is about 4.77e-7 times the term magnitude. The remaining
budget allows moderate amplification but is not sufficient for every orbit.
At near-zero components the absolute floor avoids division by zero without
hiding the named four-component probes (their j/k discrepancies exceed it).
Each component has its own denominator, eligibility and exclusion list.
The joint continuous count requires all available quantities and escape.

<a id="radius"></a>
## Natural logarithm of the escape radius

Acceptance is 10^-4*|ln R|, with no invented absolute floor. Escape R > 2
makes ln R > ln 2, so this comparison is not singular at zero. For small radial
error deltaR, delta(ln R) is approximately deltaR/R. Norm summation, sqrt and
log output rounding contribute locally; orbit conditioning dominates near
unstable escape bands. Quaternion R(C) uses upward binary64 operations followed
by an upward binary32 conversion. The sensitivity screen recomputes the bound
when effective C is perturbed.

<a id="distance"></a>
## Logarithmic estimator

Acceptance is an absolute 2^-10 in log2 DE. This corresponds to a multiplicative
DE change of 2^(2^-10)-1, approximately 6.7713e-4. The quarter screen is 2^-12.
The derivative is represented by a normalized mantissa and integer exponent,
with a separate zero state; exponent range is not treated as scalar overflow.
For L = -1 + log2(r) + log2(ln r) - log2(D), first-order error is
|deltaL| <= (1 + 1/ln r)*|delta r/r|/ln 2 + |delta D/D|/ln 2,
plus the log evaluation and summation errors. At r >= 2 the radial coefficient
is at most about 3.524, but accumulated derivative and orbit error remain
condition-dependent. Zero sensitivity is unavailable, never a zero DE. An
unavailable estimate is compared as unavailable, not included in a numeric
log2 DE denominator. No underflowed positive estimate is promoted to a hit.

The bulb additionally uses acos, atan2, sin, cos and integer powers. The acos
condition number grows without bound near a pole; exact polar semantics are
separate from generic screening. A specification-wide transcendental ulp bound
is not asserted here: the backend's permitted transcendental errors and
reassociation must still be measured against these preregistered intervals.
Consequently these tolerances are proposed acceptance thresholds, not derived
universal GPU error bounds. A failed comparison requires investigation or a
recorded amendment, never tuning against measured GPU output.

<a id="depth"></a>
## Depth and convergence

Analytic oracle depths t* come from the sphere quadratic, rotated-box local
slabs and merged Menger leaf-box slabs; none uses the marcher as its own
geometric oracle. Project 0 A.4 tangent (0.02) and face-edge (0.001)
exclusions, the eligible rays, floors, exact statuses and numerical-failure
rules are unchanged. Two mandatory checks apply to every analytic stratum
(user-approved amendment 2026-10-21, rev 4.8, post-discovery).

**Stopping displacement is not numerical error.** surface-v1 accepts the
first sample whose exterior distance falls below rho = tau(t) =
max(10^-6, 0.5*alpha*t), alpha = 2*tan(30 deg)/720, so tau/t =
0.0008018753738744802 when the floor is inactive. For a planar face the
exterior distance is the remaining ray distance times |n.d|, so the hit rule
alone permits a ray-depth shortfall approaching tau/|n.d|. It exceeds
10^-3*t above about 36.69 degrees of incidence. The original analysis
budgeted only quantization and conditioning; B04's binary64 tracer then
failed the relative 10^-3 criterion on 92/27/81/95 of 293/207/590/584
eligible hits (sphere/3/9: t* = 3.68377223398316, stopped at
3.674657889705732, error 0.0091143 against 0.0036838). Curved surfaces and
competing Menger features make a local tau/cos(theta) unsound, so the
displacement is budgeted geometrically.

**Check 1, surface-v1 envelope.** For each eligible positive hit, rho =
tau(t*) and delta = max(10^-6, 10^-3*|t*|). Let t- be the first forward
intersection with the object expanded outward by rho: a sphere of radius
1 + rho (an independent quadratic; the exact Euclidean rho-offset), the
rotated box with every local half-extent increased by rho (local slabs; it
contains the Euclidean rho-offset, whose corners are rounded), and the union
of Menger leaves each so inflated (it contains the offset of the union).
Every point with exterior distance below rho lies in the expansion, and the
marcher's tau(t) <= tau(t*) for t <= t*, so a conforming hit stops no earlier
than t- and, since no step crosses the surface, no later than t*. The
requirement is max(0, t-) - delta <= t <= t* + delta: the displacement
budget is t* - t-, and delta is the unchanged numerical allowance on each
side. t-, rho and delta are frozen per case as case.envelope. Neither bound is
fitted to a measured error. Preflight: the displacement reaches 2.503,
1.604, 4.262 and 4.262 delta (sphere, box, Menger 1, Menger 2); the binary64
tracer meets the envelope on every eligible hit, with exact statuses.

**Check 2, analytic-inspection-v1.** The inspection profile scales the whole
surface-v1 tolerance, floor included, by 0.1: tau_i(t) = 0.1*max(10^-6,
0.5*alpha*t) = max(10^-7, 0.05*alpha*t). Multiplier 0.9, the 512-step cap,
720-pixel height and 60-degree field are unchanged; the GPU receives
toleranceFloor 1e-7 and toleranceFactor 0.05 (binary32-rounded, a relative
change near 2^-24). On the unchanged eligible rays it requires
|t - t*| <= delta. Its stopping displacement, bounded by the same expansion at
0.1*rho, is at most 0.253, 0.160, 0.426 and 0.426 delta, which leaves at least
0.574 delta for numerical error. Binary64 tracing gives zero depth and zero
status failures; worst |t - t*| / delta is 0.233, 0.153, 0.426 and 0.426.

**Numerical allowance (both checks).** An r32float depth output contributes
at most u32*|t| = 2^-24*|t| for normal values. Binary32 field inputs
(high + t*d) + low, direction rounding and the analytic distance contribute
errors of order 10 u32 * (|o| + t) <= 10^-5 * t for |o| <= 4.5 and t >= 1,
two orders below delta. The surface-v1 floor is inactive on these rays
(eligible t* >= 3). Grazing incidence amplifies every term; the preregistered
exclusions remain the only screen. CPU preflight does not establish GPU
qualification or accuracy outside the frozen sampling domain.

<a id="overview"></a>
## Approved overview protocol (2026-10-21)

At the upright overview camera, focus is the origin, distance is 2.5 enclosing
radii along normalized Project 0 A.6 direction, vertical FOV is 60 degrees and
frame size is 1280 by 720. Sample integer pixels (376+17u, 96+17v), u,v=0..31;
the ray passes through (i+0.5,j+0.5). These are rounded cell centres of the
projected enclosing square with half-extent
360*tan(asin(1/2.5))/tan(pi/6) = 272.13442056664366 pixels. There is no
per-model adjustment. The profile uses 128 iterations and 512 steps.

Eligibility requires the binary64 surface-v1 trace and the otherwise identical
trace at 0.1*tau(t) to resolve to the same status (approximate hit or miss).
Both depths and the signed difference (tighter minus primary) are recorded;
depth convergence never screens overview eligibility. A positive hit requires
t > 0. Every row needs 820 eligible references. Surface-bearing rows need 64
eligible positive hits. Counts and exclusions are separate for every row.

Surface-bearing means all bulb powers and quaternion cells with |kappa| <= 0.5,
except C=(2,0,0,0). That exception retains the reference floor and status test,
with hit floor zero and diagnostic-only depth comparison. It does not assert
an empty slice or require every ray to miss. The critical orbit 0 -> 2 -> 6
escapes, so the complex filled Julia set is Cantor. For real C, q=a+bu,
u^2=-1, gives q^2+2=(a^2-b^2+2)+2abu. Each complex plane is invariant; at fixed
kappa the rotational extension is a Cantor-indexed family of circles or points,
with no two-dimensional surface patch. Empty interior alone is not that proof.

Let E be the frozen eligible-ray set, H its positive reference hits, D the
GPU/reference status disagreements, and G the reference hits returning a GPU
approximate hit with finite positive depth within 2*tau(t_ref). Every row
requires 20*D <= |E|. Surface-bearing rows additionally require 20*G >= 19*|H|.
A missing GPU hit fails the depth comparison; it never shrinks H. Depth on
non-surface-bearing rows is diagnostic. Numerical failure is a hard failure,
including on excluded rays, not part of the 5 percent allowance. Both ordinary
traces use surface-v1. These are preregistered engineering thresholds, not
geometric error bounds. Analytic and adversarial ray statuses remain exact.

At height 720, tau/t = 0.0008018753738744802 when the floor is inactive.
CPU preflight found ordinary median tighter-trace shifts of 2.41987..6.03072
tau on the 22 non-degenerate rows. The old relative 1e-3 depth screen excluded
86.111..100 percent of their status-stable hits (95..100 percent for bulbs).
The approved integer grid yields 1004..1023 eligible rays and 67..230 eligible
hits on those rows. Unfused f32 emulation disagrees on 0..0.099602 percent of
eligible statuses and meets 2*tau on 96.946565..100 percent of H. C2/kappa=0
has 24/981 status disagreements and only 28/32 depth successes; its depth is
diagnostic. These CPU observations motivate the thresholds but do not certify
all permitted GPU arithmetic implementations.

The same amendment sets the power-7 continuous floor to 400 of its unchanged
512 candidates, at all four budgets. Other powers retain 410. Preflight finds
408 eligible power-7 cases at every budget; escaped-but-ineligible counts are
24, 28, 38 and 40 at budgets 64, 128, 256 and 512. The same 24 short-escape
sensitive cases recur, with additional late-escape exclusions. No coordinate,
comparison tolerance, adjacency screen or semantic assertion changes. A 9^3
alternative gives 572/729 eligible and fails an 80 percent floor of 584; the
approved choice preserves the original samples and their conditioning evidence.

The diagnostic ladder uses primary factor .005 and reference factor .0005,
no absolute tolerance floor, at the central 32 by 32 integer pixels of a
1280 by 720 frame. Eligibility requires matching resolved statuses and
relative positive-depth difference <= 10^-3. A depth claim needs 512 eligible
rays and 128 positive hits, and anchor deltaT <= 10^-3*distance. Requested and
effective inputs are recorded separately. Status disagreements above 5% or
relative depth errors above 1% on more than 5% of eligible positive hits are
threshold exceedances, not passes. CPU preparation makes no GPU agreement claim.
Anchors are the central rays from two opposite overview azimuths, prepared at
256 iterations, multiplier .5, 4096 steps and fixed tolerances 10^-13 and 10^-15.
Both must hit and their difference must permit at least the first ladder rung.

<a id="coverage"></a>
## Termination distributions and performance checkpoints

P2 fixes quaternion usability acceptance at +/- 5 percentage points per class.
P3 delegates acceptance tolerances to B04 without prescribing their values.
B04 preregisters +/- 1 percentage point per class for P3. This is a
separate P3 allowance, not a transfer of P2 validation.
Reusing P2's 5 points would accept an all-miss image at some P3 quaternion
checkpoints (their predicted hit fraction is below 5%). One point rejects
that failure at every checkpoint; it is frozen before any GPU comparison.
The integer acceptance intervals are
ceil(predictedCount - .01*N) through floor(predictedCount + .01*N), clipped to
[0,N], with numericalFailure fixed at zero. All categories must sum to N.
This is a proposed empirical coverage threshold, not a sampling confidence
interval (every pixel is evaluated), nor evidence that a fast renderer passes.

P3 traces every internal pixel centre at sample zero (atlas-aa-v1), in binary64
with effective f32 model parameters. Draft checkpoints use 640 by 360, 64
iterations and 256 steps; settled uses 1280 by 720, 128 iterations and 512
steps. All are direct light, one sample, seed 1. The geometry distribution is
independent of lighting. Transcendental variation and near-boundary status
changes motivate a distribution tolerance but cannot select its value.

## Frozen scope and implementation limits

The generator and every reference source are SHA-256 identified. Generated
JSON rejects nonfinite values rather than silently serializing them to null.
No reference imports production code. The matrix stores unsuccessful strata
as inconclusive, retaining their original floors and all exclusions. A
semantic-only empty slice has no continuous coverage requirement. Literal
continuous-floor interpretation can make a grid infeasible even when its
bounded statuses are stable; this requires a plan clarification, not pooling.
Project 0 historical observations are not product validation and impose no
navigation clamp. This package supplies CPU preparation only.

## Consumer interface

Orbit results contain `status`, `escapeIndex` (null when exhausted), `value`,
`derivative`, `logEscapeRadius`, `estimateAvailable`, and `log2DE` (null when
unavailable). The derivative is `{zero, mantissa, exponent}`. Optional `history`
records orbit values; the bulb also records scalar derivatives for small probes.
Fractal and analytic field results are deliberately distinct. Trace results use
B00's status/reason/subreason labels as strings, with null for no reason; GPU
consumers decode the B00 status word and normalize its `none` label to null.

For overview and detail rows, common model/effective/requested/profile values
live in `stratum.inputs`; case inputs are overrides. The exact camera and pixel
coordinates determine each ray using `rayFor(camera, i, j, 1280, 720)`,
through `(i+0.5,j+0.5)`. This
avoids repeating identical camera origins and parameters in 197,632 cases.
Expected comparison records omit null reasons and un-compared step counts;
missing reason/subreason means null. Adversarial ray records retain all fields.
Point rows keep their requested coordinates, effective inputs and bit patterns.
Analytic rows carry `checks` (`surface-envelope`, `inspection-relative`) and a
binary64 `cpuPreflight`; each eligible positive hit carries `envelope: {rho, delta,
tMinus}`. The header's `profiles` freezes surface-v1 and `analytic-inspection-v1`
(scale 0.1, floor 1e-7, factor 0.05, multiplier and caps unchanged, sampling 720
pixels and 60 degrees); `rules.analytic` freezes both criteria, both mandatory.

`eligible` and `floor` are dictionaries of counts. `denominators` on generic
rows distinguish available continuous quantities from all candidate statuses.
`excluded` identifies the case, quantity and reason; candidates are retained.
The matrix's fixed date is a preregistration date, not a qualification claim.
P3 counts use hit/miss, each unresolved reason (with the two stagnation
subreasons separate), and numericalFailure. Acceptance intervals are inclusive
integer ranges and the counts must total the complete internal pixel count.
The generator accepts `--preflight` (read-only, exit 2 on mandatory failure),
`--write` (also save the inconclusive preparation), `--p3` and `--check`.

## Sharded storage and provenance

`space-matrix.json` is an `atlas.space-matrix-index` version 1 index, with
`matrixTemplate`, `stratumOrder`, `shards`, and `matrixSha256`. Eighteen raw JSON
array shards live under `space-matrix/`: nine non-ladder kinds and nine detail
models (seven bulb powers, default quaternion, off-plane quaternion). A descriptor
records relative path, kind/model grouping, byte length, SHA-256 and stratum IDs.
The template preserves logical field order with an empty `strata` array in its
original position. Explicit `stratumOrder` preserves the interleaved point rows.

`createMatrixIndex(matrix)` returns `{index, shards}` (a path-to-bytes Map).
`assembleMatrix(index, readShard, {kinds}?)` verifies descriptor identities, exact
shard byte lengths and hashes, and rejects missing, duplicate or unexpected IDs.
Full assembly fills the template's `strata` in declared order and verifies
`matrixSha256`. Canonical bytes use `serialize`: UTF-8 JSON.stringify output plus
one LF, rejecting nonfinite values. Index-only metadata is excluded from that
logical matrix hash. `loadMatrix({kinds}?)` reads the committed index and shards.
A subset returns `atlas.space-matrix-view` with `complete:false`; it is never
accepted by `matrixIsQualifiable`. The full generator remains
`generateMatrix({seed}) -> logical matrix`. `generateStrata({partition})` supports
`all`, `points`, and `rays`, so split tests regenerate each partition once.

`compareOverview(stratum, results)` consumes one decoded result per case in
case order. It reports E/H/D/G counts and pass decisions under the approved
rules; callers separately require CPU qualification/floors and assert empty-slice
misses. No missing readback or numerical failure can pass. GPU consumers decode
B00 status words first. This helper is independent of production modules.

B08/B10 pin the logical matrix hash, index-file hash, reference and generator
hashes at registration. They verify each loaded shard against the pinned index.
B04's full integrity check verifies all shards and assembled bytes; subset loading
does not claim whole-matrix qualification. B08 consumes point strata; B10 consumes
ray strata and anchors. Reports join on logical matrix hash and stratum ID.
Re-freezing requires new validation-record IDs; old evidence is not retargeted.
P3 includes the generator in referenceSha256, so generator edits change prediction
and workload hashes even when the termination counts stay the same.
