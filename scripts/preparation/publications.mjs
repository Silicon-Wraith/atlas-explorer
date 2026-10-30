// The client can cancel before learning a response token. Identity owns that gap.
import { canonicalJson } from '../../src/shared/scene.js';
export function createPublications({ onRetire = () => {}, max = 16 } = {}) {
 const entries=new Map(),cancelled=new Set();
 const key=identity=>canonicalJson(identity);
 function retire(token){const value=entries.get(token);if(value){entries.delete(token);onRetire(value,token);}}
 return Object.freeze({
  get:token=>entries.get(token),values:()=>entries.values(),size:()=>entries.size,
  cancelled:identity=>cancelled.has(key(identity)),
  publish(token,value){if(cancelled.has(key(value.identity)))return false;if(entries.size>=max)throw Error('Publication capacity exceeded');entries.set(token,value);return true;},
  retire,
  cancel(identity){const id=key(identity);if(cancelled.size>=4096&&!cancelled.has(id))throw Error('Cancellation accounting capacity exceeded');cancelled.add(id);for(const[token,value]of entries)if(key(value.identity)===id)retire(token);},
  reset(){if(entries.size)throw Error('Unretired publications');cancelled.clear();},
  clear(){for(const token of entries.keys())retire(token);cancelled.clear();},
 });
}
