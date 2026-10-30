import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeObservedWasm, observedWasmCapacity } from '../../src/space/preparation/wasm-memory.js';

test('prepared engine re-entry reuses initialization and reports retained growing capacity',async()=>{
 const bytes=new Uint8Array([0,97,115,109,1,0,0,0,5,3,1,0,1,7,10,1,6,109,101,109,111,114,121,2,0]);
 const original=WebAssembly.instantiate,before=observedWasmCapacity();let instance,calls=0;
 const engine={async init(){calls++;instance=(await WebAssembly.instantiate(bytes)).instance;}};
 const first=initializeObservedWasm(engine),again=initializeObservedWasm(engine);assert.equal(first,again);const capacity=await first;
 assert.equal(calls,1);assert.equal(capacity.bytes(),65536);assert.equal(WebAssembly.instantiate,original);assert.equal(observedWasmCapacity(),before+65536);
 instance.exports.memory.grow(1);assert.equal((await initializeObservedWasm(engine)).bytes(),131072);assert.equal(calls,1);assert.equal(observedWasmCapacity(),before+131072);
});
