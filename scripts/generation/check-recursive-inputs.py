#!/usr/bin/env python3
"""Independent finite CPU controls for B1. Never imports the native evaluator package."""
from pathlib import Path
import ast, copy, hashlib, importlib.util, itertools, json, math, os, struct, sys, time, zipfile
sys.dont_write_bytecode = True
START = time.monotonic()
GENERATION = Path(__file__).resolve().parent
PROJECT = GENERATION.parent.parent
OUT = Path(sys.argv[1]).resolve()
if not OUT.is_relative_to('/mnt/ml_storage/scratch'):
    raise ValueError('Private scratch output required')
FORBIDDEN = {'cupy', 'sampling_r0', 'h1lib', 'descendant_world', 'dek', 'pert', 'fkern', 'field_fidelity_r0'}
def guard(event, args):
    if event == 'import' and args[0].split('.')[0] in FORBIDDEN:
        raise RuntimeError('Native/GPU import forbidden: '+args[0])
sys.addaudithook(guard)
import numpy as np
import recursive_recipe as R
import source_recipe as S

def check(ok, why):
    if not ok:
        raise AssertionError(why)

def sha(bytes):
    return hashlib.sha256(bytes).hexdigest()

def reference_canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False).encode()

def read(path):
    return json.loads(Path(path).read_text())

def bits(value):
    if type(value) is complex:
        return [bits(value.real), bits(value.imag)]
    if isinstance(value, (float, np.floating)):
        return struct.pack('<d', value).hex()
    if isinstance(value, np.ndarray):
        return bits(value.tolist())
    if type(value) is list:
        return [bits(v) for v in value]
    if type(value) is dict:
        return {k:bits(v) for k,v in value.items()}
    return value

def rejected(fn, why):
    try:
        fn()
    except (ValueError, TypeError, KeyError, OverflowError, OSError, zipfile.BadZipFile):
        return
    raise AssertionError('Negative control accepted: '+why)

result = dict(startedUTC=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), pid=os.getpid(), nativeFree=True,
              toolchain=dict(python=sys.version, interpreter=sys.executable, numpy=np.__version__, numpyFile=np.__file__), checks=[])
def passed(name, detail):
    result['checks'].append(dict(name=name, detail=detail))
    print('PASS '+name, flush=True)

try:
    corpus = read(PROJECT/'tests/reference/generation-recipe-cases.json')
    node = read(OUT/'node-results.json'); parity = {}
    for group, codec in [('sourceCases', S.validate), ('recursiveCases', R.validate)]:
        rows = []
        for case, js in zip(corpus[group], node[group], strict=True):
            check(case['id'] == js['id'], 'Corpus order differs')
            original = before = None
            try:
                original = S.parse_json(case['json']); before = copy.deepcopy(original)
                value = codec(original); accepted = True
            except (ValueError, TypeError, KeyError, OverflowError):
                accepted = False
            check(original == before, 'Python codec mutated caller '+case['id'])
            check(accepted == case['accept'] == js['accepted'], 'Cross-language verdict '+case['id'])
            if accepted:
                canonical = S.canonical(value).decode('ascii')
                check(canonical == js['canonical'], 'Canonical bytes differ '+case['id'])
                check(S.key(value) == js['key'], 'Key differs '+case['id'])
                rows.append(dict(id=case['id'], accepted=True, key=S.key(value), canonicalBytes=len(canonical)))
            else:
                rows.append(dict(id=case['id'], accepted=False))
        parity[group] = rows
    for text in ['{"x":1,"x":2}', '{"x":NaN}', '{"x":Infinity}', '{"x":1e400}']:
        rejected(lambda: S.parse_json(text), text)
    # Validate integral-float normalisation throughout actual coordinate/definition code.
    a = read(PROJECT/'tests/reference/source-parent-controls/A/recipe.json'); floats = copy.deepcopy(a)
    floats['schemaVersion'] = 1.; floats['grid']['cells'] = 64.
    floats['numerics'] = dict(maxIterations=131072., roundingDenominator=1024.)
    check(S.preflight(floats) == S.preflight(a), 'Normalised preflight changed')
    check(S.parent_definition(floats, 'a'*64) == S.parent_definition(a, 'a'*64), 'Normalised definition changed')
    result['parity'] = parity
    passed('parity', {k:len(v) for k,v in parity.items()})

    # A separate constant-arithmetic reference reads the old files, never the recipe.
    def constant(node, environment):
        if isinstance(node, ast.Constant) and type(node.value) in (int,float,str): return node.value
        if isinstance(node, (ast.Tuple,ast.List)): return [constant(v,environment) for v in node.elts]
        if isinstance(node, ast.Name) and node.id in environment: return environment[node.id]
        if isinstance(node, ast.UnaryOp) and isinstance(node.op,(ast.UAdd,ast.USub)):
            v=constant(node.operand,environment);return v if isinstance(node.op,ast.UAdd) else -v
        if isinstance(node, ast.BinOp) and isinstance(node.op,(ast.Add,ast.Sub,ast.Mult,ast.Div)):
            a,b=constant(node.left,environment),constant(node.right,environment)
            if isinstance(node.op,ast.Add):return a+b
            if isinstance(node.op,ast.Sub):return a-b
            if isinstance(node.op,ast.Mult):return a*b
            return a/b
        raise ValueError('Not whitelisted constant arithmetic')
    def constants(file):
        tree=ast.parse(file.read_text()); env={}
        for node in tree.body:
            if not isinstance(node,ast.Assign) or len(node.targets)!=1:continue
            target=node.targets[0]
            try:value=constant(node.value,env)
            except ValueError:continue
            if isinstance(target,ast.Name):env[target.id]=value
            elif isinstance(target,ast.Tuple) and all(isinstance(t,ast.Name) for t in target.elts):
                for t,v in zip(target.elts,value,strict=True):env[t.id]=v
        return env,tree
    data=GENERATION/'regression-world'
    h,htree=constants(GENERATION/'native/h1lib.py');d,dtree=constants(GENERATION/'native/descendant_world.py');dek,dektree=constants(GENERATION/'native/dek.py')
    _,stree=constants(GENERATION/'native/sampling_r0.py')
    con=read(data/'construction.json');fr=read(data/'frame.json');seed=read(data/'levels.json')['seed']['c']
    with np.load(data/'base.npz',allow_pickle=False) as parent:
        ref=[dict(name='parent',F=parent['o'].tolist(),u=fr['u'],v=fr['v'],n=fr['normal'],C=complex(*seed),H=h['H0'],A=h['A0'],L=h['L0'])]
        # Read the current loop order from sampling_r0.py, independently of recipe order.
        loops=[n for n in stree.body if isinstance(n,ast.For) and isinstance(n.target,ast.Name) and n.target.id=='k']
        order=constant(loops[0].iter,{})
        for k in order:
            c=con[k];ref.append({key:(complex(*c[key]) if key=='C' else c[key]) for key in ['name','F','u','v','n','C','H','A','L','htop']})
        descriptors={}
        for name in ['g','t0','o']:
            a=parent[name];header=dict(dtype=a.dtype.str,shape=list(a.shape),order='C')
            descriptors[name]=dict(header,sha256=sha(reference_canonical(header)+b'\0'+a.tobytes(order='C')))
        independent_asset=dict(transportSha256=sha((data/'base.npz').read_bytes()), gridSamples=len(parent['g']), origin=parent['o'].tolist(),
                              finite=int(np.isfinite(parent['t0']).sum()),nan=int(np.isnan(parent['t0']).sum()),unresolvedDiagnostic=int(parent['unres']))
    recipe=read(GENERATION/'examples/regression-recursive.json');projected=R.load_inputs(recipe,data,GENERATION)
    check(bits(projected['components'])==bits(ref),'Component numeric bits differ')
    descendant=dict(id='descendant',parent='gchild',A0=d['A0'],B0=d['B0'],HALF=d['HALF'],AMPLITUDE=d['AMPLITUDE'],RATIO=d['RATIO'],rule='surface-descendant-r1')
    check(bits(projected['descendants'])==bits([descendant]),'Descendant numeric bits differ')
    check(bits(projected['U'])==bits(dek['U']) and projected['N0']==h['N0'],'Field numeric constants differ')
    check(projected['lineage']==[dict(id='parent',parent=None),dict(id='child',parent='parent'),dict(id='gchild',parent='child'),dict(id='descendant',parent='gchild')],'Authored full lineage differs')
    orbits=[n for n in ast.walk(stree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='ref_orbit']
    check(constant(orbits[0].args[1],{})==recipe['field']['referenceOrbitIterations'],'Reference orbit budget')
    for tree in [stree,htree]:
        taper=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='taper')
        numbers={n.value for n in ast.walk(taper) if isinstance(n,ast.Constant) and type(n.value) in (float,int)}
        check(numbers=={0.,.2,.5,.8,1.},'Unexpected taper literals')
    check(float(recipe['field']['escapeRadius'])==dek['R'],'Escape radius')
    # Parent relationships are explicit authoring metadata; runtime cuts are composed in order.
    result['projection']=dict(bits=bits(projected), componentOrder=[c['name'] for c in ref], constantSources=['h1lib.py','sampling_r0.py','descendant_world.py','dek.py'],
                              sourceBindings=recipe['sourceBindings'], lineageScope='Authored root/child/gchild/descendant hierarchy; legacy runtime has no full lineage record.',
                              arithmeticScope='Parameter-bit comparison only. Evaluator arithmetic order is source-hash-bound, not proved equivalent across CPU/GPU paths.')
    passed('projection',dict(components=len(ref),descendants=1,sourceBindings=len(recipe['sourceBindings'])))

    check(recipe['parentGrid']['arrays']==descriptors,'Independent logical descriptors differ')
    check(R.verify_parent(recipe,data)==independent_asset,'Independent asset diagnostics differ')
    moved=OUT/'moved';moved.mkdir();(moved/'base.npz').write_bytes((data/'base.npz').read_bytes())
    check(R.verify_parent(recipe,moved)==independent_asset,'Relocation changes asset')
    wrong=copy.deepcopy(recipe);wrong['parentGrid']['arrays']['t0']['sha256']='0'*64
    rejected(lambda:R.verify_parent(wrong,moved),'Logical tamper')
    wrong=copy.deepcopy(recipe);wrong['parentGrid']['arrays']['g']['shape']=[1200];wrong['parentGrid']['arrays']['t0']['shape']=[1200,1200]
    rejected(lambda:R.verify_parent(wrong,moved),'Wrong shape')
    changed=bytearray((moved/'base.npz').read_bytes());changed[-1]^=1;(moved/'base.npz').write_bytes(changed)
    rejected(lambda:R.verify_parent(recipe,moved),'Transport tamper')
    escape=OUT/'escape';escape.mkdir();(escape/'base.npz').symlink_to(data/'base.npz')
    rejected(lambda:R.verify_parent(recipe,escape),'Symlink escape')
    wrong=copy.deepcopy(recipe);wrong['sourceBindings'][0]['sha256']='0'*64
    rejected(lambda:R.verify_sources(wrong,GENERATION),'Source binding tamper')
    # Malformed numeric-array controls get valid transport bindings so parsing is exercised.
    with zipfile.ZipFile(data/'base.npz') as original:
        members={n:original.read(n) for n in original.namelist()}
    malformed=OUT/'malformed';malformed.mkdir()
    def malformed_control(label,changes):
        target=malformed/'base.npz'
        with zipfile.ZipFile(target,'w') as z:
            for name,raw in changes.items():z.writestr(name,raw)
        altered=copy.deepcopy(recipe);altered['parentGrid']['sha256']=sha(target.read_bytes())
        rejected(lambda:R.verify_parent(altered,malformed),label)
    malformed_control('Foreign ZIP member',dict(members,foreign=b'bad'))
    b=bytearray(members['g.npy']);b[6]=2
    malformed_control('NPY version',dict(members,**{'g.npy':b}))
    malformed_control('NPY payload length',dict(members,**{'o.npy':members['o.npy'][:-1]}))
    bad=members['g.npy'].replace(b"'<f8'",b"'|O8'")
    malformed_control('Object NPY',dict(members,**{'g.npy':bad}))
    bad=members['g.npy'].replace(b'False',b'True ')
    malformed_control('Fortran NPY',dict(members,**{'g.npy':bad}))
    result['parent']=independent_asset
    passed('parent',dict(**independent_asset,negativeControls=10))

    # Differential control of unchanged inline status policy over actual NumPy arrays.
    cases=0;outcomes={k:0 for k in ['resolved','unresolved','failed']}
    for n in [1,2,3]:
        for states in itertools.product([0,1,3,4,2],repeat=n):
            status=np.array(states,dtype=np.int32)
            for finite in itertools.product([False,True],repeat=n):
                distance=np.where(finite,0.,np.nan);height=S.affine_height(distance,6.8,89.06014237811313,2.1600443105285194)
                counts={str(k):int(np.count_nonzero(status==k)) for k in [0,1,3,4]}
                good=np.isin(status,[1,3]).all() and np.isfinite(distance).all() and np.isfinite(height).all()
                failed=counts['4'] or not np.isin(status,[0,1,3,4]).all() or np.any(np.isin(status,[1,3])&(~np.isfinite(distance)|~np.isfinite(height)))
                expected='resolved' if good else 'failed' if failed else 'unresolved'
                actual=S.resolve_sample_summary(counts,int(np.count_nonzero(~np.isin(status,[0,1,3,4]))),int(np.count_nonzero(np.isin(status,[1,3])&(~np.isfinite(distance)|~np.isfinite(height)))),bool(np.isfinite(distance).all() and np.isfinite(height).all()))
                check(actual==expected,'Status decision changed');cases+=1;outcomes[actual]+=1
    for distance,height in [(np.array([0.]),np.array([np.inf])),(np.array([np.inf]),np.array([0.]))]:
        check(S.resolve_sample_summary({'0':0,'1':0,'3':1,'4':0},0,1,False)=='failed','Nonfinite resolved')
    zero=S.affine_height(0.,0.,-0.,2.)
    check(struct.pack('<d',zero)==struct.pack('<d',0.),'Scalar plateau zero sign')
    plateau=S.affine_height(np.zeros(9),0.,-0.,2.)
    check(np.all(plateau==0) and not np.signbit(plateau).any(),'Array plateau zero sign')
    d0=np.array([-1.,0.,1.,2.,np.inf,np.nan]);t=dict(referenceDistanceM=6.8,referenceHeightM=89.06014237811313,slope=2.1600443105285194)
    before=t['referenceHeightM']-t['slope']*(d0-t['referenceDistanceM']);before[before==0]=0.
    check(S.affine_height(d0,t['referenceDistanceM'],t['referenceHeightM'],t['slope']).tobytes()==before.tobytes(),'Height arithmetic bits changed')
    for args in [({'0':True,'1':0,'3':0,'4':0},0,0,True),({'0':0,'1':0,'3':0,'4':0},0,0,True),({'0':1,'1':0,'3':0,'4':0},0,1,False)]:
        rejected(lambda:S.resolve_sample_summary(*args),'Invalid summary')
    result['policy']=dict(cases=cases,outcomes=outcomes,syntheticOnly=True,actualGPUStatus3And4='unverified; B2')
    passed('policy',result['policy'])

    spec=importlib.util.spec_from_file_location('parent_creator',GENERATION/'create-parent.py');creator=importlib.util.module_from_spec(spec);spec.loader.exec_module(creator)
    controls=PROJECT/'tests/reference/source-parent-controls';provenance=read(controls/'provenance.json');bundles={}
    for name in ['A','B']:
        for file,expected in provenance['files'][name].items():check(sha((controls/name/file).read_bytes())==expected,'Changed preserved source input')
        bundles[name]=creator.verify_bundle(controls/name)
        check(bundles[name]['status']=='resolved','Existing source input stopped resolving')
        check(bundles[name]['requestKey']==S.key(S.validate(read(controls/name/'recipe.json'))),'Old source key changed')
    result['sourceBundles']=bundles
    passed('bundles',bundles)
    check(not any(name.split('.')[0] in FORBIDDEN for name in sys.modules),'Unexpected native/GPU import')
    result.update(pass_=True,elapsedS=time.monotonic()-START)
except BaseException as error:
    import traceback
    result.update(pass_=False,error=traceback.format_exc(),elapsedS=time.monotonic()-START)
finally:
    (OUT/'python-results.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
    print(json.dumps({'pass':result.get('pass_'), 'elapsedS':result['elapsedS'],'error':result.get('error')}),flush=True)
if not result.get('pass_'):
    raise SystemExit(1)
