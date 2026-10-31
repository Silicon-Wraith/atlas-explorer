# H1 (card r2): parent graph carve on the Z1 base, child carve on the parent's generated surface along a fixed chart normal n1.
import sys, json, numpy as np
sys.path.insert(0, '/mnt/ml_storage/scratch/valley-spike/pool/pipeline'); import dek
from multiprocessing import Pool
from scipy.interpolate import RegularGridInterpolator as RGI
Z1 = '/mnt/ml_storage/scratch/valley-spike/zoom2d/z1/'
fr = json.load(open('/mnt/ml_storage/scratch/valley-spike/surface/frame.json')); NRM = np.array(fr['normal']); UA = np.array(fr['u']); VA = np.array(fr['v'])
Bz = np.load(Z1 + 'base.npz'); O = Bz['o']; T0 = RGI((Bz['g'], Bz['g']), Bz['t0'], bounds_error=False, fill_value=np.nan)
CS = complex(*json.load(open(Z1 + 'levels.json'))['seed']['c']); U = dek.U
A0, L0, H0 = 1.2, 0.85, 5.0; A1, L1, H1 = 0.3, 0.2125, 0.85; N0 = 32768
def Dser(c, N=N0):
    """Escape-time distance estimate in metres (serial). Proven interior -> 0; non-escape at N and at 131072 -> NaN (unknown)."""
    c = np.asarray(c, complex).ravel(); D = np.full(c.size, np.nan); pi = dek.proven_interior(c); D[pi] = 0.0; todo = np.flatnonzero(~pi)
    if todo.size:
        d, _ = dek._iter((c[todo], N)); D[todo] = d / U; re = todo[np.isnan(d)]
        if re.size: d2, _ = dek._iter((c[re], max(131072, 4 * N))); D[re] = d2 / U
    return D
def taper(s):
    s = np.abs(s); return np.where(s <= 0.8, 1.0, np.where(s >= 1.0, 0.0, 0.5 + 0.5 * np.cos(np.pi * (s - 0.8) / 0.2)))
def h0(u, v, N=N0):
    return -A0 * taper(u / H0) * taper(v / H0) * np.exp(-Dser(CS + U * (np.asarray(u) + 1j * np.asarray(v)), N) / L0)
def X0(u, v, N=N0):
    u = np.asarray(u, float); v = np.asarray(v, float); s = T0(np.c_[u, v]) + h0(u, v, N); return O + u[:, None] * UA + v[:, None] * VA + s[:, None] * NRM
def par_solid(q, N=N0):
    """Parent solid at world points q -> (solid bool, unknown bool)."""
    r = q - O; u, v, dp = r @ UA, r @ VA, r @ NRM; t = T0(np.c_[u, v]); hh = h0(u, v, N); unk = np.isnan(hh); out = np.isnan(t)
    s = dp - np.nan_to_num(t) <= np.nan_to_num(hh, nan=0.0); s = np.where(unk, True, s) & ~out; return s, unk & ~out
# ---- child frame (set by construct.py, loaded here when available)
try:
    CH = json.load(open('child.json')); F1 = np.array(CH['F1']); N1 = np.array(CH['n1']); U1 = np.array(CH['u1']); V1 = np.array(CH['v1']); C1 = complex(*CH['C1'])
except Exception: CH = None
def g1(u1, v1, N=N0): return taper(np.asarray(u1) / H1) * taper(np.asarray(v1) / H1) * np.exp(-Dser(C1 + U * (np.asarray(u1) + 1j * np.asarray(v1)), N) / L1)
def _t1(a):
    u1, v1, N, step, tol = a; n = len(u1); o = F1 + u1[:, None] * U1 + v1[:, None] * V1; d = np.full(n, 2.0)
    s0, _ = par_solid(o + 2.0 * N1, N); ext_ok = ~s0; hit = np.zeros(n, bool); lo = np.full(n, np.nan); hi = np.full(n, np.nan); act = np.arange(n); unk_any = np.zeros(n, bool)
    while act.size:
        dn = d[act] - step; keep = dn >= -2.0; act, dn = act[keep], dn[keep]
        if act.size == 0: break
        s, uk = par_solid(o[act] + dn[:, None] * N1, N); unk_any[act[uk]] = True; hit[act[s]] = True; lo[act[s]] = dn[s]; hi[act[s]] = dn[s] + step; d[act] = dn; act = act[~s]
    b = np.flatnonzero(hit)
    while b.size:
        mid = 0.5 * (lo[b] + hi[b]); s, uk = par_solid(o[b] + mid[:, None] * N1, N); unk_any[b[uk]] = True; lo[b[s]] = mid[s]; hi[b[~s]] = mid[~s]; b = b[(hi[b] - lo[b]) > tol]
    # material check: 8 samples through [t1 - A1 - 0.05, t1)
    mat = np.zeros(n, bool); hb = np.flatnonzero(hit)
    if hb.size:
        ok = np.ones(hb.size, bool)
        for k in range(1, 9):
            s, uk = par_solid(o[hb] + (lo[hb] - k * (A1 + 0.05) / 8)[:, None] * N1, N); ok &= s & ~uk
        mat[hb] = ok
    return 0.5 * (lo + hi), hit, ext_ok, mat, unk_any
def par(fn, args_fn, n, procs=30):
    ch = [c for c in np.array_split(np.arange(n), procs * 4) if len(c)]
    with Pool(procs) as p: rs = p.map(fn, [args_fn(c) for c in ch])
    return [np.concatenate([r[k] for r in rs]) for k in range(len(rs[0]))]
def t1(u1, v1, N=N0, step=L1 / 16, tol=1e-6):
    u1 = np.asarray(u1, float).ravel(); v1 = np.asarray(v1, float).ravel()
    return par(_t1, lambda c: (u1[c], v1[c], N, step, tol), u1.size)
def _g1(a): u1, v1, N = a; return (g1(u1, v1, N),)
def g1p(u1, v1, N=N0):
    u1 = np.asarray(u1, float).ravel(); v1 = np.asarray(v1, float).ravel(); return par(_g1, lambda c: (u1[c], v1[c], N), u1.size)[0]
def relief_pts(P, ok, e):
    from scipy.spatial import cKDTree
    pts = P[ok]; tree = cKDTree(pts); cen = ok.copy(); cen[:16] = cen[49:] = False; cen[:, :16] = cen[:, 49:] = False; r = []
    for c in P[cen]:
        nb = pts[tree.query_ball_point(c, e)]
        if len(nb) >= 8: r.append(np.linalg.svd(nb - nb.mean(0), compute_uv=False)[-1] / np.sqrt(len(nb)) / e)
    return np.array(r) if r else np.array([np.nan])
