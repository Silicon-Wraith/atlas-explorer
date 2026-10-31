"""One authored descendant on an exact generated floor; no observer inputs."""
from pathlib import Path
import json,hashlib,sys,numpy as np
ROOT=Path('/mnt/ml_storage/scratch/valley-spike/zoom2d/gpu/ia/rc1')
sys.path.insert(0,str(ROOT/'prepared-opt-r0'))
import field_fidelity_r0 as F
S=F.S;H=S.H;K2=next(c for c in S.COMPONENTS if c['name']=='gchild')
A0,B0=-.029882812666932553,-.11953125059172012
HALF=.0033203125;AMPLITUDE=.0002;RATIO=64.
BASE_VALUES=S.values
BASE_INPUTS=[ROOT/'construction.json',Path(S.__file__),Path(H.__file__),Path(__file__),Path('/mnt/ml_storage/scratch/valley-spike/zoom2d/z1/base.npz'),Path('/mnt/ml_storage/scratch/valley-spike/surface/frame.json')]
INPUT_HASHES={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in BASE_INPUTS}
SPEC={'version':'surface-descendant-r1','base':INPUT_HASHES,'chart_centre':[A0,B0],'half_support_m':HALF,'amplitude_m':AMPLITUDE,'source_scale':RATIO,'rule':'f3=f2-(A3/A2)*(-kernel_floor(q*(a-a0),q*(b-b0)))'}
WORLD_ID='H1C-surface-child@'+hashlib.sha256(json.dumps(SPEC,sort_keys=True).encode()).hexdigest()[:16]

def scalar_depth(a,b):
    a,b=np.asarray(a).ravel(),np.asarray(b).ravel()
    x,y=(a-A0)/HALF,(b-B0)/HALF
    w=S.taper(x)*S.taper(y);needed=w>0;mod=np.zeros(len(a));unknown=np.zeros(len(a),bool)
    D=H.Dser(K2['C']+H.U*RATIO*((a[needed]-A0)+1j*(b[needed]-B0)))
    unknown[needed]=~np.isfinite(D);mod[needed]=np.exp(-D/K2['L'])
    return AMPLITUDE*w*mod,mod,unknown

def values(c,a,b,gpu):
    low,high,stats=BASE_VALUES(c,a,b,gpu)
    if c['name']!='gchild':return low,high,stats
    af,bf=np.asarray(a).ravel(),np.asarray(b).ravel();mask=(abs(af-A0)<HALF)&(abs(bf-B0)<HALF)
    low=np.array(low,copy=True)
    if mask.any():
        kl,_,ks=BASE_VALUES(K2,RATIO*(af[mask]-A0),RATIO*(bf[mask]-B0),gpu)
        low[mask]+=(AMPLITUDE/K2['A'])*kl
        stats={**stats,'queries':stats.get('queries',0)+ks.get('queries',0),'descendant_queries':int(mask.sum())}
    stats={**stats,'unknown':int((~np.isfinite(low)).sum()),'world_identity':WORLD_ID}
    return low,high,stats

def occupancy(points):
    """Independent CPU construction reference: explicit graph intervals, direct D."""
    q=np.atleast_2d(points);parent=None;unknown=None;cutair=np.zeros(len(q),bool);cutunknown=np.zeros(len(q),bool)
    for c in S.COMPONENTS:
        r=q-c['F'];a,b,z=r@c['u'],r@c['v'],r@c['n'];floor,cap,_=BASE_VALUES(c,a,b,False)
        if c['name']=='parent':parent=z<=floor;unknown=~np.isfinite(floor);continue
        if c['name']=='gchild':floor=floor-scalar_depth(a,b)[0]
        w=S.taper(a/c['H'])*S.taper(b/c['H']);floor_valid=np.isfinite(floor);eligible=(w>0)&(z<cap)
        cutair|=eligible&floor_valid&(z>floor)
        cutunknown|=eligible&~floor_valid
    return np.where(cutair,0,np.where(unknown|(parent&cutunknown),2,np.where(parent,1,0)))
