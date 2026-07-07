# PharmaShift — Wartungshandbuch (Stand v0.64, Juli 2026)

Dieses Dokument konserviert das gesamte Projektwissen. Es ist für DICH
(Jack) und für JEDE künftige KI, mit der du weiterarbeitest. Bei neuen
KI-Sitzungen: **Abschnitt 7 (Master-Prompt) + aktuelles ZIP mitgeben.**

---

## 1. Was ist PharmaShift?
Dienstplan-Web-App für österreichische Apotheken (mehrere Standorte, ~20
Mitarbeiter, Handy-first). Live: **https://pharmashift-two.vercel.app**
GitHub (privat): `78hdyv77sy-boop/pharmashift` · DB: Neon Postgres
(Frankfurt/EU) · Hosting: Vercel · Lokaler Ordner:
`~/Downloads/pharmashift_v0.57_1` (Name egal — DAS ist das Git-Projekt).

**Funktionen:** Dienstplan (Presets Vormittag 08-12 / Nachmittag 14-18 /
Ganztags 08-18, „Automatisch füllen", AZG-Prüfung, 2-Wochen-PDF, iCal) ·
Abwesenheiten mit automatischem Ersatz-Entwurf + Undo · Schichttausch mit
Genehmigung · Aufgaben mit Wiederholung + „Heute" · Nachtdienst-Erfassung
(Live-Knopf, Nachtragen, PDF-Abrechnung mit VAAÖ-Tarifen 3,32/6,52/14,44 €,
steuerbegünstigter Zuschlag ausgewiesen) · Team-Chat (Allgemein, Gruppen,
private 1:1-DMs — Leitung liest DMs NICHT) · News-Feed (Beiträge, Foto-/
PDF-Vorschau, Gelesen-Häkchen mit Namensliste, Kommentare, Umfragen,
Zielgruppe Standort/alle) · Fairness-Engine (Anzeige + aktiv als
Tie-Breaker in der Auto-Zuteilung: Nacht 5× / Feiertag 3× / WE 2× /
Abend 1×, 90 Tage, je Rolle normiert) · Rollen/Rechte (RBAC) ·
Multi-Tenant · Audit-Log · PWA (Kräuter-Mörser-Logo).

## 2. Technik
Next.js 15 (App Router) · TypeScript · **Prisma 6.19.3** · PostgreSQL ·
NextAuth v5 · Tailwind + shadcn/ui · Vitest (78+ Tests) · Resend (E-Mail,
optional) · Anthropic (KI-Assistent, optional) · Inngest (Nacht-Digest).

**⚠️ WICHTIGSTE REGEL:** Prisma IMMER als `npx prisma@6.19.3 …` aufrufen.
Ein nacktes `npx prisma` lädt Version 7 → Fehler „url … no longer
supported" (P1012). Das ist KEIN Projektfehler.

## 3. Update-Ablauf (neues ZIP einspielen)
```bash
cd ~/Downloads/pharmashift_v0.57_1
unzip -o ~/Downloads/pharmashift_vX.YZ.zip -d . > /dev/null && echo FERTIG
npm install                      # nur falls package.json sich änderte
npx prisma@6.19.3 db push        # NUR wenn "db push nötig" angesagt wurde
git add . && git commit -m "vX.YZ - Kurzbeschreibung" && git push
```
Vercel baut nach dem Push automatisch (Deployments-Seite: grün abwarten).
Lokal testen: `npm run dev` → http://localhost:3000.

## 4. Umgebungsvariablen (lokal `.env`, online Vercel → Settings → Env)
| Variable | Zweck |
|---|---|
| DATABASE_URL | Neon-Verbindung (postgresql://…neon.tech…) |
| AUTH_SECRET | Zufallswert (`openssl rand -base64 32`), online EIGENER Wert |
| AUTH_URL | lokal http://localhost:3000, online https://pharmashift-two.vercel.app |
| RESEND_API_KEY + EMAIL_FROM | echte E-Mails (optional) |
| ANTHROPIC_API_KEY | KI-Assistent (optional) · OPENAI_API_KEY = Spracheingabe |
| SEED_ADMIN_EMAIL/PASSWORD | nur fürs erste Seeding |

`.env` NIE committen (steht in .gitignore) und NIE in Chats posten.
Nach Env-Änderung in Vercel: **Redeploy** nötig.

## 5. Fehlerbehebung (die echten Stolperfallen dieses Projekts)
| Symptom | Ursache → Lösung |
|---|---|
| P1012 „url no longer supported" | Prisma 7 erwischt → `npx prisma@6.19.3 …` |
| „Environment variable not found: DATABASE_URL" | `.env` fehlt/kaputt im Ordner → Abschnitt 4 |
| Vercel-Build rot: „Vulnerable Next.js" | Next-Version < 15.5.20 → `npm install next@15.5.20 --save` |
| Vercel rot: „prerendering /login" | useSearchParams ohne Suspense → Seiten sind gewrappt, Muster beibehalten |
| Login online geht nicht | AUTH_URL falsch → auf echte Domain stellen + Redeploy |
| „No Production Deployment" | Git nicht verbunden → Settings→Git→Connect, dann leeren Commit pushen |
| Klick tut nichts, kein Fenster | Dialog nicht gemountet (SolverReview-Klasse Fehler) → prüfen ob `<Komponente open={state}>` im JSX steht |
| Feed/DM-Fehler nach Update | `db push` vergessen (Team.isDirect + 7 Post-Tabellen ab v0.63) |
| Terminal „druckt" meine Anleitung als Fehler | Beispiel-AUSGABEN nie eintippen; nur Befehle aus Kästen |

## 6. Projekt-Konventionen (bei JEDER Änderung einhalten)
- `orgId` in JEDER Datenbank-Abfrage (Mandantentrennung; Test erzwingt es)
- Rechte serverseitig: `requirePermission(PERMISSIONS.X)` am Anfang jeder Action
- Mehrere Schreibvorgänge → EIN `prisma.$transaction`
- Soft-Delete (`deletedAt`), Audit-Log bei kritischen Aktionen
- Automatik immer transparent + mit „Rückgängig"
- Listen: durchsuchbar/filterbar/sortierbar/paginiert
- Client-Promises immer mit `.catch` (kein Endlos-Spinner)
- KEINE Typen aus "use server"-Dateien exportieren (eigene types-Datei)
- Texte deutsch, Beträge in Cent rechnen, `tabular-nums` für Zahlen
- Design ruhig: Grün #2a664f, Instrument Sans, Glas-Sidebar, wenig Farben

## 7. MASTER-PROMPT für künftige KI-Sitzungen (kopieren + ZIP anhängen)
> Du arbeitest an PharmaShift, einer fertigen Next.js-15-App (TypeScript,
> Prisma 6.19.3 — IMMER `npx prisma@6.19.3`, nie Prisma 7 —, PostgreSQL/
> Neon, NextAuth v5, Tailwind/shadcn, Vitest). Ich bin Programmier-
> Anfänger: gib mir EINEN Terminal-Befehl auf einmal, warte auf meine
> Ausgabe, zeige Beispiel-Ausgaben nie so, dass ich sie eintippen könnte,
> und lass mich nie Platzhalter mitten in langen Blöcken ersetzen
> (stattdessen `read -p` + kleine Schritte). Konventionen: orgId in jeder
> Query, requirePermission in jeder Action, $transaction bei Mehrfach-
> Writes, Soft-Delete, Audit-Log, Undo für Automatik, Listen immer
> suchbar/sortierbar/paginiert, .catch auf Client-Promises, keine
> Typ-Exporte aus "use server"-Dateien, deutsche UI-Texte, ruhiges
> Design (Grün #2a664f). Arbeitsablauf für jede Änderung: Code erst
> LESEN, dann ändern; danach `npx tsc --noEmit` (0 Fehler), `npx vitest
> run` (alle grün), echter `npx next build`; dann ZIP ohne node_modules/
> .next/.git liefern, sagen ob `npx prisma@6.19.3 db push` nötig ist,
> und einen kurzen Changelog-Block schreiben. Zerstöre nie bestehende
> Funktionen; im Zweifel nachfragen.

## 8. Versionsgeschichte (Kurzfassung)
v0.43-0.53 Chat/Solver/Presets/Tausch/Abwesenheits-Ersatz/Aufgaben/Digest/
Fairness-Anzeige · v0.54 Design-System (Instrument Sans, Grün, Wortmarke) ·
v0.55 Bugfix „Automatisch füllen" (Dialog war nie gemountet!) + Nachtdienst-
Nachtragen + Glas-Sidebar · v0.56 Rollen-Chips, 2-Wochen-PDF, Mörser-Chat-
Button, KV-Seite raus · v0.57 PWA + DEPLOYMENT.md · v0.58 Login-Suspense-
Fix · v0.59 Next 15.5.20 (Sicherheits-Pflicht!) + Nachtdienst-PDF-Report ·
v0.60 Szenario-Tests · v0.61 Kräuter-Logo · v0.62 Fertigstellungs-Pass
(Mobile-Tabellen, Rate-Limit Registrierung, TESTPLAN.md) · v0.63 News-Feed
+ 1:1-DMs + Fairness aktiv (db push!) · v0.64 Finaler Perfektions-Pass +
dieses Handbuch.

## 9. Wichtige Dateien
`TESTPLAN.md` Abnahme-Klickplan (12 Abschnitte) · `DEPLOYMENT.md` Go-Live-
Schritte · `prisma/schema.prisma` Datenmodell · `src/lib/domain/*` reine
Logik (Solver, Fairness, Tarife, Umfragen — hier liegen die Tests) ·
`src/app/admin/*` Seiten + Server-Actions · `src/lib/permissions.ts`
Rechte · `src/app/globals.css` Design-Tokens.
