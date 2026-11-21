// Zentrale Ablage aller Besichtigungen im Arbeitsspeicher. Jede Änderung läuft über update(),
// wird sofort im Speicher übernommen und kurz danach in IndexedDB geschrieben.
import { db } from './db.js';

const cache = new Map();
const offen = new Map();      // id -> Timer
const hoerer = new Set();
let speicherFehler = null;

export const store = {
  async laden() {
    const alle = await db.allVisits();
    cache.clear();
    for (const v of alle) cache.set(v.id, v);
  },
  alle() { return [...cache.values()]; },
  get(id) { return cache.get(id) || null; },

  async neu(v) {
    cache.set(v.id, v);
    await db.putVisit(v);
    melde(v.id);
    return v;
  },

  // inhaltlich = true: echte Änderung am Inhalt (setzt Status auf „Offen“ und merkt Upload vor)
  update(id, fn, { inhaltlich = false, sofort = false } = {}) {
    const v = cache.get(id);
    if (!v) return null;
    fn(v);
    if (inhaltlich) {
      v.rev = (v.rev || 0) + 1;
      v.geaendert = new Date().toISOString();
      v.status = 'offen';
      if (v.eingereicht) v.wartet = true;
    }
    planeSpeichern(id, sofort ? 0 : 400);
    melde(id);
    return v;
  },

  async loeschen(id) {
    const v = cache.get(id);
    if (!v) return;
    clearTimeout(offen.get(id)); offen.delete(id);
    const keys = ['pdf:' + id];
    for (const f of v.fotos) keys.push(f.id, f.id + ':t');
    await db.deleteBlobs(keys);
    await db.deleteVisit(id);
    cache.delete(id);
    melde(id);
  },

  // Alles noch nicht Gespeicherte sofort schreiben (beim Verlassen/Ausblenden der App)
  async allesSpeichern() {
    const ids = [...offen.keys()];
    for (const id of ids) { clearTimeout(offen.get(id)); offen.delete(id); }
    await Promise.all(ids.map(schreibe));
  },

  beiAenderung(fn) { hoerer.add(fn); return () => hoerer.delete(fn); },
  get speicherFehler() { return speicherFehler; },
};

function planeSpeichern(id, ms) {
  clearTimeout(offen.get(id));
  offen.set(id, setTimeout(() => { offen.delete(id); schreibe(id); }, ms));
}

async function schreibe(id) {
  const v = cache.get(id);
  if (!v) return;
  try {
    // Kopie ablegen, damit spätere Änderungen im Speicher den Schreibvorgang nicht stören
    await db.putVisit(structuredClone(v));
    if (speicherFehler) { speicherFehler = null; melde(null); }
  } catch (e) {
    speicherFehler = e;
    melde(null);
    planeSpeichern(id, 3000); // erneut versuchen
  }
}

function melde(id) { for (const fn of hoerer) { try { fn(id); } catch (e) { console.error(e); } } }
