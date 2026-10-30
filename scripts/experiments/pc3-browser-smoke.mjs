import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createApplicationServer } from '../preparation/application-server.mjs';
import { observeOwnedProcesses } from '../preparation/process-observer.mjs';
import { ev, within, boundContext, chromeLaunchEnv, closeWithin } from '../../tests/support/bounded.mjs';
import { PROJECT0_LAUNCH_ARGS, checkEffectiveArguments, collectVisibleText, activeGpuIdentity } from '../../tests/support/space-suite.mjs';

if(!process.env.ATLAS_GPU_HANDOFF||process.env.ATLAS_GPU_DEFERRED)throw Error('Hardware handoff required');
const root=path.resolve(process.argv[2]);if(!root.startsWith('/mnt/ml_storage/scratch/atlas-pc3/'))throw Error('PC3 scratch required');await fs.mkdir(root);
let service,browser,context,page;const observer=observeOwnedProcesses(),report={started:Date.now(),handoff:process.env.ATLAS_GPU_HANDOFF,errors:[],cleanup:false};
const timer=setTimeout(()=>{console.error('PC3 development smoke deadline');process.exit(124);},150000);timer.unref();
const delay=ms=>within(new Promise(resolve=>setTimeout(resolve,ms)),ms+2000,'fixed smoke interval');
try{
 service=await createApplicationServer({runRoot:root});browser=await chromium.launch({channel:'chrome',headless:false,chromiumSandbox:true,timeout:30000,env:chromeLaunchEnv(),args:['--disable-dev-shm-usage',...PROJECT0_LAUNCH_ARGS]});context=boundContext(await browser.newContext({viewport:{width:1280,height:720}}));
 const identity=await context.newPage();await identity.goto('chrome://version');report.arguments=checkEffectiveArguments(await ev(identity,()=>document.querySelector('#command_line').textContent),PROJECT0_LAUNCH_ARGS);if(report.arguments.noSandbox||report.arguments.headless||report.arguments.missing.length)throw Error('Hardware profile mismatch');
 await identity.goto('chrome://gpu');let text='';for(let i=0;i<20;i++){text=await ev(identity,collectVisibleText);if(/NVIDIA.*RTX|RTX.*NVIDIA/.test(text))break;await delay(250);}report.gpu=activeGpuIdentity(text);await closeWithin(identity,'identity page');
 page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.stack??error.message));await page.goto('http://127.0.0.1:5196/');await page.waitForFunction(()=>window.atlas?.workspaces,{},{timeout:30000});
 report.plane=await ev(page,()=>({workspace:atlas.workspaces.current(),scene:atlas.scene}));
 await page.click('#switch-space');await page.waitForFunction(()=>atlas.workspaces.current()==='space'&&!atlas.workspaces.pending(),{},{timeout:60000});
 await page.click('#space-mode-landscape');await page.waitForFunction(()=>atlas.spaceModes.state.selected==='landscape'||!atlas.spaceModes.state.pending&&document.querySelector('#space-mode-error').textContent,{},{timeout:60000});
 report.entry=await ev(page,()=>({mode:atlas.spaceModes.state,landscape:atlas.landscape.state,error:document.querySelector('#space-mode-error').textContent}));if(!report.entry.landscape.active)throw Error('Landscape entry failed: '+report.entry.error);
 await page.keyboard.down('e');await delay(3500);await page.keyboard.up('e');report.moved=await ev(page,()=>atlas.landscape.state);await page.screenshot({path:path.join(root,'landscape.png')});
 await page.click('#switch-plane');await page.waitForFunction(()=>atlas.workspaces.current()==='plane'&&!atlas.workspaces.pending());await ev(page,()=>atlas.landscape.whenReleased(),null,'landscape release',30000);
 report.left=await ev(page,()=>atlas.landscape.state);await page.click('#switch-space');await page.waitForFunction(()=>atlas.workspaces.current()==='space'&&!atlas.workspaces.pending(),{},{timeout:60000});report.returned=await ev(page,()=>atlas.landscape.state);
 if(!report.returned.active||JSON.stringify(report.returned.pose)!==JSON.stringify(report.left.pose))throw Error('Retained pose re-entry mismatch');
 report.events=await ev(page,()=>atlas.landscape.events());if(report.errors.length)throw Error('Browser runtime errors');report.pass=true;
}catch(error){report.error=String(error.stack??error);console.error(report.error);process.exitCode=1;if(page)await page.screenshot({path:path.join(root,'failure.png')}).catch(()=>{});}
finally{
 const errors=[];try{if(page)await ev(page,async()=>{if(window.atlas?.landscape){await atlas.workspaces.switchTo('plane');await atlas.landscape.whenReleased();}},null,'application release',30000);}catch(error){errors.push(error.message);}
 try{await observer.sample();await closeWithin(context,'application context');await closeWithin(browser,'installed Chrome');}catch(error){errors.push(error.message);}
 try{if(service)report.serverCleanup=await service.close();}catch(error){errors.push(error.message);}
 report.processes=await observer.stop();report.cleanupErrors=errors;report.cleanup=!errors.length&&!report.processes.alive.length;report.ended=Date.now();await fs.writeFile(path.join(root,'browser-smoke.json'),JSON.stringify(report,null,2)+'\n');clearTimeout(timer);
 console.log(JSON.stringify({root,pass:report.pass,cleanup:report.cleanup,error:report.error,entry:report.entry,moved:report.moved,returned:report.returned}));if(!report.cleanup)process.exitCode=125;
}
