import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Arch-P1 / G3: TENANCY-AUDIT — macht aus "Disziplin" eine maschinelle Prüfung.
// Jede Mengen-Query (findMany/findFirst/count/updateMany/deleteMany/aggregate)
// auf einem Tenant-Modell muss im Aufruf orgId-Scoping enthalten:
// direkt (orgId), über Relation (employee:{orgId}/location:{orgId}/org-Pfad)
// oder explizit als geprüfte Ausnahme markiert (// tenancy-ok: <Grund>).

const ROOT = join(__dirname, "..");
const TENANT_MODELS = [
  "employee", "shift", "shiftPlan", "shiftTemplate", "absence", "availability",
  "location", "emergencyDuty", "auditLog", "agentInteraction", "setting",
  "membership", "role", "userRole", "invitation", "page", "menu", "media",
];
const OPS = ["findMany", "findFirst", "count", "updateMany", "deleteMany", "aggregate", "groupBy"];

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(p);
  }
  return acc;
}

const SCOPE_MARKERS = [
  "orgId",
  "employee: { orgId",
  "employee: {orgId",
  "location: { orgId",
  "shift: { orgId",
  "employee: { orgId:",
  "org: {",
];

describe("Tenancy-Audit (G3)", () => {
  const files = walk(join(ROOT, "app")).concat(walk(join(ROOT, "lib")));
  const violations: string[] = [];

  for (const file of files) {
    const src = readFileSync(file, "utf-8");
    for (const model of TENANT_MODELS) {
      for (const op of OPS) {
        const needle = `prisma.${model}.${op}(`;
        let idx = src.indexOf(needle);
        while (idx !== -1) {
          // Aufrufs-Slice: bis zur (heuristisch) schließenden Stelle
          const slice = src.slice(idx, idx + 600);
          // Vorlauf einbeziehen: vorab gebaute where-Objekte / Ownership-Checks
          const context = src.slice(Math.max(0, idx - 800), idx);
          const hasScope = SCOPE_MARKERS.some((m) => slice.includes(m) || context.includes(m));
          const hasOk = context.includes("tenancy-ok:") || slice.includes("tenancy-ok:");
          if (!hasScope && !hasOk) {
            const line = src.slice(0, idx).split("\n").length;
            violations.push(`${file.replace(ROOT, "src")}:${line} -> ${model}.${op} ohne orgId-Scoping`);
          }
          idx = src.indexOf(needle, idx + 1);
        }
      }
    }
  }

  it("keine Mengen-Query auf Tenant-Modellen ohne orgId-Scoping", () => {
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
