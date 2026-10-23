// Diagnostic entry point. --list is inert; measurements use the existing guarded headed runner.
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { LADDER_MANIFEST, ladderCells, compareLadder } from './support/space-performance-ladder.mjs';
export { ladderCells };
export async function compareLadderDirectory(directory,manifest,{attemptDispositions={}}={}){
  const groups=new Map(),manifestSha256=createHash('sha256').update(await readFile(LADDER_MANIFEST)).digest('hex');
  // Include legacy names so they are explicitly rejected, never silently hidden. New
  // evidence names append an immutable UUID to the registered-cell prefix.
  for(const path of (await readdir(directory)).filter(p=>/^(plain|timestamps)-(bulb|quaternion|menger)-r[1-3]-(paced|unpaced)-[0-9]+-L[0-6][a-d]?(?:-[a-zA-Z0-9-]+)?\.json$/.test(p))){
    const result=JSON.parse(await readFile(resolve(directory,path)));
    if(result.manifestSha256!==manifestSha256)throw Error('evidence belongs to a different frozen manifest');
    const key=JSON.stringify([result.manifestSha256,result.cell?.scene,result.cell?.repetition,result.cell?.instrumentation]);
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(result);
  }
  if(!groups.size)return [{state:'incomplete',reason:'no ladder evidence files'}];
  return [...groups].map(([key,results])=>({group:JSON.parse(key),...compareLadder(results,manifest,{attemptDispositions})}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const manifest=JSON.parse(await readFile(LADDER_MANIFEST)),cells=ladderCells(manifest),args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--list')console.log(cells.map((cell,index)=>`${index}\t${JSON.stringify(cell)}\tnode tests/space-performance-ladder.mjs --cell ${index}`).join('\n'));
  else if(args[0]==='--compare'&&(args.length===2||args.length===4&&args[2]==='--dispositions')){
    const attemptDispositions=args[3]?JSON.parse(await readFile(args[3])):{};
    console.log(JSON.stringify(await compareLadderDirectory(args[1],manifest,{attemptDispositions}),null,2));
  }
  else if(args.length===2&&args[0]==='--cells'&&/^\d+(,\d+)*$/.test(args[1])){
    const selected=args[1].split(',').map(i=>cells[Number(i)]);if(selected.some(c=>!c))throw Error('--cells takes registered indices');
    delete process.env.ATLAS_LADDER_CELL;process.env.ATLAS_LADDER_CELLS=JSON.stringify(selected);process.argv=[process.argv[0],process.argv[1],'--group','performance-ladder'];await import('./space.mjs');}
  else if(args.length===1&&args[0]==='--all'){delete process.env.ATLAS_LADDER_CELL;delete process.env.ATLAS_LADDER_CELLS;process.argv=[process.argv[0],process.argv[1],'--group','performance-ladder'];await import('./space.mjs');}
  else {if(args.length!==2||args[0]!=='--cell'||!/^\d+$/.test(args[1])||!cells[Number(args[1])])throw Error('usage: --all | --list | --cell <registered index> | --cells <i,j,...> | --compare <evidence directory> [--dispositions <JSON file>]');delete process.env.ATLAS_LADDER_CELLS;process.env.ATLAS_LADDER_CELL=JSON.stringify(cells[Number(args[1])]);process.argv=[process.argv[0],process.argv[1],'--group','performance-ladder'];await import('./space.mjs');}
}
