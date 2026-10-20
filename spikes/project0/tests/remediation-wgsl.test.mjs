// spikes/project0/tests/remediation-wgsl.test.mjs — the G5-A WGSL change set is exactly the preregistered one (rev 2 §2.1–§2.2, §2.6):
// both qjulia call sites use the compensated update, the helper source follows the fixed evaluation order, the Mandelbulb is untouched, the
// validation entry points share the qualification module and pipelines, and the supplementary inputs are packed bit-exactly. CPU only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { supplementaryInputs } from '../remediation/inputs.js';
import { supplementary } from '../remediation/validate.mjs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const arithmetic = read('../gpu/arithmetic.wgsl'), fields = read('../gpu/fields.wgsl'), webgpu = read('../gpu/webgpu.js'), checks = read('../browser/drivers/checks.js');
const body = (src, name) => { const i = src.indexOf(`fn ${name}(`); assert.ok(i >= 0, `fn ${name}`); let depth = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') depth++; if (src[k] === '}' && --depth === 0) return src.slice(j + 1, k).replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').trim(); } };

test('both quaternion call sites use the compensated update, and the old qsq(q) + C form is gone', () => {
  assert.equal((arithmetic.match(/q = q_update\(q, c\);/g) ?? []).length, 2);
  assert.ok(!/qsq\(q\)\s*\+\s*c/.test(arithmetic));
  assert.ok(body(arithmetic, 'qjulia_plane').includes('q = q_update(q, c);') && body(arithmetic, 'qjulia_offplane').includes('q = q_update(q, c);'));
});

test('the helpers follow the preregistered evaluation order with typed f32 intermediates, ordinary multiplication and fma(a, b, -p)', () => {
  assert.equal(body(arithmetic, 'two_product_fma'), 'let p: f32 = a * b; let e: f32 = fma(a, b, -p); return F2(p, e);');
  assert.equal(body(arithmetic, 'two_sum'), 'let s: f32 = a + b; let v: f32 = s - a; let aa: f32 = s - v; let da: f32 = a - aa; let db: f32 = b - v; let e: f32 = da + db; return F2(s, e);');
  assert.equal(body(arithmetic, 'dot2_start'), 'return two_product_fma(x, y);');
  assert.equal(body(arithmetic, 'dot2_step'), 'let hr: F2 = two_product_fma(x, y); let pq: F2 = two_sum(acc.hi, hr.hi); let t: f32 = pq.lo + hr.lo; let s: f32 = acc.lo + t; return F2(pq.hi, s);');
  assert.equal(body(arithmetic, 'dot2_end'), 'return acc.hi + acc.lo;');
  assert.equal(body(arithmetic, 'q_update'), ['let a: f32 = q.x; let b: f32 = q.y; let qc: f32 = q.z; let d: f32 = q.w;',
    'var re: F2 = dot2_start(a, a); re = dot2_step(re, -b, b); re = dot2_step(re, -qc, qc); re = dot2_step(re, -d, d); re = dot2_step(re, c.x, 1.0);',
    'var ci: F2 = dot2_start(a, b); ci = dot2_step(ci, b, a); ci = dot2_step(ci, c.y, 1.0);',
    'var cj: F2 = dot2_start(a, qc); cj = dot2_step(cj, qc, a); cj = dot2_step(cj, c.z, 1.0);',
    'var ck: F2 = dot2_start(a, d); ck = dot2_step(ck, d, a); ck = dot2_step(ck, c.w, 1.0);',
    'let r0: f32 = dot2_end(re); let r1: f32 = dot2_end(ci); let r2: f32 = dot2_end(cj); let r3: f32 = dot2_end(ck); return vec4f(r0, r1, r2, r3);'].join(' '));
  assert.ok(!/fma\([^)]*-0\.0\)/.test(arithmetic), 'no fma(a, b, -0.0) wrapper (rev 2 §2.2)');
});

test('the Mandelbulb recurrence, escape tests and output layout are untouched', () => {
  assert.equal(body(fields, 'bulb_eval').includes('z = w + p;'), true);
  assert.ok(body(arithmetic, 'qjulia_plane').includes('if (r > 2.0) { out = vec4u(ST_ESCAPED, n, bitcast<u32>(log(r)), 0u); break; }'));
  assert.ok(body(arithmetic, 'qjulia_offplane').includes('outputs[n] = bitcast<vec4u>(q);'));
});

test('the validation entry points live in the qualification module and are prepared with the same descriptor shape', () => {
  for (const e of ['remediation_primitives', 'remediation_dot', 'remediation_updates']) { assert.ok(arithmetic.includes(`fn ${e}(`)); assert.ok(webgpu.includes(`'${e}'`)); }
  assert.match(webgpu, /\['bulb_samples', 'qjulia_plane', 'qjulia_offplane', 'derivative_policy', 'remediation_primitives', 'remediation_dot', 'remediation_updates'\]\.map\(e => \[e, \{ module: arithmetic, entryPoint: e \}\]\)/);
  assert.ok(checks.includes("raw: { orbit: Array.from(orbit), orbitWords: Array.from(new Uint32Array(orbit.buffer)), form: COMPENSATED_FORM, supplementary"), 'the off-plane slot carries the qualification words, the form and the supplementary readbacks');
});

test('the supplementary inputs are packed bit-exactly as runtime words', () => {
  const supp = supplementary(), packed = supplementaryInputs(supp);
  const u = x => new Uint32Array(x.data.buffer);
  assert.equal(packed.primitives.n, 1371); assert.equal(packed.updates.n, 1024); assert.equal(packed.dots.n, 1);
  supp.primitives.inputs.forEach(([a, b], i) => { assert.equal(u(packed.primitives)[4 * i], parseInt(a, 16)); assert.equal(u(packed.primitives)[4 * i + 1], parseInt(b, 16)); });
  assert.deepEqual(Array.from(u(packed.updates).slice(8, 16)), supp.updates.inputs[1].map(h => parseInt(h, 16)));
  assert.ok(u(packed.primitives).includes(0x80000000) === supp.primitives.inputs.flat().includes('80000000'));
});

test('the driver declares the same compensated-form identifier the read-time validation requires', async () => {
  const { COMPENSATED_FORM } = await import('../remediation/validate.mjs');
  assert.ok(checks.includes(`const COMPENSATED_FORM = '${COMPENSATED_FORM}';`));
  assert.ok(checks.includes("raw: { words: Array.from(plane), form: COMPENSATED_FORM }"));
});
