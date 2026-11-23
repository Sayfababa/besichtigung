# Anleitung: Besichtigungs-App

Diese Anleitung erklärt alles Schritt für Schritt – ohne Vorwissen.
Dein GitHub-Benutzername: `Sayfababa`.

---

## Kurz erklärt: Wie hängt alles zusammen?

```
 iPhone (App)  ──hochladen──►  GitHub: privates Daten-Repo  ──abrufen──►  PC (Ordner „Besichtigungen“)
      ▲                                                                       │
      │ App-Code                                                              ▼
 GitHub: öffentliches App-Repo (GitHub Pages)                    Claude Code: Inventarliste,
                                                                 Kunde + Termin im Büro-Programm
```

**Begriffe:**

- **GitHub**: eine Internetseite, auf der man Dateien sicher ablegen kann.
- **Repo** (Repository): ein Ordner bei GitHub. Du hast zwei:
  - **`besichtigung`** – **öffentlich**. Darin liegt nur der Programmcode der App, also keine Kundendaten.
  - **`besichtigung-daten`** – **privat**. Hier landen die Besichtigungen mit allen Kundendaten und Fotos. Nur du kannst es sehen.
- **GitHub Pages**: Ein kostenloser Dienst von GitHub, der den App-Code als Internetseite bereitstellt.
  Deine App ist erreichbar unter: **https://Sayfababa.github.io/besichtigung/**
- **Token** (Zugriffstoken): Eine Art Passwort nur für die App. Er darf **ausschließlich** in das private Daten-Repo schreiben, sonst nirgendwohin.
- **Sync / Hochladen**: Die App schickt eine Besichtigung ins private Daten-Repo.
- **git pull / Abrufen**: Der PC holt die neuen Besichtigungen aus dem Daten-Repo.

---

## 1. Einrichtung (einmalig)

> Die Schritte 1.1 bis 1.3 und 3.1 hat Claude Code mit dir zusammen schon erledigt. Hier steht, was dabei passiert ist, damit du es nachlesen oder wiederholen kannst.

### 1.1 GitHub-Hilfsprogramm installieren und anmelden

Das Programm `gh` steuert GitHub vom PC aus. Installieren und anmelden in PowerShell:

```powershell
winget install --id GitHub.cli -e
```

```powershell
gh auth login --hostname github.com --git-protocol https --web
```

Dann: Enter drücken, den angezeigten 8-stelligen Code im Browser eingeben und auf **Authorize** klicken.

### 1.2 Die beiden Repos anlegen

- **Öffentlich**, für den App-Code: `besichtigung`
- **Privat**, für die Daten: `besichtigung-daten`

So geht es von Hand auf github.com:
1. Oben rechts auf **+** klicken und **New repository** wählen.
2. Den Namen eintragen, z. B. `besichtigung-daten`.
3. **Private** auswählen (beim App-Code-Repo stattdessen **Public**).
4. Haken bei **Add a README file** setzen und auf **Create repository** klicken.

### 1.3 App-Code hochladen und GitHub Pages einschalten

Der Code liegt auf dem PC im Ordner `Desktop\Besichtigungs App`. Neue Versionen lädst du so hoch: siehe **4.4 Updates**.

GitHub Pages schaltest du so ein: Repo `besichtigung` → **Settings** → **Pages** → bei „Branch“ **main** und **/(root)** wählen → **Save**.
Nach 1–2 Minuten ist die App erreichbar unter `https://Sayfababa.github.io/besichtigung/`.

### 1.4 Token erstellen (nur für das private Daten-Repo)

Das machst du am besten am PC.

1. Öffne https://github.com/settings/personal-access-tokens/new
   (oder: Profilbild → **Settings** → ganz unten **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**).
2. **Token name:** `Besichtigungs-App iPhone`
3. **Expiration** (Ablaufdatum): **366 days** oder ein eigenes Datum in einem Jahr.
   Die App warnt dich 3 Wochen vorher.
4. **Repository access:** **Only select repositories** → **nur** `besichtigung-daten` auswählen.
5. **Permissions** → **Repository permissions** → **Contents** auf **Read and write** stellen.
   **Alles andere bleibt auf „No access“.** („Metadata: Read-only“ setzt GitHub automatisch, das ist richtig.)
6. Unten auf **Generate token** klicken.
7. Der Token beginnt mit `github_pat_…`. **Kopiere ihn** und schick ihn dir **nicht** per E-Mail oder WhatsApp.
   Am einfachsten tippst du ihn direkt am iPhone ab, oder du nutzt die Zwischenablage über die Apple-Geräte (Universal Clipboard).
   Er wird **nur einmal** angezeigt. Ist er weg, erstellst du einfach einen neuen.

### 1.5 Prüfen, dass im öffentlichen Repo nichts Privates liegt

Im Ordner `Besichtigungs App` gibt es eine eingebaute Prüfung:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\Desktop\Besichtigungs App\werkzeuge\pruefen.ps1"
```

Steht dort **„OK: Keine Token und keine Kundendaten gefunden“**, ist alles gut.

Außerdem gibt es eine automatische Sperre: Git verweigert das Hochladen, wenn ein Foto, ein PDF, eine `daten.json` oder ein Token dabei wäre.

Zusätzlich kannst du auf github.com nachsehen: Im Repo `besichtigung` dürfen nur Ordner wie `css`, `js`, `icons`, `vendor`, `werkzeuge` und Dateien wie `index.html` liegen. Es darf **keinen** Ordner `besichtigungen` geben.

---

## 2. Handy (iPhone)

### 2.1 App öffnen und auf dem Startbildschirm installieren

**iPhone:**
1. Öffne **Safari** (nicht Chrome!) und gib ein: `Sayfababa.github.io/besichtigung`
2. Unten auf das **Teilen-Symbol** tippen (Quadrat mit Pfeil nach oben).
3. Nach unten wischen und **„Zum Home-Bildschirm“** wählen, dann **Hinzufügen**.
4. Ab jetzt die App **immer über das Symbol auf dem Startbildschirm** öffnen.
   Wichtig: Safari und das Startbildschirm-Symbol haben **getrennte Speicher**. Was du in Safari erfasst, siehst du in der App nicht.

**Android** (falls du einmal wechselst):
1. In **Chrome** `Sayfababa.github.io/besichtigung` öffnen.
2. Oben rechts auf **⋮** tippen und **„App installieren“** bzw. **„Zum Startbildschirm hinzufügen“** wählen.

### 2.2 Token in der App eintragen

1. App öffnen und oben rechts auf **Einstellungen** tippen.
2. **GitHub-Benutzername:** `Sayfababa`
3. **Name des privaten Daten-Repos:** `besichtigung-daten` (steht schon drin)
4. **Zugriffstoken:** den `github_pat_…`-Token einfügen.
5. Auf **Speichern & testen** tippen.
   Bei Erfolg erscheint: *„Verbindung in Ordnung. Repo ist privat ✓, Schreibrecht ✓“*.
   Die App lädt **nie** in ein öffentliches Repo hoch. Wäre das Repo öffentlich, bricht sie mit einer Warnung ab.

### 2.3 Test: Probe-Besichtigung

1. **+ Neue Besichtigung** antippen und als Namen `Test Probe` eintragen.
2. Unten auf **Foto** tippen, ein Foto machen, einen Raum wählen (z. B. Küche), einen Kommentar schreiben und **Fertig** tippen.
3. Unten auf **Hochladen** tippen. In der grauen Zeile über den Knöpfen siehst du den Fortschritt, danach steht dort **Synchronisiert**.
4. Am PC auf https://github.com/Sayfababa/besichtigung-daten nachsehen: Dort gibt es jetzt den Ordner
   `besichtigungen/JJJJ-MM-TT_Test-Probe/` mit `daten.json`, `bericht.pdf` und `fotos/kueche_01.jpg`.
5. Die Probe danach in der App löschen (**Menü** → **Besichtigung löschen**). Am PC bleibt sie im Daten-Repo; dort kannst du sie per Archiv-Skript entfernen (siehe 3.4).

---

## 3. PC

### 3.1 Daten-Repo einmalig auf den PC holen

Das Daten-Repo liegt am PC im Ordner **`Desktop\Besichtigungen`**. Falls du es einmal neu holen musst:

```powershell
gh repo clone Sayfababa/besichtigung-daten "$HOME\Desktop\Besichtigungen"
```

Danach im Ordner `Desktop\Besichtigungen` einmal doppelt auf **`Einrichten.bat`** klicken. Das installiert das Werkzeug für die Inventarlisten-PDF.

### 3.2 Neue Besichtigungen abrufen

Doppelklick auf **`Desktop\Besichtigungen\Neue Besichtigungen abrufen.bat`**.
Das Fenster zeigt an, welche Besichtigungen neu sind. (Im Hintergrund läuft der Befehl `git pull`.)

Danach schickt das Fenster automatisch die **Kundenliste aus deinem Büro-Programm ans Handy**, wenn das Büro-Programm läuft
(sonst steht dort „Kundenliste NICHT gesendet“, dann `start.bat` starten und die .bat nochmal doppelklicken).
- Dabei wird aus dem Büro-Programm **nur gelesen**. Es wird dort nichts geändert.
- Geschickt werden nur Kunden-Nr., Name, Ansprechpartner, Adresse, Telefon und E-Mail (keine Umsätze, keine Notizen).
- Die Liste landet als `kunden.json` im **privaten** Daten-Repo. Die App holt sie, sobald sie mit Internet geöffnet ist.

### 3.3 Mit Claude Code eine Besichtigung verarbeiten

1. Dein Büro-Programm starten (`start.bat`), sonst kann Claude keinen Kunden anlegen.
2. Claude Code im Ordner **`Desktop\Besichtigungen`** öffnen (in der Claude-App: Ordner auswählen).
3. Eintippen:
   ```
   /besichtigung
   ```
   Claude zeigt dir dann die neuen, noch nicht verarbeiteten Besichtigungen. Du kannst auch gezielt eine nennen:
   ```
   /besichtigung 2026-11-21_Mueller-Hans
   ```
4. Claude macht dann Folgendes:
   - Es liest `daten.json` und **sieht sich alle Fotos an**.
   - Es erstellt die **Inventarliste** `inventar.pdf` im Besichtigungsordner, mit Gegenstand, Anzahl, Raum und Hinweisen. Deine Kommentare haben Vorrang, z. B. „Sofa bleibt da“.
   - Hast du den Kunden am iPhone **aus der Kundenliste** übernommen, legt Claude **keinen neuen Kunden** an. Hast du vor Ort Telefon, E-Mail oder Adresse geändert, zeigt Claude dir „alt → neu“ und **fragt**, bevor es etwas ändert.
   - Sonst prüft es, ob es den Kunden in deinem Büro-Programm schon gibt (über Telefon und E-Mail), und **legt ihn sonst neu an**. Als Kundenadresse nimmt es die Auszugsadresse.
   - Es trägt den **Umzug als Termin** in den Kalender ein, wenn ein Wunschtermin angegeben ist.
   - Am Ende zeigt es dir eine kurze Zusammenfassung.
   - Die Inventarliste bleibt **nur auf dem PC** und wird nicht hochgeladen.
5. Danach setzt du die Besichtigung am iPhone auf **Erledigt** (**Menü** → **Als „Erledigt“ markieren**).

Ohne Befehl geht es auch mit normalen Worten, z. B.:
„Erstelle aus der Besichtigung Müller eine Inventarliste und leg den Kunden mit Umzugstermin in meinem Programm an.“

### 3.4 Platz sparen: alte Besichtigungen archivieren

Ab und zu (z. B. alle paar Monate) erledigte Besichtigungen aus dem Daten-Repo nehmen:
Doppelklick auf **`Desktop\Besichtigungen\Archivieren.bat`**. Das Skript zeigt alle Besichtigungen an. Du wählst die zu archivierenden aus und bestätigst.
Sie werden nach **`Desktop\Besichtigungen-Archiv`** verschoben und aus dem Repo entfernt.
**Sichere den Archiv-Ordner** zusätzlich, z. B. auf einer externen Festplatte.
(Hinweis: Alte Versionen bleiben im Verlauf von GitHub erhalten, das Repo wird also nicht kleiner. Es wächst nur langsamer. Bis ca. 1 GB ist alles problemlos.)

---

## 4. Alltag und Probleme

### 4.1 Ablauf einer Besichtigung

1. App öffnen und **+ Neue Besichtigung** tippen. Datum und Uhrzeit sind schon ausgefüllt.
2. **Reiter „Kunde“**: Name, Telefon, E-Mail, Wunschtermin, Auszugs- und Einzugsadresse.
   **Kunde schon im Büro-Programm?** Oben auf **Aus Kundenliste übernehmen …** tippen, Namen, Straße oder Telefon suchen und antippen.
   Name, Telefon, E-Mail und die Adresse (als Auszugsadresse) werden eingetragen, und die Besichtigung merkt sich die Kunden-Nr.
   Das geht auch ohne Internet (mit der zuletzt geladenen Liste). **Neu laden** holt die neueste Liste.
   Mit **Lösen** nimmst du die Verknüpfung wieder weg, falls du den falschen Kunden erwischt hast.
   Bei Ja/Nein-Fragen: nochmal tippen = wieder leer (unbekannt).
3. **Fotos**: Unten auf **Foto** tippen und fotografieren. Der zuletzt gewählte Raum ist schon markiert, also nur noch Kommentar schreiben und **Fertig** tippen.
   - **Diktieren**: Im Kommentarfeld auf der Tastatur unten das **Mikrofon** antippen. Das geht auch offline, z. B. im Keller.
   - **Mehrere Bilder aus der Galerie**: Tipp auf **Galerie**, wähle die Bilder aus und gib einen Raum für alle an.
   - **Ändern**: Im Reiter „Fotos“ auf den Text neben dem Bild tippen, um Raum oder Kommentar zu ändern oder das Foto zu löschen. Ein Tipp aufs Bild zeigt es groß. Mit ▲▼ änderst du die Reihenfolge.
4. **Reiter „Leistungen“**: Material mit + und −, Zusatzleistungen abhaken und mit Notiz versehen, freie Notizen.
5. Am Ende auf **Hochladen** tippen. Ohne Internet wird der Upload **vorgemerkt** und automatisch nachgeholt, sobald die App mit Internet geöffnet ist.
   Wichtig: Am iPhone lädt die App nur hoch, **solange sie geöffnet ist**. Nach dem Termin also kurz öffnen, wenn du wieder Netz hast.
6. Alles wird **sofort automatisch auf dem Handy gespeichert**, auch ohne Hochladen.
7. Änderst du später noch etwas, springt der Status auf **Offen** und der Upload wird wieder vorgemerkt.
8. **PDF-Bericht**: **Menü** → **PDF-Bericht ansehen / teilen** → **Teilen / Sichern** (z. B. „In Dateien sichern“ oder per AirDrop).

**Status:**
- **Offen**: noch nicht (oder nicht mit dem neuesten Stand) hochgeladen.
- **Synchronisiert**: liegt im privaten Daten-Repo.
- **Erledigt**: setzt du selbst, wenn Claude die Besichtigung verarbeitet hat.

**Speicher am iPhone frei machen:** Bei erledigten Besichtigungen **Menü** → **Fotos vom Handy entfernen**. Die Fotos bleiben im Daten-Repo, nur kleine Vorschaubilder bleiben am Handy.

### 4.2 Wenn der Sync nicht klappt

Die graue Zeile über den Knöpfen und die Übersicht zeigen den Grund an:

| Meldung | Was tun |
|---|---|
| „wartet auf Internet“ | Nichts, das wird automatisch nachgeholt. App mit Internet einmal öffnen. |
| „Zugriffstoken ungültig oder abgelaufen“ | Neuen Token erstellen (1.4) und in den Einstellungen eintragen (2.2). |
| „Daten-Repo nicht gefunden“ | Benutzername und Repo-Name in den Einstellungen prüfen. |
| „Token hat zu wenige Rechte“ | Token prüfen: „Contents“ muss auf „Read and write“ stehen, Repo `besichtigung-daten` ausgewählt. |
| „Repo ist ÖFFENTLICH“ | Auf github.com: Repo `besichtigung-daten` → Settings → ganz unten „Change visibility“ → **Private**. |

Die Daten sind in all diesen Fällen sicher auf dem Handy gespeichert. **Nichts löschen**, solange etwas nicht hochgeladen ist.

### 4.3 Token läuft ab oder neues Handy

- **Token läuft ab:** Die App warnt dich 3 Wochen vorher. Dann einen neuen Token erstellen (1.4) und in den Einstellungen eintragen. Den alten Token kannst du auf github.com löschen.
- **Neues Handy:**
  1. **Vorher** am alten Handy prüfen: Alle Besichtigungen müssen **Synchronisiert** oder **Erledigt** sein (nichts „wartet“).
  2. Am neuen Handy die App installieren (2.1) und den Token eintragen (2.2). Am besten erstellst du dafür einen neuen Token und löschst den alten auf github.com.
  3. Alte Besichtigungen erscheinen am neuen Handy nicht, sie liegen aber vollständig im Daten-Repo und am PC.
- **Handy verloren:** Sofort auf github.com den Token löschen (Settings → Developer settings → Personal access tokens → Token → **Delete**). Dann kann niemand mehr etwas in dein Repo schreiben.

### 4.4 Updates der App einspielen

Wenn Claude Code die App am PC geändert hat:
1. Claude lädt die neue Version ins öffentliche Repo hoch. Vorher läuft automatisch die Sicherheitsprüfung.
   Von Hand geht das im Ordner `Besichtigungs App` mit:
   ```powershell
   git add -A
   ```
   ```powershell
   git commit -m "Update"
   ```
   ```powershell
   git push
   ```
   Wichtig: Bei jeder neuen Version muss in `sw.js` die Zeile `const VERSION = …` erhöht werden, sonst merkt das Handy nichts.
2. Nach 1–2 Minuten erscheint am iPhone beim nächsten Öffnen oben **„Neue Version der App verfügbar“**. Tippe auf **Neu laden**.
   Deine Daten bleiben dabei erhalten.

---

## 5. Sicherheit

**Warum die Daten privat bleiben:**
- Kundendaten und Fotos gehen **nur** ins private Repo `besichtigung-daten`. Das kannst nur du sehen.
- Das öffentliche Repo enthält nur Programmcode. Eine Sperre verhindert, dass dort Fotos, PDFs, `daten.json` oder Token landen.
- Der Token liegt **nur auf deinem iPhone** und wird nur an GitHub geschickt, nie an andere.
- Der Token darf nur das eine Daten-Repo lesen und beschreiben, sonst nichts in deinem GitHub-Konto.
- Die App prüft vor jedem Upload, dass das Ziel-Repo **privat** ist.

**Auf keinen Fall:**
- ❌ Den Token weitergeben, per E-Mail oder WhatsApp verschicken oder in eine Datei bzw. ein Repo schreiben.
- ❌ Das Repo `besichtigung-daten` auf „Public“ (öffentlich) stellen.
- ❌ Kundenfotos oder `daten.json` in den Ordner `Besichtigungs App` legen.
- ❌ Andere Personen als Mitarbeiter (Collaborator) zum Daten-Repo einladen, ohne dass du das wirklich willst.
- ❌ In der App eine Besichtigung löschen, die noch **„wartet auf Upload“**.
- ✅ Dein GitHub-Konto mit **Zwei-Faktor-Anmeldung** schützen (github.com → Settings → Password and authentication).
- ✅ Dein iPhone mit Code oder Face ID sperren.
