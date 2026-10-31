# Refinement card r2.1 numerical core (scratch). World mapping, DE, proven-interior tests, h transfer.
# Mapping (card): c(x, z) = cx + u(x - 1024) + i[cy - u(z - 1024)], u = 0.0016/2048, world [0, 2048]^2, x east, z south.
# DE (kept from oblique.py, the existing world's estimator): D_c = |z| ln|z| / |dz| at first |z| > R = 1e6, dz_0 = 0,
# dz <- 2 z dz + 1. This is HALF the Milnor estimate 2|z|ln|z|/|dz|. World units: D = D_c / u.
# Proven interior: main cardioid and period-2 disc only (closed-form). All other non-escapes are UNRESOLVED.
import numpy as np, os
from multiprocessing import Pool

W, U, R = 2048.0, 0.0016 / 2048, 1e6
A, K = 120.0, 0.7
S0 = W / 639
REGIONS = {'seahorse-tail': (-0.74364, 0.13182), 'elephant-trunk': (0.27500, 0.00680)}
# representation card: holdout screening selects regions via env HOLDOUT_REGION (a name in HOLDOUT_LIST); otherwise unchanged
HOLDOUT_LIST = {'triple-spiral valley': (-0.0880, 0.6540), 'quad-spiral valley': (0.2740, 0.4820), 'scepter valley': (-1.3600, 0.0050), 'west mini-brot neck': (-1.7490, 0.0000)}
if os.environ.get('HOLDOUT_REGION'): REGIONS = {os.environ['HOLDOUT_REGION']: HOLDOUT_LIST[os.environ['HOLDOUT_REGION']]}
# field card: HOLDOUT_CENTRE='cx,cy' with HOLDOUT_NAME overrides (construction centres from holdout-constructions.json)
if os.environ.get('HOLDOUT_CENTRE'): REGIONS = {os.environ['HOLDOUT_NAME']: tuple(float(v) for v in os.environ['HOLDOUT_CENTRE'].split(','))}
ESC, INT, UNRES = 0, 1, 2

def to_c(cx, cy, x, z):
    return (cx + U * (np.asarray(x, float) - 1024.0)) + 1j * (cy - U * (np.asarray(z, float) - 1024.0))

def proven_interior(c):
    x, y = c.real, c.imag; xq = x - 0.25; q = xq * xq + y * y
    card = q * (q + xq) < 0.25 * y * y * (1 - 1e-9)          # strict with a relative margin
    bulb = (x + 1) ** 2 + y * y < 0.0625 * (1 - 1e-9)
    return card | bulb

def _iter(args):
    c, maxit = args
    n = c.size; D = np.full(n, np.nan); it = np.full(n, -1, np.int64)
    idx = np.arange(n); z = np.zeros(n, complex); dz = np.zeros(n, complex); cc = c.copy(); k = 0
    while k < maxit and idx.size:
        steps = min(64, maxit - k)
        for s in range(steps):
            dz = 2 * z * dz + 1; z = z * z + cc
            esc = np.abs(z) > R
            if esc.any():
                az = np.abs(z[esc]); D[idx[esc]] = az * np.log(az) / np.abs(dz[esc]); it[idx[esc]] = k + s + 1
                keep = ~esc; idx, z, dz, cc = idx[keep], z[keep], dz[keep], cc[keep]
        k += steps
    return D, it

def de(c, maxit, procs=30):
    """c: complex array (any shape). Returns D_world, status, iterations (shape of c)."""
    shp = c.shape; c = c.ravel(); status = np.full(c.size, UNRES, np.int8)
    pi = proven_interior(c); status[pi] = INT
    todo = np.flatnonzero(~pi); D = np.full(c.size, np.nan); it = np.full(c.size, -1, np.int64)
    if todo.size:
        chunks = np.array_split(todo, max(1, min(procs * 4, todo.size // 2000 + 1)))
        with Pool(procs) as p:
            res = p.map(_iter, [(c[ch], maxit) for ch in chunks])
        for ch, (d, i) in zip(chunks, res):
            D[ch] = d; it[ch] = i
        status[todo[~np.isnan(D[todo])]] = ESC
    return (D / U).reshape(shp), status.reshape(shp), it.reshape(shp)

def height(Dw, status):
    h = A * (1 - np.tanh(K * Dw / A)); h = np.where(status == INT, A, h); h = np.where(status == UNRES, np.nan, h)
    return h

def level_grid(level, i0=0, i1=None, j0=0, j1=None):
    """World coordinates of level-l lattice points with integer indices [i0, i1] x [j0, j1] (inclusive); spacing s0/2^l."""
    n = 639 * 2 ** level; i1 = n if i1 is None else i1; j1 = n if j1 is None else j1; s = S0 / 2 ** level
    return np.arange(i0, i1 + 1) * s, np.arange(j0, j1 + 1) * s
