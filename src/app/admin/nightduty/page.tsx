import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatEuro } from "@/lib/domain/nightduty-tariffs";
import { todayISO } from "@/lib/domain/dates";
import { Badge } from "@/components/ui/badge";
import { NightDutyLive, type LiveCustomer } from "./nightduty-live";
import { NightDutyStart } from "./nightduty-start";

export default async function NightDutyPage() {
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

  // Zugriff nur Apotheker:in + Leitung
  if (!perms.has(PERMISSIONS.NIGHTDUTY_USE)) {
    return <p className="text-sm text-destructive">Das Nachtdienst-Tool ist nur für Apotheker:innen und die Leitung zugänglich.</p>;
  }

  const viewAll = perms.has(PERMISSIONS.NIGHTDUTY_VIEW_ALL);

  // Eigener Mitarbeiter-Datensatz
  const me = await prisma.employee.findFirst({
    where: { orgId, userId: session.user.id, deletedAt: null, active: true },
    select: { id: true, type: true, firstName: true, lastName: true },
  });

  const isApotheker = me?.type === "APOTHEKER";

  // Aktiver (nicht abgeschlossener) Dienst des eigenen Accounts
  const activeDuty = me
    ? await prisma.nightDuty.findFirst({
        where: { orgId, employeeId: me.id, closedAt: null },
        include: { customers: { orderBy: { at: "desc" } } },
        orderBy: { createdAt: "desc" },
      })
    : null;

  // Historie: eigene oder (Leitung) alle
  const history = await prisma.nightDuty.findMany({
    where: {
      orgId,
      closedAt: { not: null },
      ...(viewAll ? {} : me ? { employeeId: me.id } : { employeeId: "__none__" }),
    },
    include: { employee: { select: { firstName: true, lastName: true } }, customers: true },
    orderBy: { date: "desc" },
    take: 30,
  });

  // Monatssumme (laufender Monat)
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthDuties = history.filter((d) => d.date >= monthStart);
  const monthPauschale = monthDuties.reduce((s, d) => s + d.baseWage + d.nightBonus, 0);
  const monthCustomers = monthDuties.reduce(
    (s, d) => s + d.customers.reduce((cs, c) => cs + c.baseAmount + c.bonusAmount, 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Nachtdienst</h1>
        <p className="text-sm text-muted-foreground">
          Bereitschaftsdienst erfassen und Inanspruchnahmen nach VAAÖ-Tarif zählen.
        </p>
      </div>

      {activeDuty ? (
        <NightDutyLive
          dutyId={activeDuty.id}
          pauschale={activeDuty.baseWage + activeDuty.nightBonus}
          closed={false}
          initialCustomers={activeDuty.customers.map(
            (c): LiveCustomer => ({
              id: c.id,
              at: c.at.toISOString(),
              tier: c.tier as LiveCustomer["tier"],
              total: c.baseAmount + c.bonusAmount,
            }),
          )}
        />
      ) : isApotheker ? (
        <NightDutyStart defaultDate={todayISO()} />
      ) : (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          Als Leitung können Sie die Nachtdienste einsehen und exportieren. Das Starten eines
          Dienstes ist Apotheker:innen vorbehalten.
        </div>
      )}

      {/* Monatsübersicht */}
      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">Diesen Monat {viewAll ? "(alle)" : ""}</h2>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-xl font-semibold tabular-nums">{monthDuties.length}</div>
            <div className="text-xs text-muted-foreground">Dienste</div>
          </div>
          <div>
            <div className="text-xl font-semibold tabular-nums">{formatEuro(monthPauschale)}</div>
            <div className="text-xs text-muted-foreground">Pauschalen</div>
          </div>
          <div>
            <div className="text-xl font-semibold tabular-nums">{formatEuro(monthCustomers)}</div>
            <div className="text-xs text-muted-foreground">Inanspruchnahmen</div>
          </div>
        </div>
        <a
          href={`/api/nightduty/export?month=${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`}
          className="mt-3 inline-block text-xs text-primary underline-offset-2 hover:underline"
        >
          Monat als CSV exportieren
        </a>
      </section>

      {/* Historie */}
      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">Abgeschlossene Nachtdienste</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine abgeschlossenen Dienste.</p>
        ) : (
          <ul className="space-y-2">
            {history.map((d) => {
              const sum = d.customers.reduce((s, c) => s + c.baseAmount + c.bonusAmount, 0);
              return (
                <li key={d.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                  <div>
                    <span className="font-medium">{d.date.toLocaleDateString("de-AT")}</span>{" "}
                    <span className="text-muted-foreground">{d.startTime}–{d.endTime}</span>
                    {viewAll && <span className="text-muted-foreground"> · {d.employee.firstName} {d.employee.lastName}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="success">{d.customers.length} Kunden</Badge>
                    <span className="tabular-nums text-muted-foreground">+{formatEuro(sum)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
