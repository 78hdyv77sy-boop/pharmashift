"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toaster";
import { startNightDuty } from "@/app/admin/nightduty/actions";

const PRESETS: Record<string, { start: string; end: string; label: string }> = {
  NACHT: { start: "18:00", end: "08:00", label: "Nachtdienst (18–08)" },
  SAMSTAG: { start: "12:00", end: "08:00", label: "Samstag (12–08)" },
  SONNFEIER: { start: "08:00", end: "08:00", label: "Sonn-/Feiertag (08–08)" },
};

export function NightDutyStart({ defaultDate }: { defaultDate: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [date, setDate] = React.useState(defaultDate);
  const [type, setType] = React.useState<keyof typeof PRESETS>("NACHT");
  const [busy, setBusy] = React.useState(false);

  async function start() {
    setBusy(true);
    const p = PRESETS[type];
    const res = await startNightDuty({ date, startTime: p.start, endTime: p.end, dutyType: type as "NACHT" | "SAMSTAG" | "SONNFEIER" });
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); return; }
    toast(res.message ?? "Gestartet.", "success");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md space-y-4 rounded-xl border p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Moon className="h-4 w-4" /> Neuen Nachtdienst starten
      </div>
      <div className="space-y-1.5">
        <Label>Datum</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Art</Label>
        <Select value={type} onValueChange={(v) => setType(v as keyof typeof PRESETS)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(PRESETS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button className="w-full" onClick={start} disabled={busy}>
        {busy ? "Starte…" : "Dienst starten"}
      </Button>
    </div>
  );
}
