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

  // — Composizione del bando del save attivo (o null) —
  function carComposizioneBando() {
    if (typeof SavesCore === 'undefined') return null;
    const save = SavesCore.getSaveAttivo();
    const bandoId = save && save.bandoId;
    if (!bandoId || !STATE.pacchetto || !Array.isArray(STATE.pacchetto.bandi)) return null;
    const bando = STATE.pacchetto.bandi.find(b => b.id === bandoId);
    const comp = bando && bando.piano && bando.piano.composizione;
    return (comp && Object.keys(comp).length > 0) ? comp : null;
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

    const quote = ripartisciProporzionale(n, percentuali);
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
  window.ripartisciProporzionale  = ripartisciProporzionale;
  window.pescaProporzionale       = pescaProporzionale;
