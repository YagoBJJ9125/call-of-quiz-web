  // ═══════════════════════════════════════════════════════
  // COMPOSIZIONE BANDO — pescata proporzionale esatta per materia
  //
  // A differenza di pesiOverride (peso 0-10, campionamento PESATO ma
  // stocastico — vedi carPesoMateria in carriera-core.js), `composizione`
  // fissa la PERCENTUALE esatta di quiz per materia che compare in ogni
  // batteria/round: per un dato N totale, la distribuzione per materia è
  // deterministica (apportionment "resto più grande"), non solo una
  // tendenza. Usata da Ranked, Allenamento Libero e Simulazione d'esame.
  //
  // Nessun effetto per save senza bando o con bando senza `composizione`:
  // tutte le funzioni ritornano null/il pool invariato in quel caso.
  // ═══════════════════════════════════════════════════════

  function normalizzaPercentuali(valori, ids) {
    const lista = (ids || Object.keys(valori || {})).filter(id => valori && Number(valori[id]) > 0);
    const totale = lista.reduce((somma, id) => somma + Number(valori[id] || 0), 0);
    if (lista.length === 0 || totale <= 0) return null;
    const out = {};
    lista.forEach(id => { out[id] = Number(valori[id]) * 100 / totale; });
    return out;
  }

  // — Composizione del piano del save attivo (o null) —
  // Priorità: percentuali personalizzate del save > pesi del save > preset
  // bando > pesi globali del programma. In questo modo anche i vecchi save e
  // i piani manuali ottengono subito una composizione coerente, senza migrare
  // o perdere le impostazioni già salvate.
  function carComposizioneBando() {
    if (typeof SavesCore === 'undefined') return null;
    const save = SavesCore.getSaveAttivo();
    const piano = save && save.piano;
    const ids = piano && Array.isArray(piano.materieIds) ? piano.materieIds : [];
    if (!save || ids.length === 0 || !STATE.pacchetto) return null;

    let sorgente = null;
    if (piano.composizione && Object.keys(piano.composizione).length > 0) {
      sorgente = piano.composizione;
    } else if (piano.pesiOverride && Object.keys(piano.pesiOverride).length > 0) {
      sorgente = piano.pesiOverride;
    }

    if (!sorgente && save.bandoId && Array.isArray(STATE.pacchetto.bandi)) {
      const bando = STATE.pacchetto.bandi.find(b => b.id === save.bandoId);
      const bp = bando && bando.piano;
      if (bp) sorgente = (bp.composizione && Object.keys(bp.composizione).length > 0)
                          ? bp.composizione : bp.pesiOverride;
    }

    if (!sorgente) {
      sorgente = {};
      const materie = (STATE.pacchetto.programma && STATE.pacchetto.programma.materie) || [];
      ids.forEach(id => {
        const materia = materie.find(m => (m.id || m.materia_id) === id);
        sorgente[id] = materia && Number(materia.peso) > 0 ? Number(materia.peso) : 1;
      });
    }

    return normalizzaPercentuali(sorgente, ids);
  }

  // — Ripartizione "resto più grande" (Hamilton apportionment) —
  // n unità intere che sommano ESATTAMENTE a n, proporzionali a
  // `percentuali` (materia_id -> peso/percentuale; non serve sommino a
  // 100, si normalizzano). Ritorna { materia_id: quota }.
  function ripartisciProporzionale(n, percentuali) {
    const ids = Object.keys(percentuali || {}).filter(id => (percentuali[id] || 0) > 0);
    const tot = ids.reduce((s, id) => s + percentuali[id], 0);
    if (ids.length === 0 || tot <= 0 || n <= 0) return {};
    const quote = {};
    let assegnati = 0;
    const resti = [];
    ids.forEach(id => {
      const ideale = n * percentuali[id] / tot;
      const f = Math.floor(ideale);
      quote[id] = f;
      assegnati += f;
      resti.push({ id, resto: ideale - f });
    });
    resti.sort((a, b) => b.resto - a.resto);
    let rimasti = n - assegnati;
    for (let i = 0; i < resti.length && rimasti > 0; i++, rimasti--) quote[resti[i].id]++;
    return quote;
  }

  // — Pesca `n` elementi da `pool` rispettando le percentuali per materia —
  // pool: array di oggetti con un campo materia (default `materiaId`,
  //       configurabile via opts.getMateriaId(item) => materia_id).
  // Deficit (una materia ha meno quiz disponibili della sua quota) →
  // ripescato dall'avanzo delle altre materie (stesso spirito del fill-up
  // già usato da Ranked). Ritorna null se `percentuali` è vuoto/assente —
  // i chiamanti in quel caso usano il loro comportamento storico.
  function pescaProporzionale(pool, n, percentuali, opts) {
    opts = opts || {};
    if (!percentuali || Object.keys(percentuali).length === 0) return null;
    if (!pool || pool.length === 0 || n <= 0) return [];
    const getMid = opts.getMateriaId || (item => item.materiaId);

    const perMateria = {};
    for (const item of pool) {
      const mid = getMid(item);
      if (!perMateria[mid]) perMateria[mid] = [];
      perMateria[mid].push(item);
    }

    // Se il pool è stato ristretto manualmente (es. due sole materie in
    // Allenamento), rinormalizza le percentuali sulle sole materie presenti.
    const percentualiPresenti = {};
    Object.keys(perMateria).forEach(mid => {
      if (Number(percentuali[mid]) > 0) percentualiPresenti[mid] = Number(percentuali[mid]);
    });
    if (Object.keys(percentualiPresenti).length === 0) return null;
    const quote = ripartisciProporzionale(n, percentualiPresenti);
    const scelti = [];
    const avanzo = [];
    let deficit = 0;

    Object.keys(quote).forEach(mid => {
      const disp = (perMateria[mid] || []).slice();
      if (!opts.preservaOrdine) shuffle(disp);
      const presi = disp.slice(0, quote[mid]);
      scelti.push(...presi);
      if (presi.length < quote[mid]) deficit += quote[mid] - presi.length;
      avanzo.push(...disp.slice(presi.length));
    });
    // Materie del pool senza quota definita: candidate solo per riempire buchi
    Object.keys(perMateria).forEach(mid => {
      if (!(mid in quote)) avanzo.push(...perMateria[mid]);
    });

    if (deficit > 0 && avanzo.length > 0) {
      if (!opts.preservaOrdine) shuffle(avanzo);
      scelti.push(...avanzo.slice(0, deficit));
    }
    if (!opts.preservaOrdine) shuffle(scelti);
    return scelti.slice(0, n);
  }

  window.carComposizioneBando     = carComposizioneBando;
  window.normalizzaPercentuali    = normalizzaPercentuali;
  window.ripartisciProporzionale  = ripartisciProporzionale;
  window.pescaProporzionale       = pescaProporzionale;
