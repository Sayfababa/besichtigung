// Datenmodell, Voreinstellungen und kleine Hilfsfunktionen.

export const APP_VERSION = '1.0.0';

export const STANDARD_RAEUME = ['Küche', 'Wohnzimmer', 'Schlafzimmer', 'Bad', 'Flur', 'Kinderzimmer',
  'Keller', 'Dachboden', 'Balkon', 'Garage', 'Sonstiges'];

export const STANDARD_MATERIAL = ['Umzugskartons', 'Bücherkartons', 'Kleiderboxen', 'Stretchfolie',
  'Luftpolsterfolie', 'Packpapier'];

export const STANDARD_LEISTUNGEN = ['Demontage', 'Montage', 'Einpackservice', 'Entsorgung',
  'Entrümpelung', 'Endreinigung', 'Renovierung'];

export const ETAGEN = ['', 'Keller/Souterrain', 'EG', 'Hochparterre', '1. OG', '2. OG', '3. OG', '4. OG', '5. OG',
  '6. OG', '7. OG', '8. OG', '9. OG', '10. OG', 'DG'];

export const GEBAEUDETEILE = ['', 'Vorderhaus', 'Hinterhaus', 'Seitenflügel', 'Gartenhaus', 'Einfamilienhaus'];

export const STATUS_TEXT = { offen: 'Offen', synchronisiert: 'Synchronisiert', erledigt: 'Erledigt' };

export function uid() {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return Date.now().toString(36) + Array.from(a, b => b.toString(16).padStart(2, '0')).join('').slice(0, 8);
}

export function pad(n) { return String(n).padStart(2, '0'); }
export function heuteISO(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function jetztZeit(d = new Date()) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
export function datumDE(iso) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

export function leereAdresse() {
  return { strasse: '', plz: '', ort: '', etage: '', gebaeudeteil: '', aufzug: null, treppenhaus_eng: null,
    laufweg_m: '', halteverbot: null, wohnflaeche_m2: '', zimmer: '' };
}

export function neueBesichtigung(material, leistungen) {
  const now = new Date();
  return {
    id: uid(),
    erstellt: now.toISOString(),
    geaendert: now.toISOString(),
    status: 'offen',        // offen | synchronisiert | erledigt
    eingereicht: false,     // wurde „Fertig & hochladen“ schon einmal getippt?
    wartet: false,          // Upload vorgemerkt
    rev: 1,                 // Zähler für inhaltliche Änderungen
    pdfRev: 0,              // für welche rev der gespeicherte Bericht erstellt wurde
    ordner: '',             // Ordnername im Daten-Repo (wird beim ersten Hochladen festgelegt)
    letzterSync: null,
    syncFehler: '',
    fotosEntfernt: false,   // Fotos wurden vom Handy entfernt (nur noch lesen)
    kunde: { name: '', telefon: '', email: '' },
    besichtigung: { datum: heuteISO(now), uhrzeit: jetztZeit(now) },
    wunschtermin: { datum: '', uhrzeit: '', notiz: '' },
    auszug: leereAdresse(),
    einzug: leereAdresse(),
    fotos: [],              // { id, raum, kommentar, aufgenommen, sha, w, h }
    material: material.map(b => ({ bezeichnung: b, menge: 0 })),
    leistungen: leistungen.map(b => ({ bezeichnung: b, gewuenscht: false, notiz: '' })),
    notizen: '',
  };
}

// Für Dateinamen: Umlaute umschreiben, nur Buchstaben/Ziffern/Bindestrich
export function slug(s, fallback = 'ohne-name') {
  const t = String(s || '').trim()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return t || fallback;
}

// Fotos in Anzeige-Reihenfolge, gruppiert nach Raum (Reihenfolge der Räume = erstes Auftreten)
export function fotosNachRaum(fotos) {
  const gruppen = new Map();
  for (const f of fotos) {
    if (!gruppen.has(f.raum)) gruppen.set(f.raum, []);
    gruppen.get(f.raum).push(f);
  }
  return [...gruppen.entries()].map(([raum, liste]) => ({ raum, fotos: liste }));
}

// Dateinamen der Fotos: fotos/kueche_01.jpg (Nummer je Raum)
export function fotoDateinamen(fotos) {
  const map = new Map();
  for (const g of fotosNachRaum(fotos)) {
    g.fotos.forEach((f, i) => map.set(f.id, `fotos/${slug(g.raum, 'raum').toLowerCase()}_${pad(i + 1)}.jpg`));
  }
  return map;
}

// Git-Prüfsumme einer Datei (wie GitHub sie speichert), damit nur Geändertes hochgeladen wird
export async function gitBlobSha(bytes) {
  const head = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
  const all = new Uint8Array(head.length + bytes.byteLength);
  all.set(head, 0);
  all.set(new Uint8Array(bytes), head.length);
  const h = await crypto.subtle.digest('SHA-1', all);
  return Array.from(new Uint8Array(h), b => b.toString(16).padStart(2, '0')).join('');
}

export function janein(v) { return v === true ? 'ja' : v === false ? 'nein' : 'k. A.'; }

export function zahlOderNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// daten.json: klar strukturiert für die Weiterverarbeitung am PC
export function datenJson(v, dateinamen) {
  const adr = a => ({
    strasse: a.strasse.trim(), plz: a.plz.trim(), ort: a.ort.trim(),
    etage: a.etage || null, gebaeudeteil: a.gebaeudeteil || null,
    aufzug: a.aufzug, treppenhaus_eng: a.treppenhaus_eng,
    laufweg_lkw_m: zahlOderNull(a.laufweg_m), halteverbot_noetig: a.halteverbot,
    wohnflaeche_m2: zahlOderNull(a.wohnflaeche_m2), zimmer: zahlOderNull(a.zimmer),
  });
  let nr = 0;
  return {
    format: 'besichtigung',
    format_version: 1,
    app_version: APP_VERSION,
    id: v.id,
    ordner: v.ordner,
    status: v.status,
    erstellt: v.erstellt,
    geaendert: v.geaendert,
    kunde: { name: v.kunde.name.trim(), telefon: v.kunde.telefon.trim(), email: v.kunde.email.trim() },
    besichtigung: { datum: v.besichtigung.datum || null, uhrzeit: v.besichtigung.uhrzeit || null },
    umzug_wunschtermin: { datum: v.wunschtermin.datum || null, uhrzeit: v.wunschtermin.uhrzeit || null,
      notiz: v.wunschtermin.notiz.trim() },
    auszug: adr(v.auszug),
    einzug: adr(v.einzug),
    fotos: fotosNachRaum(v.fotos).flatMap(g => g.fotos).map(f => ({
      nr: ++nr, datei: dateinamen.get(f.id), raum: f.raum, kommentar: (f.kommentar || '').trim(),
      aufgenommen: f.aufgenommen,
    })),
    material: v.material.filter(m => Number(m.menge) > 0).map(m => ({ bezeichnung: m.bezeichnung, menge: Number(m.menge) })),
    zusatzleistungen: v.leistungen.filter(l => l.gewuenscht).map(l => ({ bezeichnung: l.bezeichnung, notiz: l.notiz.trim() })),
    notizen: v.notizen.trim(),
  };
}

export function debounce(fn, ms) {
  let t = null;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => { t = null; fn(...a); }, ms); };
  d.flush = () => { if (t) { clearTimeout(t); t = null; fn(); } };
  return d;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function groesse(bytes) {
  if (bytes == null) return '?';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
}
