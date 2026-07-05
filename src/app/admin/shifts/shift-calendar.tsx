"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, UserPlus, UserCheck, X, Pencil, Trash2, Copy, Send, CheckCircle2, Download, Printer, MoreHorizontal, LayoutTemplate, Wand2, AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toaster";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PlanReview } from "@/components/domain/plan-review";
import { SolverReview } from "@/components/domain/solver-review";
import { ReplacementModal } from "@/components/domain/replacement-modal";
import { TemplateApply } from "./template-apply";
import type { ShiftTemplateRow } from "@/lib/domain/template-types";
import { weekDays, weekdayShort, formatDayLabel, addDays, todayISO } from "@/lib/domain/dates";
import { EMPLOYEE_TYPE_LABEL } from "@/lib/domain/employee-types";
import { SHIFT_PRESETS } from "@/lib/domain/shift-presets";
import { shiftHours } from "@/lib/domain/time";
import type { WeekData, WeekShift } from "@/lib/domain/shifts";
import { createShift, updateShift, deleteShift, assignEmployee, unassignEmployee, copyWeek } from "./actions";
import { publishWeek } from "./publish-actions";
import { autoReassignConflicts } from "./solver-actions";
import { undoInteraction } from "../agent-actions";
import type { WeekConflict } from "@/lib/domain/solver-types";

type Loc = { id: string; name: string };
interface Props {
  locations: Loc[];
  locationId: string;
  weekStart: string;
  data: WeekData;
  canManage: boolean;
  canPlan: boolean;
  canPublish: boolean;
  templates: ShiftTemplateRow[];
  conflicts: WeekConflict[];
}

interface ShiftForm { id?: string; expectedVersion?: number; date: string; startTime: string; endTime: string; requiredHeadcount: number; requiredPharmacists: number; notes: string; }

export function ShiftCalendar({ locations, locationId, weekStart, data, canManage, canPlan, canPublish, templates, conflicts }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const days = weekDays(weekStart);
  // Auto-Umbuchung bei AZG-Konflikt (transparent)
  const [reassigning, setReassigning] = React.useState(false);
  const [lastReassign, setLastReassign] = React.useState<{ interactionId?: string; count: number; unresolved: number } | null>(null);
  // UX: optimistische Zuweisungs-Chips — sofort sichtbar, wird bei frischen Daten zurückgesetzt
  type Asg = WeekShift["assignments"][number];
  const [optim, setOptim] = React.useState<Record<string, { add: Asg[]; remove: string[] }>>({});
  React.useEffect(() => { setOptim({}); }, [data]);

  function displayed(s: WeekShift): Asg[] {
    const o = optim[s.id];
    if (!o) return s.assignments;
    let list = s.assignments.filter((a) => !o.remove.includes(a.employeeId));
    for (const ad of o.add) if (!list.some((a) => a.employeeId === ad.employeeId)) list = [...list, ad];
    return list;
  }

  async function assignOptim(shiftId: string, e: { id: string; name: string; color: string | null; type: string }) {
    setOptim((prev) => {
      const cur = prev[shiftId] ?? { add: [], remove: [] };
      return { ...prev, [shiftId]: { remove: cur.remove.filter((id) => id !== e.id), add: cur.add.some((x) => x.employeeId === e.id) ? cur.add : [...cur.add, { employeeId: e.id, name: e.name, color: e.color, status: "ASSIGNED", type: e.type }] } };
    });
    const res = await assignEmployee(shiftId, e.id);
    if (!res.ok) {
      setOptim((prev) => { const cur = prev[shiftId]; if (!cur) return prev; return { ...prev, [shiftId]: { ...cur, add: cur.add.filter((x) => x.employeeId !== e.id) } }; });
      toast(res.error ?? "Fehler", "error");
      return;
    }
    router.refresh();
  }

  async function unassignOptim(shiftId: string, employeeId: string) {
    setOptim((prev) => {
      const cur = prev[shiftId] ?? { add: [], remove: [] };
      return { ...prev, [shiftId]: { add: cur.add.filter((x) => x.employeeId !== employeeId), remove: cur.remove.includes(employeeId) ? cur.remove : [...cur.remove, employeeId] } };
    });
    const res = await unassignEmployee(shiftId, employeeId);
    if (!res.ok) {
      setOptim((prev) => { const cur = prev[shiftId]; if (!cur) return prev; return { ...prev, [shiftId]: { ...cur, remove: cur.remove.filter((id) => id !== employeeId) } }; });
      toast(res.error ?? "Fehler", "error");
      return;
    }
    router.refresh();
  }
  // UX-P1 U7: Mobile-Tagesansicht — ausgewählter Tag
  const [assignQuery, setAssignQuery] = React.useState("");
  const [solverOpen, setSolverOpen] = React.useState(false);
  const [showAllHours, setShowAllHours] = React.useState(false);
  const [mobileDay, setMobileDay] = React.useState<string>(() =>
    days.includes(todayISO()) ? todayISO() : days[0],
  );
  React.useEffect(() => {
    setMobileDay(days.includes(todayISO()) ? todayISO() : days[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  // UX-P3: Tastatur-Shortcuts (←/→ Woche, T heute, N neue Schicht)
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable]") || document.querySelector("[role=dialog]"))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); nav({ week: addDays(weekStart, -7) }); }
      else if (e.key === "ArrowRight") { e.preventDefault(); nav({ week: addDays(weekStart, 7) }); }
      else if (e.key.toLowerCase() === "t") { e.preventDefault(); nav({ week: todayISO() }); }
      else if (e.key.toLowerCase() === "n" && canManage) {
        e.preventDefault();
        const day = days.includes(todayISO()) ? todayISO() : days[0];
        setDialog({ date: day, startTime: "08:00", endTime: "18:00", requiredHeadcount: 1, requiredPharmacists: 0, notes: "" });
        setError(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, canManage, days]);

  // UX-P2 U8a: Ist-Stunden je Mitarbeiter (zentrale, Mitternacht-feste Berechnung)
  const hoursByEmployee = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const sh of data.shifts) {
      const h = shiftHours(sh.startTime, sh.endTime);
      for (const a of sh.assignments) map.set(a.employeeId, (map.get(a.employeeId) ?? 0) + h);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.shifts]);
  const openSlots = React.useMemo(
    () => data.shifts.reduce((sum, sh) => sum + Math.max(0, sh.requiredHeadcount - sh.assignments.length), 0),
    [data.shifts],
  );
  const underStaffedDays = React.useMemo(() => {
    const set = new Set<string>();
    for (const sh of data.shifts) {
      if (sh.assignments.length < sh.requiredHeadcount) set.add(sh.date);
    }
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.shifts]);
  const { toast } = useToast();
  const confirm = useConfirm();
  const [dialog, setDialog] = React.useState<ShiftForm | null>(null);
  const [planOpen, setPlanOpen] = React.useState(false);
  const [templateOpen, setTemplateOpen] = React.useState(false);
  const [replace, setReplace] = React.useState<{ employeeId: string; date: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  function nav(updates: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    Object.entries(updates).forEach(([k, v]) => next.set(k, v));
    router.push(`${pathname}?${next.toString()}`);
  }

  const absencesByDay = React.useMemo(() => {
    const map: Record<string, WeekData["absences"]> = {};
    for (const day of days) {
      map[day] = data.absences.filter((a) => a.startDate <= day && a.endDate >= day);
    }
    return map;
  }, [data.absences, days]);

  const unavailableByDay = React.useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const u of data.unavailable) {
      (map[u.date] ??= new Set()).add(u.employeeId);
    }
    return map;
  }, [data.unavailable]);
  function isUnavailable(employeeId: string, day: string) {
    return unavailableByDay[day]?.has(employeeId) ?? false;
  }

  function shiftsForDay(day: string): WeekShift[] {
    return data.shifts.filter((s) => s.date === day);
  }
  function isAbsent(employeeId: string, day: string) {
    return absencesByDay[day]?.some((a) => a.employeeId === employeeId && a.status === "APPROVED");
  }

  async function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    const res = await fn();
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); return; }
    if (res.message) toast(res.message, "success");
    router.refresh();
  }

  async function runAutoReassign() {
    if (reassigning) return;
    setReassigning(true);
    const res = await autoReassignConflicts(locationId, weekStart);
    setReassigning(false);
    if (!res.ok) { toast(res.error ?? "Fehler bei der Umbuchung.", "error"); return; }
    if (res.moves.length === 0) {
      toast(res.unresolved.length > 0 ? "Kein gültiger Ersatz gefunden." : "Keine Konflikte gefunden.", "info");
      return;
    }
    setLastReassign({ interactionId: res.interactionId, count: res.moves.length, unresolved: res.unresolved.length });
    toast(
      `${res.moves.length} Dienst(e) umgebucht${res.unresolved.length ? `, ${res.unresolved.length} ohne Ersatz` : ""}.`,
      res.unresolved.length ? "info" : "success",
    );
    router.refresh();
  }

  async function undoReassign() {
    if (!lastReassign?.interactionId) return;
    const res = await undoInteraction(lastReassign.interactionId);
    if (!res.ok) { toast(res.error ?? "Rückgängig fehlgeschlagen.", "error"); return; }
    toast("Umbuchung rückgängig gemacht.", "success");
    setLastReassign(null);
    router.refresh();
  }

  async function saveShift() {
    if (!dialog) return;
    setPending(true);
    setError(null);
    const payload = { ...dialog, locationId };
    const res = dialog.id ? await updateShift(dialog.id, payload) : await createShift(payload);
    setPending(false);
    if (!res.ok) return setError(res.error ?? "Fehler");
    setDialog(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Select value={locationId} onValueChange={(v) => nav({ locationId: v })}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Standort" /></SelectTrigger>
            <SelectContent>
              {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>

          {data.published && data.drifted && canPublish ? (
            <Button
              size="sm"
              variant="outline"
              className="border-amber-400 text-amber-800"
              title="Der Plan wurde nach der Veröffentlichung geändert — das Team hat noch den alten Stand."
              onClick={async () => {
                const ok = await confirm({
                  title: "Erneut veröffentlichen?",
                  description: "Der Plan wurde seit der Veröffentlichung geändert. Das Team wird erneut per E-Mail informiert.",
                  confirmText: "Erneut veröffentlichen",
                });
                if (!ok) return;
                const res = await publishWeek(locationId, weekStart);
                if (!res.ok) { toast(res.error ?? "Fehler", "error"); return; }
                toast(res.message ?? "Veröffentlicht.", "success");
                router.refresh();
              }}
            >
              <Send className="h-4 w-4" /> Geändert — erneut veröffentlichen
            </Button>
          ) : data.published ? (
            <span className="inline-flex items-center gap-1 text-sm text-green-700"><CheckCircle2 className="h-4 w-4" /> Veröffentlicht</span>
          ) : canPublish ? (
            <Button
              size="sm"
              onClick={async () => {
                const ok = await confirm({
                  title: "Woche veröffentlichen?",
                  description: "Zugewiesene Mitarbeiter werden per E-Mail benachrichtigt.",
                  confirmText: "Veröffentlichen",
                });
                if (!ok) return;
                const res = await publishWeek(locationId, weekStart);
                if (!res.ok) { toast(res.error ?? "Fehler", "error"); return; }
                toast(res.message ?? "Veröffentlicht.", "success");
                router.refresh();
              }}
            >
              <Send className="h-4 w-4" /> Veröffentlichen
            </Button>
          ) : null}

          {/* Sekundäraktionen gebündelt (UX-P0, Befund U3) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Weitere Aktionen">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {canPlan && (
                <>
                  {/* UX2-P1 N1: EIN Planungs-Flow in 2 Schritten; "Plan generieren" (obsolet seit Solver) entfernt */}
                  <DropdownMenuLabel>1. Struktur anlegen</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setTemplateOpen(true)}>
                    <LayoutTemplate className="mr-2 h-4 w-4" /> Aus Vorlagen
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => run(() => copyWeek({ locationId, fromWeekStart: addDays(weekStart, -7), toWeekStart: weekStart }))}>
                    <Copy className="mr-2 h-4 w-4" /> Vorwoche kopieren
                  </DropdownMenuItem>
                  <DropdownMenuLabel>2. Besetzen</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setSolverOpen(true)}>
                    <Wand2 className="mr-2 h-4 w-4" /> Lücken automatisch füllen
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem asChild>
                <a href={`/api/export/ical?locationId=${locationId}&week=${weekStart}`}>
                  <Download className="mr-2 h-4 w-4" /> iCal exportieren
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`/admin/shifts/print?locationId=${locationId}&week=${weekStart}`} target="_blank" rel="noopener noreferrer">
                  <Printer className="mr-2 h-4 w-4" /> 2-Wochen-PDF drucken
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => nav({ week: addDays(weekStart, -7) })}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => nav({ week: todayISO() })}>Heute</Button>
          <span className="px-2 text-sm text-muted-foreground">KW ab {formatDayLabel(weekStart)}</span>
          <Button variant="outline" size="icon" onClick={() => nav({ week: addDays(weekStart, 7) })}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* UX2-P1 N2: Solver an die Oberfläche — kontextueller CTA bei Lücken */}
      {openSlots > 0 && canPlan && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
          <span className="text-sm text-amber-800">
            <span className="font-medium">{openSlots} offene{openSlots === 1 ? "r Platz" : " Plätze"}</span> diese Woche
          </span>
          <Button size="sm" variant="outline" className="shrink-0 border-amber-400 bg-white" onClick={() => setSolverOpen(true)}>
            <Wand2 className="h-4 w-4" /> Automatisch füllen
          </Button>
        </div>
      )}

      {/* AZG-Auto-Umbuchung: erkennt illegale Dienste, bucht transparent um (mit Protokoll + Undo) */}
      {conflicts.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2">
          <span className="flex items-center gap-2 text-sm text-red-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              <span className="font-medium">{conflicts.length} AZG-Konflikt{conflicts.length === 1 ? "" : "e"}</span> im Plan
              {" "}({conflicts.slice(0, 2).map((c) => `${c.employeeName}: ${c.reason}`).join("; ")}{conflicts.length > 2 ? " …" : ""})
            </span>
          </span>
          <Button size="sm" variant="outline" className="shrink-0 border-red-400 bg-white" onClick={runAutoReassign} disabled={reassigning}>
            <RotateCcw className="h-4 w-4" /> {reassigning ? "Buche um…" : "Automatisch umbuchen"}
          </Button>
        </div>
      )}

      {/* Erfolgsleiste nach Umbuchung — transparent, mit Rückgängig (24h) */}
      {lastReassign && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2">
          <span className="flex items-center gap-2 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {lastReassign.count} Dienst(e) umgebucht{lastReassign.unresolved ? ` · ${lastReassign.unresolved} ohne Ersatz (bitte manuell)` : ""}.
          </span>
          <div className="flex shrink-0 items-center gap-2">
            {lastReassign.interactionId && (
              <Button size="sm" variant="outline" className="border-emerald-400 bg-white" onClick={undoReassign}>Rückgängig</Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setLastReassign(null)} aria-label="Schließen"><X className="h-4 w-4" /></Button>
          </div>
        </div>
      )}


      <div className="flex gap-1 overflow-x-auto pb-1 md:hidden">
        {days.map((day) => {
          const active = day === mobileDay;
          return (
            <button
              key={day}
              onClick={() => setMobileDay(day)}
              className={`flex min-w-[3.25rem] flex-col items-center rounded-lg border px-2 py-1.5 text-xs ${active ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground"} ${day === todayISO() && !active ? "border-primary/40" : ""}`}
            >
              <span>{weekdayShort(day)}</span>
              <span className="text-sm">{day.slice(8, 10)}</span>
            </button>
          );
        })}
      </div>

      {/* Wochenraster (Desktop) / Tagesansicht (Mobil) */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
        {days.map((day) => (
          <div key={day} className={`rounded-lg border ${day === todayISO() ? "border-primary" : ""} ${day !== mobileDay ? "hidden md:block" : ""}`}>
            <div className="flex items-center justify-between border-b px-2 py-1.5">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                {weekdayShort(day)} {formatDayLabel(day)}
                {underStaffedDays.has(day) && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="Unterbesetzte Schicht" />}
              </span>
              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="text-muted-foreground hover:text-foreground" aria-label="Schicht hinzufügen">
                      <Plus className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel>Schnell anlegen</DropdownMenuLabel>
                    {SHIFT_PRESETS.map((p) => (
                      <DropdownMenuItem
                        key={p.label}
                        onClick={() => run(() => createShift({ locationId, date: day, startTime: p.start, endTime: p.end, requiredHeadcount: 1, notes: "" }))}
                      >
                        {p.label} ({p.start}–{p.end})
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => { setDialog({ date: day, startTime: "08:00", endTime: "16:00", requiredHeadcount: 1, requiredPharmacists: 0, notes: "" }); setError(null); }}>
                      Eigene Zeiten…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            <div className="space-y-2 p-2">
              {absencesByDay[day]?.map((a, i) => (
                <div key={i} className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                  {a.name} frei {a.status !== "APPROVED" && "(beantragt)"}
                </div>
              ))}

              {shiftsForDay(day).length === 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground">—</p>
              ) : (
                shiftsForDay(day).map((s) => {
                  const asg = displayed(s);
                  const filled = asg.length;
                  const under = filled < s.requiredHeadcount;
                  const assignedIds = new Set(asg.map((a) => a.employeeId));
                  const available = data.employees.filter((e) => !assignedIds.has(e.id));
                  return (
                    <div key={s.id} className="rounded-md border bg-card p-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{s.startTime}–{s.endTime}</span>
                        {(() => {
                          const need = s.requiredRoles?.APOTHEKER ?? 0;
                          const have = asg.filter((a) => a.type === "APOTHEKER").length;
                          return need > have ? (
                            <span className="rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700" title={`Apothekerpflicht: ${have}/${need}`}>⚕ {have}/{need}</span>
                          ) : null;
                        })()}
                        <Badge variant={under ? "warning" : "success"}>{filled}/{s.requiredHeadcount}</Badge>
                      </div>
                      {s.notes && <p className="mt-1 text-muted-foreground">{s.notes}</p>}

                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {asg.map((a) => (
                          <span key={a.employeeId} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${a.type === "APOTHEKER" ? "chip-apotheker" : a.type === "PKA" ? "chip-pka" : "bg-secondary"}`}>
                            {a.color && <span className="h-2 w-2 rounded-full" style={{ background: a.color }} />}
                            {a.name}
                            {isAbsent(a.employeeId, day) && <span title="abwesend" className="text-amber-600">!</span>}
                            {!isAbsent(a.employeeId, day) && isUnavailable(a.employeeId, day) && <span title="nicht verfügbar" className="text-amber-600">∅</span>}
                            {canManage && (
                              <>
                                <button onClick={() => setReplace({ employeeId: a.employeeId, date: day })} title="Ersatz finden" className="text-muted-foreground hover:text-foreground">
                                  <UserCheck className="h-3 w-3" />
                                </button>
                                <button onClick={() => unassignOptim(s.id, a.employeeId)} className="text-muted-foreground hover:text-destructive">
                                  <X className="h-3 w-3" />
                                </button>
                              </>
                            )}
                          </span>
                        ))}
                      </div>

                      {canManage && (
                        <div className="mt-1.5 flex items-center gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 px-1.5"><UserPlus className="h-3.5 w-3.5" /> Zuweisen</Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="max-h-64 w-56 overflow-y-auto" onCloseAutoFocus={() => setAssignQuery("")}>
                              <div className="px-1 pb-1">
                                <input
                                  value={assignQuery}
                                  onChange={(ev) => setAssignQuery(ev.target.value)}
                                  onKeyDown={(ev) => ev.stopPropagation()}
                                  placeholder="Suchen…"
                                  className="h-7 w-full rounded border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
                                />
                              </div>
                              {available.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">Alle zugewiesen</div>}
                              {available.filter((e) => e.name.toLowerCase().includes(assignQuery.toLowerCase())).map((e) => (
                                <DropdownMenuItem key={e.id} onSelect={() => assignOptim(s.id, e)}>
                                  {e.name} <span className="ml-1 text-muted-foreground">{EMPLOYEE_TYPE_LABEL[e.type]}</span>
                                  {isAbsent(e.id, day) ? <span className="ml-auto text-amber-600">frei</span>
                                    : isUnavailable(e.id, day) ? <span className="ml-auto text-amber-600">n. verfügbar</span> : null}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setDialog({ id: s.id, expectedVersion: s.version, date: s.date, startTime: s.startTime, endTime: s.endTime, requiredHeadcount: s.requiredHeadcount, requiredPharmacists: s.requiredRoles?.APOTHEKER ?? 0, notes: s.notes ?? "" }); setError(null); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={async () => { if (await confirm({ title: "Schicht löschen?", description: `${s.startTime}–${s.endTime} inkl. Zuweisungen.`, confirmText: "Löschen", destructive: true })) run(() => deleteShift(s.id)); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Wochen-Stunden vs. Soll (UX-P2 U8a — weeklyHoursTarget endlich in der UI) */}
      {data.employees.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.employees
            .filter((e) => (hoursByEmployee.get(e.id) ?? 0) > 0 || e.weeklyHoursTarget !== null)
            .filter((e) => {
              // UX2-P2 N8: Default nur Abweichler (>±10% vom Soll) — Konformität ist Rauschen
              if (showAllHours) return true;
              const actual = hoursByEmployee.get(e.id) ?? 0;
              if (e.weeklyHoursTarget === null) return actual > 0;
              return Math.abs(actual - e.weeklyHoursTarget) > e.weeklyHoursTarget * 0.1;
            })
            .map((e) => {
              const actual = Math.round((hoursByEmployee.get(e.id) ?? 0) * 10) / 10;
              const target = e.weeklyHoursTarget;
              const over = target !== null && actual > target;
              const under = target !== null && actual < target;
              return (
                <span
                  key={e.id}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${over ? "border-amber-400 text-amber-700" : under ? "text-muted-foreground" : "border-green-300 text-green-700"}`}
                  title={target !== null ? `Soll: ${target}h/Woche` : "Kein Wochen-Soll hinterlegt"}
                >
                  {e.name}
                  <span className="font-medium">{actual}{target !== null ? `/${target}` : ""}h</span>
                </span>
              );
            })}
          <button
            onClick={() => setShowAllHours((v) => !v)}
            className="rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
          >
            {showAllHours ? "Nur Abweichler" : "Alle anzeigen"}
          </button>
        </div>
      )}

      {/* Schicht-Dialog */}
      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialog?.id ? "Schicht bearbeiten" : "Neue Schicht"}</DialogTitle></DialogHeader>
          {dialog && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Datum</Label>
                <Input type="date" value={dialog.date} onChange={(e) => setDialog({ ...dialog, date: e.target.value })} />
              </div>
              {/* UX-P3: Ein-Klick-Zeitpresets (Vormittag / Nachmittag / Ganztags) */}
              <div className="flex flex-wrap gap-1.5">
                {SHIFT_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setDialog({ ...dialog, startTime: p.start, endTime: p.end })}
                    className={`rounded-full border px-2 py-0.5 text-xs ${dialog.startTime === p.start && dialog.endTime === p.end ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"}`}
                  >
                    {p.label} ({p.start}–{p.end})
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Von</Label>
                  <Input type="time" value={dialog.startTime} onChange={(e) => setDialog({ ...dialog, startTime: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Bis</Label>
                  <Input type="time" value={dialog.endTime} onChange={(e) => setDialog({ ...dialog, endTime: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Bedarf</Label>
                  <Input type="number" min={1} max={50} value={dialog.requiredHeadcount} onChange={(e) => setDialog({ ...dialog, requiredHeadcount: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label title="Gesetzliche Mindestbesetzung – fließt in Solver & Warnungen ein">davon Apotheker:in</Label>
                  <Input type="number" min={0} max={10} value={dialog.requiredPharmacists} onChange={(e) => setDialog({ ...dialog, requiredPharmacists: Number(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Notiz (optional)</Label>
                <Input value={dialog.notes} onChange={(e) => setDialog({ ...dialog, notes: e.target.value })} />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Abbrechen</Button></DialogClose>
            <Button onClick={saveShift} disabled={pending}>{pending ? "Speichern…" : "Speichern"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {canPlan && <PlanReview open={planOpen} onOpenChange={setPlanOpen} locationId={locationId} weekStart={weekStart} />}
      {canPlan && <SolverReview open={solverOpen} onOpenChange={setSolverOpen} locationId={locationId} weekStart={weekStart} />}
      {canPlan && <TemplateApply open={templateOpen} onOpenChange={setTemplateOpen} templates={templates} locationId={locationId} weekStart={weekStart} />}
      {canManage && replace && (
        <ReplacementModal
          open={!!replace}
          onOpenChange={(o) => { if (!o) setReplace(null); }}
          employeeId={replace.employeeId}
          date={replace.date}
        />
      )}
    </div>
  );
}
