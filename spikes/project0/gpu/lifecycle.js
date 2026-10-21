// spikes/project0/gpu/lifecycle.js — loss/recovery policy (pure). Its epoch always mirrors the real device epoch.
export class Lifecycle {
  constructor({ epoch, maxAutomaticRecoveries = 1, windowMs = 60000, now = () => performance.now() }) {
    if (!Number.isInteger(epoch)) throw new Error('Lifecycle needs the acquired session epoch');
    Object.assign(this, { epoch, maxAutomaticRecoveries, windowMs, now });
    this.current = null; this.recoveryTimes = [];
    this.s = { interruptions: 0, recoveries: 0, stopped: false };
  }
  begin(request) {
    if (this.s.stopped) throw new Error('automatic recovery stopped after a repeated loss');
    this.current = { request: structuredClone(request), epoch: this.epoch, state: 'running' };
    return this.current;
  }
  lost(event) {
    if (event.epoch !== this.epoch) return { action: 'ignore', interrupted: null };
    const interrupted = this.current?.state === 'running' ? this.current : null;
    if (interrupted) { interrupted.state = 'interrupted'; this.s.interruptions++; }
    const t = this.now(); this.recoveryTimes = this.recoveryTimes.filter(x => t - x < this.windowMs);
    if (this.recoveryTimes.length >= this.maxAutomaticRecoveries) { this.s.stopped = true; return { action: 'stop', interrupted }; }
    this.recoveryTimes.push(t);
    return { action: 'recover', interrupted };
  }
  recovered(epoch) { this.epoch = epoch; this.s.recoveries++; }
  accept(job, epoch) { return job.state === 'running' && job.epoch === this.epoch && epoch === this.epoch; }
  succeed(job) { if (job.state !== 'running') throw new Error(`cannot succeed: job is ${job.state}`); job.state = 'succeeded'; }
  stats() { return { ...this.s }; }
}
