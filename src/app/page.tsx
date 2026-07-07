import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";

// Startseite: ruhige Visitenkarte der App — Wortmarke, Kräuter-Mörser-Logo,
// klare Funktionsliste, sanfter grüner Verlauf. Kein Lärm.
export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-10 overflow-hidden p-8 text-center">
      {/* Zarter Verlauf im Hintergrund */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60rem 30rem at 50% -10%, hsl(158 42% 28% / 0.08), transparent 60%), radial-gradient(40rem 20rem at 85% 110%, hsl(158 42% 28% / 0.05), transparent 60%)",
        }}
      />

      <div className="space-y-5">
        <Image
          src="/icon-192.png"
          alt="PharmaShift Logo – Reibschale mit Kräuterzweig"
          width={72}
          height={72}
          className="mx-auto rounded-2xl shadow-sm"
          priority
        />
        <div className="wordmark justify-center text-lg">
          Pharma<span className="dot" aria-hidden="true" /><b>Shift</b>
        </div>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Intelligente Dienstplanung<br className="hidden sm:block" /> für Apotheken
        </h1>
        <p className="mx-auto max-w-xl text-muted-foreground">
          Dienstplan, Nachtdienst-Abrechnung, Aufgaben, Team-Chat und Schwarzes
          Brett – gebaut für österreichische Apotheken, zu Hause am Handy wie am
          Tara-PC.
        </p>
      </div>

      <div className="flex gap-3">
        <Button asChild size="lg">
          <Link href="/login">Anmelden</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/register">Konto erstellen</Link>
        </Button>
      </div>

      <ul className="flex max-w-2xl flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        <li>✓ Automatische Dienst-Vorschläge (AZG-geprüft)</li>
        <li>✓ Nachtdienst per Knopfdruck + PDF-Abrechnung</li>
        <li>✓ Faire Verteilung, transparent</li>
        <li>✓ Daten in der EU (Frankfurt)</li>
      </ul>
    </main>
  );
}
