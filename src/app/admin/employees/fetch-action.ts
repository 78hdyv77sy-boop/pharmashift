"use server";

import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { getEmployee } from "@/lib/domain/employees";
import type { EmployeeFormValue } from "./employee-dialog";

export async function getEmployeeAction(
  employeeId: string,
): Promise<{ ok: boolean; employee?: EmployeeFormValue; error?: string }> {
  const { orgId } = await requirePermission(PERMISSIONS.EMPLOYEE_MANAGE);
  const e = await getEmployee(orgId, employeeId);
  if (!e) return { ok: false, error: "Mitarbeiter nicht gefunden." };
  return { ok: true, employee: e as EmployeeFormValue };
}
