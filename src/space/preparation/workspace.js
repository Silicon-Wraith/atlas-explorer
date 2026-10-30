import { createSpatialGrid } from './spatial-grid.js';
import { createPreparedPoseModel, preparedOrientation, preparedForward, preparedUp } from './pose.js';
import { createPreparedRuntime } from './runtime.js';
import { createApplicationPreparationClient } from './application-client.js';
import { createBrowserPreparer } from './browser-preparer.js';
import { createPreparedRenderer } from '../render/webgpu/prepared-regions.js';
import { observedWasmCapacity } from './wasm-memory.js';
import { createPreparedScene, sceneCodec, encodeSceneFile, decodeSceneFile, admitPreparedScene, equalPreparedCameras } from './scene-adapter.js';
import { createPreparedSceneHistory } from './scene-history.js';

const add=(a,b)=>a.map((x,i)=>x+b[i]),mul=(a,s)=>a.map(x=>x*s),norm=a=>{const n=Math.hypot(...a);return n?a.map(x=>x/n):[0,0,0];};
export function createPreparedWorldWorkspace({ shell, workerUrl, loadPhysics, rendererFactory = createPreparedRenderer, preparerFactory = createBrowserPreparer,
  clientFactory = createApplicationPreparationClient, runtimeFactory = createPreparedRuntime, onUnavailable = () => {}, onRestoreRequested, env = {} }) {
  const doc=env.document??document,win=env.window??window,raf=env.requestFrame??(fn=>win.requestAnimationFrame(fn)),caf=env.cancelFrame??(id=>win.cancelAnimationFrame(id));
  const canvas=shell.$('#landscape-canvas'),held=shell.$('#landscape-held'),message=shell.$('#landscape-status'),indicator=shell.$('#landscape-info');
  const keys=new Set(),listeners=[],events=[];let generation=0,current=null,active=false,destroyed=false,cleaning=Promise.resolve(),cleanupError=null,retained=null,metadata=null,phase='idle',frameId=null,dragging=false,windowFocused=true;
  let yaw=0,pitch=0,last=0,lastPrediction=0,resizing=false,scaleSequence=0,pointer=null;
  let navigationDirty=false,quietTimer=null,fileSequence=0,pendingRead=null;
  const permanent=[],setTimer=env.setTimer??setTimeout,clearTimer=env.clearTimer??clearTimeout;
  const scenes=createPreparedSceneHistory({onChange:syncSceneControls});
  const now=()=>performance.timeOrigin+performance.now();
  function event(type,data={}){events.push({type,time:now(),...data});if(events.length>50000){events.shift();inspection.dropped++;}}
  function status(text){if(message){message.textContent=text;message.hidden=!text;}}
  function eligible(){const focused=doc.activeElement;return active&&!destroyed&&!resizing&&!doc.hidden&&windowFocused&&focused===canvas&&!doc.querySelector?.('dialog[open]');}
  function listen(target,type,handler,options){target?.addEventListener(type,handler,options);listeners.push(()=>target?.removeEventListener(type,handler,options));}
  function clearInput(){settleNavigation();keys.clear();dragging=false;try{if(pointer!=null&&canvas?.hasPointerCapture?.(pointer))canvas.releasePointerCapture(pointer);}catch{}pointer=null; }
  function detach(){for(const remove of listeners.splice(0))remove();clearInput();}
  function check(state){if(state.cancelled||state.generation!==generation||state.sceneRequest!==scenes.request||destroyed)throw Object.assign(new Error('Landscape activation superseded'),{name:'AbortError'});}
  function sessionLost(state,reason){
    if(current!==state||state.cancelled||destroyed)return;state.sessionLostReason=reason;clearInput();
    if(!active){state.client.cancelOpening();state.runtime?.suspend().catch(()=>{});return;}
    deactivate();phase='expired';status(reason);event('session-stopped',{runtimeId:state.id,reason});onUnavailable(reason);
  }
  function storePose(state){
    if(state?.runtime&&state.presented&&state.sceneRequest===scenes.request){
      retained=state.runtime.pose();const f=preparedForward(retained);yaw=Math.atan2(f[0],f[2]);pitch=Math.asin(Math.max(-1,Math.min(1,f[1])));
      if(!navigationDirty&&!equalPreparedCameras(retained,scenes.scene().camera)){navigationDirty=true;syncSceneControls();}
    }
  }
  function settleNavigation(){
    if(quietTimer!=null)clearTimer(quietTimer);quietTimer=null;
    if(!navigationDirty)return;
    if(navigationDirty&&current?.presented&&current.sceneRequest===scenes.request)scenes.acceptPose(current.runtime.pose(),current.sceneRequest);
    navigationDirty=false;syncSceneControls();
  }
  function quietNavigation(){
    if(quietTimer!=null)clearTimer(quietTimer);
    quietTimer=setTimer(()=>{quietTimer=null;if(!keys.size&&!dragging)settleNavigation();},200);
  }
  function syncSceneControls(){
    const state=scenes.snapshot(),h=state.history;
    for(const name of ['back','forward','undo','redo']){const button=shell.$('#landscape-'+name);if(button)button.disabled=!(h?.['can'+name[0].toUpperCase()+name.slice(1)]||(name==='back'&&navigationDirty));}
    const save=shell.$('#landscape-save-scene');if(save){save.disabled=!state.scene;save.textContent=active?'Save Landscape scene':'Save requested Landscape scene';}
  }
  function fileStatus(value){const element=shell.$('#landscape-file-status');if(element)element.textContent=value;}
  function invalidateReads(){fileSequence++;pendingRead?.cancel();pendingRead=null;}
  async function requestRestoration(request){
    const wasRunning=active||!!current&&!current.cancelled;deactivate({restoring:true});
    fileStatus('Preparing the requested Landscape scene…');event('restore-requested',{request});
    try{
      if(onRestoreRequested)await onRestoreRequested();else if(wasRunning)await activate();
      if(request!==scenes.request)return{ok:false,superseded:true};
      const ok=active&&current?.presented&&current.sceneRequest===request;
      if(ok){fileStatus('Landscape scene opened.');event('restore-presented',{request});}
      else fileStatus('Requested Landscape scene retained. '+(message?.textContent||'Retry Landscape when preparation is available.'));
      return{ok,pending:!ok,error:ok?undefined:message?.textContent};
    }catch(error){if(request===scenes.request)fileStatus('Requested Landscape scene retained: '+error.message);return{ok:false,pending:true,error:error.message};}
  }
  async function openSceneText(value,{readIdentity}={}){
    if(destroyed)return{ok:false,error:'Landscape was destroyed'};
    if(readIdentity!=null&&readIdentity!==fileSequence)return{ok:false,superseded:true};
    invalidateReads();let next;try{next=decodeSceneFile(value);}catch(error){fileStatus('This Landscape scene could not be opened: '+error.message);return{ok:false,error:error.message};}
    settleNavigation();const request=scenes.restore(next);return requestRestoration(request);
  }
  async function historyStep(action){
    invalidateReads();clearInput();const request=scenes.step(action);return request==null?{ok:false,unchanged:true}:requestRestoration(request);
  }
  function saveScene(){
    settleNavigation();const scene=scenes.scene();if(!scene){fileStatus('Enter Landscape or open a scene before saving.');return null;}
    const value=encodeSceneFile(scene),blob=new Blob([value],{type:'application/json'});
    if(env.download)env.download(blob,'atlas-landscape-scene.json');
    else{const url=URL.createObjectURL(blob),link=doc.createElement('a');link.href=url;link.download='atlas-landscape-scene.json';link.click();setTimer(()=>URL.revokeObjectURL(url),30000);}
    fileStatus(active?'Landscape scene saved.':'Requested Landscape scene saved; it is awaiting preparation.');return value;
  }
  async function openSceneFile(file){
    if(!file)return;invalidateReads();const identity=fileSequence;
    if(file.size>sceneCodec.maxSceneBytes){fileStatus('This Landscape scene file is too large.');return{ok:false};}
    let timer;
    try{
      const cancelled=new Promise((_,reject)=>{pendingRead={cancel:()=>reject(Object.assign(new Error('Scene read superseded'),{name:'AbortError'}))};});
      const textValue=await Promise.race([Promise.resolve().then(()=>file.text()),cancelled,new Promise((_,reject)=>{timer=setTimer(()=>reject(new Error('Reading this scene file timed out.')),env.fileReadMs??5000);})]);
      if(identity!==fileSequence||destroyed)return{ok:false,superseded:true};
      pendingRead=null;return openSceneText(textValue,{readIdentity:identity});
    }catch(error){if(error.name!=='AbortError'&&identity===fileSequence)fileStatus('This Landscape scene could not be read: '+error.message);return{ok:false,superseded:error.name==='AbortError',error:error.message};}
    finally{clearTimer(timer);if(identity===fileSequence)pendingRead=null;}
  }
  function bindControl(selector,type,callback){const target=shell.$(selector);target?.addEventListener?.(type,callback);permanent.push(()=>target?.removeEventListener?.(type,callback));}
  bindControl('#landscape-save-scene','click',()=>saveScene());
  bindControl('#landscape-open-scene','change',e=>{const input=e.target;openSceneFile(input.files?.[0]).finally(()=>{input.value='';});});
  for(const action of ['back','forward','undo','redo'])bindControl('#landscape-'+action,'click',()=>{historyStep(action);});
  syncSceneControls();
  function frame(state,time){
    if(!active||current!==state||state.cancelled)return;const interval=time-last,dt=Math.min(.05,Math.max(0,interval/1000));last=time;
    try{
      const permitted=state.client.check();if(!active||state.cancelled)return;
      let velocity=[0,0,0],waiting=false;
      if(permitted&&eligible()){
        const f=preparedForward(state.runtime.pose()),right=norm([f[2],0,-f[0]]);
        for(const[key,axis,sign]of[['w',f,1],['s',f,-1],['d',right,1],['a',right,-1],['e',[0,1,0],1],['q',[0,1,0],-1]])if(keys.has(key))velocity=add(velocity,mul(axis,sign));
        if(Math.hypot(...velocity)){velocity=mul(norm(velocity),.5*state.runtime.pose().bodyDiameterM);if(state.client.check())waiting=state.runtime.move(mul(velocity,dt)).waiting;}
      }else clearInput();
      if(permitted&&state.client.check()&&time-lastPrediction>=100){lastPrediction=time;state.runtime.predict(velocity);}
      if(!active||state.cancelled)return;storePose(state);if(permitted&&!resizing)draw(state);
      const snapshot=state.runtime.snapshot();if(snapshot.error)throw new Error(snapshot.error);
      status(!permitted?(state.client.snapshot().session?.message||'Checking the landscape session…'):waiting?'Preparing nearby terrain…':snapshot.pending.length?'Preparing the landscape ahead…':'');
      if(indicator)indicator.textContent=`Landscape · scale ${retained.bodyDiameterM/state.poseModel.D} · WASD move · Q/E down/up · drag to look · wheel to change scale`;
      event('frame',{ms:interval,pending:snapshot.pending.length>0,waiting,rendered:permitted&&!resizing,sessionVerified:permitted,position:state.poseModel.positionM(retained),bodyD:retained.bodyDiameterM,key:snapshot.key,renderRevision:snapshot.key,collisionRevision:snapshot.key,gpuBytes:state.renderer.bytes(),ownedInteraction:snapshot.ownedInteraction,ownedView:snapshot.ownedView});
    }catch(error){phase='unavailable';status(error.message);event('workspace-error',{message:error.message});deactivate();return;}
    frameId=raf(t=>frame(state,t));
  }
  function draw(state){const r=state.runtime.frame(),pose=r.pose;state.renderer.render({position:pose.positionLocalM.map(x=>x/state.poseModel.D),forward:preparedForward(pose),up:preparedUp(pose),bodyScale:pose.bodyDiameterM/state.poseModel.D,verticalFovDegrees:pose.verticalFovDegrees,active:r.active,view:r.view,home:r.home});}
  async function resize(state){
    if(!state.renderer||state.cancelled)return;const rect=canvas.getBoundingClientRect(),ratio=win.devicePixelRatio??1;let width=Math.max(1,Math.round(rect.width*ratio)),height=Math.max(1,Math.round(rect.height*ratio));
    const factor=Math.min(1,Math.sqrt(2300000/(width*height)));width=Math.max(1,Math.floor(width*factor));height=Math.max(1,Math.floor(height*factor));
    resizing=true;clearInput();try{await state.renderer.resize(width,height);}finally{resizing=false;}
  }
  async function scale(smaller,{discrete=false}={}){
    const state=current;if(!eligible()||!state?.runtime||!state.client.check())return false;const mine=++scaleSequence;
    if(state.runtime.scale(smaller)){storePose(state);if(discrete)settleNavigation();else quietNavigation();return true;}
    if(smaller){status('Preparing smaller formations…');await state.runtime.requestFine();if(active&&state===current&&mine===scaleSequence&&state.client.check()){const success=state.runtime.scale(true);storePose(state);if(discrete)settleNavigation();else quietNavigation();if(!success)status('Move into the prepared detail area to change scale.');return success;}}
    else status('Move away from the surface before growing.');return false;
  }
  function orient(y,p){const state=current;if(!active||!state?.runtime||!state.client.check())return;yaw=y;pitch=Math.max(-1.5,Math.min(1.5,p));state.runtime.orient(preparedOrientation(yaw,pitch));storePose(state);if(!keys.size&&!dragging)quietNavigation();}
  function attach(state){
    listen(win,'keydown',e=>{if(e.key==='Escape'){clearInput();return;}if(!eligible())return;const key=e.key.toLowerCase();const action=e.altKey&&key==='arrowleft'?'back':e.altKey&&key==='arrowright'?'forward':(e.ctrlKey||e.metaKey)&&key==='z'?(e.shiftKey?'redo':'undo'):null;if(action){e.preventDefault();historyStep(action);return;}if(e.altKey||e.ctrlKey||e.metaKey)return;if(['w','a','s','d','q','e'].includes(key)){keys.add(key);e.preventDefault();}});
    const verify=()=>{clearInput();state.client.revalidate().catch(error=>sessionLost(state,error.message));};
    listen(win,'keyup',e=>{keys.delete(e.key.toLowerCase());if(!keys.size&&!dragging)settleNavigation();});listen(win,'blur',()=>{windowFocused=false;clearInput();state.client.pause();});listen(win,'focus',()=>{windowFocused=true;verify();});
    listen(doc,'visibilitychange',()=>{clearInput();if(doc.hidden)state.client.pause();else verify();});
    listen(canvas,'pointerdown',e=>{canvas.focus?.({preventScroll:true});dragging=true;pointer=e.pointerId;canvas.setPointerCapture?.(e.pointerId);});listen(canvas,'pointerup',e=>{dragging=false;pointer=null;if(canvas.hasPointerCapture?.(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(!keys.size)settleNavigation();});
    listen(canvas,'pointermove',e=>{if(dragging&&eligible())orient(yaw+e.movementX*.003,pitch-e.movementY*.003);});listen(canvas,'lostpointercapture',()=>{dragging=false;if(!keys.size)settleNavigation();});
    listen(canvas,'wheel',e=>{if(!eligible())return;e.preventDefault();scale(e.deltaY<0).catch(error=>status(error.message));},{passive:false});
    listen(shell.$('#landscape-smaller'),'click',()=>{clearInput();canvas.focus?.();scale(true,{discrete:true}).catch(error=>status(error.message));});listen(shell.$('#landscape-larger'),'click',()=>{clearInput();canvas.focus?.();scale(false,{discrete:true}).catch(error=>status(error.message));});
    listen(win,'resize',()=>resize(state).catch(error=>{status(error.message);deactivate();}));
  }
  async function release(state){
    if(!state)return;return state.release??=(async()=>{
      state.cancelled=true;state.client.cancelOpening();const drain=state.runtime?.suspend();state.preparer?.close();
      const errors=[];for(const operation of [()=>drain,()=>state.renderer?.dispose()])try{await operation();}catch(error){errors.push(error);}
      const remoteConfirmed=(state.client.snapshot().remoteRetirementFailures??0)===0;
      try{await state.client.close({allowDeferred:!!state.sessionLostReason&&!errors.length&&remoteConfirmed});}catch(error){errors.push(error);}
      if(errors.length){cleanupError=errors.map(error=>error.message).join('; ');event('cleanup-error',{message:cleanupError});throw new AggregateError(errors,cleanupError);}
      event('resources-released',{runtimeId:state.id});
    })();
  }
  async function build(state){
    const setup=await state.client.open();check(state);metadata=setup;event('configuration',{world:setup.world,producer:setup.producer});
    const grid=createSpatialGrid(setup.grid),viewGrid=createSpatialGrid(setup.viewGrid);state.poseModel=createPreparedPoseModel({world:setup.world,grid,fineBounds:setup.fineBounds});
    const f=norm(setup.feature.point.map((x,i)=>x-setup.grid.origin[i]));
    const initial=state.poseModel.create({orientationWxyz:preparedOrientation(Math.atan2(f[0],f[2]),Math.asin(f[1]))});
    scenes.seed(createPreparedScene({world:setup.world,pose:initial,lightDirection:setup.feature.light}));
    const pose=admitPreparedScene(scenes.scene(),setup,state.poseModel);
    state.renderer=await rendererFactory({canvas,anchor:setup.grid.origin,diameter:setup.grid.diameter,lightDirection:setup.feature.light,onError:reason=>{event('device-error',{reason});if(current===state){status(reason);deactivate();}}});check(state);
    await resize(state);check(state);
    state.preparer=await preparerFactory({renderer:state.renderer,workerUrl,loadPhysics,onEvent:e=>event(e.type,e)});check(state);
    state.runtime=runtimeFactory({runtimeId:state.id,world:setup.world,producerIdentity:setup.producer,grid,viewGrid,fineBounds:setup.fineBounds,poseModel:state.poseModel,produce:state.client.produce,prepare:state.preparer.prepare,onEvent:e=>event(e.type,{runtimeId:state.id,...e})});
    await state.runtime.start(pose);check(state);if(!state.client.check())throw new Error(state.sessionLostReason??'Landscape session requires verification');draw(state);await state.renderer.done();check(state);
    if(!state.client.check())throw new Error(state.sessionLostReason??'Landscape session ended before presentation');
    if(held)held.hidden=true;state.presented=true;storePose(state);event('first-presented',{runtimeId:state.id,key:state.runtime.snapshot().key});
  }
  async function activate(){
    if(destroyed||cleanupError)return{outcome:'unavailable',reason:cleanupError??'Landscape workspace was destroyed'};
    if(active&&current?.sceneRequest===scenes.request)return{outcome:'activated'};
    const mine=++generation;phase='preparing';status('Preparing the mathematical landscape…');await cleaning;
    if(mine!==generation||destroyed)return{outcome:'superseded'};
    const id=env.runtimeId?.()??crypto.randomUUID(),state={id,generation:mine,sceneRequest:scenes.request,cancelled:false,client:null,presented:false};current=state;
    state.client=clientFactory({runtimeId:id,onEvent:e=>event(e.type,{runtimeId:id,...e}),onSessionLost:reason=>sessionLost(state,reason)});event('activation-requested',{runtimeId:id,generation:mine});
    try{
      state.build=build(state);await state.build;check(state);active=true;phase='active';windowFocused=true;attach(state);last=performance.now();lastPrediction=0;frameId=raf(t=>frame(state,t));status('');syncSceneControls();return{outcome:'activated'};
    }catch(error){await release(state);if(current===state)current=null;if(mine!==generation||error.name==='AbortError')return{outcome:'superseded'};const reason=state.sessionLostReason??error.message;phase='unavailable';status(reason);event(state.sessionLostReason?'session-unavailable':scenes.request?'restore-unavailable':'workspace-error',{message:reason});return{outcome:'unavailable',reason};}
  }
  function deactivate({restoring=false}={}){
    if(!restoring)invalidateReads();generation++;active=false;scaleSequence++;detach();if(frameId!=null){caf(frameId);frameId=null;}
    const state=current;if(!state||state.cancelled)return;storePose(state);
    if(held&&state.renderer&&phase==='active'){try{held.width=canvas.width;held.height=canvas.height;held.getContext('2d').drawImage(canvas,0,0);held.hidden=false;}catch(error){event('held-image-unavailable',{message:error.message});}}
    state.cancelled=true;event('deactivated',{runtimeId:state.id});state.client.cancelOpening();state.runtime?.suspend().catch(()=>{});state.preparer?.close();phase='suspended';syncSceneControls();
    cleaning=Promise.resolve(state.build).catch(()=>{}).then(()=>release(state)).then(()=>{if(current===state)current=null;});cleaning.catch(error=>{cleanupError=error.message;status('Landscape cleanup failed: '+error.message);});
  }
  const inspection={dropped:0,get sceneHash(){const scene=scenes.scene();return scene?sceneCodec.fingerprint(scene).sceneHash:null;},get history(){return scenes.snapshot().history;},get state(){return{active,phase,pose:retained,publishedPose:retained,requestedScene:scenes.scene(),sceneRequest:scenes.request,navigationGesture:navigationDirty,metadata,pending:current?.runtime?.snapshot().pending??[],runtime:current?.runtime?.snapshot()??null,cleanupError,gpuBytes:current?.renderer?.bytes()??0,capacity:current?.preparer?.capacity()??{mainWasmCapacity:observedWasmCapacity(),workerWasmCapacity:0,workerJobs:0},payload:current?.client?.snapshot()??null,adapter:current?.renderer?.adapterInfo??null};},events:()=>[...events],look:orient,scale,saveScene,openSceneText,openSceneFile,back:()=>historyStep('back'),forward:()=>historyStep('forward'),undo:()=>historyStep('undo'),redo:()=>historyStep('redo'),whenReleased:()=>cleaning};
  return Object.freeze({inspection,activate,deactivate,focus(){if(active)canvas.focus?.({preventScroll:true});},destroy(){if(destroyed)return cleaning;deactivate();destroyed=true;for(const remove of permanent.splice(0))remove();return cleaning;}});
}
