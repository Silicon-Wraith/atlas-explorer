import { createSpatialGrid } from './spatial-grid.js';
import { createPreparedPoseModel, preparedOrientation, preparedForward } from './pose.js';
import { createPreparedRuntime } from './runtime.js';
import { createApplicationPreparationClient } from './application-client.js';
import { createBrowserPreparer } from './browser-preparer.js';
import { createPreparedRenderer } from '../render/webgpu/prepared-regions.js';
import { observedWasmCapacity } from './wasm-memory.js';

const add=(a,b)=>a.map((x,i)=>x+b[i]),mul=(a,s)=>a.map(x=>x*s),norm=a=>{const n=Math.hypot(...a);return n?a.map(x=>x/n):[0,0,0];};
export function createPreparedWorldWorkspace({ shell, workerUrl, loadPhysics, rendererFactory = createPreparedRenderer, preparerFactory = createBrowserPreparer,
  clientFactory = createApplicationPreparationClient, runtimeFactory = createPreparedRuntime, onUnavailable = () => {}, env = {} }) {
  const doc=env.document??document,win=env.window??window,raf=env.requestFrame??(fn=>win.requestAnimationFrame(fn)),caf=env.cancelFrame??(id=>win.cancelAnimationFrame(id));
  const canvas=shell.$('#landscape-canvas'),held=shell.$('#landscape-held'),message=shell.$('#landscape-status'),indicator=shell.$('#landscape-info');
  const keys=new Set(),listeners=[],events=[];let generation=0,current=null,active=false,destroyed=false,cleaning=Promise.resolve(),cleanupError=null,retained=null,metadata=null,phase='idle',frameId=null,dragging=false,windowFocused=true;
  let yaw=0,pitch=0,last=0,lastPrediction=0,resizing=false,scaleSequence=0,pointer=null;
  const now=()=>performance.timeOrigin+performance.now();
  function event(type,data={}){events.push({type,time:now(),...data});if(events.length>50000){events.shift();inspection.dropped++;}}
  function status(text){if(message){message.textContent=text;message.hidden=!text;}}
  function eligible(){const focused=doc.activeElement;return active&&!destroyed&&!resizing&&!doc.hidden&&windowFocused&&focused===canvas&&!doc.querySelector?.('dialog[open]');}
  function listen(target,type,handler,options){target?.addEventListener(type,handler,options);listeners.push(()=>target?.removeEventListener(type,handler,options));}
  function clearInput(){keys.clear();dragging=false;try{if(pointer!=null&&canvas?.hasPointerCapture?.(pointer))canvas.releasePointerCapture(pointer);}catch{}pointer=null; }
  function detach(){for(const remove of listeners.splice(0))remove();clearInput();}
  function check(state){if(state.cancelled||state.generation!==generation||destroyed)throw Object.assign(new Error('Landscape activation superseded'),{name:'AbortError'});}
  function sessionLost(state,reason){
    if(current!==state||state.cancelled||destroyed)return;state.sessionLostReason=reason;clearInput();
    if(!active){state.client.cancelOpening();state.runtime?.suspend().catch(()=>{});return;}
    deactivate();phase='expired';status(reason);event('session-stopped',{runtimeId:state.id,reason});onUnavailable(reason);
  }
  function storePose(state){if(state?.runtime){retained=state.runtime.pose();const f=preparedForward(retained);yaw=Math.atan2(f[0],f[2]);pitch=Math.asin(Math.max(-1,Math.min(1,f[1])));}}
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
  function draw(state){const r=state.runtime.frame(),pose=r.pose;state.renderer.render({position:pose.positionLocalM.map(x=>x/state.poseModel.D),forward:preparedForward(pose),bodyScale:pose.bodyDiameterM/state.poseModel.D,verticalFovDegrees:pose.verticalFovDegrees,active:r.active,view:r.view,home:r.home});}
  async function resize(state){
    if(!state.renderer||state.cancelled)return;const rect=canvas.getBoundingClientRect(),ratio=win.devicePixelRatio??1;let width=Math.max(1,Math.round(rect.width*ratio)),height=Math.max(1,Math.round(rect.height*ratio));
    const factor=Math.min(1,Math.sqrt(2300000/(width*height)));width=Math.max(1,Math.floor(width*factor));height=Math.max(1,Math.floor(height*factor));
    resizing=true;clearInput();try{await state.renderer.resize(width,height);}finally{resizing=false;}
  }
  async function scale(smaller){
    const state=current;if(!eligible()||!state?.runtime||!state.client.check())return false;const mine=++scaleSequence;
    if(state.runtime.scale(smaller)){storePose(state);return true;}
    if(smaller){status('Preparing smaller formations…');await state.runtime.requestFine();if(active&&state===current&&mine===scaleSequence&&state.client.check()){const success=state.runtime.scale(true);storePose(state);if(!success)status('Move into the prepared detail area to change scale.');return success;}}
    else status('Move away from the surface before growing.');return false;
  }
  function orient(y,p){const state=current;if(!active||!state?.runtime||!state.client.check())return;yaw=y;pitch=Math.max(-1.5,Math.min(1.5,p));state.runtime.orient(preparedOrientation(yaw,pitch));storePose(state);}
  function attach(state){
    listen(win,'keydown',e=>{if(e.key==='Escape'){clearInput();return;}if(!eligible())return;const key=e.key.toLowerCase();if(['w','a','s','d','q','e'].includes(key)){keys.add(key);e.preventDefault();}});
    const verify=()=>{clearInput();state.client.revalidate().catch(error=>sessionLost(state,error.message));};
    listen(win,'keyup',e=>keys.delete(e.key.toLowerCase()));listen(win,'blur',()=>{windowFocused=false;clearInput();state.client.pause();});listen(win,'focus',()=>{windowFocused=true;verify();});
    listen(doc,'visibilitychange',()=>{clearInput();if(doc.hidden)state.client.pause();else verify();});
    listen(canvas,'pointerdown',e=>{canvas.focus?.({preventScroll:true});dragging=true;pointer=e.pointerId;canvas.setPointerCapture?.(e.pointerId);});listen(canvas,'pointerup',e=>{dragging=false;pointer=null;if(canvas.hasPointerCapture?.(e.pointerId))canvas.releasePointerCapture(e.pointerId);});
    listen(canvas,'pointermove',e=>{if(dragging&&eligible())orient(yaw+e.movementX*.003,pitch-e.movementY*.003);});listen(canvas,'lostpointercapture',()=>dragging=false);
    listen(canvas,'wheel',e=>{if(!eligible())return;e.preventDefault();scale(e.deltaY<0).catch(error=>status(error.message));},{passive:false});
    listen(shell.$('#landscape-smaller'),'click',()=>{canvas.focus?.();scale(true).catch(error=>status(error.message));});listen(shell.$('#landscape-larger'),'click',()=>{canvas.focus?.();scale(false).catch(error=>status(error.message));});
    listen(win,'resize',()=>resize(state).catch(error=>{status(error.message);deactivate();}));
  }
  async function release(state){
    if(!state)return;return state.release??=(async()=>{
      state.cancelled=true;state.client.cancelOpening();const drain=state.runtime?.suspend();state.preparer?.close();
      const errors=[];for(const operation of [()=>drain,()=>state.renderer?.dispose()])try{await operation();}catch(error){errors.push(error);}
      try{await state.client.close({allowDeferred:!!state.sessionLostReason&&!errors.length});}catch(error){errors.push(error);}
      if(errors.length){cleanupError=errors.map(error=>error.message).join('; ');event('cleanup-error',{message:cleanupError});throw new AggregateError(errors,cleanupError);}
      event('resources-released',{runtimeId:state.id});
    })();
  }
  async function build(state){
    const setup=await state.client.open();check(state);metadata=setup;event('configuration',{world:setup.world,producer:setup.producer});
    const grid=createSpatialGrid(setup.grid),viewGrid=createSpatialGrid(setup.viewGrid);state.poseModel=createPreparedPoseModel({world:setup.world,grid,fineBounds:setup.fineBounds});
    let pose=retained?state.poseModel.validate(retained):state.poseModel.create();
    if(!retained){const f=norm(setup.feature.point.map((x,i)=>x-setup.grid.origin[i]));pose=state.poseModel.create({orientationWxyz:preparedOrientation(Math.atan2(f[0],f[2]),Math.asin(f[1]))});}
    state.renderer=await rendererFactory({canvas,anchor:setup.grid.origin,diameter:setup.grid.diameter,lightDirection:setup.feature.light,onError:reason=>{event('device-error',{reason});if(current===state){status(reason);deactivate();}}});check(state);
    await resize(state);check(state);
    state.preparer=await preparerFactory({renderer:state.renderer,workerUrl,loadPhysics,onEvent:e=>event(e.type,e)});check(state);
    state.runtime=runtimeFactory({runtimeId:state.id,world:setup.world,producerIdentity:setup.producer,grid,viewGrid,fineBounds:setup.fineBounds,poseModel:state.poseModel,produce:state.client.produce,prepare:state.preparer.prepare,onEvent:e=>event(e.type,{runtimeId:state.id,...e})});
    await state.runtime.start(pose);check(state);if(!state.client.check())throw new Error(state.sessionLostReason??'Landscape session requires verification');draw(state);await state.renderer.done();check(state);
    if(!state.client.check())throw new Error(state.sessionLostReason??'Landscape session ended before presentation');
    if(held)held.hidden=true;storePose(state);event('first-presented',{runtimeId:state.id,key:state.runtime.snapshot().key});
  }
  async function activate(){
    if(destroyed||cleanupError)return{outcome:'unavailable',reason:cleanupError??'Landscape workspace was destroyed'};
    if(active)return{outcome:'activated'};
    const mine=++generation;phase='preparing';status('Preparing the mathematical landscape…');await cleaning;
    if(mine!==generation||destroyed)return{outcome:'superseded'};
    const id=env.runtimeId?.()??crypto.randomUUID(),state={id,generation:mine,cancelled:false,client:null};current=state;
    state.client=clientFactory({runtimeId:id,onEvent:e=>event(e.type,{runtimeId:id,...e}),onSessionLost:reason=>sessionLost(state,reason)});event('activation-requested',{runtimeId:id,generation:mine});
    try{
      state.build=build(state);await state.build;check(state);active=true;phase='active';windowFocused=true;attach(state);last=performance.now();lastPrediction=0;frameId=raf(t=>frame(state,t));status('');return{outcome:'activated'};
    }catch(error){await release(state);if(current===state)current=null;if(mine!==generation||error.name==='AbortError')return{outcome:'superseded'};const reason=state.sessionLostReason??error.message;phase='unavailable';status(reason);event(state.sessionLostReason?'session-unavailable':'workspace-error',{message:reason});return{outcome:'unavailable',reason};}
  }
  function deactivate(){
    generation++;active=false;scaleSequence++;detach();if(frameId!=null){caf(frameId);frameId=null;}
    const state=current;if(!state)return;storePose(state);
    if(held&&state.renderer&&phase==='active'){try{held.width=canvas.width;held.height=canvas.height;held.getContext('2d').drawImage(canvas,0,0);held.hidden=false;}catch(error){event('held-image-unavailable',{message:error.message});}}
    state.cancelled=true;event('deactivated',{runtimeId:state.id});state.client.cancelOpening();state.runtime?.suspend().catch(()=>{});state.preparer?.close();phase='suspended';
    cleaning=Promise.resolve(state.build).catch(()=>{}).then(()=>release(state)).then(()=>{if(current===state)current=null;});cleaning.catch(error=>{cleanupError=error.message;status('Landscape cleanup failed: '+error.message);});
  }
  const inspection={dropped:0,get state(){return{active,phase,pose:retained,metadata,pending:current?.runtime?.snapshot().pending??[],runtime:current?.runtime?.snapshot()??null,cleanupError,gpuBytes:current?.renderer?.bytes()??0,capacity:current?.preparer?.capacity()??{mainWasmCapacity:observedWasmCapacity(),workerWasmCapacity:0,workerJobs:0},payload:current?.client?.snapshot()??null,adapter:current?.renderer?.adapterInfo??null};},events:()=>[...events],look:orient,scale,whenReleased:()=>cleaning};
  return Object.freeze({inspection,activate,deactivate,focus(){if(active)canvas.focus?.({preventScroll:true});},destroy(){if(destroyed)return cleaning;deactivate();destroyed=true;return cleaning;}});
}
