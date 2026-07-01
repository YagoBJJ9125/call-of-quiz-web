  // ═══════════════════════════════════════════════════════
  // STORAGE — Stato globale, chiavi, IndexedDB, localStorage
  // ═══════════════════════════════════════════════════════

  // ── Stato globale ──
  const STATE = {
    pacchetto: null,        // { manifest, programma, banche }
    pageCorrente: 'dashboard',
    espansioniMaterie: new Set(),
    espansioniArgomenti: new Set(),
  };

  // ── Storage keys ──
  const SK_MANIFEST       = 'cm:manifest';
  const SK_PROGRAMMA      = 'cm:programma';
  const SK_BANDI          = 'cm:bandi';         // catalogo preset piano per bando (opzionale)
  const SK_BANCA_PFX      = 'cm:banca:';        // + materia_id
  const SK_BANCA_CAT_PFX  = 'cm:banca_cat:';    // + materia_id (quiz categorizzati)
  const SK_PROGRESS       = 'cm:progress';
  const SK_DATA_PROVA     = 'cm:data_prova';

  // ═══════ Helpers UI ═══════

  function toast(msg, isError = false) {
    const t = document.createElement('div');
    t.className = 'toast' + (isError ? ' error' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  function showModal(title, text, onConfirm, confirmLabel) {
    document.getElementById('modalTitle').textContent = title;
    const modalText = document.getElementById('modalText');
    if (/<[a-z][^>]*>/i.test(text)) {
      modalText.innerHTML = text;
    } else {
      modalText.textContent = text;
    }
    const btn = document.getElementById('modalConfirm');
    btn.style.display = '';
    if (confirmLabel) btn.textContent = confirmLabel;
    else btn.textContent = 'Conferma';
    btn.onclick = () => { onConfirm(); closeModal(); };
    document.getElementById('modal').classList.add('active');
  }

  function closeModal() {
    document.getElementById('modal').classList.remove('active');
    const btnConf = document.getElementById('modalConfirm');
    if (btnConf) btnConf.style.display = '';
  }

  // ═══════ Storage (IndexedDB per dati grossi, localStorage per piccoli) ═══════

  const DB_NAME    = 'concorso_manager_db';
  const DB_VERSION = 1;
  const STORE_NAME = 'kv';
  let _dbPromise   = null;

  function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror  = () => reject(req.error);
    });
    return _dbPromise;
  }

  async function dbGet(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror   = () => reject(req.error);
    });
  }

  async function dbSet(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror    = () => reject(tx.error);
    });
  }

  async function dbDelAll(prefix) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req   = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          if (cursor.key.toString().startsWith(prefix)) store.delete(cursor.key);
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror    = () => reject(tx.error);
    });
  }

  // localStorage wrapper (per dati piccoli)
  function salvaInStorage(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('localStorage error per', key, ':', e);
      return false;
    }
  }

  function caricaDaStorage(key) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch { return null; }
  }
