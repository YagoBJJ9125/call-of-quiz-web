// Ripetizione dilazionata: la risposta corretta e il consolidamento sono distinti.
(function (root) {
  'use strict';
  const GIORNO = 86400000, INTERVALLI = [3, 7, 14, 30, 60, 120, 240, 365];
  const PREFIX = 'cm:sr:', MARKER = 'cm:sr:migrazione-v1';
  function aggiorna(prima, corretta, ts) {
    const p = prima ? { ...prima } : { versione: 1, ripassi: 0, errori: 0, tentativi: 0, erroreAperto: false, prossimo: null, primo: ts };
    const scaduta = p.prossimo !== null && ts >= p.prossimo;
    p.tentativi++; p.ultimo = ts; p.ultimaCorretta = !!corretta;
    if (!corretta) {
      p.errori++; p.ripassi = 0; p.erroreAperto = true;
      // Un errore ripetuto non rinvia continuamente una revisione già fissata.
      p.prossimo = p.prossimo > ts ? Math.min(p.prossimo, ts + GIORNO) : ts + GIORNO;
    } else if (!prima) {
      p.prossimo = ts + GIORNO;
    } else if (scaduta) {
      p.ripassi++; p.erroreAperto = false; p.ultimoRipasso = ts;
      p.prossimo = ts + INTERVALLI[Math.min(p.ripassi - 1, INTERVALLI.length - 1)] * GIORNO;
    }
    // Una correttezza anticipata non incrementa ripassi e non chiude un errore.
    return p;
  }
  function stato(p, now = Date.now()) {
    if (!p) return 'studiare';
    if (p.erroreAperto || p.prossimo <= now) return 'ripassare';
    return p.ripassi >= 3 ? 'consolidate' : 'apprendimento';
  }
  const cache = new Map();
  function get(id) {
    const raw = storageGetRaw(PREFIX + id);
    if (!raw) return null;
    const old = cache.get(id);
    if (old?.raw === raw) return old.value;
    const value = JSON.parse(raw); cache.set(id, { raw, value }); return value;
  }
  function registra(id, corretta, ts = Date.now()) {
    const p = aggiorna(get(id), corretta, ts);
    if (!salvaInStorage(PREFIX + id, p)) throw new Error('Risposta non archiviata nel piano di ripasso');
    return p;
  }
  function conta(ids, now = Date.now()) {
    const out = { studiare: 0, ripassare: 0, apprendimento: 0, consolidate: 0, scadute: 0, inAttesa: 0, prossimo: null };
    for (const id of ids) {
      const p = get(id); out[stato(p, now)]++;
      if (p && p.prossimo <= now) out.scadute++;
      else if (p?.erroreAperto) out.inAttesa++;
      if (p && p.prossimo > now) out.prossimo = out.prossimo === null ? p.prossimo : Math.min(out.prossimo, p.prossimo);
    }
    return out;
  }
  function html(c) {
    const labels = { studiare: 'Da studiare', ripassare: 'Da ripassare', apprendimento: 'In apprendimento', consolidate: 'Consolidate' };
    return '<div class="srs-stati">' + Object.entries(labels).map(([key, label]) =>
      `<span data-srs-stato="${key}"><strong>${c[key]}</strong><small>${label}</small></span>`).join('') + '</div>';
  }
  function cronologia(progress, diari) {
    const events = [], groups = new Map();
    const add = (r, day, globale) => {
      if (!r.quiz_id || r.mode === 'sync' || typeof r.corretta !== 'boolean') return;
      const rawTs = Number(r.timestamp || r.ts) || Date.parse(day || '1970-01-01') || 0;
      const ts = Number.isFinite(rawTs) && rawTs >= 0 ? rawTs : 0;
      const key = r.quiz_id + '|' + r.corretta + '|' + new Date(ts).toISOString().slice(0, 10);
      if (!groups.has(key)) groups.set(key, []);
      const gruppo = groups.get(key);
      if (!globale) {
        const match = gruppo.find(e => !e.abbinato && Math.abs(e.ts - ts) <= 2000);
        if (match) { match.abbinato = true; return; }
      }
      const event = { id: r.quiz_id, corretta: r.corretta, ts };
      events.push(event); if (globale) gruppo.push(event);
    };
    for (const r of progress || []) add(r, null, true);
    for (const diario of diari) for (const [day, entry] of Object.entries(diario)) for (const r of entry?.risposte || []) add(r, day, false);
    return events.sort((a, b) => a.ts - b.ts);
  }
  async function inizializza() {
    if (caricaDaStorage(MARKER)) return;
    const known = new Set();
    for (const banca of Object.values(STATE.pacchetto.banche)) for (const q of banca.categorizzati || banca.quiz || []) known.add(quizId(q));
    const diari = [];
    for (const save of SavesCore.getListaSaves()) diari.push(SavesCore.leggiSave(save.id, 'cm:carriera:diario') || {});
    const events = cronologia(caricaProgress().risposte || [], diari), records = new Map();
    let ambigui = 0;
    for (const e of events) {
      if (!known.has(e.id)) { if (CMQuizIdentity.ambigui.has(e.id)) ambigui++; continue; }
      records.set(e.id, aggiorna(records.get(e.id), e.corretta, e.ts));
    }
    // Un vecchio saldo non dimostra ripassi distanziati. Se manca il dettaglio,
    // importiamo solo l'ultimo esito documentato, senza inventare revisioni.
    const padron = caricaDaStorage('cm:carriera:padroneggiati') || {};
    for (const [id, p] of Object.entries(padron)) if (known.has(id) && !records.has(id)) {
      const dates = [...new Set(p.giorniCorretti || [])].sort();
      if (dates.length) for (const day of dates) records.set(id, aggiorna(records.get(id), true, Date.parse(day) || 0));
      else if (typeof p.ultimoCorretto === 'boolean' && p.ultimoTs) records.set(id, aggiorna(null, p.ultimoCorretto, p.ultimoTs));
    }
    for (const [id, p] of records) if (!salvaInStorage(PREFIX + id, p)) throw new Error('Migrazione dei ripassi non completata');
    salvaInStorage(MARKER, { versione: 1, data: Date.now(), domande: records.size, tentativiAmbiguiConservati: ambigui });
    if (!await confermaSalvataggio()) throw new Error('Migrazione dei ripassi non salvata');
  }
  const api = { GIORNO, INTERVALLI, aggiorna, stato, cronologia, get, registra, conta, html, inizializza,
    consolidato: id => stato(get(id)) === 'consolidate', scaduta: id => { const p = get(id); return !!p && p.prossimo <= Date.now(); } };
  if (root) root.CMSpaced = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null);
