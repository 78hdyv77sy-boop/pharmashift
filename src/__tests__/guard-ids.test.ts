import { describe, it, expect } from "vitest";
import { guardIds } from "@/lib/agent/pure";
import type { AgentContext } from "@/lib/agent/context";

const ctx: AgentContext = {
  today: "2026-06-11",
  employees: [{ id: "emp-1", name: "A B", type: "PKA", typeLabel: "PKA" }],
  locations: [{ id: "loc-1", name: "L" }],
  roles: [{ id: "role-1", name: "R" }],
  aliases: [],
};

describe("ID-Wachhund (8.7 S1)", () => {
  it("leert unbekannte employeeId und warnt", () => {
    const g = guardIds({ employeeId: "emp-FREMD", startDate: "2026-06-12" }, ctx);
    expect(g.values.employeeId).toBe("");
    expect(g.values.startDate).toBe("2026-06-12");
    expect(g.warnings.length).toBe(1);
  });
  it("lässt bekannte IDs unangetastet (keine Warnung)", () => {
    const g = guardIds({ employeeId: "emp-1", locationId: "loc-1", roleId: "role-1" }, ctx);
    expect(g.values).toEqual({ employeeId: "emp-1", locationId: "loc-1", roleId: "role-1" });
    expect(g.warnings.length).toBe(0);
  });
  it("prüft auch employeeAId/employeeBId (Swap)", () => {
    const g = guardIds({ employeeAId: "emp-1", employeeBId: "boese-id" }, ctx);
    expect(g.values.employeeAId).toBe("emp-1");
    expect(g.values.employeeBId).toBe("");
    expect(g.warnings[0]).toContain("employeeBId");
  });
});
