import { describe, it, expect } from "vitest";
import { solveWeekGaps, type SolverShift, type SolverEmployee } from "@/lib/domain/solver";

function emp(partial: Partial<SolverEmployee> & { id: string }): SolverEmployee {
  return {
    name: partial.id,
    type: "PKA",
    weeklyHoursTarget: 40,
    absentDates: new Set(),
    unavailableDates: new Set(),
    preferredDates: new Set(),
    presetHours: 0,
    ...partial,
  } as SolverEmployee;
}
function shift(partial: Partial<SolverShift> & { id: string; date: string }): SolverShift {
  return { startTime: "08:00", endTime: "16:00", requiredHeadcount: 1, requiredRoles: null, assignedEmployeeIds: [], ...partial } as SolverShift;
}

describe("Solver: harte Constraints", () => {
  it("Nachtarbeitsverbot: nightWorkRestricted bekommt keinen Nachtdienst", () => {
    const res = solveWeekGaps(
      [shift({ id: "night", date: "2026-06-17", startTime: "18:00", endTime: "08:00" })],
      [
        emp({ id: "schwanger", nightWorkRestricted: true }),
        emp({ id: "frei" }),
      ],
    );
    expect(res.assignments[0]?.employeeId).toBe("frei");
  });
  it("nightWorkRestricted darf Tagschicht 08-12", () => {
    const res = solveWeekGaps(
      [shift({ id: "tag", date: "2026-06-17", startTime: "08:00", endTime: "12:00" })],
      [emp({ id: "schwanger", nightWorkRestricted: true })],
    );
    expect(res.assignments[0]?.employeeId).toBe("schwanger");
  });

  it("überspringt Abwesende und Nicht-Verfügbare", () => {
    const res = solveWeekGaps(
      [shift({ id: "s1", date: "2026-06-12" })],
      [
        emp({ id: "absent", absentDates: new Set(["2026-06-12"]) }),
        emp({ id: "unavail", unavailableDates: new Set(["2026-06-12"]) }),
        emp({ id: "free" }),
      ],
    );
    expect(res.assignments).toHaveLength(1);
    expect(res.assignments[0].employeeId).toBe("free");
  });

  it("AZG: keine Zuweisung bei <11h Ruhezeit zum Vortag", () => {
    // Vortag bis 22:00, Folgetag ab 06:00 -> nur 8h Ruhe -> verboten
    const res = solveWeekGaps(
      [
        shift({ id: "late", date: "2026-06-11", startTime: "14:00", endTime: "22:00", assignedEmployeeIds: ["a"] }),
        shift({ id: "early", date: "2026-06-12", startTime: "06:00", endTime: "14:00" }),
      ],
      [emp({ id: "a" }), emp({ id: "b" })],
    );
    const early = res.assignments.find((x) => x.shiftId === "early");
    expect(early?.employeeId).toBe("b");
  });

  it("AZG: 48h-Wochendeckel greift (inkl. presetHours)", () => {
    const res = solveWeekGaps(
      [shift({ id: "s1", date: "2026-06-12" })], // 8h
      [emp({ id: "voll", presetHours: 44, weeklyHoursTarget: null }), emp({ id: "frei", weeklyHoursTarget: null })],
    );
    expect(res.assignments[0]?.employeeId).toBe("frei");
  });

  it("keine Doppel-Zuweisung bei Zeitüberschneidung am selben Tag", () => {
    const res = solveWeekGaps(
      [
        shift({ id: "s1", date: "2026-06-12", startTime: "08:00", endTime: "16:00", assignedEmployeeIds: ["a"] }),
        shift({ id: "s2", date: "2026-06-12", startTime: "12:00", endTime: "20:00" }),
      ],
      [emp({ id: "a" }), emp({ id: "b" })],
    );
    expect(res.assignments.find((x) => x.shiftId === "s2")?.employeeId).toBe("b");
  });
});

describe("Solver: Rollen-Pflicht (Apothekerpflicht)", () => {
  it("besetzt requiredRoles zuerst mit der richtigen Rolle", () => {
    const res = solveWeekGaps(
      [shift({ id: "s1", date: "2026-06-12", requiredHeadcount: 2, requiredRoles: { APOTHEKER: 1 } })],
      [
        emp({ id: "pka1", type: "PKA", preferredDates: new Set(["2026-06-12"]) }),
        emp({ id: "apo", type: "APOTHEKER" }),
        emp({ id: "pka2", type: "PKA" }),
      ],
    );
    const assigned = res.assignments.filter((a) => a.shiftId === "s1");
    expect(assigned).toHaveLength(2);
    expect(assigned[0].employeeId).toBe("apo"); // Pflicht zuerst, trotz PKA-Präferenz
    expect(assigned[0].reason).toContain("Pflicht: APOTHEKER");
  });

  it("warnt, wenn Rollen-Pflicht unbesetzbar ist", () => {
    const res = solveWeekGaps(
      [shift({ id: "s1", date: "2026-06-12", requiredRoles: { APOTHEKER: 1 } })],
      [emp({ id: "pka", type: "PKA" })],
    );
    expect(res.warnings.some((w) => w.message.includes("APOTHEKER"))).toBe(true);
  });
});

describe("Solver: weiche Kriterien", () => {
  it("PREFERRED gewinnt bei gleichem Stundenstand", () => {
    const res = solveWeekGaps(
      [shift({ id: "s1", date: "2026-06-12" })],
      [emp({ id: "neutral" }), emp({ id: "fan", preferredDates: new Set(["2026-06-12"]) })],
    );
    expect(res.assignments[0].employeeId).toBe("fan");
    expect(res.assignments[0].reason).toContain("bevorzugt");
  });

  it("Stunden-Soll: Unterdeckte werden bevorzugt", () => {
    const res = solveWeekGaps(
      [shift({ id: "s1", date: "2026-06-12" })],
      [emp({ id: "satt", presetHours: 36 }), emp({ id: "hungrig", presetHours: 8 })],
    );
    expect(res.assignments[0].employeeId).toBe("hungrig");
  });

  it("meldet Unterbesetzung, wenn niemand kann", () => {
    const res = solveWeekGaps(
      [shift({ id: "s1", date: "2026-06-12", requiredHeadcount: 2 })],
      [emp({ id: "a", absentDates: new Set(["2026-06-12"]) })],
    );
    expect(res.assignments).toHaveLength(0);
    expect(res.warnings.some((w) => w.message.includes("Unterbesetzt"))).toBe(true);
  });
});
