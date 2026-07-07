"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Clock, MapPin, User, CalendarClock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toaster";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { addDays } from "@/lib/domain/dates";
import { RECURRENCE_LABEL, ASSIGNEE_LABEL, WEEKDAY_LABEL, WEEKDAY_ORDER, type TaskRecurrenceValue } from "@/lib/domain/task-recurrence";
import { getTasksForDate, toggleTaskCompletion, createTask, updateTask, deleteTask, setTaskActive } from "./actions";
import type { TaskInstance, TaskRow, TaskEmployeeOption, TaskLocationOption } from "./task-types";

const inputCls = "w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring";

interface Props {
  today: string;
  instances: TaskInstance[];
  tasks: TaskRow[];
  employees: TaskEmployeeOption[];
  locations: TaskLocationOption[];
  canManage: boolean;
}

export function TasksClient({ today, instances, tasks, employees, locations, canManage }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [date, setDate] = React.useState(today);
  const [list, setList] = React.useState<TaskInstance[]>(instances);
  const [loading, setLoading] = React.useState(false);
  const [editing, setEditing] = React.useState<TaskRow | null | "new">(null);

  async function loadDate(d: string) {
    setDate(d);
    setLoading(true);
    const res = await getTasksForDate(d);
    setList(res);
    setLoading(false);
  }

  async function toggle(t: TaskInstance) {
    const next = !t.done;
    setList((prev) => prev.map((x) => (x.taskId === t.taskId ? { ...x, done: next } : x)));
    const res = await toggleTaskCompletion(t.taskId, date, next);
    if (!res.ok) {
      setList((prev) => prev.map((x) => (x.taskId === t.taskId ? { ...x, done: !next } : x)));
      toast(res.error ?? "Fehler", "error");
    }
  }

  const dateLabel = new Date(date + "T00:00:00Z").toLocaleDateString("de-AT", { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" });
  const doneCount = list.filter((t) => t.done).length;

  return (
    <div className="space-y-8">
      {/* Tagesansicht */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => loadDate(addDays(date, -1))} aria-label="Vorheriger Tag"><ChevronLeft className="h-4 w-4" /></Button>
            <div className="min-w-44 text-center text-sm font-medium">{dateLabel}</div>
            <Button variant="ghost" size="icon" onClick={() => loadDate(addDays(date, 1))} aria-label="Nächster Tag"><ChevronRight className="h-4 w-4" /></Button>
            {date !== today && <Button variant="outline" size="sm" onClick={() => loadDate(today)}>Heute</Button>}
          </div>
          {list.length > 0 && <span className="text-xs text-muted-foreground">{doneCount}/{list.length} erledigt</span>}
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Lade…</p>
        ) : list.length === 0 ? (
          <p className="rounded-lg border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">Keine fälligen Aufgaben an diesem Tag.</p>
        ) : (
          <div className="space-y-2">
            {list.map((t) => (
              <div key={t.taskId} className={`flex items-start gap-3 rounded-lg border p-3 ${t.done ? "bg-emerald-50/60" : ""}`}>
                <Checkbox className="mt-0.5" checked={t.done} disabled={!t.canComplete} onCheckedChange={() => toggle(t)} />
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-medium ${t.done ? "text-muted-foreground line-through" : ""}`}>
                    {t.time && <span className="mr-1 text-muted-foreground">{t.time}</span>}{t.title}
                  </div>
                  {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{t.assigneeType === "PERSON" ? t.assigneeName ?? "—" : "Wer Dienst hat"}</span>
                    {t.locationName && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{t.locationName}</span>}
                    {t.done && t.doneByName && <span className="text-emerald-700">✓ {t.doneByName}{t.doneAt ? ` · ${new Date(t.doneAt).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>}
                  </div>
                </div>
                {!t.canComplete && !t.done && <span className="shrink-0 text-[10px] text-muted-foreground">nur Zuständige</span>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Verwaltung */}
      {canManage && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">Alle Aufgaben (Vorlagen)</h2>
            <Button size="sm" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Neue Aufgabe</Button>
          </div>
          {tasks.length === 0 ? (
            <p className="rounded-lg border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">Noch keine Aufgaben angelegt.</p>
          ) : (
            <div className="space-y-2">
              {tasks.map((t) => (
                <div key={t.id} className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${t.active ? "" : "opacity-60"}`}>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{t.time && <span className="mr-1 text-muted-foreground">{t.time}</span>}{t.title}{!t.active && <span className="ml-2 text-xs text-muted-foreground">(inaktiv)</span>}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <Badge variant="secondary" className="gap-1"><CalendarClock className="h-3 w-3" />{RECURRENCE_LABEL[t.recurrence]}{t.recurrence === "WEEKLY" && t.weekday !== null ? ` · ${WEEKDAY_LABEL[t.weekday]}` : ""}{t.recurrence === "ONCE" && t.dueDate ? ` · ${t.dueDate}` : ""}</Badge>
                      <span className="text-muted-foreground">{t.assigneeType === "PERSON" ? t.assigneeName ?? "Person" : ASSIGNEE_LABEL.SHIFT}</span>
                      {t.locationName && <span className="text-muted-foreground">· {t.locationName}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setTaskActive(t.id, !t.active).then(() => router.refresh()).catch(() => toast("Fehler beim Umschalten.", "error"))}>{t.active ? "Deaktivieren" : "Aktivieren"}</Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(t)} aria-label="Bearbeiten"><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label="Löschen"
                      onClick={async () => { if (await confirm({ title: "Aufgabe löschen?", description: `„${t.title}" wird entfernt.`, confirmText: "Löschen", destructive: true })) { const r = await deleteTask(t.id); if (!r.ok) toast(r.error ?? "Fehler", "error"); else { toast("Gelöscht.", "success"); router.refresh(); } } }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {editing && (
        <TaskDialog
          task={editing === "new" ? null : editing}
          employees={employees}
          locations={locations}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); loadDate(date); }}
        />
      )}
    </div>
  );
}

function TaskDialog({ task, employees, locations, onClose, onSaved }: { task: TaskRow | null; employees: TaskEmployeeOption[]; locations: TaskLocationOption[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [title, setTitle] = React.useState(task?.title ?? "");
  const [description, setDescription] = React.useState(task?.description ?? "");
  const [assigneeType, setAssigneeType] = React.useState<"PERSON" | "SHIFT">(task?.assigneeType ?? "PERSON");
  const [assigneeEmployeeId, setAssigneeEmployeeId] = React.useState(employees.find((e) => e.name === task?.assigneeName)?.id ?? "");
  const [locationId, setLocationId] = React.useState(locations.find((l) => l.name === task?.locationName)?.id ?? "");
  const [time, setTime] = React.useState(task?.time ?? "");
  const [recurrence, setRecurrence] = React.useState<TaskRecurrenceValue>(task?.recurrence ?? "DAILY");
  const [weekday, setWeekday] = React.useState<number>(task?.weekday ?? 1);
  const [dueDate, setDueDate] = React.useState(task?.dueDate ?? "");
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    const payload = { title, description, assigneeType, assigneeEmployeeId, locationId, time, recurrence, weekday, dueDate };
    const res = task ? await updateTask(task.id, payload) : await createTask(payload);
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); return; }
    toast(res.message ?? "Gespeichert.", "success");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{task ? "Aufgabe bearbeiten" : "Neue Aufgabe"}</DialogTitle>
          <DialogDescription>z. B. „Kühlschrankkontrolle" – Mo 08:00, an Maria K.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Titel</label>
            <input className={inputCls} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Kühlschrankkontrolle" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Beschreibung (optional)</label>
            <input className={inputCls} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Zuweisen an</label>
              <select className={inputCls} value={assigneeType} onChange={(e) => setAssigneeType(e.target.value as "PERSON" | "SHIFT")}>
                <option value="PERSON">Person</option>
                <option value="SHIFT">Schicht (wer Dienst hat)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Uhrzeit (optional)</label>
              <input type="time" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          {assigneeType === "PERSON" && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Person</label>
              <select className={inputCls} value={assigneeEmployeeId} onChange={(e) => setAssigneeEmployeeId(e.target.value)}>
                <option value="">– wählen –</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium">Standort (optional)</label>
            <select className={inputCls} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Alle / egal</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Wiederholung</label>
              <select className={inputCls} value={recurrence} onChange={(e) => setRecurrence(e.target.value as TaskRecurrenceValue)}>
                <option value="ONCE">Einmalig</option>
                <option value="DAILY">Täglich</option>
                <option value="WEEKLY">Wöchentlich</option>
                <option value="SHIFT">Schichtgebunden</option>
              </select>
            </div>
            {recurrence === "WEEKLY" && (
              <div className="space-y-1">
                <label className="text-sm font-medium">Wochentag</label>
                <select className={inputCls} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                  {WEEKDAY_ORDER.map((d) => <option key={d} value={d}>{WEEKDAY_LABEL[d]}</option>)}
                </select>
              </div>
            )}
            {recurrence === "ONCE" && (
              <div className="space-y-1">
                <label className="text-sm font-medium">Datum</label>
                <input type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            )}
          </div>
          {recurrence === "SHIFT" && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" /> Fällig an Tagen mit passendem Dienst.</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={save} disabled={busy || !title.trim() || (assigneeType === "PERSON" && !assigneeEmployeeId) || (recurrence === "ONCE" && !dueDate)}>
            {busy ? "Speichern…" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
