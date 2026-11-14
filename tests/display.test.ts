import { expect, it } from "vitest";
import { graphPosition, TuningDisplay } from "../src/display";

it("uses ten-cent display steps without changing the measured pitch", () => {
  expect(new TuningDisplay().update(60, 0)).toEqual({ cents: 60, step: 6 });
  expect(new TuningDisplay().update(-30, 0)).toEqual({ cents: -30, step: -3 });
});
it("maps the graph and readout to the same thirty-step range", () => {
  expect(graphPosition(60)).toBe(0.2);
  expect(graphPosition(-30)).toBe(-0.1);
  expect(graphPosition(300)).toBe(1);
  expect(graphPosition(-900)).toBe(-1);
});
it("holds the number steady when readings fluctuate around a step boundary", () => {
  const display = new TuningDisplay();
  expect(display.update(44, 0).step).toBe(4);
  for (let i = 1; i < 30; i++) expect(display.update(i % 2 ? 46 : 44, i * 20).step).toBe(4);
});
it("rejects an isolated display spike but follows a sustained tuning change", () => {
  const display = new TuningDisplay();
  display.update(0, 0);
  display.update(0, 20);
  display.update(0, 40);
  expect(display.update(100, 60).cents).toBe(0);
  expect(display.update(0, 80).cents).toBe(0);
  for (let i = 5; i <= 35; i++) display.update(30, i * 20);
  expect(display.update(30, 740).step).toBe(3);
});
it("starts fresh when switching strings", () => {
  const display = new TuningDisplay();
  display.update(70, 0);
  display.reset();
  expect(display.update(-20, 20)).toEqual({ cents: -20, step: -2 });
});

it("uses distance-based feedback colors symmetrically and green only on completion", async () => {
  const { tuningState } = await import("../src/display");
  for (const sign of [-1, 1]) {
    expect(tuningState(sign * 60, false)).toBe("far");
    expect(tuningState(sign * 30, false)).toBe("approaching");
    expect(tuningState(sign * 10, false)).toBe("close");
  }
  expect(tuningState(0, false)).toBe("close");
  expect(tuningState(0, true)).toBe("tuned");
});

it("always has a checkmark or nonzero offset for a detected note", async () => {
  const { markerState } = await import("../src/display");
  expect(markerState(0, 0)).toEqual({ inTune: true, offset: 0 });
  expect(markerState(4.9, 0)).toEqual({ inTune: true, offset: 0 });
  expect(markerState(5.1, 0)).toEqual({ inTune: false, offset: 1 });
  expect(markerState(-5.1, 0)).toEqual({ inTune: false, offset: -1 });
});
