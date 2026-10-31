#!/usr/bin/env python3
"""Independent CPU qualification/audit. Does not import the production mesh builder."""
from pathlib import Path
import hashlib,json,sys
sys.dont_write_bytecode=True
import numpy as np
PROJECT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(PROJECT/'scripts/generation'))
from importlib.util import spec_from_file_location,module_from_spec
spec=spec_from_file_location('parent_creator',PROJECT/'scripts/generation/create-parent.py');creator=module_from_spec(spec);spec.loader.exec_module(creator)
from source_recipe import canonical
spec=spec_from_file_location('distance_reference',PROJECT/'scripts/generation/native/check_collision_r0.py');distance_reference=module_from_spec(spec);spec.loader.exec_module(distance_reference)

def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def check_case(root):
    metadata=json.loads((root/'specimen.json').read_text());bundle=root/'input'
    creator.verify_bundle(bundle)
    result=json.loads((bundle/'result.json').read_text());definition=result['definition'];h=np.load(bundle/'height.npy',allow_pickle=False)
    assert canonical(metadata['hello']['definition']['parameters']['parent'])==canonical(definition)
    n=h.shape[0];cells=n-1;extent=float(definition['recipe']['grid']['halfExtentM']);step=2*extent/cells;origin=np.array(metadata['hello']['grid']['origin'])
    assert cells==64 and extent==.8
    grid=np.linspace(-extent,extent,n);x,z=np.meshgrid(grid,grid);top=np.stack([x,h,z],axis=-1).reshape(-1,3)
    bounds=np.array([[-extent,h.min()-1,-extent],[extent,h.max()+1,extent]])
    expected_top=set()
    for j in range(cells):
        for i in range(cells):
            a=j*n+i;b=a+1;c=a+n;d=c+1;expected_top.add(tuple(sorted([a,c,b])));expected_top.add(tuple(sorted([b,c,d])))
    mixed=np.max(np.abs(h[:-1,:-1]-h[1:,:-1]-h[:-1,1:]+h[1:,1:]))/4
    gx=np.max(np.abs(np.diff(h,axis=1)))/step;gz=np.max(np.abs(np.diff(h,axis=0)))/step
    rows=[];physical=None
    for row in metadata['rows']:
        a=row['artifact'];assert np.allclose(np.array([a['bounds']['min'],a['bounds']['max']]),bounds,rtol=0,atol=1e-12)
        scale=a['transform']['metresPerUnit'];anchor=np.array(a['transform']['originM']);assert np.array_equal(anchor,origin)
        raw={}
        for b in a['buffers']:
            file=root/(row['kind']+'-'+b['role']+'.bin');assert file.stat().st_size==b['byteLength'] and sha(file)==b['sha256'];raw[b['role']]=file
        v=np.fromfile(raw['vertices'],dtype='<f4').reshape(-1,3).astype('f8');indices=np.fromfile(raw['surface-indices'],dtype='<u4').reshape(-1,3);world=v*scale+anchor
        assert v.shape==(8450,3) and indices.shape==(8192,3) and np.isfinite(v).all()
        assert {tuple(sorted(ids)) for ids in indices}==expected_top
        delta=np.max(np.abs(world[:n*n]-top),axis=0);bound=float(mixed+delta[1]+gx*delta[0]+gz*delta[2]+1e-12)
        assert bound<=1.25e-5 and abs(bound-a['representation']['sampling']['maxSurfaceErrorM'])<1e-12
        assert a['qualification']['toleranceM']==1.25e-5 and a['qualification']['kind']=='empirical'
        assert np.max(np.abs(world[n*n:,0]-top[:,0]))<=delta[0]+1e-12 and np.max(np.abs(world[n*n:,2]-top[:,2]))<=delta[2]+1e-12
        assert np.max(np.abs(world[n*n:,1]-bounds[0,1]))<1e-6
        tri=world[indices];normals=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);assert np.all(normals[:,1]>0)
        if physical is None:physical=world.copy()
        else:assert np.array_equal(world,physical),'Body normalizations moved physical geometry'
        # Each source-cell centre lies on the b-c diagonal; test both actual delivered planes.
        centre=np.stack([(x[:-1,:-1]+x[1:,1:])/2,(z[:-1,:-1]+z[1:,1:])/2],axis=-1).reshape(-1,2)
        plane=tri.reshape(-1,2,3,3);errors=[]
        for k in [0,1]:
            t=plane[:,k];p=centre-t[:,0][:,[0,2]];ab=t[:,1][:,[0,2]]-t[:,0][:,[0,2]];ac=t[:,2][:,[0,2]]-t[:,0][:,[0,2]]
            den=ab[:,0]*ac[:,1]-ab[:,1]*ac[:,0];u=(p[:,0]*ac[:,1]-p[:,1]*ac[:,0])/den;vv=(ab[:,0]*p[:,1]-ab[:,1]*p[:,0])/den
            interp=t[:,0,1]+u*(t[:,1,1]-t[:,0,1])+vv*(t[:,2,1]-t[:,0,1]);height=(h[:-1,:-1]+h[1:,:-1]+h[:-1,1:]+h[1:,1:]).ravel()/4
            errors.append(float(np.max(np.abs(interp-height))))
        assert max(errors)<=bound+1e-12
        volume=None
        if 'solid-indices' in raw:
            solid=np.fromfile(raw['solid-indices'],dtype='<u4').reshape(-1,3);assert solid.shape==(16896,3) and solid.max()<v.shape[0]
            edges=np.concatenate([solid[:,[0,1]],solid[:,[1,2]],solid[:,[2,0]]]);keys,inverse,counts=np.unique(np.sort(edges,axis=1),axis=0,return_inverse=True,return_counts=True)
            balance=np.bincount(inverse,weights=np.where(edges[:,0]<edges[:,1],1,-1));assert np.all(counts==2) and np.all(balance==0)
            t=v[solid];volume=float(np.sum(np.einsum('ij,ij->i',t[:,0],np.cross(t[:,1],t[:,2])))/6*scale**3)
            assert volume>0 and volume<=np.prod(bounds[1]-bounds[0]) and abs(volume-a['classificationBasis']['volumeM3'])<1e-9
        rows.append(dict(kind=row['kind'],surfaceErrorM=bound,cellCentreErrorM=max(errors),roundoffM=delta.tolist(),volumeM3=volume,buffers=a['buffers']))
    for key in ['grid','viewGrid']:
        g=metadata['hello'][key];axes=np.array(g['axes']);d=g['diameter'];domain=g['domain'];lo=np.array([p[0] for p in domain]);hi=np.array([p[1] for p in domain]);origin=np.array(g['origin'])
        low=origin+.5*d*np.minimum(axes*lo[:,None],axes*hi[:,None]).sum(axis=0)-d;high=origin+.5*d*np.maximum(axes*lo[:,None],axes*hi[:,None]).sum(axis=0)+d
        assert np.all(low>=bounds[0]) and np.all(high<=bounds[1])
        if key=='grid':
            # All global coarse-body centres covered by the solid stay inside pose admission.
            assert np.all(bounds[0]+.501*d>=low) and np.all(bounds[1]-.501*d<=high)
    return dict(name=root.name,pass_=True,definitionKey=definition['definitionKey'],rows=rows)

def audit(root):
    data=json.loads((root/'source-browser.json').read_text());rows=[]
    for phase in data['phases']:
        if phase['kind'] not in ['A','B']:continue
        specimen=Path(data['inputs'])/phase['kind'];meta=json.loads((specimen/'specimen.json').read_text())
        mapping={r['kind']:r for r in meta['rows']};checks=0;minimum=float('inf');contacts=0
        for body in [.1,.025]:
            kind='coarse' if body==.1 else 'fine';row=mapping[kind];a=row['artifact'];scale=a['transform']['metresPerUnit'];anchor=np.array(a['transform']['originM'])
            v=np.fromfile(specimen/(kind+'-vertices.bin'),dtype='<f4').reshape(-1,3).astype('f8')*scale+anchor;ids=np.fromfile(specimen/(kind+'-surface-indices.bin'),dtype='<u4').reshape(-1,3);tri=v[ids]
            maxcoord=np.max(np.abs((v-anchor)/scale));slack=8*2**(np.floor(np.log2(max(1,maxcoord)))-23)*scale
            error=a['representation']['sampling']['maxSurfaceErrorM'];events=phase.get('events',[])
            frames=[e for e in events if e['type']=='frame' and e['bodyD']==body and e.get('rendered')];selected=frames[::max(1,len(frames)//64)]+frames[-1:]
            contact=[e for e in events if e['type']=='contact' and e['bodyD']==body];contacts+=len(contact)
            for e in contact[::max(1,len(contact)//8)]:
                for t in [0,.5,1]:selected.append(dict(position=(np.array(e['start'])+(np.array(e['position'])-e['start'])*t).tolist()))
            for e in selected:
                p=np.array(e['position']);dist=float(distance_reference.distances(p,tri).min());clearance=dist-body/2
                assert clearance>=-slack,(phase['label'],kind,clearance,slack)
                minimum=min(minimum,clearance-error);checks+=1
        rows.append(dict(phase=phase['label'],samples=checks,contacts=contacts,conservativeSourceClearanceLowerBoundM=minimum))
    assert rows and all(r['samples']>0 for r in rows)
    return dict(pass_=True,rows=rows,cudaImported='cupy' in sys.modules)

if __name__=='__main__':
    root=Path(sys.argv[1]).resolve()
    if not str(root).startswith('/mnt/ml_storage/scratch/atlas-md2a22/'):raise ValueError('Private source evidence root required')
    if len(sys.argv)>2 and sys.argv[2]=='--audit':report=audit(root);name='motion-audit.json'
    else:report=dict(pass_=True,rows=[check_case(root/n) for n in ['A','B']],cudaImported='cupy' in sys.modules,python=sys.version.split()[0],numpy=np.__version__);name='qualification.json'
    assert not report['cudaImported'];(root/name).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
