// Inert imported-world codec; production preparation does not import this module.
import {canonicalJson,deepFreeze,isPlainObject} from '../../shared/scene.js';
import {sha256Canonical} from './source-recipe.js';

export const SOURCE_FILES=deepFreeze(['native/h1lib.py','native/sampling_r0.py','native/descendant_world.py','native/dek.py','native/pert.py','native/fkern.py']);
export const IMPORTED_FIELD=deepFreeze({
  "formula": "z*z+c",
  "derivative": "before-z",
  "escapeRadius": "1000000",
  "distance": "half-milnor-Dc-divide-U",
  "unitsPerMetre": "7.8125e-07",
  "initialIterations": 32768,
  "recheckIterations": 131072,
  "referenceOrbitIterations": 131072,
  "interior": "strict-cardioid-period2",
  "interiorMargin": "0.000000001",
  "interiorDistanceM": "0",
  "coordinateArithmetic": "legacy-binary64-source-bound",
  "unknown": "nan-no-surface",
  "taper": {
    "flatUntil": "0.8",
    "zeroFrom": "1",
    "width": "0.2",
    "shape": "half-plus-half-cosine"
  },
  "carve": "-A*w*exp(-D/L)",
  "cap": "htop*w",
  "gpuFallback": "pert-status2-or-nonfinite-status1-to-direct-keep-finite1-or3",
  "parentInterpolation": {
    "method": "bilinear",
    "axes": "u,v",
    "indexing": "ij",
    "outside": "nan-unknown"
  },
  "importedParent": {
    "profile": "legacy-ta-tilted-r0",
    "coordinateArithmetic": "legacy-float-grid",
    "unknown": "zero-substitution-before-TA",
    "bisections": 36
  }
});

export class RecursiveRecipeError extends Error {
 constructor(message) { super(message); this.name='RecursiveRecipeError'; this.code='invalid-recursive-recipe'; }
}
const fail=message=>{throw new RecursiveRecipeError(message);};
function object(value,keys,name) {
 if(!isPlainObject(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))fail(name+' requires exactly '+keys.join(', '));
}
function decimal(value,name,{positive=false,finite=false}={}) {
 if(typeof value!=='string'||value.length>4096)fail(name+' must be a bounded ASCII decimal');
 const m=value.match(/^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?)(\d+))?$/i);
 if(!m||!(m[2]||m[3])||m[2].length+(m[3]||'').length>1024)fail(name+' exceeds decimal grammar/digit budget');
 const exponent=(m[5]||'0').replace(/^0+(?=\d)/,'');
 if(exponent.length>4||Number(exponent)>2048)fail(name+' exceeds exponent budget');
 if(positive&&(m[1]==='-'||!/[1-9]/.test(m[2]+(m[3]||''))))fail(name+' must be positive');
 if(finite&&(!Number.isFinite(Number(value))||(positive&&Number(value)<=0)))fail(name+' outside binary64 range');
}
function vector(value,name) {
 if(!Array.isArray(value)||value.length!==3)fail(name+' requires three decimals');
 value.forEach(v=>decimal(v,name,{finite:true}));return value.map(Number);
}
function frame(value) {
 object(value,['origin','u','v','n'],'frame');vector(value.origin,'frame.origin');
 const vs=['u','v','n'].map(k=>vector(value[k],'frame.'+k)),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
 for(let i=0;i<3;i++){
  if(Math.abs(Math.sqrt(dot(vs[i],vs[i]))-1)>1e-12)fail('frame norm');
  for(let j=i+1;j<3;j++)if(Math.abs(dot(vs[i],vs[j]))>1e-12)fail('frame orthogonality');
 }
}
function digest(value) { if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))fail('invalid SHA-256'); }
function id(value) { if(typeof value!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(value))fail('invalid component id'); }
export function createRecursiveRecipe(value) {
 object(value,['schema','schemaVersion','generator','field','sourceBindings','parentGrid','components','descendants','composition'],'recipe');
 if(value.schema!=='atlas.generation.recursive-recipe'||value.schemaVersion!==1)fail('unsupported recursive schema/version');
 object(value.generator,['id','version'],'generator');
 if(value.generator.id!=='atlas.surface-descendant'||value.generator.version!=='imported-legacy-r1')fail('unsupported generator');
 if(canonicalJson(value.field)!==canonicalJson(IMPORTED_FIELD))fail('unsupported field rules');
 if(!Array.isArray(value.sourceBindings)||value.sourceBindings.length!==SOURCE_FILES.length)fail('six evaluator bindings required');
 value.sourceBindings.forEach((b,i)=>{object(b,['file','sha256'],'source binding');if(b.file!==SOURCE_FILES[i])fail('unsupported evaluator source');digest(b.sha256);});
 const grid=value.parentGrid;object(grid,['file','sha256','arrays'],'parentGrid');
 if(grid.file!=='base.npz')fail('imported parent file must be base.npz');digest(grid.sha256);
 object(grid.arrays,['g','t0','o'],'parent arrays');
 for(const name of ['g','t0','o']){
  const a=grid.arrays[name];object(a,['dtype','shape','order','sha256'],'array');
  if(a.dtype!=='<f8'||a.order!=='C'||!Array.isArray(a.shape)||a.shape.some(n=>!Number.isSafeInteger(n)||n<1||n>4096))fail('unsupported array layout');digest(a.sha256);
 }
 const {g,t0,o}=grid.arrays;
 if(g.shape.length!==1||g.shape[0]<2||o.shape.length!==1||o.shape[0]!==3||t0.shape.length!==2||t0.shape.some(n=>n!==g.shape[0])||t0.shape[0]*t0.shape[1]*8>32*1024*1024)fail('inconsistent parent shape');
 if(!Array.isArray(value.components)||!value.components.length||value.components.length>32)fail('component budget');
 const seen=new Set();
 value.components.forEach((c,i)=>{
  object(c,['id','parent','source','frame','halfSupportM','amplitudeM','lengthM','capM'],'component');id(c.id);
  if(seen.has(c.id)||(i===0?c.parent!==null:!seen.has(c.parent)))fail('invalid ordered lineage');seen.add(c.id);
  object(c.source,['re','im'],'source');decimal(c.source.re,'source.re');decimal(c.source.im,'source.im');frame(c.frame);
  for(const k of ['halfSupportM','amplitudeM','lengthM'])decimal(c[k],k,{positive:true,finite:true});
  if(i===0){if(c.capM!==null)fail('parent must be uncapped');}else decimal(c.capM,'capM',{positive:true,finite:true});
 });
 if(!Array.isArray(value.descendants)||value.descendants.length>32)fail('descendant budget');
 const componentIds=new Set(seen);
 value.descendants.forEach(d=>{
  object(d,['id','parent','chartCentreM','halfSupportM','amplitudeM','sourceScale','rule'],'descendant');id(d.id);
  if(seen.has(d.id)||!componentIds.has(d.parent)||d.rule!=='surface-descendant-r1')fail('invalid descendant lineage/rule');seen.add(d.id);
  if(!Array.isArray(d.chartCentreM)||d.chartCentreM.length!==2)fail('chart centre requires two decimals');
  d.chartCentreM.forEach(x=>decimal(x,'chartCentreM',{finite:true}));
  for(const k of ['halfSupportM','amplitudeM','sourceScale'])decimal(d[k],k,{positive:true,finite:true});
 });
 object(value.composition,['operator','root','cutters'],'composition');
 if(value.composition.operator!=='ordered-subtraction-of-capped-graph-intervals-r1'||value.composition.root!==value.components[0].id||canonicalJson(value.composition.cutters)!==canonicalJson(value.components.slice(1).map(c=>c.id)))fail('unsupported composition/order');
 return deepFreeze(JSON.parse(canonicalJson(value)));
}
export const recursiveRecipeKey=value=>sha256Canonical(createRecursiveRecipe(value));
