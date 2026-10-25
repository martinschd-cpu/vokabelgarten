# Vokabelgarten

Private Englisch-Vokabel-App für Klasse 5/6. Vokabeln aus dem Schulbuch werden in der App fotografiert, von Claude erkannt, auf einem Prüfbildschirm kontrolliert und dann täglich in kleinen Portionen gelernt. Mit jedem Lerntag wächst ein Pflänzchen.

Keine Nutzerkonten, keine Werbung, keine Tracker, keine externen Skripte. Alle Lerndaten bleiben auf dem Gerät (IndexedDB). Der Server reicht nur Fotos an die Claude API weiter und speichert nichts.

## Inhalt

- [Was die App kann](#was-die-app-kann)
- [Lokal starten](#lokal-starten)
- [Umgebungsvariablen](#umgebungsvariablen)
- [Deployment auf Railway](#deployment-auf-railway)
- [Auf dem Handy installieren](#auf-dem-handy-installieren)
- [Backup und Wiederherstellung](#backup-und-wiederherstellung)
- [Scan mit eigenem Foto testen](#scan-mit-eigenem-foto-testen)
- [Kosten pro Scan](#kosten-pro-scan)
- [Lernlogik](#lernlogik)
- [Tests](#tests)
- [Projektaufbau](#projektaufbau)
- [Datenschutz und Sicherheit](#datenschutz-und-sicherheit)

## Was die App kann

- **Heute:** Tagesportion mit höchstens 8 neuen Wörtern plus allen fälligen Wiederholungen, etwa 10 bis 15 Minuten. Neue Wörter werden zuerst vorgestellt (Wort, Aussprache, Beispielsatz). Am Ende "Geschafft für heute!" mit Sternen, danach freiwillig "Noch eine Runde?".
- **Übungsformen:** Karteikarte, Tippen (Deutsch zu Englisch und umgekehrt, tolerant bei Tippfehlern), Hören, Sprechen (optional), Zuordnen, Memory, Lückensatz und Mini-Test "Klassenarbeit üben".
- **Fotografieren:** Foto, Prüfen, Fertig. Bis zu 4 Fotos pro Durchgang, drehen und zuschneiden, Unit wählen. Erkennung über Claude oder ohne Internet direkt auf dem Gerät (Tesseract.js, ungenauer).
- **Meine Wörter:** Alle Vokabeln nach Units, mit Suche, Vorlesen, Bearbeiten und Anlegen.
- **Eltern (mit PIN):** Lernstand pro Unit, schwierige Wörter, Lernzeit, Klassenarbeits-Termine, Einstellungen, Backup, CSV-Import und -Export, Scan-Zähler mit Kostenschätzung.
- **PWA:** Installierbar, Lernen funktioniert komplett offline.

## Lokal starten

Voraussetzung: Node.js 20 oder neuer.

```bash
npm install                 # kopiert dabei Tesseract.js und Schriften nach public/vendor
cp .env.example .env        # Werte eintragen
node --env-file=.env server/index.js
```

Dann <http://localhost:3000> öffnen. Beim ersten Start fragt die App nach dem App-Code (der Wert von `APP_ACCESS_CODE`).

Zum Ausprobieren ohne Foto: auf der Startseite "Erst mal mit Beispiel-Wörtern ausprobieren" tippen (lädt `examples/beispiel-unit.json`, 26 Wörter).

Hinweis: Kamera, Service Worker und Installation funktionieren nur über `https://` oder `localhost`. Zum Testen mit dem Handy im WLAN also besser direkt auf Railway deployen.

## Umgebungsvariablen

| Variable | Pflicht | Bedeutung |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | ja | Claude API Key aus der [Claude Console](https://platform.claude.com/). Liegt nur auf dem Server. |
| `APP_ACCESS_CODE` | ja | Geheimer App-Code. Ohne ihn lehnt der Server alle API-Anfragen ab. Lang und zufällig wählen, z. B. 20 Zeichen. |
| `CLAUDE_MODEL` | nein | Modell für Erkennung und Beispielsätze. Standard: `claude-opus-5-5` (laut aktueller Anthropic-Dokumentation der empfohlene Startpunkt, alle aktuellen Modelle können Bilder lesen). Günstiger: `claude-sonnet-5-5` oder `claude-haiku-5-5`. |
| `CLAUDE_EFFORT` | nein | Denkaufwand: `low`, `medium` (Standard), `high`. Leer setzen, um den Modellstandard zu nutzen. Für ältere Modelle ohne Effort-Unterstützung leer lassen. |
| `PORT` | nein | Setzt Railway automatisch. Lokal Standard 3000. |
| `SCAN_LIMIT_PER_HOUR` | nein | Scans pro Stunde, Standard 30. |
| `ENRICH_LIMIT_PER_HOUR` | nein | Anfragen "Beispielsätze ergänzen" pro Stunde, Standard 30. |
| `MAX_IMAGE_MB` | nein | Maximale Größe pro Foto, Standard 4. |

## Deployment auf Railway

1. Den Projektordner in ein (privates) GitHub-Repository hochladen.
2. Auf [railway.com](https://railway.com) anmelden, **New Project**, dann **Deploy from GitHub repo** und das Repository wählen.
3. Railway erkennt das `Dockerfile` (siehe auch `railway.json`) und baut die App.
4. Im Service unter **Variables** eintragen: `ANTHROPIC_API_KEY`, `APP_ACCESS_CODE` und optional `CLAUDE_MODEL`. Railway startet danach automatisch neu.
5. Unter **Settings**, Abschnitt **Networking**, auf **Generate Domain** klicken. Du bekommst eine Adresse wie `https://vokabelgarten-production.up.railway.app`.
6. Die Adresse im Browser öffnen, App-Code eingeben, fertig. Der Health-Check läuft über `/api/health`.

Den App-Code später ändern: in Railway unter Variables `APP_ACCESS_CODE` anpassen, dann in der App unter Eltern, Einstellungen, "App-Code ändern" den neuen Code eintragen.

Ohne GitHub geht es auch mit der Railway-CLI: `npm i -g @railway/cli`, `railway login`, `railway init`, `railway up`.

## Auf dem Handy installieren

**iPhone und iPad (Safari):** Adresse öffnen, auf das Teilen-Symbol tippen, **Zum Home-Bildschirm**, dann **Hinzufügen**.

**Android (Chrome):** Adresse öffnen, Menü mit den drei Punkten, **App installieren** oder **Zum Startbildschirm hinzufügen**.

Danach startet die App wie eine normale App im Vollbild. Einmal online geöffnet, funktioniert das Lernen auch ohne Internet. Für die Offline-Erkennung lädt die App beim Öffnen von "Fotografieren" (oder unter Eltern, Einstellungen) etwa 8 MB herunter.

Wichtig: Jedes Gerät hat seine eigenen Daten. Zum Umziehen auf ein neues Gerät ein Backup machen und dort wiederherstellen.

## Backup und Wiederherstellung

Unter **Eltern**, Reiter **Daten**:

- **Backup erstellen:** lädt eine JSON-Datei herunter (`vokabelgarten-backup-JJJJ-MM-TT.json`) mit allen Units, Wörtern, Lernständen, Einstellungen und auf Wunsch den Fotos. App-Code und PIN sind nicht enthalten.
- **Backup wiederherstellen:** Datei wählen, dann **Ersetzen** (alles auf dem Gerät wird durch das Backup ersetzt) oder **Hinzufügen** (neue Wörter kommen dazu, Vorhandenes bleibt).
- **CSV:** Export aller Wörter oder einer Unit, Import aus einer Tabelle. Spalten: `english;german;unit;exampleSentence;phonetic;note`. Mehrere deutsche Bedeutungen in einer Zelle mit `|` trennen (beim Import geht auch ein Komma). Beispiel: `examples/beispiel-unit.csv`.

Empfehlung: einmal pro Woche ein Backup machen und z. B. in der Cloud ablegen. Browser dürfen Website-Daten bei Speichermangel löschen; die App bittet den Browser deshalb, den Speicher dauerhaft zu schützen (Anzeige unter Eltern, Daten).

## Scan mit eigenem Foto testen

1. App öffnen, **Fotografieren**.
2. Unit wählen oder neu anlegen.
3. **Foto machen** (Kamera) oder **Aus der Galerie**. Als Testbild liegt `examples/vokabelseite-test.jpg` bei (eine selbst erstellte Vokabelseite "Unit 2: At home" mit 12 Wörtern, Lautschrift und Beispielsätzen).
4. Falls nötig drehen und zuschneiden, dann **Wörter erkennen**.
5. Auf dem Prüfbildschirm Einträge vergleichen (Foto zeigen), orange markierte Zeilen genau prüfen, dann speichern.

Tipps für gute Fotos: gerade von oben, gutes Licht ohne Schatten, nur die Vokabelspalten im Bild (zuschneiden hilft), eine Seite pro Foto.

## Kosten pro Scan

Grobe Schätzung mit `claude-opus-5-5` (4 US-Dollar pro Mio. Eingabe-Tokens, 20 US-Dollar pro Mio. Ausgabe-Tokens):

| | Tokens | Kosten |
| --- | --- | --- |
| Ein Foto (ca. 1568 x 1176 Pixel) | ca. 2.500 Eingabe | ca. 0,01 $ |
| Anweisungen | ca. 800 Eingabe | ca. 0,003 $ |
| Antwort mit ca. 25 Vokabeln (inkl. Denken) | ca. 2.500 bis 4.000 Ausgabe | ca. 0,05 bis 0,08 $ |
| **Summe pro Scan (1 Foto)** | | **ca. 6 bis 10 Cent** |

Mit `claude-sonnet-5-5` etwa die Hälfte, mit `claude-haiku-5-5` deutlich unter 1 Cent (dafür eventuell ungenauer bei schwierigen Fotos). "Beispielsätze ergänzen" kostet pro Unit etwa 2 bis 4 Cent. Die App zeigt unter Eltern, Übersicht die Zahl der Scans im Monat und eine Kostenschätzung. Zusätzlich kannst du in der Claude Console ein Ausgabenlimit setzen.

## Lernlogik

**Leitner-System mit 5 Boxen**, Intervalle 1, 2, 4, 8, 16 Tage (unter Eltern änderbar).

- Richtig: eine Box höher, nächste Abfrage nach dem Intervall der neuen Box.
- Falsch: **eine Box tiefer** und morgen wieder dran. Bewusst nicht zurück auf Box 1: Bei nur 5 Boxen mit kurzen Intervallen kommt ein Wort so schon schnell genug wieder. Ein kompletter Rückfall würde ein gut gelerntes Wort nach einem Flüchtigkeitsfehler entwerten und wirkt auf Kinder entmutigend. Wörter mit wiederholten Fehlern werden stattdessen gezielt als "schwierig" behandelt.
- Fast richtig (ein Tippfehler oder fehlender Artikel): Box bleibt, morgen nochmal.
- **Schwierige Wörter** (mindestens 2 Fehler, bis 3 richtige Antworten in Folge): höchstens 4 Tage Abstand, kommen in der Runde zuerst und in anspruchsvolleren, wechselnden Übungsformen (keine Karteikarte).
- In einer Runde zählt nur die erste Antwort für das Leitner-System. Falsche Wörter kommen in derselben Runde in einer leichteren Form nochmal.
- Freies Üben ("Üben", "Noch eine Runde") verschiebt bei richtigen Antworten nichts, holt bei Fehlern das Wort aber vor.

**Tagesportion:** höchstens 8 neue Wörter (einstellbar) plus alle fälligen Wiederholungen. Ist die geschätzte Zeit deutlich über der Zielzeit, werden zuerst neue Wörter und dann die am wenigsten dringenden Wiederholungen auf morgen verschoben. Das Kind sieht nur "Heute: 12 Wörter".

**Klassenarbeit-Modus:** Für eine Unit ein Datum eintragen (Eltern, Units & Wörter, Bearbeiten). Dann plant die App rückwärts:

- Neue Wörter dieser Unit kommen zuerst und werden so verteilt, dass bis zwei Tage vor der Arbeit alle eingeführt sind (notfalls mehr als 8 pro Tag, höchstens 20).
- Wörter, die sonst erst nach der Arbeit wieder dran wären, werden gleichmäßig auf die verbleibenden Tage verteilt, statt sich am Vorabend zu stauen.
- Am Tag vor der Arbeit: Wiederholung der schwierigsten Wörter (10 bis 20, die mit den meisten Fehlern zuerst).

**Tolerante Antwortprüfung:** Groß- und Kleinschreibung egal, Satzzeichen egal, `sb.`/`sth.` (und `jdn.`/`jdm.`/`etw.`) werden ignoriert, "to" vor Verben und englische Artikel sind freiwillig, Klammerteile sind freiwillig, `ae`/`oe`/`ue`/`ss` gelten wie Umlaute. Ein Tippfehler (auch zwei vertauschte Buchstaben, bei Wörtern ab 4 Buchstaben) ergibt "Fast richtig" mit der richtigen Schreibweise. Die richtige Antwort wird immer gezeigt.

## Tests

```bash
npm test               # 56 Tests: Leitner, Tagesportion, Klassenarbeit, Antwortprüfung, Scan-Parsing, CSV, Offline-Heuristik, Server und Zugangsschutz
npm run test:browser   # optionaler Browser-Durchlauf im Handy-Format
```

Der Browser-Test braucht Playwright mit Chromium (`npm i -D playwright && npx playwright install chromium`). Er startet einen nachgebauten Claude-Endpunkt und prüft: erster Start mit App-Code, Foto drehen und zuschneiden, Scan, Prüfbildschirm (Markierungen, Duplikate, Zeilen ändern, löschen, hinzufügen), Tagesportion, jede Übungsform, Mini-Test, Eltern-Bereich, Klassenarbeit, Beispielsätze ergänzen, Backup und Wiederherstellung, CSV-Import, Offline-Lernen und Offline-Erkennung, Querformat und Tablet. Screenshots landen im Temp-Ordner (`E2E_OUT` setzt einen anderen).

## Projektaufbau

```
server/            Express-Server
  index.js         Start, liest Umgebungsvariablen
  app.js           Routen, Sicherheitsheader, Fehlerbehandlung
  auth.js          Zugangsschutz per App-Code
  rateLimit.js     Rate Limit
  images.js        Prüfung der Fotos (Typ, Größe)
  claude.js        Claude API: Scan und Beispielsätze
  prompts.js       Anweisungen an Claude
  scanSchema.js    JSON-Schema und Einlesen der Antworten
  serviceWorker.js + sw-template.js   erzeugt den Service Worker mit automatischer Dateiliste
public/            Frontend (Vanilla JS, ES-Module, kein Build-Schritt)
  js/leitner.js, planner.js, answer.js, csv.js, ocrParse.js   reine Logik (getestet)
  js/store.js, db.js, backup.js                               Daten auf dem Gerät
  js/views/        Heute, Üben, Mini-Test, Lernrunde, Meine Wörter, Fotografieren, Eltern, Willkommen
  js/exercises/    Übungsformen
  js/components/   Prüfbildschirm, Zuschneiden, Wort-Editor
  vendor/          wird bei npm install befüllt (Tesseract.js, Sprachdaten, Schriften)
examples/          Beispiel-Unit (JSON, CSV) und Testbild
scripts/vendor.js  kopiert die lokalen Assets aus node_modules
test/              Unit-Tests (node:test) und Browser-Test
```

Kleine Werkzeuge und warum: **Express** für den Server (bekannt, schlank), das offizielle **Anthropic SDK**, **Tesseract.js** für die Offline-Erkennung, die Schriften **Nunito** (freundlich, gut lesbar) und **OpenDyslexic** (Lesehilfe) aus Fontsource. Alles wird lokal ausgeliefert.

## Datenschutz und Sicherheit

- Der Claude API Key liegt nur als Umgebungsvariable auf dem Server.
- Alle API-Anfragen brauchen den App-Code (Header `X-App-Code`, Vergleich in konstanter Zeit). Nach 20 Fehlversuchen in 15 Minuten wird eine Adresse vorübergehend gesperrt.
- Rate Limit: 30 Scans pro Stunde (einstellbar). Fotos werden auf Typ (JPEG, PNG, WebP) und Größe geprüft.
- Fotos werden nur an die Claude API weitergereicht, nicht gespeichert und nicht geloggt. Das Server-Log enthält nur Methode, Pfad, Status und Dauer.
- Strenge Content Security Policy: nur eigene Skripte, Styles und Schriften, keine externen Quellen, keine Tracker.
- Die Eltern-PIN ist eine Kindersicherung, kein echter Schutz. Vergessen? Unter "PIN vergessen?" mit dem App-Code zurücksetzen.
- Die Übung "Sprechen" ist standardmäßig aus. Manche Browser (z. B. Chrome) schicken Sprachaufnahmen zur Erkennung an den Browser-Hersteller; darauf weist die Einstellung hin.

## Bewusst weggelassen

- Synchronisation zwischen Geräten (bräuchte Konten und Speicher auf dem Server). Stattdessen: Backup-Datei.
- Push-Benachrichtigungen (bräuchten Push-Dienste von Google oder Apple). Stattdessen: freundlicher Hinweis in der App ab einer einstellbaren Uhrzeit.
- Lautschrift aus der Offline-Erkennung: Tesseract liest IPA-Zeichen kaum richtig, deshalb wird sie dort verworfen.
