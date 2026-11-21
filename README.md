# Besichtigung – Web-App für Umzugsbesichtigungen

Mobile Web-App (PWA) zum Erfassen von Umzugsbesichtigungen: Kundendaten, Fotos mit Raum und Kommentar,
Material und Zusatzleistungen, PDF-Bericht. Läuft offline auf dem Handy und lädt die Daten in ein
**separates privates** GitHub-Repo hoch.

**In diesem Repo liegt nur der Programmcode – keine Kundendaten, keine Zugriffstoken.**

- Anleitung (Deutsch, Schritt für Schritt): [ANLEITUNG.md](ANLEITUNG.md)
- Zum Testen am PC: `node werkzeuge/testserver.js` → http://localhost:8080
- Sicherheits-Prüfung vor dem Hochladen: `powershell -ExecutionPolicy Bypass -File werkzeuge\pruefen.ps1`

Aufbau: `index.html`, `css/`, `js/` (app, store, db, sync, pdf, bild, modell), `sw.js` (offline),
`vendor/jspdf.umd.min.js` (PDF-Erzeugung, MIT-Lizenz).
