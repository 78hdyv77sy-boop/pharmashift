"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, Sparkles, CornerDownLeft, CalendarRange, CalendarOff, Siren, UserCog, CalendarCheck, LayoutTemplate, Building2, Tags, Users, ShieldCheck, ScrollText, Settings, LayoutDashboard } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// UX-P1 / 13.2 X2: ⌘K vereint Navigation und Agent-Eingabe.
// Kein cmdk-Dependency – bewusst klein gehalten.
// Agent-Übergabe per CustomEvent an den bestehenden VoiceAgent (Single Source
// für Vorschlag/Bestätigung/Undo bleibt dort).

export const AGENT_EVENT = "pharmashift:agent";

interface Entry { label: string; href: string; icon: React.ComponentType<{ className?: string }>; keywords?: string }

const ENTRIES: Entry[] = [
  { label: "Heute", href: "/admin/dashboard", icon: LayoutDashboard, keywords: "dashboard übersicht" },
  { label: "Dienstplan", href: "/admin/shifts", icon: CalendarRange, keywords: "kalender woche schichten plan" },
  { label: "Abwesenheiten", href: "/admin/absences", icon: CalendarOff, keywords: "urlaub krank frei" },
  { label: "Notdienst", href: "/admin/emergency", icon: Siren, keywords: "rotation nacht" },
  { label: "Mitarbeiter", href: "/admin/employees", icon: UserCog, keywords: "team personal import" },
  { label: "Verfügbarkeiten", href: "/admin/availability", icon: CalendarCheck, keywords: "wunsch frei" },
  { label: "Schicht-Vorlagen", href: "/admin/templates", icon: LayoutTemplate, keywords: "muster" },
  { label: "Standorte", href: "/admin/locations", icon: Building2, keywords: "filialen apotheken" },
  { label: "Stammdaten", href: "/admin/master-data", icon: Tags, keywords: "qualifikationen typen" },
  { label: "Userverwaltung", href: "/admin/users", icon: Users, keywords: "konten einladen" },
  { label: "Rollen", href: "/admin/roles", icon: ShieldCheck, keywords: "rechte permissions rbac" },
  { label: "Audit-Log", href: "/admin/audit", icon: ScrollText, keywords: "protokoll historie" },
  { label: "Einstellungen", href: "/admin/settings", icon: Settings, keywords: "organisation slug zeitzone" },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [index, setIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K global
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const q = query.trim().toLowerCase();
  const matches = q
    ? ENTRIES.filter((e) => e.label.toLowerCase().includes(q) || e.keywords?.includes(q))
    : ENTRIES.slice(0, 6);

  // Letzte Zeile: Eingabe an den Agenten übergeben (AI-first)
  const rows = [...matches.map((e) => ({ kind: "nav" as const, entry: e })), ...(q ? [{ kind: "agent" as const }] : [])];
  const clamped = Math.min(index, Math.max(rows.length - 1, 0));

  function runRow(rowIndex: number) {
    const row = rows[rowIndex];
    if (!row) return;
    setOpen(false);
    if (row.kind === "nav") {
      router.push(row.entry.href);
    } else {
      window.dispatchEvent(new CustomEvent(AGENT_EVENT, { detail: { text: query.trim() } }));
    }
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, rows.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); runRow(clamped); }
  }

  return (
    <>
      {/* Trigger im Header (Desktop) */}
      <button
        onClick={() => setOpen(true)}
        className="hidden h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground hover:bg-accent sm:flex"
      >
        <Search className="h-3.5 w-3.5" />
        Suchen oder KI fragen…
        <kbd className="ml-2 rounded border bg-muted px-1.5 text-[10px] font-medium">⌘K</kbd>
      </button>
      {/* UX2-P0 N5: Mobile-Zugang (kein ⌘K ohne Tastatur) */}
      <button
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-accent sm:hidden"
        aria-label="Suchen oder KI fragen"
      >
        <Search className="h-5 w-5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[20%] max-w-lg translate-y-0 gap-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">Befehle</DialogTitle>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
              onKeyDown={onInputKey}
              placeholder="Seite suchen oder Anweisung eingeben…"
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-80 overflow-y-auto p-1.5">
            {rows.map((row, i) => {
              const active = i === clamped;
              if (row.kind === "nav") {
                const Icon = row.entry.icon;
                return (
                  <button
                    key={row.entry.href}
                    onClick={() => runRow(i)}
                    onMouseEnter={() => setIndex(i)}
                    className={cn("flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm", active ? "bg-accent" : "")}
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {row.entry.label}
                    {active && <CornerDownLeft className="ml-auto h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                );
              }
              return (
                <button
                  key="agent"
                  onClick={() => runRow(i)}
                  onMouseEnter={() => setIndex(i)}
                  className={cn("mt-1 flex w-full items-center gap-2.5 rounded-md border-t px-2.5 py-2.5 text-left text-sm", active ? "bg-accent" : "")}
                >
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="min-w-0 truncate">
                    Mit KI ausführen: <span className="font-medium">„{query.trim()}"</span>
                  </span>
                  {active && <CornerDownLeft className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                </button>
              );
            })}
            {rows.length === 0 && <p className="px-2.5 py-6 text-center text-sm text-muted-foreground">Keine Treffer.</p>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
