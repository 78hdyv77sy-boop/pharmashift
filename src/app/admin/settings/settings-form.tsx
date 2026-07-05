"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateOrgSettings } from "./actions";

const TIMEZONES = ["Europe/Berlin", "Europe/Vienna", "Europe/Zurich", "Europe/London", "Europe/Lisbon", "America/Sao_Paulo", "UTC"];

export function SettingsForm({ initial, canEdit, publicBase }: { initial: { name: string; slug: string; timezone: string }; canEdit: boolean; publicBase: string }) {
  const router = useRouter();
  const [v, setV] = React.useState(initial);
  const [pending, setPending] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setPending(true); setMsg(null);
    const res = await updateOrgSettings(v);
    setPending(false);
    setMsg({ ok: res.ok, text: res.ok ? (res.message ?? "Gespeichert.") : (res.error ?? "Fehler") });
    if (res.ok) router.refresh();
  }

  return (
    <div className="max-w-xl space-y-5">
      <div className="space-y-1.5">
        <Label>Organisationsname</Label>
        <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} disabled={!canEdit} />
      </div>

      <div className="space-y-1.5">
        <Label>Slug (öffentliche URL)</Label>
        <Input value={v.slug} onChange={(e) => setV({ ...v, slug: e.target.value.toLowerCase() })} disabled={!canEdit} />
        <p className="text-xs text-muted-foreground">Öffentliche Seiten: {publicBase}/<span className="font-medium">{v.slug || "…"}</span></p>
      </div>

      <div className="space-y-1.5">
        <Label>Zeitzone</Label>
        <Select value={v.timezone} onValueChange={(val) => setV({ ...v, timezone: val })} disabled={!canEdit}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{TIMEZONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-destructive"}`}>{msg.text}</p>}

      {canEdit && (
        <div><Button onClick={save} disabled={pending}>{pending ? "Speichern…" : "Speichern"}</Button></div>
      )}
      {!canEdit && <p className="text-sm text-muted-foreground">Nur Lesezugriff – zum Ändern fehlt die Berechtigung „org.settings".</p>}
    </div>
  );
}
