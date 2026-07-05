import { prisma } from "@/lib/prisma";
import { dateAtUTC, addDays, mondayOf, weekDays, weekdayShort, todayISO } from "@/lib/domain/dates";

// Kompakter Dienstplan-Überblick (wie das Papier-Beispiel, aber aufgeräumt):
// Zeilen = Mitarbeiter, Spalten = Wochentage, Zelle = Dienstzeiten.
// KEINE Stundenbalken (bewusst kompakt). Eigene Zeile farblich hervorgehoben.

export async function WeekOverview({ orgId, userId }: { orgId: string; userId: string }) {
  const weekStart = mondayOf(todayISO());
  const days = weekDays(weekStart);
  const start = dateAtUTC(weekStart);
  const end = dateAtUTC(addDays(weekStart, 7));

  const [employees, shifts, me] = await Promise.all([
    prisma.employee.findMany({
      where: { orgId, deletedAt: null, active: true },
      orderBy: [{ type: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, type: true, userId: true },
    }),
    prisma.shift.findMany({
      where: { orgId, deletedAt: null, date: { gte: start, lt: end } },
      include: { assignments: { select: { employeeId: true } } },
    }),
    prisma.employee.findFirst({ where: { orgId, userId, deletedAt: null }, select: { id: true } }),
  ]);

  // Map: employeeId -> day(ISO) -> ["08:00–18:00", ...]
  const grid = new Map<string, Map<string, string[]>>();
  for (const sh of shifts) {
    const day = sh.date.toISOString().slice(0, 10);
    const label = `${sh.startTime}–${sh.endTime}`;
    for (const a of sh.assignments) {
      const row = grid.get(a.employeeId) ?? new Map<string, string[]>();
      const cell = row.get(day) ?? [];
      cell.push(label);
      row.set(day, cell);
      grid.set(a.employeeId, row);
    }
  }

  // Nur Mitarbeiter zeigen, die diese Woche mindestens einen Dienst haben,
  // plus immer die eigene Zeile.
  const visible = employees.filter((e) => grid.has(e.id) || e.id === me?.id);

  if (visible.length === 0) {
    return (
      <section className="rounded-lg border p-4">
        <h2 className="mb-1 text-sm font-semibold">Wochenübersicht</h2>
        <p className="text-sm text-muted-foreground">Diese Woche sind noch keine Dienste geplant.</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border p-4">
      <h2 className="mb-3 text-sm font-semibold">Wochenübersicht · KW ab {weekStart.slice(8, 10)}.{weekStart.slice(5, 7)}.</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-background p-2 text-left font-medium text-muted-foreground">Mitarbeiter</th>
              {days.map((d) => (
                <th key={d} className={`p-2 text-center font-medium ${d === todayISO() ? "text-primary" : "text-muted-foreground"}`}>
                  {weekdayShort(d)}<br />{d.slice(8, 10)}.
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => {
              const mine = e.id === me?.id;
              const row = grid.get(e.id);
              return (
                <tr key={e.id} className={mine ? "bg-primary/10" : ""}>
                  <td className={`sticky left-0 p-2 ${mine ? "bg-primary/10 font-semibold" : "bg-background"}`}>
                    {e.lastName} {e.firstName.slice(0, 1)}.
                    {mine && <span className="ml-1 text-[10px] text-primary">(ich)</span>}
                  </td>
                  {days.map((d) => {
                    const cell = row?.get(d);
                    return (
                      <td key={d} className={`p-1 text-center ${d === todayISO() ? "bg-muted/40" : ""}`}>
                        {cell ? (
                          <div className="space-y-0.5">
                            {cell.map((c, i) => (
                              <div key={i} className={`rounded px-1 py-0.5 ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{c}</div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
