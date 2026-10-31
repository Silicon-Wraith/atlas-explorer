"""Independent float64 point-to-triangle distances at fixed sphere-sweep samples.
Not an exact-arithmetic sweep, topology proof, or production collision engine.
"""
from pathlib import Path
import json,time
import numpy as np

HERE=Path(__file__).resolve().parent

def distances(p,tri):
    a,b,c=tri[:,0],tri[:,1],tri[:,2];ab=b-a;ac=c-a;n=np.cross(ab,ac)
    nn=np.einsum('ij,ij->i',n,n);ap=p-a
    signed=np.einsum('ij,ij->i',ap,n)
    projection=p-n*(signed/np.maximum(nn,1e-300))[:,None]
    vp=projection-a
    aa=np.einsum('ij,ij->i',ab,ab);bb=np.einsum('ij,ij->i',ab,ac);cc=np.einsum('ij,ij->i',ac,ac)
    av=np.einsum('ij,ij->i',ab,vp);cv=np.einsum('ij,ij->i',ac,vp);den=aa*cc-bb*bb
    u=(cc*av-bb*cv)/np.maximum(den,1e-300);v=(aa*cv-bb*av)/np.maximum(den,1e-300)
    inside=(u>=-1e-12)&(v>=-1e-12)&(u+v<=1+1e-12)&(nn>1e-28)
    dsq=np.where(inside,signed*signed/np.maximum(nn,1e-300),np.inf)
    for x,y in ((a,b),(b,c),(c,a)):
        e=y-x;ee=np.einsum('ij,ij->i',e,e)
        t=np.clip(np.einsum('ij,ij->i',p-x,e)/np.maximum(ee,1e-300),0,1)
        d=p-x-t[:,None]*e;dsq=np.minimum(dsq,np.einsum('ij,ij->i',d,d))
    return np.sqrt(dsq)

def main():
    out=HERE/'independent-collision-r0.json'
    if out.exists():raise FileExistsError(out)
    t=time.perf_counter()
    simple=np.array([[[0.,0.,0.],[1.,0.,0.],[0.,1.,0.]]])
    assert np.allclose(distances(np.array([.2,.2,2.]),simple),[2.])
    assert np.allclose(distances(np.array([1.,1.,0.]),simple),[np.sqrt(.5)])
    assert np.allclose(distances(np.array([-1.,0.,0.]),simple),[1.])
    z=np.load(HERE/'mesh-contact-s1-r1.npz');tri=z['vertices'][z['collision_triangles']]
    lo,hi=tri.min(1),tri.max(1)
    meta=json.loads((HERE/'mesh-contact-s1-r1.json').read_text())
    col=json.loads((HERE/'collision-contact-s1-r0.json').read_text())
    radius=meta['diameter']/2;tol=meta['diameter']*.01;rows=[]
    for row in col['actual']:
        p=np.array(row['position']);d=np.array(row['translation']);hit=row['hit'];ti=hit['time_of_impact']
        checks=[]
        for fraction in np.linspace(0,1,9):
            pos=p+fraction*ti*d
            near=np.linalg.norm(np.maximum(lo-pos,0)+np.maximum(pos-hi,0),axis=1)<=radius+2*tol
            distance=float(distances(pos,tri[near]).min()) if near.any() else None
            checks.append({'fraction_of_reported_hit':float(fraction),'distance':distance,'triangles_checked':int(near.sum())})
        contact=checks[-1]['distance'];clear=all(c['distance'] is None or c['distance']>=radius-tol for c in checks)
        rows.append({'time_of_impact':ti,'contact_error':abs(contact-radius),'sampled_prefix_clear':clear,'checks':checks})
    # Check the saved closed solid's combinatorial edge pairing independently.
    faces=z['triangles'];edges=np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]])
    keys=np.sort(edges,axis=1);_,inv,count=np.unique(keys,axis=0,return_inverse=True,return_counts=True)
    direction=np.where(edges[:,0]<edges[:,1],1,-1);balance=np.bincount(inv,weights=direction)
    result={'tests':'plane interior, edge and vertex distances passed','sweeps':len(rows),'tolerance':tol,
            'max_contact_error':max(r['contact_error'] for r in rows),'all_sampled_prefixes_clear':all(r['sampled_prefix_clear'] for r in rows),
            'all_contacts_within_tolerance':all(r['contact_error']<=tol for r in rows),
            'closed_mesh_unpaired_edges':int((count!=2).sum()),'closed_mesh_orientation_failures':int((balance!=0).sum()),
            'elapsed_s':time.perf_counter()-t,'scope':'Finite-precision point-to-triangle checks on 16 saved sweeps and 9 points per prefix. No continuous-sweep, generator-fidelity or opening-topology proof.', 'rows':rows}
    out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='rows'}))

if __name__=='__main__':main()
