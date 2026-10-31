// Inert experimental source codec; the current application does not import it.
import { canonicalJson, deepFreeze, isPlainObject } from '../../shared/scene.js';

export const SOURCE_PROFILE = deepFreeze({formula:'z*z+c',escapeRadius:'1000000',derivative:'before-z',
 distance:'half-milnor',interior:'strict-cardioid-period2',interiorMargin:'0.000000001',interiorDistanceM:'0',
 coordinateMapping:'C+U*(x-i*z)',coordinateArithmetic:'exact-rational-round-once-binary64',
 distanceArithmetic:'binary64-Dc-divide-U',heightArithmetic:'binary64-subtract-multiply-subtract',
 unknown:'unresolved-no-surface',failed:'failed-no-surface',outsideDomain:'undefined',
 interpolation:'bilinear',array:'little-endian-float64-C',negativeZero:'positive'});
export class SourceRecipeError extends Error {
 constructor(message) { super(message); this.name='SourceRecipeError'; this.code='invalid-source-recipe'; }
}
function object(value,keys,name) {
 if(!isPlainObject(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))throw new SourceRecipeError(name+' requires exactly '+keys.join(', '));
}
function decimal(value,name,positive=false) {
 if(typeof value!=='string'||value.length>400016)throw new SourceRecipeError(name+' must be a bounded decimal string');
 const m=value.match(/^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?)(\d+))?$/i);
 if(!m||!(m[2]||m[3]))throw new SourceRecipeError(name+' must be a decimal string');
 if(m[2].length+(m[3]||'').length>200000)throw new SourceRecipeError(name+' exceeds the digit budget');
 const e=(m[5]||'0').replace(/^0+(?=\d)/,'');
 if(e.length>6||Number(e)>200000)throw new SourceRecipeError(name+' exceeds the exponent budget');
 if(positive&&(m[1]==='-'||!/[1-9]/.test(m[2]+(m[3]||''))))throw new SourceRecipeError(name+' must be positive');
}
export function createSourceRecipe(value) {
 object(value,['schema','schemaVersion','generator','source','grid','transfer','numerics'],'recipe');
 if(value.schema!=='atlas.generation.source-recipe'||value.schemaVersion!==1)throw new SourceRecipeError('unsupported recipe schema/version');
 object(value.generator,['id','version'],'generator');
 if(value.generator.id!=='atlas.mandelbrot-parent-chart'||value.generator.version!=='affine-distance-r1')throw new SourceRecipeError('unsupported generator');
 object(value.source,['re','im','unitsPerMetre'],'source');
 decimal(value.source.re,'source.re');decimal(value.source.im,'source.im');decimal(value.source.unitsPerMetre,'source.unitsPerMetre',true);
 object(value.grid,['halfExtentM','cells'],'grid');decimal(value.grid.halfExtentM,'grid.halfExtentM',true);
 if(!Number.isSafeInteger(value.grid.cells)||value.grid.cells<1||value.grid.cells>512)throw new SourceRecipeError('grid.cells must be an integer in [1,512]');
 object(value.transfer,['referenceDistanceM','referenceHeightM','slope'],'transfer');
 decimal(value.transfer.referenceDistanceM,'referenceDistanceM');decimal(value.transfer.referenceHeightM,'referenceHeightM');decimal(value.transfer.slope,'slope',true);
 object(value.numerics,['maxIterations','roundingDenominator'],'numerics');
 if(!Number.isSafeInteger(value.numerics.maxIterations)||value.numerics.maxIterations<1||value.numerics.maxIterations>131072||value.numerics.roundingDenominator!==1024)throw new SourceRecipeError('unsupported numerical budget');
 return deepFreeze(JSON.parse(canonicalJson(value)));
}
export async function sha256Canonical(value) {
 const bytes=new TextEncoder().encode(canonicalJson(value));
 const hash=await globalThis.crypto.subtle.digest('SHA-256',bytes);
 return 'sha256:'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
export const sourceRecipeKey=value=>sha256Canonical(createSourceRecipe(value));
export async function createParentDefinition(value,logicalSha256) {
 const recipe=createSourceRecipe(value);
 if(typeof logicalSha256!=='string'||!/^[a-f0-9]{64}$/.test(logicalSha256))throw new SourceRecipeError('expected logical array SHA-256');
 const n=recipe.grid.cells+1;
 const body={schema:'atlas.generation.parent-definition',schemaVersion:1,recipe,profile:SOURCE_PROFILE,
  surface:{file:'height.npy',logicalSha256,dtype:'<f8',shape:[n,n],order:'C',axisOrder:'z,x'}};
 return deepFreeze({...body,definitionKey:await sha256Canonical(body)});
}
