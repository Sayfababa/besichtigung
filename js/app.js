// Besichtigungs-App – Oberfläche
import { db, requestPersistence, storageInfo } from './db.js';
import { store } from './store.js';
import { verarbeiteFoto } from './bild.js';
import { berichtFuer } from './pdf.js';
import { syncAlle, beiSyncStatus, ladeZugang, speichereZugang, pruefeVerbindung, fehlerText, syncLaeuft } from './sync.js';
import {
  APP_VERSION, STANDARD_RAEUME, STANDARD_MATERIAL, STANDARD_LEISTUNGEN, ETAGEN, GEBAEUDETEILE, STATUS_TEXT,
  uid, datumDE, neueBesichtigung, fotosNachRaum, esc, groesse, slug,
} from './modell.js';

const $ = s => document.querySelector(s);
const inhalt = $('#inhalt');
const ebene = $('#ebene');

const ICON = {
  kamera: '<svg width="20" height="18" viewBox="0 0 20 18" aria-hidden="true"><path d="M7 1h6l1.5 2.5H19v13.5H1V3.5h4.5z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="10" cy="10" r="3.6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  galerie: '<svg width="20" height="18" viewBox="0 0 20 18" aria-hidden="true"><rect x="1" y="1.5" width="18" height="15" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M2 15l5-6 4 4 3-3 4 5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="14" cy="5.5" r="1.6" fill="currentColor"/></svg>',
  hoch: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 13V2M4 7l5-5 5 5M2 16h14" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
};

const zustand = {
  ansicht: 'uebersicht',
  id: null,
  reiter: 'kunde',
  urls: new Map(),        // Vorschau-Adressen der Fotos
  syncText: '',
};
let listen = null;        // { raeume, material, leistungen }

// ---------- Start ----------
async function start() {
  try {
    await store.laden();
  } catch (e) {
    inhalt.innerHTML = `<div class="hinweis warnung"><strong>Die gespeicherten Daten konnten nicht geladen werden.</strong><br>${esc(e.message)}<br><br>
      Bitte die App schließen und neu öffnen. Nichts löschen!</div>`;
    return;
  }
  listen = (await db.get('listen')) || { raeume: [...STANDARD_RAEUME], material: [...STANDARD_MATERIAL], leistungen: [...STANDARD_LEISTUNGEN] };
  requestPersistence();
  store.beiAenderung(id => beiAenderung(id));
  beiSyncStatus(info => beiSync(info));
  window.addEventListener('online', () => syncAlle());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') store.allesSpeichern();
    else { syncAlle(); pruefeUpdate(); }
  });
  window.addEventListener('pagehide', () => store.allesSpeichern());
  setInterval(() => { if (document.visibilityState === 'visible') syncAlle(); }, 45000);
  $('#kamera').addEventListener('change', e => fotosAufnehmen(e.target));
  $('#galerie').addEventListener('change', e => fotosAufnehmen(e.target));
  window.addEventListener('popstate', () => zurueck());
  registriereServiceWorker();
  zeigeUebersicht();
  syncAlle();
}

function speichereListen() { return db.set('listen', listen); }

// ---------- Kleine Helfer für die Oberfläche ----------
function titel(text, links, rechts) {
  $('#titel-text').textContent = text;
  for (const [knopf, def] of [[$('#titel-links'), links], [$('#titel-rechts'), rechts]]) {
    if (!def) { knopf.hidden = true; knopf.onclick = null; continue; }
    knopf.hidden = false;
    knopf.textContent = def.text;
    knopf.setAttribute('aria-label', def.label || def.text);
    knopf.onclick = def.aktion;
  }
}

let meldungTimer = null;
function meldung(text, ms = 3500) {
  const m = $('#meldung');
  m.textContent = text;
  m.hidden = false;
  clearTimeout(meldungTimer);
  meldungTimer = setTimeout(() => { m.hidden = true; }, ms);
}

function dialog({ titel: t, html, knoepfe = [], mitte = false, beimOeffnen, schliessbar = true }) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'abdunkeln' + (mitte ? ' mitte' : '');
    wrap.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(t)}">
      <div class="dialog-titel"><span>${esc(t)}</span>${schliessbar ? '<button class="titel-knopf" data-x aria-label="Schließen">✕</button>' : ''}</div>
      <div class="dialog-inhalt">${html}</div>
      ${knoepfe.length ? `<div class="dialog-knoepfe">${knoepfe.map((k, i) =>
        `<button class="knopf ${k.art || ''}" data-k="${i}">${esc(k.text)}</button>`).join('')}</div>` : ''}
    </div>`;
    const zu = wert => { wrap.remove(); resolve(wert); };
    wrap.addEventListener('click', e => {
      if (schliessbar && (e.target === wrap || e.target.closest('[data-x]'))) return zu(null);
      const k = e.target.closest('[data-k]');
      if (k) {
        const def = knoepfe[Number(k.dataset.k)];
        const r = def.wert !== undefined ? def.wert : true;
        if (def.pruefen && !def.pruefen(wrap)) return;
        zu(typeof r === 'function' ? r(wrap) : r);
      }
    });
    ebene.appendChild(wrap);
    if (beimOeffnen) beimOeffnen(wrap, zu);
  });
}

function frage(text, ja = 'OK', art = 'haupt') {
  return dialog({ titel: 'Bitte bestätigen', mitte: true, html: `<p style="margin:0">${text}</p>`,
    knoepfe: [{ text: 'Abbrechen', wert: false }, { text: ja, art, wert: true }] }).then(r => r === true);
}

function hinweisDialog(t, text) {
  return dialog({ titel: t, mitte: true, html: `<p style="margin:0">${text}</p>`, knoepfe: [{ text: 'OK', art: 'haupt' }] });
}

function eingabe(t, feldname, vorgabe = '') {
  return dialog({
    titel: t, mitte: true,
    html: `<label class="feld"><span>${esc(feldname)}</span><input type="text" id="eingabe-feld" value="${esc(vorgabe)}" autocomplete="off"></label>`,
    knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'OK', art: 'haupt', wert: w => w.querySelector('#eingabe-feld').value.trim() || null }],
    beimOeffnen: (w, zu) => {
      const f = w.querySelector('#eingabe-feld');
      setTimeout(() => f.focus(), 50);
      f.addEventListener('keydown', e => { if (e.key === 'Enter') zu(f.value.trim() || null); });
    },
  });
}

function aktuelle() { return zustand.id ? store.get(zustand.id) : null; }

function fotoUrl(fotoId) {
  if (zustand.urls.has(fotoId)) return Promise.resolve(zustand.urls.get(fotoId));
  return db.getBlob(fotoId + ':t').then(b => b || db.getBlob(fotoId)).then(b => {
    if (!b) return '';
    const u = URL.createObjectURL(b);
    zustand.urls.set(fotoId, u);
    return u;
  });
}
function urlsFreigeben() {
  for (const u of zustand.urls.values()) URL.revokeObjectURL(u);
  zustand.urls.clear();
}

function adresseKurz(a) { return [a.strasse, [a.plz, a.ort].filter(Boolean).join(' ')].filter(Boolean).join(', '); }

// ---------- Navigation ----------
// Zurück (Titel-Knopf ◄ oder Zurück-Geste des Handys): offene Dialoge schließen, zur Übersicht
function zurueck() {
  ebene.innerHTML = '';
  if (zustand.ansicht !== 'uebersicht') { store.allesSpeichern(); zeigeUebersicht(); }
}
function gehe(ansicht) {
  if (zustand.ansicht === 'uebersicht' && ansicht !== 'uebersicht') history.pushState({ a: ansicht }, '');
}

// ====================================================================
// ÜBERSICHT
// ====================================================================
async function zeigeUebersicht() {
  zustand.ansicht = 'uebersicht';
  zustand.id = null;
  urlsFreigeben();
  titel('Besichtigungen', null, { text: 'Einstellungen', aktion: zeigeEinstellungen });
  $('#reiter').hidden = true;
  $('#leiste').hidden = true;
  $('#statusleiste').hidden = true;
  await malUebersicht();
}

async function malUebersicht() {
  const z = await ladeZugang();
  zustand.hatToken = !!z.token;
  if (zustand.ansicht !== 'uebersicht') return; // inzwischen woanders hin gewechselt
  const alle = store.alle().sort((a, b) =>
    (`${b.besichtigung.datum} ${b.besichtigung.uhrzeit}`).localeCompare(`${a.besichtigung.datum} ${a.besichtigung.uhrzeit}`)
    || b.erstellt.localeCompare(a.erstellt));
  const warten = alle.filter(v => v.wartet && !v.fotosEntfernt);
  let hinweise = '';
  if (!z.token) {
    hinweise += `<div class="hinweis">Noch kein Zugang zum Daten-Repo eingerichtet. Du kannst trotzdem Besichtigungen erfassen –
      hochgeladen wird erst, wenn der Token unter <b>Einstellungen</b> eingetragen ist.</div>`;
  } else if (z.ablauf) {
    const tage = Math.floor((Date.parse(z.ablauf.replace(' UTC', 'Z').replace(' ', 'T')) - Date.now()) / 86400000);
    if (Number.isFinite(tage) && tage <= 21) {
      hinweise += `<div class="hinweis warnung"><strong>Zugriffstoken ${tage < 0 ? 'ist abgelaufen' : `läuft in ${tage} Tagen ab`}.</strong>
        Bitte am PC einen neuen erstellen und unter Einstellungen eintragen (siehe Anleitung).</div>`;
    }
  }
  if (store.speicherFehler) {
    hinweise += `<div class="hinweis warnung"><strong>Speichern auf dem Handy fehlgeschlagen:</strong> ${esc(store.speicherFehler.message)}.
      Ist der Speicher voll? Die App versucht es weiter.</div>`;
  }
  if (warten.length) {
    hinweise += `<div class="hinweis">${warten.length === 1 ? '1 Besichtigung wartet' : `${warten.length} Besichtigungen warten`} auf den Upload.
      ${navigator.onLine ? (syncLaeuft() ? 'Wird gerade hochgeladen …' : '') : 'Kein Internet – wird automatisch nachgeholt, sobald die App mit Internet geöffnet ist.'}
      ${navigator.onLine && z.token && !syncLaeuft() ? '<div style="margin-top:6px"><button class="knopf klein" id="jetzt-hoch">Jetzt hochladen</button></div>' : ''}</div>`;
  }
  inhalt.innerHTML = `${hinweise}
    <button class="knopf haupt breit" id="neu" style="margin-bottom:10px">+ Neue Besichtigung</button>
    ${alle.length ? `<div class="liste">${alle.map(v => `
      <button class="liste-eintrag" data-id="${esc(v.id)}">
        <div class="haupt-text">
          <div class="name">${esc(v.kunde.name || 'Ohne Namen')}</div>
          <div class="neben">${esc(adresseKurz(v.auszug) || 'Keine Adresse')}</div>
          <div class="neben">${datumDE(v.besichtigung.datum)} · ${v.fotos.length} Fotos${v.wartet && !v.fotosEntfernt ? ' · wartet auf Upload' : ''}${v.syncFehler ? ' · Upload-Fehler' : ''}</div>
        </div>
        <span class="status ${v.status}">${STATUS_TEXT[v.status]}</span>
      </button>`).join('')}</div>`
    : '<div class="leer">Noch keine Besichtigungen.<br>Tippe auf „+ Neue Besichtigung“.</div>'}
    <p class="klein-text" style="text-align:center;margin-top:14px">Version ${APP_VERSION}</p>`;
  $('#neu').onclick = neueAnlegen;
  const jh = $('#jetzt-hoch');
  if (jh) jh.onclick = () => { syncAlle(); setTimeout(malUebersicht, 200); };
  inhalt.querySelectorAll('.liste-eintrag').forEach(b => { b.onclick = () => zeigeBesichtigung(b.dataset.id, 'kunde'); });
}

async function neueAnlegen() {
  const v = neueBesichtigung(listen.material, listen.leistungen);
  await store.neu(v);
  zeigeBesichtigung(v.id, 'kunde');
}

// ====================================================================
// BESICHTIGUNG
// ====================================================================
function zeigeBesichtigung(id, reiter) {
  gehe('besichtigung');
  zustand.ansicht = 'besichtigung';
  zustand.id = id;
  zustand.reiter = reiter || 'kunde';
  const v = aktuelle();
  if (!v) return zeigeUebersicht();
  titel(v.kunde.name || 'Neue Besichtigung', { text: '◄', label: 'Zur Übersicht', aktion: () => history.back() },
    { text: 'Menü', aktion: besichtigungsMenue });
  const nav = $('#reiter');
  nav.hidden = false;
  malReiter();
  const leiste = $('#leiste');
  leiste.hidden = v.fotosEntfernt;
  leiste.innerHTML = `
    <button class="knopf haupt kamera" id="k-kamera">${ICON.kamera} Foto</button>
    <button class="knopf" id="k-galerie">${ICON.galerie} Galerie</button>
    <button class="knopf" id="k-hoch">${ICON.hoch} Hochladen</button>`;
  $('#k-kamera').onclick = () => { $('#kamera').value = ''; $('#kamera').click(); };
  $('#k-galerie').onclick = () => { $('#galerie').value = ''; $('#galerie').click(); };
  $('#k-hoch').onclick = fertigUndHochladen;
  malStatusleiste();
  malInhalt();
}

function malReiter() {
  const v = aktuelle();
  const nav = $('#reiter');
  nav.setAttribute('role', 'tablist');
  nav.innerHTML = [['kunde', 'Kunde'], ['fotos', `Fotos (${v.fotos.length})`], ['leistungen', 'Leistungen']]
    .map(([k, t]) => `<button role="tab" data-r="${k}" aria-selected="${zustand.reiter === k}">${t}</button>`).join('');
  nav.querySelectorAll('button').forEach(b => {
    b.onclick = () => { zustand.reiter = b.dataset.r; malReiter(); malInhalt(); inhalt.scrollTop = 0; };
  });
}

function malStatusleiste() {
  const v = aktuelle();
  const s = $('#statusleiste');
  if (!v) return;
  s.hidden = false;
  s.classList.toggle('fehler', !!v.syncFehler && !zustand.syncText);
  let t = `Status: ${STATUS_TEXT[v.status]}`;
  if (zustand.syncText) t = zustand.syncText;
  else if (v.syncFehler) t = `Upload fehlgeschlagen: ${v.syncFehler}`;
  else if (v.fotosEntfernt) t += ' · Fotos vom Handy entfernt (nur lesen)';
  else if (v.wartet) t += !zustand.hatToken ? ' · wartet (Zugang in den Einstellungen fehlt)' : navigator.onLine ? ' · wird hochgeladen …' : ' · wartet auf Internet';
  else if (v.letzterSync) {
    const d = new Date(v.letzterSync);
    t += ` · zuletzt hochgeladen ${datumDE(d.toISOString().slice(0, 10))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } else t += ' · nur auf dem Handy';
  s.textContent = t;
}

function malInhalt() {
  const v = aktuelle();
  if (!v) return;
  if (zustand.reiter === 'kunde') malKunde(v);
  else if (zustand.reiter === 'fotos') malFotos(v);
  else malLeistungen(v);
  if (v.fotosEntfernt) inhalt.querySelectorAll('input, select, textarea, .janein button, .menge-zeile .knopf, [data-neu]').forEach(e => { e.disabled = true; });
}

// ---------- Reiter „Kunde“ ----------
function feld(pfad, wert, name, typ = 'text', extra = '') {
  return `<label class="feld"><span>${name}</span><input type="${typ}" data-pfad="${pfad}" value="${esc(wert)}" autocomplete="off" ${extra}></label>`;
}
function auswahl(pfad, wert, name, optionen) {
  return `<label class="feld"><span>${name}</span><select data-pfad="${pfad}">${optionen.map(o =>
    `<option value="${esc(o)}" ${o === wert ? 'selected' : ''}>${esc(o || '– bitte wählen –')}</option>`).join('')}</select></label>`;
}
function janein(pfad, wert, name) {
  return `<div class="janein"><span class="feldname">${name}</span>
    <button type="button" data-pfad="${pfad}" data-wert="ja" aria-pressed="${wert === true}">Ja</button>
    <button type="button" data-pfad="${pfad}" data-wert="nein" aria-pressed="${wert === false}">Nein</button></div>`;
}
function adressGruppe(art, a, titelText) {
  const p = art;
  return `<fieldset class="gruppe"><legend>${titelText}</legend>
    ${feld(`${p}.strasse`, a.strasse, 'Straße und Hausnummer')}
    <div class="zeile"><div class="schmal">${feld(`${p}.plz`, a.plz, 'PLZ', 'text', 'inputmode="numeric" maxlength="5"')}</div>
      <div>${feld(`${p}.ort`, a.ort, 'Ort')}</div></div>
    <div class="zeile"><div>${auswahl(`${p}.etage`, a.etage, 'Etage', ETAGEN)}</div>
      <div>${auswahl(`${p}.gebaeudeteil`, a.gebaeudeteil, 'Gebäudeteil', GEBAEUDETEILE)}</div></div>
    ${janein(`${p}.aufzug`, a.aufzug, 'Aufzug vorhanden')}
    ${janein(`${p}.treppenhaus_eng`, a.treppenhaus_eng, 'Treppenhaus eng')}
    ${janein(`${p}.halteverbot`, a.halteverbot, 'Halteverbot nötig')}
    <div class="zeile">
      <div>${feld(`${p}.laufweg_m`, a.laufweg_m, 'Laufweg LKW (m)', 'text', 'inputmode="decimal"')}</div>
      <div>${feld(`${p}.wohnflaeche_m2`, a.wohnflaeche_m2, 'Fläche (m²)', 'text', 'inputmode="decimal"')}</div>
      <div>${feld(`${p}.zimmer`, a.zimmer, 'Zimmer', 'text', 'inputmode="decimal"')}</div>
    </div>
  </fieldset>`;
}

function malKunde(v) {
  inhalt.innerHTML = `
    <fieldset class="gruppe"><legend>Kunde</legend>
      ${feld('kunde.name', v.kunde.name, 'Name', 'text', 'autocapitalize="words"')}
      ${feld('kunde.telefon', v.kunde.telefon, 'Telefon', 'tel')}
      ${feld('kunde.email', v.kunde.email, 'E-Mail', 'email', 'autocapitalize="off" spellcheck="false"')}
    </fieldset>
    <fieldset class="gruppe"><legend>Besichtigung</legend>
      <div class="zeile"><div>${feld('besichtigung.datum', v.besichtigung.datum, 'Datum', 'date')}</div>
        <div>${feld('besichtigung.uhrzeit', v.besichtigung.uhrzeit, 'Uhrzeit', 'time')}</div></div>
    </fieldset>
    <fieldset class="gruppe"><legend>Wunschtermin Umzug</legend>
      <div class="zeile"><div>${feld('wunschtermin.datum', v.wunschtermin.datum, 'Datum', 'date')}</div>
        <div>${feld('wunschtermin.uhrzeit', v.wunschtermin.uhrzeit, 'Uhrzeit (optional)', 'time')}</div></div>
      ${feld('wunschtermin.notiz', v.wunschtermin.notiz, 'Notiz (z. B. „flexibel, auch eine Woche später“)')}
    </fieldset>
    ${adressGruppe('auszug', v.auszug, 'Auszugsadresse (alte Wohnung)')}
    ${adressGruppe('einzug', v.einzug, 'Einzugsadresse (neue Wohnung)')}`;
}

// Eingaben im Reiter Kunde/Leistungen speichern
inhalt.addEventListener('input', e => {
  const t = e.target;
  const v = aktuelle();
  if (!v || v.fotosEntfernt) return;
  if (t.dataset.pfad && t.tagName !== 'BUTTON') {
    const [a, b] = t.dataset.pfad.split('.');
    store.update(v.id, x => { x[a][b] = t.value; }, { inhaltlich: true });
    if (t.dataset.pfad === 'kunde.name') $('#titel-text').textContent = t.value || 'Neue Besichtigung';
  } else if (t.dataset.menge !== undefined) {
    const i = Number(t.dataset.menge);
    const n = Math.max(0, Math.floor(Number(t.value.replace(',', '.')) || 0));
    store.update(v.id, x => { x.material[i].menge = n; }, { inhaltlich: true });
  } else if (t.dataset.lnotiz !== undefined) {
    store.update(v.id, x => { x.leistungen[Number(t.dataset.lnotiz)].notiz = t.value; }, { inhaltlich: true });
  } else if (t.id === 'notizen') {
    store.update(v.id, x => { x.notizen = t.value; }, { inhaltlich: true });
  }
});
inhalt.addEventListener('change', e => {
  const t = e.target;
  const v = aktuelle();
  if (!v || v.fotosEntfernt) return;
  if (t.dataset.lcheck !== undefined) {
    const i = Number(t.dataset.lcheck);
    store.update(v.id, x => { x.leistungen[i].gewuenscht = t.checked; }, { inhaltlich: true });
    const n = inhalt.querySelector(`[data-lnotiz="${i}"]`);
    if (n) n.hidden = !t.checked;
  }
  // iPhone: Datums-/Auswahlfelder melden sich manchmal nur über "change"
  if (t.dataset.pfad && (t.type === 'date' || t.type === 'time' || t.tagName === 'SELECT')) {
    const [a, b] = t.dataset.pfad.split('.');
    if (v[a][b] !== t.value) store.update(v.id, x => { x[a][b] = t.value; }, { inhaltlich: true });
  }
});
inhalt.addEventListener('click', e => {
  const v = aktuelle();
  if (!v || v.fotosEntfernt) return;
  const jn = e.target.closest('.janein button');
  if (jn) {
    const [a, b] = jn.dataset.pfad.split('.');
    const neu = jn.dataset.wert === 'ja';
    const wert = v[a][b] === neu ? null : neu; // nochmal tippen = wieder leer
    store.update(v.id, x => { x[a][b] = wert; }, { inhaltlich: true });
    jn.parentElement.querySelectorAll('button').forEach(k => {
      k.setAttribute('aria-pressed', String(wert !== null && (k.dataset.wert === 'ja') === wert));
    });
    return;
  }
  const pm = e.target.closest('[data-plus], [data-minus]');
  if (pm) {
    const i = Number(pm.dataset.plus ?? pm.dataset.minus);
    const d = pm.dataset.plus !== undefined ? 1 : -1;
    store.update(v.id, x => { x.material[i].menge = Math.max(0, (Number(x.material[i].menge) || 0) + d); }, { inhaltlich: true });
    const f = inhalt.querySelector(`[data-menge="${i}"]`);
    if (f) f.value = v.material[i].menge;
  }
});

// ---------- Reiter „Fotos“ ----------
async function malFotos(v) {
  if (!v.fotos.length) {
    inhalt.innerHTML = `<div class="leer">Noch keine Fotos.<br>Unten auf <b>Foto</b> tippen oder Bilder aus der <b>Galerie</b> holen.</div>`;
    return;
  }
  const gruppen = fotosNachRaum(v.fotos);
  inhalt.innerHTML = `<p class="klein-text" style="margin:0 0 6px">${v.fotos.length} Fotos in ${gruppen.length} ${gruppen.length === 1 ? 'Raum' : 'Räumen'} ·
    Bild antippen = groß ansehen, Text antippen = Raum/Kommentar ändern</p>` +
    gruppen.map(g => `
      <div class="raum-kopf">${esc(g.raum)} <span class="anzahl">(${g.fotos.length})</span></div>
      <div class="foto-liste">${g.fotos.map((f, i) => `
        <div class="foto-eintrag" data-foto="${esc(f.id)}">
          <button class="vorschau" data-gross="${esc(f.id)}" aria-label="Foto groß ansehen"><img alt="" data-bild="${esc(f.id)}"></button>
          <button class="text ${f.kommentar ? '' : 'leer-kommentar'}" data-bearb="${esc(f.id)}">${f.kommentar ? esc(f.kommentar) : 'Kommentar hinzufügen …'}</button>
          ${v.fotosEntfernt ? '' : `<div class="pfeile">
            <button class="knopf" data-hoch="${esc(f.id)}" aria-label="Nach oben" ${i === 0 ? 'disabled' : ''}>▲</button>
            <button class="knopf" data-runter="${esc(f.id)}" aria-label="Nach unten" ${i === g.fotos.length - 1 ? 'disabled' : ''}>▼</button>
          </div>`}
        </div>`).join('')}</div>`).join('');
  inhalt.querySelectorAll('[data-gross]').forEach(b => { b.onclick = () => vollbild(b.dataset.gross); });
  inhalt.querySelectorAll('[data-bearb]').forEach(b => {
    b.onclick = () => { if (v.fotosEntfernt) vollbild(b.dataset.bearb); else fotoDialog([b.dataset.bearb]); };
  });
  inhalt.querySelectorAll('[data-hoch]').forEach(b => { b.onclick = () => verschiebe(b.dataset.hoch, -1); });
  inhalt.querySelectorAll('[data-runter]').forEach(b => { b.onclick = () => verschiebe(b.dataset.runter, 1); });
  for (const img of inhalt.querySelectorAll('[data-bild]')) {
    fotoUrl(img.dataset.bild).then(u => { if (u) img.src = u; });
  }
}

function verschiebe(fotoId, richtung) {
  const v = aktuelle();
  store.update(v.id, x => {
    const i = x.fotos.findIndex(f => f.id === fotoId);
    if (i < 0) return;
    const raum = x.fotos[i].raum;
    let j = i + richtung;
    while (j >= 0 && j < x.fotos.length && x.fotos[j].raum !== raum) j += richtung;
    if (j < 0 || j >= x.fotos.length) return;
    [x.fotos[i], x.fotos[j]] = [x.fotos[j], x.fotos[i]];
  }, { inhaltlich: true });
  const scroll = inhalt.scrollTop;
  malFotos(aktuelle()).then(() => { inhalt.scrollTop = scroll; });
}

// Neue Fotos aus Kamera oder Galerie
async function fotosAufnehmen(input) {
  const dateien = [...(input.files || [])];
  input.value = '';
  const v = aktuelle();
  if (!dateien.length || !v) return;
  const neueIds = [];
  const vorgabeRaum = v.fotos.length ? v.fotos[v.fotos.length - 1].raum : '';
  let fehler = 0;
  for (let i = 0; i < dateien.length; i++) {
    zustand.syncText = dateien.length > 1 ? `Bilder werden verkleinert: ${i + 1} von ${dateien.length} …` : 'Foto wird gespeichert …';
    malStatusleiste();
    try {
      const r = await verarbeiteFoto(dateien[i]);
      const id = uid();
      await db.putBlob(id, r.gross);
      await db.putBlob(id + ':t', r.vorschau);
      store.update(v.id, x => {
        x.fotos.push({ id, raum: vorgabeRaum || 'Sonstiges', kommentar: '', aufgenommen: new Date().toISOString(), sha: '', w: r.w, h: r.h });
      }, { inhaltlich: true, sofort: true });
      neueIds.push(id);
    } catch (e) {
      fehler++;
      console.error(e);
    }
  }
  zustand.syncText = '';
  malStatusleiste();
  await store.allesSpeichern();
  if (fehler) hinweisDialog('Fehler', `${fehler} Bild(er) konnten nicht gelesen werden. Bitte nochmal versuchen.`);
  if (!neueIds.length) return;
  zustand.reiter = 'fotos';
  malReiter();
  await malFotos(aktuelle());
  fotoDialog(neueIds, { neu: true, ohneVorgabe: !vorgabeRaum });
}

// Raum und Kommentar für ein Foto (oder mehrere neue Fotos auf einmal)
async function fotoDialog(ids, { neu = false, ohneVorgabe = false } = {}) {
  const v = aktuelle();
  const fotos = ids.map(id => v.fotos.find(f => f.id === id)).filter(Boolean);
  if (!fotos.length) return;
  const erstes = fotos[0];
  const mehrere = fotos.length > 1;
  let gewaehlt = ohneVorgabe ? '' : erstes.raum;
  const bildUrl = await fotoUrl(erstes.id);
  const raumKnoepfe = () => {
    const alle = [...new Set([...listen.raeume, ...v.fotos.map(f => f.raum)])];
    return alle.map(r => `<button type="button" data-raum="${esc(r)}" aria-pressed="${r === gewaehlt}">${esc(r)}</button>`).join('')
      + '<button type="button" data-neuraum>+ Raum</button>';
  };
  const setzeRaum = raum => {
    gewaehlt = raum;
    const ziel = fotos.map(f => f.id);
    store.update(v.id, x => { x.fotos.forEach(f => { if (ziel.includes(f.id)) f.raum = raum; }); }, { inhaltlich: true });
  };
  await dialog({
    titel: mehrere ? `${fotos.length} neue Fotos` : (neu ? 'Neues Foto' : 'Foto bearbeiten'),
    html: `
      ${bildUrl ? `<img class="dialog-bild" src="${bildUrl}" alt="">` : ''}
      <div class="feldname">Raum${mehrere ? ' (für alle neuen Fotos)' : ''}</div>
      <div class="raum-wahl" id="raum-wahl">${raumKnoepfe()}</div>
      ${mehrere ? '<p class="klein-text" style="margin:0">Kommentare kannst du danach bei jedem Foto einzeln ergänzen.</p>' : `
      <label class="feld"><span>Kommentar</span>
        <textarea id="foto-kommentar" rows="4" placeholder="z. B. Schrank 3-türig, wird abgebaut; Sofa bleibt da">${esc(erstes.kommentar)}</textarea></label>
      <p class="klein-text" style="margin:0">Tipp: Zum Diktieren auf der Tastatur unten das Mikrofon antippen –
        das funktioniert auf dem iPhone auch ohne Internet.</p>`}`,
    knoepfe: [
      ...(neu || mehrere ? [] : [{ text: 'Löschen', art: 'gefahr', wert: 'loeschen' }]),
      { text: 'Fertig', art: 'haupt', wert: 'ok' },
    ],
    beimOeffnen: (w) => {
      const wahl = w.querySelector('#raum-wahl');
      wahl.addEventListener('click', async e => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.neuraum !== undefined) {
          const name = await eingabe('Raum hinzufügen', 'Name des Raums (z. B. Schlafzimmer 2, Arbeitszimmer)');
          if (!name) return;
          if (!listen.raeume.includes(name)) { listen.raeume.push(name); speichereListen(); }
          setzeRaum(name);
        } else setzeRaum(b.dataset.raum);
        wahl.innerHTML = raumKnoepfe();
      });
      const k = w.querySelector('#foto-kommentar');
      if (k) k.addEventListener('input', () => {
        store.update(v.id, x => { const f = x.fotos.find(q => q.id === erstes.id); if (f) f.kommentar = k.value; }, { inhaltlich: true });
      });
    },
  }).then(async r => {
    // Ohne Raumwahl bleibt das Foto bei „Sonstiges“
    if (r === 'loeschen') {
      if (await frage('Dieses Foto wirklich löschen?', 'Löschen', 'gefahr')) {
        store.update(v.id, x => { x.fotos = x.fotos.filter(f => f.id !== erstes.id); }, { inhaltlich: true, sofort: true });
        await db.deleteBlobs([erstes.id, erstes.id + ':t']);
        const u = zustand.urls.get(erstes.id);
        if (u) { URL.revokeObjectURL(u); zustand.urls.delete(erstes.id); }
        meldung('Foto gelöscht.');
      }
    }
    store.allesSpeichern();
    if (zustand.ansicht === 'besichtigung') {
      malReiter();
      if (zustand.reiter === 'fotos') { const s = inhalt.scrollTop; await malFotos(aktuelle()); inhalt.scrollTop = s; }
    }
  });
}

// Vollbild
async function vollbild(startId) {
  const v = aktuelle();
  const reihe = fotosNachRaum(v.fotos).flatMap(g => g.fotos);
  let i = Math.max(0, reihe.findIndex(f => f.id === startId));
  const wrap = document.createElement('div');
  wrap.className = 'vollbild';
  wrap.innerHTML = `<div class="vb-oben"><span id="vb-titel"></span><button class="titel-knopf" id="vb-zu">✕ Schließen</button></div>
    <div class="bildflaeche"><img id="vb-bild" alt=""></div>
    <div class="unterschrift" id="vb-text"></div>
    <div class="vb-leiste"><button class="knopf" id="vb-zurueck">◄ Zurück</button>
      ${v.fotosEntfernt ? '' : '<button class="knopf" id="vb-bearb">Bearbeiten</button>'}
      <button class="knopf" id="vb-vor">Weiter ►</button></div>`;
  ebene.appendChild(wrap);
  let aktUrl = null;
  const zeige = async () => {
    const f = reihe[i];
    wrap.querySelector('#vb-titel').textContent = `${f.raum} · ${i + 1} von ${reihe.length}`;
    wrap.querySelector('#vb-text').textContent = f.kommentar || '';
    wrap.querySelector('#vb-zurueck').disabled = i === 0;
    wrap.querySelector('#vb-vor').disabled = i === reihe.length - 1;
    const b = (await db.getBlob(f.id)) || (await db.getBlob(f.id + ':t'));
    if (aktUrl) URL.revokeObjectURL(aktUrl);
    aktUrl = b ? URL.createObjectURL(b) : null;
    wrap.querySelector('#vb-bild').src = aktUrl || '';
  };
  const zu = () => { if (aktUrl) URL.revokeObjectURL(aktUrl); wrap.remove(); };
  wrap.querySelector('#vb-zu').onclick = zu;
  wrap.querySelector('#vb-bild').onclick = zu;
  wrap.querySelector('#vb-zurueck').onclick = () => { if (i > 0) { i--; zeige(); } };
  wrap.querySelector('#vb-vor').onclick = () => { if (i < reihe.length - 1) { i++; zeige(); } };
  const be = wrap.querySelector('#vb-bearb');
  if (be) be.onclick = () => { const id = reihe[i].id; zu(); fotoDialog([id]); };
  // Wischen nach links/rechts
  let x0 = null;
  wrap.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  wrap.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 60) { if (dx < 0 && i < reihe.length - 1) { i++; zeige(); } else if (dx > 0 && i > 0) { i--; zeige(); } }
  });
  zeige();
}

// ---------- Reiter „Leistungen“ ----------
function malLeistungen(v) {
  inhalt.innerHTML = `
    <fieldset class="gruppe"><legend>Material</legend>
      ${v.material.map((m, i) => `
        <div class="menge-zeile"><span class="bez">${esc(m.bezeichnung)}</span>
          <button class="knopf" data-minus="${i}" aria-label="weniger">−</button>
          <input type="text" inputmode="numeric" data-menge="${i}" value="${esc(m.menge)}" aria-label="Menge ${esc(m.bezeichnung)}">
          <button class="knopf" data-plus="${i}" aria-label="mehr">+</button></div>`).join('')}
      <button class="knopf klein" data-neu="material" style="margin-top:6px">+ Position</button>
    </fieldset>
    <fieldset class="gruppe"><legend>Zusatzleistungen</legend>
      ${v.leistungen.map((l, i) => `
        <div class="check-zeile">
          <label><input type="checkbox" data-lcheck="${i}" ${l.gewuenscht ? 'checked' : ''}> ${esc(l.bezeichnung)}</label>
          <input type="text" data-lnotiz="${i}" value="${esc(l.notiz)}" placeholder="Notiz zu ${esc(l.bezeichnung)}" ${l.gewuenscht ? '' : 'hidden'}>
        </div>`).join('')}
      <button class="knopf klein" data-neu="leistung" style="margin-top:6px">+ Leistung</button>
    </fieldset>
    <fieldset class="gruppe"><legend>Notizen</legend>
      <textarea id="notizen" rows="6" placeholder="Alles andere: Besonderheiten, Zugang, Schlüssel, Parken …">${esc(v.notizen)}</textarea>
    </fieldset>`;
  inhalt.querySelectorAll('[data-neu]').forEach(b => { b.onclick = () => neuePosition(b.dataset.neu); });
}

async function neuePosition(art) {
  const v = aktuelle();
  const name = await eingabe(art === 'material' ? 'Material hinzufügen' : 'Leistung hinzufügen', 'Bezeichnung');
  if (!name) return;
  if (art === 'material') {
    if (v.material.some(m => m.bezeichnung === name)) return meldung('Gibt es schon.');
    store.update(v.id, x => { x.material.push({ bezeichnung: name, menge: 0 }); }, { inhaltlich: true });
    if (!listen.material.includes(name)) listen.material.push(name);
  } else {
    if (v.leistungen.some(l => l.bezeichnung === name)) return meldung('Gibt es schon.');
    store.update(v.id, x => { x.leistungen.push({ bezeichnung: name, gewuenscht: true, notiz: '' }); }, { inhaltlich: true });
    if (!listen.leistungen.includes(name)) listen.leistungen.push(name);
  }
  speichereListen();
  malLeistungen(aktuelle());
  meldung('Hinzugefügt – steht auch bei künftigen Besichtigungen zur Wahl.');
}

// ---------- Hochladen, Menü ----------
async function fertigUndHochladen() {
  const v = aktuelle();
  if (!v) return;
  if (!v.kunde.name.trim()) {
    if (!(await frage('Es ist noch kein Kundenname eingetragen. Der Name wird für den Ordner im Daten-Repo gebraucht. Trotzdem hochladen?', 'Trotzdem hochladen'))) return;
  }
  store.update(v.id, x => { x.eingereicht = true; x.wartet = true; x.syncFehler = ''; }, { sofort: true });
  await store.allesSpeichern();
  const z = await ladeZugang();
  if (!z.token) {
    malStatusleiste();
    return hinweisDialog('Noch kein Zugang', 'Die Besichtigung ist gespeichert und zum Hochladen vorgemerkt. Bitte unter <b>Einstellungen</b> den GitHub-Zugang eintragen – danach wird automatisch hochgeladen.');
  }
  if (!navigator.onLine) {
    malStatusleiste();
    return hinweisDialog('Kein Internet', 'Die Besichtigung ist sicher auf dem Handy gespeichert und zum Hochladen vorgemerkt. Sobald du Internet hast und die App geöffnet ist, wird automatisch hochgeladen.');
  }
  syncAlle();
}

async function besichtigungsMenue() {
  const v = aktuelle();
  if (!v) return;
  const eintraege = [
    ['pdf', 'PDF-Bericht ansehen / teilen'],
    ['hoch', 'Jetzt hochladen', v.fotosEntfernt],
    v.status === 'erledigt' ? ['oeffnen', 'Wieder auf „Synchronisiert“ setzen'] : ['erledigt', 'Als „Erledigt“ markieren', v.status !== 'synchronisiert'],
    ['fotosweg', 'Fotos vom Handy entfernen (Platz sparen)', !(v.status === 'erledigt' && !v.wartet && v.letzterSync && !v.fotosEntfernt)],
    ['loeschen', 'Besichtigung löschen …'],
  ];
  const r = await dialog({
    titel: 'Menü',
    html: `<div class="menue">${eintraege.map(([k, t, aus]) =>
      `<button data-m="${k}" ${aus ? 'disabled' : ''} class="${k === 'loeschen' ? 'gefahr' : ''}">${t}</button>`).join('')}</div>
      ${v.status !== 'synchronisiert' && v.status !== 'erledigt' ? '<p class="klein-text">„Erledigt“ geht, sobald die Besichtigung hochgeladen ist.</p>' : ''}`,
    beimOeffnen: (w, zu) => w.querySelector('.menue').addEventListener('click', e => {
      const b = e.target.closest('[data-m]'); if (b && !b.disabled) zu(b.dataset.m);
    }),
  });
  if (r === 'pdf') return pdfDialog();
  if (r === 'hoch') return fertigUndHochladen();
  if (r === 'erledigt') {
    store.update(v.id, x => { x.status = 'erledigt'; if (x.eingereicht) x.wartet = true; }, { sofort: true });
    meldung('Als erledigt markiert.');
    syncAlle();
  }
  if (r === 'oeffnen') {
    store.update(v.id, x => { x.status = 'synchronisiert'; if (x.eingereicht) x.wartet = true; }, { sofort: true });
    syncAlle();
  }
  if (r === 'fotosweg') return fotosEntfernen();
  if (r === 'loeschen') return loeschen();
  malStatusleiste();
}

async function pdfDialog() {
  const v = aktuelle();
  let blob = null;
  await dialog({
    titel: 'PDF-Bericht',
    html: `<div id="pdf-stand">PDF wird erstellt …</div><div class="fortschritt" id="pdf-balken"><div></div></div>
      <div class="knopfreihe" id="pdf-knoepfe" hidden>
        <button class="knopf haupt" id="pdf-teilen">Teilen / Sichern</button>
        <a class="knopf" id="pdf-oeffnen" target="_blank" rel="noopener">Öffnen</a>
      </div>
      <p class="klein-text" id="pdf-tipp" hidden>„Teilen / Sichern“ → „In Dateien sichern“ legt das PDF auf dem iPhone ab.</p>`,
    beimOeffnen: async (w) => {
      try {
        blob = await berichtFuer(v, t => { const s = w.querySelector('#pdf-stand'); if (s) s.textContent = t; });
        if (v.pdfRev !== v.rev) store.update(v.id, x => { x.pdfRev = v.rev; });
        const name = `Besichtigung_${v.besichtigung.datum}_${slug(v.kunde.name)}.pdf`;
        const datei = new File([blob], name, { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        w.querySelector('#pdf-stand').textContent = `Fertig (${groesse(blob.size)}).`;
        w.querySelector('#pdf-balken').hidden = true;
        w.querySelector('#pdf-knoepfe').hidden = false;
        w.querySelector('#pdf-tipp').hidden = false;
        const a = w.querySelector('#pdf-oeffnen');
        a.href = url;
        const t = w.querySelector('#pdf-teilen');
        if (navigator.canShare && navigator.canShare({ files: [datei] })) {
          t.onclick = () => navigator.share({ files: [datei], title: name }).catch(() => {});
        } else {
          t.textContent = 'Herunterladen';
          t.onclick = () => { const d = document.createElement('a'); d.href = url; d.download = name; d.click(); };
        }
      } catch (e) {
        console.error(e);
        w.querySelector('#pdf-stand').textContent = 'PDF konnte nicht erstellt werden: ' + e.message;
        w.querySelector('#pdf-balken').hidden = true;
      }
    },
  });
}

async function fotosEntfernen() {
  const v = aktuelle();
  if (!(await frage(`Die ${v.fotos.length} Fotos dieser Besichtigung werden vom Handy entfernt. Im privaten Daten-Repo bleiben sie erhalten.
    Die Besichtigung kann danach am Handy nicht mehr bearbeitet werden. Fortfahren?`, 'Fotos entfernen', 'gefahr'))) return;
  await db.deleteBlobs([...v.fotos.map(f => f.id), 'pdf:' + v.id]);
  store.update(v.id, x => { x.fotosEntfernt = true; x.wartet = false; }, { sofort: true });
  urlsFreigeben();
  meldung('Fotos entfernt. Die kleinen Vorschaubilder bleiben zur Orientierung.');
  zeigeBesichtigung(v.id, zustand.reiter);
}

async function loeschen() {
  const v = aktuelle();
  const nieHoch = !v.letzterSync;
  const text = nieHoch
    ? `<b>Achtung:</b> „${esc(v.kunde.name || 'Ohne Namen')}“ wurde <b>noch nie hochgeladen</b>. Alle Daten und ${v.fotos.length} Fotos gehen unwiderruflich verloren.`
    : `„${esc(v.kunde.name || 'Ohne Namen')}“ wird vom Handy gelöscht. Im privaten Daten-Repo bleibt die Besichtigung erhalten.${v.wartet ? ' <b>Die letzten Änderungen sind aber noch nicht hochgeladen.</b>' : ''}`;
  if (!(await frage(text, 'Endgültig löschen', 'gefahr'))) return;
  if (nieHoch && v.fotos.length && !(await frage('Wirklich? Das kann nicht rückgängig gemacht werden.', 'Ja, löschen', 'gefahr'))) return;
  await store.loeschen(v.id);
  meldung('Besichtigung gelöscht.');
  history.back();
}

// ---------- Reaktionen auf Änderungen ----------
function beiAenderung(id) {
  if (zustand.ansicht === 'uebersicht') malUebersicht();
  else if (zustand.ansicht === 'besichtigung' && (id === zustand.id || id === null)) malStatusleiste();
}

function beiSync(info) {
  if (info.ende) {
    zustand.syncText = '';
    if (zustand.ansicht === 'besichtigung') malStatusleiste();
    if (zustand.ansicht === 'uebersicht') malUebersicht();
    return;
  }
  if (info.id === zustand.id && zustand.ansicht === 'besichtigung') {
    zustand.syncText = info.fertig ? '' : `Hochladen: ${info.text}`;
    malStatusleiste();
  }
  if (info.fertig && info.fehler) meldung('Upload fehlgeschlagen: ' + info.fehler, 6000);
  else if (info.fertig) {
    const v = store.get(info.id);
    meldung(`Hochgeladen: ${v ? v.kunde.name || v.ordner : ''}`);
  }
}

// ====================================================================
// EINSTELLUNGEN
// ====================================================================
async function zeigeEinstellungen() {
  gehe('einstellungen');
  zustand.ansicht = 'einstellungen';
  titel('Einstellungen', { text: '◄', label: 'Zurück', aktion: () => history.back() }, null);
  $('#reiter').hidden = true; $('#leiste').hidden = true; $('#statusleiste').hidden = true;
  const z = await ladeZugang();
  const sp = await storageInfo();
  const listeHtml = (art, titelText) => `
    <div class="feldname">${titelText}</div>
    <div class="einstellungs-liste">${listen[art].map((e, i) =>
      `<div><span>${esc(e)}</span><button class="knopf klein" data-weg="${art}" data-i="${i}" aria-label="${esc(e)} entfernen">✕</button></div>`).join('')}</div>
    <button class="knopf klein" data-dazu="${art}" style="margin-bottom:10px">+ Hinzufügen</button>`;
  inhalt.innerHTML = `
    <fieldset class="gruppe"><legend>GitHub-Daten-Repo (privat)</legend>
      ${feld('', z.owner, 'GitHub-Benutzername', 'text', 'id="e-owner" autocapitalize="off" spellcheck="false"')}
      ${feld('', z.repo || 'besichtigung-daten', 'Name des privaten Daten-Repos', 'text', 'id="e-repo" autocapitalize="off" spellcheck="false"')}
      <label class="feld"><span>Zugriffstoken ${z.token ? '(gespeichert – nur eintragen, um ihn zu ersetzen)' : ''}</span>
        <input type="password" id="e-token" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${z.token ? '•••••••••• gespeichert' : 'github_pat_…'}"></label>
      ${z.ablauf ? `<p class="klein-text" style="margin:0 0 6px">Token gültig bis: ${esc(z.ablauf)}</p>` : ''}
      <p class="klein-text" style="margin:0 0 8px">Der Token wird nur auf diesem Handy gespeichert und nur an GitHub geschickt.</p>
      <div class="knopfreihe">
        <button class="knopf haupt" id="e-speichern">Speichern & testen</button>
        ${z.token ? '<button class="knopf gefahr" id="e-tokenweg">Token löschen</button>' : ''}
      </div>
      <div id="e-ergebnis" class="klein-text" style="margin-top:6px"></div>
    </fieldset>
    <fieldset class="gruppe"><legend>Listen</legend>
      ${listeHtml('raeume', 'Räume')}
      ${listeHtml('material', 'Material (gilt für neue Besichtigungen)')}
      ${listeHtml('leistungen', 'Zusatzleistungen (gilt für neue Besichtigungen)')}
      <button class="knopf klein" id="e-standard">Listen auf Standard zurücksetzen</button>
    </fieldset>
    <fieldset class="gruppe"><legend>Speicher auf dem Handy</legend>
      <p style="margin:0 0 6px">Belegt: ${groesse(sp.usage)}${sp.quota ? ` von ca. ${groesse(sp.quota)}` : ''}<br>
      Vor automatischem Löschen geschützt: ${sp.persisted ? 'ja' : 'nicht bestätigt'}</p>
      <p class="klein-text" style="margin:0">Wichtig am iPhone: Die App immer über das Symbol auf dem Startbildschirm öffnen,
        nicht in Safari – sonst sind die Daten getrennt.</p>
    </fieldset>
    <fieldset class="gruppe"><legend>Über</legend>
      <p style="margin:0 0 6px">Version ${APP_VERSION}</p>
      <button class="knopf klein" id="e-update">Nach Updates suchen</button>
    </fieldset>`;

  $('#e-speichern').onclick = async () => {
    const erg = $('#e-ergebnis');
    const neu = {
      owner: $('#e-owner').value.trim(),
      repo: $('#e-repo').value.trim(),
      token: $('#e-token').value.trim() || z.token,
      ablauf: $('#e-token').value.trim() ? '' : z.ablauf,
    };
    if (neu.token && !/^(github_pat_|ghp_)[A-Za-z0-9_]+$/.test(neu.token)) {
      erg.textContent = 'Das sieht nicht wie ein GitHub-Token aus (beginnt mit „github_pat_“). Bitte genau kopieren.';
      return;
    }
    const repoGeaendert = neu.owner !== z.owner || neu.repo !== z.repo;
    erg.textContent = 'Teste Verbindung …';
    try {
      const r = await pruefeVerbindung(neu);
      if (repoGeaendert && z.owner) {
        // Anderes Repo: Ordnernamen neu vergeben, alles erneut hochladen
        for (const v of store.alle()) if (v.eingereicht && !v.fotosEntfernt) store.update(v.id, x => { x.ordner = ''; x.wartet = true; });
      }
      await speichereZugang(neu);
      zustand.hatToken = true;
      erg.textContent = `Verbindung in Ordnung. Repo ist privat ✓, Schreibrecht ✓${neu.ablauf ? `, Token gültig bis ${neu.ablauf}` : ''}. Zweig: ${r.branch}.`;
      $('#e-token').value = '';
      syncAlle();
    } catch (e) {
      erg.textContent = 'Fehler: ' + fehlerText(e) + ' (Nicht gespeichert.)';
    }
  };
  const tw = $('#e-tokenweg');
  if (tw) tw.onclick = async () => {
    if (!(await frage('Token von diesem Handy löschen? Danach wird nichts mehr hochgeladen, bis du einen neuen einträgst.', 'Löschen', 'gefahr'))) return;
    await speichereZugang({ ...z, token: '', ablauf: '' });
    zustand.hatToken = false;
    zeigeEinstellungen();
  };
  inhalt.querySelectorAll('[data-weg]').forEach(b => {
    b.onclick = async () => {
      const art = b.dataset.weg, i = Number(b.dataset.i);
      if (!(await frage(`„${esc(listen[art][i])}“ aus der Liste entfernen? Bestehende Besichtigungen bleiben unverändert.`, 'Entfernen'))) return;
      listen[art].splice(i, 1);
      await speichereListen();
      zeigeEinstellungen();
    };
  });
  inhalt.querySelectorAll('[data-dazu]').forEach(b => {
    b.onclick = async () => {
      const name = await eingabe('Hinzufügen', 'Bezeichnung');
      if (!name || listen[b.dataset.dazu].includes(name)) return;
      listen[b.dataset.dazu].push(name);
      await speichereListen();
      zeigeEinstellungen();
    };
  });
  $('#e-standard').onclick = async () => {
    if (!(await frage('Alle drei Listen auf den Standard zurücksetzen? Eigene Einträge werden aus den Listen entfernt.', 'Zurücksetzen'))) return;
    listen = { raeume: [...STANDARD_RAEUME], material: [...STANDARD_MATERIAL], leistungen: [...STANDARD_LEISTUNGEN] };
    await speichereListen();
    zeigeEinstellungen();
  };
  $('#e-update').onclick = async () => {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (!reg) return meldung('Updates sind nur in der installierten App möglich.');
    await reg.update().catch(() => {});
    if (!reg.waiting && !reg.installing) meldung('Die App ist aktuell (oder es gibt gerade kein Internet).');
  };
}

// ====================================================================
// Service Worker (offline + Updates)
// ====================================================================
let neuLadenGewuenscht = false;
async function registriereServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    const zeigeHinweis = w => {
      $('#update').hidden = false;
      $('#update-knopf').onclick = async () => {
        neuLadenGewuenscht = true;
        await store.allesSpeichern();
        w.postMessage('jetzt-aktivieren');
      };
    };
    if (reg.waiting && navigator.serviceWorker.controller) zeigeHinweis(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) zeigeHinweis(w);
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (neuLadenGewuenscht) location.reload(); });
  } catch (e) {
    console.warn('Service Worker nicht registriert', e);
  }
}
async function pruefeUpdate() {
  try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) reg.update(); } catch (e) { /* offline */ }
}

start();
