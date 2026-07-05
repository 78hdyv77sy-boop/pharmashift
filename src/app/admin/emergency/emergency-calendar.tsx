"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toaster";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { dateAtUTC, formatDayLabel, todayISO } from "@/lib/domain/dates";
import type { EmergencyData } from "@/lib/domain/emergency";
import { setEmergencyDuty, autoRotateMonth } from "./actions";

const NONE = "__none__";
const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

type Loc = { id: string; name: string };

export function EmergencyCalendar({
  locations, locationId, year, month1, data, canManage,
}: {
  locations: Loc[];
  locationId: string;
  year: number;
  month1: number;
  data: EmergencyData;
  canManage: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const confirmDialog = useConfirm();
  const pathname = usePathname();
  const params = useSearchParams();
  const [busy, setBusy] = React.useState(false);

  function nav(updates: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    Object.entries(updates).forEach(([k, v]) => next.set(k, v));
    router.push(`${pathname}?${next.toString()}`);
  }
  function shiftMonth(delta: number) {
    let y = year, m = month1 + delta;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    nav({ year: String(y), month: String(m) });
  }

  async function assign(day: string, employeeId: string) {
    setBusy(true);
    const res = await setEmergencyDuty(locationId, day, employeeId === NONE ? null : employeeId);
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); } else { if (res.message) toast(res.message, "success"); router.refresh(); }
  }
  async function rotate() {
    if (!(await confirmDialog({ title: "Monat automatisch belegen?", description: "Bestehende Zuweisungen werden überschrieben.", confirmText: "Belegen" }))) return;
    setBusy(true);
    const res = await autoRotateMonth(locationId, year, month1);
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); } else { if (res.message) toast(res.message, "success"); router.refresh(); }
  }

  const leading = data.days.length ? (dateAtUTC(data.days[0]).getUTCDay() + 6) % 7 : 0;
  const today = todayISO();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Select value={locationId} onValueChange={(v) => nav({ locationId: v })}>
          <SelectTrigger className="w-60"><SelectValue placeholder="Notdienst-Standort" /></SelectTrigger>
          <SelectContent>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          {canManage && <Button variant="outline" size="sm" onClick={rotate} disabled={busy}><Shuffle className="h-4 w-4" /> Auto-Rotation</Button>}
          <Button variant="outline" size="icon" onClick={() => shiftMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="px-2 text-sm font-medium">{MONTHS[month1 - 1]} {year}</span>
          <Button variant="outline" size="icon" onClick={() => shiftMonth(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WD.map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leading }).map((_, i) => <div key={`b${i}`} />)}
        {data.days.map((day) => {
          const entry = data.duties[day];
          return (
            <div key={day} className={`min-h-20 rounded-md border p-1.5 text-xs ${day === today ? "border-primary" : ""}`}>
              <div className="mb-1 font-medium">{formatDayLabel(day)}</div>
              {canManage ? (
                <Select value={entry?.employeeId ?? NONE} onValueChange={(v) => assign(day, v)}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {data.employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <div className="truncate">{entry?.employeeName ?? <span className="text-muted-foreground">—</span>}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
