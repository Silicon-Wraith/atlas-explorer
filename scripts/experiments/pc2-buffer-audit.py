"""Bind offline NPZ reference inputs to the exact binary payloads used in flight."""
from pathlib import Path
import hashlib,json,os,sys
import numpy as np

root=Path(sys.argv[1]).resolve();assert not (root/'buffer-audit.json').exists(),'Preserve evidence'
data=json.loads((root/'qualification-input.json').read_text());rows=[]
for job in data['jobs']:
    d=job['meta']['diameter']
    with np.load(Path(job['stem']).with_suffix('.npz')) as z:
        arrays={'vertices':np.ascontiguousarray(z['vertices']/d,dtype=np.float32),'surface-indices':np.ascontiguousarray(z['collision_triangles'],dtype=np.uint32),'solid-indices':np.ascontiguousarray(z['triangles'],dtype=np.uint32)}
        for descriptor in job['buffers']:
            payload=Path(descriptor['file']).read_bytes();expected=arrays[descriptor['role']].tobytes()
            assert len(payload)==descriptor['byteLength'] and hashlib.sha256(payload).hexdigest()==descriptor['sha256']
            assert payload==expected,'NPZ reference input differs from actual browser binary '+descriptor['role']
    rows.append({'key':job['representationKey'],'roles':len(job['buffers']),'pass':True})
report=json.loads((root/'browser.json').read_text());native=json.loads((root/'native-records.json').read_text())
assert all(all(cache['peak']<=cache['limit'] for cache in job['caches'].values()) for job in native['records'] if job['status']=='prepared')
assert all(job['interactionCacheEvictions']==0 for job in native['records'] if job['status']=='prepared' and job['kind']=='view')
assert native['totalOutputBytes']<=4*2**30 and len(native['records'])<=512
checks={}
if report['mode']=='input':
    snaps=report['input'];t=np.array(report['setup']['fixture']['grid']['axes'][0]);D=report['setup']['fixture']['grid']['diameter']
    before=next(i for i,s in enumerate(snaps) if s['label']=='s');reverse=np.dot(np.array(snaps[before]['position'])-snaps[before-1]['position'],t)/D
    rejection=[e for e in report['browserCleanup']['events'] if e['type']=='scale-deferred' and e.get('smaller') is False and e.get('reason')=='clearance-or-coverage']
    assert reverse<-.3 and rejection
    checks={'actualCoarseReverseD':float(reverse),'wheelGrowthRefusalEvents':len(rejection)}
result={'pass':True,'pid':os.getpid(),'representations':rows,'nativeRecords':len(native['records']),'outputBytes':native['totalOutputBytes'],'cacheBounds':True,'viewInteractionCacheEvictions':0,'input':checks}
(root/'buffer-audit.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='representations'}))
