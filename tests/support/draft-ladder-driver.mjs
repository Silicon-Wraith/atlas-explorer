// Browser driver, also importable with the in-memory device double. No browser globals
// are touched until createDraftLadderDriver is called by the guarded suite.
import { createWebGPUBackend } from '../../src/space/render/webgpu/backend.js';
import { createSpaceRenderer, navigationContentKey } from '../../src/space/render/renderer.js';
import { createScheduler } from '../../src/shared/scheduler.js';
import { createSpaceRequest } from '../../src/space/render-adapter.js';
import { sceneCodec } from '../../src/space/scene-adapter.js';
import { productPipelineSet } from '../../src/space/render/webgpu/appearance.js';
import { KERNEL_VERSION, mengerBoxData } from '../../src/space/render/webgpu/kernels.js';
import { TRACING_VERSION, RECOVERING_FAMILIES } from '../../src/space/render/webgpu/passes.js';
import { effectiveParameters } from '../../src/space/numerics/parameters.js';
import { buildSpaceBatch } from '../../src/space/render/frame-batch.js';
import { createAdmission, createBatchGroup, createJobPlan, TARGET_LAYOUT_ID } from '../../src/space/render/backend.js';
import { draftExecution, qualifiedDraft } from '../../src/space/render/draft-execution.js';
import { draftSummaryBytes, validateDraftSummary } from '../../src/space/render/draft-summary.js';
import { createDraftRecords } from '../../src/space/render/draft-records.js';

export async function createDraftLadderDriver({ canvas, scene, rung, clock = () => performance.now(), acquire, loadSource, format, onEvent = () => {} }) {
  const config=draftExecution(rung), pipelineSet=productPipelineSet(), versions={kernelVersion:KERNEL_VERSION,tracingVersion:TRACING_VERSION};
  const events=[], active=new Set(); let revision=0, lastValidated=null, displayed=0, destroyed=false;
  const emit=(type,detail={})=>{const event={type,at:clock(),...detail};events.push(event);onEvent(event);};
  const backend=createWebGPUBackend({canvas,clock,acquire,loadSource,format,draftExecution:rung,onPhase:phase=>emit('backend-phase',phase)});
  const receipt=await backend.acquire();await backend.prepare({epoch:receipt.epoch,pipelineSet});
  const scheduler=createScheduler({clock,makeAdmission:details=>{emit('lease',details);return createAdmission(details);},setTimer:setTimeout,clearTimer:clearTimeout});
  scheduler.registerView('ladder');scheduler.setEpoch(receipt.epoch);
  const records=createDraftRecords({clock,onUpdate:update=>emit('confirmation',update)});
  const product=createSpaceRenderer({backend,scheduler,clock,viewId:'ladder-product',versions,pipelineSet,draftExecution:config.lifecycle?rung:'L6a'});
  for(const [name,method] of [['publication','onPublish'],['presenter-completion','onPresent'],['confirmation','onPublicationUpdate'],['provisional','onProvisional'],['restoration','onRestoration']]) product[method](event=>emit(name,event));
  product.onReport(report=>{const{outcomeMasks,...small}=report;emit('report',{report:small});});
  const jobs=new Map();let pumping=false;
  // A renderer sharing this scheduler would steal ladder leases. Product and lower
  // paths are never active together: L6 uses product only; lower settled work drains first.
  const lowScheduler=createScheduler({clock,makeAdmission:details=>{emit('lease',details);return createAdmission(details);},setTimer:setTimeout,clearTimer:clearTimeout});
  lowScheduler.registerView('ladder');lowScheduler.setEpoch(receipt.epoch);
  function pump(){if(pumping)return;pumping=true;try{for(const item of lowScheduler.admit())jobs.get((item.operation.batch??item.operation.descriptor).identity.jobId)?.(item);}finally{pumping=false;}}
  lowScheduler.subscribe(pump);
  const unloss=backend.onLoss(event=>{records.interrupt(event.epoch);lowScheduler.interrupted(event.epoch);emit('loss',event);});
  const generation=()=>({deviceEpoch:backend.currentEpoch(),viewRevision:revision,geometryRevision:revision,appearanceRevision:1});
  const identity=request=>Object.fromEntries(['requestId','jobId','viewId','generation'].map(k=>[k,request[k]]));
  const free=slot=>{for(const h of slot.handles)backend.release(h);slot.handles=[];};
  async function lower(request) {
    const effective=effectiveParameters(request.sceneSnapshot.model.id,request.sceneSnapshot.parameters).effective;
    if(!qualifiedDraft(request,effective,receipt.limits))throw Error('outside preregistered whole-frame envelope');
    const recovery=RECOVERING_FAMILIES.includes(request.sceneSnapshot.model.id),quality=request.quality;
    const targets=await backend.configureTargets({epoch:backend.currentEpoch(),layoutId:TARGET_LAYOUT_ID,internalSize:quality.internalSize,outputSize:{width:request.output.width,height:request.output.height}});
    const slot={handles:Object.values(targets.handles).flat(),request,order:request.generation.viewRevision,display:targets.handles.display};
    const allocate=desc=>{const h=backend.allocate(desc);slot.handles.push(h);return h;};
    const pixels=quality.internalSize.width*quality.internalSize.height;
    const record={request,effective,targets,displayHandle:slot.display,producerToken:request.generation.viewRevision,diagnosticStride:recovery?3:2};
    if(config.summary){record.draftDiagnostics=allocate({name:'ladder-packet',usage:'storage',bytes:pixels*record.diagnosticStride*4});record.draftSummary=allocate({name:'ladder-summary',usage:'storage',bytes:draftSummaryBytes(recovery)});}
    if(request.sceneSnapshot.model.id==='menger'){const data=mengerBoxData(effective.depth);record.mengerBoxes=allocate({name:'ladder-menger',usage:'storage',bytes:data.byteLength,data:new Uint8Array(data.buffer)});}
    const region={x:0,y:0,...quality.internalSize};
    const passes=['trace','normals','shade','accumulate','display',...(config.summary?['reduce']:[])].map(pass=>{
      const entry=pass==='reduce'?'reduce_draft_summary':pass==='display'?(config.summary?'display_summary_band':'display_band'):`${pass}_band`;
      const candidates=pipelineSet.descriptors.filter(p=>p.kind==='compute'&&p.entryPoint===entry);
      const descriptor=candidates.find(p=>p.pipelineId===`${entry}:${request.sceneSnapshot.model.id}`)??candidates[0];
      return buildSpaceBatch({descriptor,record,pass,region,sample:0,quality});
    });
    const batch=createBatchGroup({identity:identity(request),region,sample:passes[0].sample,passes,draft:{mode:config.mode,summary:record.draftSummary??null,producerToken:record.producerToken,recovery,display:slot.display}});
    const ops=[{id:`${request.jobId}/compute`,kind:'batch',batch,dependsOn:[]}];
    if(config.mode==='compute')ops.push({id:`${request.jobId}/present`,kind:'presentation',descriptor:{identity:identity(request),display:slot.display},dependsOn:[ops[0].id]});
    let frame=null, summary=null;
    async function perform(op,admission){
      emit('submission',{identity:identity(request),kind:op.kind});
      const ticket=op.kind==='batch'?backend.submitBatch(op.batch,{admission}):backend.present(op.descriptor,{admission});
      emit(config.tickets?'ticket':'benchmark-fence',{identity:identity(request)});
      if((op.kind==='presentation'||config.mode!=='compute')&&ticket.presentationSubmittedAt!==null){
        displayed=slot.order;emit(config.mode==='provisional'?'provisional':'presentation',{identity:identity(request)});
        if(config.summary&&op.kind==='batch') {frame=records.begin({identity:identity(request),sampleIndex:0,presentationSubmittedAt:clock(),eligible:true,camera:request.sceneSnapshot.camera,quality});records.displayed(frame.frameId);emit('pending',frame);}
      }
      const completion=await ticket.done;
      emit('completion',{identity:identity(request),completion});
      if(completion.outcome!=='completed')throw Error(completion.reason??completion.outcome);
      if(op.kind==='presentation'||config.mode!=='compute')emit('presenter-completion',{identity:identity(request),requestedAt:request.createdAt,queueCompletedAt:completion.queueCompletedAt});
      if(ticket.result){const mapped=await ticket.result;emit('mapping',{identity:identity(request),bytes:mapped.data.byteLength});
        if(JSON.stringify(mapped.identity)!==JSON.stringify(identity(request)))throw Error('summary identity mismatch');
        summary=validateDraftSummary(mapped.data,{pixels,recovery,producerToken:record.producerToken});emit('validation',{identity:identity(request),summary});
        if(frame)records.confirm(frame.frameId,frame.identity,{rayTermination:summary.counts.rayTermination,completion:{outcome:'completed',queueCompletedAt:completion.queueCompletedAt}});
      }
      return completion;
    }
    try{
      if(!config.scheduler)for(const op of ops){let admission;if(config.leases){emit('lease',{jobId:request.jobId});admission=createAdmission({epoch:backend.currentEpoch(),jobId:request.jobId});}await perform(op,admission);}
      else {
        const plan=createJobPlan({request,operations:ops});
        jobs.set(request.jobId,({operation,admission})=>{perform(operation,admission).then(done=>lowScheduler.completed(admission,{epoch:request.generation.deviceEpoch,elapsedMs:done.timing.elapsedMs}),error=>lowScheduler.failed(admission,error)).finally(pump);});
        const job=lowScheduler.request('ladder',{jobId:request.jobId,requestId:request.requestId,priority:'navigation',kind:'draft',plan});pump();
        const result=await job.done;jobs.delete(request.jobId);if(result.outcome!=='completed')throw Error(result.reason??result.outcome);
      }
      emit(config.summary?'confirmed-completion':'benchmark-completion',{identity:identity(request)});
      if(config.mode==='provisional'&&slot.order===displayed){if(lastValidated)free(lastValidated);lastValidated=slot;}
      return {outcome:'completed',summary};
    }catch(error){if(frame)records.reject(frame.frameId,frame.identity,String(error));emit('failure',{identity:identity(request),error:String(error)});
      if(config.mode==='provisional'&&lastValidated&&displayed===slot.order&&backend.currentEpoch()){
        const op={id:`${request.jobId}/restore`,kind:'presentation',dependsOn:[],descriptor:{identity:identity(request),display:lastValidated.display}};
        const job=lowScheduler.requestAuxiliary('ladder',{jobId:request.jobId,priority:'inspection',operation:op});
        jobs.set(request.jobId,({operation,admission})=>{if(displayed!==slot.order){lowScheduler.discardAuxiliary(admission,{reason:'newer display'});return;}perform(operation,admission).then(done=>{emit('restoration',{identity:identity(request)});lowScheduler.completed(admission,{epoch:request.generation.deviceEpoch,elapsedMs:done.timing.elapsedMs});},error=>lowScheduler.discardAuxiliary(admission,{reason:String(error)})).finally(pump);});pump();await job.done;jobs.delete(request.jobId);
      }throw error;
    }finally{if(lastValidated!==slot)free(slot);}
  }
  async function submit(nextScene,{settled=false,requestedAt=clock(),phase='orbit'}={}){
    if(destroyed)throw Error('driver destroyed');if(active.size>=2)throw Error('two live frame slots exhausted');
    revision++;const request=createSpaceRequest({scene:sceneCodec.validate(nextScene??scene),purpose:'interactive',width:1280,height:720,profile:settled?'settled':'draft',generation:generation(),viewId:config.lifecycle||settled?'ladder-product':'ladder',versions});
    const at=requestedAt;emit('request',{identity:identity(request),requestedAt:at,settled,phase});
    let work;
    if(config.lifecycle||settled)work=product.render(request,{currentGeneration:generation,currentNavigation:()=>1,currentNavigationContent:()=>navigationContentKey(request.sceneSnapshot,request.output),requestedAt:at}).done;
    else work=lower(request);
    active.add(work);try{return await work;}finally{active.delete(work);}
  }
  return {submit,events,backend,receipt,config,async drain(){await Promise.allSettled([...active]);},async destroy(){await Promise.allSettled([...active]);destroyed=true;unloss();if(lastValidated)free(lastValidated);product.destroy();backend.destroy();}};
}
