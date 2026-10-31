import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRecursiveRecipe,recursiveRecipeKey} from '../../src/space/generation/recursive-recipe.js';
const specimen=()=>JSON.parse(fs.readFileSync(new URL('../../scripts/generation/examples/regression-recursive.json',import.meta.url),'utf8'));
test('recursive recipe preserves all imported component and descendant inputs',()=>{
 const input=specimen(),r=createRecursiveRecipe(input);
 assert.ok(r && typeof r==='object','valid recursive recipe snapshot required');
 assert.deepEqual(r,input);assert.ok(Object.isFrozen(r.components[0].frame.u));
 input.components[0].source.re='0';assert.notEqual(r.components[0].source.re,input.components[0].source.re);
});
test('recursive identity binds exact source digits rules assets and lineage',async()=>{
 const a=specimen(),key=await recursiveRecipeKey(a);assert.match(key,/^sha256:[a-f0-9]{64}$/);
 for(const change of [r=>r.components[0].source.re+='1',r=>r.parentGrid.sha256='a'.repeat(64),r=>r.descendants[0].amplitudeM='0.0003',r=>r.sourceBindings[0].sha256='b'.repeat(64)]){
  const b=specimen();change(b);assert.notEqual(await recursiveRecipeKey(b),key);
 }
 assert.equal(await recursiveRecipeKey(Object.fromEntries(Object.entries(a).reverse())),key);
});
test('recursive recipe rejects malformed structure lineage frames resources and machine inputs',()=>{
 const changes=[r=>r.camera={},r=>r.components[0].body=1,r=>r.parentGrid.file='/scratch/base.npz',r=>r.parentGrid.file='../base.npz',r=>r.components[1].parent='missing',r=>r.components[1].id='parent',r=>r.components[0].frame.u[0]='NaN',r=>r.components[0].frame.u[0]='1',r=>r.components[0].amplitudeM='0',r=>r.components[0].source.re=' 1',r=>r.components[0].source.re='1e2049',r=>r.components[0].source.re='1'.repeat(1025),r=>r.sourceBindings.pop(),r=>r.field.taper.flatUntil='0.7',r=>r.composition.cutters.reverse(),r=>r.schemaVersion=true,r=>r.parentGrid.arrays.g.shape[0]=2,r=>r.descendants[0].parent='missing',r=>r.components[0].capM='1'];
 for(const change of changes){const r=specimen();change(r);assert.throws(()=>createRecursiveRecipe(r));}
});
test('recursive codec preserves either frame handedness and does not round source strings',()=>{
 const a=specimen();a.components[0].source.re='-0.'+'7'.repeat(1000);
 const b=createRecursiveRecipe(a);assert.equal(b.components[0].source.re,a.components[0].source.re);assert.equal(b.components[0].frame.u[1],'2.7755575615628914e-17');
 a.components[1].frame.n=a.components[1].frame.n.map(x=>String(-Number(x)));assert.deepEqual(createRecursiveRecipe(a).components[1].frame.n,a.components[1].frame.n);
});
