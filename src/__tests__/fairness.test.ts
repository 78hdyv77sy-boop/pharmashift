import { describe, it, expect } from "vitest";
import { rawScore, isEveningEnd, isWeekendDow, normalizeScores } from "@/lib/domain/fairness";

describe("Fairness-Engine", () => {
  it("gewichteter Rohwert", () => {
    expect(rawScore({ night: 1, holiday: 0, weekend: 0, evening: 0 })).toBe(5);
    expect(rawScore({ night: 2, holiday: 1, weekend: 3, evening: 4 })).toBe(10 + 3 + 6 + 4);
    expect(rawScore({ night: 0, holiday: 0, weekend: 0, evening: 0 })).toBe(0);
  });

  it("Abendschicht endet ab 17:00", () => {
    expect(isEveningEnd("18:00")).toBe(true);
    expect(isEveningEnd("17:00")).toBe(true);
    expect(isEveningEnd("16:59")).toBe(false);
    expect(isEveningEnd("12:00")).toBe(false);
  });

  it("Wochenende = Sa/So", () => {
    expect(isWeekendDow(6)).toBe(true); // Sa
    expect(isWeekendDow(0)).toBe(true); // So
    expect(isWeekendDow(1)).toBe(false); // Mo
  });

  it("Normalisierung 0..100 (höchste Last = 100)", () => {
    expect(normalizeScores([10, 5, 0])).toEqual([100, 50, 0]);
    expect(normalizeScores([0, 0])).toEqual([0, 0]);
    expect(normalizeScores([4])).toEqual([100]);
  });
});
