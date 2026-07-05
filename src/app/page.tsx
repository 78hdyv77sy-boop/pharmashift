import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8 text-center">
      <div className="space-y-3">
        <p className="text-sm font-medium tracking-widest text-muted-foreground">PHARMASHIFT</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Intelligente Dienstplanung für Apotheken
        </h1>
        <p className="mx-auto max-w-xl text-muted-foreground">
          Schichten, Notdienste und Teams – per Sprache gesteuert, vom KI-Agenten vorbereitet,
          von dir bestätigt.
        </p>
      </div>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/register">Kostenlos starten</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/login">Anmelden</Link>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Fundament v0.1 · Auth &amp; Multi-Tenant aktiv · CMS &amp; Voice folgen
      </p>
    </main>
  );
}
