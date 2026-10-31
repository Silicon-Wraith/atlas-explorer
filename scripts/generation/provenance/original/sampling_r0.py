"""PR1 necessary graph-sampling gate; no occupancy-box refinement or CSG.

GPU field evaluation uses preserved pert.py; independent direct CPU h1lib
evaluations provide fixed off-grid checks. Neither reference is a soundness proof.
"""
from pathlib import Path
import argparse, hashlib, itertools, json, sys, time, resource
import numpy as np
import cupy as cp

ROOT = Path('/mnt/ml_storage/scratch/valley-spike/zoom2d')
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'gpu'))
sys.path.insert(0, str(ROOT / 'h1'))
sys.path.insert(0, str(ROOT / 'gpu/r1/code'))
import pert
import fkern
import h1lib as H

CON = json.loads((HERE.parent / 'construction.json').read_text())
GS = json.loads((HERE.parent / 'gs.json').read_text())['fixtures']
COMPONENTS = [dict(name='parent', F=H.O, u=H.UA, v=H.VA, n=H.NRM,
                   C=H.CS, H=H.H0, A=H.A0, L=H.L0)]
for k in ('K1', 'K2'):
    c = dict(CON[k]); c['C'] = complex(*c['C'])
    for key in ('F', 'u', 'v', 'n'): c[key] = np.asarray(c[key])
    COMPONENTS.append(c)
REFS = {c['name']: pert.ref_orbit(c['C'], 131072) for c in COMPONENTS}

def taper(a):
    a = np.abs(a)
    return np.where(a <= .8, 1., np.where(a >= 1., 0., .5 + .5*np.cos(np.pi*(a-.8)/.2)))

def values(c, a, b, gpu):
    """Graph height(s), explicit unknown mask, and evaluator counters."""
    a, b = np.asarray(a).ravel(), np.asarray(b).ravel()
    w = taper(a/c['H']) * taper(b/c['H'])
    ids = np.flatnonzero(w > 0); D = np.zeros(len(a)); stats = {'queries': len(ids), 'promoted': 0}
    t = time.perf_counter()
    if len(ids):
        if gpu:
            d, info = pert.dser(c['C'], H.U*(a[ids]+1j*b[ids]), H.U, ref=REFS[c['name']])
            bad = (info['status'] == 2) | ((info['status'] == 1) & ~np.isfinite(d))
            if bad.any():
                di, st, _ = fkern.fdser(c['C'], H.U, a[ids[bad]], b[ids[bad]])
                di, st = di.get(), st.get()
                d[bad] = np.where(((st == 1) & np.isfinite(di)) | (st == 3), di, np.nan)
            stats['promoted'] = int(bad.sum())
            stats['iterations'] = int(np.maximum(info['it'], 0).sum())
        else:
            d = H.Dser(c['C'] + H.U*(a[ids]+1j*b[ids]))
        D[ids] = d
    low = -c['A']*w*np.exp(-D/c['L'])
    if c['name'] == 'parent':
        low += H.T0(np.c_[a, b]); high = None
    else:
        high = c['htop']*w
    return low, high, {'unknown': int((~np.isfinite(low)).sum()), 'elapsed_s': time.perf_counter()-t, **stats}

def centers():
    contact = (np.array(GS['child']['T'])+np.array(GS['child']['T2']))/2
    edge = GS['edge']; es = np.array(edge['S']); et = np.array(edge['T'])
    ec = es + .5*edge['ref_contact_from_S']*(et-es)/np.linalg.norm(et-es)
    return {'contact': contact, 'edge': ec, 'local_control': contact+2*(2*GS['child']['r'])*H.UA}

def footprint(c, center, diameter):
    corners = center + np.array(list(itertools.product((-4*diameter,4*diameter),repeat=3)))
    relative = corners-c['F']; aa, bb, dd = relative@c['u'], relative@c['v'], relative@c['n']
    bounds = np.array([aa.min(),aa.max(),bb.min(),bb.max()])
    if c['name'] != 'parent':
        bounds[[0,2]] = np.maximum(bounds[[0,2]], -c['H'])
        bounds[[1,3]] = np.minimum(bounds[[1,3]], c['H'])
        if bounds[0] >= bounds[1] or bounds[2] >= bounds[3] or dd.min() > c['htop'] or dd.max() < -c['A']:
            return None
    return bounds

def triangle_interpolate(g, axes, points):
    """Fixed diagonal (i,j)-(i+1,j+1), same eventual mesh connectivity."""
    a,b=axes
    i=np.clip(np.searchsorted(a,points[:,0],side='right')-1,0,len(a)-2)
    j=np.clip(np.searchsorted(b,points[:,1],side='right')-1,0,len(b)-2)
    x=(points[:,0]-a[i])/(a[i+1]-a[i]); y=(points[:,1]-b[j])/(b[j+1]-b[j])
    return np.where(x>=y,(1-x)*g[i,j]+(x-y)*g[i+1,j]+y*g[i+1,j+1],
                    (1-y)*g[i,j]+(y-x)*g[i,j+1]+x*g[i+1,j+1])

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--out',required=True);ap.add_argument('--fixtures',default='contact,edge,local_control')
    args=ap.parse_args();output=Path(args.out)
    if output.exists():raise FileExistsError(output)
    warm=time.perf_counter()
    for c in COMPONENTS:values(c,np.array([.031]),np.array([.023]),True)
    cp.cuda.get_current_stream().synchronize();warm=time.perf_counter()-warm
    out={'note':'Necessary sampled graph check only. Timings exclude imports/context/kernel warm-up; not region-ready times.',
         'device':str(cp.cuda.runtime.getDeviceProperties(0)['name']),'warmup_s':warm,'scales':[],
         'sources':{str(f):hashlib.sha256(f.read_bytes()).hexdigest() for f in [Path(__file__),Path(pert.__file__),Path(fkern.__file__),Path(H.__file__),HERE.parent/'construction.json',HERE.parent/'gs.json']}}
    journal=output.with_suffix('.jsonl').open('x')
    for fixture in args.fixtures.split(','):
      center=centers()[fixture]
      for scale in (1,4,16):
        diameter=2*GS['child']['r']/scale;tol=diameter*.01
        group={'fixture':fixture,'scale_divisor':scale,'diameter':diameter,'tolerance':tol,'origin':center.tolist(),'components':[]}
        for c in COMPONENTS:
          bounds=footprint(c,center,diameter)
          if bounds is None:
            group['components'].append({'component':c['name'],'skipped':'outside component support/envelope'});continue
          rng=np.random.default_rng(20261028)
          points=rng.uniform(bounds[[0,2]],bounds[[1,3]],size=(257,2))
          ref, refcap, rs=values(c,points[:,0],points[:,1],False)
          direct, _, ds=values(c,points[:,0],points[:,1],True)
          valid=np.isfinite(ref)&np.isfinite(direct)
          record={'component':c['name'],'bounds':bounds.tolist(),'reference_stats':rs,'point_gpu_stats':ds,
                  'point_max_discrepancy':float(np.max(np.abs(ref[valid]-direct[valid]))) if valid.any() else None,
                  'steps':[]}
          for subdivisions in (4,8,16,32,64,128):
            step=diameter/subdivisions
            axes=[np.arange(np.floor(bounds[k]/step)-1,np.ceil(bounds[k+1]/step)+2)*step for k in (0,2)]
            count=len(axes[0])*len(axes[1])
            if count>4000000:
              record['steps'].append({'subdivisions_per_diameter':subdivisions,'stop':'four-million-vertex bound','vertices':count});break
            a,b=np.meshgrid(*axes,indexing='ij');t=time.perf_counter()
            low,high,stats=values(c,a,b,True);grid=low.reshape(a.shape)
            got=triangle_interpolate(grid,axes,points)
            err=np.abs(got-ref); finite=np.isfinite(err)
            caperr=0 if high is None else float(np.max(np.abs(triangle_interpolate(high.reshape(a.shape),axes,points)-refcap)))
            points3=(c['F']-center)+a.ravel()[:,None]*c['u']+b.ravel()[:,None]*c['v']+low[:,None]*c['n']
            finite3=np.isfinite(points3).all(axis=1)
            quant=float(np.max(np.linalg.norm(points3[finite3].astype(np.float32).astype(float)-points3[finite3],axis=1))) if finite3.any() else None
            maxerr=float(np.max(err[finite])) if finite.any() else None
            passed=bool(finite.all() and stats['unknown']==0 and maxerr<=tol and caperr<=tol and quant<=tol)
            row={'subdivisions_per_diameter':subdivisions,'vertices':count,'surface_triangles':int(2*(len(axes[0])-1)*(len(axes[1])-1)),
                 'graph_stats':stats,'max_error':maxerr,'p95_error':float(np.percentile(err[finite],95)) if finite.any() else None,
                 'unresolved_checks':int((~finite).sum()),'cap_max_error':caperr,'local_f32_quantization_max':quant,
                 'graph_gate_pass':passed,'elapsed_s':time.perf_counter()-t,'cpu_grid_array_bytes':int(a.nbytes+b.nbytes+low.nbytes+points3.nbytes+(high.nbytes if high is not None else 0)),
                 'gpu_pool_peak_retained':int(cp.get_default_memory_pool().total_bytes())}
            record['steps'].append(row);journal.write(json.dumps({'fixture':fixture,'scale':scale,'component':c['name'],**row})+'\n');journal.flush()
            print(fixture,scale,c['name'],subdivisions,count,'unknown',stats['unknown'],'error',maxerr,'tol',tol,'pass',passed,flush=True)
            if passed:break
            # Unknown vertices reject this publication policy; finer grids cannot erase the failed attempt.
            if stats['unknown'] or rs['unknown']:record['stop']='unresolved required graph samples';break
          group['components'].append(record)
        out['scales'].append(group)
        output.write_text(json.dumps(out,indent=2)+'\n')
    out['rss_peak_mb']=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024
    out['all_graph_gates_pass']=all(c.get('skipped') or any(s.get('graph_gate_pass') for s in c['steps']) for g in out['scales'] for c in g['components'])
    output.write_text(json.dumps(out,indent=2)+'\n');journal.close()
    cp.cuda.get_current_stream().synchronize();cp.get_default_memory_pool().free_all_blocks()

if __name__=='__main__':main()
