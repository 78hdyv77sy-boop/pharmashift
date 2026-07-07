import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatEuro, NIGHTDUTY_TARIFFS_2026, type NightDutyTier } from "@/lib/domain/nightduty-tariffs";
import { PrintButton } from "@/components/domain/print-button";

// Nachtdienst-Abrechnung als druckfertiger A4-Report ("Als PDF speichern").
// Zugriff: Diensthabende:r (eigener Dienst) oder Leitung (NIGHTDUTY_VIEW_ALL).

const TIER_META: Record<NightDutyTier, { label: string; window: string }> = {
  TAG_332: { label: "Tagstufe", window: "So/Ftg 8–20 · Wt 18–20 · Sa 12–18" },
  ABEND_652: { label: "Abendstufe", window: "20–01 · 7–8 Uhr" },
  NACHT_1444: { label: "Nachtstufe", window: "1–7 Uhr" },
};
const DUTY_TYPE_LABEL: Record<string, string> = {
  NACHT: "Nachtdienst",
  SAMSTAG: "Samstag-Bereitschaft",
  SONNFEIER: "Sonn-/Feiertagsdienst",
};

export default async function NightDutyReportPage({ params }: { params: Promise<{ id: string }> }) {
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
  if (!perms.has(PERMISSIONS.NIGHTDUTY_USE) && !perms.has(PERMISSIONS.NIGHTDUTY_VIEW_ALL)) {
    return <p className="p-6 text-sm text-destructive">Keine Berechtigung.</p>;
  }

  const { id } = await params;
  const duty = await prisma.nightDuty.findFirst({
    where: { id, orgId },
    include: {
      employee: { select: { id: true, userId: true, firstName: true, lastName: true } },
      customers: { orderBy: { at: "asc" } },
    },
  });
  if (!duty || !duty.closedAt) notFound();

  const viewAll = perms.has(PERMISSIONS.NIGHTDUTY_VIEW_ALL);
  if (!viewAll && duty.employee.userId !== session.user.id) {
    return <p className="p-6 text-sm text-destructive">Keine Berechtigung für diesen Dienst.</p>;
  }

  const loc = duty.locationId
    ? await prisma.location.findFirst({ where: { id: duty.locationId, orgId }, select: { name: true } })
    : null;

  // Summen (Ganzzahl-Cent)
  const custBase = duty.customers.reduce((s, c) => s + c.baseAmount, 0);
  const custBonus = duty.customers.reduce((s, c) => s + c.bonusAmount, 0);
  const custTotal = custBase + custBonus;
  const pauschale = duty.baseWage + duty.nightBonus;
  const grandTotal = pauschale + custTotal;

  const byTier = (["NACHT_1444", "ABEND_652", "TAG_332"] as NightDutyTier[])
    .map((tier) => {
      const rows = duty.customers.filter((c) => c.tier === tier);
      const t = NIGHTDUTY_TARIFFS_2026[tier];
      return { tier, count: rows.length, rate: t.base + t.bonus, sum: rows.reduce((s, c) => s + c.baseAmount + c.bonusAmount, 0) };
    })
    .filter((r) => r.count > 0);

  const dutyDate = duty.date.toLocaleDateString("de-AT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  const fmtTime = (d: Date) => d.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

  return (
    <div className="mx-auto max-w-2xl p-8 print:max-w-none print:p-0">
      {/* Aktionsleiste (nicht im Druck) */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        <a href="/admin/nightduty" className="text-sm text-muted-foreground hover:text-foreground">← Zurück zum Nachtdienst</a>
        <PrintButton />
      </div>

      {/* Kopf */}
      <header className="mb-8 flex items-end justify-between border-b-2 border-primary pb-4">
        <div>
          <div className="wordmark">Pharma<span className="dot" aria-hidden="true" /><b>Shift</b></div>
          <h1 className="mt-1 text-xl font-semibold">Nachtdienst-Abrechnung</h1>
          <p className="text-sm text-muted-foreground">{DUTY_TYPE_LABEL[duty.dutyType] ?? duty.dutyType} · VAAÖ-Tarif</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-muted-foreground">Dienst am</div>
          <div className="text-lg font-semibold">{dutyDate}</div>
        </div>
      </header>

      {/* Metadaten */}
      <dl className="mb-8 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Diensthabende:r</dt>
          <dd className="font-medium">{duty.employee.firstName} {duty.employee.lastName}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Dienstzeit</dt>
          <dd className="font-medium tabular-nums">{duty.startTime}–{duty.endTime} Uhr</dd>
        </div>
        {loc && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Standort</dt>
            <dd className="font-medium">{loc.name}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Abgeschlossen</dt>
          <dd className="font-medium tabular-nums">{duty.closedAt.toLocaleDateString("de-AT")} {fmtTime(duty.closedAt)}</dd>
        </div>
      </dl>

      {/* Zusammenfassung */}
      <section className="mb-8 grid grid-cols-3 gap-3">
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Inanspruchnahmen</div>
          <div className="mt-0.5 text-2xl font-semibold tabular-nums">{duty.customers.length}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Vergütung Kunden</div>
          <div className="mt-0.5 text-2xl font-semibold tabular-nums">{formatEuro(custTotal)}</div>
        </div>
        <div className="rounded-lg border border-primary/40 bg-primary/[0.05] p-3">
          <div className="text-xs text-primary">Gesamt inkl. Pauschale</div>
          <div className="mt-0.5 text-2xl font-semibold tabular-nums text-primary">{formatEuro(grandTotal)}</div>
        </div>
      </section>

      {/* Aufschlüsselung nach Tarifstufe */}
      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold">Aufschlüsselung</h2>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-1.5 pr-3 text-left">Position</th>
              <th className="py-1.5 pr-3 text-right">Anzahl</th>
              <th className="py-1.5 pr-3 text-right">Satz</th>
              <th className="py-1.5 text-right">Summe</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="py-1.5 pr-3">
                Bereitschaftspauschale
                <span className="ml-1 text-xs text-muted-foreground">(Grundlohn {formatEuro(duty.baseWage)} + Zuschlag {formatEuro(duty.nightBonus)})</span>
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums">1</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{formatEuro(pauschale)}</td>
              <td className="py-1.5 text-right tabular-nums">{formatEuro(pauschale)}</td>
            </tr>
            {byTier.map((r) => (
              <tr key={r.tier} className="border-b">
                <td className="py-1.5 pr-3">
                  {TIER_META[r.tier].label} <span className="tabular-nums">{formatEuro(r.rate)}</span>
                  <span className="ml-1 text-xs text-muted-foreground">({TIER_META[r.tier].window})</span>
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{r.count}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{formatEuro(r.rate)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatEuro(r.sum)}</td>
              </tr>
            ))}
            <tr>
              <td className="py-2 pr-3 font-semibold">Gesamt</td>
              <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{duty.customers.length}</td>
              <td />
              <td className="py-2 text-right text-base font-semibold tabular-nums">{formatEuro(grandTotal)}</td>
            </tr>
          </tbody>
        </table></div>
        <p className="mt-1 text-xs text-muted-foreground">
          Davon steuerbegünstigter Zuschlag-Anteil: Pauschale {formatEuro(duty.nightBonus)} + Inanspruchnahmen {formatEuro(custBonus)} = <span className="tabular-nums">{formatEuro(duty.nightBonus + custBonus)}</span>
        </p>
      </section>

      {/* Einzelaufstellung */}
      <section className="mb-10">
        <h2 className="mb-2 text-sm font-semibold">Einzelaufstellung der Inanspruchnahmen</h2>
        {duty.customers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Inanspruchnahmen in diesem Dienst.</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-1.5 pr-3 text-left">Nr.</th>
                <th className="py-1.5 pr-3 text-left">Zeitpunkt</th>
                <th className="py-1.5 pr-3 text-left">Tarifstufe</th>
                <th className="py-1.5 pr-3 text-right">Grundlohn</th>
                <th className="py-1.5 pr-3 text-right">Zuschlag</th>
                <th className="py-1.5 text-right">Summe</th>
              </tr>
            </thead>
            <tbody>
              {duty.customers.map((c, i) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-1 pr-3 tabular-nums text-muted-foreground">{i + 1}</td>
                  <td className="py-1 pr-3 tabular-nums">
                    {!sameDay(c.at, duty.date) && <span className="text-muted-foreground">{c.at.toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit" })} </span>}
                    {fmtTime(c.at)}
                  </td>
                  <td className="py-1 pr-3">{TIER_META[c.tier as NightDutyTier]?.label ?? c.tier}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{formatEuro(c.baseAmount)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{formatEuro(c.bonusAmount)}</td>
                  <td className="py-1 text-right tabular-nums">{formatEuro(c.baseAmount + c.bonusAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      {/* Unterschriften */}
      <section className="mb-8 grid grid-cols-2 gap-12 pt-8">
        <div className="border-t pt-1 text-xs text-muted-foreground">Diensthabende:r</div>
        <div className="border-t pt-1 text-xs text-muted-foreground">Apothekenleitung</div>
      </section>

      <footer className="text-xs text-muted-foreground">
        Erstellt mit PharmaShift · {new Date().toLocaleDateString("de-AT")} {fmtTime(new Date())} · Beträge lt. VAAÖ-Tarif (Snapshot zum Dienstzeitpunkt)
      </footer>
    </div>
  );
}
