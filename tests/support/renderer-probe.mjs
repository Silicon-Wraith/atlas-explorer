import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Test-only observation/fault injection at private renderer boundaries. Import
// the real module body and dependencies; never add inspection hooks to production.
// publishable() independently rejects old frames, so events alone cannot detect a
// historical call to publish(). A summary currently makes validatePublication()
// infallible; injected exceptions exercise its caller's failure path explicitly.
export async function rendererWithProbe() {
  const url = new URL('../../src/space/render/renderer.js', import.meta.url);
  let source = await readFile(url, 'utf8');
  const edits = [
    ['export function createSpaceRenderer({', 'export function createSpaceRenderer({ testProbe,'],
    ['function validatePublication(record, meta) {', 'function validatePublication(record, meta) {\n    testProbe?.validatePublication?.(record, meta);'],
    ['function publish(record, meta, display, { emitPublication = true } = {}) {', 'function publish(record, meta, display, { emitPublication = true } = {}) {\n    testProbe?.publish?.(record, meta);'],
    ['return Object.freeze({ prepare, render, pick,', 'return Object.freeze({ get published() { return published; }, prepare, render, pick,'],
  ];
  for (const [before, after] of edits) {
    assert.equal(source.split(before).length, 2, `unique renderer probe boundary: ${before}`);
    source = source.replace(before, after);
  }
  source = source.replace(/from '(\.[^']+)'/g, (_, path) => `from '${new URL(path, url).href}'`);
  return (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)).createSpaceRenderer;
}
