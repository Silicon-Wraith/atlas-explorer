// Executor only: fresh browser/GPU process plus empty isolated disk caches.
// Existing browser profiles and host driver caches are never deleted.
import { mkdir, mkdtemp, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
export async function coldCacheEnvironment(root) {
  if (!root) throw new Error('ATLAS_COLD_CACHE_ROOT is required for cold P3/prewarm evidence');
  const parent = resolve(root);
  if (parent === '/tmp' || parent.startsWith('/tmp/')) throw new Error('cold caches must not use /tmp');
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(`${parent}/space-`), xdg = resolve(directory, 'xdg'), nvidia = resolve(directory, 'nvidia');
  await mkdir(xdg); await mkdir(nvidia);
  const empty = (await readdir(xdg)).length === 0 && (await readdir(nvidia)).length === 0;
  if (!empty) throw new Error('cold-cache directories were not empty before launch');
  return { env: { XDG_CACHE_HOME: xdg, __GL_SHADER_DISK_CACHE_PATH: nvidia, __GL_SHADER_DISK_CACHE: '0' },
    evidence: { directory, verifiedEmptyBeforeLaunch: empty, browser: 'new Playwright temporary profile and fresh browser/GPU process',
      driver: 'isolated empty NVIDIA cache path; __GL_SHADER_DISK_CACHE=0 disables disk-cache reuse', gpuResidentCaches: 'not measured; no driver reset', hostCachesDeleted: false } };
}
