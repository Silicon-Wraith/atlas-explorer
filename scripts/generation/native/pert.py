# P1: GPU reference-orbit perturbation of the escape-time DE (dek semantics). float32 per point, float64 reference on the host.
# D_c = |z| ln|z| / |dz| at first |z| > R (half Milnor), dz_0 = 0, dz <- 2 z dz + 1 before z <- z^2 + c. Proven interior (host, float64) -> 0;
# no escape by max(131072, 4N) -> NaN (unknown); equivalent to h1lib.Dser's N then 131072 re-check (deterministic orbit).
import hashlib, numpy as np, cupy as cp

R = 1e6
SRC = r'''
// status: 1 escaped, 0 no escape by nmax (unknown), 2 invalid arithmetic (non-finite state) -> never a value, never "unknown"
extern "C" __global__ void pert(const float2* __restrict__ Z, const int mref, const float2* __restrict__ dl, const int n, const int nmax, const float R2,
                                int* st_out, int* it_out, float* az_out, float* adz_out, int* E_out, int* reb_out) {
    int i = blockDim.x * blockIdx.x + threadIdx.x; if (i >= n) return;
    const float dr = dl[i].x, di = dl[i].y;
    float er = 0.f, ei = 0.f, zr = 0.f, zi = 0.f, dzr = 0.f, dzi = 0.f; int E = 0, m = 0, reb = 0, st = 0, k = 0;
    for (k = 0; k < nmax; k++) {
        float inc = ldexpf(1.f, -E);                                          // the "+1" in units of 2^E (E kept <= 120 below)
        float ndzr = 2.f * (zr * dzr - zi * dzi) + inc, ndzi = 2.f * (zr * dzi + zi * dzr); dzr = ndzr; dzi = ndzi;
        float Zr = Z[m].x, Zi = Z[m].y;
        float ner = 2.f * (Zr * er - Zi * ei) + (er * er - ei * ei) + dr;    // eps <- 2 Z eps + eps^2 + delta
        float nei = 2.f * (Zr * ei + Zi * er) + 2.f * er * ei + di; er = ner; ei = nei; m++;
        zr = Z[m].x + er; zi = Z[m].y + ei; float az2 = zr * zr + zi * zi;
        if (!isfinite(az2) || !isfinite(dzr) || !isfinite(dzi)) { st = 2; break; }
        if (az2 > R2) { st = 1; break; }
        if (az2 < er * er + ei * ei || m >= mref) { er = zr; ei = zi; m = 0; reb++; }   // rebase (Z_0 = 0)
        float a = fmaxf(fabsf(dzr), fabsf(dzi));
        if (a > 1.152921504606847e18f) { dzr = ldexpf(dzr, -60); dzi = ldexpf(dzi, -60); E += 60; }        // down: |dz| > 2^60
        else if (E >= 60 && a < 8.673617379884035e-19f) { dzr = ldexpf(dzr, 60); dzi = ldexpf(dzi, 60); E -= 60; }  // up: keep "+1" representable
        if (E > 120) { st = 2; break; }                                       // beyond the supported range: fail explicitly
    }
    st_out[i] = st; it_out[i] = (st == 1) ? k + 1 : -1; az_out[i] = sqrtf(zr * zr + zi * zi); adz_out[i] = hypotf(dzr, dzi); E_out[i] = E; reb_out[i] = reb;
}
'''
_K = cp.RawKernel(SRC, 'pert', options=('--fmad=false',))  # no FMA contraction: reproducible float32 arithmetic
KHASH = hashlib.sha256(SRC.encode()).hexdigest()[:16]

def ref_orbit(C, nmax):
    """Reference orbit Z_0..Z_m in float64 (host), m = escape index or nmax. Returns (complex128 array, escaped)."""
    Z = np.empty(nmax + 1, complex); z = 0j; Z[0] = 0
    for k in range(nmax):
        z = z * z + C; Z[k + 1] = z
        if abs(z) > R: return Z[:k + 2], True
    return Z, False

def proven_interior(c):
    x, y = c.real, c.imag; xq = x - 0.25; q = xq * xq + y * y
    return (q * (q + xq) < 0.25 * y * y * (1 - 1e-9)) | ((x + 1) ** 2 + y * y < 0.0625 * (1 - 1e-9))

def dser(C, delta, U, N=32768, ref=None, block=128):
    """D in metres for c = C + delta (delta complex128, formed in float64 from local coordinates). Returns (D, info)."""
    nmax = max(131072, 4 * N); delta = np.asarray(delta, complex).ravel(); D = np.full(delta.size, np.nan)
    if ref is None: ref = ref_orbit(complex(C), nmax)
    Zh, _ = ref; mref = len(Zh) - 1; pi = proven_interior(complex(C) + delta); D[pi] = 0.0; todo = np.flatnonzero(~pi)
    it = np.full(delta.size, -2, np.int32); status = np.full(delta.size, 3, np.int32)  # 3 proven interior
    reb = np.zeros(delta.size, np.int32); E = np.zeros(delta.size, np.int32)
    if todo.size:
        Zg = cp.asarray(np.c_[Zh.real, Zh.imag].astype(np.float32)).view(cp.complex64).ravel()
        dg = cp.asarray(np.c_[delta[todo].real, delta[todo].imag].astype(np.float32)).view(cp.complex64).ravel(); n = todo.size
        so = cp.empty(n, cp.int32); io = cp.empty(n, cp.int32); az = cp.empty(n, cp.float32); adz = cp.empty(n, cp.float32); Eo = cp.empty(n, cp.int32); ro = cp.empty(n, cp.int32)
        _K(((n + block - 1) // block,), (block,), (Zg, np.int32(mref), dg, np.int32(n), np.int32(nmax), np.float32(R * R), so, io, az, adz, Eo, ro))
        so, io, az, adz, Eo, ro = (a.get() for a in (so, io, az, adz, Eo, ro)); esc = so == 1
        a = az[esc].astype(float); q = a * np.log(a) / adz[esc].astype(float)          # quotient first, then the exponent (no overflow)
        D[todo[esc]] = np.ldexp(q, -Eo[esc]) / U; it[todo] = io; reb[todo] = ro; E[todo] = Eo; status[todo] = so
    return D, dict(status=status, it=it, reb=reb, E=E, mref=mref, ref_escaped=bool(ref[1]), khash=KHASH)
