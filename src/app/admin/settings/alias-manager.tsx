"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toaster";
import { saveAgentAliases } from "./actions";

// AI-P2 / 8.6 V7b: Org-Memory — Spitznamen für den Sprachagenten
// ("die Kleine" = Filiale Süd, "der Chef" = Hr. Huber)

export interface AliasEntry { alias: string; targetType: "location" | "employee"; targetId: string }
interface Option { id: string; name: string }

export function AliasManager({ initial, locations, employees, canEdit }: {
  initial: AliasEntry[]; locations: Option[]; employees: Option[]; canEdit: boolean;
}) {
  const { toast } = useToast();
  const [items, setItems] = React.useState<AliasEntry[]>(initial);
  const [pending, setPending] = React.useState(false);

  function update(i: number, patch: Partial<AliasEntry>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch, ...(patch.targetType ? { targetId: "" } : {}) } : it)));
  }

  async function save() {
    setPending(true);
    const res = await saveAgentAliases(items.filter((i) => i.alias.trim() && i.targetId));
    setPending(false);
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); return; }
    toast(res.message ?? "Gespeichert.", "success");
  }

  return (
    <div className="max-w-xl space-y-3">
      <div>
        <h2 className="text-sm font-semibold">KI-Aliase (Spitznamen)</h2>
        <p className="text-xs text-muted-foreground">Begriffe, die Ihr Team benutzt – der Sprachagent versteht sie dann. Beispiel: „die Kleine" → Filiale Süd.</p>
      </div>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={it.alias} onChange={(e) => update(i, { alias: e.target.value })} placeholder="Spitzname" className="w-40" disabled={!canEdit} />
          <Select value={it.targetType} onValueChange={(v) => update(i, { targetType: v as AliasEntry["targetType"] })} disabled={!canEdit}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="location">Standort</SelectItem>
              <SelectItem value="employee">Mitarbeiter</SelectItem>
            </SelectContent>
          </Select>
          <Select value={it.targetId} onValueChange={(v) => update(i, { targetId: v })} disabled={!canEdit}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Ziel wählen" /></SelectTrigger>
            <SelectContent>
              {(it.targetType === "location" ? locations : employees).map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canEdit && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
      {canEdit && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setItems((p) => [...p, { alias: "", targetType: "location", targetId: "" }])}>
            <Plus className="h-4 w-4" /> Alias
          </Button>
          <Button size="sm" onClick={save} disabled={pending}>{pending ? "Speichern…" : "Aliase speichern"}</Button>
        </div>
      )}
    </div>
  );
}
