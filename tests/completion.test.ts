import { expect, it } from "vitest";
import { CompletionGate, offsetLabel } from "../src/completion";
it("plays once for a held note and ignores brief out-of-tune flicker", () => {
  const gate = new CompletionGate();
  expect(gate.update("A", true, 0)).toBe(true);
  expect(gate.update("A", true, 100)).toBe(false);
  gate.update("A", false, 200);
  expect(gate.update("A", true, 1199)).toBe(false);
  expect(gate.update("A", true, 3000)).toBe(false);
});
it("re-arms after a full second without a checkmark", () => {
  const gate = new CompletionGate();
  gate.update("A", true, 0);
  gate.update("A", false, 200);
  expect(gate.update("A", true, 1200)).toBe(true);
  expect(gate.update("A", true, 1300)).toBe(false);
});
it("allows immediate completion for a different string or target pitch", () => {
  const gate = new CompletionGate();
  gate.update("A2", true, 0);
  expect(gate.update("D3", true, 1)).toBe(true);
  expect(gate.update("D3", true, 2)).toBe(false);
  expect(gate.update("D2", true, 3)).toBe(true);
});
it("re-arms through silence but not through a short interruption", () => {
  const gate = new CompletionGate();
  gate.update("A", true, 0);
  gate.update(null, false, 100);
  expect(gate.update("A", true, 500)).toBe(false);
  gate.update(null, false, 600);
  expect(gate.update("A", true, 1600)).toBe(true);
});
it("never displays zero", () => {
  expect(offsetLabel(0)).toBe("");
  expect(offsetLabel(-0)).toBe("");
  expect(offsetLabel(3)).toBe("+3");
  expect(offsetLabel(-3)).toBe("-3");
});

it("waits for a stable reading without re-arming while the checkmark stays visible", () => {
  const gate = new CompletionGate();
  expect(gate.update("A", true, 0, false)).toBe(false);
  expect(gate.update("A", true, 400, true)).toBe(true);
  expect(gate.update("A", true, 500, false)).toBe(false);
  expect(gate.update("A", true, 2000, true)).toBe(false);
});
