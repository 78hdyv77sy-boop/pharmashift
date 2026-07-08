"use client";

import * as React from "react";
import { Loader2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { changeOwnPassword } from "./actions";

export function ChangePasswordForm() {
  const { toast } = useToast();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [repeat, setRepeat] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await changeOwnPassword(current, next, repeat).catch(() => ({ ok: false, error: "Unerwarteter Fehler.", message: undefined as string | undefined }));
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); return; }
    toast(res.message ?? "Passwort geändert.", "success");
    setCurrent(""); setNext(""); setRepeat("");
  }

  const field = "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring";

  return (
    <form onSubmit={(e) => { submit(e).catch(() => {}); }} className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="h-4 w-4 text-muted-foreground" /> Passwort ändern
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Aktuelles Passwort</label>
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required className={field} />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Neues Passwort (min. 8 Zeichen)</label>
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required minLength={8} className={field} />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Neues Passwort wiederholen</label>
        <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" required minLength={8} className={field} />
      </div>
      <Button type="submit" disabled={busy || !current || !next || !repeat} className="w-full">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Passwort speichern"}
      </Button>
    </form>
  );
}
