import { prisma } from "@/lib/prisma";
import type { ShiftTemplateRow } from "@/lib/domain/template-types";

export type { ShiftTemplateRow } from "@/lib/domain/template-types";

function headcountOf(requiredRoles: unknown): number {
  if (requiredRoles && typeof requiredRoles === "object" && "count" in requiredRoles) {
    const c = (requiredRoles as { count?: unknown }).count;
    if (typeof c === "number" && c > 0) return c;
  }
  return 1;
}

export async function listTemplates(orgId: string): Promise<ShiftTemplateRow[]> {
  const templates = await prisma.shiftTemplate.findMany({
    where: { orgId },
    orderBy: { name: "asc" },
    include: { location: true },
  });
  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    locationId: t.locationId,
    locationName: t.location?.name ?? null,
    startTime: t.startTime,
    endTime: t.endTime,
    requiredHeadcount: headcountOf(t.requiredRoles),
    color: t.color,
  }));
}
