// Dünne Hülle um IndexedDB. Alle Daten bleiben auf dem Gerät.

const DB_NAME = 'vokabelgarten';
const DB_VERSION = 1;
export const STORES = ['words', 'units', 'photos', 'kv', 'log'];

let dbPromise = null;

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in self)) {
      reject(new Error('Dieser Browser kann keine Daten speichern (IndexedDB fehlt).'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('words')) db.createObjectStore('words', { keyPath: 'id' }).createIndex('unitId', 'unitId');
      if (!db.objectStoreNames.contains('units')) db.createObjectStore('units', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' }).createIndex('unitId', 'unitId');
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('log')) db.createObjectStore('log', { keyPath: 'date' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Die Datenbank ist blockiert. Bitte andere Tabs der App schließen.'));
  });
  return dbPromise;
}

async function tx(storeNames, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    let result;
    Promise.resolve(fn(t))
      .then((r) => {
        result = r;
      })
      .catch(reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('Speichern abgebrochen'));
  });
}

export const db = {
  getAll: (store) => tx([store], 'readonly', (t) => promisify(t.objectStore(store).getAll())),
  get: (store, key) => tx([store], 'readonly', (t) => promisify(t.objectStore(store).get(key))),
  getByIndex: (store, index, value) =>
    tx([store], 'readonly', (t) => promisify(t.objectStore(store).index(index).getAll(value))),
  put: (store, value) => tx([store], 'readwrite', (t) => promisify(t.objectStore(store).put(value))),
  putMany: (store, values) =>
    tx([store], 'readwrite', (t) => {
      const s = t.objectStore(store);
      for (const v of values) s.put(v);
    }),
  delete: (store, key) => tx([store], 'readwrite', (t) => promisify(t.objectStore(store).delete(key))),
  deleteMany: (store, keys) =>
    tx([store], 'readwrite', (t) => {
      const s = t.objectStore(store);
      for (const k of keys) s.delete(k);
    }),
  clear: (stores) =>
    tx(stores, 'readwrite', (t) => {
      for (const s of stores) t.objectStore(s).clear();
    }),
  /** Schreibt mehrere Stores in einer Transaktion, z. B. beim Wiederherstellen. */
  replaceAll: (data) =>
    tx(Object.keys(data), 'readwrite', (t) => {
      for (const [store, values] of Object.entries(data)) {
        const s = t.objectStore(store);
        s.clear();
        for (const v of values) s.put(v);
      }
    }),
};
