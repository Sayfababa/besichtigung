// Lokale Speicherung auf dem Handy (IndexedDB).
// Stores:
//   visits  – eine Besichtigung (alle Texte, Foto-Liste mit Raum/Kommentar)
//   blobs   – Bilddaten: "<fotoId>" (groß), "<fotoId>:t" (Vorschau), "pdf:<visitId>" (Bericht)
//   kv      – Einstellungen (Token, Repo, eigene Räume/Material/Leistungen)

const DB_NAME = 'besichtigung';
const DB_VERSION = 1;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('visits')) db.createObjectStore('visits', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Datenbank ist blockiert. Bitte App schließen und neu öffnen.'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function run(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const st = tx.objectStore(store);
    let result;
    const r = fn(st);
    if (r && 'onsuccess' in r) r.onsuccess = () => { result = r.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Speichern abgebrochen'));
  }));
}

export const db = {
  getVisit: id => run('visits', 'readonly', s => s.get(id)),
  allVisits: () => run('visits', 'readonly', s => s.getAll()),
  putVisit: v => run('visits', 'readwrite', s => s.put(v)),
  deleteVisit: id => run('visits', 'readwrite', s => s.delete(id)),

  getBlob: key => run('blobs', 'readonly', s => s.get(key)),
  putBlob: (key, blob) => run('blobs', 'readwrite', s => s.put(blob, key)),
  deleteBlobs: keys => run('blobs', 'readwrite', s => { keys.forEach(k => s.delete(k)); }),

  get: key => run('kv', 'readonly', s => s.get(key)),
  set: (key, val) => run('kv', 'readwrite', s => s.put(val, key)),
  del: key => run('kv', 'readwrite', s => s.delete(key)),
};

// Bitten, dass der Browser die Daten nicht von selbst löscht (bei wenig Speicher).
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch (e) { /* egal */ }
  return false;
}

export async function storageInfo() {
  try {
    const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
    const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
    return { usage: est ? est.usage : null, quota: est ? est.quota : null, persisted };
  } catch (e) { return { usage: null, quota: null, persisted: false }; }
}
