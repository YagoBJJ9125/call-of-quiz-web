// Stato durevole: IndexedDB sul web, transazioni SQLite sul desktop.
// La cache sincrona in memoria non dipende dalla quota di localStorage.
(function () {
  'use strict';
  const isTauri = !!window.__TAURI__?.core, invoke = window.__TAURI__?.core?.invoke;
  const memory = new Map(), pending = new Map(), legacy = new Map();
  const native = { get: localStorage.getItem.bind(localStorage), set: localStorage.setItem.bind(localStorage), remove: localStorage.removeItem.bind(localStorage) };
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith('cm:')) legacy.set(k, native.get(k)); }
  legacy.forEach((v, k) => memory.set(k, v));
  let db, ready = false, inflight = null, replacing = null, timer = null, lastError = null;
  const idbKeys = new Set();
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('call-of-quiz-state') : null;
  const originalDbSet = window.dbSet, originalDbDelAll = window.dbDelAll;
  function validaPreesistenti(entries) {
    for (const [k,v] of entries) {
      const array = k === 'cm:saves:lista' || k === 'cm:schemi-pesi';
      const progress = k === 'cm:progress';
      const object = k === 'cm:carriera:padroneggiati' || /carriera:diario$/.test(k);
      if (!array && !progress && !object) continue;
      let parsed;
      try { parsed=JSON.parse(v); } catch (_) { throw new Error('Dati preesistenti non validi: '+k+'. Nessun dato è stato sovrascritto.'); }
      if ((array && !Array.isArray(parsed)) || ((progress || object) && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) || (progress && (!Array.isArray(parsed.risposte) || (parsed.sessioni !== undefined && !Array.isArray(parsed.sessioni))))) {
        throw new Error('Formato preesistente non valido: '+k+'. Esporta il backup prima di intervenire.');
      }
    }
  }
  function report(error) {
    lastError = error; console.error('[archiviazione]', error);
    if (document.getElementById('storageError')) return;
    const el = document.createElement('div'); el.id = 'storageError'; el.setAttribute('role', 'alert');
    el.style.cssText = 'position:fixed;bottom:8px;left:8px;right:8px;z-index:99999;background:#602b27;color:white;padding:14px;border:2px solid #ffb0a5;border-radius:8px;pointer-events:none';
    const text = document.createElement('span'); text.textContent = 'Salvataggio non completato. Non chiudere l’app: i dati in attesa sono ancora recuperabili. ';
    const retry = document.createElement('button'); retry.className = 'btn'; retry.textContent = 'Riprova salvataggio'; retry.onclick = () => flush().catch(() => {});
    const backup = document.createElement('button'); backup.className = 'btn'; backup.textContent = 'Esporta backup'; backup.onclick = () => window.BackupCore?.esporta();
    retry.style.pointerEvents = backup.style.pointerEvents = 'auto';
    el.append(text, retry, backup); document.body.append(el);
  }
  function transaction(changes) {
    if (isTauri) return invoke('store_apply', { changes });
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction('state', 'readwrite'), store = tx.objectStore('state');
        for (const [k, v] of changes) { if (v === null) store.delete(k); else store.put(v, k); }
        tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error || new Error('Transazione interrotta'));
      } catch (e) { reject(e); }
    });
  }
  function schedule() { if (!timer) timer = setTimeout(() => { timer = null; flush().catch(() => {}); }, 0); }
  async function flush() {
    await api.ready;
    if (replacing) await replacing;
    if (inflight) return inflight;
    inflight = (async () => {
      while (pending.size) {
        const batch = [...pending];
        // Non cancellare la coda prima del commit: un guasto non perde scritture.
        await transaction(batch);
        for (const [k, v] of batch) if (pending.get(k) === v) pending.delete(k);
        channel?.postMessage(batch);
      }
      lastError = null; document.getElementById('storageError')?.remove(); return true;
    })().catch(e => { report(e); throw e; }).finally(() => { inflight = null; });
    return inflight;
  }
  function set(k, v) {
    if (!ready) throw new Error('Archiviazione non inizializzata');
    if (!k.startsWith('cm:')) { native.set(k, v); return; }
    memory.set(k, String(v)); pending.set(k, String(v)); schedule();
  }
  function remove(k) {
    if (!ready) throw new Error('Archiviazione non inizializzata');
    if (!k.startsWith('cm:')) { native.remove(k); return; }
    memory.delete(k); pending.set(k, null); schedule();
  }
  async function replace(snapshot, merge = false) {
    await flush();
    const wanted = new Map(merge ? memory : []);
    for (const [k, v] of Object.entries(snapshot)) {
      if (!k.startsWith('cm:') || typeof v !== 'string') throw new Error('Chiave di backup non valida: ' + k);
      wanted.set(k, v);
    }
    // Il marcatore impedisce di ripetere la migrazione dopo import legacy.
    wanted.set('cm:storage:durable-v1', '1');
    // Rifiuta un backup corrotto prima di sostituire l'archivio valido.
    validaPreesistenti(wanted);
    const changes = [...wanted];
    for (const k of memory.keys()) if (!wanted.has(k)) changes.push([k, null]);
    replacing = (async () => {
      try { await transaction(changes); } catch (e) { report(e); throw e; }
      memory.clear(); wanted.forEach((v, k) => memory.set(k, v));
      // Conserva le eventuali scritture arrivate mentre il restore era in corso.
      for (const [k, v] of pending) { if (v === null) memory.delete(k); else memory.set(k, v); }
      channel?.postMessage(changes);
    })().finally(() => { replacing = null; });
    await replacing;
  }
  const api = window.CMStorage = {
    backend: isTauri ? 'sqlite' : 'indexeddb', flush, replace,
    get: k => k.startsWith('cm:') ? memory.get(k) ?? null : native.get(k), set, remove,
    keys: () => [...memory.keys()], snapshot: () => Object.fromEntries(memory),
    status: () => ({ ready, pending: pending.size, error: !!lastError, backend: api.backend }),
    resetAll: async () => {
      await flush();
      if (isTauri) { await invoke('store_clear'); memory.clear(); pending.clear(); idbKeys.clear(); }
      else await replace({});
    },
  };
  api.ready = (async () => {
    let rows;
    if (isTauri) rows = await invoke('store_load_all');
    else {
      db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('call_of_quiz_state', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('state');
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      rows = await new Promise((resolve, reject) => {
        const entries = [], tx = db.transaction('state', 'readonly'), request = tx.objectStore('state').openCursor();
        request.onsuccess = () => { const cursor = request.result; if (cursor) { entries.push([cursor.key, cursor.value]); cursor.continue(); } };
        tx.oncomplete = () => resolve(entries); tx.onerror = tx.onabort = () => reject(tx.error);
      });
    }
    const loaded = rows.filter(([k])=>k.startsWith('cm:'));
    if (loaded.length) { memory.clear(); loaded.forEach(([k,v])=>memory.set(k,v)); }
    validaPreesistenti(loaded.length ? loaded : [...legacy]);
    if (!rows.some(([k]) => k === 'cm:storage:durable-v1')) {
      const source = isTauri && rows.some(([k]) => k.startsWith('cm:')) ? new Map(rows.filter(([k]) => k.startsWith('cm:'))) : legacy;
      const snapshot = Object.fromEntries(source), initial = [...source, ['cm:storage:durable-v1', '1']];
      if (source.size) initial.push(['cm:backup:pre-durable-storage', JSON.stringify(snapshot)]);
      await transaction(initial);
      rows = [...rows.filter(([k]) => !k.startsWith('cm:')), ...initial];
    } else if (legacy.size) {
      // Una vecchia scheda/cache può avere scritto dopo la migrazione.
      // Non sovrascrivere l'archivio attuale e non cancellare questi residui.
      const recovery = ['cm:backup:residui-legacy:' + Date.now(), JSON.stringify(Object.fromEntries(legacy))];
      await transaction([recovery]); rows.push(recovery); api.legacyRecovery = recovery[0];
    }
    memory.clear(); for (const [k, v] of rows) if (k.startsWith('cm:')) memory.set(k, v);
    // Rimuovere la vecchia cache SOLO dopo una copia durevole riuscita.
    for (const k of legacy.keys()) native.remove(k);
    if (isTauri) {
      for (const [k, v] of rows) if (k.startsWith('idb::')) { idbKeys.add(k); await originalDbSet(k.slice(5), JSON.parse(v)); }
      window.dbSet = async (k, v) => { await originalDbSet(k, v); await invoke('store_set_many', { items: [['idb::' + k, JSON.stringify(v)]] }); idbKeys.add('idb::' + k); return true; };
      window.dbDelAll = async prefix => {
        await originalDbDelAll(prefix);
        const changes = [...idbKeys].filter(k => k.startsWith('idb::' + prefix)).map(k => [k, null]);
        if (changes.length) await invoke('store_apply', { changes });
        changes.forEach(([k]) => idbKeys.delete(k));
      };
    }
    ready = true;
    if (api.legacyRecovery) {
      const notice=document.createElement('div');notice.id='storageLegacyRecovery';notice.setAttribute('role','status');
      notice.style.cssText='position:fixed;bottom:8px;left:8px;right:8px;z-index:99998;background:#273b50;color:white;padding:14px;border:1px solid #9bb7d3;border-radius:8px';
      notice.textContent='Trovati dati residui della vecchia versione: sono conservati nella copia completa esportabile da Impostazioni. I progressi attuali non sono stati sostituiti. ';
      const close=document.createElement('button');close.className='btn';close.textContent='Chiudi';close.onclick=()=>notice.remove();notice.append(close);document.body.append(notice);
    }
    return true;
  })();
  window.__storageReady = api.ready;
  // Il bootstrap aggiungerà la sua UI d'errore dopo gli script. Questo ramo
  // evita un evento unhandled anticipato, senza trasformare ready in successo.
  api.ready.catch(() => {});
  window.CMPersist = { isTauri, flush, dbPath: () => isTauri ? invoke('store_path') : Promise.resolve('IndexedDB: call_of_quiz_state') };
  if (channel) channel.onmessage = ({ data }) => { if (ready) for (const [k, v] of data) if (!pending.has(k)) { if (v === null) memory.delete(k); else memory.set(k, v); } };
  document.addEventListener('visibilitychange', () => { if (document.hidden && ready) flush().catch(() => {}); });
  window.addEventListener('beforeunload', e => { if (pending.size) { flush().catch(() => {}); e.preventDefault(); e.returnValue = ''; } });
})();
