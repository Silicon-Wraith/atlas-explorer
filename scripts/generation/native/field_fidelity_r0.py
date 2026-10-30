"""Independent CPU point-field boundary samples for the composed H1C surface."""
from pathlib import Path
from generation_paths import DATA
import json,sys,time
import numpy as np
BASE=DATA
# Sampler imports resolve from the owned native package.
import sampling_r0 as S
HERE=Path(__file__).resolve().parent

def world_state(points):
    q=np.asarray(points);parent=None;unknown=None;cutair=np.zeros(len(q),bool);cutunknown=np.zeros(len(q),bool)
    for c in S.COMPONENTS:
        r=q-c['F'];a,b,d=r@c['u'],r@c['v'],r@c['n'];floor,cap,stats=S.values(c,a,b,False)
        if c['name']=='parent':parent=d<=floor;unknown=~np.isfinite(floor)
        else:
            w=S.taper(a/c['H'])*S.taper(b/c['H']);eligible=(w>0)&(d<cap)&(d>-c['A']*w)
            cutair|=eligible&np.isfinite(floor)&(d>floor);cutunknown|=eligible&~np.isfinite(floor)
    return np.where(cutair,0,np.where(unknown|(parent&cutunknown),2,np.where(parent,1,0)))

def exposed(points,normal,eps):
    finite=np.isfinite(points).all(1);out=np.zeros(len(points),bool);unknown=~finite
    if finite.any():
        a=world_state(points[finite]+eps*normal);b=world_state(points[finite]-eps*normal)
        unknown[finite]=(a==2)|(b==2);out[finite]=(a!=2)&(b!=2)&(a!=b)
    return out,unknown

def main():
    out=HERE/'field-fidelity-r0.json'
    if out.exists():raise FileExistsError(out)
    start=time.perf_counter();z=np.load(HERE/'mesh-trim-contact-s1-r0.npz');meta=json.loads((HERE/'mesh-trim-contact-s1-r0.json').read_text())
    origin=np.array(meta['origin']);diam=meta['diameter'];eps=diam*1e-7;tol=diam*.01
    tri=z['vertices'][z['collision_triangles']];areas=np.linalg.norm(np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]),axis=1)/2
    rng=np.random.default_rng(20261029);ids=rng.choice(len(tri),size=512,p=areas/areas.sum());u=np.sqrt(rng.random(512));v=rng.random(512)
    local=(1-u[:,None])*tri[ids,0]+(u*(1-v))[:,None]*tri[ids,1]+(u*v)[:,None]*tri[ids,2];meshpoints=local+origin
    best=np.full(512,np.inf);source=np.full(512,'',dtype='U20');unknown_any=np.zeros(512,bool)
    reference=[];stats=[]
    for c in S.COMPONENTS:
        r=meshpoints-c['F'];a,b=r@c['u'],r@c['v'];low,high,st=S.values(c,a,b,False)
        heights=[('floor',low)] if high is None else [('floor',low),('cap',high)]
        for name,height in heights:
            pts=c['F']+a[:,None]*c['u']+b[:,None]*c['v']+height[:,None]*c['n']
            valid,unc=exposed(pts,c['n'],eps);unknown_any|=unc;distance=np.linalg.norm(pts-meshpoints,axis=1)
            improve=valid&(distance<best);best[improve]=distance[improve];source[improve]=c['name']+'_'+name
        bounds=S.footprint(c,origin,diam)
        if bounds is None:continue
        points=rng.uniform(bounds[[0,2]],bounds[[1,3]],size=(512,2));low,high,st=S.values(c,points[:,0],points[:,1],False)
        heights=[('floor',low)] if high is None else [('floor',low),('cap',high)]
        for name,height in heights:
            pts=c['F']+points[:,0,None]*c['u']+points[:,1,None]*c['v']+height[:,None]*c['n']
            finite=np.isfinite(pts).all(1);inside=finite&np.all(np.abs(pts-origin)<meta['half_extent']-2*tol,axis=1)
            valid,unc=exposed(pts[inside],c['n'],eps)
            for pt in pts[inside][valid]:reference.append({'component':c['name'],'surface':name,'point':(pt-origin).tolist()})
            stats.append({'component':c['name'],'surface':name,'attempted':512,'nonfinite':int((~finite).sum()),'inside_cube':int(inside.sum()),'exposed':int(valid.sum()),'unknown_membership':int(unc.sum())})
        print(c['name'],'reference points',len(reference),'mesh samples with boundary candidate',int(np.isfinite(best).sum()),flush=True)
    worst=np.argsort(-best)[:16];missing=int((~np.isfinite(best)).sum());finite=best[np.isfinite(best)]
    result={'diameter':diam,'tolerance':tol,'exposure_epsilon':eps,'mesh_samples':512,'reference_surface_points':reference,'reference_sampling':stats,
            'mesh_to_field_max_upper_bound':float(finite.max()) if len(finite) else None,'mesh_to_field_p99_upper_bound':float(np.percentile(finite,99)) if len(finite) else None,
            'mesh_to_field_missing':missing,'mesh_samples_with_any_unknown_candidate':int(unknown_any.sum()),'mesh_to_field_sufficient_sample_pass':bool(missing==0 and np.all(best<=tol)),
            'worst_mesh_samples':[{'point':local[i].tolist(),'nearest_exposed_graph_distance':float(best[i]) if np.isfinite(best[i]) else None,'graph':str(source[i])} for i in worst],
            'elapsed_s':time.perf_counter()-start,'scope':'Independent CPU scalar evaluation. Mesh-to-field values are upper bounds from exposed graph candidates, not exact minimum distances. Reference-point-to-mesh queries are a separate step. No exhaustive topology proof.'}
    out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k not in ('reference_surface_points','worst_mesh_samples')}))

if __name__=='__main__':main()
