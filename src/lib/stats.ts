import { prisma } from "@/lib/prisma";

export interface OrgStats {
  totals: { members: number; employees: number; roles: number; pendingInvites: number };
  membersByStatus: { label: string; value: number }[];
  employeesByType: { label: string; value: number }[];
  membersByMonth: { label: string; value: number }[];
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Aktiv",
  INVITED: "Eingeladen",
  SUSPENDED: "Gesperrt",
};

const TYPE_LABEL: Record<string, string> = {
  APOTHEKER: "Apotheker:in",
  PKA: "PKA",
  BUERO: "Bürobedienstete:r",
  ASPIRANT: "Aspirant:in",
  LEHRLING: "Lehrling",
  SONSTIGE: "Sonstiges",
};

export async function getOrgStats(orgId: string): Promise<OrgStats> {
  const [members, employees, roles, pendingInvites, statusGroups, typeGroups, recentMembers] =
    await Promise.all([
      prisma.membership.count({ where: { orgId } }),
      prisma.employee.count({ where: { orgId, deletedAt: null } }),
      prisma.role.count({ where: { orgId } }),
      prisma.invitation.count({ where: { orgId, status: "PENDING" } }),
      prisma.membership.groupBy({ by: ["status"], where: { orgId }, _count: true }),
      prisma.employee.groupBy({ by: ["type"], where: { orgId, deletedAt: null }, _count: true }),
      prisma.membership.findMany({ where: { orgId }, select: { createdAt: true } }),
    ]);

  const membersByStatus = statusGroups.map((g) => ({
    label: STATUS_LABEL[g.status] ?? g.status,
    value: g._count,
  }));

  const employeesByType = typeGroups.map((g) => ({
    label: TYPE_LABEL[g.type] ?? g.type,
    value: g._count,
  }));

  // Letzte 6 Monate: neue Mitglieder pro Monat
  const now = new Date();
  const buckets: { key: string; label: string; value: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString("de-DE", { month: "short" }),
      value: 0,
    });
  }
  for (const m of recentMembers) {
    const d = new Date(m.createdAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const bucket = buckets.find((b) => b.key === key);
    if (bucket) bucket.value++;
  }

  return {
    totals: { members, employees, roles, pendingInvites },
    membersByStatus,
    employeesByType,
    membersByMonth: buckets.map((b) => ({ label: b.label, value: b.value })),
  };
}
