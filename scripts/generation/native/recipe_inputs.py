"""Known imported construction: validate before CUDA, then supply numeric inputs."""
from pathlib import Path
import copy, json, sys
import generation_paths as P
import recursive_recipe as R
import source_recipe as S
if Path(R.__file__).resolve() != P.GENERATION / 'recursive_recipe.py' or Path(S.__file__).resolve() != P.GENERATION / 'source_recipe.py':
    raise ValueError('Unowned recursive recipe support module')
from source_recipe import load_json, object_keys

LEGACY_ID = 'H1C-surface-child@ee2564d40bda7ef6'
LEGACY_DEFINITION_KEY = 'fnv1a64:4c29d6f7f61fbb06'
LEGACY_PROJECTION = 'sha256:a9b4ddcb17c15cdb3a6d03e8aea8f976a520ad7a4d7321f154cee5586692c9c2'
_loaded = None

def _legacy_key(definition):
    # The known legacy record has ASCII strings and non-exponent decimal numbers.
    # Its sorted-assets canonical bytes are checked against JS in CPU controls.
    from source_recipe import canonical
    body = dict(definition, assets=sorted(definition['assets'], key=lambda a:a['role']))
    h = 0xcbf29ce484222325
    for b in canonical(body):
        h = ((h ^ b)*0x100000001b3) & 0xffffffffffffffff
    return 'fnv1a64:'+format(h, '016x')

def load_for_legacy(definition):
    global _loaded
    if _loaded is not None:
        return copy.deepcopy(_loaded['binding'])
    binding = load_json(P.MANIFEST)['recursiveRecipe']
    object_keys(binding, 'file recipeKey projectionDigest legacyId legacyDefinitionKey')
    if binding['file'] != 'recursive-recipe.json' or binding['legacyId'] != LEGACY_ID or definition['id'] != LEGACY_ID or binding['legacyDefinitionKey'] != LEGACY_DEFINITION_KEY or _legacy_key(definition) != LEGACY_DEFINITION_KEY or binding['projectionDigest'] != LEGACY_PROJECTION:
        raise ValueError('Unsupported legacy recipe alias or projection binding')
    recipe = R.validate(load_json(P.asset(binding['file'])))
    if R.recipe_key(recipe) != binding['recipeKey']:
        raise ValueError('Legacy recipe key mismatch')
    if [c['id'] for c in recipe['components']] != ['parent', 'child', 'gchild'] or len(recipe['descendants']) != 1 or recipe['descendants'][0]['id'] != 'descendant' or recipe['descendants'][0]['parent'] != 'gchild':
        raise ValueError('Unsupported imported component names/descendant parent')
    projected = R.load_inputs(recipe, P.DATA, P.GENERATION)
    if R.projection_key(projected) != LEGACY_PROJECTION:
        raise ValueError('Recipe changes the legacy mathematical projection')
    _loaded = dict(binding=dict(binding), projected=projected)
    return copy.deepcopy(binding)

def inputs():
    if _loaded is None:
        load_for_legacy(load_json(P.asset('legacy-world.json')))
    return copy.deepcopy(_loaded['projected'])

def component_inputs():
    return inputs()['components']

def descendant_input():
    return inputs()['descendants'][0]

def validate_residual(h):
    p = inputs(); root = p['components'][0]
    actual = dict(F=h.O, u=h.UA, v=h.VA, n=h.NRM, C=h.CS, A=h.A0, L=h.L0, H=h.H0, U=h.U, N0=h.N0, R=h.dek.R)
    expected = {k:root[k] for k in ['F', 'u', 'v', 'n', 'C', 'A', 'L', 'H']}
    expected.update(U=p['U'], N0=p['N0'], R=1000000.)
    if R.projection_key(actual) != R.projection_key(expected):
        raise ValueError('Retained h1/profile constants differ from the recipe')
    return True

def actual_binding(sampler, descendant):
    """Read real loaded native attributes, never report the recipe's values as actual."""
    projected = inputs(); components = []
    for c in sampler.COMPONENTS:
        names = ['name', 'F', 'u', 'v', 'n', 'C', 'H', 'A', 'L'] + ([] if c['name'] == 'parent' else ['htop'])
        components.append({k:c[k] for k in names})
    actual = dict(projected, components=components, U=sampler.H.U, N0=sampler.H.N0,
                  descendants=[dict(id='descendant', parent=descendant.K2['name'], rule='surface-descendant-r1',
                                    A0=descendant.A0, B0=descendant.B0, HALF=descendant.HALF,
                                    AMPLITUDE=descendant.AMPLITUDE, RATIO=descendant.RATIO)])
    digest = R.projection_key(actual)
    if digest != LEGACY_PROJECTION:
        raise ValueError('Actual native parameters changed the legacy mathematical projection')
    return dict(_loaded['binding'], actualProjectionDigest=digest,
                componentIds=[c['name'] for c in components], nativeInputs=R.projection_bits(actual))
