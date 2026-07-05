"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { dateAtUTC } from "@/lib/domain/dates";
import { isTaskDue } from "@/lib/domain/task-recurrence";
import type { TaskRow, TaskInstance, TaskEmployeeOption, TaskLocationOption } from "./task-types";
import type { TaskRecurrenceValue, TaskAssigneeValue } from "@/lib/domain/task-recurrence";

type Result = { ok: boolean; error?: string; message?: string; id?: string };
type Ctx = { orgId: string; userId: string; session: { user: { isSuperAdmin?: boolean; name?: string | null; email?: string | null } } };

async function hasTaskManage(c: Ctx): Promise<boolean> {
  if (c.session.user.isSuperAdmin) return true;
  const perms = await getUserPermissions(c.userId, c.orgId);
  return perms.has(PERMISSIONS.TASK_MANAGE);
}
async function getMyEmployeeIds(orgId: string, userId: string): Promise<Set<string>> {
  const emps = await prisma.employee.findMany({ where: { orgId, userId, deletedAt: null }, select: { id: true } });
  return new Set(emps.map((e) => e.id));
}

const taskSchema = z.object({
  title: z.string().min(1, "Titel erforderlich").max(200),
  description: z.string().max(1000).optional(),
  locationId: z.string().optional(),
  assigneeType: z.enum(["PERSON", "SHIFT"]),
  assigneeEmployeeId: z.string().optional(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Zeit HH:MM").optional().or(z.literal("")),
  recurrence: z.enum(["ONCE", "DAILY", "WEEKLY", "SHIFT"]),
  weekday: z.coerce.number().int().min(0).max(6).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
});

// ---- Formulardaten ----------------------------------------------------------
export async function listTaskFormData(): Promise<{ employees: TaskEmployeeOption[]; locations: TaskLocationOption[] }> {
  const { orgId } = await requirePermission(PERMISSIONS.TASK_VIEW);
  const [emps, locs] = await Promise.all([
    prisma.employee.findMany({ where: { orgId, deletedAt: null, active: true }, orderBy: [{ lastName: "asc" }], select: { id: true, firstName: true, lastName: true } }),
    prisma.location.findMany({ where: { orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return {
    employees: emps.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}` })),
    locations: locs.map((l) => ({ id: l.id, name: l.name })),
  };
}

// ---- Verwaltung (CRUD) ------------------------------------------------------
export async function listTasks(): Promise<TaskRow[]> {
  const { orgId } = await requirePermission(PERMISSIONS.TASK_VIEW);
  const tasks = await prisma.task.findMany({ where: { orgId, deletedAt: null }, orderBy: [{ active: "desc" }, { title: "asc" }] });
  const empIds = [...new Set(tasks.map((t) => t.assigneeEmployeeId).filter(Boolean) as string[])];
  const locIds = [...new Set(tasks.map((t) => t.locationId).filter(Boolean) as string[])];
  const [emps, locs] = await Promise.all([
    empIds.length ? prisma.employee.findMany({ where: { id: { in: empIds }, orgId }, select: { id: true, firstName: true, lastName: true } }) : Promise.resolve([]),
    locIds.length ? prisma.location.findMany({ where: { id: { in: locIds }, orgId }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const empName = new Map(emps.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));
  const locName = new Map(locs.map((l) => [l.id, l.name]));
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    assigneeType: t.assigneeType as TaskAssigneeValue,
    assigneeName: t.assigneeEmployeeId ? empName.get(t.assigneeEmployeeId) ?? null : null,
    locationName: t.locationId ? locName.get(t.locationId) ?? null : null,
    time: t.time,
    recurrence: t.recurrence as TaskRecurrenceValue,
    weekday: t.weekday,
    dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
    active: t.active,
  }));
}

function normalize(d: z.infer<typeof taskSchema>, orgId: string) {
  return {
    orgId,
    title: d.title.trim(),
    description: d.description?.trim() || null,
    locationId: d.locationId || null,
    assigneeType: d.assigneeType,
    assigneeEmployeeId: d.assigneeType === "PERSON" ? d.assigneeEmployeeId || null : null,
    time: d.time || null,
    recurrence: d.recurrence,
    weekday: d.recurrence === "WEEKLY" ? d.weekday ?? 1 : null,
    dueDate: d.recurrence === "ONCE" && d.dueDate ? dateAtUTC(d.dueDate) : null,
  };
}

async function validateRefs(c: Ctx, d: z.infer<typeof taskSchema>): Promise<string | null> {
  if (d.assigneeType === "PERSON") {
    if (!d.assigneeEmployeeId) return "Bitte eine Person wählen.";
    const emp = await prisma.employee.findFirst({ where: { id: d.assigneeEmployeeId, orgId: c.orgId }, select: { id: true } });
    if (!emp) return "Unbekannte Person.";
  }
  if (d.locationId) {
    const loc = await prisma.location.findFirst({ where: { id: d.locationId, orgId: c.orgId }, select: { id: true } });
    if (!loc) return "Unbekannter Standort.";
  }
  if (d.recurrence === "ONCE" && !d.dueDate) return "Bitte ein Datum wählen (einmalig).";
  return null;
}

export async function createTask(input: unknown): Promise<Result> {
  const c = (await requirePermission(PERMISSIONS.TASK_MANAGE)) as Ctx;
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };
  const refErr = await validateRefs(c, parsed.data);
  if (refErr) return { ok: false, error: refErr };
  const task = await prisma.task.create({ data: { ...normalize(parsed.data, c.orgId), createdById: c.userId } });
  await prisma.auditLog.create({ data: { orgId: c.orgId, actorId: c.userId, action: "task.created", entity: "task", entityId: task.id } });
  revalidatePath("/admin/tasks");
  return { ok: true, id: task.id, message: "Aufgabe angelegt." };
}

export async function updateTask(taskId: string, input: unknown): Promise<Result> {
  const c = (await requirePermission(PERMISSIONS.TASK_MANAGE)) as Ctx;
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };
  const existing = await prisma.task.findFirst({ where: { id: taskId, orgId: c.orgId, deletedAt: null }, select: { id: true } });
  if (!existing) return { ok: false, error: "Aufgabe nicht gefunden." };
  const refErr = await validateRefs(c, parsed.data);
  if (refErr) return { ok: false, error: refErr };
  await prisma.task.update({ where: { id: taskId }, data: normalize(parsed.data, c.orgId) });
  revalidatePath("/admin/tasks");
  return { ok: true, message: "Aufgabe gespeichert." };
}

export async function setTaskActive(taskId: string, active: boolean): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.TASK_MANAGE);
  const res = await prisma.task.updateMany({ where: { id: taskId, orgId, deletedAt: null }, data: { active } });
  if (res.count === 0) return { ok: false, error: "Nicht gefunden." };
  revalidatePath("/admin/tasks");
  return { ok: true };
}

export async function deleteTask(taskId: string): Promise<Result> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.TASK_MANAGE);
  const res = await prisma.task.updateMany({ where: { id: taskId, orgId, deletedAt: null }, data: { deletedAt: new Date() } });
  if (res.count === 0) return { ok: false, error: "Nicht gefunden." };
  await prisma.auditLog.create({ data: { orgId, actorId: userId, action: "task.deleted", entity: "task", entityId: taskId } });
  revalidatePath("/admin/tasks");
  return { ok: true, message: "Aufgabe gelöscht." };
}

// ---- Tagesansicht (fällige Aufgaben + Erledigung) --------------------------
export async function getTasksForDate(dateIso: string): Promise<TaskInstance[]> {
  const c = (await requirePermission(PERMISSIONS.TASK_VIEW)) as Ctx;
  const { orgId, userId } = c;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return [];
  const dayStart = dateAtUTC(dateIso);
  const dow = dayStart.getUTCDay();
  const manage = await hasTaskManage(c);
  const myEmp = await getMyEmployeeIds(orgId, userId);

  const [tasks, dayShifts] = await Promise.all([
    prisma.task.findMany({ where: { orgId, deletedAt: null, active: true } }),
    prisma.shift.findMany({
      where: { orgId, deletedAt: null, date: dayStart },
      select: { locationId: true, assignments: { select: { employeeId: true } } },
    }),
  ]);

  const taskIds = tasks.map((t) => t.id);
  const [completions, emps, locs] = await Promise.all([
    taskIds.length ? prisma.taskCompletion.findMany({ where: { orgId, taskId: { in: taskIds }, date: dayStart } }) : Promise.resolve([]),
    prisma.employee.findMany({ where: { orgId, deletedAt: null }, select: { id: true, firstName: true, lastName: true } }),
    prisma.location.findMany({ where: { orgId }, select: { id: true, name: true } }),
  ]);
  const empName = new Map(emps.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));
  const locName = new Map(locs.map((l) => [l.id, l.name]));
  const compByTask = new Map(completions.map((c2) => [c2.taskId, c2]));

  function shiftsForTask(t: (typeof tasks)[number]) {
    let list = dayShifts;
    if (t.locationId) list = list.filter((s) => s.locationId === t.locationId);
    if (t.assigneeType === "PERSON" && t.assigneeEmployeeId) {
      const id = t.assigneeEmployeeId;
      list = list.filter((s) => s.assignments.some((a) => a.employeeId === id));
    }
    return list;
  }
  function iAmOnShift(t: (typeof tasks)[number]) {
    let list = dayShifts;
    if (t.locationId) list = list.filter((s) => s.locationId === t.locationId);
    return list.some((s) => s.assignments.some((a) => myEmp.has(a.employeeId)));
  }

  const out: TaskInstance[] = [];
  for (const t of tasks) {
    const shiftPresent = shiftsForTask(t).length > 0;
    if (!isTaskDue({ recurrence: t.recurrence as TaskRecurrenceValue, weekday: t.weekday, dueDateIso: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null }, dateIso, dow, shiftPresent)) continue;

    const comp = compByTask.get(t.id) ?? null;
    const mineByPerson = t.assigneeType === "PERSON" && !!t.assigneeEmployeeId && myEmp.has(t.assigneeEmployeeId);
    const mineByShift = t.assigneeType === "SHIFT" && iAmOnShift(t);
    out.push({
      taskId: t.id,
      title: t.title,
      description: t.description,
      time: t.time,
      assigneeType: t.assigneeType as TaskAssigneeValue,
      assigneeName: t.assigneeEmployeeId ? empName.get(t.assigneeEmployeeId) ?? null : null,
      locationName: t.locationId ? locName.get(t.locationId) ?? null : null,
      done: !!comp,
      doneByName: comp?.completedByName ?? null,
      doneAt: comp?.completedAt ? comp.completedAt.toISOString() : null,
      canComplete: manage || mineByPerson || mineByShift,
    });
  }
  // nach Uhrzeit dann Titel sortieren
  out.sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99") || a.title.localeCompare(b.title));
  return out;
}

export async function toggleTaskCompletion(taskId: string, dateIso: string, done: boolean): Promise<Result> {
  const c = (await requirePermission(PERMISSIONS.TASK_VIEW)) as Ctx;
  const { orgId, userId } = c;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return { ok: false, error: "Ungültiges Datum." };
  const day = dateAtUTC(dateIso);

  const task = await prisma.task.findFirst({ where: { id: taskId, orgId, deletedAt: null } });
  if (!task) return { ok: false, error: "Aufgabe nicht gefunden." };

  // Rechteprüfung: Leitung ODER eigene Aufgabe ODER an dem Tag im Dienst
  const manage = await hasTaskManage(c);
  let allowed = manage;
  if (!allowed) {
    const myEmp = await getMyEmployeeIds(orgId, userId);
    if (task.assigneeType === "PERSON" && task.assigneeEmployeeId && myEmp.has(task.assigneeEmployeeId)) allowed = true;
    else if (task.assigneeType === "SHIFT") {
      const shifts = await prisma.shift.findMany({
        where: { orgId, deletedAt: null, date: day, ...(task.locationId ? { locationId: task.locationId } : {}) },
        select: { assignments: { select: { employeeId: true } } },
      });
      allowed = shifts.some((s) => s.assignments.some((a) => myEmp.has(a.employeeId)));
    }
  }
  if (!allowed) return { ok: false, error: "Keine Berechtigung für diese Aufgabe." };

  if (done) {
    const name = c.session.user.name ?? c.session.user.email ?? "—";
    await prisma.taskCompletion.upsert({
      where: { taskId_date: { taskId, date: day } },
      update: { completedByUserId: userId, completedByName: name, completedAt: new Date() },
      create: { orgId, taskId, date: day, completedByUserId: userId, completedByName: name },
    });
  } else {
    await prisma.taskCompletion.deleteMany({ where: { taskId, date: day } });
  }
  revalidatePath("/admin/tasks");
  return { ok: true };
}
