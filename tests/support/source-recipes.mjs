export function sourceCase(name='A') {
 const recipe={schema:'atlas.generation.source-recipe',schemaVersion:1,
  generator:{id:'atlas.mandelbrot-parent-chart',version:'affine-distance-r1'},
  source:{re:'-0.743334490810060138125000',im:'0.131807237950087553359375',unitsPerMetre:'0.00000078125'},
  grid:{halfExtentM:'0.8',cells:64},
  transfer:{referenceDistanceM:'6.8',referenceHeightM:'89.06014237811313',slope:'2.1600443105285194'},
  numerics:{maxIterations:131072,roundingDenominator:1024}};
 if(name==='B')recipe.source={...recipe.source,re:'0.275291862284820031484375',im:'0.00688857589984350546875'};
 else if(name==='unknown'){recipe.source={...recipe.source,re:'-0.122561166876',im:'0.744861766619'};recipe.grid={halfExtentM:'0.000001',cells:2};}
 else if(name==='deep')recipe.source.unitsPerMetre='1e-40';
 else if(name!=='A')throw Error('Unknown frozen source case');
 return recipe;
}
