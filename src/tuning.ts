export type Tuning = { id: string; name: string; notes: number[] };
export const PRESETS: Tuning[] = [
  { id: "standard", name: "Standard", notes: [40, 45, 50, 55, 59, 64] },
  { id: "drop-d", name: "Drop D", notes: [38, 45, 50, 55, 59, 64] },
  { id: "half-down", name: "Half-step down", notes: [39, 44, 49, 54, 58, 63] },
  { id: "whole-down", name: "Whole-step down", notes: [38, 43, 48, 53, 57, 62] },
  { id: "dadgad", name: "DADGAD", notes: [38, 45, 50, 55, 57, 62] },
  { id: "open-g", name: "Open G", notes: [38, 43, 50, 55, 59, 62] },
];
export const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
export const cents = (f: number, target: number) => 1200 * Math.log2(f / target);
export function note(midi: number, octave = false) {
  return (
    ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][midi % 12] +
    (octave ? Math.floor(midi / 12) - 1 : "")
  );
}
export type Reading = { frequency: number; clarity: number; time: number };
export type Result = { string: number; cents: number; inTune: boolean; confirmed: boolean };
export class Tracker {
  private selected = -1;
  private candidate = -1;
  private candidateSince = 0;
  private smooth = 0;
  private stableSince: number | null = null;
  private last = 0;
  private sounded = false;
  reset() {
    this.selected = -1;
    this.candidate = -1;
    this.stableSince = null;
    this.last = 0;
    this.sounded = false;
  }
  update(r: Reading, tuning: Tuning, manual: number | null): Result | null {
    if (
      !Number.isFinite(r.frequency) ||
      r.frequency < hz(28) * 0.9 ||
      r.frequency > hz(76) * 1.1 ||
      r.clarity < 0.9
    )
      return null;
    if (this.last && r.time - this.last > 650) this.reset();
    let index =
      manual ??
      tuning.notes.reduce(
        (best, n, i) =>
          Math.abs(cents(r.frequency, hz(n))) < Math.abs(cents(r.frequency, hz(tuning.notes[best])))
            ? i
            : best,
        0,
      );
    const error = cents(r.frequency, hz(tuning.notes[index]));
    if (manual === null && Math.abs(error) > 180) return null;
    if (index !== this.selected) {
      if (this.candidate !== index) {
        this.candidate = index;
        this.candidateSince = r.time;
      }
      if (manual === null && r.time - this.candidateSince < 100) return null;
      this.selected = index;
      this.smooth = error;
      this.stableSince = null;
      this.sounded = false;
    }
    // Reject isolated octave jumps while tuning a manually selected string.
    if (
      manual !== null &&
      this.last &&
      Math.abs(error - this.smooth) > 700 &&
      r.time - this.last < 250
    )
      return null;
    this.last = r.time;
    this.smooth += 0.35 * (error - this.smooth);
    if (Math.abs(error) <= 5.000001 && Math.abs(this.smooth) <= 5.000001) {
      this.stableSince ??= r.time;
    } else {
      this.stableSince = null;
      if (Math.abs(error) > 6) this.sounded = false;
    }
    const inTune = this.stableSince !== null && r.time - this.stableSince >= 350;
    const confirmed = inTune && !this.sounded;
    if (confirmed) this.sounded = true;
    return { string: index, cents: this.smooth, inTune, confirmed };
  }
}
export type Settings = {
  selected: string;
  sound: boolean;
  custom: Tuning[];
  theme: "system" | "light" | "dark";
};
export function loadSettings(): Settings {
  const fallback: Settings = { selected: "standard", sound: true, custom: [], theme: "system" };
  try {
    const s = JSON.parse(localStorage.getItem("opentuner:v1") || "null");
    if (!s || !Array.isArray(s.custom)) return fallback;
    const custom = s.custom.filter(
      (t: Tuning) =>
        t &&
        typeof t.id === "string" &&
        t.id.startsWith("custom-") &&
        typeof t.name === "string" &&
        t.name.trim() &&
        Array.isArray(t.notes) &&
        t.notes.length === 6 &&
        t.notes.every((n) => Number.isInteger(n) && n >= 28 && n <= 76),
    );
    return {
      selected: typeof s.selected === "string" ? s.selected : "standard",
      sound: typeof s.sound === "boolean" ? s.sound : true,
      custom,
      theme: s.theme === "light" || s.theme === "dark" ? s.theme : "system",
    };
  } catch {
    return fallback;
  }
}
export function saveSettings(s: Settings) {
  try {
    localStorage.setItem("opentuner:v1", JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}
