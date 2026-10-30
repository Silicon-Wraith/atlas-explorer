"""Combine preserved PC2 evidence without replacing run-local results."""
from pathlib import Path
import hashlib,json,math,sys

base=Path('/mnt/ml_storage/scratch/atlas-pc2');project=Path(__file__).resolve().parents[2]
def read(root,name):return json.loads((base/root/name).read_text())
def stats(values):
    v=sorted(values)
    return {'n':len(v),**{label:(v[min(len(v)-1,math.ceil(p*len(v))-1)] if v else None) for label,p in [('p50',.5),('p95',.95),('p99',.99),('max',1)]}}
def audit_summary(value):
    return {'pass':value['pass'],'scope':value['scope'],'elapsedS':value['elapsedS'],'runs':[{'scenario':row['scenario'],'entries':len(row['entries']),'contacts':len(row['contacts']),'checkedFrames':row['checkedFrames'],'waitingFramesStationary':row['waitingFramesStationary'],'maximumMathContactBodyUnits':max((e['mathCrossingBodyUnits'] for e in row['contacts']),default=None),'minimumContactPrefix':min((e['minimumPrefix'] for e in row['contacts']),default=None),'maxStepM':row['maxStepM']} for row in value['runs']]}
full=read('browser-full-r1','browser.json');wire=read('browser-wiring-r0','browser.json');input_run=read('browser-input-r0','browser.json')
assert full['cleanup'] and wire['cleanup'] and input_run['cleanup'] and not any(r.get('failure') for r in [full,wire,input_run])
assert full['sources']==input_run['sources']
qualified={}
for root in ['native-smoke-r0','browser-full-r1','browser-input-r0']:
    q=read(root,'qualification.json');assert q['pass']
    for row in q['specimens']:qualified[row['representationKey']]=row
wire_keys={job['representationKey'] for job in read('browser-wiring-r0','qualification-input.json')['jobs']}
assert wire_keys<=qualified.keys(),'Final wiring introduced unqualified geometry'
changed=[name for name,digest in full['sources'].items() if wire['sources'].get(name)!=digest]
added=sorted(set(wire['sources'])-set(full['sources']))
server=read('browser-full-r1','server.json');queued={};active=None;queue_peak=0;active_peak=0;view_intervals=[];violations=[]
for e in server['events']:
    if e['type']=='queued':queued[e['order']]=e['kind'];queue_peak=max(queue_peak,len(queued))
    elif e['type']=='cancelled':queued.pop(e['order'],None)
    elif e['type']=='dispatch':
        if active is not None:violations.append('overlapping native dispatch')
        if e['kind']=='view' and any(kind!='view' for order,kind in queued.items() if order!=e['order']):violations.append('view ahead of queued interaction')
        queued.pop(e['order'],None);active=e;active_peak=max(active_peak,1)
    elif e['type']=='finished':
        if active and active['kind']=='view':view_intervals.append([active['time'],e['time']])
        active=None
assert queue_peak<=2 and not violations and active is None
events=full['browserCleanup']['events'];requests={e['requestId']:e for e in events if e['type']=='request'};transfers={e['requestId']:e for e in events if e['type']=='transfer-ready'}
phases=[]
for ready in [e for e in events if e['type']=='ready']:
    request=requests[ready['requestId']];transfer=transfers[ready['requestId']]
    consumer=max((e for e in events if e['type']=='consumer-prepared' and e['representationKey']==ready['key'] and request['time']<=e['time']<=ready['time']),key=lambda e:e['time'])
    native=transfer['native']['timings'];timing=consumer['timings'];cached=transfer['cacheHit']
    phases.append({'kind':ready['kind'],'classification':ready['classification'],'readinessMs':ready['readinessMs'],'cacheHit':cached,
      'frontQueueMs':None if cached else native['nativeStart']-request['started'],'nativeMs':None if cached else native['nativeReady']-native['nativeStart'],
      'responseAndTransferMs':None if cached else transfer['time']-native['nativeReady'],'consumerDispatchMs':timing['workerBegin']-transfer['time'],'workerMs':timing['workerEnd']-timing['workerBegin'],
      'restoreMs':timing['restoreMs'],'warmupMs':timing['warmupMs'],'uploadMs':timing['uploadMs'],'publicationMs':ready['time']-consumer['time'],
      'requestedDuringView':any(a<=request['started']<=b for a,b in view_intervals)})
groups={}
for kind,classification in [('coarse','surface'),('coarse','empty-air'),('fine','surface'),('view','surface')]:
    rows=[row for row in phases if row['kind']==kind and row['classification']==classification]
    groups[kind+'/'+classification]={key:stats([row[key] for row in rows if row[key] is not None]) for key in ['readinessMs','frontQueueMs','nativeMs','responseAndTransferMs','consumerDispatchMs','workerMs','restoreMs','warmupMs','uploadMs','publicationMs']}
    groups[kind+'/'+classification]['requestedDuringActiveView']=sum(row['requestedDuringView'] for row in rows)
raw=read('browser-full-r1','native-records.json');cache_peaks={name:max(row['caches'][name]['peak'] for row in raw['records'] if row['status']=='prepared') for name in ['source','validation','topology']}
cpu=json.loads(next(line[5:] for line in (base/'units-r1.log').read_text().splitlines() if line.startswith('UNIT ')))
result={'world':full['hello']['definition']['id'],'definitionKey':full['hello']['definition']['definitionKey'],'full':read('browser-full-r1','score.json'),'input':read('browser-input-r0','score.json'),'inputSeconds':input_run['inputSeconds'],'finalWiring':read('browser-wiring-r0','score.json'),
 'sourceScope':{'fullAndInputSourcesEqual':True,'measuredSourcePreservedAt':str(base/'measured-source-r1'),'changedForFinalDependencyInjection':changed,'addedForFinalDependencyInjection':added,'finalGeometryAlreadyQualified':True,'limit':'Three repeats/input use the preserved measured source. Final packaging has a separate 20-second hardware smoke, not three exact-final-source repeats.'},
 'qualification':{'uniqueIncludingPreflight':len(qualified),'specimens':list(qualified.values()),'legacy143':read('region143-r0','qualification.json')},
 'flightAudits':{root:audit_summary(read(root,'flight-audit.json')) for root in ['browser-full-r1','browser-input-r0']},
 'bufferAudits':{root:read(root,'buffer-audit.json') for root in ['browser-full-r1','browser-input-r0','browser-wiring-r0']},
 'reconstruction':read('reconstruction-r0','reconstruction.json'),
 'scheduling':{'maxNativeActive':active_peak,'maxNativeQueued':queue_peak,'viewPriorityViolations':violations,'nativeJobs':len(raw['records']),'outputBytes':raw['totalOutputBytes'],'cachePeakBytes':cache_peaks,'publications':sum(e['type']=='producer-prepared' for e in server['events']),'retirements':sum(e['type']=='producer-retired' for e in server['events']),'readinessPhases':groups,'phaseLimit':'Front queue includes HTTP/admission; response/transfer includes an injected gate when present; phase groups include setup, ordinary and late observations. Native structural checks are within nativeMs.'},
 'cpu':cpu,'build':'npm run build passed','scope':'Bounded local native control, fixed world and one fine site. Not product acceptance, portable regeneration or complete region-memory accounting.'}
target=Path(sys.argv[1]);assert not target.exists(),'Preserve summary evidence';target.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'output':str(target),'qualified':len(qualified),'changed':changed,'cpu':cpu['state'],'phaseGroups':{name:{'p50Ready':row['readinessMs']['p50'],'p50Native':row['nativeMs']['p50'],'p50Queue':row['frontQueueMs']['p50']} for name,row in groups.items()}}))
