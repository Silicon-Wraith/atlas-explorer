"""Stdlib source recipe/identity/precision preflight; importing this never loads CUDA."""
from fractions import Fraction
from pathlib import Path
import copy, hashlib, json, math, re

PROFILE = dict(formula='z*z+c', escapeRadius='1000000', derivative='before-z', distance='half-milnor',
              interior='strict-cardioid-period2', interiorMargin='0.000000001', interiorDistanceM='0',
              coordinateMapping='C+U*(x-i*z)', coordinateArithmetic='exact-rational-round-once-binary64',
              distanceArithmetic='binary64-Dc-divide-U', heightArithmetic='binary64-subtract-multiply-subtract',
              unknown='unresolved-no-surface', failed='failed-no-surface', outsideDomain='undefined',
              interpolation='bilinear', array='little-endian-float64-C', negativeZero='positive')
DECIMAL = re.compile(r'^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?)(\d+))?$', re.I | re.ASCII)

class Unsupported(ValueError):
    pass

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False).encode()

def key(value):
    return 'sha256:' + hashlib.sha256(canonical(value)).hexdigest()

def object_keys(value, keys):
    if type(value) is not dict or set(value) != set(keys.split()):
        raise ValueError('Expected exactly: ' + keys)

def decimal(value, positive=False):
    if type(value) is not str or len(value) > 400016:
        raise ValueError('Expected bounded decimal string')
    m = DECIMAL.fullmatch(value)
    if not m or not (m[2] or m[3]):
        raise ValueError('Expected decimal string')
    exponent = (m[5] or '0').lstrip('0') or '0'
    if len(m[2]) + len(m[3] or '') > 200000 or len(exponent) > 6 or int(exponent) > 200000:
        raise ValueError('Decimal resource budget exceeded')
    if positive and (m[1] == '-' or not any(x in '123456789' for x in m[2] + (m[3] or ''))):
        raise ValueError('Expected positive decimal')
    return m

def integral(value, minimum, maximum):
    """Match JS JSON-number integers without accepting Python bools or mutating input."""
    if type(value) not in (int, float) or not minimum <= value <= maximum or not math.isfinite(value) or value != int(value):
        raise ValueError('Expected bounded integral JSON number')
    return int(value)

def validate(value):
    object_keys(value, 'schema schemaVersion generator source grid transfer numerics')
    value = copy.deepcopy(value)
    value['schemaVersion'] = integral(value['schemaVersion'], 1, 1)
    if value['schema'] != 'atlas.generation.source-recipe':
        raise ValueError('Unsupported schema/version')
    object_keys(value['generator'], 'id version')
    if value['generator'] != dict(id='atlas.mandelbrot-parent-chart', version='affine-distance-r1'):
        raise ValueError('Unsupported generator')
    object_keys(value['source'], 're im unitsPerMetre')
    for name, text in value['source'].items():
        decimal(text, name == 'unitsPerMetre')
    object_keys(value['grid'], 'halfExtentM cells'); decimal(value['grid']['halfExtentM'], True)
    value['grid']['cells'] = integral(value['grid']['cells'], 1, 512)
    object_keys(value['transfer'], 'referenceDistanceM referenceHeightM slope')
    for name, text in value['transfer'].items():
        decimal(text, name == 'slope')
    object_keys(value['numerics'], 'maxIterations roundingDenominator')
    num = value['numerics']
    num['maxIterations'] = integral(num['maxIterations'], 1, 131072)
    num['roundingDenominator'] = integral(num['roundingDenominator'], 1024, 1024)
    return value

def no_duplicates(pairs):
    out = {}
    for k, v in pairs:
        if k in out:
            raise ValueError('Duplicate JSON key: ' + k)
        out[k] = v
    return out

def parse_json(text):
    def number(text):
        value = float(text)
        if not math.isfinite(value):
            raise ValueError('Nonfinite JSON number')
        return value
    return json.loads(text, object_pairs_hook=no_duplicates, parse_float=number,
                      parse_constant=lambda x: (_ for _ in ()).throw(ValueError('Nonfinite JSON')))

def load_json(path):
    if Path(path).stat().st_size > 2000000:
        raise ValueError('JSON input too large')
    return parse_json(Path(path).read_text())

def preflight(recipe):
    recipe = validate(recipe)
    texts = list(recipe['source'].values()) + [recipe['grid']['halfExtentM']] + list(recipe['transfer'].values())
    for text in texts:
        m = decimal(text)
        exponent = (m[5] or '0').lstrip('0') or '0'
        if len(m[2]) + len(m[3] or '') > 1024 or abs(int((m[4] or '') + exponent)) > 2048:
            raise Unsupported('native decimal range: at most 1024 digits and exponent magnitude 2048')
    def fraction_value(text):
        m = decimal(text)
        # Bound exponent parsing independently of its harmless leading zero spelling.
        exponent = (m[5] or '0').lstrip('0') or '0'
        mantissa = m[1] + (m[2] or '0') + ('.' + m[3] if m[3] is not None else '')
        return Fraction(mantissa + 'e' + (m[4] or '') + exponent)
    r, im, unit = (fraction_value(recipe['source'][x]) for x in ['re', 'im', 'unitsPerMetre'])
    half = fraction_value(recipe['grid']['halfExtentM']); cells = recipe['grid']['cells']
    step = 2 * half * unit / cells
    positions = [half * Fraction(2 * i - cells, cells) for i in range(cells + 1)]
    exact_axes = [[r + unit * p for p in positions], [im - unit * p for p in positions]]
    try:
        axes = [[float(x) for x in axis] for axis in exact_axes]
        transfers = {k: float(fraction_value(v)) for k, v in recipe['transfer'].items()}
        u = float(unit)
    except (OverflowError, ValueError) as e:
        raise Unsupported('binary64 range') from e
    if not all(math.isfinite(x) for axis in axes for x in axis) or not all(math.isfinite(x) for x in transfers.values()) or not math.isfinite(u) or u <= 0 or transfers['slope'] <= 0:
        raise Unsupported('binary64 range')
    errors = [abs(Fraction.from_float(x) - exact_axes[a][i]) for a, axis in enumerate(axes) for i, x in enumerate(axis)]
    maximum = max(errors)
    if maximum > step / recipe['numerics']['roundingDenominator'] or any(axes[0][i] >= axes[0][i+1] or axes[1][i] <= axes[1][i+1] for i in range(cells)):
        raise Unsupported('coordinate rounding exceeds 1/1024 sample spacing or collapses samples')
    return dict(real=axes[0], imag=axes[1], unit=u, transfer=transfers,
                maxRoundoffFraction=str(float(maximum / step)))

def parent_definition(recipe, logical_digest):
    recipe = validate(recipe)
    n = recipe['grid']['cells'] + 1
    body = dict(schema='atlas.generation.parent-definition', schemaVersion=1, recipe=recipe, profile=PROFILE,
                surface=dict(file='height.npy', logicalSha256=logical_digest, dtype='<f8', shape=[n, n], order='C', axisOrder='z,x'))
    return dict(body, definitionKey=key(body))

def resolve_sample_summary(counts, foreign_count, nonfinite_resolved_count, all_finite):
    """Unchanged producer decision from validated summaries, independent of NumPy/CUDA."""
    object_keys(counts, '0 1 3 4')
    counts = {k: integral(v, 0, 263169) for k, v in counts.items()}
    foreign_count = integral(foreign_count, 0, 263169)
    nonfinite_resolved_count = integral(nonfinite_resolved_count, 0, 263169)
    total = sum(counts.values()) + foreign_count
    if type(all_finite) is not bool or not 1 <= total <= 263169 or nonfinite_resolved_count > counts['1'] + counts['3'] or all_finite and nonfinite_resolved_count:
        raise ValueError('Inconsistent sample summary')
    if counts['4'] or foreign_count or nonfinite_resolved_count:
        return 'failed'
    if counts['0'] or not all_finite:
        return 'unresolved'
    return 'resolved'

def affine_height(distance, reference_distance, reference_height, slope):
    """Scalar or NumPy ufunc arithmetic, in the original operation order."""
    height = reference_height - slope*(distance-reference_distance)
    if isinstance(height, (int, float)):
        return 0. if height == 0 else height
    height[height == 0] = 0.
    return height
