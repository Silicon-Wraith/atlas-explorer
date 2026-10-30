import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export const GENERATION_ROOT=path.dirname(fileURLToPath(import.meta.url));
export const GENERATION_BUNDLE=path.join(GENERATION_ROOT,'regression-world');
export const GENERATION_CERTIFICATE=path.join(GENERATION_BUNDLE,'policy-certificate.json');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function owned(root,name){const target=path.resolve(root,name);if(path.isAbsolute(name)||!target.startsWith(path.resolve(root)+path.sep))throw Error('Generation manifest path escapes its root');return target;}
export async function verifyGenerationBundle({root=GENERATION_ROOT,bundle=GENERATION_BUNDLE,readFile=fs.readFile}={}){
 const manifest=JSON.parse(await readFile(path.join(root,'import-manifest.json'),'utf8'));
 if(manifest.schema!=='atlas.generation.import'||manifest.schemaVersion!==1)throw Error('Unsupported generation import manifest');
 for(const[name,row]of Object.entries(manifest.adaptations)){
  const original=manifest.originals[name],bytes=await readFile(owned(root,original.file));if(digest(bytes)!==original.sha256)throw Error('Original generation source digest mismatch: '+name);
  let source=bytes.toString();for(const edit of row.edits){if(source.split(edit.before).length!==2)throw Error('Ambiguous generation relocation: '+name);source=source.replace(edit.before,edit.after);}
  const current=await readFile(owned(root,row.file));if(current.toString()!==source||digest(current)!==row.sha256)throw Error('Unlisted generation source edit: '+name);
 }
 for(const[name,row]of Object.entries(manifest.newModules??{}))if(digest(await readFile(owned(root,row.file)))!==row.sha256)throw Error('Generation support source digest mismatch: '+name);
 for(const[name,row]of Object.entries(manifest.inputs))if(digest(await readFile(owned(bundle,name)))!==row.sha256)throw Error('Regression input digest mismatch: '+name);
 const world=JSON.parse(await readFile(owned(root,manifest.legacyWorldFile),'utf8'));
 const roles={'construction':'regression-world/construction.json','canonical-parent-samples':'regression-world/base.npz','canonical-parent-frame':'regression-world/frame.json','base-field-evaluator':'provenance/original/sampling_r0.py','parent-field-kernel':'provenance/original/h1lib.py','descendant-rule':'provenance/original/descendant_world.py'};
 for(const row of world.assets)if(digest(await readFile(owned(root,roles[row.role])))!==row.sha256)throw Error('Legacy world asset mismatch: '+row.role);
 return{world,modules:Object.keys(manifest.adaptations).length,inputs:Object.keys(manifest.inputs).length};
}
