"""PC2 live wrapper around the immutable BW1/PR8 builders. JSON lines, one job."""
from pathlib import Path
import argparse, contextlib, hashlib, importlib.metadata, json, os, sys, time, traceback, uuid
from types import SimpleNamespace


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--bundle', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    bundle = Path(args.bundle).resolve()
    output = Path(args.output).resolve()
    output.relative_to('/mnt/ml_storage/scratch')
    output.mkdir(parents=True, exist_ok=False)
    import numpy as np
    code_root = Path(__file__).resolve().parents[1] / 'generation/native'
    os.environ['ATLAS_GENERATION_BUNDLE'] = str(bundle)
    os.environ['ATLAS_GENERATION_OUTPUT'] = str(output)
    sys.path.insert(0, str(code_root))
    import generation_paths as P
    P.configure_packages(); P.install_io_guard()
    definition = P.validate_inputs()
    import cache_bw1 as C
    import world_grid as GRID
    from region_class import classify
    import cache_r0 as F
    F.field = C.field; F.validation = C.validation; F.topology = C.topology
    import cache_view as V
    V.field = V.Cache(0); V.validation = V.Cache(0); V.topology = V.Cache(0)
    W = C.B.W
    assert C.B.CONTENT_ID == F.B.CONTENT_ID == V.B.CONTENT_ID == definition['id']
    graphs = [('bw1_adaptive_graph', C.B.G), ('adaptive_graph_pr3', F.B.G), ('bw1_view_graph', V.B.G)]
    assert len({id(module) for _, module in graphs}) == 3
    assert len({Path(module.__file__).resolve() for _, module in graphs}) == 1
    assert F.field is C.field and F.validation is C.validation and F.topology is C.topology
    assert V.field.limit == V.validation.limit == V.topology.limit == 0
    source_rows, module_rows = P.owned_provenance(graphs)
    package_files = [Path(C.B.G.M.__file__), Path(sys.modules[C.B.G.Martini.__module__].__file__)]
    source_rows += [{'role': 'external-package/' + p.name, 'file': str(p), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in package_files]
    source_rows.append({'role': 'native-worker.py', 'file': str(Path(__file__).resolve()), 'sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()})
    assert len({r['role'] for r in source_rows}) == len(source_rows)
    source_files = source_rows
    source_rows = [{k: row[k] for k in ('role', 'sha256')} for row in source_files]
    epoch = 0; instance = str(uuid.uuid4()); jobs = 0
    emit = lambda value: print(json.dumps(value, allow_nan=False), flush=True)
    observed = {}
    for name, cache in [('coarse', C), ('fine', F), ('view', V)]:
        original = cache.B.G.tile_mesh
        observed[name] = set()
        def traced(martini, height, tolerance, _original=original, _name=name):
            observed[_name].add(float(tolerance))
            return _original(martini, height, tolerance)
        cache.B.G.tile_mesh = traced
    approach = json.loads(P.asset('approach-r1.json').read_text())
    emit({'type': 'ready', 'producer': {'instanceId': instance, 'epoch': epoch}, 'definition': definition,
          'grid': {'origin': GRID.ORIGIN.tolist(), 'axes': [GRID.TANGENT.tolist(), GRID.BINORMAL.tolist(), GRID.NORMAL.tolist()], 'diameter': GRID.D},
          'approach': approach, 'sources': source_rows, 'sourceFiles': source_files,
          'device': {'name': str(C.B.S.cp.cuda.runtime.getDeviceProperties(0)['name']), 'index': C.B.S.cp.cuda.runtime.getDevice()},
          'ownership': {'modules': module_rows, 'inputs': [str(p) for p in sorted(P.read_inputs)], 'graphsDistinct': True, 'sharedInteractionCaches': True, 'viewCachesDisabled': True},
          'cacheLimits': {'source': C.field.limit, 'validation': C.validation.limit, 'topology': C.topology.limit},
          'packages': {'numpy': np.__version__, **{name: importlib.metadata.version(name) for name in ['manifold3d', 'pymartini', 'scipy', 'cupy-cuda13x']}}})
    try:
        for line in sys.stdin:
            req = None
            try:
                req = json.loads(line)
                if req.get('type') == 'stop': break
                if req.get('type') == 'reset':
                    C.reset(); F.reset(); V.reset(); epoch += 1
                    emit({'type': 'reset', 'producer': {'instanceId': instance, 'epoch': epoch}}); continue
                assert req['producer'] == {'instanceId': instance, 'epoch': epoch}, 'stale producer'
                assert jobs < 512, 'native job budget'
                kind = req['kind']; assert kind in ('coarse', 'fine', 'view')
                A = {'coarse': C, 'fine': F, 'view': V}[kind]; B = A.B
                origin = np.array(req['originM'], dtype=float)
                assert origin.shape == (3,) and np.isfinite(origin).all()
                if kind == 'fine': assert np.array_equal(origin, np.array(approach['fine_origin']))
                address = tuple(req.get('address', (0, 0, 0)))
                assert len(address) == 3 and all(isinstance(n, int) for n in address)
                # Existing builders validate through these two functions. This is
                # a request adapter only: canonical field/source code is untouched.
                if kind != 'fine': B.world_grid = SimpleNamespace(decode=lambda _: address, center=lambda _: origin)
                jobdir = output / ('job-' + str(jobs)); jobs += 1; jobdir.mkdir()
                label = 'region10' if kind == 'fine' else 'region' + str(jobs)
                B.HERE = jobdir; B.REQUESTS = [(label, 0. if kind == 'fine' else origin)]
                B.G.DENSE_VALIDATION = bool(req.get('denseValidation', False))
                B.source_tiles.clear(); B.topology_tiles.clear(); observed[kind].clear()
                before_calls = A.actual_field_calls; before_points = A.actual_field_points
                before_evictions = C.field.evictions; start = time.time() * 1000
                with (jobdir / 'build.stdout').open('w') as log, contextlib.redirect_stdout(log): code = B.run()
                if code: raise ValueError('native construction failed: ' + (jobdir / 'build-result-r1.json').read_text()[-4000:])
                stem = jobdir / ('mesh-' + label + '-r0')
                m = json.loads(stem.with_suffix('.json').read_text())
                structural_start = time.time() * 1000
                with np.load(stem.with_suffix('.npz')) as z:
                    vertices = z['vertices']; faces = z['triangles']; visible = z['collision_triangles']
                    assert np.isfinite(vertices).all()
                    if len(faces):
                        assert faces.max() < len(vertices)
                        edges = np.sort(np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]]), axis=1)
                        _, counts = np.unique(edges, axis=0, return_counts=True)
                        assert np.all(counts == 2), 'unpaired closed-solid edges'
                        tri = vertices[faces]
                        volume = abs(float(np.einsum('ij,ij->i', tri[:, 0], np.cross(tri[:, 1], tri[:, 2])).sum() / 6))
                        del tri, edges, counts
                    else: volume = 0.
                    classification = classify(volume, len(faces), len(visible), (2 * m['half_extent']) ** 3)
                    del vertices, faces, visible
                cells, step, width = B.source_spec
                assert len(observed[kind]) == 1, 'missing/ambiguous actual RTIN policy'
                policy = {'cells': cells, 'stepM': step, 'tileWidthM': width, 'rtinToleranceM': next(iter(observed[kind])), 'coordinateType': 'float32-local-metres-per-unit'}
                buffers = []
                for role, suffix, expected in [('vertices', '.normalized.vertices.bin', m['vertices']), ('surface-indices', '.indices.bin', m['collision_triangles']), ('solid-indices', '.solid.bin', m['solid_triangles'])]:
                    path = Path(str(stem) + suffix); data = path.read_bytes(); assert len(data) == expected * 12
                    buffers.append({'role': role, 'byteLength': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'file': str(path)})
                    del data
                emit({'type': 'result', 'job': req['job'], 'identity': req['identity'], 'producer': req['producer'],
                      'status': 'prepared', 'kind': kind, 'meta': {'origin': m['origin'], 'diameter': m['diameter'], 'half_extent': m['half_extent'],
                      'classification': classification, 'volumeM3': volume, 'closedEdgePairs': True, 'sourceUnknown': 0, 'manifoldStatus': 'NoError',
                      'denseValidation': B.G.DENSE_VALIDATION, 'sampling': policy}, 'buffers': buffers, 'stem': str(stem),
                      'timings': {'nativeStart': start, 'nativeReady': time.time() * 1000, 'structuralMs': time.time() * 1000 - structural_start},
                      'fieldCalls': A.actual_field_calls - before_calls, 'fieldPoints': A.actual_field_points - before_points,
                      'interactionCacheEvictions': C.field.evictions - before_evictions,
                      'caches': {'source': C.field.report(), 'validation': C.validation.report(), 'topology': C.topology.report()},
                      'outputBytes': sum(p.stat().st_size for p in jobdir.iterdir() if p.is_file())})
                A.field_events.clear(); A.cache_events.clear()
            except Exception:
                emit({'type': 'result', 'job': req.get('job') if isinstance(req, dict) else None,
                      'identity': req.get('identity') if isinstance(req, dict) else None,
                      'producer': req.get('producer') if isinstance(req, dict) else None,
                      'status': 'unresolved' if 'Unresolved source' in traceback.format_exc() else 'failed', 'reason': traceback.format_exc()})
    finally:
        C.B.S.cp.cuda.get_current_stream().synchronize()
        C.B.S.cp.get_default_memory_pool().free_all_blocks()
        emit({'type': 'stopped', 'producer': {'instanceId': instance, 'epoch': epoch}})


if __name__ == '__main__': main()
