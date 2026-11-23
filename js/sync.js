// Hochladen ins private GitHub-Daten-Repo über die GitHub-Schnittstelle (API).
// Pro Besichtigung entsteht EIN Commit (Speicherstand) mit allen geänderten Dateien.
// Es wird nur hochgeladen, was sich geändert hat (Vergleich über Git-Prüfsummen).
import { db } from './db.js';
import { store } from './store.js';
import { berichtFuer } from './pdf.js';
import { datenJson, fotoDateinamen, gitBlobSha, slug } from './modell.js';

const API = 'https://api.github.com';
const BASIS = 'besichtigungen';

export async function ladeZugang() { return (await db.get('github')) || { owner: '', repo: '', token: '', ablauf: '' }; }
export async function speichereZugang(z) { await db.set('github', z); }

class GhFehler extends Error {
  constructor(status, text) { super(text); this.status = status; }
}

function gh(z) {
  return async function anfrage(methode, pfad, body) {
    let res;
    try {
      res = await fetch(API + pfad, {
        method: methode,
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${z.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new GhFehler(0, 'Keine Verbindung zum Internet oder zu GitHub.');
    }
    const ablauf = res.headers.get('github-authentication-token-expiration');
    if (ablauf && ablauf !== z.ablauf) { z.ablauf = ablauf; speichereZugang(z); }
    if (res.status === 204) return null;
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { /* kein JSON */ }
    if (!res.ok) {
      const msg = (json && json.message) || text || res.statusText;
      throw new GhFehler(res.status, msg);
    }
    return json;
  };
}

export function fehlerText(e) {
  if (!(e instanceof GhFehler)) return e && e.message ? e.message : String(e);
  if (e.status === 0) return e.message;
  if (e.status === 401) return 'Zugriffstoken ungültig oder abgelaufen. Bitte in den Einstellungen einen neuen eintragen.';
  if (e.status === 403) return 'Keine Berechtigung (Token hat zu wenige Rechte oder GitHub-Limit erreicht): ' + e.message;
  if (e.status === 404) return 'Daten-Repo nicht gefunden. Benutzername, Repo-Name und Token prüfen.';
  return `GitHub-Fehler ${e.status}: ${e.message}`;
}

// Verbindung prüfen – und sicherstellen, dass das Repo PRIVAT ist
export async function pruefeVerbindung(z) {
  if (!z.owner || !z.repo || !z.token) throw new Error('Bitte Benutzername, Repo-Name und Token eintragen.');
  const api = gh(z);
  const repo = await api('GET', `/repos/${enc(z.owner)}/${enc(z.repo)}`);
  if (!repo.private) throw new Error('ACHTUNG: Dieses Repo ist ÖFFENTLICH. Kundendaten dürfen nur in ein privates Repo. Es wird nichts hochgeladen.');
  if (repo.permissions && repo.permissions.push === false) throw new Error('Der Token darf in dieses Repo nicht schreiben. Bei „Contents“ muss „Read and write“ eingestellt sein.');
  return { branch: repo.default_branch, ablauf: z.ablauf };
}

const enc = s => encodeURIComponent(s);
const pfadEnc = p => p.split('/').map(enc).join('/');

async function liste(api, z, pfad, ref) {
  try {
    return await api('GET', `/repos/${enc(z.owner)}/${enc(z.repo)}/contents/${pfadEnc(pfad)}?ref=${enc(ref)}`);
  } catch (e) {
    if (e.status === 404) return [];
    throw e;
  }
}

function blobZuBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

let laeuft = false;
const hoerer = new Set();
export function beiSyncStatus(fn) { hoerer.add(fn); return () => hoerer.delete(fn); }
function melde(info) { for (const fn of hoerer) { try { fn(info); } catch (e) { console.error(e); } } }
export function syncLaeuft() { return laeuft; }

// ---------- Kundenliste vom PC (kunden.json im Daten-Repo, nur lesen) ----------
export async function kundenliste() { return (await db.get('kunden')) || { kunden: [], stand: '', sha: '', geprueft: 0 }; }

let kundenLaeuft = false;
// Holt kunden.json, wenn sie sich geändert hat. Ohne „erzwingen“ höchstens alle 10 Minuten.
export async function ladeKundenliste({ erzwingen = false } = {}) {
  const alt = await kundenliste();
  if (kundenLaeuft || !navigator.onLine) return { liste: alt, neu: false };
  if (!erzwingen && Date.now() - (alt.geprueft || 0) < 10 * 60 * 1000) return { liste: alt, neu: false };
  const z = await ladeZugang();
  if (!z.token || !z.owner || !z.repo) return { liste: alt, neu: false };
  kundenLaeuft = true;
  try {
    const api = gh(z);
    let datei;
    try {
      datei = await api('GET', `/repos/${enc(z.owner)}/${enc(z.repo)}/contents/kunden.json`);
    } catch (e) {
      if (e.status !== 404) throw e;
      const leer = { ...alt, geprueft: Date.now() };
      await db.set('kunden', leer);
      return { liste: leer, neu: false };
    }
    if (datei.sha === alt.sha) {
      const gleich = { ...alt, geprueft: Date.now() };
      await db.set('kunden', gleich);
      return { liste: gleich, neu: false };
    }
    const bytes = Uint8Array.from(atob(String(datei.content || '').replace(/\s/g, '')), c => c.charCodeAt(0));
    const json = JSON.parse(new TextDecoder().decode(bytes));
    if (!json || !Array.isArray(json.kunden)) throw new Error('kunden.json hat ein unbekanntes Format.');
    const neu = { kunden: json.kunden, stand: json.stand || '', sha: datei.sha, geprueft: Date.now() };
    await db.set('kunden', neu);
    return { liste: neu, neu: true };
  } finally {
    kundenLaeuft = false;
  }
}

// Alle vorgemerkten Besichtigungen hochladen (nacheinander)
export async function syncAlle() {
  if (laeuft) return;
  if (!navigator.onLine) return;
  const z = await ladeZugang();
  if (!z.token) return;
  ladeKundenliste().catch(e => console.warn('Kundenliste:', fehlerText(e)));
  const warten = store.alle().filter(v => v.wartet && !v.fotosEntfernt);
  if (!warten.length) return;
  laeuft = true;
  try {
    for (const v of warten) {
      try {
        await syncEine(v.id, z);
      } catch (e) {
        const text = fehlerText(e);
        store.update(v.id, x => { x.syncFehler = text; });
        melde({ id: v.id, fertig: true, fehler: text });
        if (e.status === 0 || e.status === 401) break; // ohne Netz/Token keine weiteren Versuche
      }
    }
  } finally {
    laeuft = false;
    melde({ ende: true });
  }
}

async function syncEine(id, z) {
  const api = gh(z);
  const R = `/repos/${enc(z.owner)}/${enc(z.repo)}`;
  const info = await pruefeVerbindung(z);
  const branch = info.branch;
  let v = store.get(id);
  const revBeimStart = v.rev;
  const ton = t => melde({ id, text: t });

  // 1) Ordnernamen festlegen (nur beim ersten Mal)
  if (!v.ordner) {
    ton('Ordner wird angelegt …');
    const vorhanden = new Set((await liste(api, z, BASIS, branch)).map(e => e.name));
    const basis = `${v.besichtigung.datum || 'ohne-datum'}_${slug(v.kunde.name)}`;
    let name = basis, n = 2;
    while (vorhanden.has(name)) name = `${basis}-${n++}`;
    store.update(id, x => { x.ordner = name; }, { sofort: true });
  }
  v = store.get(id);
  const ordner = `${BASIS}/${v.ordner}`;

  // 2) Gewünschte Dateien zusammenstellen
  const namen = fotoDateinamen(v.fotos);
  const soll = new Map(); // pfad -> { sha, blob }
  // Im Repo steht der Status, den die Besichtigung NACH dem Upload hat
  const statusNachher = v.status === 'erledigt' ? 'erledigt' : 'synchronisiert';
  const json = JSON.stringify(datenJson({ ...v, status: statusNachher }, namen), null, 2) + '\n';
  const jsonBytes = new TextEncoder().encode(json);
  soll.set(`${ordner}/daten.json`, { sha: await gitBlobSha(jsonBytes), blob: new Blob([jsonBytes], { type: 'application/json' }) });

  ton('PDF-Bericht wird erstellt …');
  const pdf = await berichtFuer(v, t => ton('PDF: ' + t));
  if (v.pdfRev !== v.rev) store.update(id, x => { x.pdfRev = v.rev; });
  soll.set(`${ordner}/bericht.pdf`, { sha: await gitBlobSha(await pdf.arrayBuffer()), blob: pdf });

  for (const f of v.fotos) {
    let sha = f.sha;
    const blob = await db.getBlob(f.id);
    if (!blob) throw new Error(`Foto fehlt auf dem Handy (${f.raum}).`);
    if (!sha) {
      sha = await gitBlobSha(await blob.arrayBuffer());
      store.update(id, x => { const ff = x.fotos.find(q => q.id === f.id); if (ff) ff.sha = sha; });
    }
    soll.set(`${ordner}/${namen.get(f.id)}`, { sha, blob });
  }

  // 3) Mit dem Stand im Repo vergleichen und hochladen (bei Zwischenänderungen bis zu 3 Versuche)
  for (let versuch = 1; ; versuch++) {
    ton('Vergleiche mit GitHub …');
    const ref = await api('GET', `${R}/git/ref/heads/${enc(branch)}`);
    const basisCommit = await api('GET', `${R}/git/commits/${ref.object.sha}`);
    const ist = new Map();
    for (const e of await liste(api, z, ordner, branch)) if (e.type === 'file') ist.set(e.path, e.sha);
    for (const e of await liste(api, z, `${ordner}/fotos`, branch)) if (e.type === 'file') ist.set(e.path, e.sha);
    const vorhandeneShas = new Set(ist.values());

    const eintraege = [];
    let i = 0;
    const neu = [...soll.entries()].filter(([p, d]) => ist.get(p) !== d.sha);
    for (const [pfad, d] of neu) {
      i++;
      if (!vorhandeneShas.has(d.sha)) {
        ton(`Lade hoch: Datei ${i} von ${neu.length} …`);
        const b = await api('POST', `${R}/git/blobs`, { content: await blobZuBase64(d.blob), encoding: 'base64' });
        if (b.sha !== d.sha) console.warn('Prüfsumme weicht ab', pfad, b.sha, d.sha);
        d.sha = b.sha;
        vorhandeneShas.add(b.sha);
      }
      eintraege.push({ path: pfad, mode: '100644', type: 'blob', sha: d.sha });
    }
    // Dateien, die die App früher hochgeladen hat und die es nicht mehr gibt (gelöschte/umbenannte Fotos)
    for (const pfad of ist.keys()) {
      const eigene = pfad === `${ordner}/daten.json` || pfad === `${ordner}/bericht.pdf` || pfad.startsWith(`${ordner}/fotos/`);
      if (eigene && !soll.has(pfad)) eintraege.push({ path: pfad, mode: '100644', type: 'blob', sha: null });
    }

    if (eintraege.length) {
      ton('Speichere in GitHub …');
      const baum = await api('POST', `${R}/git/trees`, { base_tree: basisCommit.tree.sha, tree: eintraege });
      const commit = await api('POST', `${R}/git/commits`, {
        message: `Besichtigung ${v.ordner} (${v.fotos.length} Fotos)`,
        tree: baum.sha, parents: [ref.object.sha],
      });
      try {
        await api('PATCH', `${R}/git/refs/heads/${enc(branch)}`, { sha: commit.sha, force: false });
      } catch (e) {
        if (e.status === 422 && versuch < 3) continue; // Repo wurde zwischendurch geändert -> neu vergleichen
        throw e;
      }
    }
    break;
  }

  // 4) Status setzen. Wurde während des Uploads weiter bearbeitet, bleibt der Upload vorgemerkt.
  store.update(id, x => {
    x.syncFehler = '';
    x.letzterSync = new Date().toISOString();
    if (x.rev === revBeimStart) {
      x.wartet = false;
      if (x.status !== 'erledigt') x.status = 'synchronisiert';
    }
  }, { sofort: true });
  melde({ id, fertig: true });
}
