import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {verifyGenerationBundle,GENERATION_ROOT,GENERATION_BUNDLE,GENERATION_CERTIFICATE} from '../../scripts/generation/config.mjs';

test('owned generator verifies allowed relocation and the exact portable legacy definition',async()=>{
 const result=await verifyGenerationBundle();
 assert.equal(result.modules,18);assert.equal(result.inputs,13);
 assert.deepEqual(result.world,JSON.parse(await fs.readFile(new URL('../support/retained-world.json',import.meta.url),'utf8'),(key,value)=>key==='definitionKey'?undefined:value));
 assert.ok(GENERATION_BUNDLE.startsWith(GENERATION_ROOT+path.sep));assert.ok(GENERATION_CERTIFICATE.startsWith(GENERATION_BUNDLE+path.sep));
});
test('an unlisted native algorithm edit cannot pass the migration manifest',async()=>{
 const target=path.join(GENERATION_ROOT,'native/pert.py');
 await assert.rejects(verifyGenerationBundle({readFile:async(file,...args)=>file===target?Buffer.from('different kernel'):fs.readFile(file,...args)}),/Unlisted generation source edit/);
});
test('changed regression input bytes cannot retain their registered identity',async()=>{
 const target=path.join(GENERATION_BUNDLE,'levels.json');
 await assert.rejects(verifyGenerationBundle({readFile:async(file,...args)=>file===target?Buffer.from('{}'):fs.readFile(file,...args)}),/Regression input digest mismatch/);
});
test('generation manifests cannot resolve an input outside the declared bundle',async()=>{
 const target=path.join(GENERATION_ROOT,'import-manifest.json');
 await assert.rejects(verifyGenerationBundle({readFile:async(file,...args)=>{
  const bytes=await fs.readFile(file,...args);if(file!==target)return bytes;
  const manifest=JSON.parse(bytes);manifest.inputs={'../unowned.json':{sha256:'bad'}};return JSON.stringify(manifest);
 }}),/escapes its root/);
});
