"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission, getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { dateAtUTC, addDays, todayISO } from "@/lib/domain/dates";
import { EMPLOYEE_TYPE_LABEL } from "@/lib/domain/employee-types";
import { austrianHolidays } from "@/lib/domain/nightduty-tariffs";
import { rawScore, normalizeScores, isEveningEnd, isWeekendDow, type FairnessRange, type FairnessCounts } from "@/lib/domain/fairness";
import type { FairnessResult, FairnessRow } from "./fairness-types";

type Ctx = { orgId: string; userId: string; session: { user: { isSuperAdmin?: boolean } } };

function fromDateFor(range: FairnessRange): string | null {
  if (range === "all") return null;
  if (range === "year") return `${new Date().getUTCFullYear()}-01-01`;
  return addDays(todayISO(), -90);
}

export async function getFairnessScores(range: FairnessRange = "90d"): Promise<FairnessResult> {
  const c = (await requirePermission(PERMISSIONS.SHIFT_VIEW)) as Ctx;
  const { orgId, userId } = c;
  const viewAll = !!c.session.user.isSuperAdmin || (await getUserPermissions(userId, orgId)).has(PERMISSIONS.FAIRNESS_VIEW_ALL);

  const myEmps = await prisma.employee.findMany({ where: { orgId, userId, deletedAt: null }, select: { id: true } });
  const myEmp = new Set(myEmps.map((e) => e.id));

  const from = fromDateFor(range);
  const dateFilter = from ? { gte: dateAtUTC(from) } : undefined;

  const [employees, nightDuties, assignments] = await Promise.all([
    prisma.employee.findMany({ where: { orgId, deletedAt: null, active: true }, select: { id: true, firstName: true, lastName: true, type: true } }),
    prisma.nightDuty.findMany({ where: { orgId, ...(dateFilter ? { date: dateFilter } : {}) }, select: { employeeId: true } }),
    prisma.shiftAssignment.findMany({
      where: { shift: { orgId, deletedAt: null, ...(dateFilter ? { date: dateFilter } : {}) } },
      select: { employeeId: true, shift: { select: { date: true, endTime: true } } },
    }),
  ]);

  const counts = new Map<string, FairnessCounts>();
  const ensure = (id: string) => {
    let c2 = counts.get(id);
    if (!c2) { c2 = { night: 0, holiday: 0, weekend: 0, evening: 0 }; counts.set(id, c2); }
    return c2;
  };
  for (const nd of nightDuties) ensure(nd.employeeId).night++;

  const holidaysByYear = new Map<number, Set<string>>();
  const holidaysOf = (year: number) => {
    let s = holidaysByYear.get(year);
    if (!s) { s = austrianHolidays(year); holidaysByYear.set(year, s); }
    return s;
  };
  for (const a of assignments) {
    const d = a.shift.date;
    const iso = d.toISOString().slice(0, 10);
    const cc = ensure(a.employeeId);
    if (isWeekendDow(d.getUTCDay())) cc.weekend++;
    if (isEveningEnd(a.shift.endTime)) cc.evening++;
    if (holidaysOf(d.getUTCFullYear()).has(iso)) cc.holiday++;
  }

  const byType = new Map<string, { id: string; raw: number }[]>();
  const rawById = new Map<string, number>();
  for (const e of employees) {
    const cc = counts.get(e.id) ?? { night: 0, holiday: 0, weekend: 0, evening: 0 };
    const raw = rawScore(cc);
    rawById.set(e.id, raw);
    const arr = byType.get(e.type) ?? [];
    arr.push({ id: e.id, raw });
    byType.set(e.type, arr);
  }
  const scoreById = new Map<string, number>();
  for (const arr of byType.values()) {
    const norm = normalizeScores(arr.map((x) => x.raw));
    arr.forEach((x, i) => scoreById.set(x.id, norm[i]));
  }

  let rows: FairnessRow[] = employees.map((e) => {
    const cc = counts.get(e.id) ?? { night: 0, holiday: 0, weekend: 0, evening: 0 };
    return {
      employeeId: e.id,
      name: `${e.firstName} ${e.lastName}`,
      type: e.type,
      typeLabel: EMPLOYEE_TYPE_LABEL[e.type] ?? e.type,
      counts: cc,
      raw: rawById.get(e.id) ?? 0,
      score: scoreById.get(e.id) ?? 0,
      mine: myEmp.has(e.id),
    };
  });

  rows.sort((a, b) => a.typeLabel.localeCompare(b.typeLabel) || b.score - a.score || a.name.localeCompare(b.name));
  if (!viewAll) rows = rows.filter((r) => r.mine);

  return { range, viewAll, hasOwn: rows.some((r) => r.mine), rows };
}
