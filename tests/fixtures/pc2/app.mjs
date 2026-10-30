import { createSpatialGrid } from '/src/space/preparation/spatial-grid.js';
import { createPreparationSession } from '/src/space/preparation/lifecycle.js';
import { worldReference } from '/src/space/preparation/contract.js';
import { createBrowserProducer } from '/src/space/preparation/browser-producer.js';
import { createBrowserPreparer } from '/src/space/preparation/browser-preparer.js';
import { createPreparedRenderer } from '/src/space/render/webgpu/prepared-regions.js';
import { regionClear, regionCovers, sweepRegion } from '/src/space/preparation/region-navigation.js';
import { predictRegionAddresses } from '/src/space/preparation/prediction.js';

const add=(a,b)=>a.map((x,i)=>x+b[i]), sub=(a,b)=>a.map((x,i)=>x-b[i]), mul=(a,s)=>a.map(x=>x*s), length=a=>Math.hypot(...a), norm=a=>mul(a,1/length(a));
const epoch=()=>performance.timeOrigin+performance.now(), delay=ms=>new Promise(r=>setTimeout(r,ms));
const errors=[], allEvents=[], residents=new Map(), pending=new Map(), retiring=new Map(), retiringInteraction=new Set(), keys=new Set();
let renderer, preparer, producer, session, fixture, grid, viewGrid, D, O, active, visual, bodyD, position, record, auto=false, running=false, disposed=false, resetting=false;
let phase='idle', goal=null, legs=[], leg=0, reached=[], cycle=0, clock=0, last=performance.now(), lastPrediction=0, horizon=2, wanted=new Set(), velocity=[0,0,0], raf;
let yaw=0,pitch=0,dragging=false,hold=false,holdBeforeFine=false,contacts=0,handoffs=0,waitMs=0,retirements=0;
const demo=window.demo={ready:false,errors};
function event(type,data={}) { const value={type,time:epoch(),...data}; allEvents.push(value); record?.events.push(value); }
function fail(error) { const message=String(error?.stack??error); if(!errors.includes(message))errors.push(message); running=false;auto=false;event('error',{message});document.querySelector('#status').textContent=message; }
const forward=()=>[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)];
function setLook(y,p){yaw=y;pitch=Math.max(-1.5,Math.min(1.5,p));}
function lookAt(point){const v=norm(sub(point,position));setLook(Math.atan2(v[0],v[2]),Math.asin(v[1]));}
function changePhase(next,point=null){phase=next;goal=point;event('phase',{phase,position:[...position]});}
const interactionCount=()=>[...residents.values()].filter(r=>r.kind!=='view').length+[...pending.values()].filter(p=>p.kind!=='view').length+retiringInteraction.size;
function protectedKeys(){return new Set([active?.addressKey,...(bodyD===D/4?['0,0,0','fine']:['entry','fineWait'].includes(phase)?['0,0,0']:[]),...wanted]);}
async function retire(region){
 if(!region||retiring.has(region.addressKey))return retiring.get(region.addressKey);
 if(region===active)throw Error('Attempted active-region retirement');
 if(residents.get(region.addressKey)===region)residents.delete(region.addressKey);if(visual===region)visual=null;
 if(region.kind!=='view')retiringInteraction.add(region);
 const task=region.ticket.retire().then(()=>{retirements++;event('retired',{addressKey:region.addressKey,key:region.key});}).finally(()=>{retiringInteraction.delete(region);if(retiring.get(region.addressKey)===task)retiring.delete(region.addressKey);});
 retiring.set(region.addressKey,task);return task;
}
function makeRoom(){
 if(interactionCount()<8)return true;const protect=protectedKeys();
 const evict=[...residents.values()].filter(r=>r.kind!=='view'&&!protect.has(r.addressKey)).sort((a,b)=>a.used-b.used)[0];
 if(!evict)return false;retire(evict).catch(fail);return interactionCount()<8;
}
function request(kind,address=[0,0,0]){
 const key=kind==='fine'?'fine':(kind==='view'?'v:':'')+(kind==='view'?viewGrid:grid).key(address);
 if(residents.has(key))return Promise.resolve(residents.get(key));if(pending.has(key))return pending.get(key).promise;if(retiring.has(key))return Promise.resolve(null);
 if(pending.size>=3||kind!=='view'&&!makeRoom())return Promise.resolve(null);
 const started=epoch(), bounds=kind==='fine'?fixture.fineBounds:(kind==='view'?viewGrid:grid).bounds(address), unit=kind==='fine'?D/4:kind==='view'?4*D:D;
 let prepared;
 const ticket=session.start({world:worldReference(fixture.world),bounds,intent:kind==='view'?'view':'interaction',requirements:{maxErrorM:.01*unit,bodyDiameterM:kind==='view'?null:unit}},
  {produce:producer.produce,prepare:async(artifact,payload,signal)=>{const receipt=await preparer.prepare(artifact,payload,signal);prepared=receipt.lease.value;return receipt;}});
 event('request',{requestId:ticket.request.identity.requestId,kind,address,addressKey:key,started});
 const item={kind,ticket,promise:null};pending.set(key,item);
 item.promise=ticket.done.then(async result=>{
  if(pending.get(key)===item)pending.delete(key);
  if(result.interactionEligible||result.viewEligible){
   const region=Object.assign(prepared,{ticket,kind,address,addressKey:key,ready:epoch(),started,used:++clock});
   if(disposed){await ticket.retire();return null;}
   if(kind==='view'){const old=visual;visual=region;residents.set(key,region);if(old&&old!==region)await retire(old);}
   else residents.set(key,region);
   const readinessMs=region.ready-started;horizon=Math.min(4,Math.max(2,readinessMs/1000+.25));
   event('ready',{requestId:ticket.request.identity.requestId,addressKey:key,address,kind,key:region.key,classification:region.artifact.classification,readinessMs,artifact:region.artifact});return region;
  }
  event('request-settled',{requestId:ticket.request.identity.requestId,addressKey:key,state:result.state,reason:result.reason});
  if(result.state==='failed'||result.state==='unresolved'||result.state==='unsupported'&&!/capacity/i.test(result.reason??''))throw Error('Preparation '+result.state+': '+result.reason);
  return null;
 }).catch(error=>{fail(error);return null;});return item.promise;
}
function select(region){if(active===region)return;const previous=active?.addressKey;active=region;region.used=++clock;handoffs++;event('entry',{addressKey:region.addressKey,address:region.address,previous,key:region.key,renderRevision:region.key,collisionRevision:region.key,position:[...position],bodyD});}
function requestScale(smaller){
 const next=smaller?D/4:D;if(next===bodyD)return true;
 const candidate=residents.get(smaller?'fine':'0,0,0');if(!candidate||smaller&&!residents.has('0,0,0')){if(smaller){request('coarse',[0,0,0]);request('fine');}event('scale-deferred',{reason:'preparation',smaller});return false;}
 if(!regionClear(candidate,position,next)){event('scale-deferred',{reason:'clearance-or-coverage',smaller,position:[...position]});return false;}
 const before=[...position];bodyD=next;select(candidate);event('scale',{bodyD,position:[...position],displacement:length(sub(position,before))});return true;
}
function predict(v){
 if(resetting||disposed)return;const begin=performance.now();
 const addresses=bodyD===D?predictRegionAddresses(grid,position,v,horizon,{max:3}):[];wanted=new Set(addresses.map(a=>grid.key(a)));
 if(bodyD===D/4){wanted.add('fine');wanted.add('0,0,0');}
 for(const [key,item]of pending)if(item.kind==='coarse'&&!wanted.has(key)&&key!==active?.addressKey){item.ticket.cancel('obsolete prediction').catch(fail);}
 for(const a of addresses)request('coarse',a);
 if(bodyD===D/4)request('fine');
 if(![...pending.values()].some(p=>p.kind!=='view')&&addresses.every(a=>residents.has(grid.key(a)))){
  const a=viewGrid.nearest(position);if(a&&!visual?.address.every((x,i)=>x===a[i])&&![...pending.values()].some(p=>p.kind==='view'))request('view',a);
 }
 record?.prediction.push(performance.now()-begin);
}
function move(delta){
 const begin=performance.now(), end=add(position,delta), previous=[...position];let candidate=active;
 if(bodyD===D){
  const nearest=grid.nearest(end), best=nearest&&residents.get(grid.key(nearest));
  if(best&&best!==active&&regionCovers(best,position,end,bodyD)&&regionClear(best,position,bodyD))candidate=best;
  if(!candidate||!regionCovers(candidate,position,end,bodyD))candidate=[...residents.values()].find(r=>r.kind==='coarse'&&regionCovers(r,position,end,bodyD)&&regionClear(r,position,bodyD));
 }
 if(!candidate||!regionCovers(candidate,position,end,bodyD)){record?.nav.push({ms:performance.now()-begin,kind:bodyD===D?'coarse':'fine',wait:true});return{waiting:true,hit:null};}
 if(candidate!==active)select(candidate);
 const first=active.castQueries===0, result=sweepRegion(active,position,delta,bodyD);position=add(position,mul(delta,result.fraction));active.used=++clock;
 if(result.hit){contacts++;event('contact',{addressKey:active.addressKey,key:active.key,phase,start:previous,position:[...position],delta,hit:result.hit,bodyD});}
 record?.nav.push({ms:performance.now()-begin,kind:active.kind,first,contact:!!result.hit});
 if(!regionCovers(active,position,position,bodyD))throw Error('Published movement lost body coverage');return{waiting:false,hit:result.hit};
}
function beginRoute(){legs=[add(O,[0,D,0])];reached=[];leg=0;changePhase('outgoing',legs[0]);}
function beginFineVisit(){auto=true;holdBeforeFine=true;changePhase('entry',fixture.approach.entry);}
function advance(hit=false){
 if(phase==='outgoing'){
  reached.push([...position]);leg++;
  if(leg===1){goal=add(position,mul(grid.config.axes[0],1.5*D));event('travel-leg',{leg,goal});return;}
  if(leg===2){goal=add(position,mul(grid.config.axes[1],.5*D));event('travel-leg',{leg,goal});return;}
  const back=[...reached.slice(0,-1).reverse(),O];legs=back;leg=0;changePhase('return',legs[0]);return;
 }
 if(phase==='return'){if(++leg<legs.length){goal=legs[leg];return;}changePhase('coarseTouch',fixture.approach.target);return;}
 if(phase==='coarseTouch'){event('coarse-contact-control',{hit});changePhase('entry',fixture.approach.entry);return;}
 if(phase==='entry'){request('coarse',[0,0,0]);request('fine');changePhase('fineWait');return;}
 if(phase==='inspect'){changePhase('inspectHold');return;}
 if(phase==='fineTouch'){
  if(hit){const before=[...position];if(requestScale(false))throw Error('Unsafe growth accepted at fine contact');if(length(sub(before,position)))throw Error('Rejected scale change displaced observer');event('unsafe-growth-refused');}
  changePhase('fineRetreat',fixture.approach.entry);return;
 }
 if(phase==='fineRetreat'){if(!requestScale(false))throw Error('Retreat did not permit growth');const fine=residents.get('fine');if(fine)retire(fine).catch(fail);changePhase('home',O);return;}
 if(phase==='home'){cycle++;event('cycle-complete',{cycle});beginRoute();}
}
function guided(dt){
 if(phase==='fineWait'){request('coarse',[0,0,0]);request('fine');if(holdBeforeFine)return{velocity:[0,0,0],waiting:false};if(!requestScale(true))return{velocity:[0,0,0],waiting:true};changePhase('inspect',fixture.approach.inspection);}
 if(phase==='inspectHold'){if(hold)return{velocity:[0,0,0],waiting:false};changePhase('fineTouch',fixture.approach.target);}
 if(!goal)return{velocity:[0,0,0],waiting:false};const delta=sub(goal,position),distance=length(delta);
 if(distance<1e-5*bodyD){advance();return{velocity:[0,0,0],waiting:false};}
 const v=mul(delta,.5*bodyD/distance), step=mul(delta,Math.min(1,.5*bodyD*dt/distance));
 const result=move(step);lookAt(phase==='outgoing'||phase==='return'?add(position,mul(grid.config.axes[2],-D)):fixture.feature.point);
 if(result.hit)advance(true);return{velocity:v,waiting:result.waiting};
}
function manual(dt){
 const f=forward(), right=norm([f[2],0,-f[0]]);let v=[0,0,0];
 for(const [key,axis,sign]of[['w',f,1],['s',f,-1],['d',right,1],['a',right,-1],['e',[0,1,0],1],['q',[0,1,0],-1]])if(keys.has(key))v=add(v,mul(axis,sign));
 if(!length(v))return{velocity:v,waiting:false};v=mul(norm(v),.5*bodyD);return{...move(mul(v,dt)),velocity:v};
}
function frame(now){
 if(disposed)return;const raw=now-last,dt=Math.min(.05,Math.max(0,raw/1000));last=now;
 try{
  if(running&&!resetting){const result=auto?guided(dt):manual(dt);velocity=result.velocity;if(result.waiting)waitMs+=dt*1000;
   if(now-lastPrediction>=100){lastPrediction=now;predict(velocity);}
   record?.frames.push({ms:raw,pending:pending.size>0,bodyD,phase,position:[...position],active:active?.addressKey,key:active?.key,renderRevision:active?.key,collisionRevision:active?.key,waiting:result.waiting});
  }
  if(active)renderer.render({position:mul(sub(position,O),1/D),forward:forward(),bodyScale:bodyD/D,active,home:residents.get('0,0,0'),view:visual});
  if(record){record.peakGpuBytes=Math.max(record.peakGpuBytes,renderer.bytes());record.peakInteraction=Math.max(record.peakInteraction,interactionCount());}
  document.querySelector('#status').textContent=`${phase} · scale ${bodyD/D} · ${residents.size} regions · ${pending.size} preparing · ${contacts} contacts`;
 }catch(error){fail(error);}raf=requestAnimationFrame(frame);
}
async function releaseSession(){
 running=false;auto=false;keys.clear();active=null;visual=null;
 const jobs=[...pending.values()].map(p=>p.ticket.cancel('run reset'));await Promise.all(jobs);
 await Promise.all([...residents.values()].map(retire));await Promise.all(retiring.values());residents.clear();await session.shutdown({timeoutMs:25000});
 for(let i=0;i<50;i++){const state=await fetch('/pc2/status').then(r=>r.json());if(!state.queue.active&&!state.queue.queued)return;await delay(100);}
 throw Error('Native queue did not drain for reset');
}
async function setupSession(reset){
 resetting=true;
 if(reset){await releaseSession();const response=await fetch('/pc2/reset',{method:'POST'});if(!response.ok)throw Error('Native reset failed');fixture.producer=(await response.json()).producer;}
 session=createPreparationSession({runtimeId:crypto.randomUUID(),producer:fixture.producer,maxLive:13});
 position=[...O];bodyD=D;wanted=new Set(['0,0,0']);
 const home=await request('coarse',[0,0,0]);if(!home)throw Error('Starting region unavailable');active=home;
 if(!regionClear(home,position,D))throw Error('Starting body lacks clearance');
 await request('view',[0,0,0]);resetting=false;lookAt(fixture.feature.point);
}
async function startRun({late=false,manual=false}={}){
 record=null;await setupSession(true);contacts=handoffs=waitMs=retirements=cycle=0;hold=false;holdBeforeFine=false;
 record={started:epoch(),events:[],frames:[],nav:[],prediction:[],peakGpuBytes:renderer.bytes(),peakInteraction:interactionCount(),scenario:late?'late':manual?'input':'ordinary',cacheState:'native field caches reset; initial home/view prepared; browser engine and driver warm'};
 last=performance.now();lastPrediction=0;horizon=2;running=true;auto=!manual;beginRoute();if(late)await fetch('/pc2/late',{method:'POST'});event('run-start',{producer:fixture.producer});return snapshot();
}
function snapshot(){return{position:[...position],positionD:mul(sub(position,O),1/D),phase,active:active?.addressKey,resident:[...residents.keys()],pending:[...pending.keys()],contacts,handoffs,waitMs,retirements,cycle,bodyScale:bodyD/D,yaw,pitch,errors:[...errors],producer:producer.snapshot(),capacity:preparer.capacity(),session:session.diagnostics(),gpuBytes:renderer.bytes()};}
function finishRun(){running=false;auto=false;const result={...record,ended:epoch(),final:snapshot(),errors:[...errors]};record=null;return result;}
async function dispose(){
 if(disposed)return;disposed=true;running=false;auto=false;cancelAnimationFrame(raf);active=null;visual=null;
 const drain=session?.shutdown({timeoutMs:25000});preparer?.close();await drain;await Promise.all(retiring.values());residents.clear();pending.clear();await renderer?.dispose();
 return{cleanup:true,session:session?.diagnostics(),payload:producer?.snapshot(),events:allEvents};
}
try{
 const started=epoch();fixture=await fetch('/pc2/world').then(r=>r.json());grid=createSpatialGrid(fixture.grid);viewGrid=createSpatialGrid(fixture.viewGrid);D=grid.config.diameter;O=grid.config.origin;position=[...O];bodyD=D;
 renderer=await createPreparedRenderer({canvas:document.querySelector('canvas'),anchor:O,diameter:D,lightDirection:fixture.feature.light,onError:fail});
 demo.controls=await renderer.controls();producer=createBrowserProducer({onEvent:value=>event(value.type,value)});preparer=await createBrowserPreparer({renderer,workerUrl:new URL('./collision-worker.mjs',import.meta.url),loadPhysics:async()=>(await import('/native/rapier.mjs')).default,onEvent:value=>event(value.type,value)});
 await setupSession(false);last=performance.now();raf=requestAnimationFrame(frame);
 window.addEventListener('keydown',e=>{if('wasdqe'.includes(e.key.toLowerCase())){keys.add(e.key.toLowerCase());e.preventDefault();}});window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>keys.clear());
 const canvas=document.querySelector('canvas');canvas.addEventListener('pointerdown',e=>{dragging=true;canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointermove',e=>{if(dragging)setLook(yaw+e.movementX*.003,pitch-e.movementY*.003);});
 canvas.addEventListener('wheel',e=>{e.preventDefault();requestScale(e.deltaY<0);},{passive:false});
 Object.assign(demo,{ready:true,fixture,adapter:renderer.adapterInfo,startupMs:epoch()-started,startRun,finishRun,snapshot,setLook,requestScale,free(){auto=false;keys.clear();},holdInspection(value){hold=value;},beginFineVisit,releaseFineWait(){holdBeforeFine=false;},dispose});
}catch(error){demo.error=String(error.stack??error);fail(error);try{await dispose();}catch(cleanup){demo.cleanupError=String(cleanup);}}
