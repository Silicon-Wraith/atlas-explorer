"""Offline finite checks of the actual flight, separate from navigation timing."""
from pathlib import Path
import argparse,hashlib,itertools,json,os,sys,time,traceback
import numpy as np

parser=argparse.ArgumentParser();parser.add_argument('root');args=parser.parse_args();root=Path(args.root).resolve()
assert not (root/'flight-audit.json').exists(),'Preserve evidence'
report=json.loads((root/'browser.json').read_text());data=json.loads((root/'qualification-input.json').read_text())
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'generation/native'))
import generation_paths as GP
GP.configure_packages(); GP.install_io_guard(); GP.validate_inputs()
import descendant_world as W
# Distance reference resolves from the owned native package.
from check_collision_r0 import distances
started=time.monotonic();meshes={};rows=[];failure=None
def near(mesh,point):
    if not len(mesh['t']):return float('inf')
    mask=np.linalg.norm(np.maximum(mesh['lo']-point,0)+np.maximum(point-mesh['hi'],0),axis=1)<=.7
    return float(distances(point,mesh['t'][mask]).min()) if mask.any() else .7
def body_air(point,body):
    shell=np.array([[0,0,0],*[v for v in itertools.product([-1.,0.,1.],repeat=3) if any(v)]],float)
    shell/=np.maximum(np.linalg.norm(shell,axis=1),1)[:,None]
    return bool(np.all(W.occupancy(np.asarray(point)+shell*.5*body)==0))
try:
    assert report['cleanup'] and not report.get('failure')
    for source in data['sources']:assert hashlib.sha256(Path(source['file']).read_bytes()).hexdigest()==source['sha256']
    for job in data['jobs']:
        m=job['meta'];d=m['diameter']
        with np.load(Path(job['stem']).with_suffix('.npz')) as z:t=(z['vertices']/d).astype(np.float32).astype(float)[z['collision_triangles']]
        meshes[job['representationKey']]={'m':m,'t':t,'lo':t.min(1) if len(t) else None,'hi':t.max(1) if len(t) else None}
    ready={e['key']:e['time'] for e in report['browserCleanup']['events'] if e['type']=='ready'}
    # A representation may be rebuilt later. First readiness is the relevant bound.
    for e in report['browserCleanup']['events']:
        if e['type']=='ready':ready[e['key']]=min(ready[e['key']],e['time'])
    for run in report['runs']:
        entries=[];contacts=[]
        for e in run['events']:
            if e['type']=='entry':
                mesh=meshes[e['key']];m=mesh['m'];unit=m['diameter'];p=(np.asarray(e['position'])-m['origin'])/unit
                assert e['time']>=ready[e['key']] and e['renderRevision']==e['collisionRevision']==e['key']
                assert np.all(abs(p)+.501*e['bodyD']/unit<=m['half_extent']/unit+1e-8)
                clearance=near(mesh,p);assert clearance>=.501*e['bodyD']/unit-1e-6
                assert body_air(e['position'],e['bodyD']),'Independent body sample embedded at handoff'
                entries.append({'address':e['addressKey'],'clearanceBodyUnits':None if not np.isfinite(clearance) else clearance*unit/e['bodyD'],'airSamples':27})
            if e['type']=='contact':
                mesh=meshes[e['key']];m=mesh['m'];h=e['hit'];unit=m['diameter'];p=np.asarray(h['localStart']);delta=np.asarray(h['localDelta']);toi=h['toi']
                prefix=[near(mesh,p+fraction*delta) for fraction in np.linspace(0,toi,17)]
                stop=(np.asarray(e['position'])-m['origin'])/unit;clearance=near(mesh,stop)
                fraction=max(0,min(1,toi-.001/max(np.linalg.norm(delta),1e-9)))
                motion=float(np.max(abs(np.asarray(e['start'])+fraction*np.asarray(e['delta'])-e['position'])))
                assert min(prefix)>=.5-1e-5 and abs(prefix[-1]-.5)<=.01 and clearance>=.5-1e-5 and motion<=1e-10
                q=np.asarray(m['origin'])+unit*np.asarray(h['point']);n=np.asarray(h['normal']);tol=.01*unit;steps=np.linspace(-tol,tol,65);states=W.occupancy(q+steps[:,None]*n)
                change=(states[:-1]!=states[1:])&(states[:-1]!=2)&(states[1:]!=2);assert change.any(),'Contact has no mathematical crossing within tolerance'
                bound=float(min(max(abs(steps[k]),abs(steps[k+1])) for k in np.flatnonzero(change)))
                contacts.append({'address':e['addressKey'],'minimumPrefix':min(prefix),'stopClearance':clearance,'mathCrossingBodyUnits':bound/unit,'motionErrorM':motion})
        frames=run['frames'];max_step=0;waiting=0
        for before,after in zip(frames,frames[1:]):
            distance=float(np.linalg.norm(np.asarray(after['position'])-before['position']));bound=.05*max(before['bodyD'],after['bodyD']);assert distance<=bound+1e-10
            assert before['renderRevision']==before['collisionRevision'] and after['renderRevision']==after['collisionRevision'];max_step=max(max_step,distance)
            if after['waiting']:assert distance<1e-10;waiting+=1
        assert all(e['displacement']==0 for e in run['events'] if e['type']=='scale')
        rows.append({'scenario':run['scenario'],'entries':entries,'contacts':contacts,'checkedFrames':len(frames),'waitingFramesStationary':waiting,'maxStepM':max_step,'pass':True})
except Exception:failure=traceback.format_exc()
result={'pass':failure is None,'pid':os.getpid(),'error':failure,'runs':rows,'elapsedS':time.monotonic()-started,'scope':'Finite triangle-prefix, mathematical contact-crossing and body samples at actual handoffs; recorded-frame motion and revision checks. Not a continuous world/topology proof.'}
(root/'flight-audit.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='runs'}));sys.exit(0 if failure is None else 1)
