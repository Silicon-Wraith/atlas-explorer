"""Independent finite CPU/50-digit checks for actual GPU and creator output."""
from pathlib import Path
import importlib.util,json,math,sys
sys.dont_write_bytecode=True
import numpy as np
import mpmath as mp
mp.mp.dps=50
root=Path(sys.argv[1]);casefile=Path(sys.argv[2]);cases=json.loads(casefile.read_text())
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'generation'))
from source_recipe import load_json
spec=importlib.util.spec_from_file_location('parent_creator',Path(__file__).resolve().parents[1]/'generation/create-parent.py');creator=importlib.util.module_from_spec(spec);spec.loader.exec_module(creator)
def ref(c,budget):
    x,y=c.real,c.imag;xq=x-mp.mpf('.25');q=xq*xq+y*y
    if q*(q+xq)<mp.mpf('.25')*y*y*(1-mp.mpf('1e-9')) or (x+1)**2+y*y<mp.mpf('.0625')*(1-mp.mpf('1e-9')):return 3,mp.mpf(0),-2
    z=mp.mpc(0);dz=mp.mpc(0)
    for k in range(budget):
        dz=2*z*dz+1;z=z*z+c
        if abs(z)>1000000:return 1,abs(z)*mp.log(abs(z))/abs(dz),k+1
    return 0,None,-1
rows=[];direct=json.loads((root/'direct.json').read_text());assert direct['status']==cases['direct']['expectedStatuses'];assert direct['iterations']==[-2,1,-1,-1]
for i,(x,y) in enumerate(zip(cases['direct']['real'],cases['direct']['imag'])):
    c=mp.mpc(mp.mpf(str(x)),mp.mpf(str(y)));status,d,iteration=ref(c,1)
    if i==2:
        with np.errstate(over='ignore',invalid='ignore'):overflow=not np.isfinite(np.float64(x)*np.float64(x)+np.float64(y)*np.float64(y))
        assert overflow and status==1 and direct['distance'][i] is None
    else:
        assert status==direct['status'][i] and iteration==direct['iterations'][i]
        if status==1:assert abs(mp.mpf(direct['distance'][i])-d)<=abs(d)*mp.mpf('1e-10')+mp.mpf('1e-12')
        elif status==3:assert direct['distance'][i]==0
        else:assert direct['distance'][i] is None
for case in cases['creator']:
    label=case['id'];recipe=case['recipe'];bundle=root/label/'bundle';result=load_json(bundle/'result.json');verified=creator.verify_bundle(bundle)
    expected={'mixed':'resolved','failed':'failed','unknown':'unresolved'}[label];assert result['status']==expected==verified['status']
    with np.load(root/label/'diagnostics.npz',allow_pickle=False) as z:
        status=z['status'];distance=z['distance'];iterations=z['iterations'];assert status.shape==(3,3)
        if label=='mixed':
            assert result['counts']=={'0':0,'1':1,'3':8,'4':0}
            height=np.load(bundle/'height.npy',allow_pickle=False);assert np.all(height[status==3]==0) and not np.signbit(height[status==3]).any()
        else:
            assert result['definition'] is None and not (bundle/'height.npy').exists()
            assert result['counts']==({'0':0,'1':0,'3':1,'4':8} if label=='failed' else {'0':9,'1':0,'3':0,'4':0})
        centre=mp.mpc(mp.mpf(recipe['source']['re']),mp.mpf(recipe['source']['im']));unit=mp.mpf(recipe['source']['unitsPerMetre']);half=mp.mpf(recipe['grid']['halfExtentM'])
        for row in range(3):
            for col in range(3):
                c=centre+unit*mp.mpc((col-1)*half,-(row-1)*half);st,d,it=ref(c,recipe['numerics']['maxIterations'])
                if label=='failed' and status[row,col]==4:
                    with np.errstate(over='ignore',invalid='ignore'):
                        x,y=np.float64(str(c.real)),np.float64(str(c.imag));overflow=not np.isfinite(x*x+y*y)
                    assert overflow and st==1 and np.isnan(distance[row,col])
                else:
                    assert int(status[row,col])==st and int(iterations[row,col])==it
                    if st==1:
                        expected_d=d/unit;error=abs(mp.mpf(float(distance[row,col]))-expected_d);assert error<=abs(expected_d)*mp.mpf('1e-10')+mp.mpf('1e-12')
                        assert abs(float(height[row,col])+float(distance[row,col]))==0
                    elif st==3:assert distance[row,col]==0
                    else:assert np.isnan(distance[row,col])
    rows.append(dict(case=label,status=expected,counts=result['counts'],plateau='positive-zero; creator host proof, not normalization-branch coverage' if label=='mixed' else None))
assert 'cupy' not in sys.modules
out=dict(pass_=True,cpuOnly=True,mpmathDigits=50,rows=rows,direct=dict(status=direct['status'],iterations=direct['iterations'],overflow='mathematically escaping finite input; binary64 a2 not representable'),relTolerance='1e-10',absTolerance='1e-12')
(root/'reference.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out),flush=True)
