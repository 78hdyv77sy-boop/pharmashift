import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { EMPLOYEE_TYPE_LABEL } from "@/lib/domain/employee-types";
import { todayISO } from "@/lib/domain/dates";

export interface AgentContext {
  today: string;
  employees: { id: string; name: string; type: string; typeLabel: string }[];
  locations: { id: string; name: string }[];
  roles: { id: string; name: string }[];
  /** Org-Memory (AI-P2 / 8.6 V7b): gelernte Aliase, z. B. "die Kleine" -> Standort */
  aliases: { alias: string; targetType: "location" | "employee"; targetId: string }[];
}

export const AGENT_ALIASES_KEY = "agent.aliases";

export const getAgentContext = cache(async function getAgentContextImpl(orgId: string): Promise<AgentContext> {
  const [employees, locations, roles, aliasSetting] = await Promise.all([
    prisma.employee.findMany({
      where: { orgId, deletedAt: null, active: true },
      orderBy: { lastName: "asc" },
      select: { id: true, firstName: true, lastName: true, type: true },
    }),
    prisma.location.findMany({ where: { orgId, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.role.findMany({ where: { orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.setting.findUnique({ where: { orgId_key: { orgId, key: AGENT_ALIASES_KEY } } }),
  ]);

  const rawAliases = (aliasSetting?.value ?? []) as unknown;
  const aliases = Array.isArray(rawAliases)
    ? (rawAliases as { alias?: string; targetType?: string; targetId?: string }[])
        .filter((a) => typeof a.alias === "string" && a.alias.trim() && (a.targetType === "location" || a.targetType === "employee") && typeof a.targetId === "string")
        .map((a) => ({ alias: a.alias!.trim(), targetType: a.targetType as "location" | "employee", targetId: a.targetId! }))
        .slice(0, 50)
    : [];

  return {
    today: todayISO(),
    employees: employees.map((e) => ({
      id: e.id,
      name: `${e.firstName} ${e.lastName}`,
      type: e.type,
      typeLabel: EMPLOYEE_TYPE_LABEL[e.type] ?? e.type,
    })),
    locations,
    roles,
    aliases,
  };
});
