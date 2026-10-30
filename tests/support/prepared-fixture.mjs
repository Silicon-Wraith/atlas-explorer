// Synthetic contract resources for guarded CPU tests; no native/browser imports.
import { createWorldRecord, worldReference, createPreparedArtifact, createPreparationResult, representationKey } from '../../src/space/preparation/contract.js';
import { createResourceLease } from '../../src/space/preparation/lifecycle.js';
import { createSpatialGrid } from '../../src/space/preparation/spatial-grid.js';
import { createPreparedPoseModel } from '../../src/space/preparation/pose.js';

export const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
export function preparedFixture({ gate, releaseGate, classification = 'empty-air' } = {}) {
  const world = createWorldRecord({id:'synthetic-runtime-world',generator:{id:'test',version:'1'},parameters:{},assets:[{role:'source',sha256:'0'.repeat(64)}],lineage:[{id:'root',parent:null}]});
  const grid=createSpatialGrid({origin:[0,0,0],axes:[[1,0,0],[0,1,0],[0,0,1]],diameter:1}),viewGrid=createSpatialGrid({...grid.config,diameter:4});
  const fineBounds={min:[-.5,-.5,-.5],max:[.5,.5,.5]},poseModel=createPreparedPoseModel({world,grid,fineBounds});
  const producerIdentity={instanceId:'test-producer',epoch:0},events=[],released=[],requests=[],preparing=deferred();
  const produce=async q=>{
    requests.push(q);const unit=q.requirements.bodyDiameterM??4,surface=classification==='surface';
    const artifact=createPreparedArtifact({schema:'atlas.preparation.artifact',schemaVersion:1,world:worldReference(world),bounds:q.bounds,
      transform:{originM:q.bounds.min.map((x,i)=>(x+q.bounds.max[i])/2),metresPerUnit:unit},intent:q.intent,classification,
      classificationBasis:{kind:'constructed-approximation',method:'synthetic-test',evidenceId:'test',volumeM3:surface?q.bounds.min.reduce((v,x,i)=>v*(q.bounds.max[i]-x),1)/2:0},
      qualification:{kind:'empirical',toleranceM:.01*unit,referenceSamples:0,meshSamples:0,limits:['Synthetic CPU fixture'],evidenceId:'test',denseValidation:false},
      representation:{builder:{id:'test',version:'1',sourceDigests:[{role:'test',sha256:'0'.repeat(64)}]},sampling:{cells:256,stepM:unit/256,tileWidthM:unit,rtinToleranceM:.001*unit,coordinateType:'float32-local-metres-per-unit'},dependencies:[],features:['root']},
      buffers:['vertices','surface-indices',...(q.intent==='interaction'?['solid-indices']:[])].map(role=>({role,byteLength:surface?12:0,sha256:'0'.repeat(64)}))});
    return {result:createPreparationResult({schema:'atlas.preparation.result',schemaVersion:1,identity:q.identity,producer:q.producer,status:'prepared',reason:null,artifact}),payload:createResourceLease({owner:'test-payload',bytes:0},{},()=>released.push('payload'))};
  };
  const prepare=async artifact=>{
    preparing.resolve();if(gate)await gate.promise;const key=representationKey(artifact);
    const value={artifact,key,castQueries:0,surface:classification==='surface'?{projectPoint:p=>({point:{...p,y:p.y-1}}),castShape:()=>null}:null,collider:classification==='surface'?{containsPoint:()=>false}:null,shape:classification==='surface'?{}:null};
    return {renderRevision:key,collisionRevision:artifact.intent==='view'?null:key,collisionKind:artifact.intent==='view'?null:artifact.classification,
      lease:createResourceLease({owner:'test-consumer',bytes:0},value,async()=>{if(releaseGate)await releaseGate.promise;released.push('consumer');})};
  };
  return {world,grid,viewGrid,fineBounds,poseModel,producerIdentity,produce,prepare,events,released,requests,preparing,config:{runtimeId:'test-runtime',world,grid,viewGrid,fineBounds,poseModel,producerIdentity,produce,prepare,onEvent:e=>events.push(e)}};
}
