"""Finite independent CPU qualification; never part of measured runtime readiness."""
from pathlib import Path
import argparse,hashlib,json,os,sys,time,traceback
import numpy as np

parser=argparse.ArgumentParser();parser.add_argument('root');args=parser.parse_args()
ROOT=Path(args.root).resolve();data=json.loads((ROOT/'qualification-input.json').read_text())
assert not (ROOT/'qualification.json').exists(),'Preserve evidence'
(ROOT/'qualification.pid').write_text(str(os.getpid())+'\n')
for source in data['sources']:assert hashlib.sha256(Path(source['file']).read_bytes()).hexdigest()==source['sha256']
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'generation/native'))
import generation_paths as GP
GP.configure_packages(); GP.install_io_guard(); GP.validate_inputs()

import descendant_world as W
assert W.WORLD_ID==data['world']=='H1C-surface-child@ee2564d40bda7ef6'
# Distance reference resolves from the owned native package.
from check_collision_r0 import distances

def ref(c,a,b,kind):
    low,high,_=W.BASE_VALUES(c,a,b,False)
    if c['name']=='gchild':low=low-W.scalar_depth(a,b)[0]
    return low if kind=='floor' else high

def exposed(q,n):return (W.occupancy(q+1e-8*n)==0)&(W.occupancy(q-1e-8*n)==1)

def qualify(job):
    m=job['meta'];stem=Path(job['stem']);d=m['diameter'];tol=.01*d;o=np.array(m['origin']);half=m['half_extent']
    seed=int.from_bytes(hashlib.sha256(np.array([*o,d,half],dtype='<f8').tobytes()).digest()[:8],'little');rng=np.random.default_rng(seed)
    with np.load(stem.with_suffix('.npz')) as z:
        v=(z['vertices']/d).astype(np.float32).astype(float)*d;t=v[z['collision_triangles']]
        if job['kind']=='fine':
            with np.load(GP.asset('reference/fine-control.npz')) as control:
                assert all(np.array_equal(z[k],control[k]) for k in control.files),'Fine control changed'
    row={'representationKey':job['representationKey'],'kind':job['kind'],'origin':m['origin'],'classification':m['classification'],'sampling':m['sampling'],'toleranceM':tol}
    if not len(t):
        states=W.occupancy(o+rng.uniform(-half,half,(1024,3)));expected=0 if m['classification']=='empty-air' else 1
        row.update(referenceSamples=1024,meshSamples=0,pass_=bool(np.all(states==expected)),limits=['Finite occupancy samples, not proof of complete air/solid.'])
        row['pass']=row.pop('pass_');return row
    tl,th=t.min(1),t.max(1);references=[];fallback=None
    def collect(c,ab):
        found=[]
        for kind in ['floor'] if c['name']=='parent' else ['floor','cap']:
            h=ref(c,*ab.T,kind);q=c['F']+ab[:,0,None]*c['u']+ab[:,1,None]*c['v']+h[:,None]*c['n']
            valid=np.isfinite(q).all(1)&np.all(abs(q-o)<half-2*tol,axis=1);q=q[valid]
            found.extend(q[exposed(q,c['n'] if kind=='floor' else -c['n'])])
        return found
    for c in W.S.COMPONENTS:
        b=W.S.footprint(c,o,half/4)
        if b is None:continue
        ab=rng.uniform(b[[0,2]],b[[1,3]],(512,2))
        if c['name']=='gchild':ab=np.r_[ab,np.c_[W.A0+rng.uniform(-W.HALF,W.HALF,512),W.B0+rng.uniform(-W.HALF,W.HALF,512)]]
        references.extend(collect(c,ab))
    # Bounded forward-reference coverage follow-up, independent of mesh vertices.
    # A zero remains a missing completeness check; no tolerance/geometry change.
    if not references:
        for count in [17,33,65]:
            for c in W.S.COMPONENTS:
                b=W.S.footprint(c,o,half/4)
                if b is None:continue
                a,bv=np.meshgrid(np.linspace(b[0],b[1],count),np.linspace(b[2],b[3],count),indexing='ij')
                references.extend(collect(c,np.c_[a.ravel(),bv.ravel()]))
            fallback=count
            if references:break
    errors=[]
    for point in references:
        local=point-o;mask=np.linalg.norm(np.maximum(tl-local,0)+np.maximum(local-th,0),axis=1)<=2*tol
        errors.append(float(distances(local,t[mask] if mask.any() else t).min()))
    area=np.linalg.norm(np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]),axis=1);ids=rng.choice(len(t),512,p=area/area.sum())
    u=np.sqrt(rng.random(512));w=rng.random(512)
    q=(1-u[:,None])*t[ids,0]+(u*(1-w))[:,None]*t[ids,1]+(u*w)[:,None]*t[ids,2]+o
    normals=np.cross(t[ids,1]-t[ids,0],t[ids,2]-t[ids,0]);normals/=np.linalg.norm(normals,axis=1)[:,None]
    steps=np.linspace(-tol,tol,65);states=W.occupancy((q[:,None,:]+steps[None,:,None]*normals[:,None,:]).reshape(-1,3)).reshape(512,65)
    change=(states[:,:-1]!=states[:,1:])&(states[:,:-1]!=2)&(states[:,1:]!=2)
    rank=np.where(change,np.maximum(abs(steps[:-1]),abs(steps[1:]))[None,:],np.inf);bound=rank.min(1)
    row.update(referenceSamples=len(errors),meshSamples=512,referenceToMeshMaxM=max(errors,default=None),meshCrossingUpperMaxM=float(bound.max()),
               forwardReferenceGrid=fallback,limits=[] if errors else ['Missing forward-reference completeness samples.'])
    row['pass']=bool((not errors or max(errors)<=tol) and np.all(bound<=tol));return row

rows=[];started=time.monotonic();failure=None
try:
    for job in data['jobs']:
        row=qualify(job);rows.append(row)
        with (ROOT/'qualification-progress.jsonl').open('a') as stream:stream.write(json.dumps(row)+'\n')
        print(json.dumps(row),flush=True)
except Exception:failure=traceback.format_exc()
passed=len(rows)==len(data['jobs']) and all(r['pass'] for r in rows) and failure is None
result={'pass':passed,'specimens':rows,'error':failure,'sourcesKey':data['sourcesKey'],'elapsedS':time.monotonic()-started,
        'scope':'Finite direct CPU world-reference checks; original geometry, tolerance and world unchanged. Missing forward references remain explicit; not a global enclosure proof.'}
raw=json.dumps(result,indent=2,allow_nan=True)+'\n';(ROOT/'qualification.json').write_text(raw)
if passed and all(row['sampling'] is not None for row in rows):
    policies={}
    for row in rows:
        entry=policies.setdefault(row['kind'],{'sampling':row['sampling'],'qualifiedSpecimens':0})
        assert entry['sampling']==row['sampling'];entry['qualifiedSpecimens']+=1
    certificate={'sourcesKey':data['sourcesKey'],'evidenceId':'sha256:'+hashlib.sha256(raw.encode()).hexdigest(),'policies':policies}
    (ROOT/'policy-certificate.json').write_text(json.dumps(certificate,indent=2)+'\n')
print(json.dumps({'pass':passed,'specimens':len(rows),'elapsedS':result['elapsedS'],'error':failure}),flush=True)
sys.exit(0 if passed else 1)
