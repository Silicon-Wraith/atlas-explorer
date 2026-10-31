// Bounded representation of an already resolved bilinear parent; no field evaluation.
import { createSpatialGrid } from '../preparation/spatial-grid.js';
export const PARENT_BODY_M = .1;
export const PARENT_TOLERANCE_M = .0005 * PARENT_BODY_M / 4;
export const PARENT_LIGHT = Object.freeze([-1/3, 2/3, -2/3]);
const ensure = (ok, message) => { if (!ok) throw new Error(message); };
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function createParentMesh(definition, heights) {
  const cells = definition.recipe.grid.cells, n = cells + 1, extent = Number(definition.recipe.grid.halfExtentM), step = 2 * extent / cells;
  ensure(cells >= 2 && cells <= 512 && cells % 2 === 0 && extent === .8 && heights.length === n*n && Array.from(heights).every(Number.isFinite), 'Unsupported bounded parent mesh profile');
  const at = (z,x) => heights[z*n+x], mid = cells/2, target = [0,at(mid,mid),0];
  let minH = Infinity, maxH = -Infinity, gx = 0, gz = 0, interpolationErrorM = 0;
  for (let z=0; z<n; z++) for (let x=0; x<n; x++) {
    const h=at(z,x); minH=Math.min(minH,h);maxH=Math.max(maxH,h);
    if (x<cells) gx=Math.max(gx,Math.abs(at(z,x+1)-h)/step);
    if (z<cells) gz=Math.max(gz,Math.abs(at(z+1,x)-h)/step);
    if (x<cells&&z<cells) interpolationErrorM=Math.max(interpolationErrorM,Math.abs(h-at(z,x+1)-at(z+1,x)+at(z+1,x+1))/4);
  }
  const normal = [-(at(mid,mid+1)-at(mid,mid-1))/(2*step),1,-(at(mid+1,mid)-at(mid-1,mid))/(2*step)];
  const length=Math.hypot(...normal), entry=normal.map(x=>.2*x/length), radius=.501*PARENT_BODY_M;
  const low=[0,2].map(k=>Math.max(0,Math.floor((entry[k]-radius+extent)/step))), high=[0,2].map(k=>Math.min(cells,Math.ceil((entry[k]+radius+extent)/step)));
  let footprintMax=-Infinity;
  for(let z=low[1];z<=high[1];z++)for(let x=low[0];x<=high[0];x++)footprintMax=Math.max(footprintMax,at(z,x));
  entry[1]=footprintMax+.6*PARENT_BODY_M;
  const bounds={min:[-extent,minH-1,-extent],max:[extent,maxH+1,extent]}, axes=[[1,0,0],[0,0,1],[0,1,0]];
  function grid(diameter) {
    const domain=[0,2,1].map(k=>[Math.ceil((bounds.min[k]+diameter-entry[k])/(.5*diameter)+1e-9),Math.floor((bounds.max[k]-diameter-entry[k])/(.5*diameter)-1e-9)]);
    ensure(domain.every(([a,b])=>a<=0&&b>=0),'Unsupported parent entry/grid');
    return createSpatialGrid({origin:entry,axes,diameter,domain});
  }
  const bodyGrid=grid(PARENT_BODY_M), viewGrid=grid(4*PARENT_BODY_M), top=[], solid=[], count=n*n;
  const boundary=new Map();
  function face(a,b,c) {
    top.push(a,b,c);
    for(const [u,v] of [[a,b],[b,c],[c,a]]) {const key=Math.min(u,v)+','+Math.max(u,v), old=boundary.get(key);if(old)boundary.delete(key);else boundary.set(key,[u,v]);}
  }
  for(let z=0;z<cells;z++)for(let x=0;x<cells;x++){const a=z*n+x,b=a+1,c=a+n,d=c+1;face(a,c,b);face(b,c,d);}
  for(const id of top)solid.push(id);
  for(let i=0;i<top.length;i+=3)solid.push(top[i]+count,top[i+2]+count,top[i+1]+count);
  for(const [a,b] of boundary.values())solid.push(b,a,a+count,b,a+count,b+count);
  const indices=new Uint32Array(top), closed=new Uint32Array(solid), representations={};
  for(const [kind,scale] of [['coarse',PARENT_BODY_M],['fine',PARENT_BODY_M/4],['view',4*PARENT_BODY_M]]) {
    const vertices=new Float32Array(count*2*3), displacement=[0,0,0];
    for(let z=0;z<n;z++)for(let x=0;x<n;x++)for(let bottom=0;bottom<2;bottom++) {
      const point=[-extent+x*step,bottom?bounds.min[1]:at(z,x),-extent+z*step], index=(bottom*count+z*n+x)*3;
      for(let k=0;k<3;k++) {vertices[index+k]=(point[k]-entry[k])/scale;if(!bottom)displacement[k]=Math.max(displacement[k],Math.abs(entry[k]+vertices[index+k]*scale-point[k]));}
    }
    const maxSurfaceErrorM=interpolationErrorM+displacement[1]+gx*displacement[0]+gz*displacement[2]+1e-12;
    ensure(maxSurfaceErrorM<=PARENT_TOLERANCE_M,'Parent mesh exceeds source error budget');
    let volume=0,maxCoordinate=1;
    for(const v of vertices)maxCoordinate=Math.max(maxCoordinate,Math.abs(v));
    for(let i=0;i<closed.length;i+=3) {
      const [a,b,c]=[closed[i],closed[i+1],closed[i+2]].map(id=>Array.from(vertices.subarray(id*3,id*3+3)));
      const bc=cross(b,c);volume+=a.reduce((s,v,k)=>s+v*bc[k],0)/6;
    }
    volume*=scale**3;ensure(Number.isFinite(volume)&&volume>0,'Parent solid winding/volume failed');
    representations[kind]={kind,scale,vertices,indices,solid:closed,volumeM3:volume,maxSurfaceErrorM,coordinateErrorM:displacement,
      auditSlackM:8*2**(Math.floor(Math.log2(maxCoordinate))-23)*scale};
  }
  return {bounds,entry,target,grid:bodyGrid,viewGrid,fineBounds:bounds,representations,cells,step,extent,interpolationErrorM,maxGradient:[gx,gz]};
}
