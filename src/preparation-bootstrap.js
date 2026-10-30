// Application composition owns the local dependency; Space core receives it.
export const preparationWorkerUrl = new URL('./preparation-worker.js', import.meta.url);
export const loadPreparedPhysics = async () => (await import('/api/preparation/rapier.mjs')).default;
