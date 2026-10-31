"""PR3 first discriminator: fixed chart tiles, actual H1C composition.

Preserves PR1 sources. No browser/prefetch or all-scale claim.
"""
from pathlib import Path
import sys, json, time, resource, hashlib, traceback
import numpy as np
from types import SimpleNamespace
import importlib.util,itertools
import view_grid as world_grid
from region_class import classify

HERE = Path(__file__).resolve().parent
ROOT = Path('/mnt/ml_storage/scratch/valley-spike/zoom2d/gpu/ia/rc1')
sys.path.insert(0,'/mnt/ml_storage/scratch/atlas-multiscale-pr8')
import descendant_world as W
S=SimpleNamespace(**W.S.__dict__)
S.values=W.values
CONTENT_ID=W.WORLD_ID
spec=importlib.util.spec_from_file_location('bw1_view_graph','/mnt/ml_storage/scratch/atlas-multiscale-pr8/adaptive_graph_pr3.py')
G=importlib.util.module_from_spec(spec);spec.loader.exec_module(G)
M = G.M


def fixed_axes(lo, hi, step, cells):
    # Each cutter's support is a fixed world/chart domain, including its last short tile.
    c = next(c for c in S.COMPONENTS if c['name'] == current_component)
    h = c['H']; width = cells * step
    start = int(round((lo + h) / width))
    end = int(np.ceil((hi + h) / width - 1e-10))
    assert end > start
    pieces = []
    for k in range(start, end):
        left = -h + k * width
        right = min(-h + (k + 1) * width, h)
        pieces.append(left + np.arange(cells, dtype=np.float64) * ((right - left) / cells))
    return np.concatenate(pieces + [np.array([min(-h + end * width, h)])])


G.axis_blocks = fixed_axes
original_tile_mesh = G.tile_mesh
source_tiles = {}
topology_tiles = {}
current_tile = None
current_side = 0
current_component = None
current_label = None
source_spec = None


def digest(a):
    return hashlib.sha256(np.ascontiguousarray(a).tobytes()).hexdigest()


def record_tile(martini, heights, tolerance):
    global current_side
    i, j, f = original_tile_mesh(martini, heights, tolerance)
    key = (CONTENT_ID, source_spec, current_component, current_tile, current_side)
    value = (digest(heights), digest(i), digest(j), digest(f))
    if key in topology_tiles and topology_tiles[key]['hashes'] != value:
        raise ValueError(f'Shared tile topology mismatch: {key}')
    entry = topology_tiles.setdefault(key, {'hashes': value, 'patches': []})
    entry['patches'].append(current_label)
    current_side += 1
    return i, j, f


G.tile_mesh = record_tile


REQUESTS = []

def run():
    global current_tile, current_side, current_component, current_label, source_spec
    if (HERE / 'build-result-r1.json').exists():
        raise FileExistsError('Preserve evidence')
    if not REQUESTS:raise ValueError('Explicit coordinate requests required')
    diam=.10625;half=diam;step=diam/256;tile_width=diam;source_spec=(256,step,tile_width)
    result = {'started_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'diameter': diam,
              'step': step, 'tile_cells': 256, 'rows': [], 'cleanup': False,
              'sources': {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in
                          [Path(__file__), Path(G.__file__), Path(S.__file__), ROOT / 'construction.json']},
              'world_identity': CONTENT_ID, 'descendant_spec': W.SPEC, 'dense_validation': G.DENSE_VALIDATION, 'scope': 'Fresh requested parent and cutters; process/kernel may be warm. No copied parent-reference artifact. Readiness measured separately.'}
    try:
        warm = time.perf_counter()
        for c in S.COMPONENTS:
            S.values(c, np.array([.031]), np.array([.023]), True)
        result['warmup_s'] = time.perf_counter() - warm
        for label, requested_origin in REQUESTS:
            current_label = label
            index=int(label.removeprefix('region'));address=world_grid.decode(index)
            origin=np.array(requested_origin,dtype=float)
            if origin.shape!=(3,) or not np.isfinite(origin).all() or not np.allclose(origin,world_grid.center(index),rtol=0,atol=1e-11):raise ValueError('Origin must match canonical world address')
            stem = HERE / f'mesh-{label}-r0'
            begin = time.perf_counter(); components = []; composed = None
            for c in S.COMPONENTS:
                current_component = c['name']
                bounds = S.footprint(c, origin, half / 4)
                if bounds is None:
                    components.append({'component': c['name'], 'skipped': 'support/envelope disjoint'})
                    continue
                # Full rectangular ranges of support-anchored tiles, including a shorter last tile.
                required = bounds.copy()
                bounds[[0, 2]] = -c['H'] + np.maximum(0, np.floor((bounds[[0, 2]] - step + c['H']) / tile_width)) * tile_width
                bounds[[1, 3]] = np.minimum(c['H'], -c['H'] + np.ceil((bounds[[1, 3]] + step + c['H']) / tile_width) * tile_width)
                assert np.all(bounds[[0, 2]] <= required[[0, 2]]) and np.all(bounds[[1, 3]] >= required[[1, 3]])
                def values(a, b):
                    global current_tile, current_side
                    current_tile = (int(round((a[0, 0] + c['H']) / tile_width)), int(round((b[0, 0] + c['H']) / tile_width)))
                    current_side = 0
                    lo, hi, stats = S.values(c, a, b, True)
                    if stats['unknown']:
                        raise ValueError('Unresolved source values')
                    key = (CONTENT_ID, source_spec, c['name'], current_tile)
                    hashes = (digest(a), digest(b), digest(lo), digest(hi) if hi is not None else None)
                    if key in source_tiles and source_tiles[key]['hashes'] != hashes:
                        raise ValueError(f'Shared source mismatch {key}')
                    entry = source_tiles.setdefault(key, {'hashes': hashes, 'patches': []})
                    entry['patches'].append(label)
                    return lo, hi
                def probe(a, b, kind):
                    return c['htop'] * S.taper(a / c['H']) * S.taper(b / c['H']) if kind == 'cap' else S.values(c, a, b, True)[0]
                bottom=float(np.min((origin+np.array(list(itertools.product((-half,half),repeat=3)))-c['F'])@c['n'])) if c['name']=='parent' else None
                solid, metrics = G.build_graph(bounds, step, diam, c, origin, values, probe,bottom_limit=bottom)
                row = {'component': c['name'], 'bounds': bounds.tolist(), **metrics}
                if G.DENSE_VALIDATION and (not row['graph_probe_pass'] or not row['source_probe_pass']):
                    result['failed_component'] = row
                    raise ValueError('Frozen graph/source probe gate failed')
                t = time.perf_counter()
                solid = solid ^ M.Manifold.cube((2 * half,) * 3, center=True); solid.num_tri()
                row['clip_s'] = time.perf_counter() - t
                t = time.perf_counter(); composed = solid if composed is None else composed - solid; composed.num_tri()
                row['boolean_s'] = time.perf_counter() - t
                if composed.status() != M.Error.NoError:
                    raise ValueError(str(composed.status()))
                components.append(row)
            mesh = composed.to_mesh64(); v = np.asarray(mesh.vert_properties)[:, :3].copy(); f = np.asarray(mesh.tri_verts, dtype=np.uint32).copy()
            fv = v[f]
            closure = np.any(np.all(np.abs(np.abs(fv) - half) <= max(half * 1e-8, 1e-12), axis=1) & np.all(np.sign(fv) == np.sign(fv[:, 0:1, :]), axis=1), axis=1)
            real = f[~closure]
            volume=float(composed.volume());region_class=classify(volume,len(f),len(real),(2*half)**3)
            np.savez(stem.with_suffix('.npz'), vertices=v, triangles=f, collision_triangles=real, origin=origin)
            (v / diam).astype(np.float32).tofile(stem.with_suffix('.normalized.vertices.bin'))
            real.tofile(stem.with_suffix('.indices.bin')); f.tofile(stem.with_suffix('.solid.bin'))
            row = {'fixture': 'bw1-actual-coordinate', 'scale': 4, 'patch': label, 'diameter': diam, 'origin': origin.tolist(), 'half_extent': half, 'world_identity': CONTENT_ID, 'descendant_spec': W.SPEC,
                   'components': components, 'mesh_ready_lower_bound_s': time.perf_counter() - begin,
                   'address':list(address),'region_class':region_class,'volume_m3':volume,'vertices': len(v), 'solid_triangles': len(f), 'collision_triangles': len(real),
                   'rss_peak_mb': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024,
                   'gpu_pool_bytes': S.cp.get_default_memory_pool().total_bytes()}
            stem.with_suffix('.json').write_text(json.dumps(row, indent=2) + '\n')
            result['rows'].append(row)
            print(json.dumps({k: v for k, v in row.items() if k != 'components'}), flush=True)
        result['passed_build_screen'] = True
    except Exception:
        result['failure'] = traceback.format_exc(); result['passed_build_screen'] = False
        print(result['failure'], flush=True)
    finally:
        S.cp.cuda.get_current_stream().synchronize(); S.cp.get_default_memory_pool().free_all_blocks()
        result['cleanup'] = True
        result['shared_source_tiles'] = [{'key': str(k), **v} for k, v in source_tiles.items()]
        result['shared_topology_tiles'] = [{'key': str(k), **v} for k, v in topology_tiles.items()]
        result['rss_peak_mb'] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
        (HERE / 'build-result-r1.json').write_text(json.dumps(result, indent=2) + '\n')
    return 0 if result['passed_build_screen'] else 3


if __name__ == '__main__':
    raise SystemExit(run())
