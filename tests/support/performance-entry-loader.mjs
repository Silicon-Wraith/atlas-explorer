// Offline entry-point test only. Replace the GPU runner with its actual P3
// import edge, leaving the entry point and performance implementation untouched.
// The old top-level-await cycle therefore still fails in a real Node process.
import { readFile } from 'node:fs/promises';

const runner = new URL('../space.mjs', import.meta.url).href;
export async function load(url, context, nextLoad) {
  if (url !== runner) return nextLoad(url, context);
  const source = await readFile(new URL(url), 'utf8');
  const match = source.match(/else if \(options\.group === 'performance'\) await \(await import\('([^']+)'\)\)\.runPerformance/);
  if (!match) throw new Error('cannot identify the actual Space runner performance import');
  return { format: 'module', shortCircuit: true, source: `
    import { writeFile } from 'node:fs/promises';
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== '--group' || args[1] !== 'performance' ||
        args[2] !== '--scene' || !['bulb','quaternion','menger'].includes(args[3])) throw Error('incorrect P3 routing');
    const { runPerformance } = await import(${JSON.stringify(match[1])});
    if (typeof runPerformance !== 'function') throw Error('missing P3 implementation');
    await writeFile(process.env.ATLAS_P3_ENTRY_RECEIPT, JSON.stringify({ scene: args[3], implementationLoaded: true }));
    console.log('PERFORMANCE_ENTRY_COMPLETE ' + args[3]);
  ` };
}
