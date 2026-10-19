import { Worker } from 'node:worker_threads';

export async function runJobs(jobs,anchor,{
  workers=8,
  workerURL=new URL('./prepare-worker.mjs',import.meta.url),
  onProgress=()=>{}
}={}) {
  if (!Number.isInteger(workers) || workers < 1 || workers > 16) {
    throw new Error('workers must be an integer in [1,16]');
  }
  if (jobs.some((job,i) => job.id !== i)) {
    throw new Error('job identity/order');
  }
  if (!jobs.length) return [];

  const pool = [];
  const output = new Array(jobs.length);
  let next = 0;
  let completed = 0;
  let settled = false;

  try {
    return await new Promise((resolve,reject) => {
      const fail = error => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      for (let i=0; i<Math.min(workers,jobs.length); i++) {
        const worker = new Worker(workerURL,{ workerData: { anchor } });
        pool.push(worker);
        let active = null;

        const assign = () => {
          if (settled || next === jobs.length) return;
          active = jobs[next++];
          worker.postMessage(active);
        };

        worker.on('error',fail);
        worker.on('exit',code => {
          if (!settled) {
            fail(new Error('preparation worker exited: '+code));
          }
        });
        worker.on('message',message => {
          if (settled) return;
          try {
            if (
              !active ||
              message.id !== active.id ||
              output[message.id]
            ) {
              throw new Error('worker result identity');
            }
            if (message.error) throw new Error(message.error);

            output[message.id] = {
              id: message.id,
              value: message.value
            };
            completed++;
            onProgress({ completed, total: jobs.length, job: active });
            active = null;

            if (completed === jobs.length) {
              settled = true;
              resolve(output);
            } else {
              assign();
            }
          } catch (error) {
            fail(error);
          }
        });
        assign();
      }
    });
  } finally {
    settled = true;
    await Promise.allSettled(pool.map(worker => worker.terminate()));
  }
}
