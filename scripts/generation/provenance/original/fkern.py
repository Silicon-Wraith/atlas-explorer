# R1 fallback F: GPU float64 direct iteration with dek semantics (pool/pipeline/dek.py _iter + h1lib.Dser):
# dz <- 2 z dz + 1 (before z), z <- z^2 + c, escape at first |z| > R = 1e6 (it = k+1), D_c = |z| ln|z| / |dz|; N then re-check to 131072
# (one deterministic run to max(131072, 4N) is equivalent); proven interior (dek closed form, host-equivalent) -> 0; no escape -> unknown.
# c is reconstructed in float64 from the local coordinates: c = C + U(u + iv) (as h1lib: C + U * (u + 1j v)).
import cupy as cp, numpy as np
R = 1e6
SRC = r'''
#include <cuda/std/complex>
// status: 1 escaped (D finite), 0 no escape by nmax (unknown), 4 failed (non-finite state or non-finite D)
extern "C" __global__ void fdirect(const double* __restrict__ cr, const double* __restrict__ ci, const int n, const int nmax, const double R2,
                                   int* st_out, int* it_out, double* D_out) {
    int i = blockDim.x * blockIdx.x + threadIdx.x; if (i >= n) return;
    const double xr = cr[i], xi = ci[i]; double zr = 0.0, zi = 0.0, dr = 0.0, di = 0.0; int st = 0, k;
    for (k = 0; k < nmax; k++) {
        double ndr = 2.0 * (zr * dr - zi * di) + 1.0, ndi = 2.0 * (zr * di + zi * dr); dr = ndr; di = ndi;
        double nzr = zr * zr - zi * zi + xr, nzi = 2.0 * zr * zi + xi; zr = nzr; zi = nzi;
        double a2 = zr * zr + zi * zi;
        if (!isfinite(a2) || !isfinite(dr) || !isfinite(di)) { st = 4; break; }
        if (a2 > R2) { st = 1; break; }
    }
    double D = nan("");
    if (st == 1) { double az = hypot(zr, zi); D = az * log(az) / hypot(dr, di); if (!isfinite(D)) st = 4; }
    st_out[i] = st; it_out[i] = (st == 1) ? k + 1 : -1; D_out[i] = (st == 1) ? D : nan("");
}
'''
_K = cp.RawKernel(SRC.replace('#include <cuda/std/complex>\n', ''), 'fdirect', options=('--fmad=false',))
def proven_interior(x, y):
    xq = x - 0.25; q = xq * xq + y * y; return (q * (q + xq) < 0.25 * y * y * (1 - 1e-9)) | ((x + 1) ** 2 + y * y < 0.0625 * (1 - 1e-9))
def fdser(C, U, u, v, nmax=131072):
    """u, v cupy float64 local coords. Returns (D metres; 0 proven interior; NaN otherwise non-value), status (1 esc, 0 unknown, 3 interior, 4 failed), it."""
    u = cp.asarray(u, cp.float64).ravel(); v = cp.asarray(v, cp.float64).ravel(); n = u.size
    c = complex(C) + U * (u + 1j * v); x = cp.ascontiguousarray(c.real); y = cp.ascontiguousarray(c.imag); pi = proven_interior(x, y)
    st = cp.full(n, 3, cp.int32); it = cp.full(n, -2, cp.int32); D = cp.zeros(n, cp.float64); todo = cp.flatnonzero(~pi); m = int(todo.size)
    if m:
        s_ = cp.empty(m, cp.int32); i_ = cp.empty(m, cp.int32); d_ = cp.empty(m, cp.float64)
        _K(((m + 127) // 128,), (128,), (cp.ascontiguousarray(x[todo]), cp.ascontiguousarray(y[todo]), np.int32(m), np.int32(nmax), np.float64(R * R), s_, i_, d_))
        st[todo] = s_; it[todo] = i_; D[todo] = d_ / U
    return D, st, it
