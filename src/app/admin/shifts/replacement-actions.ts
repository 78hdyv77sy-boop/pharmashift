"use server";

import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { findReplacements, type ReplacementResult } from "@/lib/domain/replacement";

export async function getReplacements(
  employeeId: string,
  date: string,
): Promise<{ ok: boolean; result?: ReplacementResult; error?: string }> {
  const { orgId } = await requirePermission(PERMISSIONS.SHIFT_MANAGE);
  if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Mitarbeiter und Datum erforderlich." };
  const result = await findReplacements(orgId, employeeId, date);
  return { ok: true, result };
}
