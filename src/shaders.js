export const vertex = `#version 300 es
precision highp float;
out vec2 uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const common = `
precision highp float;
precision highp int;
precision highp sampler2D;
in vec2 uv;
out vec4 outputColor;
uniform vec2 u_resolution;
uniform vec2 u_center;
uniform float u_span;
uniform float u_exponent;
uniform int u_iterations;
uniform int u_length;
uniform sampler2D u_reference;
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x); }
vec4 reference(int i) { return texelFetch(u_reference, ivec2(i % 1024, i / 1024), 0); }
float smoothCount(int n, float logRadius) { return float(n)+1.0-log2(logRadius / 0.69314718056); }
void escaped(int n, vec2 z, float stripe, float previous, float logRadius) {
  float mu = smoothCount(n, logRadius);
  float s = mix(previous, stripe, clamp(fract(mu), 0.0, 1.0));
  outputColor = vec4(mu, s, 0.0, 1.0);
}
`;

export const directFragment = `#version 300 es
${common}
void main() {
  vec2 c = u_center + (gl_FragCoord.xy - .5*u_resolution) / u_resolution.x * u_span;
  float q = dot(c-vec2(.25,0.),c-vec2(.25,0.));
  if (q*(q+c.x-.25) <= .25*c.y*c.y || dot(c+vec2(1.,0.),c+vec2(1.,0.)) <= .0625) { outputColor=vec4(-1.,0.,0.,1.); return; }
  vec2 z=vec2(0.); float stripe=.5; float prev=.5;
  for (int n=1;n<=u_iterations;n++) {
    z=cmul(z,z)+c;
    prev=stripe;
    stripe=mix(stripe,.5+.5*sin(3.*atan(z.y,z.x)),.28);
    float r2=dot(z,z);
    if(r2>256.) { escaped(n,z,stripe,prev,.5*log(r2)); return; }
  }
  outputColor=vec4(-1.,0.,0.,1.);
}`;

export const perturbFragment = `#version 300 es
${common}
uniform vec2 u_step;
// A runtime value of 1 prevents driver reassociation from removing the
// intermediate rounding required by compensated float arithmetic.
uniform float u_round;
// Two float components retain the reference and perturbation precision across
// hardware backends. A single float can amplify rounding into visible errors.
vec2 addPair(vec2 a, vec2 b) {
  float s=(a.x+b.x)*u_round, v=(s-a.x)*u_round;
  float e=(a.x-(s-v)*u_round)*u_round+(b.x-v)*u_round+a.y+b.y;
  float hi=(s+e)*u_round;
  return vec2(hi,e-(hi-s)*u_round);
}
vec2 multiplyPair(vec2 a, vec2 b) {
  float p=(a.x*b.x)*u_round;
  // Bitwise splitting cannot be folded back into a single float by a driver.
  float ah=uintBitsToFloat(floatBitsToUint(a.x)&0xfffff000u);
  float bh=uintBitsToFloat(floatBitsToUint(b.x)&0xfffff000u);
  float al=a.x-ah, bl=b.x-bh;
  float e=(((ah*bh)*u_round-p)*u_round+ah*bl+al*bh)+al*bl+a.x*b.y+a.y*b.x;
  float hi=(p+e)*u_round;
  return vec2(hi,e-(hi-p)*u_round);
}
vec4 addWide(vec4 a, vec4 b) {
  vec2 r=addPair(a.xz,b.xz), i=addPair(a.yw,b.yw);
  return vec4(r.x,i.x,r.y,i.y);
}
vec4 multiplyWide(vec4 a, vec4 b) {
  vec2 r=addPair(multiplyPair(a.xz,b.xz),-multiplyPair(a.yw,b.yw));
  vec2 i=addPair(multiplyPair(a.xz,b.yw),multiplyPair(a.yw,b.xz));
  return vec4(r.x,i.x,r.y,i.y);
}
void main() {
  vec2 pixel=gl_FragCoord.xy-.5*u_resolution;
  vec2 cr=multiplyPair(vec2(pixel.x,0.),u_step), ci=multiplyPair(vec2(pixel.y,0.),u_step);
  vec4 dc=vec4(cr.x,ci.x,cr.y,ci.y);
  vec4 d=vec4(0.); int m=0;
  float stripe=.5; float prev=.5;
  for(int n=1;n<=u_iterations;n++) {
    d=addWide(addWide(2.*multiplyWide(reference(m),d),multiplyWide(d,d)),dc);
    m++;
    vec4 wideZ=addWide(reference(m),d);
    vec2 z=wideZ.xy+wideZ.zw;
    float r2=dot(z,z);
    prev=stripe;
    stripe=mix(stripe,.5+.5*sin(3.*atan(z.y,z.x)),.28);
    if(r2>256.) { escaped(n,z,stripe,prev,.5*log(r2)); return; }
    if(r2<dot(d.xy,d.xy) || m>=u_length-1) { d=wideZ; m=0; }
  }
  outputColor=vec4(-1.,0.,0.,1.);
}`;

// Extended-range perturbation. The exponent lives separately from the float
// mantissa, so coordinate deltas do not collapse at 1e-38 (or 1e-308).
export const extendedFragment = `#version 300 es
${common}
vec3 norm(vec2 m,float e) {
  float a=max(abs(m.x),abs(m.y));
  if(a==0.) return vec3(0.);
  float shift=floor(log2(a));
  return vec3(m*exp2(-shift),e+shift);
}
vec3 add(vec3 a,vec3 b) {
  if(all(equal(a.xy,vec2(0.)))) return b;
  if(all(equal(b.xy,vec2(0.)))) return a;
  float e=max(a.z,b.z);
  return norm(a.xy*exp2(max(-120.,a.z-e))+b.xy*exp2(max(-120.,b.z-e)),e);
}
vec3 mul(vec3 a,vec3 b) { return norm(cmul(a.xy,b.xy),a.z+b.z); }
float logMagnitude(vec3 a) { if(all(equal(a.xy,vec2(0.)))) return -1e30; return .5*log2(dot(a.xy,a.xy))+a.z; }
void main() {
  vec3 dc=norm((gl_FragCoord.xy-.5*u_resolution)/u_resolution.x*u_span,u_exponent);
  vec3 d=vec3(0.); int m=0;
  float stripe=.5; float prev=.5;
  for(int n=1;n<=u_iterations;n++) {
    vec3 ref=reference(m).xyz;
    vec3 linear=mul(ref,d); linear.z+=1.;
    d=add(add(linear,mul(d,d)),dc);
    m++;
    vec3 z=add(reference(m).xyz,d);
    float logR=logMagnitude(z);
    prev=stripe;
    stripe=mix(stripe,.5+.5*sin(3.*atan(z.y,z.x)),.28);
    if(logR>4.) { escaped(n,z.xy,stripe,prev,logR*.69314718056); return; }
    if(logR<logMagnitude(d) || m>=u_length-1) { d=z; m=0; }
  }
  outputColor=vec4(-1.,0.,0.,1.);
}`;

export const colorFragment = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 uv;
out vec4 outputColor;
uniform sampler2D u_field;
uniform sampler2D u_palette;
uniform float u_phase;
uniform float u_frequency;
uniform float u_relief;
void main() {
  vec2 field=texture(u_field,uv).xy;
  if(field.x<0.) { outputColor=vec4(.016,.028,.044,1.); return; }
  float t=fract(sqrt(max(0.,field.x))*.055*u_frequency+u_phase);
  vec3 c=texture(u_palette,vec2(t,.5)).rgb;
  c*=1.-u_relief*.28+u_relief*.55*field.y;
  float grain=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5;
  outputColor=vec4(c+grain/255.,1.);
}`;
