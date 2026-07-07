"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Moon, Undo2, CheckCircle2, Loader2, Clock, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { recordCustomer, recordCustomerAt, undoLastCustomer, closeNightDuty } from "@/app/admin/nightduty/actions";
import { formatEuro } from "@/lib/domain/nightduty-tariffs";

export interface LiveCustomer {
  id: string;
  at: string; // ISO
  tier: "TAG_332" | "ABEND_652" | "NACHT_1444";
  total: number; // Cent
}

const TIER_LABEL: Record<LiveCustomer["tier"], string> = {
  TAG_332: "Tag (3,32 €)",
  ABEND_652: "Abend/früh (6,52 €)",
  NACHT_1444: "Nacht 1–7 Uhr (14,44 €)",
};

export function NightDutyLive({
  dutyId,
  pauschale,
  initialCustomers,
  closed,
}: {
  dutyId: string;
  pauschale: number; // Cent (Grundlohn + Zuschlag)
  initialCustomers: LiveCustomer[];
  closed: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const confirmDialog = useConfirm();
  const [customers, setCustomers] = React.useState<LiveCustomer[]>(initialCustomers);
  const [busy, setBusy] = React.useState(false);

  const sum = customers.reduce((s, c) => s + c.total, 0);
  const last = customers[0];

  async function addCustomer() {
    setBusy(true);
    const res = await recordCustomer(dutyId);
    setBusy(false);
    if (!res.ok || !res.tier || res.amount === undefined) {
      toast(res.error ?? "Fehler", "error");
      return;
    }
    // optimistisch oben einfügen
    setCustomers((prev) => [
      { id: `tmp-${Date.now()}`, at: new Date().toISOString(), tier: res.tier!, total: res.amount! },
      ...prev,
    ]);
    router.refresh();
  }

  // NACHTRAGEN: vergessenen Knopfdruck mit Datum/Uhrzeit nachtragen.
  const [backfillOpen, setBackfillOpen] = React.useState(false);
  const [backfillAt, setBackfillAt] = React.useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); // lokale Zeit für datetime-local
    return d.toISOString().slice(0, 16);
  });

  async function addBackfill() {
    setBusy(true);
    const res = await recordCustomerAt(dutyId, new Date(backfillAt).toISOString());
    setBusy(false);
    if (!res.ok || !res.tier || res.amount === undefined) {
      toast(res.error ?? "Fehler", "error");
      return;
    }
    toast(res.message ?? "Nachgetragen.", "success");
    setCustomers((prev) =>
      [{ id: `tmp-${Date.now()}`, at: new Date(backfillAt).toISOString(), tier: res.tier!, total: res.amount! }, ...prev]
        .sort((a, b) => b.at.localeCompare(a.at)),
    );
    setBackfillOpen(false);
    router.refresh();
  }

  async function undo() {
    setBusy(true);
    const res = await undoLastCustomer(dutyId);
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); return; }
    setCustomers((prev) => prev.slice(1));
    toast("Rückgängig.", "success");
    router.refresh();
  }

  async function close() {
    const ok = await confirmDialog({
      title: "Nachtdienst abschließen?",
      description: "Danach können keine weiteren Inanspruchnahmen erfasst werden.",
      confirmText: "Abschließen",
    });
    if (!ok) return;
    setBusy(true);
    const res = await closeNightDuty(dutyId);
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); return; }
    toast("Abgeschlossen.", "success");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      {/* Live-Summen */}
      <div className="rounded-xl border p-4 text-center">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Moon className="h-4 w-4" /> Laufender Nachtdienst
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <div className="text-3xl font-semibold tabular-nums">{customers.length}</div>
            <div className="text-xs text-muted-foreground">Kunden</div>
          </div>
          <div>
            <div className="text-3xl font-semibold tabular-nums">{formatEuro(sum)}</div>
            <div className="text-xs text-muted-foreground">Inanspruchnahmen</div>
          </div>
        </div>
        <div className="mt-3 border-t pt-3 text-xs text-muted-foreground">
          + Pauschale {formatEuro(pauschale)} ={" "}
          <span className="font-medium text-foreground">{formatEuro(sum + pauschale)}</span> gesamt
        </div>
      </div>

      {!closed ? (
        <>
          {/* Großer Kunde-Button — handytauglich */}
          <button
            onClick={addCustomer}
            disabled={busy}
            className="flex h-32 w-full items-center justify-center rounded-2xl bg-primary text-2xl font-semibold text-primary-foreground shadow-lg transition active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-8 w-8 animate-spin" /> : "+ Kunde"}
          </button>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={undo} disabled={busy || customers.length === 0}>
              <Undo2 className="h-4 w-4" /> Rückgängig
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setBackfillOpen((o) => !o)} disabled={busy}>
              <Clock className="h-4 w-4" /> Nachtragen
            </Button>
            <Button variant="outline" className="flex-1" onClick={close} disabled={busy}>
              <CheckCircle2 className="h-4 w-4" /> Dienst abschließen
            </Button>
          </div>

          {last && (
            <p className="text-center text-xs text-muted-foreground">
              Zuletzt: {new Date(last.at).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })} · {TIER_LABEL[last.tier]}
            </p>
          )}
        </>
      ) : (
        <div className="space-y-2">
          <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-center text-sm text-green-800">
            <CheckCircle2 className="mx-auto mb-1 h-5 w-5" /> Dienst abgeschlossen
          </div>
          <a
            href={`/admin/nightduty/report/${dutyId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <FileText className="h-4 w-4" /> Abrechnung als PDF
          </a>
          <Button variant="outline" className="w-full" onClick={() => setBackfillOpen((o) => !o)} disabled={busy}>
            <Clock className="h-4 w-4" /> Vergessene Inanspruchnahme nachtragen
          </Button>
        </div>
      )}

      {backfillOpen && (
        <div className="flex items-end gap-2 rounded-lg border bg-muted/30 p-3">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Zeitpunkt der Inanspruchnahme</label>
            <input
              type="datetime-local"
              value={backfillAt}
              onChange={(e) => setBackfillAt(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <Button onClick={addBackfill} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Eintragen"}
          </Button>
        </div>
      )}

      {/* Aufschlüsselung nach Tarif */}
      {customers.length > 0 && (
        <div className="rounded-lg border p-3 text-sm">
          <div className="mb-1 font-medium">Aufschlüsselung</div>
          {(["NACHT_1444", "ABEND_652", "TAG_332"] as const).map((tier) => {
            const items = customers.filter((c) => c.tier === tier);
            if (items.length === 0) return null;
            return (
              <div key={tier} className="flex justify-between text-muted-foreground">
                <span>{TIER_LABEL[tier]} × {items.length}</span>
                <span className="tabular-nums">{formatEuro(items.reduce((s, c) => s + c.total, 0))}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
