// Registered P3 entry point. The runner imports the inert implementation directly.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export * from './support/space-performance.mjs';

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--scene'||!['bulb','quaternion','menger'].includes(args[1]))throw Error('usage: node tests/space-performance.mjs --scene bulb|quaternion|menger');
  process.argv=[process.argv[0],process.argv[1],'--group','performance','--scene',args[1]];
  await import('./space.mjs');
}
