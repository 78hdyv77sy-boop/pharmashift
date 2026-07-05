import { describe, it, expect } from "vitest";
import {
  findHardConflicts,
  suggestReassignment,
  type SolverShift,
  type SolverEmployee,
} from "@/lib/domain/solver";

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

describe("Auto-Umbuchung: findHardConflicts", () => {
  it("erkennt eine Zuweisung an einem Abwesenheitstag als Konflikt", () => {
    const conflicts = findHardConflicts(
      [shift({ id: "s1", date: "2026-06-12", assignedEmployeeIds: ["a"] })],
      [emp({ id: "a", absentDates: new Set(["2026-06-12"]) })],
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ shiftId: "s1", employeeId: "a", reason: "abwesend" });
  });

  it("erkennt Ruhezeit-Verletzung zwischen zwei Tagen (<11h)", () => {
    // Spätdienst bis 22:00, am Folgetag Frühdienst ab 06:00 -> 8h Ruhe
    const conflicts = findHardConflicts(
      [
        shift({ id: "spaet", date: "2026-06-12", startTime: "14:00", endTime: "22:00", assignedEmployeeIds: ["a"] }),
        shift({ id: "frueh", date: "2026-06-13", startTime: "06:00", endTime: "14:00", assignedEmployeeIds: ["a"] }),
      ],
      [emp({ id: "a" })],
    );
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts.some((c) => c.reason.includes("Ruhezeit"))).toBe(true);
  });

  it("meldet keinen Konflikt bei legalem Plan", () => {
    const conflicts = findHardConflicts(
      [shift({ id: "s1", date: "2026-06-12", assignedEmployeeIds: ["a"] })],
      [emp({ id: "a" })],
    );
    expect(conflicts).toHaveLength(0);
  });
});

describe("Auto-Umbuchung: suggestReassignment", () => {
  it("schlägt gültige Kollegin gleicher Rolle vor", () => {
    const shifts = [shift({ id: "s1", date: "2026-06-12", assignedEmployeeIds: ["a"] })];
    const employees = [
      emp({ id: "a", type: "APOTHEKER", absentDates: new Set(["2026-06-12"]) }),
      emp({ id: "b", type: "APOTHEKER" }),
    ];
    const conflict = findHardConflicts(shifts, employees)[0];
    const sug = suggestReassignment(conflict, shifts, employees);
    expect(sug).not.toBeNull();
    expect(sug!.toEmployeeId).toBe("b");
    expect(sug!.fromEmployeeId).toBe("a");
  });

  it("schlägt NICHT jemand anderer Rolle vor", () => {
    const shifts = [shift({ id: "s1", date: "2026-06-12", assignedEmployeeIds: ["a"] })];
    const employees = [
      emp({ id: "a", type: "APOTHEKER", absentDates: new Set(["2026-06-12"]) }),
      emp({ id: "pka", type: "PKA" }), // falsche Rolle
    ];
    const conflict = findHardConflicts(shifts, employees)[0];
    expect(suggestReassignment(conflict, shifts, employees)).toBeNull();
  });

  it("gibt null zurück, wenn der einzige Ersatz selbst einen Verstoß bekäme", () => {
    const shifts = [shift({ id: "s1", date: "2026-06-12", assignedEmployeeIds: ["a"] })];
    const employees = [
      emp({ id: "a", absentDates: new Set(["2026-06-12"]) }),
      emp({ id: "b", absentDates: new Set(["2026-06-12"]) }), // auch abwesend
    ];
    const conflict = findHardConflicts(shifts, employees)[0];
    expect(suggestReassignment(conflict, shifts, employees)).toBeNull();
  });
});
