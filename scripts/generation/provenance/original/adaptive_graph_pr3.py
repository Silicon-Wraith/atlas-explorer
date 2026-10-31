"""Bounded tiled RTIN graph assembly using the existing PyMartini implementation."""
from pathlib import Path
import sys,time,hashlib
import numpy as np
sys.path.insert(0,'/mnt/ml_storage/scratch/atlas-prepared-toolchain/py')
from pymartini import Martini
import manifold3d as M

DENSE_VALIDATION = True

def axis_blocks(lo,hi,step,cells):
    blocks=max(1,int(np.ceil((hi-lo)/(step*cells))))
    # Global tensor-product axes; each tile has uniform spacing, last may be shorter.
    ends=np.minimum(lo+np.arange(blocks+1)*step*cells,hi);ends[-1]=hi
    return np.concatenate([np.linspace(ends[i],ends[i+1],cells+1)[:-1] for i in range(blocks)]+[np.array([hi])])

def tile_mesh(martini,height,tol):
    tile=martini.create_tile(height.astype(np.float32));size=height.shape[0]
    errors=np.asarray(tile.errors_view).reshape(size,size);errors[0,:]=np.inf;errors[-1,:]=np.inf;errors[:,0]=np.inf;errors[:,-1]=np.inf
    tile.update() # Re-propagate boundary requirements through the existing hierarchy.
    xy,f=tile.get_mesh(tol);xy=xy.reshape(-1,2).astype(np.int64);f=f.reshape(-1,3)
    boundary=((xy[:,0]==0)|(xy[:,0]==size-1)|(xy[:,1]==0)|(xy[:,1]==size-1))
    assert len(np.unique(xy[boundary],axis=0))==4*(size-1),'Missing required tile perimeter vertices'
    return xy[:,1],xy[:,0],f # Chart a=row, b=column; output winding is +chart normal.

def build_graph(bounds,step,diam,frame,origin,values,probe,cells=256,bottom_limit=None):
    """values(a,b)->low,cap or (surface,None); probe(a,b,kind)->height."""
    begin=time.perf_counter();axes=[axis_blocks(bounds[k],bounds[k+1],step,cells) for k in (0,2)];na,nb=map(len,axes)
    martini=Martini(cells+1);ids=[];lows=[];highs=[];floors=[];caps=[];offset=0;rows=[];parent=None;minimum=np.inf
    timings={'field_s':0.,'rtin_s':0.,'probe_s':0.};source_queries=0;probe_queries=0;maxprobe=0.;maxsource=0.;maxarrays=0
    for ia in range(0,na-1,cells):
      for ib in range(0,nb-1,cells):
        aa,bb=np.meshgrid(axes[0][ia:ia+cells+1],axes[1][ib:ib+cells+1],indexing='ij');t=time.perf_counter()
        lo,hi=values(aa,bb);lo=np.asarray(lo).reshape(aa.shape);parent=hi is None
        if not np.isfinite(lo).all():raise ValueError('Unresolved source samples')
        minimum=min(minimum,float(lo.min()))
        if parent:hi=lo;lo=np.zeros_like(hi)
        else:
            hi=np.asarray(hi).reshape(aa.shape)
            if not np.isfinite(hi).all() or np.any(lo>0) or np.any(hi<0):raise ValueError('Cutter sign-order invariant failed')
        timings['field_s']+=time.perf_counter()-t;source_queries+=aa.size
        maxarrays=max(maxarrays,aa.nbytes+bb.nbytes+lo.nbytes+hi.nbytes)
        t=time.perf_counter();li,lj,lf=tile_mesh(martini,lo,diam*.001);ui,uj,uf=tile_mesh(martini,hi,diam*.001);timings['rtin_s']+=time.perf_counter()-t
        for isupper,(ii,jj,ff) in enumerate(((li,lj,lf),(ui,uj,uf))):
            ids.append((ia+ii)*nb+(ib+jj));lows.append(lo[ii,jj]);highs.append(hi[ii,jj]);(caps if isupper else floors).append(ff.astype(np.int64)+offset);offset+=len(ii)
            if not DENSE_VALIDATION:continue
            if parent and not isupper:continue
            chart=np.c_[axes[0][ia+ii],axes[1][ib+jj]];heights=(hi if isupper else lo)[ii,jj];kind='field' if parent or not isupper else 'cap';t=time.perf_counter()
            for start in range(0,len(ff),65536):
                triangles=ff[start:start+65536];ab=chart[triangles];hh=heights[triangles]
                for weights in ((.5,.5,0.),(.5,0.,.5),(0.,.5,.5),(1/3,1/3,1/3)):
                    weights=np.array(weights);at=np.einsum('tij,i->tj',ab,weights);expected=hh@weights;actual=probe(at[:,0],at[:,1],kind)
                    if not np.isfinite(actual).all():raise ValueError('Unresolved emitted-triangle probes')
                    error=float(np.max(np.abs(actual-expected))) if len(expected) else 0.;maxprobe=max(maxprobe,error);probe_queries+=len(actual)
            timings['probe_s']+=time.perf_counter()-t
        if DENSE_VALIDATION:
            # Independent locations within source cells: source interpolation residual.
            t=time.perf_counter();tile_key=f"{cells}:{frame.get('name','control')}:{round((axes[0][ia]+frame.get('H',0))/(step*cells))}:{round((axes[1][ib]+frame.get('H',0))/(step*cells))}";rng=np.random.default_rng(int.from_bytes(hashlib.sha256(tile_key.encode()).digest()[:8],'little'));cell=rng.choice(cells*cells,min(4096,cells*cells),replace=False);i,j=cell//cells,cell%cells
            for x,y in ((2/3,1/3),(1/3,2/3)):
                a=aa[i,j]+x*(aa[i+1,j]-aa[i,j]);b=bb[i,j]+y*(bb[i,j+1]-bb[i,j]);grid=hi if parent else lo
                interp=((1-x)*grid[i,j]+(x-y)*grid[i+1,j]+y*grid[i+1,j+1]) if x>=y else ((1-y)*grid[i,j]+(y-x)*grid[i,j+1]+x*grid[i+1,j+1])
                actual=probe(a,b,'field')
                if not np.isfinite(actual).all():raise ValueError('Unresolved source-cell probes')
                maxsource=max(maxsource,float(np.max(np.abs(actual-interp))));probe_queries+=len(actual)
            timings['probe_s']+=time.perf_counter()-t
        rows.append({'tile_a':ia//cells,'tile_b':ib//cells,'floor_triangles':len(lf),'cap_triangles':len(uf)})
    t=time.perf_counter();allids=np.concatenate(ids);unique,first,inverse=np.unique(allids,return_index=True,return_inverse=True);lo=np.concatenate(lows);hi=np.concatenate(highs)
    seam=max(float(np.max(np.abs(lo-lo[first][inverse]))),float(np.max(np.abs(hi-hi[first][inverse]))))
    if seam!=0:raise ValueError(f'Shared source seam mismatch {seam}')
    lo=lo[first];hi=hi[first];n=len(unique)
    if n>2000000:raise ValueError('Selected vertex bound')
    if parent:lo[:]=min(minimum,float(bottom_limit))-diam
    lower=inverse[np.concatenate(floors)];upper=inverse[np.concatenate(caps)];equal=lo==hi
    # Zero-thickness face pairs at the taper corners do not bound a volume.
    lower=lower[~np.all(equal[lower],axis=1)];upper=upper[~np.all(equal[upper],axis=1)]
    ai=unique//nb;bi=unique%nb;idx=np.arange(n)
    def side(mask,key,reverse=False):
        selected=idx[mask];order=np.argsort(key[mask]);return selected[order[::-1] if reverse else order]
    rim=np.concatenate([side(bi==0,ai),side((ai==na-1)&(bi>0),bi),side((bi==nb-1)&(ai<na-1),ai,True),side((ai==0)&(bi>0)&(bi<nb-1),bi,True)])
    assert len(rim)==2*(na+nb)-4
    base=(frame['F']-origin)+axes[0][ai,None]*frame['u']+axes[1][bi,None]*frame['v'];vertices=np.concatenate([base+lo[:,None]*frame['n'],base+hi[:,None]*frame['n']])
    x=rim;y=np.roll(rim,-1);faces=np.concatenate([lower[:,::-1],upper+n,np.c_[x,y,y+n],np.c_[x,y+n,x+n]])
    remap=np.arange(2*n);remap[n+np.flatnonzero(equal)]=np.flatnonzero(equal);faces=remap[faces];faces=faces[(faces[:,0]!=faces[:,1])&(faces[:,1]!=faces[:,2])&(faces[:,2]!=faces[:,0])]
    used=np.zeros(2*n,bool);used[faces]=True;mapping=np.cumsum(used)-1;vertices=vertices[used];faces=mapping[faces]
    if np.linalg.det(np.array([frame['u'],frame['v'],frame['n']]).T)<0:faces=faces[:,::-1]
    assembly=time.perf_counter()-t;t=time.perf_counter();solid=M.Manifold(M.Mesh64(np.ascontiguousarray(vertices),np.ascontiguousarray(faces,dtype=np.uint64)));solid.num_tri()
    if solid.status()!=M.Error.NoError:raise ValueError(str(solid.status()))
    result={'tiles':len(rows),'source_queries':source_queries,'probe_queries':probe_queries,'selected_vertices':len(vertices),'triangles':len(faces),'dense_validation':DENSE_VALIDATION,'max_graph_probe_error':maxprobe if DENSE_VALIDATION else None,'max_source_cell_probe_error':maxsource if DENSE_VALIDATION else None,'graph_probe_pass':maxprobe<=diam*.005 if DENSE_VALIDATION else None,'source_probe_pass':maxsource<=diam*.004 if DENSE_VALIDATION else None,'seam_disagreement':seam,'largest_tile_source_array_bytes':maxarrays,'native_input_bytes':vertices.nbytes+faces.nbytes,'assembly_s':assembly,'native_constructor_s':time.perf_counter()-t,'elapsed_s':time.perf_counter()-begin,**timings,'tile_rows':rows}
    return solid,result

def test():
    fr=dict(F=np.zeros(3),u=np.eye(3)[0],v=np.eye(3)[1],n=np.eye(3)[2]);bounds=np.array([-1.,1.,-1.,1.]);origin=np.zeros(3)
    val=lambda a,b:(np.full(a.size,-1.),np.full(a.size,1.));probe=lambda a,b,k:np.full(len(a),1. if k=='cap' else -1.)
    for f in (fr,{**fr,'v':-fr['v']}):
        s,r=build_graph(bounds,.125,1.,f,origin,val,probe,cells=8);assert abs(s.volume()-8)<1e-10 and r['seam_disagreement']==0 and r['tiles']==4
    def lens(a,b):
        w=(1-a*a)*(1-b*b);return -w.ravel(),w.ravel()
    def lp(a,b,k):return (1 if k=='cap' else -1)*(1-a*a)*(1-b*b)
    s,r=build_graph(bounds,.125,1.,fr,origin,lens,lp,cells=8);assert s.status()==M.Error.NoError and s.volume()>0
    try:build_graph(bounds,.125,1.,fr,origin,lambda a,b:(a.ravel()*np.nan,None),lp,cells=8,bottom_limit=-2)
    except ValueError:pass
    else:raise AssertionError('Unknown accepted')
    print('Tiled flat and mirrored volumes, shared rims, source seam identity, boundary inclusion and unknown rejection pass.')

if __name__=='__main__':test()
