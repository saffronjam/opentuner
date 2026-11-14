// Completing the same string twice requires a full second without a check mark.
export class CompletionGate {
  private target: string | null = null;
  private played = false;
  private outsideSince: number | null = null;

  update(target: string | null, done: boolean, time: number, ready = true): boolean {
    if (target !== null && target !== this.target) {
      this.target = target;
      this.played = false;
      this.outsideSince = null;
    }
    if (this.outsideSince !== null && time - this.outsideSince >= 1000) {
      this.played = false;
    }
    if (!done) {
      this.outsideSince ??= time;
      return false;
    }
    this.outsideSince = null;
    if (this.played || !ready) return false;
    this.played = true;
    return true;
  }
}

export function offsetLabel(step: number): string {
  return step === 0 ? "" : `${step > 0 ? "+" : ""}${step}`;
}
