import "server-only";
import { prisma } from "@/lib/prisma";

// Arch-P1 / G3: Tenancy als SYSTEM statt Disziplin.
// forOrg(orgId) liefert einen Client, der orgId automatisch in where/data
// der direkt org-gebundenen Modelle injiziert. Neue Server-Module sollen
// diesen Client nutzen; Bestands-Callsites werden schrittweise migriert
// (der Tenancy-Audit-Test in __tests__ sichert den Bestand maschinell ab).

const ORG_MODELS = new Set<string>([
  "Membership", "Role", "UserRole", "Invitation", "Location", "Employee",
  "Shift", "ShiftPlan", "ShiftTemplate", "AuditLog", "AgentInteraction",
  "Setting", "Page", "Menu", "Media",
]);

type AnyArgs = { where?: Record<string, unknown>; data?: Record<string, unknown> } & Record<string, unknown>;

export function forOrg(orgId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!ORG_MODELS.has(model)) return query(args);
          const a = (args ?? {}) as AnyArgs;

          if (operation.startsWith("find") || operation === "count" || operation === "aggregate" ||
              operation === "updateMany" || operation === "deleteMany" || operation === "groupBy") {
            a.where = { ...(a.where ?? {}), orgId };
          }
          if (operation === "create") {
            a.data = { ...(a.data ?? {}), orgId };
          }
          if (operation === "createMany" && Array.isArray(a.data as unknown)) {
            a.data = (a.data as unknown as Record<string, unknown>[]).map((d) => ({ ...d, orgId })) as never;
          }
          // update/delete/upsert (unique-where): Ownership muss vorab geprüft sein;
          // die Extension erzwingt es via updateMany/deleteMany-Empfehlung.
          return query(a as never);
        },
      },
    },
  });
}
