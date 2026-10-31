"""Independent high-precision checks for the frozen A2.1 comparison; CPU only."""
from pathlib import Path
import argparse, json, sys
sys.dont_write_bytecode = True
import numpy as np
import mpmath as mp

def read(path):
    return json.loads(Path(path).read_text())

def check(root):
    root = Path(root); recipe = read(root / 'bundle/recipe.json')
    result = read(root / 'bundle/result.json')
    assert result['status'] == 'resolved'
    height = np.load(root / 'bundle/height.npy', allow_pickle=False)
    with np.load(root / 'diagnostics.npz', allow_pickle=False) as d:
        distance=d['distance']; status=d['status']; iterations=d['iterations']
    n=height.shape[0]; total=n*n; flat_it=iterations.ravel(); flat_status=status.ravel()
    ids=[]
    def add(k):
        if k not in ids and len(ids)<32:
            ids.append(k)
    for k in [0,n-1,n*(n-1),total-1,(n//2)*n+n//2]: add(k)
    hardest=sorted((k for k in range(total) if flat_status[k]==1),key=lambda k:(-int(flat_it[k]),k))[:8]
    for k in hardest:add(k)
    for k in range(32):add(k*(total-1)//31)
    for k in range(total):add(k)
    assert len(ids)==32
    rows=[]
    with mp.workdps(50):
        # No creator coordinate helpers or coordinate arrays are read here.
        cr=mp.mpf(recipe['source']['re']); ci=mp.mpf(recipe['source']['im'])
        unit=mp.mpf(recipe['source']['unitsPerMetre']); half=mp.mpf(recipe['grid']['halfExtentM'])
        slope=mp.mpf(recipe['transfer']['slope']); href=mp.mpf(recipe['transfer']['referenceHeightM'])
        dref=mp.mpf(recipe['transfer']['referenceDistanceM']); maximum=recipe['numerics']['maxIterations']
        margin=1-mp.mpf('1e-9'); radius=mp.mpf('1000000')
        for k in ids:
            i,j=divmod(k,n)
            x=half*(2*j-recipe['grid']['cells'])/recipe['grid']['cells']
            zlocal=half*(2*i-recipe['grid']['cells'])/recipe['grid']['cells']
            c=mp.mpc(cr+unit*x,ci-unit*zlocal)
            q=(c.real-mp.mpf('.25'))**2+c.imag**2
            interior=(q*(q+c.real-mp.mpf('.25'))<mp.mpf('.25')*c.imag**2*margin or
                      (c.real+1)**2+c.imag**2<mp.mpf('.0625')*margin)
            reference_status=3 if interior else 0; count=-2; value=mp.mpf(0) if interior else None
            zz=mp.mpc(0); derivative=mp.mpc(0)
            if not interior:
                for t in range(maximum):
                    derivative=2*zz*derivative+1; zz=zz*zz+c
                    if abs(zz)>radius:
                        reference_status=1;count=t+1;value=abs(zz)*mp.log(abs(zz))/abs(derivative)/unit;break
            assert reference_status==int(flat_status[k]),('classification',k,reference_status,int(flat_status[k]))
            assert value is not None
            expected_height=href-slope*(value-dref)
            de=float(abs(value-mp.mpf(float(distance.ravel()[k]))))
            he=float(abs(expected_height-mp.mpf(float(height.ravel()[k]))))
            assert de<=1e-4 and he<=1e-4,('mathematical error',k,de,he)
            rows.append(dict(index=k,row=i,column=j,status=reference_status,gpuIterations=int(flat_it[k]),referenceIterations=count,
                             distanceErrorM=de,heightErrorM=he))
    return dict(pass_=True,source=recipe['source'],points=rows,highestIterationIndices=hardest,
                maxDistanceErrorM=max(x['distanceErrorM'] for x in rows),maxHeightErrorM=max(x['heightErrorM'] for x in rows),
                iterationMismatches=[x['index'] for x in rows if x['gpuIterations']!=x['referenceIterations']],
                heightRangeM=float(np.ptp(height)),height=height)

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('a');p.add_argument('b');p.add_argument('output');args=p.parse_args()
    a,b=check(args.a),check(args.b);ah=a.pop('height');bh=b.pop('height')
    difference=float(np.max(np.abs((ah-ah.flat[0])-(bh-bh.flat[0]))))
    assert a['heightRangeM']>0 and b['heightRangeM']>0 and difference>0
    result=dict(pass_=True,precisionDigits=50,cases=dict(A=a,B=b),offsetRemovedDifferenceM=difference,
                cudaImported='cupy' in sys.modules,scope='64 finite source checks at pre-screened locations; no arbitrary-source or browser acceptance.')
    Path(args.output).write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k!='cases'}))

if __name__=='__main__':main()
