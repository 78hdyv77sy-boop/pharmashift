"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Mic, Square, Send, Sparkles, Loader2, X, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AGENT_TOOL_MAP, type AgentField, type ChangesetItem } from "@/lib/agent/tool-meta";
import { ABSENCE_TYPES, ABSENCE_TYPE_LABEL } from "@/lib/domain/absence-types";
import { todayISO } from "@/lib/domain/dates";
import { PlanReview } from "@/components/domain/plan-review";
import { ReplacementModal } from "@/components/domain/replacement-modal";
import { proposeAction, executeAction, executeChangeset, undoInteraction } from "@/app/admin/agent-actions";
import type { HistoryTurn } from "@/lib/agent/run";
import { AGENT_EVENT } from "@/components/admin/command-palette";

type Opt = { id: string; name: string };
interface Props { employees: Opt[]; locations: Opt[]; roles: Opt[]; }

type Phase = "idle" | "recording" | "transcribing" | "thinking" | "form" | "changeset" | "answer" | "executing";

export function VoiceAgent({ employees, locations, roles }: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [transcript, setTranscript] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [toolName, setToolName] = React.useState<string | null>(null);
  const [values, setValues] = React.useState<Record<string, unknown>>({});
  const [changeset, setChangeset] = React.useState<ChangesetItem[]>([]);
  const [history, setHistory] = React.useState<HistoryTurn[]>([]); // Session-Memory (AI-P2)
  const [undoId, setUndoId] = React.useState<string | null>(null);

  // Seitenkontext (8.6 V3): aktuelle Filiale/Woche aus der URL ableiten
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pageContext = React.useMemo(() => {
    const locationId = searchParams.get("locationId") ?? undefined;
    const weekStart = searchParams.get("week") ?? undefined;
    if (!pathname?.startsWith("/admin")) return undefined;
    if (!locationId && !weekStart) return undefined;
    return { locationId, weekStart };
  }, [pathname, searchParams]);
  const [plan, setPlan] = React.useState<{ locationId: string; weekStart: string } | null>(null);
  const [replace, setReplace] = React.useState<{ employeeId: string; date: string } | null>(null);

  const mediaRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);

  function closeAndForget() {
    setHistory([]);
    setOpen(false);
  }
  function reset() {
    setPhase("idle"); setTranscript(""); setMessage(null); setError(null); setToolName(null); setValues({}); setChangeset([]); setUndoId(null);
  }

  function optionsFor(source?: AgentField["optionSource"]): { value: string; label: string }[] {
    if (source === "employees") return employees.map((e) => ({ value: e.id, label: e.name }));
    if (source === "locations") return locations.map((l) => ({ value: l.id, label: l.name }));
    if (source === "roles") return roles.map((r) => ({ value: r.id, label: r.name }));
    if (source === "absenceTypes") return ABSENCE_TYPES.map((t) => ({ value: t, label: ABSENCE_TYPE_LABEL[t] }));
    return [];
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await transcribe(blob);
      };
      mediaRef.current = mr;
      mr.start();
      setPhase("recording");
    } catch {
      setError("Kein Mikrofonzugriff. Bitte Text eingeben.");
      setPhase("idle");
    }
  }

  function stopRecording() {
    mediaRef.current?.stop();
    setPhase("transcribing");
  }

  async function transcribe(blob: Blob) {
    setPhase("transcribing");
    try {
      const fd = new FormData();
      fd.append("audio", blob, "audio.webm");
      const res = await fetch("/api/agent/transcribe", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Transkription fehlgeschlagen."); setPhase("idle"); return; }
      setTranscript(data.text ?? "");
      await propose(data.text ?? "");
    } catch {
      setError("Transkription fehlgeschlagen.");
      setPhase("idle");
    }
  }

  // ⌘K-Palette (UX-P1 X2): Text-Anweisungen kommen per CustomEvent herein
  React.useEffect(() => {
    function onAgentEvent(e: Event) {
      const text = (e as CustomEvent<{ text?: string }>).detail?.text?.trim();
      if (!text) return;
      reset();
      setOpen(true);
      setTranscript(text);
      void propose(text);
    }
    window.addEventListener(AGENT_EVENT, onAgentEvent);
    return () => window.removeEventListener(AGENT_EVENT, onAgentEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function propose(text: string) {
    if (!text.trim()) return;
    setPhase("thinking");
    setError(null);
    const res = await proposeAction(text, pageContext, history);
    if (res.type === "error") { setError(res.message); setPhase("idle"); return; }
    if (res.type === "answer") {
      setHistory((h) => [...h, { role: "user" as const, text }, { role: "assistant" as const, text: res.message }].slice(-8));
      setMessage(res.message); setPhase("answer"); return;
    }
    setHistory((h) => [...h, { role: "user" as const, text }, { role: "assistant" as const, text: `[Vorschlag: ${res.type === "tool" ? res.toolName : "Änderungsbündel"}]` }].slice(-8));
    if (res.type === "changeset") {
      setChangeset(res.items);
      setMessage(res.message ?? null);
      setPhase("changeset");
      return;
    }
    // Sonderfall: Wochenplan -> zweistufige Vorschau statt generischem Formular
    if (res.toolName === "generate_week_plan") {
      const locationId = (res.values?.locationId as string) || locations[0]?.id || "";
      const weekStart = (res.values?.weekStart as string) || todayISO();
      setOpen(false);
      setPlan({ locationId, weekStart });
      return;
    }
    if (res.toolName === "find_replacement") {
      const employeeId = (res.values?.employeeId as string) || "";
      const date = (res.values?.date as string) || todayISO();
      setOpen(false);
      setReplace({ employeeId, date });
      return;
    }
    // tool
    setToolName(res.toolName);
    setValues(res.values ?? {});
    setMessage(res.message ?? null);
    setPhase("form");
  }

  async function execute() {
    if (!toolName) return;
    setPhase("executing");
    const res = await executeAction(toolName, values);
    if (!res.ok) { setError(res.error ?? "Fehler"); setPhase("form"); return; }
    setMessage(res.message ?? "Erledigt ✓");
    setUndoId(res.canUndo && res.interactionId ? res.interactionId : null);
    setPhase("answer");
    router.refresh();
  }

  function labelForValue(field: AgentField, v: unknown): string {
    const val = typeof v === "string" || typeof v === "number" ? String(v) : "";
    if (!val) return "—";
    const opt = optionsFor(field.optionSource).find((o) => o.value === val);
    return opt ? opt.label : val;
  }
  function summarizeItem(item: ChangesetItem): string {
    const m = AGENT_TOOL_MAP[item.toolName];
    if (!m) return item.toolName;
    return m.fields
      .map((f) => `${f.label}: ${labelForValue(f, item.values[f.key])}`)
      .join(" · ");
  }
  function removeChangesetItem(index: number) {
    setChangeset((prev) => prev.filter((_, i) => i !== index));
  }
  async function runChangeset() {
    setPhase("executing");
    const res = await executeChangeset(changeset);
    if (!res.ok) {
      const done = res.results.filter((r) => r.ok).length;
      setError(`${res.error ?? "Fehler"}${done ? ` – ${done} Aktion(en) davor wurden ausgeführt.` : ""}`);
      setUndoId(res.canUndo && res.interactionId ? res.interactionId : null);
      setPhase(done ? "answer" : "changeset");
      if (done) setMessage(`Teilweise ausgeführt (${done}/${res.results.length}).`);
      router.refresh();
      return;
    }
    setMessage(res.message ?? "Erledigt ✓");
    setUndoId(res.canUndo && res.interactionId ? res.interactionId : null);
    setPhase("answer");
    router.refresh();
  }
  async function undo() {
    if (!undoId) return;
    const res = await undoInteraction(undoId);
    if (!res.ok) { setError(res.error ?? "Fehler"); return; }
    setUndoId(null);
    setMessage(res.message ?? "Rückgängig gemacht.");
    router.refresh();
  }

  const meta = toolName ? AGENT_TOOL_MAP[toolName] : null;

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => { reset(); setOpen(true); }}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 sm:hidden"
        aria-label="Voice-Agent öffnen"
      >
        <Sparkles className="h-6 w-6" />
      </button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> Sprach-Assistent</DialogTitle>
            <DialogDescription>Sprich oder tippe eine Anweisung – z. B. „Lisa braucht Freitag frei".</DialogDescription>
          </DialogHeader>

          {/* Eingabe */}
          {(phase === "idle" || phase === "recording" || phase === "transcribing" || phase === "thinking") && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {phase === "recording" ? (
                  <Button variant="destructive" onClick={stopRecording}><Square className="h-4 w-4" /> Aufnahme stoppen</Button>
                ) : (
                  <Button variant="outline" onClick={startRecording} disabled={phase !== "idle"}><Mic className="h-4 w-4" /> Aufnehmen</Button>
                )}
                {(phase === "transcribing" || phase === "thinking") && (
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> {phase === "transcribing" ? "Transkribiere…" : "Analysiere…"}
                  </span>
                )}
              </div>
              <div className="space-y-2">
                <Label>Oder Text eingeben</Label>
                <div className="flex gap-2">
                  <Input
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && propose(transcript)}
                    placeholder="Anweisung…"
                  />
                  <Button onClick={() => propose(transcript)} disabled={!transcript.trim() || phase === "thinking"}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}

          {/* Vorausgefülltes Formular */}
          {phase === "form" && meta && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted/40 p-2 text-sm">
                <span className="font-medium">{meta.title}</span>
                {transcript && <span className="text-muted-foreground"> · „{transcript}"</span>}
              </div>
              {message && <p className="text-xs text-amber-700">{message}</p>}
              {meta.fields.map((f) => {
                const val = values[f.key];
                if (f.type === "select") {
                  return (
                    <div key={f.key} className="space-y-1.5">
                      <Label>{f.label}</Label>
                      <Select value={(val as string) || ""} onValueChange={(v) => setValues((p) => ({ ...p, [f.key]: v }))}>
                        <SelectTrigger><SelectValue placeholder={`${f.label} wählen`} /></SelectTrigger>
                        <SelectContent>
                          {optionsFor(f.optionSource).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                }
                if (f.type === "textarea") {
                  return (
                    <div key={f.key} className="space-y-1.5">
                      <Label>{f.label}</Label>
                      <Textarea value={(val as string) ?? ""} onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))} />
                    </div>
                  );
                }
                return (
                  <div key={f.key} className="space-y-1.5">
                    <Label>{f.label}</Label>
                    <Input
                      type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "time" ? "time" : "text"}
                      value={(val as string | number) ?? ""}
                      onChange={(e) => setValues((p) => ({ ...p, [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value }))}
                    />
                  </div>
                );
              })}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <Button variant="outline" onClick={reset}>Abbrechen</Button>
                <Button onClick={execute}>Ausführen</Button>
              </DialogFooter>
            </div>
          )}

          {/* Aktionsbündel-Review (8.6 V2) */}
          {phase === "changeset" && (
            <div className="space-y-3">
              <div className="rounded-md bg-muted/40 p-2 text-sm">
                <span className="font-medium">{changeset.length} vorgeschlagene Änderungen</span>
                {transcript && <span className="text-muted-foreground"> · „{transcript}"</span>}
              </div>
              {message && <p className="text-xs text-amber-700">{message}</p>}
              {changeset.map((item, i) => {
                const m = AGENT_TOOL_MAP[item.toolName];
                return (
                  <div key={i} className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium">{m?.title ?? item.toolName}</div>
                      <div className="truncate text-xs text-muted-foreground">{summarizeItem(item)}</div>
                    </div>
                    <button onClick={() => removeChangesetItem(i)} className="text-muted-foreground hover:text-destructive" aria-label="Entfernen">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <Button variant="outline" onClick={reset}>Abbrechen</Button>
                <Button onClick={runChangeset} disabled={changeset.length === 0}>
                  {changeset.length} Änderung(en) ausführen
                </Button>
              </DialogFooter>
            </div>
          )}

          {phase === "executing" && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Wird ausgeführt…
            </div>
          )}

          {phase === "answer" && (
            <div className="space-y-4">
              <p className="text-sm whitespace-pre-wrap">{message}</p>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                {undoId && (
                  <Button variant="outline" onClick={undo}>
                    <Undo2 className="h-4 w-4" /> Rückgängig
                  </Button>
                )}
                <Button variant="outline" onClick={reset}>Neue Anweisung</Button>
                <Button onClick={closeAndForget}>Schließen</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {plan && (
        <PlanReview
          open={!!plan}
          onOpenChange={(o) => { if (!o) setPlan(null); }}
          locationId={plan.locationId}
          weekStart={plan.weekStart}
        />
      )}

      {replace && (
        <ReplacementModal
          open={!!replace}
          onOpenChange={(o) => { if (!o) setReplace(null); }}
          employeeId={replace.employeeId}
          date={replace.date}
        />
      )}
    </>
  );
}
