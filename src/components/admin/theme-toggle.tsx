"use client";

import * as React from "react";
import { Sun, Moon, Monitor } from "lucide-react";

type Theme = "light" | "dark" | "system";
const ORDER: Theme[] = ["light", "dark", "system"];
const LABEL: Record<Theme, string> = { light: "Hell", dark: "Dunkel", system: "System" };

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

// Hell/Dunkel/System-Umschalter. Merkt sich die Wahl im Browser;
// "System" folgt der Geräte-Einstellung (z. B. nachts automatisch dunkel).
export function ThemeToggle() {
  const [theme, setTheme] = React.useState<Theme>("system");

  React.useEffect(() => {
    const saved = (localStorage.getItem("ps-theme") as Theme | null) ?? "system";
    setTheme(saved);
    apply(saved);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if ((localStorage.getItem("ps-theme") ?? "system") === "system") apply("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    localStorage.setItem("ps-theme", next);
    apply(next);
  }

  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  return (
    <button
      onClick={cycle}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title={`Design: ${LABEL[theme]} (klicken zum Wechseln)`}
      aria-label={`Design umschalten, aktuell ${LABEL[theme]}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
