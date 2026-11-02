"""Owned source/input resolution; generated work stays in the declared scratch root."""
from pathlib import Path
import hashlib, json, os, sys

CODE = Path(__file__).resolve().parent
GENERATION = CODE.parent
PROJECT = GENERATION.parent.parent
DATA = Path(os.environ.get('ATLAS_GENERATION_BUNDLE', str(GENERATION / 'regression-world'))).resolve()
if not DATA.is_relative_to(GENERATION):
    raise ValueError('Regression inputs must be repository-owned')
MANIFEST = GENERATION / 'import-manifest.json'
INPUTS = json.loads(MANIFEST.read_text())['inputs']
read_inputs = set()
_guarded = False


def asset(relative):
    path = (DATA / relative).resolve()
    if not path.is_relative_to(DATA) or relative not in INPUTS:
        raise ValueError('Undeclared regression input: ' + relative)
    read_inputs.add(path)
    return path


def output_root():
    value = os.environ.get('ATLAS_GENERATION_OUTPUT')
    if not value:
        raise ValueError('Explicit owned generation output root required')
    path = Path(value).resolve()
    if not path.is_relative_to('/mnt/ml_storage/scratch') or path == Path('/mnt/ml_storage/scratch'):
        raise ValueError('Generation outputs require a private scratch root')
    return path


def configure_packages():
    # Installed third-party modules are configuration, not owned mathematical source.
    path = Path(os.environ.get('ATLAS_NATIVE_PACKAGES', '/mnt/ml_storage/scratch/atlas-prepared-toolchain/py')).resolve()
    if not path.is_dir():
        raise ValueError('Configured native package directory is unavailable: ' + str(path))
    sys.path.insert(0, str(path))
    sys.path.insert(0, str(GENERATION))
    sys.path.insert(0, str(CODE))
    return path


def validate_inputs():
    manifest = json.loads(MANIFEST.read_text())
    for name, row in manifest['adaptations'].items():
        original = manifest['originals'][name]
        archived = (GENERATION / original['file']).read_bytes()
        if hashlib.sha256(archived).hexdigest() != original['sha256']:
            raise ValueError('Original source digest mismatch: ' + name)
        source = archived.decode()
        for edit in row['edits']:
            if source.count(edit['before']) != 1:
                raise ValueError('Ambiguous relocation: ' + name)
            source = source.replace(edit['before'], edit['after'])
        current = (GENERATION / row['file']).read_bytes()
        if current.decode() != source or hashlib.sha256(current).hexdigest() != row['sha256']:
            raise ValueError('Unlisted executable edit: ' + name)
    for name, row in manifest['newModules'].items():
        if hashlib.sha256((GENERATION / row['file']).read_bytes()).hexdigest() != row['sha256']:
            raise ValueError('Support source digest mismatch: ' + name)
    for relative, expected in INPUTS.items():
        path = asset(relative)
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected['sha256']:
            raise ValueError('Regression input digest mismatch: ' + relative)
    definition = json.loads(asset('legacy-world.json').read_text())
    bound = {'construction': asset('construction.json'), 'canonical-parent-samples': asset('base.npz'),
             'canonical-parent-frame': asset('frame.json'),
             'base-field-evaluator': GENERATION / 'provenance/original/sampling_r0.py',
             'parent-field-kernel': GENERATION / 'provenance/original/h1lib.py',
             'descendant-rule': GENERATION / 'provenance/original/descendant_world.py'}
    if definition['id'] != 'H1C-surface-child@ee2564d40bda7ef6':
        raise ValueError('Unexpected legacy world binding')
    for row in definition['assets']:
        if hashlib.sha256(bound[row['role']].read_bytes()).hexdigest() != row['sha256']:
            raise ValueError('Legacy mathematical asset mismatch: ' + row['role'])
    if str(GENERATION) not in sys.path:
        sys.path.insert(0, str(GENERATION))
    from recipe_inputs import load_for_legacy
    load_for_legacy(definition)
    return definition


def install_io_guard():
    global _guarded
    if _guarded:
        return
    _guarded = True
    sys.dont_write_bytecode = True
    forbidden = tuple(Path('/mnt/ml_storage/scratch') / name for name in
                      ['atlas-world-bw1', 'atlas-multiscale-pr8', 'atlas-bw1-runtime-r1', 'valley-spike'])
    def check(event, args):
        if event == 'open':
            filename, mode, flags = args
            if not isinstance(filename, (str, bytes, os.PathLike)):
                return
            path = Path(os.fsdecode(filename)).resolve()
            if any(path.is_relative_to(root) for root in forbidden):
                raise PermissionError('First-party scratch input/source refused: ' + str(path))
            writing = bool(flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND))
            if writing and path.is_relative_to(PROJECT):
                raise PermissionError('Generated write into checkout refused: ' + str(path))
            if not writing and path.is_relative_to(DATA):
                relative = str(path.relative_to(DATA))
                if relative not in INPUTS and relative != 'policy-certificate.json':
                    raise PermissionError('Unregistered regression input: ' + relative)
                if relative in INPUTS:
                    read_inputs.add(path)
        elif event in ['os.mkdir', 'os.remove', 'os.rmdir', 'os.rename']:
            for filename in args[:2] if event == 'os.rename' else args[:1]:
                if isinstance(filename, (str, bytes, os.PathLike)) and Path(os.fsdecode(filename)).resolve().is_relative_to(PROJECT):
                    raise PermissionError('Generated mutation inside checkout refused')
    sys.addaudithook(check)


def owned_provenance(extra_modules=()):
    allowed_support = {(GENERATION / row['file']).resolve() for row in json.loads(MANIFEST.read_text())['newModules'].values()}
    # Entry scripts are recorded separately by their caller (the worker adds itself).
    modules = {name: module for name, module in list(sys.modules.items()) if name not in ('__main__', '__mp_main__') and getattr(module, '__file__', None)
               and Path(module.__file__).resolve().is_relative_to(GENERATION)}
    for name, module in extra_modules:
        if name in modules and modules[name] is not module:
            raise ValueError('First-party module-name collision: ' + name)
        modules[name] = module
    for name, module in modules.items():
        if not Path(module.__file__).resolve().is_relative_to(CODE) and Path(module.__file__).resolve() not in allowed_support:
            raise ValueError('Unowned first-party module: ' + name)
    files = {Path(module.__file__).resolve() for module in modules.values()}
    files.update(CODE / name for name in json.loads(MANIFEST.read_text())['adaptations'])
    files.update(allowed_support)
    files.update(read_inputs)
    files.add(MANIFEST)
    rows = [{'role': str(path.relative_to(GENERATION)), 'file': str(path),
             'sha256': hashlib.sha256(path.read_bytes()).hexdigest()} for path in sorted(files)]
    return rows, [{'name': name, 'file': str(Path(module.__file__).resolve())} for name, module in sorted(modules.items())]
