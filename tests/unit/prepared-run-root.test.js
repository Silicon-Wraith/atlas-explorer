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

test('MD2.A ownership and maintained suites reject escaped and look-alike evidence roots',()=>{
 for(const role of ['application','session','files','http','recovery','generation']){
  assert.equal(preparedRunRoot('/mnt/ml_storage/scratch/atlas-md2a/run',role),'/mnt/ml_storage/scratch/atlas-md2a/run');
  for(const root of ['/mnt/ml_storage/scratch/atlas-md2ax/run','/mnt/ml_storage/scratch/atlas-md2a/../outside','/tmp/atlas-md2a/run'])assert.throws(()=>preparedRunRoot(root,role));
 }
});

test('MD2.A2.2 evidence accepts its exact namespace across maintained roles and refuses lookalikes',()=>{
 for(const role of ['application','session','files','http','recovery','generation','source']){
  assert.equal(preparedRunRoot('/mnt/ml_storage/scratch/atlas-md2a22/run',role),'/mnt/ml_storage/scratch/atlas-md2a22/run');
  for(const root of ['/mnt/ml_storage/scratch/atlas-md2a22x/run','/mnt/ml_storage/scratch/atlas-md2a22/../outside','/tmp/atlas-md2a22/run'])assert.throws(()=>preparedRunRoot(root,role));
 }
});
