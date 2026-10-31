import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSourceRecipe} from '../../src/space/generation/source-recipe.js';
import {createRecursiveRecipe} from '../../src/space/generation/recursive-recipe.js';
const corpus=JSON.parse(fs.readFileSync(new URL('../reference/generation-recipe-cases.json',import.meta.url),'utf8'));
for(const [group,codec] of [['sourceCases',createSourceRecipe],['recursiveCases',createRecursiveRecipe]]){
 test(group+' obeys the frozen shared JSON text corpus',()=>{
  for(const c of corpus[group]){
   if(c.accept)assert.ok(codec(JSON.parse(c.json)),c.id);
   else assert.throws(()=>codec(JSON.parse(c.json)),undefined,c.id);
  }
 });
}
