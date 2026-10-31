#!/usr/bin/env python3
"""Experimental source-to-parent creation; not imported by the Landscape app."""
from pathlib import Path
import argparse, hashlib, json, os, sys, time
sys.dont_write_bytecode = True
from source_recipe import validate, load_json, canonical, key, preflight, parent_definition, Unsupported

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent.parent

def file_hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def array_hash(array):
    header = dict(dtype='<f8', shape=list(array.shape), order='C')
    return hashlib.sha256(canonical(header) + b'\0' + array.tobytes(order='C')).hexdigest()

def write_json(path, value):
    Path(path).write_bytes(canonical(value) + b'\n')

def verify_bundle(root):
    root = Path(root).resolve(); manifest = load_json(root / 'bundle.json')
    if set(manifest) != {'schema', 'schemaVersion', 'files'} or manifest['schema'] != 'atlas.generation.source-bundle' or manifest['schemaVersion'] != 1:
        raise ValueError('Invalid bundle manifest')
    files = manifest['files']
    if type(files) is not dict or set(files) not in [{'recipe.json', 'result.json'}, {'recipe.json', 'result.json', 'height.npy'}]:
        raise ValueError('Invalid bundle files')
    for name, digest in files.items():
        if (root / name).resolve().parent != root or file_hash(root / name) != digest:
            raise ValueError('Bundle file integrity mismatch: ' + name)
    recipe = validate(load_json(root / 'recipe.json')); result = load_json(root / 'result.json')
    if result['requestKey'] != key(recipe):
        raise ValueError('Request key mismatch')
    if result['status'] == 'resolved':
        if 'height.npy' not in files:
            raise ValueError('Resolved bundle missing height')
        import numpy as np
        height = np.load(root / 'height.npy', allow_pickle=False)
        n = recipe['grid']['cells'] + 1
        if height.dtype.str != '<f8' or height.shape != (n, n) or not height.flags.c_contiguous or not np.isfinite(height).all() or np.signbit(height[height == 0]).any():
            raise ValueError('Invalid height array')
        expected = parent_definition(recipe, array_hash(height))
        if canonical(result['definition']) != canonical(expected):
            raise ValueError('Resolved definition mismatch')
    elif result['status'] not in ['unsupported', 'unresolved', 'failed'] or result['definition'] is not None or 'height.npy' in files:
        raise ValueError('Nonresolved bundle cannot grant a surface')
    return dict(verified=True, status=result['status'], requestKey=result['requestKey'],
                definitionKey=result['definition']['definitionKey'] if result['definition'] else None)

def install_guard(output):
    blocked = [Path('/mnt/ml_storage/scratch') / n for n in
               ['valley-spike', 'atlas-world-bw1', 'atlas-multiscale-pr8', 'atlas-bw1-runtime-r1']]
    blocked.append(HERE / 'regression-world')
    reads = set()
    def audit(event, args):
        if event != 'open' or not isinstance(args[0], (str, bytes, os.PathLike)):
            return
        path = Path(os.fsdecode(args[0])).resolve()
        writing = bool(args[2] & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND))
        if any(path.is_relative_to(p) for p in blocked):
            raise PermissionError('Historical fixture read refused: ' + str(path))
        if writing and not path.is_relative_to(output):
            raise PermissionError('Creator write outside owned output: ' + str(path))
        if not writing and path.is_relative_to(PROJECT):
            reads.add(str(path.relative_to(PROJECT)))
    sys.addaudithook(audit)
    return reads, blocked

def create(recipe, output, chunk, reverse=False):
    output = Path(output).resolve()
    scratch = Path('/mnt/ml_storage/scratch')
    if not output.is_relative_to(scratch) or output == scratch:
        raise ValueError('Explicit private scratch output required')
    output.mkdir(parents=True, exist_ok=False)
    bundle = output / 'bundle'; bundle.mkdir()
    write_json(bundle / 'recipe.json', recipe)
    result = dict(status='failed', reason=None, requestKey=key(recipe), definition=None,
                  pid=os.getpid(), cudaImported=False)
    start = time.monotonic()
    try:
        prepared = preflight(recipe)
    except Unsupported as e:
        result.update(status='unsupported', reason=str(e), elapsedS=time.monotonic()-start)
        return publish(bundle, result)
    if not os.environ.get('ATLAS_GPU_HANDOFF') or os.environ.get('ATLAS_GPU_DEFERRED'):
        raise ValueError('Native creation needs an exclusive GPU lock and one handoff')
    for name in ['tmp', 'cupy-cache', 'cuda-cache']:
        (output / name).mkdir()
    os.environ.update(TMPDIR=str(output / 'tmp'), CUPY_CACHE_DIR=str(output / 'cupy-cache'),
                      CUDA_CACHE_PATH=str(output / 'cuda-cache'))
    reads, blocked = install_guard(output)
    sys.path.insert(0, str(HERE / 'native'))
    import numpy as np
    import cupy as cp
    import fkern
    if Path(fkern.__file__).resolve() != HERE / 'native/fkern.py':
        raise ValueError('Unexpected kernel source')
    result['cudaImported'] = True
    real, imag = np.meshgrid(np.array(prepared['real'], dtype=np.float64), np.array(prepared['imag'], dtype=np.float64))
    cr, ci = real.ravel(), imag.ravel(); count = cr.size
    # Host operations are separate NumPy ufuncs; no CuPy coordinate or interior expressions.
    xq = cr - .25; q = xq*xq + ci*ci
    interior = (q*(q+xq) < .25*ci*ci*(1-1e-9)) | ((cr+1)*(cr+1)+ci*ci < .0625*(1-1e-9))
    status = np.where(interior, 3, 0).astype(np.int32)
    iterations = np.full(count, -2, dtype=np.int32)
    distance = np.where(interior, 0., np.nan)
    todo = np.flatnonzero(~interior)
    if reverse:
        todo = todo[::-1].copy()
    for first in range(0, len(todo), chunk):
        ids = todo[first:first+chunk]; n = len(ids)
        so = cp.empty(n, cp.int32); io = cp.empty(n, cp.int32); dd = cp.empty(n, cp.float64)
        fkern._K(((n+127)//128,), (128,), (cp.asarray(np.ascontiguousarray(cr[ids])),
                 cp.asarray(np.ascontiguousarray(ci[ids])), np.int32(n),
                 np.int32(recipe['numerics']['maxIterations']), np.float64(1e12), so, io, dd))
        status[ids] = so.get(); iterations[ids] = io.get(); distance[ids] = dd.get()/prepared['unit']
    transfer = prepared['transfer']
    height = transfer['referenceHeightM'] - transfer['slope']*(distance-transfer['referenceDistanceM'])
    height[height == 0] = 0.
    n = recipe['grid']['cells'] + 1
    height = np.ascontiguousarray(height.reshape(n, n), dtype='<f8')
    counts = {str(k): int(np.count_nonzero(status == k)) for k in [0, 1, 3, 4]}
    good = np.isin(status, [1, 3]).all() and np.isfinite(distance).all() and np.isfinite(height).all()
    if good:
        np.save(bundle / 'height.npy', height, allow_pickle=False)
        result.update(status='resolved', reason=None, definition=parent_definition(recipe, array_hash(height)))
    else:
        failed = counts['4'] or not np.isin(status, [0, 1, 3, 4]).all() or np.any(np.isin(status, [1, 3]) & (~np.isfinite(distance) | ~np.isfinite(height.ravel())))
        result.update(status='failed' if failed else 'unresolved', reason='nonfinite evaluation' if failed else 'unknown required samples')
    np.savez(output / 'diagnostics.npz', distance=distance.reshape(n, n), status=status.reshape(n, n),
             iterations=iterations.reshape(n, n))
    device = cp.cuda.runtime.getDeviceProperties(0)['name']
    if isinstance(device, bytes):
        device = device.decode()
    sources = ['src/space/generation/source-recipe.js', 'scripts/generation/source_recipe.py',
               'scripts/generation/create-parent.py', 'scripts/generation/native/fkern.py']
    result.update(sampleCount=count, counts=counts, maxRoundoffFraction=prepared['maxRoundoffFraction'],
                  elapsedS=time.monotonic()-start,
                  provenance=dict(device=device, python=sys.version.split()[0], numpy=np.__version__, cupy=cp.__version__,
                                  chunkSize=chunk, reverse=reverse, kernelOptions=['--fmad=false'],
                                  sources={p:file_hash(PROJECT / p) for p in sources},
                                  observedFirstPartyReads=sorted(reads), fixtureReadGuard=[str(p) for p in blocked],
                                  guardScope='Python audit hooks for these known fixtures and task writes; native C IO is not a universal allowlist.'))
    return publish(bundle, result)

def publish(bundle, result):
    write_json(bundle / 'result.json', result)
    names = ['recipe.json', 'result.json'] + (['height.npy'] if result['status'] == 'resolved' else [])
    write_json(bundle / 'bundle.json', dict(schema='atlas.generation.source-bundle', schemaVersion=1,
                                          files={n:file_hash(bundle / n) for n in names}))
    return result

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('recipe', nargs='?'); p.add_argument('--out'); p.add_argument('--inspect', action='store_true')
    p.add_argument('--verify'); p.add_argument('--chunk-size', type=int, default=4096); p.add_argument('--reverse', action='store_true')
    args = p.parse_args()
    if args.verify:
        print(json.dumps(verify_bundle(args.verify))); return
    recipe = validate(load_json(args.recipe))
    if args.inspect:
        try:
            prepared = preflight(recipe); status='supported'; reason=None
        except Unsupported as e:
            status='unsupported'; reason=str(e)
        print(json.dumps(dict(status=status, reason=reason, requestKey=key(recipe), canonical=canonical(recipe).decode(), cudaImported=False))); return
    if not args.out or not 1 <= args.chunk_size <= 65536:
        raise ValueError('New output and bounded chunk size required')
    result = create(recipe, args.out, args.chunk_size, args.reverse)
    print(json.dumps({k:result.get(k) for k in ['status', 'reason', 'pid', 'requestKey', 'sampleCount', 'counts', 'cudaImported', 'elapsedS']}))

if __name__ == '__main__':
    main()
