import { describe, it, expect } from "vitest";
import { findHardConflicts, suggestReassignment, type SolverShift, type SolverEmployee } from "@/lib/domain/solver";

// SZENARIO-TEST (End-to-End auf Logik-Ebene):
// Voller Wochen-Dienstplan, komplett besetzt. Eine Mitarbeiterin fällt
// die ganze Woche aus (krank). Erwartung: Die Automatik erkennt JEDEN
// betroffenen Dienst und schlägt für jeden einen regelkonformen Ersatz vor
// (richtige Rolle, nicht selbst abwesend, AZG-konform).

function emp(id: string, type: string, extra?: Partial<SolverEmployee>): SolverEmployee {
  return {
    id, name: id, type, weeklyHoursTarget: 40,
    absentDates: new Set(), unavailableDates: new Set(), preferredDates: new Set(),
    presetHours: 0, ...extra,
  };
}
function shift(id: string, date: string, assigned: string[], extra?: Partial<SolverShift>): SolverShift {
  return { id, date, startTime: "08:00", endTime: "16:00", requiredHeadcount: assigned.length, requiredRoles: null, assignedEmployeeIds: assigned, ...extra };
}

describe("Szenario: voller Plan, eine Person fällt aus -> automatische Umbesetzung", () => {
  const week = ["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10"]; // Mo-Fr

  it("alle Dienste der Ausgefallenen bekommen einen gültigen Ersatz-Vorschlag", () => {
    // Lisa (Apothekerin) ist die GANZE Woche krank; Anna kann ersetzen.
    const employees = [
      emp("lisa", "APOTHEKER", { absentDates: new Set(week) }),
      emp("anna", "APOTHEKER"),
      emp("tom", "PKA"),
      emp("mia", "PKA"),
    ];
    // Voll besetzter Plan: Lisa Mo/Mi/Fr (Apothekerpflicht!), Tom Di, Mia Do.
    const shifts: SolverShift[] = [
      shift("mo", week[0], ["lisa"], { requiredRoles: { APOTHEKER: 1 } }),
      shift("di", week[1], ["tom"]),
      shift("mi", week[2], ["lisa"], { requiredRoles: { APOTHEKER: 1 } }),
      shift("do", week[3], ["mia"]),
      shift("fr", week[4], ["lisa"], { requiredRoles: { APOTHEKER: 1 } }),
    ];

    // 1) Konflikt-Erkennung findet GENAU Lisas 3 Dienste
    const conflicts = findHardConflicts(shifts, employees).filter((c) => c.employeeId === "lisa");
    expect(conflicts.map((c) => c.shiftId).sort()).toEqual(["fr", "mi", "mo"]);

    // 2) Für jeden Konflikt gibt es einen Ersatz-Vorschlag — und der ist gültig
    for (const c of conflicts) {
      const sug = suggestReassignment(c, shifts, employees);
      expect(sug, `Kein Ersatz für ${c.shiftId}`).not.toBeNull();
      expect(sug!.toEmployeeId).toBe("anna"); // einzige verfügbare Apothekerin (Rollenpflicht!)
      expect(sug!.toEmployeeId).not.toBe("lisa");
    }
  });

  it("kein untauglicher Ersatz: wenn niemand die Rolle erfüllt, wird ehrlich NICHTS vorgeschlagen", () => {
    const employees = [
      emp("lisa", "APOTHEKER", { absentDates: new Set([week[0]]) }),
      emp("tom", "PKA"), // keine Apotheker-Rolle -> darf nicht vorgeschlagen werden
    ];
    const shifts = [shift("mo", week[0], ["lisa"], { requiredRoles: { APOTHEKER: 1 } })];
    const c = findHardConflicts(shifts, employees)[0];
    const sug = suggestReassignment(c, shifts, employees);
    expect(sug).toBeNull(); // lieber "bitte manuell" als illegale Besetzung
  });

  it("Belastungsausgleich: bei zwei gleich geeigneten Kandidaten gewinnt der weniger belastete", () => {
    const employees = [
      emp("lisa", "PKA", { absentDates: new Set([week[4]]) }),
      emp("tom", "PKA"),
      emp("mia", "PKA"),
    ];
    // Tom hat diese Woche schon 2 Dienste, Mia keinen -> Mia soll einspringen.
    const shifts: SolverShift[] = [
      shift("mo", week[0], ["tom"]),
      shift("di", week[1], ["tom"]),
      shift("fr", week[4], ["lisa"]),
    ];
    const c = findHardConflicts(shifts, employees).find((x) => x.shiftId === "fr")!;
    const sug = suggestReassignment(c, shifts, employees);
    expect(sug?.toEmployeeId).toBe("mia");
  });
});

describe("Fairness-Engine aktiv in der Zuteilung (v0.63)", () => {
  it("bei gleichwertigen Kandidaten gewinnt der niedrigere Fairness-Score", () => {
    const employees = [
      emp("lisa", "PKA", { absentDates: new Set(["2026-07-10"]) }),
      emp("tom", "PKA", { fairnessScore: 90 }), // historisch stark belastet
      emp("mia", "PKA", { fairnessScore: 10 }), // historisch wenig belastet
    ];
    const shifts: SolverShift[] = [
      { id: "fr", date: "2026-07-10", startTime: "08:00", endTime: "16:00", requiredHeadcount: 1, requiredRoles: null, assignedEmployeeIds: ["lisa"] },
    ];
    const c = findHardConflicts(shifts, employees)[0];
    const sug = suggestReassignment(c, shifts, employees);
    expect(sug?.toEmployeeId).toBe("mia");
  });
});
