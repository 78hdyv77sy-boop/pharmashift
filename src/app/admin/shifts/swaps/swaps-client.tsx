"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, ArrowLeftRight, Check, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { createSwapRequest, decideSwap, cancelSwap, listAssignedShifts } from "./swap-request-actions";
import type { SwapRow, SwapEmployeeOption, AssignedShiftOption, SwapStatusValue } from "./swap-types";

const STATUS: Record<SwapStatusValue, { label: string; cls: string }> = {
  REQUESTED: { label: "Offen", cls: "bg-amber-100 text-amber-800" },
  ACCEPTED: { label: "Angenommen", cls: "bg-emerald-100 text-emerald-800" },
  DECLINED: { label: "Abgelehnt", cls: "bg-red-100 text-red-800" },
  CANCELLED: { label: "Zurückgezogen", cls: "bg-gray-100 text-gray-600" },
};

const selectCls = "w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring";

export function SwapsClient({ swaps, employees }: { swaps: SwapRow[]; employees: SwapEmployeeOption[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = React.useState(false);

  const open_ = swaps.filter((s) => s.status === "REQUESTED");
  const done = swaps.filter((s) => s.status !== "REQUESTED");

  async function decide(s: SwapRow, accept: boolean) {
    if (accept) {
      const ok = await confirm({ title: "Tausch annehmen?", description: `${s.requesterName} ↔ ${s.targetName}. Der Tausch wird nach AZG-Prüfung ausgeführt.`, confirmText: "Annehmen" });
      if (!ok) return;
    }
    const res = await decideSwap(s.id, accept);
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); return; }
    toast(res.message ?? "Erledigt", "success");
    router.refresh();
  }

  async function withdraw(s: SwapRow) {
    const ok = await confirm({ title: "Antrag zurückziehen?", description: `Tauschantrag von ${s.requesterName} wird zurückgezogen.`, confirmText: "Zurückziehen", destructive: true });
    if (!ok) return;
    const res = await cancelSwap(s.id);
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); return; }
    toast(res.message ?? "Zurückgezogen", "success");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Neuer Tauschantrag</Button>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Offene Anträge</h2>
        {open_.length === 0 ? (
          <p className="rounded-lg border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">Keine offenen Tauschanträge.</p>
        ) : (
          <div className="space-y-2">{open_.map((s) => <SwapCard key={s.id} s={s} onDecide={decide} onWithdraw={withdraw} />)}</div>
        )}
      </section>

      {done.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Erledigt</h2>
          <div className="space-y-2">{done.map((s) => <SwapCard key={s.id} s={s} onDecide={decide} onWithdraw={withdraw} />)}</div>
        </section>
      )}

      {open && <RequestDialog employees={employees} onClose={() => setOpen(false)} onDone={() => { setOpen(false); router.refresh(); }} />}
    </div>
  );
}

function SwapCard({ s, onDecide, onWithdraw }: { s: SwapRow; onDecide: (s: SwapRow, a: boolean) => void; onWithdraw: (s: SwapRow) => void }) {
  const st = STATUS[s.status];
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
        <span className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleDateString("de-AT")}</span>
      </div>
      <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center">
        <div className="flex-1">
          <div className="font-medium">{s.requesterName}</div>
          <div className="text-xs text-muted-foreground">{s.fromLabel}</div>
        </div>
        <ArrowLeftRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="flex-1">
          <div className="font-medium">{s.targetName}</div>
          <div className="text-xs text-muted-foreground">{s.toLabel ?? "—"}</div>
        </div>
      </div>
      {s.note && <p className="mt-2 rounded bg-muted/50 px-2 py-1 text-xs text-muted-foreground">„{s.note}"</p>}
      {(s.canDecide || s.canCancel) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {s.canDecide && (
            <>
              <Button size="sm" onClick={() => onDecide(s, true)}><Check className="h-4 w-4" /> Annehmen</Button>
              <Button size="sm" variant="outline" onClick={() => onDecide(s, false)}><X className="h-4 w-4" /> Ablehnen</Button>
            </>
          )}
          {s.canCancel && <Button size="sm" variant="ghost" onClick={() => onWithdraw(s)}>Zurückziehen</Button>}
        </div>
      )}
    </div>
  );
}

function RequestDialog({ employees, onClose, onDone }: { employees: SwapEmployeeOption[]; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [fromEmp, setFromEmp] = React.useState("");
  const [toEmp, setToEmp] = React.useState("");
  const [fromShifts, setFromShifts] = React.useState<AssignedShiftOption[]>([]);
  const [toShifts, setToShifts] = React.useState<AssignedShiftOption[]>([]);
  const [fromAssignmentId, setFromAssignmentId] = React.useState("");
  const [toAssignmentId, setToAssignmentId] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function loadShifts(empId: string, which: "from" | "to") {
    if (which === "from") { setFromShifts([]); setFromAssignmentId(""); } else { setToShifts([]); setToAssignmentId(""); }
    if (!empId) return;
    const list = await listAssignedShifts(empId);
    if (which === "from") setFromShifts(list); else setToShifts(list);
  }

  async function submit() {
    if (!fromAssignmentId || !toAssignmentId) { toast("Bitte beide Schichten wählen.", "error"); return; }
    setBusy(true);
    const res = await createSwapRequest({ fromAssignmentId, toAssignmentId, note });
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); return; }
    toast(res.message ?? "Antrag gestellt.", "success");
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Neuer Tauschantrag</DialogTitle>
          <DialogDescription>Wer möchte welchen Dienst gegen welchen tauschen? Die andere Person (oder die Leitung) bestätigt anschließend. Ohne Leitungs-Rechte kannst du nur eigene Dienste anbieten.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Antragsteller:in</label>
            <select className={selectCls} value={fromEmp} onChange={(e) => { setFromEmp(e.target.value); loadShifts(e.target.value, "from"); }}>
              <option value="">– Person wählen –</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            {fromEmp && (
              <select className={selectCls} value={fromAssignmentId} onChange={(e) => setFromAssignmentId(e.target.value)}>
                <option value="">– deren Dienst wählen –</option>
                {fromShifts.map((s) => <option key={s.assignmentId} value={s.assignmentId}>{s.label}</option>)}
              </select>
            )}
          </div>

          <div className="flex items-center justify-center text-muted-foreground"><ArrowLeftRight className="h-4 w-4" /></div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Tauschpartner:in</label>
            <select className={selectCls} value={toEmp} onChange={(e) => { setToEmp(e.target.value); loadShifts(e.target.value, "to"); }}>
              <option value="">– Person wählen –</option>
              {employees.filter((e) => e.id !== fromEmp).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            {toEmp && (
              <select className={selectCls} value={toAssignmentId} onChange={(e) => setToAssignmentId(e.target.value)}>
                <option value="">– deren Dienst wählen –</option>
                {toShifts.map((s) => <option key={s.assignmentId} value={s.assignmentId}>{s.label}</option>)}
              </select>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Notiz (optional)</label>
            <input className={selectCls} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Grund für den Tausch" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={submit} disabled={busy || !fromAssignmentId || !toAssignmentId}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Antrag stellen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
