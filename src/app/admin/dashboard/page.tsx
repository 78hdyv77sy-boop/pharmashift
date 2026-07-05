import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Siren, Moon } from "lucide-react";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { dateAtUTC, addDays, todayISO, formatDayLabel, weekdayShort } from "@/lib/domain/dates";
import { Badge } from "@/components/ui/badge";
import { AbsenceInbox, type InboxAbsence } from "./absence-inbox";
import { WeekOverview } from "./week-overview";
import { computeInsights } from "@/lib/domain/insights";
import { getTasksForDate } from "../tasks/actions";
import { TodayTasks } from "./today-tasks";
import { Sparkles, CheckCircle2, Circle } from "lucide-react";

// UX-P2 / Befund U6: "Heute"-Operationsansicht statt Vanity-Charts.
// Beantwortet: Wer fehlt heute? Wo ist es unterbesetzt? Was muss ich genehmigen?

export default async function TodayPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  let orgId: string;
  try {
    ({ orgId } = await requireOrg());
  } catch {
    return <p className="text-sm text-muted-foreground">Keine aktive Organisation.</p>;
  }

  const perms = session.user.isSuperAdmin
    ? new Set(Object.values(PERMISSIONS))
    : await getUserPermissions(session.user.id, orgId);
  if (!perms.has(PERMISSIONS.SHIFT_VIEW)) {
    return <p className="text-sm text-destructive">Keine Berechtigung.</p>;
  }

  const today = todayISO();
  const dayStart = dateAtUTC(today);
  const dayEnd = dateAtUTC(addDays(today, 1));
  const tomorrowEnd = dateAtUTC(addDays(today, 2));

  const [shifts, pending, absentToday, duties] = await Promise.all([
    prisma.shift.findMany({
      where: { orgId, deletedAt: null, date: { gte: dayStart, lt: dayEnd } },
      orderBy: [{ startTime: "asc" }],
      include: { location: true, assignments: { include: { employee: true } } },
    }),
    prisma.absence.findMany({
      where: { status: "REQUESTED", employee: { orgId } },
      orderBy: { startDate: "asc" },
      include: { employee: true },
      take: 8,
    }),
    prisma.absence.findMany({
      where: { status: "APPROVED", employee: { orgId }, startDate: { lte: dayStart }, endDate: { gte: dayStart } },
      include: { employee: true },
    }),
    prisma.emergencyDuty.findMany({
      where: { location: { orgId }, date: { gte: dayStart, lt: tomorrowEnd } },
      include: { location: true, employee: true },
      orderBy: [{ date: "asc" }],
    }),
  ]);

  const [insights, counts] = await Promise.all([
    computeInsights(orgId),
    Promise.all([
      prisma.location.count({ where: { orgId, deletedAt: null } }),
      prisma.employee.count({ where: { orgId, deletedAt: null } }),
      prisma.shift.count({ where: { orgId, deletedAt: null } }),
    ]),
  ]);
  const [locCount, empCount, shiftCount] = counts;
  const onboarding = locCount === 0 || empCount === 0 || shiftCount === 0;

  const gaps = shifts.filter((s) => s.assignments.length < s.requiredHeadcount);
  const inboxItems: InboxAbsence[] = pending.map((a) => ({
    id: a.id,
    name: `${a.employee.firstName} ${a.employee.lastName}`,
    range: a.startDate.getTime() === a.endDate.getTime()
      ? formatDayLabel(a.startDate.toISOString().slice(0, 10))
      : `${formatDayLabel(a.startDate.toISOString().slice(0, 10))}–${formatDayLabel(a.endDate.toISOString().slice(0, 10))}`,
    type: a.type,
  }));

  const byLocation = new Map<string, { name: string; shifts: typeof shifts }>();
  for (const s of shifts) {
    const entry = byLocation.get(s.locationId) ?? { name: s.location.name, shifts: [] as typeof shifts };
    entry.shifts.push(s);
    byLocation.set(s.locationId, entry);
  }

  const taskInstances = !onboarding && perms.has(PERMISSIONS.TASK_VIEW) ? await getTasksForDate(today) : [];

  // Laufender Nachtdienst des angemeldeten Users? -> prominenter Schnellzugriff
  const runningDuty = !onboarding
    ? await prisma.nightDuty.findFirst({
        where: { orgId, closedAt: null, employee: { userId: session.user.id } },
        orderBy: { date: "desc" },
        select: { id: true },
      })
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Heute</h1>
        <p className="text-sm text-muted-foreground">{weekdayShort(today)} {formatDayLabel(today)} · Ihr operativer Überblick.</p>
      </div>

      {/* Kompakter Wochen-Dienstplan-Überblick (eigene Zeile hervorgehoben) */}
      {!onboarding && <WeekOverview orgId={orgId} userId={session.user.id} />}

      {/* UX-P3 U10: Onboarding-Checkliste für leere Orgs */}
      {onboarding && (
        <section className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <h2 className="mb-2 text-sm font-semibold">Erste Schritte</h2>
          <ul className="space-y-1.5 text-sm">
            <li className="flex items-center gap-2">
              {locCount > 0 ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
              <Link href="/admin/locations" className={locCount > 0 ? "text-muted-foreground line-through" : "underline"}>1. Standort anlegen</Link>
            </li>
            <li className="flex items-center gap-2">
              {empCount > 0 ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
              <Link href="/admin/employees" className={empCount > 0 ? "text-muted-foreground line-through" : "underline"}>2. Mitarbeiter anlegen (oder CSV-Import)</Link>
            </li>
            <li className="flex items-center gap-2">
              {shiftCount > 0 ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
              <Link href="/admin/shifts" className={shiftCount > 0 ? "text-muted-foreground line-through" : "underline"}>3. Erste Schicht im Dienstplan anlegen</Link>
            </li>
          </ul>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Anträge-Inbox */}
        <section className="rounded-lg border p-4 lg:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Posteingang</h2>
            {pending.length > 0 && <Badge variant="warning">{pending.length}</Badge>}
          </div>
          <AbsenceInbox items={inboxItems} canApprove={perms.has(PERMISSIONS.ABSENCE_APPROVE)} />
          {/* UX2-P2 N7: EIN priorisierter Posteingang — Hinweise direkt unter den Anträgen */}
          {!onboarding && insights.length > 0 && (
            <ul className="mt-3 space-y-1 border-t pt-3">
              {insights.map((ins, i) => (
                <li key={i}>
                  <Link href={ins.href} className={`text-sm underline-offset-2 hover:underline ${ins.severity === "warn" ? "text-amber-800" : "text-muted-foreground"}`}>
                    {ins.severity === "warn" ? "⚠ " : ""}{ins.message}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/admin/absences" className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            Alle Abwesenheiten <ArrowRight className="h-3 w-3" />
          </Link>
        </section>

        {/* Heutige Schichten + Lücken */}
        <section className="rounded-lg border p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Heutige Schichten</h2>
            {gaps.length > 0
              ? <Badge variant="warning">{gaps.length} unterbesetzt</Badge>
              : shifts.length > 0 ? <Badge variant="success">voll besetzt</Badge> : null}
          </div>
          {shifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Schichten heute. <Link className="underline" href="/admin/shifts">Zum Dienstplan</Link></p>
          ) : (
            <div className="space-y-3">
              {Array.from(byLocation.entries()).map(([locId, loc]) => (
                <div key={locId}>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">{loc.name}</p>
                  <ul className="space-y-1.5">
                    {loc.shifts.map((s) => {
                      const under = s.assignments.length < s.requiredHeadcount;
                      return (
                        <li key={s.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                          <div className="min-w-0">
                            <span className="font-medium">{s.startTime}–{s.endTime}</span>{" "}
                            <span className="text-muted-foreground">
                              {s.assignments.length ? s.assignments.map((a) => `${a.employee.firstName} ${a.employee.lastName}`).join(", ") : "—"}
                            </span>
                          </div>
                          <Badge variant={under ? "warning" : "success"}>{s.assignments.length}/{s.requiredHeadcount}</Badge>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {absentToday.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Heute abwesend: {absentToday.map((a) => `${a.employee.firstName} ${a.employee.lastName}`).join(", ")}
            </p>
          )}
        </section>
      </div>

      {/* Aufgaben heute (abhakbar) */}
      {runningDuty && (
        <Link
          href="/admin/nightduty"
          className="flex items-center justify-between gap-3 rounded-xl border-2 border-primary bg-primary/[0.06] px-4 py-3 transition hover:bg-primary/[0.1]"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-primary">
            <Moon className="h-5 w-5" /> Dein Nachtdienst läuft
          </span>
          <span className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">+ Kunde erfassen →</span>
        </Link>
      )}

      {taskInstances.length > 0 && <TodayTasks today={today} instances={taskInstances} />}

      {/* Notdienst heute/morgen */}
      <section className="rounded-lg border p-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><Siren className="h-4 w-4" /> Notdienst</h2>
        {duties.length === 0 ? (
          <p className="text-sm text-muted-foreground">Kein Notdienst heute/morgen eingetragen. <Link className="underline" href="/admin/emergency">Zur Rotation</Link></p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {duties.map((d) => (
              <span key={d.id} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
                <span className="text-muted-foreground">{d.date.getTime() === dayStart.getTime() ? "Heute" : "Morgen"} · {d.location.name}:</span>
                <span className="font-medium">{d.employee ? `${d.employee.firstName} ${d.employee.lastName}` : "offen"}</span>
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
