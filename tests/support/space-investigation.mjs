import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ev, within, idleWithin, LIMITS } from './bounded.mjs';

export async function runInvestigation({page,url,environment,report,pass}) {
  const steps=[];
  const idle=()=>ev(page,()=>atlas.space.whenIdle({timeoutMs:115000}),undefined,'investigation settled render',LIMITS.deep);
  const snapshot=()=>ev(page,()=>({sceneHash:atlas.space.sceneHash,model:atlas.space.scene.model,parameters:atlas.space.scene.parameters,
    reportId:atlas.space.lastReport?.reportId,termination:atlas.space.lastPublication?.rayTermination,state:atlas.space.state,history:atlas.space.history}),undefined,'investigation evidence');
  const step=async(name,action)=>{try{const detail=await action();const evidence=await snapshot();steps.push({name,state:'passed',detail,evidence});}catch(error){steps.push({name,state:'failed',error:String(error.stack??error)});throw error;}};
  let completed=false;
  try {
    await page.goto(url);await page.waitForFunction(()=>document.body.dataset.ready==='true');await idleWithin(page);
    assert.equal(await ev(page,()=>atlas.workspaces.current(),undefined,'initial workspace'),'plane');
    await step('Open Plane and switch to Space',async()=>{const result=await ev(page,()=>atlas.workspaces.switchTo('space'),undefined,'switch to Space',LIMITS.deep);assert.equal(result.activeId,'space');await idle();});
    for(const[model,parameters]of[['sphere',{}],['box',{}],['menger',{depth:1}],['menger',{depth:2}],['mandelbulb',{power:'8'}],['mandelbulb',{power:'4'}],['quaternion-julia',{C:['-0.2','0.8','0','0'],kappa:'0'}],['quaternion-julia',{C:['-0.2','0.8','0.15','-0.1'],kappa:'0.5'}]]) {
      await step(`Explore ${model} ${JSON.stringify(parameters)}`,async()=>{
        await ev(page,({model,parameters})=>{atlas.space.selectFamily(model);for(const[k,v]of Object.entries(parameters)){const r=atlas.space.editParameter(`parameters.${k}`,v);if(!r.ok)throw Error(r.error);}atlas.space.overview();},{model,parameters},'family and parameters');await idle();
        const frame=await snapshot();assert.ok(frame.reportId);assert.ok(frame.termination);return {estimator:await page.locator('#space-estimator').textContent()};
      });
    }
    await step('Orbit, dolly, focus and flight',async()=>{
      await ev(page,()=>atlas.space.selectFamily('sphere'),undefined,'sphere for navigation');await idle();
      const box=await page.locator('#space-canvas').boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
      await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+60,y+20,{steps:8});await page.mouse.up();await idle();
      await page.mouse.wheel(0,-60);await page.waitForTimeout(250);await idle();
      await page.mouse.dblclick(x,y);await idle();
      await page.mouse.click(x,y);await page.keyboard.press('KeyF');await page.keyboard.down('KeyW');await page.waitForTimeout(250);await page.keyboard.up('KeyW');await page.keyboard.press('KeyF');await idle();
    });
    await step('Edit a parameter and undo without moving the camera',async()=>{
      await ev(page,()=>atlas.space.selectFamily('mandelbulb'),undefined,'bulb');await idle();const before=await snapshot();
      await ev(page,()=>atlas.space.editParameter('parameters.power','7'),undefined,'edit power');await idle();assert.notEqual((await snapshot()).sceneHash,before.sceneHash);
      await ev(page,()=>atlas.space.undo(),undefined,'undo');await idle();assert.equal((await snapshot()).sceneHash,before.sceneHash);
    });
    await step('Cancel a settled render and render again successfully',async()=>{
      const cancellation=await ev(page,async()=>{
        const before=atlas.space.state.submitted;atlas.space.editParameter('iteration.maxIterations','512');const until=performance.now()+30000;
        while(atlas.space.state.submitted===before&&performance.now()<until)await new Promise(r=>setTimeout(r,1));
        const receipt=atlas.space.cancelCurrent();if(!receipt?.accepted)throw Error('no running render was cancelled');return await receipt.done;
      },undefined,'cancel settled render',LIMITS.operation);assert.equal(cancellation.outcome,'cancelled');
      await ev(page,()=>atlas.space.editParameter('iteration.maxIterations','128'),undefined,'render after cancellation');await idle();return cancellation;
    });
    await step('Save scene JSON, reload, open the file and verify its hash',async()=>{
      await mkdir('artifacts/investigation',{recursive:true});const saved=await snapshot(),path=resolve('artifacts/investigation/scene.json');
      const[download]=await within(Promise.all([page.waitForEvent('download'),page.click('#space-save-scene')]),LIMITS.operation,'scene download');await download.saveAs(path);
      await page.reload();await page.waitForFunction(()=>document.body.dataset.ready==='true');await idleWithin(page);
      await ev(page,()=>atlas.workspaces.switchTo('space'),undefined,'Space after reload',LIMITS.deep);await idle();await page.setInputFiles('#space-open-scene',path);await idle();
      assert.equal((await snapshot()).sceneHash,saved.sceneHash);return {path,sceneHash:saved.sceneHash};
    });
    await step('Inject device loss and recover',async()=>{const before=await snapshot();await ev(page,()=>atlas.space.injectLoss(),undefined,'device loss');await idle();const after=await snapshot();assert.equal(after.sceneHash,before.sceneHash);assert.equal(after.state.phase,'ready');});
    await step('Inject allocation failure and choose the lower-cost option',async()=>{
      await ev(page,()=>{atlas.space.injectAllocationFailure();atlas.space.editParameter('parameters.power','7');},undefined,'allocation failure');
      await page.waitForFunction(()=>Boolean(atlas.space.state.allocationFailure));const failure=(await snapshot()).state.allocationFailure;
      await page.click('#space-allocation [data-choice="lower-resolution"]');await idle();const after=await snapshot();assert.ok(after.state.cost.scale<1);return failure;
    });
    await step('Move inside the set and recover with overview',async()=>{
      await ev(page,async()=>{atlas.space.restoreFullCost();const {lookAt}=await import('/src/space/camera.js');const c=atlas.space.scene.camera;atlas.space.requestCamera(lookAt({...c,positionLocal:[0,0,0.05],focusLocal:[0.6,0.2,0.05]},[0.6,0.2,0.05]));},undefined,'inside camera');await idle();
      assert.match(await page.locator('#space-camera-status').textContent(),/unresolved/);await page.click('#space-overview');await idle();
      assert.equal(await ev(page,()=>atlas.space.cameraStatus.detail.cpu.status,undefined,'overview classification'),'exterior');
    });
    completed=true;pass('B15 recorded investigation completes every required operation',{steps});
  } finally {
    const result={schema:'atlas.investigation',schemaVersion:1,completed,environment,steps,cleanup:'see artifacts/space-shell-report.json; document alone does not establish cleanup'};
    report.push({name:'B15 recorded investigation',...result});await mkdir('docs/reports/project1b',{recursive:true});
    await writeFile('docs/reports/project1b/1b1-investigation.json',JSON.stringify(result,null,2)+'\n');
    await writeFile('docs/reports/project1b/1b1-investigation.md',`# 1b.1 recorded investigation\n\nOutcome: ${completed?'operations completed; suite cleanup must also pass':'failed or incomplete'}. Source: ${environment.source.commit}.\n\nEvidence: \`1b1-investigation.json\`; environment and cleanup: \`artifacts/space-shell-report.json\`.\n\n| Step | State | Report ID | Terminations |\n|---|---|---|---|\n${steps.map(s=>`| ${s.name} | ${s.state} | ${s.evidence?.reportId??'unavailable'} | ${JSON.stringify(s.evidence?.termination??s.error)} |`).join('\n')}\n`);
  }
}
