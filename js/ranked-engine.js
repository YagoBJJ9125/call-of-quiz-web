  // Ranked: quote per materia e selezione dei soli ripassi in scadenza.
  // Lo stato di apprendimento e gli intervalli sono in apprendimento.js.

  const RANKED_OVERRIDE_QUOTA       = 0.20;  // % round su materie deboli (sul restante dopo errori)
  const RANKED_ERRORI_QUOTA_MAX     = 0.55;  // max % del round dedicata agli errori aperti
  // — Costruisci pool indicizzato per il selettore —
  // Restituisce { all, perMateria, perId } usabili dal selezionatore
  function rankedCostruisciPool(opts) {
    opts = opts || {};
    if (!STATE.pacchetto) return null;
    const visti = new Set();
    const all = [];
    // Fase 5 + 7: filtra materie + argomenti esclusi del piano del save attivo.
    // opts.ignoraPiano === true → nessun filtro (usato dalla Simulazione, che
    // ha una selezione di materie indipendente dal piano del Ranked).
    const filtro = (!opts.ignoraPiano && window.SavesCore && SavesCore.getFiltroPianoAttivo)
                    ? SavesCore.getFiltroPianoAttivo() : null;
    // Indice id → posizione in `all`: gestisce le COLLISIONI di quizId
    // (molti quiz di logica condividono la stessa domanda, es. "Indicare il
    // valore della seguente operazione." → 86 quiz con lo stesso id). Senza
    // gestione il primo incontrato vince; se quello è la versione VECCHIA
    // senza immagini, la figura non compare mai. Preferiamo sempre la
    // versione CON immagini a parità di id.
    const posById = new Map();
    for (const m of STATE.pacchetto.manifest.moduli) {
      if (filtro && filtro.materieAmmesse && !filtro.materieAmmesse.has(m.materia_id)) continue;
      const banca = STATE.pacchetto.banche[m.materia_id];
      if (!banca) continue;
      const arr = banca.categorizzati || banca.quiz || [];
      for (const q of arr) {
        const id = quizId(q);
        const argId = q.categorizzazione && q.categorizzazione.argomento_id;
        if (filtro && !filtro.quizPassa(m.materia_id, argId)) continue;
        // Escludi quiz che richiedono immagini non disponibili nell'app
        if (typeof quizRichiedeImmagine === 'function' && quizRichiedeImmagine(q)) continue;
        const haImg = Array.isArray(q.immagini) && q.immagini.length > 0;
        if (visti.has(id)) {
          // Collisione: sostituisci solo se il nuovo ha immagini e il tenuto no.
          const pos = posById.get(id);
          if (pos != null && haImg) {
            const tenuto = all[pos].quiz;
            const tenutoHaImg = Array.isArray(tenuto.immagini) && tenuto.immagini.length > 0;
            if (!tenutoHaImg) all[pos] = { quiz: { ...q, _materia_id: m.materia_id }, id, materiaId: m.materia_id };
          }
          continue;
        }
        visti.add(id);
        posById.set(id, all.length);
        all.push({
          quiz: { ...q, _materia_id: m.materia_id },
          id,
          materiaId: m.materia_id,
        });
      }
    }
    return all;
  }

  // — Classifica i quiz del pool in ERRORI / NUOVI / REVIEW / CONSOLIDATI —
  //   Esclude tutte le domande già affrontate la cui revisione non è scaduta.
  function rankedClassificaPool(pool) {
    const out = { nuovi: [], errori: [], review: [], consolidati: [] }, now = Date.now();
    for (const item of pool) {
      const p = CMSpaced.get(item.id);
      if (!p) out.nuovi.push(item);
      else if (p.prossimo <= now) {
        if (p.erroreAperto) out.errori.push(item);
        else if (p.ripassi >= 3) out.consolidati.push(item);
        else out.review.push(item);
      }
    }
    return out;
  }

  // Errori aperti (anche non ancora scaduti) e revisioni in scadenza.
  // Il contatore li mostra tutti; la batteria pesca solo le scadenze maturate.
  function _rankedErroriRecuperabili() {
    const pool = (rankedCostruisciPool() || []).filter(p => CMSpaced.stato(CMSpaced.get(p.id)) === 'ripassare');
    const scaduti = pool.filter(p => CMSpaced.scaduta(p.id));
    const ids = new Set(pool.map(p => p.id)), perMateria = new Map();
    for (const p of pool) {
      if (!perMateria.has(p.materiaId)) perMateria.set(p.materiaId, new Set());
      perMateria.get(p.materiaId).add(p.id);
    }
    return { pool, scaduti, ids, perMateria, totale: ids.size };
  }

  function _rankedOrdinaRipassi(pool) {
    const records = new Map(pool.map(p => [p.id, CMSpaced.get(p.id)]));
    return [...pool].sort((a, b) => {
      const x = records.get(a.id), y = records.get(b.id);
      return (x?.prossimo || 0) - (y?.prossimo || 0) || (y?.errori || 0) - (x?.errori || 0) || a.id.localeCompare(b.id);
    });
  }

  // Ordinamento: prima le revisioni più vecchie; a parità, più errori.
  function rankedSelezionaRecupero(n, opts) {
    const materia = opts?.materiaId;
    const pool = _rankedErroriRecuperabili().scaduti.filter(p => !materia || p.materiaId === materia);
    return _rankedOrdinaRipassi(pool).slice(0, Math.max(0, n));
  }

  // Numero di revisioni effettivamente in scadenza.
  function rankedContaErroriRecuperabiliMaturi() {
    return _rankedErroriRecuperabili().scaduti.length;
  }

  // — Conta gli "errori aperti recuperabili": usa l'helper unico.
  //   Comprende anche gli errori in attesa della loro prossima revisione.
  function rankedContaErroriAperti() {
    return _rankedErroriRecuperabili().totale;
  }

  // — Numero di errori recuperabili per ciascuna materia ─────────────────
  function rankedErroriPerMateria() {
    const out = {};
    for (const p of _rankedErroriRecuperabili().scaduti) out[p.materiaId] = (out[p.materiaId] || 0) + 1;
    return out;
  }

  // — Estrazione pesata per materia (bias verso pesi alti del programma) —
  function _rankedPescaPesata(pool, n) {
    if (pool.length === 0 || n <= 0) return [];
    if (n >= pool.length) return [...pool];
    const pesati = pool.map(p => ({
      item: p,
      w: Math.max(1, carPesoMateria(p.materiaId)),
    }));
    const out = [];
    const used = new Set();
    let attempts = 0;
    while (out.length < n && attempts < n * 60) {
      attempts++;
      let totW = 0;
      for (let i = 0; i < pesati.length; i++) if (!used.has(i)) totW += pesati[i].w;
      if (totW === 0) break;
      let r = Math.random() * totW;
      for (let i = 0; i < pesati.length; i++) {
        if (used.has(i)) continue;
        r -= pesati[i].w;
        if (r <= 0) { used.add(i); out.push(pesati[i].item); break; }
      }
    }
    return out;
  }

  // — Selezione dinamica per round Ranked —
  // n = numero totale di quiz da pescare
  // Logica (in ordine di priorità):
  //   1. ERRORI APERTI — fino al 55% del round, finché ce ne sono. Il sistema
  //      ti tiene sugli errori finché non li padroneggi: il rank sale solo
  //      quando hai davvero consolidato.
  //   2. Sul restante: override 20% su materie deboli (accuratezza < 60%)
  //   3. Sul restante ancora: mix di lega (NUOVI / REVIEW / CONSOLIDATI)
  //   4. Fill-up da qualunque cluster se i pool sono piccoli
  //   5. Shuffle finale
  function rankedSelezionaRound(n, opts) {
    opts = opts || {};
    let pool = rankedCostruisciPool();
    if (!pool || pool.length === 0) return [];

    // RESTRIZIONE: se opts.restrictIds è un Set, filtra il pool a quei quiz_id.
    // Usato dal launch dall'Analisi Quiz Materie (pool ristretto al nodo).
    if (opts.restrictIds && typeof opts.restrictIds.has === 'function') {
      pool = pool.filter(p => opts.restrictIds.has(p.id));
      if (pool.length === 0) return [];
    }

    // FILTRO SOLO ERRATI: round composto esclusivamente dagli errori aperti
    // del pool (eventualmente già ristretto al nodo dell'Analisi).
    if (opts.soloErrati) {
      const { errori } = rankedClassificaPool(pool);
      const presi = _rankedPescaPesata(errori, Math.min(n, errori.length));
      shuffle(presi);
      return presi;
    }

    // ── Composizione per bando: quota ESATTA per materia (vedi
    // composizione-bando.js). La priorità Ranked (errori→deboli→mix lega→
    // fill-up) resta intatta DENTRO ogni quota — non sull'intero round.
    // Bypassata se il pool è già ristretto (opts.restrictIds, selezione
    // mirata da Analisi, non un round "libero").
    const composizione = (!opts.restrictIds && typeof carComposizioneBando === 'function')
                          ? carComposizioneBando() : null;
    if (composizione) {
      const quote = ripartisciProporzionale(n, composizione);
      const scelti = [];
      const giaPresi = new Set();
      for (const mid of Object.keys(quote)) {
        if (quote[mid] <= 0) continue;
        const subPool = pool.filter(p => p.materiaId === mid);
        for (const item of _rankedComponiRound(subPool, quote[mid])) {
          if (!giaPresi.has(item.id)) { scelti.push(item); giaPresi.add(item.id); }
        }
      }
      // Materie senza quota nel piano + eventuale deficit (materia con
      // meno quiz disponibili della sua quota): stesso fill-up di sempre,
      // sul pool residuo.
      if (scelti.length < n) {
        const residuo = pool.filter(p => !giaPresi.has(p.id));
        for (const item of _rankedComponiRound(residuo, n - scelti.length)) {
          if (!giaPresi.has(item.id)) { scelti.push(item); giaPresi.add(item.id); }
        }
      }
      shuffle(scelti);
      return scelti.slice(0, n);
    }

    return _rankedComponiRound(pool, n);
  }

  // — Compone un round dal pool dato: errori prioritari, override materie
  //   deboli, mix di lega, fill-up. Logica INVARIATA rispetto a prima del
  //   layer bando — ora riusabile su un sotto-pool (una singola materia)
  //   quando rankedSelezionaRound applica una composizione per bando.
  function _rankedComponiRound(pool, n) {
    if (!pool || pool.length === 0 || n <= 0) return [];
    const { nuovi, errori, review, consolidati } = rankedClassificaPool(pool);
    const mix = rankedMixCorrente();   // [pNuovi, pReview, pCons]

    const scelti = [];
    const giaPresi = new Set();
    function aggiungi(arr) {
      for (const s of arr) {
        if (!giaPresi.has(s.id)) { scelti.push(s); giaPresi.add(s.id); }
      }
    }
    const filtra = arr => arr.filter(p => !giaPresi.has(p.id));

    // ── Priorità 1: errori aperti (fino a RANKED_ERRORI_QUOTA_MAX del round) ──
    const quotaErrori = Math.min(errori.length, Math.round(n * RANKED_ERRORI_QUOTA_MAX));
    aggiungi(_rankedOrdinaRipassi(errori).slice(0, quotaErrori));

    // ── Priorità 2: override materie deboli sul restante ──
    // Pesco solo dai cluster classificati (non dal pool grezzo): così i quiz
    // in attesa della prossima revisione restano esclusi anche se di materia debole.
    let restante = n - scelti.length;
    const deboli = rankedMaterieDeboli();
    if (deboli.length > 0 && restante > 0) {
      const setDeb = new Set(deboli.map(d => d.materia_id));
      const quotaDeb = Math.floor(restante * RANKED_OVERRIDE_QUOTA);
      const poolDeb = filtra([].concat(errori, nuovi, review, consolidati))
        .filter(p => setDeb.has(p.materiaId));
      aggiungi(_rankedPescaPesata(poolDeb, quotaDeb));
      restante = n - scelti.length;
    }

    // ── Priorità 3: mix di lega su NUOVI / REVIEW / CONSOLIDATI ──
    const tNuovi = Math.round(restante * mix[0]);
    const tRev   = Math.round(restante * mix[1]);
    const tCons  = restante - tNuovi - tRev;
    aggiungi(_rankedPescaPesata(filtra(nuovi), tNuovi));
    aggiungi(_rankedOrdinaRipassi(filtra(review)).slice(0, tRev));
    aggiungi(_rankedOrdinaRipassi(filtra(consolidati)).slice(0, tCons));

    // ── Fill-up se sotto target (cluster esauriti) ──
    if (scelti.length < n) {
      const fillSrc = filtra([].concat(errori, review, nuovi, consolidati));
      shuffle(fillSrc);
      while (scelti.length < n && fillSrc.length > 0) {
        const item = fillSrc.pop();
        if (!giaPresi.has(item.id)) { scelti.push(item); giaPresi.add(item.id); }
      }
    }

    shuffle(scelti);
    return scelti.slice(0, n);
  }

  // — Hook nel motore quiz: chiamato da quiz-engine.js per ogni risposta —
  //   - Aggiorna diario con mode='ranked'
  //   - Aggiorna padroneggiamento (condiviso con Carriera)
  //   - Aggiorna stato Ranked (RP, daily)
  //   - NIENTE XP carriera (modalità separata)
  function rankedHookRisposta(quiz, risposta, corretta) {
    if (!SESSIONE || !SESSIONE.config || !SESSIONE.config._ranked) return;

    const oggi = oggiISO();
    const id = quizId(quiz);

    // 1) Diario (riusa lo stesso storage SK_CAR_DIARIO ma tagga mode='ranked')
    const diario = carCaricaDiario();
    if (!diario[oggi]) {
      diario[oggi] = { missioni: { mattutina: null, pomeridiana: null }, risposte: [], xpGuadagnati: 0 };
    }
    diario[oggi].risposte.push({
      quiz_id: id,
      materia_id: quiz._materia_id || quiz.materia || '?',
      argomento_id: quiz.categorizzazione && quiz.categorizzazione.argomento_id,
      corretta,
      ts: Date.now(),
      slot: null,
      mode: 'ranked',
      recupero: !!SESSIONE.config._recupero,
    });
    carSalvaDiario(diario);

    // 2) Padroneggiamento algebrico (modello v0.7).
    //    Determino se il quiz era "in recupero" (ultimo esito errato): in
    //    quel caso una risposta corretta vale +2 (bonus recupero), una
    //    errata vale −1 normale. Per i nuovi quiz: +1 / −1.
    const padronPrima = carCaricaPadron()[id] || { saldo: 0, ultimoCorretto: false };
    const eraInRecupero = !!(padronPrima.ultimoTs && padronPrima.ultimoCorretto === false);
    const consolidatoPrima = èPadroneggiato(padronPrima);
    const padronDopo = carAggiornaPadron(id, corretta, eraInRecupero);
    if (corretta && !consolidatoPrima && èPadroneggiato(padronDopo)) {
      try { toast('Quiz consolidato dopo ripassi distanziati ✓'); } catch (e) {}
    } else if (!corretta && consolidatoPrima && !èPadroneggiato(padronDopo)) {
      try { toast('Errore conservato: nuovo ripasso programmato dal giorno seguente', true); } catch (e) {}
    }

    // 3) Accumula l'RP del round — NON lo applico al rank adesso.
    //    La sommatoria viene applicata in un colpo solo a fine batteria
    //    (rankedHookFineRound). Il rank quindi NON cambia durante il round e
    //    nessun banner compare a metà batteria.
    //    Il valore dipende dalla lega corrente, che resta fissa per tutto il
    //    round (lo stato non viene mutato fino alla fine).
    const valori = rankedValoriRP();
    const deltaRP = corretta ? valori.corretta : valori.errata;
    SESSIONE._rankedRP = (SESSIONE._rankedRP || 0) + deltaRP;

    // 4) Aggiorna i conteggi del giorno (la barra obiettivo si muove in tempo
    //    reale). L'RP del giorno (rpDelta) viene aggiornato a fine round.
    rankedAggiornaDaily(d => {
      d.fatti++;
      if (corretta) d.corrette++; else d.errate++;
      if (SESSIONE.config._recupero) {
        const key = corretta ? 'recuperoCorrette' : 'recuperoErrate';
        d[key] = (d[key] || 0) + 1;
      }
    });

    // 5) Aggiorna ultimoGiornoAttivo
    const stato = rankedCaricaStato();
    stato.ultimoGiornoAttivo = oggi;
    rankedSalvaStato(stato);

    // 6) PROPAGAZIONE CROSS-SAVE — Fase 3 (silenziosa, riassunta a fine round)
    //    Itera tutti gli altri save: se il quiz appartiene al loro piano, applica
    //    delta RP a ciascuno con LA SUA scala. Niente toast per risposta — il
    //    riassunto compare nel popup di fine batteria.
    if (window.SavesPropagation) {
      try {
        const propagati = SavesPropagation.propagaRPCrossSave(quiz, corretta);
        // Accumula per il riepilogo di fine round
        if (!SESSIONE._rkPropagatiPerSave) SESSIONE._rkPropagatiPerSave = {};
        for (const p of (propagati || [])) {
          const acc = SESSIONE._rkPropagatiPerSave[p.saveId] || {
            saveId: p.saveId, saveName: p.saveName, delta: 0,
            transizioni: [], rpFinale: null
          };
          acc.delta += p.delta;
          acc.rpFinale = p.rpDopo;
          if (p.transizione) acc.transizioni.push({ tipo: p.transizione, livello: p.livelloDopo });
          SESSIONE._rkPropagatiPerSave[p.saveId] = acc;
        }
      } catch (e) {
        console.warn('[ranked] propagazione fallita:', e);
      }
    }
    // Niente banner promo/retro del save corrente qui: la transizione si valuta
    // a fine batteria (rankedHookFineRound). I save background invece applicano
    // subito (non sono in un round) — eventuali promo/retro vengono accodate
    // e mostrate al prossimo accesso a quel save.
  }

  // — Fine round Ranked: applica la sommatoria RP del round in un colpo solo —
  //   Questo è l'UNICO punto in cui il rank può cambiare. Se cambia, la
  //   transizione viene messa "in attesa" e il banner comparirà nella home.
  //   Idempotente: può essere chiamata più volte senza effetti doppi.
  //
  //   PARAM roundCompleto (default true): se false (utente ha terminato in
  //   anticipo senza rispondere a tutti i quiz) NON viene applicato alcun
  //   delta RP né registrata una transizione. I conteggi del giorno
  //   (fatti/corrette/errate) restano comunque aggiornati perché sono già
  //   stati incrementati per-risposta da rankedHookRisposta. Politica chiara:
  //   "ricezione dei punti correlata all'aver terminato tutta la batteria".
  function rankedHookFineRound(roundCompleto) {
    if (!SESSIONE || !SESSIONE.config || !SESSIONE.config._ranked) return;
    if (SESSIONE._rankedFinalizzato) return;
    SESSIONE._rankedFinalizzato = true;

    const completo = (roundCompleto !== false);
    const rpRound = SESSIONE._rankedRP || 0;

    let transizione = { transizione: null, livelloPrima: null, livelloDopo: null, deltaEffettivo: 0 };
    if (completo) {
      transizione = rankedApplicaRP(rpRound);

      // Aggiorna il contatore RP del giorno con il movimento reale del rank
      rankedAggiornaDaily(d => {
        d.rpDelta.base   = (d.rpDelta.base || 0) + transizione.deltaEffettivo;
        d.rpDelta.totale = (d.rpDelta.totale || 0) + transizione.deltaEffettivo;
      });

      // Se è cambiato livello/lega, prepara il banner per la home Ranked
      if (transizione.transizione) {
        rankedSalvaTransizionePending({
          tipo: transizione.transizione,
          livelloPrima: transizione.livelloPrima,
          livelloDopo: transizione.livelloDopo,
        });
      }
    }

    // Memorizzo l'esito per il popup di fine batteria (e per eventuali
    // consumer esterni come il riepilogo Ranked).
    SESSIONE._rankedRoundCompleto = completo;
    SESSIONE._rankedRPApplicato = completo ? (transizione.deltaEffettivo || 0) : 0;

    // Popup centrato di fine batteria (Fase 9): riepilogo punti rank.
    // Sostituisce il toast invasivo per-risposta.
    if (window.SavesPropagation && window.SavesCore) {
      try {
        const sv = SavesCore.getSaveAttivo();
        SavesPropagation.mostraPopupFineBatteria({
          saveCorrenteId: sv ? sv.id : null,
          saveCorrenteName: sv ? sv.nome : 'Save corrente',
          deltaCorrente: completo ? (transizione.deltaEffettivo || 0) : 0,
          livelloDopoCorrente: completo && transizione.livelloDopo ? transizione.livelloDopo.etichetta : null,
          transizioneCorrente: completo ? transizione.transizione : null,
          propagatiPerSave: SESSIONE._rkPropagatiPerSave || {},
          roundCompleto: completo,
          rpPotenziale: !completo ? rpRound : 0,    // RP che avresti ricevuto se completato
          // Fase 10: tag recupero per personalizzare titolo/sottotitolo
          recupero: !!SESSIONE.config._recupero,
          recuperoMateriaId: SESSIONE.config._recuperoMateriaId || null,
        });
      } catch (e) {
        console.warn('[ranked] popup fine batteria fallito:', e);
      }
    }
  }

  // — Costruisci riepilogo del round per la schermata risultati —
  function rankedHookFineRoundRiepilogo() {
    if (!SESSIONE || !SESSIONE.config || !SESSIONE.config._ranked) return null;
    const totali = SESSIONE.quiz.length;
    const corrette = SESSIONE.quiz.filter(q => q._corretta === true).length;
    const errate   = SESSIONE.quiz.filter(q => q._corretta === false).length;
    const lasciati = SESSIONE.quiz.filter(q => q._risposta_data === 'SKIP' || q._risposta_data === null).length;

    // RP reali del round: accumulati risposta per risposta (i valori cambiano
    // di lega, quindi non si possono ricavare da un'unica moltiplicazione).
    const rpRound = SESSIONE._rankedRP || 0;
    const rankAttuale = rankedCalcolaRank();
    const daily = rankedGetDaily();

    return {
      totali, corrette, errate, lasciati,
      rpRound,
      rankAttuale,
      daily,
    };
  }
