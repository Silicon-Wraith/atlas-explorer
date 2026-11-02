"""Inert imported recursive recipe: stdlib only, no native evaluator imports."""
import ast, copy, hashlib, io, math, re, struct, zipfile
from pathlib import Path
from source_recipe import canonical, key, object_keys, DECIMAL, integral

MAX_ASSET_BYTES = 32*1024*1024
SOURCE_FILES = ['native/h1lib.py', 'native/sampling_r0.py', 'native/descendant_world.py', 'native/dek.py', 'native/pert.py', 'native/fkern.py']
IMPORTED_FIELD = {'formula': 'z*z+c', 'derivative': 'before-z', 'escapeRadius': '1000000', 'distance': 'half-milnor-Dc-divide-U', 'unitsPerMetre': '7.8125e-07', 'initialIterations': 32768, 'recheckIterations': 131072, 'referenceOrbitIterations': 131072, 'interior': 'strict-cardioid-period2', 'interiorMargin': '0.000000001', 'interiorDistanceM': '0', 'coordinateArithmetic': 'legacy-binary64-source-bound', 'unknown': 'nan-no-surface', 'taper': {'flatUntil': '0.8', 'zeroFrom': '1', 'width': '0.2', 'shape': 'half-plus-half-cosine'}, 'carve': '-A*w*exp(-D/L)', 'cap': 'htop*w', 'gpuFallback': 'pert-status2-or-nonfinite-status1-to-direct-keep-finite1-or3', 'parentInterpolation': {'method': 'bilinear', 'axes': 'u,v', 'indexing': 'ij', 'outside': 'nan-unknown'}, 'importedParent': {'profile': 'legacy-ta-tilted-r0', 'coordinateArithmetic': 'legacy-float-grid', 'unknown': 'zero-substitution-before-TA', 'bisections': 36}}

def bounded_decimal(value, positive=False, finite=False):
    if type(value) is not str or len(value) > 4096:
        raise ValueError('Expected bounded ASCII decimal')
    m = DECIMAL.fullmatch(value)
    if not m or not (m[2] or m[3]) or len(m[2]) + len(m[3] or '') > 1024:
        raise ValueError('Decimal grammar/digit budget')
    exponent = (m[5] or '0').lstrip('0') or '0'
    if len(exponent) > 4 or int(exponent) > 2048:
        raise ValueError('Decimal exponent budget')
    if positive and (m[1] == '-' or not any(c in '123456789' for c in m[2] + (m[3] or ''))):
        raise ValueError('Expected positive decimal')
    if finite and (not math.isfinite(float(value)) or positive and float(value) <= 0):
        raise ValueError('Outside binary64 range')

def vector(value):
    if type(value) is not list or len(value) != 3:
        raise ValueError('Expected three decimal coordinates')
    for v in value:
        bounded_decimal(v, finite=True)
    return list(map(float, value))

def frame(value):
    object_keys(value, 'origin u v n'); vector(value['origin'])
    vs = [vector(value[k]) for k in ['u', 'v', 'n']]
    def dot(a, b):
        # Python 3.12+ sum uses compensated float summation. Match JS's explicit
        # left-to-right products/additions at the shared tolerance boundary.
        total = 0.
        for x, y in zip(a, b):
            total += x*y
        return total
    for i in range(3):
        if abs(math.sqrt(dot(vs[i], vs[i])) - 1) > 1e-12:
            raise ValueError('Frame norm')
        for j in range(i+1, 3):
            if abs(dot(vs[i], vs[j])) > 1e-12:
                raise ValueError('Frame orthogonality')

def digest(value):
    if type(value) is not str or not re.fullmatch('[a-f0-9]{64}', value):
        raise ValueError('Invalid SHA-256')

def identifier(value):
    if type(value) is not str or not re.fullmatch('[a-z][a-z0-9-]{0,63}', value):
        raise ValueError('Invalid component ID')

def validate(value):
    object_keys(value, 'schema schemaVersion generator field sourceBindings parentGrid components descendants composition')
    result = copy.deepcopy(value)
    if result['schema'] != 'atlas.generation.recursive-recipe' or integral(result['schemaVersion'], 1, 1) != 1:
        raise ValueError('Unsupported recursive schema/version')
    result['schemaVersion'] = 1
    object_keys(result['generator'], 'id version')
    if result['generator'] != dict(id='atlas.surface-descendant', version='imported-legacy-r1'):
        raise ValueError('Unsupported generator')
    field = result['field']
    # Normalise JSON-number counters, never real decimal strings or booleans.
    object_keys(field, ' '.join(IMPORTED_FIELD))
    for k in ['initialIterations', 'recheckIterations', 'referenceOrbitIterations']:
        field[k] = integral(field[k], IMPORTED_FIELD[k], IMPORTED_FIELD[k])
    object_keys(field['importedParent'], ' '.join(IMPORTED_FIELD['importedParent']))
    field['importedParent']['bisections'] = integral(field['importedParent']['bisections'], 36, 36)
    if canonical(field) != canonical(IMPORTED_FIELD):
        raise ValueError('Unsupported field rules')
    bindings = result['sourceBindings']
    if type(bindings) is not list or len(bindings) != len(SOURCE_FILES):
        raise ValueError('Six evaluator bindings required')
    for b, file in zip(bindings, SOURCE_FILES):
        object_keys(b, 'file sha256')
        if b['file'] != file:
            raise ValueError('Unsupported evaluator source')
        digest(b['sha256'])
    grid = result['parentGrid']; object_keys(grid, 'file sha256 arrays')
    if grid['file'] != 'base.npz':
        raise ValueError('Imported parent file must be base.npz')
    digest(grid['sha256']); object_keys(grid['arrays'], 'g t0 o')
    for a in grid['arrays'].values():
        object_keys(a, 'dtype shape order sha256')
        if a['dtype'] != '<f8' or a['order'] != 'C' or type(a['shape']) is not list:
            raise ValueError('Unsupported array layout')
        a['shape'] = [integral(n, 1, 4096) for n in a['shape']]; digest(a['sha256'])
    g, t, o = [grid['arrays'][k]['shape'] for k in ['g', 't0', 'o']]
    if len(g) != 1 or g[0] < 2 or o != [3] or t != [g[0], g[0]] or t[0]*t[1]*8 > MAX_ASSET_BYTES:
        raise ValueError('Inconsistent parent shape')
    components = result['components']
    if type(components) is not list or not 1 <= len(components) <= 32:
        raise ValueError('Component budget')
    seen = set()
    for i, c in enumerate(components):
        object_keys(c, 'id parent source frame halfSupportM amplitudeM lengthM capM'); identifier(c['id'])
        if c['id'] in seen or (c['parent'] is not None if i == 0 else type(c['parent']) is not str or c['parent'] not in seen):
            raise ValueError('Invalid ordered lineage')
        seen.add(c['id']); object_keys(c['source'], 're im')
        for x in c['source'].values():
            bounded_decimal(x)
        frame(c['frame'])
        for k in ['halfSupportM', 'amplitudeM', 'lengthM']:
            bounded_decimal(c[k], positive=True, finite=True)
        if i == 0:
            if c['capM'] is not None:
                raise ValueError('Parent must be uncapped')
        else:
            bounded_decimal(c['capM'], positive=True, finite=True)
    descendants = result['descendants']; component_ids = set(seen)
    if type(descendants) is not list or len(descendants) > 32:
        raise ValueError('Descendant budget')
    for d in descendants:
        object_keys(d, 'id parent chartCentreM halfSupportM amplitudeM sourceScale rule'); identifier(d['id'])
        if d['id'] in seen or type(d['parent']) is not str or d['parent'] not in component_ids or d['rule'] != 'surface-descendant-r1':
            raise ValueError('Invalid descendant lineage/rule')
        seen.add(d['id'])
        if type(d['chartCentreM']) is not list or len(d['chartCentreM']) != 2:
            raise ValueError('Expected chart centre')
        for x in d['chartCentreM']:
            bounded_decimal(x, finite=True)
        for k in ['halfSupportM', 'amplitudeM', 'sourceScale']:
            bounded_decimal(d[k], positive=True, finite=True)
    comp = result['composition']; object_keys(comp, 'operator root cutters')
    if comp['operator'] != 'ordered-subtraction-of-capped-graph-intervals-r1' or comp['root'] != components[0]['id'] or comp['cutters'] != [c['id'] for c in components[1:]]:
        raise ValueError('Unsupported composition/order')
    return result

def recipe_key(value):
    return key(validate(value))

def project_inputs(value):
    """Fresh stdlib native-style parameters. This does not evaluate a field."""
    r = validate(value); components = []
    for c in r['components']:
        source = complex(float(c['source']['re']), float(c['source']['im']))
        if not math.isfinite(source.real) or not math.isfinite(source.imag):
            raise ValueError('Source outside binary64 imported evaluator range')
        p = dict(name=c['id'], C=source, H=float(c['halfSupportM']), A=float(c['amplitudeM']), L=float(c['lengthM']))
        for out, k in [('F', 'origin'), ('u', 'u'), ('v', 'v'), ('n', 'n')]:
            p[out] = vector(c['frame'][k])
        if c['capM'] is not None:
            p['htop'] = float(c['capM'])
        components.append(p)
    descendants = [dict(id=d['id'], parent=d['parent'], A0=float(d['chartCentreM'][0]), B0=float(d['chartCentreM'][1]),
                        HALF=float(d['halfSupportM']), AMPLITUDE=float(d['amplitudeM']), RATIO=float(d['sourceScale']), rule=d['rule']) for d in r['descendants']]
    return dict(components=components, descendants=descendants,
                lineage=[dict(id=c['id'], parent=c['parent']) for c in r['components']] + [dict(id=d['id'], parent=d['parent']) for d in r['descendants']],
                U=float(r['field']['unitsPerMetre']), N0=r['field']['initialIterations'], composition=r['composition'])

def _npy(raw, dtype, shape):
    # The imported profile admits only numeric little-endian C arrays, never pickle.
    if raw[:8] != b'\x93NUMPY\x01\x00' or len(raw) < 10:
        raise ValueError('Expected NPY v1 numeric array')
    n = int.from_bytes(raw[8:10], 'little')
    if n > 4096 or 10+n > len(raw):
        raise ValueError('NPY header budget')
    header = ast.literal_eval(raw[10:10+n].decode('ascii'))
    if type(header) is not dict or set(header) != {'descr', 'shape', 'fortran_order'} or header['descr'] != dtype or header['fortran_order'] is not False or type(header['shape']) is not tuple or any(type(x) is not int for x in header['shape']) or header['shape'] != tuple(shape):
        raise ValueError('NPY layout mismatch')
    payload = raw[10+n:]
    if len(payload) != math.prod(shape)*8:
        raise ValueError('NPY byte length mismatch')
    return payload

def verify_parent(value, root):
    r = validate(value); root = Path(root).resolve(); path = (root / r['parentGrid']['file']).resolve()
    if path.parent != root:
        raise ValueError('Parent file escapes input directory')
    if path.stat().st_size > MAX_ASSET_BYTES:
        raise ValueError('Parent ZIP resource budget')
    with path.open('rb') as stream:
        raw = stream.read(MAX_ASSET_BYTES+1)
    if len(raw) > MAX_ASSET_BYTES or hashlib.sha256(raw).hexdigest() != r['parentGrid']['sha256']:
        raise ValueError('Parent transport integrity mismatch')
    payloads = {}
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        infos = z.infolist()
        if sorted(i.filename for i in infos) != ['g.npy', 'o.npy', 't0.npy', 'unres.npy'] or sum(i.file_size for i in infos) > MAX_ASSET_BYTES:
            raise ValueError('Parent ZIP members/resource budget')
        for name, a in r['parentGrid']['arrays'].items():
            payload = _npy(z.read(name+'.npy'), '<f8', a['shape'])
            header = {k:a[k] for k in ['dtype', 'shape', 'order']}
            if hashlib.sha256(canonical(header)+b'\0'+payload).hexdigest() != a['sha256']:
                raise ValueError('Parent logical integrity mismatch: '+name)
            payloads[name] = payload
        unres, = struct.unpack('<q', _npy(z.read('unres.npy'), '<i8', []))
        if unres < 0:
            raise ValueError('Negative diagnostic unresolved count')
    grid = [x[0] for x in struct.iter_unpack('<d', payloads['g'])]
    origin = list(struct.unpack('<3d', payloads['o']))
    if not all(math.isfinite(x) for x in grid+origin) or any(a >= b for a, b in zip(grid, grid[1:])):
        raise ValueError('Invalid parent grid/origin')
    finite = nan = 0
    for (x,) in struct.iter_unpack('<d', payloads['t0']):
        if math.isfinite(x):
            finite += 1
        elif math.isnan(x):
            nan += 1
        else:
            raise ValueError('Infinite parent value')
    return dict(transportSha256=r['parentGrid']['sha256'], gridSamples=len(grid), origin=origin,
                finite=finite, nan=nan, unresolvedDiagnostic=unres)

def verify_sources(value, generation_root):
    r = validate(value); root = Path(generation_root).resolve()
    for b in r['sourceBindings']:
        path = (root / b['file']).resolve()
        if not path.is_relative_to(root) or hashlib.sha256(path.read_bytes()).hexdigest() != b['sha256']:
            raise ValueError('Evaluator source integrity mismatch: '+b['file'])
    return True

def load_inputs(value, parent_root, generation_root):
    """Validate immutable dependencies before exposing parameters for future use."""
    verify_parent(value, parent_root); verify_sources(value, generation_root)
    return project_inputs(value)

def projection_bits(value):
    """One binary64 serializer for CPU controls and actual native intake evidence."""
    if isinstance(value, complex):
        return [projection_bits(value.real), projection_bits(value.imag)]
    if isinstance(value, float):
        return struct.pack('<d', value).hex()
    if type(value) is list:
        return [projection_bits(v) for v in value]
    if type(value) is dict:
        return {k:projection_bits(v) for k,v in value.items()}
    if hasattr(value, 'tolist'):
        return projection_bits(value.tolist())
    if value is None or type(value) in (str, int, bool):
        return value
    raise TypeError('Unsupported numeric projection value')

def projection_key(value):
    return key(projection_bits(value))
