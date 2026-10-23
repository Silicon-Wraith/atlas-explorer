// Diagnostic entry point. --list is inert; measurements use the existing guarded headed runner.
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { LADDER_MANIFEST, ladderCells, compareLadder } from './support/space-performance-ladder.mjs';
export { ladderCells };
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const manifest=JSON.parse(await readFile(LADDER_MANIFEST)),cells=ladderCells(manifest),args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--list')console.log(cells.map((cell,index)=>`${index}\t${JSON.stringify(cell)}\tnode tests/space-performance-ladder.mjs --cell ${index}`).join('\n'));
  else if(args.length===2&&args[0]==='--compare'){
    const groups=new Map();
    for(const path of (await readdir(args[1])).filter(p=>/^(plain|timestamps)-(bulb|quaternion|menger)-r[1-3]-(paced|unpaced)-[0-9]+-L[0-6][a-d]?\.json$/.test(p))){
      const result=JSON.parse(await readFile(resolve(args[1],path)));if(result.schema!=='atlas.performance-ladder-evidence')throw Error('unrecognized ladder evidence');
      if(result.manifestSha256!==createHash('sha256').update(await readFile(LADDER_MANIFEST)).digest('hex'))throw Error('evidence belongs to a different frozen manifest');
      const key=JSON.stringify([result.manifestSha256,result.cell.scene,result.cell.repetition,result.cell.instrumentation]);
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push(result);
    }
    console.log(JSON.stringify([...groups].map(([key,results])=>({group:JSON.parse(key),...compareLadder(results,manifest)})),null,2));
  }
  else if(args.length===1&&args[0]==='--all'){delete process.env.ATLAS_LADDER_CELL;process.argv=[process.argv[0],process.argv[1],'--group','performance-ladder'];await import('./space.mjs');}
  else {if(args.length!==2||args[0]!=='--cell'||!/^\d+$/.test(args[1])||!cells[Number(args[1])])throw Error('usage: --all | --list | --cell <registered index> | --compare <evidence directory>');process.env.ATLAS_LADDER_CELL=JSON.stringify(cells[Number(args[1])]);process.argv=[process.argv[0],process.argv[1],'--group','performance-ladder'];await import('./space.mjs');}
}
