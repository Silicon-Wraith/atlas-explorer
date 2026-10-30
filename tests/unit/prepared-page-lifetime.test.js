import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ownPreviewPages } from '../../scripts/preparation/page-lifetime.mjs';

function rig() {
 const context=new EventEmitter(),browser=new EventEmitter(),all=new Set();let finishes=0;
 context.pages=()=>[...all];
 const add=()=>{const page=new EventEmitter();let closed=false;page.isClosed=()=>closed;page.close=()=>{closed=true;all.delete(page);page.emit('close');};all.add(page);context.emit('page',page);return page;};
 return{context,browser,add,get finishes(){return finishes;},start(){return ownPreviewPages({context,browser,onEmpty:()=>finishes++});}};
}
test('initial owned page can close while another page keeps the launcher alive',()=>{
 const r=rig(),first=r.add(),owner=r.start(),second=r.add();first.close();assert.equal(r.finishes,0);assert.equal(owner.snapshot().pages,1);
 second.close();assert.equal(r.finishes,1);r.browser.emit('disconnected');assert.equal(r.finishes,1);owner.dispose();
});
test('page lifetime ignores already closed pages and disposal removes every listener',()=>{
 const r=rig(),first=r.add();first.close();const owner=r.start();assert.equal(r.finishes,0);const next=r.add();owner.dispose();next.close();r.browser.emit('disconnected');
 assert.equal(r.finishes,0);assert.equal(r.context.listenerCount('page'),0);assert.equal(next.listenerCount('close'),0);
});
