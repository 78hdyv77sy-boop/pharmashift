import { describe, it, expect } from "vitest";
import { heuristic } from "@/lib/agent/pure";
import type { AgentContext } from "@/lib/agent/context";

// Golden-Utterance-Evals (8.7 S4), Stufe 1: deterministische Heuristik.
// Stufe 2 (LLM-gestützt, lokal mit API-Key) ist im Plan dokumentiert.

const ctx: AgentContext = {
  today: "2026-06-11", // Donnerstag
  employees: [
    { id: "emp-lisa", name: "Lisa Berger", type: "PKA", typeLabel: "PKA" },
    { id: "emp-tom", name: "Tom Klein", type: "APOTHEKER", typeLabel: "Apotheker:in" },
  ],
  locations: [{ id: "loc-haupt", name: "Hauptfiliale" }],
  roles: [{ id: "role-admin", name: "Admin" }],
  aliases: [],
};

function expectTool(transcript: string, toolName: string) {
  const res = heuristic(transcript, ctx);
  expect(res.type, transcript).toBe("tool");
  if (res.type === "tool") expect(res.toolName, transcript).toBe(toolName);
  return res.type === "tool" ? res : null;
}

describe("Golden Utterances (Heuristik)", () => {
  it("Abwesenheit: 'Lisa braucht Freitag frei' -> request_absence + Lisa + Freitag", () => {
    const res = expectTool("Lisa braucht Freitag frei", "request_absence")!;
    expect(res.values.employeeId).toBe("emp-lisa");
    expect(res.values.type).toBe("OTHER");
    const d = new Date(`${res.values.startDate}T00:00:00Z`);
    expect(d.getUTCDay()).toBe(5); // Freitag
    expect(res.values.startDate).toBe(res.values.endDate);
  });

  it("Krankheit: 'Tom ist morgen krank' -> SICK + Tom", () => {
    const res = expectTool("Tom ist morgen krank", "request_absence")!;
    expect(res.values.employeeId).toBe("emp-tom");
    expect(res.values.type).toBe("SICK");
  });

  it("Urlaub: 'Urlaub für Lisa am Montag nächste Woche' -> VACATION + Montag in der Zukunft", () => {
    const res = expectTool("Urlaub für Lisa am Montag nächste Woche", "request_absence")!;
    expect(res.values.type).toBe("VACATION");
    const d = new Date(`${res.values.startDate}T00:00:00Z`);
    expect(d.getUTCDay()).toBe(1);
    expect(String(res.values.startDate) > ctx.today).toBe(true);
  });

  it("Schicht: 'Neue Schicht am Dienstag abends' -> create_shift 16-20 Uhr, Standort-Default", () => {
    const res = expectTool("Neue Schicht am Dienstag abends", "create_shift")!;
    expect(res.values.locationId).toBe("loc-haupt");
    expect(res.values.startTime).toBe("16:00");
    expect(res.values.endTime).toBe("20:00");
  });

  it("Unbekanntes -> Antwort statt Tool (kein Halluzinieren)", () => {
    const res = heuristic("Wie ist das Wetter?", ctx);
    expect(res.type).toBe("answer");
  });
});
