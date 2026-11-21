// PDF-Bericht (A4) mit jsPDF. Wird am Handy erzeugt, auch offline.
import { db } from './db.js';
import { fuerPdf } from './bild.js';
import { datumDE, janein, fotosNachRaum } from './modell.js';

const RAND = 15;
const BREITE = 210;
const HOEHE = 297;
const FUSS = 12;          // Platz für die Fußzeile
const INNEN = BREITE - 2 * RAND;

export async function erstellePdf(v, fortschritt = () => {}) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: `Besichtigung ${v.kunde.name}`, creator: 'Besichtigungs-App' });
  let y = RAND;

  const schrift = (gr, fett = false) => { doc.setFont('helvetica', fett ? 'bold' : 'normal'); doc.setFontSize(gr); };
  const neueSeite = () => { doc.addPage(); y = RAND; };
  const platz = h => { if (y + h > HOEHE - RAND - FUSS) neueSeite(); };

  const ueberschrift = text => {
    platz(12);
    schrift(12, true);
    doc.setFillColor(225, 225, 225);
    doc.rect(RAND, y, INNEN, 7, 'F');
    doc.text(text, RAND + 2, y + 5);
    y += 10;
  };

  // Tabelle mit zwei Spalten: Bezeichnung | Wert
  const zeilen = (liste, spalte = 48) => {
    for (const [k, w] of liste) {
      schrift(10);
      const teile = doc.splitTextToSize(String(w || '–'), INNEN - spalte);
      const h = Math.max(1, teile.length) * 4.6 + 1.4;
      platz(h);
      schrift(10, true);
      doc.text(k, RAND + 1, y + 4);
      schrift(10);
      doc.text(teile, RAND + spalte, y + 4);
      doc.setDrawColor(210, 210, 210);
      doc.line(RAND, y + h, RAND + INNEN, y + h);
      y += h;
    }
    y += 4;
  };

  const adresse = (a) => [
    ['Straße', a.strasse],
    ['PLZ / Ort', [a.plz, a.ort].filter(Boolean).join(' ')],
    ['Etage', [a.etage, a.gebaeudeteil].filter(Boolean).join(', ')],
    ['Aufzug', janein(a.aufzug)],
    ['Treppenhaus eng', janein(a.treppenhaus_eng)],
    ['Laufweg zum LKW', a.laufweg_m !== '' && a.laufweg_m != null ? `${a.laufweg_m} m` : ''],
    ['Halteverbot nötig', janein(a.halteverbot)],
    ['Wohnfläche / Zimmer', [a.wohnflaeche_m2 ? `${a.wohnflaeche_m2} m²` : '', a.zimmer ? `${a.zimmer} Zimmer` : '']
      .filter(Boolean).join(', ')],
  ];

  // ---------- Seite 1 ----------
  schrift(18, true);
  doc.text('Besichtigungsbericht Umzug', RAND, y + 6);
  y += 12;
  schrift(10);
  doc.text(`Besichtigung am ${datumDE(v.besichtigung.datum)}${v.besichtigung.uhrzeit ? ', ' + v.besichtigung.uhrzeit + ' Uhr' : ''}`, RAND, y);
  y += 8;

  ueberschrift('Kunde');
  zeilen([
    ['Name', v.kunde.name],
    ['Telefon', v.kunde.telefon],
    ['E-Mail', v.kunde.email],
    ['Wunschtermin Umzug', [datumDE(v.wunschtermin.datum), v.wunschtermin.uhrzeit ? v.wunschtermin.uhrzeit + ' Uhr' : '',
      v.wunschtermin.notiz].filter(Boolean).join(' – ')],
  ]);
  ueberschrift('Auszugsadresse');
  zeilen(adresse(v.auszug));
  ueberschrift('Einzugsadresse');
  zeilen(adresse(v.einzug));

  // ---------- Fotos: 3 Einträge pro Seite ----------
  const reihen = fotosNachRaum(v.fotos).flatMap(g => g.fotos);
  if (reihen.length) {
    neueSeite();
    const eintragH = (HOEHE - 2 * RAND - FUSS) / 3;
    const bildB = 105, bildH = eintragH - 6;
    for (let i = 0; i < reihen.length; i++) {
      const f = reihen[i];
      fortschritt(`Foto ${i + 1} von ${reihen.length} …`);
      if (i > 0 && i % 3 === 0) neueSeite();
      const top = RAND + (i % 3) * eintragH;
      let textX = RAND + bildB + 5;
      const blob = (await db.getBlob(f.id)) || (await db.getBlob(f.id + ':t'));
      if (blob) {
        try {
          const b = await fuerPdf(blob);
          const s = Math.min(bildB / b.w, bildH / b.h);
          const w = b.w * s, h = b.h * s;
          textX = RAND + w + 6; // Text direkt neben das Bild
          doc.addImage(b.dataUrl, 'JPEG', RAND, top, w, h, undefined, 'FAST');
          doc.setDrawColor(150, 150, 150);
          doc.rect(RAND, top, w, h);
        } catch (e) {
          schrift(9); doc.text('(Bild nicht lesbar)', RAND + 2, top + 6);
        }
      }
      const textB = RAND + INNEN - textX;
      schrift(12, true);
      doc.text(doc.splitTextToSize(f.raum, textB), textX, top + 5);
      schrift(8);
      doc.setTextColor(90, 90, 90);
      doc.text(`Foto ${i + 1} von ${reihen.length}`, textX, top + 10);
      doc.setTextColor(0, 0, 0);
      schrift(10);
      let teile = doc.splitTextToSize(f.kommentar || '–', textB);
      const maxZeilen = Math.floor((bildH - 14) / 4.6);
      if (teile.length > maxZeilen) { teile = teile.slice(0, maxZeilen); teile[maxZeilen - 1] += ' …'; }
      doc.text(teile, textX, top + 16);
      if (i % 3 !== 2 && i !== reihen.length - 1) {
        doc.setDrawColor(200, 200, 200);
        doc.line(RAND, top + eintragH - 2, RAND + INNEN, top + eintragH - 2);
      }
    }
  }

  // ---------- Material, Leistungen, Notizen ----------
  neueSeite();
  ueberschrift('Material');
  const mat = v.material.filter(m => Number(m.menge) > 0);
  zeilen(mat.length ? mat.map(m => [m.bezeichnung, `Menge: ${m.menge}`]) : [['–', 'kein Material eingetragen']], 70);
  ueberschrift('Zusatzleistungen');
  const leis = v.leistungen.filter(l => l.gewuenscht);
  zeilen(leis.length ? leis.map(l => [l.bezeichnung, l.notiz || 'ja']) : [['–', 'keine Zusatzleistungen']], 70);
  ueberschrift('Notizen');
  schrift(10);
  for (const zeile of doc.splitTextToSize(v.notizen || '–', INNEN)) {
    platz(5);
    doc.text(zeile, RAND + 1, y + 4);
    y += 4.8;
  }

  // ---------- Fußzeile auf jeder Seite ----------
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    schrift(8);
    doc.setTextColor(80, 80, 80);
    doc.setDrawColor(160, 160, 160);
    doc.line(RAND, HOEHE - RAND + 1, BREITE - RAND, HOEHE - RAND + 1);
    doc.text(`${v.kunde.name || 'Ohne Namen'} · Besichtigung ${datumDE(v.besichtigung.datum)}`, RAND, HOEHE - RAND + 5);
    doc.text(`Seite ${p} von ${n}`, BREITE - RAND, HOEHE - RAND + 5, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }
  return doc.output('blob');
}

// Bericht holen: gespeicherten nehmen, wenn er zum aktuellen Stand passt, sonst neu erstellen
export async function berichtFuer(v, fortschritt) {
  if (v.pdfRev === v.rev) {
    const b = await db.getBlob('pdf:' + v.id);
    if (b) return b;
  }
  const blob = await erstellePdf(v, fortschritt);
  await db.putBlob('pdf:' + v.id, blob);
  return blob;
}
