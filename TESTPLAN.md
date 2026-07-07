# PharmaShift — Abnahme-Testplan (Live-App)

Durchklicken auf https://pharmashift-two.vercel.app — jeder Schritt mit
erwartetem Ergebnis. Abweichungen einfach mit Schritt-Nummer melden.

## 1. Login & Passwort
1.1 Login `admin@pharmashift.local` / `ChangeMe123` → **Erwartet:** Weiterleitung aufs Dashboard „Heute".
1.2 Userverwaltung → eigenes Konto → Passwort ändern → ab-/wieder anmelden → **Erwartet:** neues Passwort gilt, altes nicht mehr.

## 2. Stammdaten (echte Daten)
2.1 Standorte: deine Apotheke(n) anlegen. **Erwartet:** erscheinen in Auswahllisten.
2.2 Mitarbeiter: 3–4 echte anlegen (mind. 1 Apotheker:in, 1 PKA, Farben leer lassen). **Erwartet:** Liste durchsuchbar/sortierbar.

## 3. Dienstplan
3.1 Woche wählen → „+" an einem Tag → Preset „Vormittag". **Erwartet:** Schicht 08–12 erscheint sofort.
3.2 Person zuweisen. **Erwartet:** Chip erscheint SOFORT (ohne Neuladen); Apotheker-Chip matt-grün, PKA glasig.
3.3 „Automatisch füllen" bei offenen Plätzen. **Erwartet:** Dialog mit Vorschlägen + Begründungen; Übernehmen füllt Plan; „Rückgängig" macht es rückgängig.
3.4 ⋯-Menü → „2-Wochen-PDF drucken". **Erwartet:** saubere 2-Wochen-Ansicht, Cmd+P → PDF.

## 4. Abwesenheit → Ersatz
4.1 Für eine eingeteilte Person Abwesenheit (nächste Woche) anlegen → genehmigen. **Erwartet:** Warnung wegen bestehender Dienste → nach Bestätigen öffnet sich der Ersatz-Entwurf.
4.2 Vorschläge prüfen → übernehmen. **Erwartet:** Dienste umgebucht, Erfolgsmeldung mit „Rückgängig".

## 5. Schichttausch
5.1 „Schichttausch" → Antrag zwischen zwei Personen stellen. **Erwartet:** Status „Offen".
5.2 Annehmen. **Erwartet:** Dienste getauscht ODER klare AZG-Fehlermeldung (z. B. Ruhezeit <11h), dann wird NICHT getauscht.

## 6. Aufgaben
6.1 Aufgabe „Kühlschrankkontrolle", wöchentlich Montag 08:00, an eine Person. **Erwartet:** erscheint montags in Tagesansicht + auf „Heute".
6.2 Abhaken. **Erwartet:** Haken sofort, Name + Uhrzeit sichtbar, Zähler x/y.

## 7. Nachtdienst
7.1 Dienst starten → 2–3× „+ Kunde" zu verschiedenen Zeiten. **Erwartet:** Tarif je Uhrzeit korrekt (3,32/6,52/14,44 €), Summe live. Auf „Heute" erscheint der grüne Nachtdienst-Banner.
7.2 „Nachtragen" mit gestriger Uhrzeit. **Erwartet:** Eintrag einsortiert, Tarif passend zur NACHGETRAGENEN Zeit.
7.3 Abschließen → „Abrechnung als PDF". **Erwartet:** Report mit Pauschale, Tarif-Aufschlüsselung, Einzelliste, steuerbegünstigtem Zuschlag-Anteil, Unterschriftszeilen.

## 8. Chat (3 Accounts: A=Leitung, B+C=Mitarbeiter)
8.1 Team „Backoffice" mit A+B anlegen (ohne C).
8.2 A schreibt in „Backoffice". **Erwartet:** B sieht die Nachricht (Widget/Chat-Seite), **C sieht den Kanal gar nicht**.
8.3 B schreibt in „Allgemein". **Erwartet:** alle drei sehen es.

## 9. Fairness
9.1 Seite „Fairness" (Verwaltung) als Leitung: Zeiträume 90d/Jahr/Gesamt umschalten. **Erwartet:** Tabellen je Rolle, Scores 0–100.
9.2 Als Mitarbeiter B öffnen. **Erwartet:** nur eigene Zeile „(ich)".

## 10. Handy (iPhone + Android)
10.1 Safari/Chrome → Adresse öffnen → „Zum Home-Bildschirm"/„App installieren". **Erwartet:** grünes Kräuter-Mörser-Icon, Start im Vollbild auf „Heute".
10.2 Dienstplan + Chat am Handy bedienen. **Erwartet:** nichts abgeschnitten, Tabellen seitlich wischbar.

## Abschluss-Sicherheit
- [ ] Admin-Passwort geändert (1.2)
- [ ] Neon-DB-Passwort zurückgesetzt + neue URL in Vercel & lokaler .env
- [ ] GitHub-Repo steht auf Private

## 11. Neuigkeiten-Feed (v0.63)
11.1 „Neuigkeiten" in der Navigation öffnen → Beitrag schreiben (Zielgruppe: dein Standort) → **Erwartet:** erscheint sofort oben im Feed und kompakt auf „Heute".
11.2 Als Mitarbeiter B (anderer Standort) prüfen → **Erwartet:** Beitrag NICHT sichtbar. Beitrag „📢 Alle Apotheken" (nur Leitung wählbar) → B sieht ihn.
11.3 B öffnet den Feed → **Erwartet:** beim Autor steigt der Gesehen-Zähler, Doppelhaken beim Gesehenen; Autor/Leitung: Klick auf Zähler zeigt „Gesehen von …" mit Zeit.
11.4 Foto anhängen → **Erwartet:** Vorschau im Beitrag, Klick = Großansicht. PDF anhängen → eingebettete Vorschau + „Herunterladen".
11.5 Kommentar unter fremdem Beitrag → **Erwartet:** erscheint chronologisch mit Name.
11.6 Umfrage „Weihnachtsfeier?" (Ja/Nein/Vielleicht, eigene Antworten AN) → B stimmt ab, ändert Stimme, trägt eigene Antwort ein → **Erwartet:** Balken + Zähler live; Autor sieht Namen; nach „Schließen" keine Stimmabgabe mehr.
11.7 Eigenen Beitrag löschen (Papierkorb) → **Erwartet:** verschwindet; Leitung kann fremde löschen.

## 12. 1:1-Direktnachrichten (v0.63)
12.1 Chat öffnen → „＋ Direktnachricht" → Person wählen → **Erwartet:** privater Kanal „@ Name" erscheint, Nachrichten kommen nur dort an.
12.2 Als Leitung (drittes Konto) prüfen → **Erwartet:** fremde DM taucht NIRGENDS auf — DMs sind privat, auch für die Leitung.
