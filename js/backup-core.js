  // ═══════════════════════════════════════════════════════
  // BACKUP-CORE — Backup COMPLETO e sicuro di tutti i dati
  //
  // A differenza del vecchio export (lista fissa di chiavi, perdeva i
  // multi-save cm:save:*), questo modulo cattura TUTTO:
  //   • ogni chiave localStorage con prefisso "cm:"  (progress, padroneggiati,
  //     tutti i save namespaced cm:save:{id}:*, saves:lista/attivo, scritto,
  //     impostazioni, data_prova, …)
  //   • l'intero object-store "kv" di IndexedDB (concorso_manager_db):
  //     manifest, programma, banche dati importate manualmente.
  //
  // Formato file v2:
  //   { _meta:{format,version,exportedAt,app,device}, local:{...}, idb:{...} }
  //
  // Retrocompatibile col vecchio formato v1 ('concorso-manager-backup',
  // campo "dati"): viene normalizzato in import.
  // ═══════════════════════════════════════════════════════

  (function () {
    'use strict';

    const FORMAT     = 'call-of-quiz-backup';
    const VERSION    = 2;
    const LS_PREFIX  = 'cm:';
    const DB_NAME    = 'concorso_manager_db';
    const STORE_NAME = 'kv';

    // ─── localStorage: dump di tutte le chiavi cm:* ───
    function _dumpLocal() {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(LS_PREFIX)) out[k] = localStorage.getItem(k);
      }
      return out;
    }

    // ─── IndexedDB: dump completo dello store kv (cursore su tutte le chiavi) ───
    function _dumpIdb() {
      return new Promise((resolve) => {
        let req;
        try { req = indexedDB.open(DB_NAME); }
        catch (_) { return resolve({}); }
        req.onerror = () => resolve({});
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) { db.close(); return resolve({}); }
          const out = {};
          const tx  = db.transaction(STORE_NAME, 'readonly');
          const cur = tx.objectStore(STORE_NAME).openCursor();
          cur.onsuccess = (e) => {
            const c = e.target.result;
            if (c) { out[String(c.key)] = c.value; c.continue(); }
          };
          tx.oncomplete = () => { db.close(); resolve(out); };
          tx.onerror    = () => { db.close(); resolve(out); };
        };
      });
    }

    // ─── IndexedDB: ripristino (put di ogni entry) ───
    // Preferisce window.dbSet (definita da storage.js): in modalità Tauri è
    // patchata da cm-persist.js e fa anche write-through su SQLite. Fallback a
    // una connessione IndexedDB diretta se dbSet non è disponibile.
    // Garantisce l'esistenza dello store 'kv' (fix "object store not found").
    // Se manca, riapre il DB con versione +1 e lo crea. Best-effort.
    function _ensureStore() {
      return new Promise((resolve, reject) => {
        let req;
        try { req = indexedDB.open(DB_NAME); } catch (e) { return reject(e); }
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          if (db.objectStoreNames.contains(STORE_NAME)) { db.close(); return resolve(false); }
          const v = db.version + 1; db.close();
          let up;
          try { up = indexedDB.open(DB_NAME, v); } catch (e) { return reject(e); }
          up.onupgradeneeded = () => { const d = up.result; if (!d.objectStoreNames.contains(STORE_NAME)) d.createObjectStore(STORE_NAME); };
          up.onsuccess = () => { up.result.close(); resolve(true); };
          up.onerror = () => reject(up.error);
          up.onblocked = () => reject(new Error('IndexedDB upgrade bloccato'));
        };
      });
    }

    function _restoreIdbDiretto(entries, keys) {
      return new Promise((resolve) => {
        let req;
        try { req = indexedDB.open(DB_NAME); } catch (_) { return resolve(false); }
        req.onerror = () => resolve(false);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) { db.close(); return resolve(false); }
          try {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const st = tx.objectStore(STORE_NAME);
            keys.forEach(k => { try { st.put(entries[k], k); } catch (_) {} });
            tx.oncomplete = () => { db.close(); resolve(true); };
            tx.onerror    = () => { db.close(); resolve(false); };
          } catch (_) { db.close(); resolve(false); }
        };
      });
    }

    // ─── IndexedDB: ripristino BEST-EFFORT (non deve mai bloccare l'import) ───
    // I dati critici (progressi, save, padroneggiamento) sono in localStorage e
    // vengono ripristinati prima. L'IndexedDB (manifest/banche) è secondario:
    // se qualcosa va storto qui, l'import resta comunque valido.
    async function _restoreIdb(entries) {
      const keys = Object.keys(entries || {});
      if (keys.length === 0) return true;
      try { await _ensureStore(); } catch (e) { console.warn('[backup] ensureStore:', e); }
      // Tauri: dbSet fa anche write-through su SQLite. Best-effort per chiave.
      if (typeof window.dbSet === 'function') {
        let okAny = false;
        for (const k of keys) {
          try { await window.dbSet(k, entries[k]); okAny = true; }
          catch (e) { console.warn('[backup] idb set fallito per', k, e); }
        }
        if (okAny) return true;
      }
      return _restoreIdbDiretto(entries, keys);
    }

    // ─── Crea oggetto backup completo ───
    async function creaBackup() {
      const isMobile = window.matchMedia
        ? window.matchMedia('(max-width: 768px)').matches
        : (window.innerWidth <= 768);
      return {
        _meta: {
          format: FORMAT,
          version: VERSION,
          exportedAt: new Date().toISOString(),
          app: 'Call Of Quiz',
          device: isMobile ? 'smartphone' : 'PC',
        },
        local: _dumpLocal(),
        idb: await _dumpIdb(),
      };
    }

    // ─── Esporta su file scaricabile ───
    async function esporta() {
      const backup = await creaBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = 'call-of-quiz-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return backup;
    }

    // ─── Normalizza: accetta formato v2 (nuovo) e v1 (vecchio) ───
    // v1: { _meta:{tipo:'concorso-manager-backup'}, dati:{...} }  → solo local
    function _normalizza(raw) {
      if (!raw || typeof raw !== 'object' || !raw._meta) return null;
      // Formato nuovo v2
      if (raw._meta.format === FORMAT && raw.local && typeof raw.local === 'object') {
        return { local: raw.local, idb: raw.idb || {}, meta: raw._meta };
      }
      // Formato vecchio v1
      if (raw._meta.tipo === 'concorso-manager-backup' && raw.dati && typeof raw.dati === 'object') {
        return { local: raw.dati, idb: {}, meta: raw._meta };
      }
      return null;
    }

    function valida(raw) { return _normalizza(raw) !== null; }

    // ─── Statistiche riepilogo (per conferma UI) ───
    function stats(raw) {
      const n = _normalizza(raw);
      const L = (n && n.local) || {};
      let saves = 0, giorni = 0, padron = 0;
      try { if (L['cm:saves:lista']) saves = JSON.parse(L['cm:saves:lista']).length; } catch (_) {}
      // diario è per-save (cm:save:{id}:carriera:diario): somma tutti i giorni
      try {
        Object.keys(L).forEach(k => {
          if (/carriera:diario$/.test(k)) {
            try { giorni += Object.keys(JSON.parse(L[k]) || {}).length; } catch (_) {}
          }
        });
      } catch (_) {}
      // padroneggiati è globale (cm:carriera:padroneggiati)
      try { if (L['cm:carriera:padroneggiati']) padron = Object.keys(JSON.parse(L['cm:carriera:padroneggiati']) || {}).length; } catch (_) {}
      return {
        chiavi: Object.keys(L).length,
        saves, giorni, padron,
        idb: Object.keys((n && n.idb) || {}).length,
        exportedAt: n && n.meta && (n.meta.exportedAt || n.meta.data_export) || null,
        device: n && n.meta && (n.meta.device || n.meta.device_hint) || '?',
      };
    }

    // ─── Ripristina backup ───
    // replace=true (default): svuota TUTTE le chiavi cm:* prima del restore,
    // così il backup è una sostituzione fedele (nessun residuo).
    async function ripristina(raw, opts) {
      const n = _normalizza(raw);
      if (!n) throw new Error('File di backup non valido o non compatibile');
      const replace = !opts || opts.replace !== false;
      if (replace) {
        const toDel = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(LS_PREFIX)) toDel.push(k);
        }
        toDel.forEach(k => localStorage.removeItem(k));
      }
      Object.keys(n.local).forEach(k => localStorage.setItem(k, n.local[k]));
      // IndexedDB best-effort: un suo fallimento NON deve far fallire l'import
      // (i progressi sono già salvati sopra in localStorage).
      if (n.idb && Object.keys(n.idb).length) {
        try { await _restoreIdb(n.idb); }
        catch (e) { console.warn('[backup] ripristino IndexedDB non riuscito (dati principali comunque ripristinati):', e); }
      }
      return true;
    }

    window.BackupCore = {
      creaBackup, esporta, ripristina, valida, stats,
      FORMAT, VERSION,
    };
  })();
