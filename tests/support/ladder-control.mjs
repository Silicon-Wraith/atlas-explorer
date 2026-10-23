// Shared with the Node harness tests; no browser or native device is touched on import.
export async function runUnpaced({poses, submit, lifecycle, liveFrames=2}) {
  const active=new Set();
  const start=pose=>{
    const work=Promise.resolve().then(()=>submit(pose)).then(result=>{
      if(result?.outcome!=='completed')throw Error(`failed-harness: unpaced draft did not complete (${result?.outcome})`);
      return result;
    });
    active.add(work);work.then(()=>active.delete(work),()=>active.delete(work));return work;
  };
  try {
    for(const pose of poses) {
      // A superseded job's settlement is not a throughput slot. On the product's newest-wins
      // path, issue only after completion; lower rungs keep both independent frame slots busy.
      if(lifecycle)await start(pose);
      else {if(active.size===liveFrames)await Promise.race(active);start(pose);}
    }
    await Promise.all(active);
  } finally {await Promise.allSettled(active);}
}
// Focus is recorded with the cell but does not gate it: an unfocused, visible headed window is
// not throttled (diagnosis H1). Hidden pages and slow idle GPU round trips are rejected.
export function environmentValid(probe) {
  return probe?.visibilityState==='visible' && !probe.hidden &&
    Number.isFinite(probe.idleFenceRttP95) && probe.idleFenceRttP95<=1 &&
    Number.isFinite(probe.idleScopeRttP95) && probe.idleScopeRttP95<=1;
}
export async function environmentProbe() {
  const {within}=await import('./bounded.mjs');
  const quantile=(values,q)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*q)-1];
  const out={visibilityState:document.visibilityState,hidden:document.hidden,hasFocus:document.hasFocus()};
  out.rafPerSecond=await new Promise(resolve=>{
    let n=0,frame;const start=performance.now();
    const finish=()=>{cancelAnimationFrame(frame);clearTimeout(timer);resolve(n*1000/(performance.now()-start));};
    const tick=()=>{n++;if(performance.now()-start<1000)frame=requestAnimationFrame(tick);else finish();};
    const timer=setTimeout(finish,1500);frame=requestAnimationFrame(tick);
  });
  const late=[];
  for(let i=0;i<30;i++){const start=performance.now();await new Promise(r=>setTimeout(r,16));late.push(performance.now()-start-16);}
  out.timer16LateP95=quantile(late,.95);
  // This empty-submit probe is diagnostic and outside the product's timed workload.
  const adapter=await within(navigator.gpu.requestAdapter({powerPreference:'high-performance'}),5000,'probe adapter');
  const acquisition=adapter.requestDevice();
  let expired=false,device;
  acquisition.then(value=>{if(expired)value.destroy();},()=>{});
  try{device=await within(acquisition,5000,'probe device');}catch(error){expired=true;throw error;}
  try {
    const fence=[],scope=[];
    for(let i=0;i<40;i++){
      let start=performance.now();device.queue.submit([]);
      await within(device.queue.onSubmittedWorkDone(),5000,'idle fence');fence.push(performance.now()-start);
      start=performance.now();device.pushErrorScope('validation');
      const error=await within(device.popErrorScope(),5000,'idle scope');if(error)throw Error(error.message);
      scope.push(performance.now()-start);await new Promise(r=>setTimeout(r,16));
    }
    Object.assign(out,{idleFenceRttP50:quantile(fence,.5),idleFenceRttP95:quantile(fence,.95),idleScopeRttP50:quantile(scope,.5),idleScopeRttP95:quantile(scope,.95)});
    return {...out,visibilityState:document.visibilityState,hidden:document.hidden,hasFocus:document.hasFocus()};
  } finally {device.destroy();}
}
