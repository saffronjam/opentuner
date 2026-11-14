// A calm, beginner-facing guide. Pitch measurement stays in cents.
// One displayed step is ten cents; the graph spans thirty steps either way.
export const graphPosition = (cents: number) => Math.max(-1, Math.min(1, cents / 300));

export class TuningDisplay {
  private recent: number[] = [];
  private filtered = 0;
  private last: number | null = null;
  private step = 0;

  reset() {
    this.recent = [];
    this.last = null;
    this.step = 0;
  }

  update(cents: number, time: number) {
    this.recent.push(cents);
    if (this.recent.length > 3) this.recent.shift();
    const sorted = [...this.recent].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (this.last === null) {
      this.filtered = cents;
      this.step = Math.round(cents / 10);
    } else {
      const elapsed = Math.max(0, time - this.last);
      this.filtered += (1 - Math.exp(-elapsed / 120)) * (median - this.filtered);
    }
    this.last = time;

    // Hysteresis keeps the number from alternating at a rounding boundary.
    if (Math.abs(this.filtered / 10 - this.step) > 0.65) {
      this.step = Math.round(this.filtered / 10);
    }
    if (Math.abs(this.filtered) <= 3) this.step = 0;
    return { cents: this.filtered, step: this.step || 0 };
  }
}

export function tuningState(cents: number, done: boolean) {
  if (done) return "tuned";
  const distance = Math.abs(cents);
  if (distance >= 50) return "far";
  if (distance >= 20) return "approaching";
  return "close";
}

export function markerState(cents: number, step: number) {
  const inTune = Math.abs(cents) <= 5.000001;
  return { inTune, offset: inTune ? 0 : step || Math.sign(cents) };
}
