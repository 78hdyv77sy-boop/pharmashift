"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { setAbsenceStatus } from "@/app/admin/absences/actions";
import { ReplacementDraftDialog } from "@/app/admin/absences/replacement-draft-dialog";

export interface InboxAbsence {
  id: string;
  name: string;
  range: string;
  type: string;
}

export function AbsenceInbox({ items, canApprove }: { items: InboxAbsence[]; canApprove: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const confirmDialog = useConfirm();
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [draftFor, setDraftFor] = React.useState<string | null>(null); // Ersatz-Entwurf nach Konflikt-Genehmigung

  async function decide(id: string, status: "APPROVED" | "DECLINED") {
    setPendingId(id);
    const res = await setAbsenceStatus(id, status);
    setPendingId(null);

    // UX2-P0 N4: Konflikt -> warnen statt still Lücken erzeugen
    if (!res.ok && res.conflicts && res.conflicts.length > 0) {
      const ok = await confirmDialog({
        title: "Person ist im Zeitraum eingeteilt",
        description: `${res.conflicts.slice(0, 5).join(" · ")}${res.conflicts.length > 5 ? " · …" : ""} — bei Genehmigung entstehen Lücken im Plan.`,
        confirmText: "Trotzdem genehmigen",
        destructive: true,
      });
      if (!ok) return;
      setPendingId(id);
      const forced = await setAbsenceStatus(id, status, { force: true });
      setPendingId(null);
      if (!forced.ok) { toast(forced.error ?? "Fehler", "error"); return; }
      toast("Genehmigt – Ersatz-Entwurf wird vorbereitet.", "success");
      router.refresh();
      setDraftFor(id); // gleicher Flow wie auf der Abwesenheiten-Seite
      return;
    }

    if (!res.ok) { toast(res.error ?? "Fehler", "error"); return; }
    toast(status === "APPROVED" ? "Genehmigt." : "Abgelehnt.", "success");
    router.refresh();
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Keine offenen Anträge. 🎉</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
          <div className="min-w-0">
            <span className="font-medium">{a.name}</span>
            <span className="text-muted-foreground"> · {a.range} · {a.type}</span>
          </div>
          {canApprove && (
            <div className="flex shrink-0 gap-1">
              <Button size="sm" variant="outline" className="h-7 px-2" disabled={pendingId === a.id} onClick={() => decide(a.id, "APPROVED")}>
                <Check className="h-3.5 w-3.5" /> Genehmigen
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" disabled={pendingId === a.id} onClick={() => decide(a.id, "DECLINED")}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </li>
      ))}
      {draftFor && <ReplacementDraftDialog absenceId={draftFor} onClose={() => { setDraftFor(null); router.refresh(); }} />}
    </ul>
  );
}
