// spikes/project0/gpu/scheduler.js — pure scheduling. The Ledger is per device session; the Planner is per generation.
export class Ledger {
  constructor({ max = 2 } = {}) { this.max = max; this.tickets = new Set(); this.peak = 0; }
  available() { return this.tickets.size < this.max; }
  take(meta) {
    if (!this.available()) throw new Error('no submission credit: the outstanding limit is reached');
    const ticket = { ...meta, live: true }; this.tickets.add(ticket);
    this.peak = Math.max(this.peak, this.tickets.size);
    return ticket;
  }
  release(ticket) { if (!ticket.live || !this.tickets.has(ticket)) return false; ticket.live = false; this.tickets.delete(ticket); return true; }
  retire(epoch) { let n = 0; for (const t of [...this.tickets]) if (t.epoch === epoch) { t.live = false; this.tickets.delete(t); n++; } return n; }
  outstanding() { return this.tickets.size; }
  maxObserved() { return this.peak; }
}

export class Planner {
  constructor({ rows, cols, targetMs = 10, initialRows = 8, minRange = 64, carry = null }) {
    Object.assign(this, { rows, cols, targetMs, minRange });
    this.rowsPerBand = Math.min(rows, carry?.rowsPerBand ?? initialRows);
    this.colsPerBand = Math.min(cols, carry?.colsPerBand ?? cols);
    this.row = 0; this.col = 0; this.remaining = rows * cols;
    this.log = { bandMs: [], rowsPerBand: [], splits: 0 };
  }
  // A partially traced row is always finished as single-row ranges, whatever the band size has adapted to (Codex's fix).
  next() {
    if (this.row >= this.rows) return null;
    const partial = this.col !== 0;
    const rows = partial ? 1 : Math.min(this.rowsPerBand, this.rows - this.row);
    const split = partial || (rows === 1 && this.colsPerBand < this.cols);
    const col0 = split ? this.col : 0;
    const cols = split ? Math.min(this.colsPerBand, this.cols - col0) : this.cols;
    const band = { row0: this.row, rows, col0, cols, area: rows * cols };
    if (split && col0 + cols < this.cols) this.col = col0 + cols; else { this.row += rows; this.col = 0; }
    return band;
  }
  // Adapt towards targetMs: halve when slow; below one row, split the row (not below minRange); grow when much faster.
  completed(band, ms) {
    this.log.bandMs.push(ms); this.remaining -= band.area;
    if (ms > this.targetMs) {
      if (this.rowsPerBand > 1) this.rowsPerBand = Math.max(1, Math.floor(this.rowsPerBand / 2));
      else if (this.colsPerBand > this.minRange) { this.colsPerBand = Math.max(this.minRange, Math.floor(this.colsPerBand / 2)); this.log.splits++; }
    } else if (ms < this.targetMs / 2) {
      if (this.colsPerBand < this.cols) this.colsPerBand = Math.min(this.cols, this.colsPerBand * 2);
      else this.rowsPerBand = Math.min(this.rows, Math.ceil(this.rowsPerBand * 1.25));
    }
    this.log.rowsPerBand.push(this.rowsPerBand);
  }
  done() { return this.remaining === 0; }
  carry() { return { rowsPerBand: this.rowsPerBand, colsPerBand: this.colsPerBand }; }
  stats() { return { bandMs: [...this.log.bandMs], rowsPerBand: [...this.log.rowsPerBand], splits: this.log.splits }; }
}
