import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceRecipe, sourceRecipeKey, createParentDefinition, SOURCE_PROFILE } from '../../src/space/generation/source-recipe.js';
import { canonicalJson } from '../../src/shared/scene.js';
import { sourceCase } from '../support/source-recipes.mjs';

test('source recipe retains exact decimal source coordinates', () => {
 const input=sourceCase();const value=createSourceRecipe(input);
 assert.ok(value && typeof value==='object', 'a valid recipe snapshot is required');
 assert.equal(value.source.re,input.source.re);
 assert.equal(value.source.im,input.source.im);
});

test('source recipes own immutable snapshots and preserve deep strings without Number conversion',()=>{
 const input=sourceCase();input.source.re='-0.'+'7'.repeat(1000);
 const value=createSourceRecipe(input);input.source.re='0';
 assert.equal(value.source.re,'-0.'+'7'.repeat(1000));assert.ok(Object.isFrozen(value.source));
 assert.equal(createSourceRecipe(JSON.parse(canonicalJson(value))).source.re,value.source.re);
});
test('changing the last exact source digit changes its SHA-256 request key',async()=>{
 const a=sourceCase(),b=sourceCase();b.source.re+='1';
 assert.notEqual(await sourceRecipeKey(a),await sourceRecipeKey(b));
 assert.match(await sourceRecipeKey(a),/^sha256:[a-f0-9]{64}$/);
});
test('object property order does not change source recipe identity',async()=>{
 const a=sourceCase(),b=Object.fromEntries(Object.entries(a).reverse());
 b.source=Object.fromEntries(Object.entries(b.source).reverse());
 assert.equal(await sourceRecipeKey(a),await sourceRecipeKey(b));
});
test('observer body mesh cache and machine data are not source-recipe inputs',()=>{
 for(const key of ['camera','body','mesh','cache','path','device'])assert.throws(()=>createSourceRecipe({...sourceCase(),[key]:1}),/requires exactly/);
 const value=sourceCase();value.source.camera={};assert.throws(()=>createSourceRecipe(value),/requires exactly/);
});
test('decimal type syntax and bounded expansion are checked before evaluation',()=>{
 for(const text of [3.14,'NaN','Infinity','1e200001','1e999999999','0.'+'1'.repeat(200001),' 0.1','']){
  const a=sourceCase();a.source.re=text;assert.throws(()=>createSourceRecipe(a));
 }
 const a=sourceCase();a.source.re='+.123456789e-100';assert.equal(createSourceRecipe(a).source.re,a.source.re);
});
test('positive source scales and bounded integral workloads are required',()=>{
 for(const [part,key,value] of [['source','unitsPerMetre','-1'],['source','unitsPerMetre','0'],['grid','halfExtentM','-0.8'],['grid','cells',0],['grid','cells',513],['grid','cells',1.5],['numerics','maxIterations',131073],['numerics','roundingDenominator',0]]){
  const a=sourceCase();a[part][key]=value;assert.throws(()=>createSourceRecipe(a));
 }
});
test('a valid deep-scale source is stored rather than rounded or refused by the codec',()=>{
 const value=createSourceRecipe(sourceCase('deep'));assert.equal(value.source.unitsPerMetre,'1e-40');
});
test('unknown schema and generator versions cannot borrow current profile semantics',()=>{
 for(const change of [a=>a.schemaVersion=2,a=>a.generator.version='new',a=>a.generator.id='other']){
  const a=sourceCase();change(a);assert.throws(()=>createSourceRecipe(a),/unsupported/);
 }
});
test('resolved parent definitions bind the complete recipe and logical height array',async()=>{
 const a=await createParentDefinition(sourceCase(),'a'.repeat(64));
 const b=await createParentDefinition(sourceCase(),'b'.repeat(64));
 assert.notEqual(a.definitionKey,b.definitionKey);assert.deepEqual(a.surface.shape,[65,65]);
 assert.deepEqual(a.recipe,createSourceRecipe(sourceCase()));assert.equal(a.profile.outsideDomain,'undefined');
 await assert.rejects(createParentDefinition(sourceCase(),'short'),/SHA-256/);
});
test('affine-distance-r1 locks the coordinate field status and array semantics',()=>{
 assert.deepEqual(SOURCE_PROFILE,{formula:'z*z+c',escapeRadius:'1000000',derivative:'before-z',distance:'half-milnor',
 interior:'strict-cardioid-period2',interiorMargin:'0.000000001',interiorDistanceM:'0',coordinateMapping:'C+U*(x-i*z)',
 coordinateArithmetic:'exact-rational-round-once-binary64',distanceArithmetic:'binary64-Dc-divide-U',heightArithmetic:'binary64-subtract-multiply-subtract',
 unknown:'unresolved-no-surface',failed:'failed-no-surface',outsideDomain:'undefined',interpolation:'bilinear',array:'little-endian-float64-C',negativeZero:'positive'});
});
