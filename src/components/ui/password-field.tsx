"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

// Passwortfeld mit zwei Komfortfunktionen:
// 1) Augen-Knopf: ganzes Passwort ein-/ausblenden.
// 2) "Letzten Buchstaben zeigen": beim Tippen erscheint das zuletzt
//    eingegebene Zeichen kurz (~1s), dann wird es zu einem Punkt — wie am Handy.
export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  minLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  minLength?: number;
}) {
  const [show, setShow] = React.useState(false);
  const [revealLast, setRevealLast] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function handleChange(v: string) {
    // Nur beim Hinzufügen von Zeichen kurz zeigen (nicht beim Löschen)
    if (v.length > value.length) {
      setRevealLast(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setRevealLast(false), 1000);
    } else {
      setRevealLast(false);
    }
    onChange(v);
  }

  // Angezeigter Text: bei "show" alles; sonst Punkte, ggf. letztes Zeichen sichtbar
  const masked = show
    ? value
    : revealLast && value.length > 0
      ? "•".repeat(value.length - 1) + value.slice(-1)
      : "•".repeat(value.length);

  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="relative">
        {/* Echtes Eingabefeld (unsichtbarer Text, echte Tastatur/Autofill) */}
        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          spellCheck={false}
          autoCapitalize="off"
          className="w-full rounded-md border bg-background px-3 py-2 pr-9 text-sm text-transparent caret-foreground outline-none focus:ring-1 focus:ring-ring"
          style={{ caretColor: "var(--foreground, #111)" }}
        />
        {/* Sichtbare Maskierungs-Anzeige darüber */}
        <div className="pointer-events-none absolute inset-0 flex items-center px-3 text-sm tabular-nums">
          {masked || <span className="text-muted-foreground">&nbsp;</span>}
        </div>
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          tabIndex={-1}
          aria-label={show ? "Passwort verbergen" : "Passwort anzeigen"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
