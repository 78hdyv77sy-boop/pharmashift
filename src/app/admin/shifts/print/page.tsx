import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getWeekData } from "@/lib/domain/shifts";
import { mondayOf, addDays, todayISO, weekDays, weekdayShort, formatDayLabel } from "@/lib/domain/dates";
import { EMPLOYEE_TYPE_LABEL } from "@/lib/domain/employee-types";
import { PrintButton } from "@/components/domain/print-button";

export default async function ShiftsPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  let orgId: string;
  try {
    ({ orgId } = await requireOrg());
  } catch {
    return <p className="p-6 text-sm text-muted-foreground">Keine aktive Organisation.</p>;
  }

  const perms = session.user.isSuperAdmin
    ? new Set(Object.values(PERMISSIONS))
    : await getUserPermissions(session.user.id, orgId);
  if (!perms.has(PERMISSIONS.SHIFT_VIEW)) return <p className="p-6 text-sm text-destructive">Keine Berechtigung.</p>;

  const sp = await searchParams;
  const locationId = typeof sp.locationId === "string" ? sp.locationId : "";
  const week1 = mondayOf(typeof sp.week === "string" ? sp.week : todayISO());
  const week2 = mondayOf(addDays(week1, 7));

  const loc = await prisma.location.findFirst({ where: { id: locationId, orgId }, select: { name: true } });
  if (!loc) return <p className="p-6 text-sm text-destructive">Unbekannter Standort.</p>;

  const [data1, data2] = await Promise.all([
    getWeekData(orgId, locationId, week1),
    getWeekData(orgId, locationId, week2),
  ]);
  const weeks = [
    { label: `Woche ab ${formatDayLabel(week1)}`, days: weekDays(week1), data: data1 },
    { label: `Woche ab ${formatDayLabel(week2)}`, days: weekDays(week2), data: data2 },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 print:p-4">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-semibold">Dienstplan · {loc.name}</h1>
          <p className="text-sm text-muted-foreground">2-Wochen-Übersicht zum Ausdrucken / als PDF speichern</p>
        </div>
        <PrintButton />
      </div>

      {/* Drucktitel (nur im Druck sichtbar) */}
      <div className="hidden print:block">
        <h1 className="text-lg font-semibold">Dienstplan · {loc.name}</h1>
      </div>

      {weeks.map((w, wi) => (
        <div key={wi} className={wi === 1 ? "print:break-before-page" : ""}>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{w.label}</h2>
          <div className="overflow-x-auto"><table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-foreground/20 text-left">
                <th className="w-28 py-2 pr-3">Tag</th>
                <th className="py-2 pr-3">Schichten &amp; Zuweisungen</th>
              </tr>
            </thead>
            <tbody>
              {w.days.map((day) => {
                const shifts = w.data.shifts.filter((s) => s.date === day);
                const isWeekend = [0, 6].includes(new Date(day + "T00:00:00Z").getUTCDay());
                return (
                  <tr key={day} className={`border-b align-top ${isWeekend ? "bg-muted/30" : ""}`}>
                    <td className="whitespace-nowrap py-2 pr-3 font-medium">{weekdayShort(day)} {formatDayLabel(day)}</td>
                    <td className="py-2 pr-3">
                      {shifts.length === 0 ? (
                        <span className="text-muted-foreground">–</span>
                      ) : (
                        <div className="space-y-1">
                          {shifts.map((s) => (
                            <div key={s.id}>
                              <span className="font-medium">{s.startTime}–{s.endTime}</span>{" "}
                              {s.assignments.length ? (
                                s.assignments.map((a) => (
                                  <span key={a.employeeId}>
                                    {a.name}
                                    <span className="text-muted-foreground text-[10px] ml-0.5">
                                      ({EMPLOYEE_TYPE_LABEL[a.type] ?? a.type})
                                    </span>
                                    {", "}
                                  </span>
                                ))
                              ) : (
                                <span className="text-muted-foreground">(offen)</span>
                              )}
                              {s.notes ? <span className="text-muted-foreground"> · {s.notes}</span> : ""}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>
      ))}

      <p className="pt-4 text-xs text-muted-foreground print:fixed print:bottom-2">
        Erstellt mit PharmaShift · {new Date().toLocaleDateString("de-DE")}
      </p>
    </div>
  );
}
