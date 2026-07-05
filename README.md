# PharmaShift

Intelligente Dienstplanung für Apotheken – Multi-Tenant SaaS.

> **Status:** Workstream 1 (Fundament + Auth/RBAC/Multi-Tenant) ist enthalten.
> Weitere Workstreams (Listen, Userverwaltung, CMS, Dienstplan, Voice-Agent)
> folgen schrittweise. Verbindliche Referenz ist `PHARMASHIFT_PLANUNG.txt`.

## Stack
Next.js (App Router) · TypeScript · Prisma + MySQL · Auth.js (NextAuth v5,
Credentials + Google) · Resend · Tailwind + shadcn/ui · OpenAI (Voice) ·
Anthropic (Agent).

## Setup

```bash
# 1) Abhängigkeiten
npm install

# 2) Umgebungsvariablen
cp .env.example .env        # Werte ausfüllen (DATABASE_URL, AUTH_SECRET, ...)

# 3) Datenbank-Schema anlegen
npm run db:migrate          # legt die Migrations-Baseline an (PFLICHT, sobald echte Daten existieren)
# Nur für lokale Wegwerf-DBs alternativ: npm run db:push

# 4) Seed (Permissions, SuperAdmin, Demo-Org)
npm run db:seed

# 5) Start
npm run dev                 # http://localhost:3000
```

Standard-Login nach dem Seed (aus `.env`):
`admin@pharmashift.local` / `ChangeMe123!`

## Was bereits funktioniert (Workstream 1)
- Registrierung legt **User + neue Organisation + Membership** an und weist die
  Rolle **OrgAdmin** zu (Multi-Tenant Self-Signup).
- Anmeldung per **E-Mail/Passwort** und **Google**.
- **E-Mail-Verifizierung** und **Passwort-Reset** über Resend
  (im Dev ohne `RESEND_API_KEY` werden Mails in die Konsole geloggt).
- **RBAC**: Permissions, System-Rollen (OrgAdmin/Manager/Mitarbeiter/Viewer),
  org-gescopte Rollenzuweisung, serverseitige Guards (`requirePermission`).
- **Mandanten-Isolation**: `requireOrg()` als Pflicht-Kontext für org-gescopte
  Queries; `activeOrgId` steckt im JWT.
- Geschütztes **/admin/dashboard** mit Session-, Org- und Permission-Anzeige.

## Projektstruktur (Auszug)
```
prisma/schema.prisma      Vollständiges Datenmodell (Auth, RBAC, CMS, Domäne, Voice)
prisma/seed.ts            Permissions + SuperAdmin + Demo-Org
src/lib/auth.ts           Auth.js-Konfiguration (JWT, activeOrg im Token)
src/lib/rbac.ts           Permission-Checks (org-gescoped)
src/lib/tenant.ts         Tenant-Kontext (requireOrg)
src/lib/org.ts            Org-Provisionierung (Default-Rollen)
src/lib/permissions.ts    Zentrale Permission-Keys + Rollen-Sets
src/lib/email/resend.ts   Transaktionsmails
src/app/(auth)/*          Login, Registrierung, Reset, Verify + Server-Actions
src/app/admin/dashboard   Geschütztes Beispiel-Backend
src/middleware.ts         Schutz für /admin und /app
```

## Nächste Workstreams (siehe PHARMASHIFT_PLANUNG.txt)
2. Listen-Fundament (generische DataTable: Suche/Filter/Sort/Pagination)
3. Userverwaltung, Rollen-Editor, Statistik-Dashboard, Einladungs-Flow (UI)
4. CMS (Pages, Content-Blöcke mit Drag&Drop + WYSIWYG, Menüs, Media)
5. Dienstplan-Domäne (Schichten, Pläne, Verfügbarkeiten, Notdienst, Kalender)
6. Voice-Agent (OpenAI Realtime + Anthropic Tool-Use, Use-Case-Modals)
7. Export/Import
8. Politur (i18n, A11y, Tests, Deployment)
```


## Migrationen (verbindlich, P0)
- **Erstes Setup / Baseline:** `npm run db:migrate` (erzeugt `prisma/migrations/` mit einer Init-Migration).
- **Jede Schemaänderung:** erneut `npm run db:migrate` mit sprechendem Namen.
- **Deployment:** `npm run db:migrate:deploy` (wendet ausstehende Migrationen an, erzeugt nichts Neues).
- `db:push` ist NUR für lokale Wegwerf-Datenbanken erlaubt (kein Verlauf, kein Rollback).
- Hinweis: Diese Version fügt `@@unique([locationId, date])` auf `EmergencyDuty` hinzu — falls eine Alt-DB bereits doppelte Notdienste pro Tag enthält, vor der Migration Duplikate bereinigen.

## Rate-Limits (P0)
- Login: 5 Versuche/Minute je E-Mail, 20/Minute je IP.
- Sprach-Transkription: 20 Aufnahmen/Stunde je User, max. 10 MB.
- Implementiert in `src/lib/rate-limit.ts` (in-memory, je Server-Instanz). P1-Upgrade auf Redis/Upstash vorgesehen.

## Deployment-Upgrades (wenn Hosting steht)
- **Inngest** (Jobs/Cron): Nightly-Insights-Digest + Regeln ("Abwesenheit genehmigt → Auto-Ersatz-Entwurf"). Die Berechnung existiert bereits (`lib/domain/insights.ts`, Solver); nur als Inngest-Function verdrahten.
- **Sentry**: `npx @sentry/wizard@latest -i nextjs` — danach DSN in .env.
- **Upstash Redis**: `lib/rate-limit.ts` gegen `@upstash/ratelimit` tauschen (gleiche Signatur möglich) für instanzübergreifende Limits.
- **Eval Stufe 2**: `npm run eval:agent` (braucht ANTHROPIC_API_KEY + geseedete DB) — prüft echte LLM-Tool-Wahl gegen Goldens.

## Bewusst zurückgestellt (Post-v1.0, mit Begründung im Plan §14)
- Drag&Drop-Zuweisung & useOptimistic (Dropdown+Suche reicht für ~20 MA; DnD ohne Browser-Test riskant)
- Copilot-Seitenpanel (Dialog mit Session-Thread liefert den Kern)
- DateTime/UTC-Schichtzeiten (Nachtdienste über Mitternacht), Location-Scope-RBAC, ShiftSwap-Genehmigungsworkflow, CMS-Code-Entfernung — größere, separat zu planende Umbauten

## Deployment-Upgrades (aktivieren auf dem Hosting)

Diese Punkte sind im Code vorbereitet bzw. dokumentiert und werden erst in Produktion scharf geschaltet.

### 1. Inngest (Job-/Cron-System) — EINGEBAUT
Der nächtliche Insights-Digest (`src/lib/inngest/functions.ts`) mailt Warnungen
(Unterbesetzung, Apothekerpflicht-Verstöße, Notdienst-Lücken) täglich 06:00 an
OrgAdmins/Manager. Endpunkt: `/api/inngest`.

- **Lokal testen:** in einem zweiten Terminal `npx inngest-cli@latest dev` starten,
  während `npm run dev` läuft. Das Inngest-Dashboard (localhost:8288) zeigt die
  Funktion und erlaubt einen manuellen Testlauf.
- **Produktion:** App bei Inngest registrieren, `INNGEST_EVENT_KEY` und
  `INNGEST_SIGNING_KEY` als Env setzen. Ohne diese Werte passiert nichts.

### 2. Sentry (Fehler-Überwachung) — braucht deinen Account
Noch nicht verdrahtet, um den lokalen Build nicht zu gefährden. Aktivierung:
`npx @sentry/wizard@latest -i nextjs` ausführen (legt Config + `instrumentation.ts`
an), dann `SENTRY_DSN` setzen. Der Wizard passt `next.config` automatisch an.

### 3. Upstash (verteiltes Rate-Limit) — braucht deinen Account
Das aktuelle Rate-Limit ist In-Memory (pro Server-Instanz). Für mehrere Instanzen:
`npm i @upstash/ratelimit @upstash/redis`, dann in `src/lib/rate-limit.ts` einen
Upstash-Zweig ergänzen (wenn `UPSTASH_REDIS_REST_URL` gesetzt ist). Fällt sonst
auf In-Memory zurück.

### 4. Baseline-Migration (einmalig, lokal)
Aktuell wird das Schema per `npx prisma db push` gepflegt. Für einen echten
Migrationsverlauf einmalig `npm run db:migrate` ausführen (erzeugt die Baseline).
