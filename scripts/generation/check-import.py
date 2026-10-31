"""Static/stdlib migration controls. Never imports mathematical or GPU packages."""
from pathlib import Path
import ast, hashlib, json, os, sys
sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent
manifest = json.loads((ROOT/'import-manifest.json').read_text())
for name, row in manifest['adaptations'].items():
    original = (ROOT/manifest['originals'][name]['file']).read_bytes()
    assert hashlib.sha256(original).hexdigest() == manifest['originals'][name]['sha256']
    source = original.decode()
    for edit in row['edits']:
        assert source.count(edit['before']) == 1, name
        source = source.replace(edit['before'], edit['after'])
    assert source == (ROOT/row['file']).read_text(), name
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id=='open' and node.args:
            assert not isinstance(node.args[0], ast.Constant), (name,'ambient open')
    assert '/mnt/ml_storage/scratch/' not in source, name
sys.path.insert(0,str(ROOT/'native'))
import generation_paths as P
P.validate_inputs(); P.install_io_guard()
for name in [P.PROJECT/'.md2a-forbidden-write',Path('/mnt/ml_storage/scratch/atlas-world-bw1/.md2a-forbidden-read')]:
    try:
        with name.open('w' if name.is_relative_to(P.PROJECT) else 'r'):pass
    except PermissionError:pass
    else:raise AssertionError('I/O ownership guard did not reject '+str(name))
assert not (P.PROJECT/'.md2a-forbidden-write').exists()
print(json.dumps({'pass':True,'modules':len(manifest['adaptations']),'inputs':len(manifest['inputs']),'exactAllowedEdits':True,'ambientReadRemoved':True,'scratchSourceReadRejected':True,'checkoutWriteRejected':True,'gpuImports':False}))

# Real metadata introspection can trigger lazy module imports. Snapshot iteration must survive it.
import types
probe=types.ModuleType('md2a_metadata_probe')
def lazy_file(name):
    if name!='__file__':raise AttributeError(name)
    sys.modules['md2a_metadata_late']=types.ModuleType('md2a_metadata_late')
    return str(P.CODE/'generation_paths.py')
probe.__getattr__=lazy_file
sys.modules[probe.__name__]=probe
try:P.owned_provenance()
finally:
    sys.modules.pop(probe.__name__,None);sys.modules.pop('md2a_metadata_late',None)
print(json.dumps({'lazyModuleMutationControl':True}))

# Audit imports must remain executable when import-path relocation changes formatting.
import re
def check_audit_imports(source):
    tree=ast.parse(source)
    imports={alias.asname or alias.name for node in tree.body if isinstance(node,ast.ImportFrom) and node.module=='check_collision_r0' for alias in node.names}
    assert 'distances' in imports, 'Distance helper is not bound at module level'
    assert not re.search(r'^\s*#.*;\s*(?:from\s+\S+\s+import\b|import\s+\w+)',source,re.M), 'Comment swallowed an import statement'
for name in ['pc2-audit.py','pc2-qualify.py']:
    check_audit_imports((ROOT.parent/'experiments'/name).read_text())
# The actual failed source must be rejected without importing any GPU package.
failed=(ROOT.parent/'experiments/pc2-audit.py').read_text().replace('\nfrom check_collision_r0 import distances',';from check_collision_r0 import distances')
try:check_audit_imports(failed)
except AssertionError:pass
else:raise AssertionError('Swallowed-import negative control was not rejected')
print(json.dumps({'auditImportBindings':True,'swallowedImportNegativeControlRejected':True,'gpuImports':False}))
