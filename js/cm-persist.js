  // ═══════════════════════════════════════════════════════
  // CM-PERSIST — Layer di persistenza durevole (Fase 2)
  //
  // Obiettivo: i dati NON dipendono più dalla cache del browser.
  //
  // • Modalità WEB (file:// o http, nessun Tauri): NO-OP totale. L'app usa
  //   localStorage/IndexedDB come prima. Gli utenti della versione web non
  //   notano alcun cambiamento.
  //
  // • Modalità TAURI (app desktop): SQLite su disco (src-tauri) è la VERITÀ.
  //   - Al boot: store_load_all → idrata localStorage e IndexedDB del webview.
  //   - A ogni scrittura: write-through verso SQLite (debounced, batch).
  //   - Intercetta localStorage.setItem/removeItem/clear e window.dbSet/dbDelAll
  //     così TUTTO il codice esistente continua a funzionare invariato.
  //
  // Espone window.__storageReady (Promise) che app.js attende prima di init().
  // ═══════════════════════════════════════════════════════

  (function () {
    'use strict';

    const isTauri = !!(window.__TAURI__ && window.__TAURI__.core);

    if (!isTauri) {
      // ── Web: niente da fare, persistenza = localStorage/IndexedDB nativi ──
      window.__storageReady = Promise.resolve();
      window.CMPersist = { isTauri: false };
      return;
    }

    // ─────────────────────── MODALITÀ TAURI ───────────────────────
    const invoke    = window.__TAURI__.core.invoke;
    const LS_PREFIX = 'cm:';
    const IDB_PFX   = 'idb::';        // namespace SQLite per le entry IndexedDB

    // Riferimenti ORIGINALI (prima di patcharli) per evitare ricorsioni.
    const _origSetItem    = localStorage.setItem.bind(localStorage);
    const _origRemoveItem = localStorage.removeItem.bind(localStorage);
    const _origClear      = localStorage.clear.bind(localStorage);

    // ── Coda di scrittura (debounce + coalescing) ──
    const dirty   = new Map();   // k -> v   (set da persistere)
    const deleted = new Set();   // k        (delete da persistere)
    let   clearAll = false;
    let   flushTimer = null;
    let   flushing = false;

    function _enqueueSet(k, v) { deleted.delete(k); dirty.set(k, v); _schedule(); }
    function _enqueueDel(k)    { dirty.delete(k);   deleted.add(k);  _schedule(); }
    function _enqueueClear()   { dirty.clear(); deleted.clear(); clearAll = true; _schedule(); }

    function _schedule() {
      if (flushTimer || flushing) return;
      flushTimer = setTimeout(() => { flushTimer = null; flush(); }, 300);
    }

    async function flush() {
      if (flushing) return;
      flushing = true;
      try {
        if (clearAll) {
          clearAll = false;
          await invoke('store_clear');
        }
        if (dirty.size) {
          const items = [...dirty.entries()];
          dirty.clear();
          await invoke('store_set_many', { items });
        }
        if (deleted.size) {
          const dels = [...deleted];
          deleted.clear();
          for (const k of dels) await invoke('store_delete', { k });
        }
      } catch (e) {
        console.error('[cm-persist] flush fallito:', e);
      } finally {
        flushing = false;
        // Se nel frattempo si è accumulato altro, ripianifica.
        if (clearAll || dirty.size || deleted.size) _schedule();
      }
    }

    // ── Patch localStorage: ogni mutazione di chiavi cm:* va anche su SQLite ──
    localStorage.setItem = function (k, v) {
      _origSetItem(k, v);
      if (typeof k === 'string' && k.startsWith(LS_PREFIX)) _enqueueSet(k, String(v));
    };
    localStorage.removeItem = function (k) {
      _origRemoveItem(k);
      if (typeof k === 'string' && k.startsWith(LS_PREFIX)) _enqueueDel(k);
    };
    localStorage.clear = function () {
      _origClear();
      _enqueueClear();
    };

    // ── Patch window.dbSet / window.dbDelAll: mirror IndexedDB → SQLite ──
    // storage.js definisce dbSet/dbDelAll come funzioni globali (su window).
    const _origDbSet    = window.dbSet;
    const _origDbDelAll = window.dbDelAll;
    if (typeof _origDbSet === 'function') {
      window.dbSet = async function (key, value) {
        const r = await _origDbSet(key, value);
        try { _enqueueSet(IDB_PFX + key, JSON.stringify(value)); } catch (_) {}
        return r;
      };
    }
    if (typeof _origDbDelAll === 'function') {
      window.dbDelAll = async function (prefix) {
        const r = await _origDbDelAll(prefix);
        // Rimuovi da SQLite tutte le chiavi idb:: che iniziano col prefisso.
        try {
          const full = IDB_PFX + prefix;
          for (const k of _hydratedIdbKeys) {
            if (k.startsWith(full)) _enqueueDel(k);
          }
        } catch (_) {}
        return r;
      };
    }

    // Tiene traccia delle chiavi idb idratate (per dbDelAll).
    let _hydratedIdbKeys = new Set();

    // ── Boot: SQLite (verità) → idrata webview ──
    async function _hydrate() {
      let rows;
      try {
        rows = await invoke('store_load_all');   // [[k,v], ...]
      } catch (e) {
        console.error('[cm-persist] store_load_all fallito, parto a vuoto:', e);
        return;
      }

      // 1) Pulisci le chiavi cm:* attuali del webview (SQLite è autoritativo).
      const toClear = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(LS_PREFIX)) toClear.push(k);
      }
      toClear.forEach(k => _origRemoveItem(k));

      // 2) Riversa le righe: localStorage per cm:*, IndexedDB per idb::*
      const idbEntries = [];
      for (const [k, v] of rows) {
        if (k.startsWith(IDB_PFX)) {
          const realKey = k.slice(IDB_PFX.length);
          _hydratedIdbKeys.add(k);
          try { idbEntries.push([realKey, JSON.parse(v)]); } catch (_) {}
        } else if (k.startsWith(LS_PREFIX)) {
          _origSetItem(k, v);
        }
      }

      // 3) Ripristina IndexedDB usando la dbSet ORIGINALE (no re-mirror).
      if (idbEntries.length && typeof _origDbSet === 'function') {
        for (const [rk, val] of idbEntries) {
          try { await _origDbSet(rk, val); } catch (e) { console.warn('[cm-persist] idb restore', rk, e); }
        }
      }

      console.info('[cm-persist] Tauri: idratate %d chiavi (%d idb) da SQLite',
        rows.length, idbEntries.length);
    }

    // Flush difensivo quando la finestra perde fuoco / si chiude.
    window.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    window.addEventListener('beforeunload', () => { flush(); });

    window.CMPersist = {
      isTauri: true,
      flush,
      dbPath: () => invoke('store_path'),
    };

    window.__storageReady = _hydrate();
  })();
