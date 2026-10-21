import {
  add, scale, dot, norm, rotateZ, checkRay
} from './camera.js';

export function sphereInterval(o,d,radius) {
  checkRay({ origin: o, direction: d });
  const a = dot(d,d);
  const b = dot(o,d);
  const c = dot(o,o)-radius*radius;
  const disc = b*b-a*c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  return [(-b-root)/a,(-b+root)/a];
}

export function slab(o,d,box) {
  let lo = -Infinity;
  let hi = Infinity;
  for (let i=0; i<3; i++) {
    const a = box.c[i]-box.h[i];
    const b = box.c[i]+box.h[i];
    if (d[i] === 0) {
      if (o[i] < a || o[i] > b) return null;
      continue;
    }
    const x = (a-o[i])/d[i];
    const y = (b-o[i])/d[i];
    lo = Math.max(lo,Math.min(x,y));
    hi = Math.min(hi,Math.max(x,y));
    if (lo > hi) return null;
  }
  return [lo,hi];
}

export function boxDistance(p,box) {
  return Math.hypot(...p.map((v,i) =>
    Math.max(Math.abs(v-box.c[i])-box.h[i],0)
  ));
}

export function menger(depth) {
  if (![1,2].includes(depth)) {
    throw new RangeError('fixture depth must be 1 or 2');
  }
  let boxes = [{ c: [0,0,0], h: [1,1,1] }];
  for (let level=0; level<depth; level++) {
    const next = [];
    for (const box of boxes) {
      for (let x=0; x<3; x++) for (let y=0; y<3; y++) for (let z=0; z<3; z++) {
        const index = [x,y,z];
        if (index.filter(i => i === 1).length > 1) continue;
        const h = box.h.map(v => v/3);
        next.push({
          c: box.c.map((v,i) => v+2*h[i]*(index[i]-1)),
          h
        });
      }
    }
    boxes = next;
  }
  return boxes;
}

export function unionOracle(o,d,boxes) {
  checkRay({ origin: o, direction: d });
  const intervals = boxes.map(box => ({
    box, interval: slab(o,d,box)
  })).filter(x =>
    x.interval && x.interval[1] >= Math.max(0,x.interval[0])
  ).sort((a,b) => a.interval[0]-b.interval[0]);

  if (!intervals.length) {
    return { status: 'miss', t: null, excluded: false, intervals: [] };
  }

  const merged = [];
  for (const { interval: [a,b] } of intervals) {
    const last = merged.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1],b);
    else merged.push([a,b]);
  }

  const t = Math.max(0,merged[0][0]);
  const p = add(o,scale(d,t));
  const box = intervals[0].box;
  const nearFaces = p.filter((v,i) =>
    Math.abs(Math.abs(v-box.c[i])-box.h[i]) < 1e-3
  ).length;
  return {
    status: 'hit', t, excluded: nearFaces >= 2, intervals: merged
  };
}

export const boxFixture = { c: [0,0,0], h: [1,.5,.25] };

export function analytic(name,boxes=[]) {
  if (name === 'sphere') {
    return {
      bound: (o,d) => sphereInterval(o,d,2),
      distance: p => Math.hypot(...p)-1
    };
  }
  if (name === 'box') {
    return {
      bound: (o,d) => sphereInterval(o,d,2),
      distance: p => boxDistance(rotateZ(p,-Math.PI/6),boxFixture)
    };
  }
  if (!['menger-1','menger-2'].includes(name) || !boxes.length) {
    throw new Error('unknown analytic fixture');
  }
  return {
    bound: (o,d) => slab(o,d,{ c: [0,0,0], h: [1,1,1] }),
    distance: p => Math.min(...boxes.map(b => boxDistance(p,b)))
  };
}

export function analyticFixtures() {
  const fixtures = {};
  for (const [name,L,nx,ny] of [
    ['sphere',1,25,25],
    ['box',.25,31,21],
    ['menger-1',1/3,41,41],
    ['menger-2',1/9,41,41]
  ]) {
    const boxes = name.startsWith('menger')
      ? menger(Number(name.at(-1)))
      : [];
    const rays = [];

    for (let j=0; j<ny; j++) for (let i=0; i<nx; i++) {
      const u = name === 'sphere' ? (i-12)/10
        : name === 'box' ? (i-15)/10
        : -1.2+2.4*i/40;
      const v = name === 'sphere' ? (j-12)/10
        : name === 'box' ? (j-10)/20
        : -1.2+2.4*j/40;
      const origin = [u,-4,v];
      const direction = name.startsWith('menger')
        ? norm([.3,1,.2])
        : [0,1,0];

      let reference;
      if (name === 'sphere') {
        const r2 = u*u+v*v;
        const hit = r2 < 1;
        reference = {
          status: hit ? 'hit' : 'miss',
          t: hit ? 4-Math.sqrt(1-r2) : null,
          excluded: Math.abs(Math.sqrt(r2)-1) < .02
        };
      } else {
        reference = unionOracle(
          name === 'box' ? rotateZ(origin,-Math.PI/6) : origin,
          name === 'box' ? rotateZ(direction,-Math.PI/6) : direction,
          name === 'box' ? [boxFixture] : boxes
        );
      }

      rays.push({
        id: rays.length,
        origin, direction,
        effectiveOrigin: origin.map(Math.fround),
        effectiveDirection: direction.map(Math.fround),
        reference
      });
    }
    fixtures[name] = { L, boxes, rays };
  }
  return fixtures;
}
