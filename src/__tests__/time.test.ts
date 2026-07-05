import { describe, it, expect } from "vitest";
import { shiftMinutes, shiftHours, crossesMidnight } from "@/lib/domain/time";

describe("Zeit-Helfer (Mitternacht-fest)", () => {
  it("normale Schicht am selben Tag", () => {
    expect(shiftHours("08:00", "12:00")).toBe(4);
    expect(shiftHours("08:00", "18:00")).toBe(10);
    expect(shiftMinutes("14:00", "18:00")).toBe(240);
  });

  it("Schicht über Mitternacht", () => {
    expect(shiftHours("22:00", "06:00")).toBe(8);
    expect(shiftMinutes("23:30", "00:30")).toBe(60);
    expect(crossesMidnight("22:00", "06:00")).toBe(true);
    expect(crossesMidnight("08:00", "18:00")).toBe(false);
  });

  it("gleiche Zeit = 0 (kein 24h-Fehler)", () => {
    expect(shiftHours("08:00", "08:00")).toBe(0);
    expect(crossesMidnight("08:00", "08:00")).toBe(false);
  });
});
