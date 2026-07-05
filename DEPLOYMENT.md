# PharmaShift online stellen — Schritt für Schritt

Ziel: Die App läuft im Internet, dein Team kann sie **am Handy** und auf den
Apotheken-PCs nutzen. Kosten: mit den Gratis-Stufen von Vercel + Neon **0 €**
für den Start.

Voraussetzung: Git ist eingerichtet (`git init` + erster Commit, siehe unten).

---

## Schritt 0 — Git (falls noch nicht geschehen)

```bash
cd ~/Downloads/pharmashift_v0.54     # dein Projektordner
git init
git add .
git commit -m "PharmaShift - erster Stand"
```

## Schritt 1 — GitHub-Konto + Repository (das Online-Backup)

1. Auf https://github.com kostenloses Konto anlegen.
2. Oben rechts „+" → „New repository" → Name `pharmashift`,
   **Private** auswählen → „Create repository".
3. Die dort angezeigten Befehle im Terminal ausführen (Abschnitt
   „…or push an existing repository"), etwa:
   ```bash
   git remote add origin https://github.com/DEIN-NAME/pharmashift.git
   git branch -M main
   git push -u origin main
   ```

## Schritt 2 — Datenbank in der Cloud (Neon, kostenlos)

1. Auf https://neon.tech mit dem GitHub-Konto anmelden.
2. „New Project" → Name `pharmashift`, Region **Frankfurt (eu-central-1)**
   (DSGVO: Daten bleiben in der EU).
3. Die angezeigte **Connection String** kopieren
   (beginnt mit `postgresql://...neon.tech/...`).

## Schritt 3 — Tabellen + Admin in die Cloud-Datenbank

Im Terminal (die URL aus Schritt 2 einsetzen, Anführungszeichen behalten):

```bash
cd ~/Downloads/pharmashift_v0.54
DATABASE_URL="postgresql://...neon.tech/..." npx prisma db push
DATABASE_URL="postgresql://...neon.tech/..." npm run db:seed
```

Danach existieren in der Cloud alle Tabellen + der Admin-Login
(`admin@pharmashift.local` / `ChangeMe123!` — **nach dem ersten Login ändern!**).

## Schritt 4 — Vercel (das Hosting)

1. Auf https://vercel.com mit dem GitHub-Konto anmelden.
2. „Add New… → Project" → dein `pharmashift`-Repository → „Import".
3. Vor dem Deploy unter **Environment Variables** eintragen:

   | Name | Wert |
   |---|---|
   | `DATABASE_URL` | die Neon-URL aus Schritt 2 |
   | `AUTH_SECRET` | neuer Wert: `openssl rand -base64 32` |
   | `AUTH_URL` | nach dem 1. Deploy: `https://DEINE-APP.vercel.app` |
   | `ANTHROPIC_API_KEY` | optional (KI-Assistent) |
   | `OPENAI_API_KEY` | optional (Spracheingabe) |
   | `RESEND_API_KEY` | optional (echte E-Mails) |
   | `EMAIL_FROM` | z. B. `PharmaShift <no-reply@deine-domain.at>` |

4. „Deploy" klicken (dauert 2–3 Minuten).
5. Danach die zugewiesene Adresse (`https://pharmashift-xxx.vercel.app`)
   als `AUTH_URL` in den Environment Variables nachtragen → „Redeploy".

## Schritt 5 — Team einladen

1. Als Admin einloggen → Passwort ändern.
2. Userverwaltung → Mitarbeiter einladen (mit `RESEND_API_KEY` kommen die
   Einladungen per E-Mail; ohne kannst du die Links manuell weitergeben).

## Schritt 6 — Aufs Handy „installieren" (fürs Team)

Die App ist als Web-App installierbar (eigenes Symbol, Vollbild):

- **iPhone (Safari):** Adresse öffnen → Teilen-Symbol →
  „Zum Home-Bildschirm". 
- **Android (Chrome):** Adresse öffnen → Menü (⋮) →
  „App installieren" / „Zum Startbildschirm hinzufügen".

Danach liegt PharmaShift wie eine normale App mit dem grünen
Reibschalen-Symbol am Home-Bildschirm.

## Danach: Updates einspielen

Neuen Stand von Claude bekommen → Dateien ersetzen, dann:
```bash
git add . && git commit -m "vX.YZ - Beschreibung" && git push
```
Vercel baut automatisch neu. Bei Datenbank-Änderungen zusätzlich einmal
`DATABASE_URL="...neon..." npx prisma db push`.

---

**Sicherheits-Checkliste vor dem Team-Start**
- [ ] Admin-Passwort geändert (nicht `ChangeMe123!` lassen)
- [ ] `AUTH_SECRET` in Vercel ist ein NEUER Zufallswert (nicht der lokale)
- [ ] Repository steht auf **Private**
- [ ] `.env` ist NICHT im Repository (`.gitignore` regelt das — nichts tun)
