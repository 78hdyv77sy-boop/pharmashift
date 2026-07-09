"use client";

import * as React from "react";
import { Loader2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { PasswordField } from "@/components/ui/password-field";
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

  return (
    <form onSubmit={(e) => { submit(e).catch(() => {}); }} className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="h-4 w-4 text-muted-foreground" /> Passwort ändern
      </div>
      <PasswordField label="Aktuelles Passwort" value={current} onChange={setCurrent} autoComplete="current-password" />
      <PasswordField label="Neues Passwort (min. 8 Zeichen)" value={next} onChange={setNext} autoComplete="new-password" minLength={8} />
      <PasswordField label="Neues Passwort wiederholen" value={repeat} onChange={setRepeat} autoComplete="new-password" minLength={8} />
      <Button type="submit" disabled={busy || !current || !next || !repeat} className="w-full">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Passwort speichern"}
      </Button>
    </form>
  );
}
