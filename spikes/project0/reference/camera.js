export const add = (a,b) => a.map((v,i) => v+b[i]);
export const scale = (a,k) => a.map(v => v*k);
export const dot = (a,b) => a.reduce((s,v,i) => s+v*b[i],0);

export function norm(a) {
  const length = Math.hypot(...a);
  if (!(length > 0) || !Number.isFinite(length)) {
    throw new RangeError('invalid direction');
  }
  return scale(a,1/length);
}

export const cross = (a,b) => [
  a[1]*b[2]-a[2]*b[1],
  a[2]*b[0]-a[0]*b[2],
  a[0]*b[1]-a[1]*b[0]
];

export function checkRay(ray) {
  if (
    [ray.origin,ray.direction].some(v =>
      !Array.isArray(v) || v.length !== 3 ||
      v.some(x => !Number.isFinite(x))
    ) ||
    !(Math.hypot(...ray.direction) > 0)
  ) {
    throw new TypeError('finite ray with nonzero direction required');
  }
}

export function ray(camera,W,H,i,j) {
  if (
    ![W,H].every(n => Number.isInteger(n) && n > 0) ||
    !Number.isInteger(i) || !Number.isInteger(j) ||
    i < 0 || i >= W || j < 0 || j >= H
  ) {
    throw new RangeError('invalid pixel');
  }
  const f = norm(add(camera.target,scale(camera.origin,-1)));
  const r = norm(cross(f,[0,0,1]));
  const u = cross(r,f);
  const h = Math.tan(Math.PI/6);
  const sx = (2*(i+.5)/W-1)*h*W/H;
  const sy = (1-2*(j+.5)/H)*h;
  return {
    origin: [...camera.origin],
    direction: norm(add(f,add(scale(r,sx),scale(u,sy))))
  };
}

export function rotateZ(v,a) {
  return [
    Math.cos(a)*v[0]-Math.sin(a)*v[1],
    Math.sin(a)*v[0]+Math.cos(a)*v[1],
    v[2]
  ];
}

export function pose(name,time,anchor) {
  const base = { origin: [1.92,-1.44,.7], target: [0,0,0] };
  if (name === 'sphere' || (name === 'bulb-overview' && time === 0)) {
    return base;
  }
  if (name === 'bulb-overview') {
    const theta = Math.atan2(-1.44,1.92)+2*Math.PI*time/30;
    return {
      origin: [2.4*Math.cos(theta),2.4*Math.sin(theta),.7],
      target: [0,0,0]
    };
  }

  const distances = {
    'bulb-detail-0.05': .05,
    'bulb-detail-0.005': .005,
    'bulb-stress': .005
  };
  if (!(name in distances)) throw new Error('unknown view');
  const beta = name === 'bulb-stress'
    ? 0
    : Math.PI/18*Math.sin(2*Math.PI*time/10);
  return {
    origin: add(anchor.A,rotateZ(scale(anchor.D,-distances[name]),beta)),
    target: [...anchor.A]
  };
}

export function burstRequests() {
  return Array.from({ length: 400 }, (_,id) => {
    const burst = Math.floor(id/20);
    const index = id%20;
    const theta = Math.atan2(-1.44,1.92)+(id+1)*Math.PI/180;
    return {
      id, burst, index,
      offsetMs: burst*(19*8+1000)+index*8,
      camera: {
        origin: [2.4*Math.cos(theta),2.4*Math.sin(theta),.7],
        target: [0,0,0]
      }
    };
  });
}
