"""Finite stdlib/CPU intake controls, run only by the bounded contract child."""
from pathlib import Path
import ast, copy, hashlib, json, os, shutil, subprocess, sys
from types import SimpleNamespace

def check_intake(out):
    import recursive_recipe as R
    from source_recipe import canonical, key, load_json
    root=Path(__file__).resolve().parent;out.mkdir()
    sys.path.insert(0,str(root/'native'))
    import generation_paths as P
    definition=P.validate_inputs()
    import recipe_inputs as I
    snapshot=I.inputs();binding=I.load_for_legacy(definition)
    assert R.projection_key(snapshot)==I.LEGACY_PROJECTION
    parent=snapshot['components'][0]
    h=SimpleNamespace(O=parent['F'],UA=parent['u'],VA=parent['v'],NRM=parent['n'],CS=parent['C'],A0=parent['A'],L0=parent['L'],H0=parent['H'],U=snapshot['U'],N0=snapshot['N0'],dek=SimpleNamespace(R=1000000.))
    assert I.validate_residual(h);h.H0+=.1
    try:I.validate_residual(h)
    except ValueError:pass
    else:raise AssertionError('Changed retained h1 scalar accepted')
    # Ensure actual assembly uses the intake before reference orbits, not old literals.
    sampler=ast.parse((root/'native/sampling_r0.py').read_text());desc=ast.parse((root/'native/descendant_world.py').read_text())
    assignment=next(n for n in sampler.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='COMPONENTS' for t in n.targets))
    assert isinstance(assignment.value,ast.Call) and isinstance(assignment.value.func,ast.Name) and assignment.value.func.id=='component_inputs'
    refline=next(n.lineno for n in sampler.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='REFS' for t in n.targets));assert assignment.lineno<refline
    for name in ['A0','B0','HALF','AMPLITUDE','RATIO']:
        matches=[n for n in ast.walk(desc) if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id==name or isinstance(t,ast.Tuple) and any(isinstance(x,ast.Name) and x.id==name for x in t.elts) for t in n.targets)]
        assert matches and all(not isinstance(n.value,ast.Constant) for n in matches),name
    imported={n.module for n in ast.walk(sampler) if isinstance(n,ast.ImportFrom)};assert 'recipe_inputs' in imported
    # Each denial is a fresh interpreter, so module caches cannot hide a changed fixture.
    copied=out/'copy/scripts/generation';shutil.copytree(root,copied,ignore=shutil.ignore_patterns('__pycache__'))
    manifest_file=copied/'import-manifest.json';original_manifest=manifest_file.read_bytes();recipe_file=copied/'regression-world/recursive-recipe.json';original_recipe=recipe_file.read_bytes();base_file=copied/'regression-world/base.npz';original_base=base_file.read_bytes()
    probe="""import json,sys
from pathlib import Path
seen=[]
def guard(event,args):
 if event=='import' and args[0].split('.')[0] in ['cupy','sampling_r0','descendant_world','pert','fkern']:
  seen.append(args[0]);raise RuntimeError('CUDA/native import attempted')
sys.addaudithook(guard)
sys.path.insert(0,sys.argv[1]);import generation_paths as P
try:P.validate_inputs();print(json.dumps({'accepted':True,'forbiddenImports':seen}))
except Exception as e:print(json.dumps({'accepted':False,'forbiddenImports':seen,'reason':str(e)}))
"""
    cases=[]
    for name in ['valid','missing','transport','semantic-rehashed','names-rehashed','alias','parent','source-rehashed']:
        manifest_file.write_bytes(original_manifest);recipe_file.write_bytes(original_recipe);base_file.write_bytes(original_base)
        m=json.loads(original_manifest);r=json.loads(original_recipe)
        if name=='missing':recipe_file.unlink()
        elif name=='transport':recipe_file.write_bytes(original_recipe+b' ')
        elif name in ['semantic-rehashed','names-rehashed','source-rehashed']:
            if name=='semantic-rehashed':r['components'][1]['amplitudeM']='0.31'
            if name=='names-rehashed':
                r['components'][0]['id']='renamed';r['components'][1]['parent']='renamed';r['composition']['root']='renamed'
            if name=='source-rehashed':r['sourceBindings'][0]['sha256']='0'*64
            recipe_file.write_bytes(canonical(r)+b'\n');m['inputs']['recursive-recipe.json']['sha256']=hashlib.sha256(recipe_file.read_bytes()).hexdigest();m['recursiveRecipe']['recipeKey']=R.recipe_key(r);manifest_file.write_bytes(canonical(m))
        elif name=='alias':m['recursiveRecipe']['legacyId']='foreign';manifest_file.write_bytes(canonical(m))
        elif name=='parent':raw=bytearray(original_base);raw[-1]^=1;base_file.write_bytes(raw)
        run=subprocess.run([sys.executable,'-B','-c',probe,str(copied/'native')],capture_output=True,text=True,timeout=4,env={**os.environ,'ATLAS_GENERATION_BUNDLE':str(copied/'regression-world'),'PYTHONDONTWRITEBYTECODE':'1'})
        assert run.returncode==0,run.stderr;row=json.loads(run.stdout);assert not row['forbiddenImports'];assert row['accepted']==(name=='valid'),(name,row);cases.append(dict(case=name,**row))
    return dict(binding=binding,negativeCases=cases,residualMismatchRefused=True,assemblyFromProjection=True,cudaImported=False)
