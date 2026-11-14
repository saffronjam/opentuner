import { describe, it, expect } from "vitest";
import { PitchDetector } from "pitchy";
import { PRESETS, Tracker, hz, cents, note } from "../src/tuning";
describe("pitch detection", () => {
  for (const t of PRESETS)
    for (const midi of t.notes)
      it(`${t.name} ${note(midi, true)}`, () => {
        const detector = PitchDetector.forFloat32Array(4096),
          rate = 48000,
          f = hz(midi);
        for (const offset of [-35, 0, 35]) {
          const actual = f * 2 ** (offset / 1200);
          const samples = Float32Array.from(
            { length: 4096 },
            (_, i) =>
              0.5 * Math.sin((2 * Math.PI * actual * i) / rate) +
              0.25 * Math.sin((4 * Math.PI * actual * i) / rate) +
              0.1 * Math.sin((6 * Math.PI * actual * i) / rate),
          );
          const [detected, clarity] = detector.findPitch(samples, rate);
          expect(Math.abs(cents(detected, actual))).toBeLessThan(2);
          expect(clarity).toBeGreaterThan(0.9);
        }
      });
});
describe("tracker", () => {
  it("selects low and high E by octave", () => {
    for (const index of [0, 5]) {
      const tracker = new Tracker();
      tracker.update(
        { frequency: hz(PRESETS[0].notes[index]), clarity: 1, time: 100 },
        PRESETS[0],
        null,
      );
      expect(
        tracker.update(
          { frequency: hz(PRESETS[0].notes[index]), clarity: 1, time: 220 },
          PRESETS[0],
          null,
        )?.string,
      ).toBe(index);
    }
  });
  it("waits for stable pitch and confirms only once", () => {
    const t = new Tracker();
    const read = (time: number) => t.update({ frequency: 110, clarity: 1, time }, PRESETS[0], 1);
    expect(read(100)?.inTune).toBe(false);
    expect(read(400)?.confirmed).toBe(false);
    expect(read(500)?.confirmed).toBe(true);
    expect(read(600)?.confirmed).toBe(false);
  });
  it("rejects noise and distant automatic matches", () => {
    const t = new Tracker();
    expect(t.update({ frequency: 110, clarity: 0.4, time: 100 }, PRESETS[0], null)).toBeNull();
    expect(t.update({ frequency: 440, clarity: 1, time: 200 }, PRESETS[0], null)).toBeNull();
  });
  it("supports detuned strings in manual mode", () => {
    const t = new Tracker();
    expect(t.update({ frequency: 100, clarity: 1, time: 100 }, PRESETS[0], 1)?.cents).toBeLessThan(
      -100,
    );
  });
  it("clears confirmation after silence", () => {
    const t = new Tracker();
    t.update({ frequency: 110, clarity: 1, time: 100 }, PRESETS[0], 1);
    t.update({ frequency: 110, clarity: 1, time: 500 }, PRESETS[0], 1);
    expect(t.update({ frequency: 110, clarity: 1, time: 1500 }, PRESETS[0], 1)?.inTune).toBe(false);
  });
});

it("acquires automatic tuning after the page has been open a while", () => {
  const t = new Tracker();
  t.update({ frequency: 110, clarity: 1, time: 10000 }, PRESETS[0], null);
  expect(t.update({ frequency: 110, clarity: 1, time: 10120 }, PRESETS[0], null)?.string).toBe(1);
});
