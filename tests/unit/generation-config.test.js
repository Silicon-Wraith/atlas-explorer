import {decodeSceneFile,encodeSceneFile} from '../../src/space/preparation/scene-adapter.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {verifyGenerationBundle,GENERATION_ROOT,GENERATION_BUNDLE,GENERATION_CERTIFICATE} from '../../scripts/generation/config.mjs';

test('owned generator verifies allowed relocation and the exact portable legacy definition',async()=>{
 const result=await verifyGenerationBundle();
 assert.equal(result.modules,18);assert.equal(result.inputs,14);
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

test('native generation exposes a strict recipe-to-legacy compatibility binding',async()=>{
 const result=await verifyGenerationBundle();
 assert.ok(result.recursiveRecipe&&typeof result.recursiveRecipe==='object','registered recursive recipe binding required');
 const original=JSON.parse(await fs.readFile(new URL('../reference/legacy-recursive-projection.json',import.meta.url)));
 assert.equal(result.recursiveRecipe.projectionDigest,original.projectionDigest);
 assert.equal(result.recursiveRecipe.legacyId,result.world.id);
 assert.equal(result.recursiveRecipe.legacyDefinitionKey,'fnv1a64:4c29d6f7f61fbb06');
});

test('unregistered recipe keys aliases or projections refuse before a native process',async()=>{
 const target=path.join(GENERATION_ROOT,'import-manifest.json');
 for(const[key,value]of[['recipeKey','sha256:'+'0'.repeat(64)],['legacyId','other'],['legacyDefinitionKey','fnv1a64:0000000000000000'],['projectionDigest','sha256:'+'0'.repeat(64)]]){
  await assert.rejects(verifyGenerationBundle({readFile:async(file,...args)=>{
   const bytes=await fs.readFile(file,...args);if(file!==target)return bytes;
   const m=JSON.parse(bytes);m.recursiveRecipe[key]=value;return JSON.stringify(m);
  }}),/recursive recipe|Recursive recipe/);
 }
});

test('the preserved actual pre-recipe place uses the current schema and exact legacy definition',async()=>{
 const bytes=await fs.readFile(new URL('../reference/legacy-prepared-place.json',import.meta.url),'utf8');const scene=decodeSceneFile(bytes);
 assert.equal(scene.schema,'atlas.scene');assert.equal(scene.parameters.world.id,'H1C-surface-child@ee2564d40bda7ef6');assert.equal(scene.parameters.world.definitionKey,'fnv1a64:4c29d6f7f61fbb06');assert.equal(encodeSceneFile(scene),bytes);
});
