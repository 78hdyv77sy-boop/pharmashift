import { describe, it, expect } from "vitest";
import { mondayOf, addDays, weekDays } from "@/lib/domain/dates";

describe("Domain: dates", () => {
  it("mondayOf normalisiert auf Montag", () => {
    expect(mondayOf("2026-06-11")).toBe("2026-06-08"); // Do -> Mo
    expect(mondayOf("2026-06-08")).toBe("2026-06-08"); // Mo bleibt
    expect(mondayOf("2026-06-14")).toBe("2026-06-08"); // So -> Mo davor
  });
  it("addDays über Monatsgrenze", () => {
    expect(addDays("2026-06-29", 3)).toBe("2026-07-02");
    expect(addDays("2026-07-01", -1)).toBe("2026-06-30");
  });
  it("weekDays liefert 7 aufeinanderfolgende Tage ab Montag", () => {
    const days = weekDays("2026-06-08");
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-06-08");
    expect(days[6]).toBe("2026-06-14");
  });
});
