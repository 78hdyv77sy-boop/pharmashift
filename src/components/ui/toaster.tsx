"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Leichtgewichtiges Toast-System (UX-P0, Abschnitt 13.2 X4).
// Ersetzt blockierende alert()-Dialoge durch nicht-blockierendes Feedback.

type ToastVariant = "success" | "error" | "info";
interface Toast { id: number; message: string; variant: ToastVariant }
interface ToastContextValue { toast: (message: string, variant?: ToastVariant) => void }

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast außerhalb von <ToastProvider>");
  return ctx;
}

const AUTO_DISMISS_MS = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextId = React.useRef(1);

  const dismiss = React.useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback((message: string, variant: ToastVariant = "info") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev.slice(-3), { id, message, variant }]);
    setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Stack unten zentriert (mobil) / unten rechts (Desktop) */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-lg border bg-background px-3 py-2.5 text-sm shadow-lg",
              "animate-in fade-in slide-in-from-bottom-2",
              t.variant === "error" && "border-destructive/40",
            )}
          >
            {t.variant === "success" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />}
            {t.variant === "error" && <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
            <span className="min-w-0 flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="text-muted-foreground hover:text-foreground" aria-label="Schließen">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
