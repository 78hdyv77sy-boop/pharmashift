import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { todayISO } from "@/lib/domain/dates";
import { getTasksForDate, listTasks, listTaskFormData } from "./actions";
import { TasksClient } from "./tasks-client";

export default async function TasksPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  let orgId: string;
  try {
    orgId = (await requireOrg()).orgId;
  } catch {
    return <p className="text-sm text-muted-foreground">Keine aktive Organisation.</p>;
  }
  const perms = session.user.isSuperAdmin
    ? new Set(Object.values(PERMISSIONS))
    : await getUserPermissions(session.user.id, orgId);
  const canManage = perms.has(PERMISSIONS.TASK_MANAGE);

  const today = todayISO();
  const [instances, tasks, formData] = await Promise.all([
    getTasksForDate(today),
    canManage ? listTasks() : Promise.resolve([]),
    canManage ? listTaskFormData() : Promise.resolve({ employees: [], locations: [] }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Aufgaben</h1>
        <p className="text-sm text-muted-foreground">
          Aufgaben pro Person oder Schicht – einmalig, täglich, wöchentlich oder schichtgebunden. Erledigungen sind für die Leitung einsehbar.
        </p>
      </div>
      <TasksClient today={today} instances={instances} tasks={tasks} employees={formData.employees} locations={formData.locations} canManage={canManage} />
    </div>
  );
}
