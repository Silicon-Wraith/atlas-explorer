import test from 'node:test';
import assert from 'node:assert/strict';
import {preparedRunRoot} from '../support/prepared-run-root.mjs';
test('all prepared suites accept the exact BI1.C evidence namespace without admitting look-alikes or escaped paths',()=>{
 for(const role of ['application','session','files','http','recovery']){
  assert.equal(preparedRunRoot('/mnt/ml_storage/scratch/atlas-bi1c/run',role),'/mnt/ml_storage/scratch/atlas-bi1c/run');
  for(const value of ['/mnt/ml_storage/scratch/atlas-bi1cx/run','/mnt/ml_storage/scratch/atlas-bi1c/../outside','/tmp/atlas-bi1c/run'])assert.throws(()=>preparedRunRoot(value,role),/evidence root required/);
 }
 assert.throws(()=>preparedRunRoot('/mnt/ml_storage/scratch/atlas-bi1c/run','unknown'));
 assert.equal(preparedRunRoot('/mnt/ml_storage/scratch/atlas-pc3/run','application'),'/mnt/ml_storage/scratch/atlas-pc3/run');
 assert.throws(()=>preparedRunRoot('/mnt/ml_storage/scratch/atlas-pc3/run','recovery'));
});
