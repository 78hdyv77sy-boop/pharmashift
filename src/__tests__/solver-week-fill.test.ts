import { describe, it, expect } from "vitest";
import { solveWeekGaps, type SolverShift, type SolverEmployee } from "@/lib/domain/solver";

// Realistisches Wochen-Szenario (Regression für den "Automatisch füllen"-Bug):
// 3 Mitarbeiter, 4 Schichten mit Lücken -> der Solver MUSS Vorschläge liefern.

function emp(id: string, type: string, extra?: Partial<SolverEmployee>): SolverEmployee {
  return {
    id, name: id, type,
    weeklyHoursTarget: 40,
    absentDates: new Set(), unavailableDates: new Set(), preferredDates: new Set(),
    presetHours: 0,
    ...extra,
  };
}
function shift(id: string, date: string, extra?: Partial<SolverShift>): SolverShift {
  return { id, date, startTime: "08:00", endTime: "12:00", requiredHeadcount: 1, requiredRoles: null, assignedEmployeeIds: [], ...extra };
}

describe("Automatisch füllen: realistische Woche", () => {
  it("füllt offene Plätze einer normalen Woche", () => {
    const employees = [emp("anna", "APOTHEKER"), emp("tom", "PKA"), emp("lisa", "PKA")];
    const shifts = [
      shift("mo-vm", "2026-07-06", { requiredHeadcount: 2, requiredRoles: { APOTHEKER: 1 } }),
      shift("mo-nm", "2026-07-06", { startTime: "14:00", endTime: "18:00" }),
      shift("di-vm", "2026-07-07", { assignedEmployeeIds: ["tom"] }), // schon besetzt
      shift("mi-vm", "2026-07-08"),
    ];
    const res = solveWeekGaps(shifts, employees);

    // mo-vm braucht 2 (davon 1 Apotheker), mo-nm 1, mi-vm 1 => 4 Vorschläge
    expect(res.assignments.length).toBe(4);
    // Apothekerpflicht am Montag erfüllt
    const moVm = res.assignments.filter((a) => a.shiftId === "mo-vm");
    expect(moVm.some((a) => a.employeeId === "anna")).toBe(true);
    // bereits besetzte Schicht bleibt unangetastet
    expect(res.assignments.some((a) => a.shiftId === "di-vm")).toBe(false);
    expect(res.warnings.length).toBe(0);
  });

  it("Alt-Daten mit requiredRoles={count:n} blockieren die Besetzung NICHT", () => {
    const employees = [emp("tom", "PKA")];
    const shifts = [shift("s1", "2026-07-06", { requiredRoles: { count: 1 } as unknown as Record<string, number> })];
    const res = solveWeekGaps(shifts, employees);
    // "count" ist keine echte Rolle -> Warnung, aber der Platz wird generisch gefüllt
    expect(res.assignments.length).toBe(1);
    expect(res.assignments[0].employeeId).toBe("tom");
  });

  it("respektiert Abwesenheit und meldet Unterbesetzung ehrlich", () => {
    const employees = [emp("tom", "PKA", { absentDates: new Set(["2026-07-06"]) })];
    const res = solveWeekGaps([shift("s1", "2026-07-06")], employees);
    expect(res.assignments.length).toBe(0);
    expect(res.warnings.some((w) => w.message.includes("Unterbesetzt"))).toBe(true);
  });
});
