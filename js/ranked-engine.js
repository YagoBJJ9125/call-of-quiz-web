  // ═══════════════════════════════════════════════════════
  // RANKED ENGINE — Selezione domande adattiva + hook risposta
  // ═══════════════════════════════════════════════════════
  //
  // Quattro cluster nel pool:
  //   ERRORI      — l'ultima risposta data è stata sbagliata (anche se il quiz
  //                 era padroneggiato → regressione). PRIORITÀ MASSIMA: vengono
  //                 riproposti finché non tornano padroneggiati.
  //   NUOVI       — mai risposti (nessuna voce in diario)
  //   REVIEW      — visti, non padroneggiati, ultima risposta corretta
  //                 (in fase di consolidamento)
  //   CONSOLIDATI — padroneggiati e non "saturi"
  //
  // SATURAZIONE: un quiz padroneggiato e già risposto correttamente molte volte
  // (≥ RANKED_SATURAZIONE_CORRETTE) va "in riposo": viene escluso dalla selezione
  // per RANKED_RIPRESA_GG giorni, poi riemerge una volta per un refresh anti-oblio.
  // Evita che lo stesso quiz facile ricompaia all'infinito.
  //
  // Il mix di lega (ranked-core.js) si applica ai cluster NUOVI/REVIEW/CONSOLIDATI;
  // gli ERRORI hanno una quota prioritaria a parte.
  // ═══════════════════════════════════════════════════════

  const RANKED_OVERRIDE_QUOTA       = 0.20;  // % round su materie deboli (sul restante dopo errori)
  const RANKED_ERRORI_QUOTA_MAX     = 0.55;  // max % del round dedicata agli errori aperti
  const RANKED_SATURAZIONE_CORRETTE = 5;     // corrette totali oltre cui un quiz va "in riposo"
  const RANKED_RIPRESA_GG           = 21;    // giorni di riposo prima del refresh anti-oblio
  const RANKED_RECUPERO_COOLDOWN_MIN = 120;  // minuti di attesa prima che un errore rientri
                                             // nel pool recupero (evita che l'errore appena
                                             // commesso ricompaia nella batteria successiva)

  // — Costruisci pool indicizzato per il selettore —
  // Restituisce { all, perMateria, perId } usabili dal selezionatore
  function rankedCostruisciPool() {
    if (!STATE.pacchetto) return null;
    const visti = new Set();
    const all = [];
    // Fase 5 + 7: filtra materie + argomenti esclusi del piano del save attivo.
    const filtro = (window.SavesCore && SavesCore.getFiltroPianoAttivo)
                    ? SavesCore.getFiltroPianoAttivo() : null;
    for (const m of STATE.pacchetto.manifest.moduli) {
      if (filtro && filtro.materieAmmesse && !filtro.materieAmmesse.has(m.materia_id)) continue;
      const banca = STATE.pacchetto.banche[m.materia_id];
      if (!banca) continue;
      const arr = banca.categorizzati || banca.quiz || [];
      for (const q of arr) {
        const id = quizId(q);
        if (visti.has(id)) continue;
        visti.add(id);
        const argId = q.categorizzazione && q.categorizzazione.argomento_id;
        if (filtro && !filtro.quizPassa(m.materia_id, argId)) continue;
        // Escludi quiz che richiedono immagini non disponibili nell'app
        if (typeof quizRichiedeImmagine === 'function' && quizRichiedeImmagine(q)) continue;
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
  //   I quiz "saturi" (visti correttamente troppe volte di recente) sono esclusi.
  function rankedClassificaPool(pool) {
    const padron = carCaricaPadron();
    const diario = carCaricaDiario();
    const oggi   = new Date(oggiISO());

    // Finestra di scansione diario: 90 giorni
    const limite = new Date(oggi);
    limite.setDate(limite.getDate() - 90);
    const limiteISO = limite.toISOString().substring(0, 10);

    // Soglia "riposo": un quiz saturo visto entro questi giorni resta escluso
    const sogliaRipresa = new Date(oggi);
    sogliaRipresa.setDate(sogliaRipresa.getDate() - RANKED_RIPRESA_GG);
    const sogliaRipresaISO = sogliaRipresa.toISOString().substring(0, 10);

    // Indice per quiz: { corretteTot, ultimoCorretta, ultimoData }
    // Itero i giorni in ordine crescente: l'ultima scrittura riflette l'esito più recente.
    const info = {};
    const giorni = Object.keys(diario).filter(d => d >= limiteISO).sort();
    for (const data of giorni) {
      const day = diario[data];
      if (!day || !day.risposte) continue;
      for (const r of day.risposte) {
        const id = r.quiz_id;
        if (!id) continue;
        if (!info[id]) info[id] = { corretteTot: 0, ultimoCorretta: null, ultimoData: null };
        if (r.corretta) info[id].corretteTot++;
        info[id].ultimoCorretta = !!r.corretta;
        info[id].ultimoData = data;
      }
    }

    const nuovi = [], errori = [], review = [], consolidati = [];
    for (const item of pool) {
      const id = item.id;
      const f = info[id];
      if (!f) { nuovi.push(item); continue; }   // mai visto
      const isPadron = èPadroneggiato(padron[id]);

      // 1. ERRORE APERTO: l'ultima risposta è stata sbagliata → priorità massima.
      //    Vale anche per quiz padroneggiati (regressione = "hai dimenticato").
      if (f.ultimoCorretta === false) { errori.push(item); continue; }

      // 2. PADRONEGGIATO → OBLIO DIRETTO (v0.7 opzione A):
      //    saldo ≥ 3 = padroneggiato. Va in riposo per RANKED_RIPRESA_GG giorni
      //    (escluso dal round). Dopo riemerge UNA volta nel cluster CONSOLIDATI
      //    per il refresh anti-oblio; se rispondi giusto resta padron e riparte
      //    il riposo, se sbagli scende sotto soglia e torna in rotazione normale.
      if (isPadron) {
        if (f.ultimoData >= sogliaRipresaISO) continue;  // ancora in riposo
        consolidati.push(item);                          // refresh post-riposo
        continue;
      }

      // 3. REVIEW: visto, non padroneggiato, ultima corretta → consolidamento.
      review.push(item);
    }
    return { nuovi, errori, review, consolidati };
  }

  // ═══════════════════════════════════════════════════════
  // ERRORI "RECUPERABILI" — Fonte UNICA di verità (Fase 10.1)
  // ═══════════════════════════════════════════════════════
  // Questo helper centralizza la definizione di "errore da recuperare" usata
  // OVUNQUE (badge "39 sbagliati", bottone "Recupera N errori", contatori
  // per-materia, esecuzione batteria). Eliminando le 3 logiche divergenti
  // precedenti, tutti i numeri quadrano alla riga.
  //
  // Criteri (in ordine):
  //   1. Scansiona il diario del SAVE ATTIVO
  //   2. Per ogni quiz_id, tiene SOLO l'ultimo esito (ordine cronologico)
  //   3. Esclude le righe `mode:'sync'` (propagazioni da altri save, non
  //      rispostete davvero qui)
  //   4. Mantiene solo i quiz_id con ultimo esito ERRATO
  //   5. Applica il filtro piano del save attivo (materie + argomenti esclusi)
  //   6. Verifica che il quiz esista ancora nelle banche dati (no ghost)
  //
  // Ritorna:
  //   {
  //     ids: Set<quiz_id>,              // tutti gli errori recuperabili
  //     perMateria: Map<materia, Set>,  // raggruppati per materia
  //     totale: number,                 // = ids.size
  //     pool: Array<{quiz,id,materiaId}>, // pronto per costruire SESSIONE
  //   }
  function _rankedErroriRecuperabili() {
    const diario = carCaricaDiario();
    const ultimoEsito = {};    // quiz_id → {corretta, materia_id}
    const ultimaTsErrato = {}; // quiz_id → timestamp (ms) dell'ultima risposta errata
    const giorni = Object.keys(diario).sort();
    for (const data of giorni) {
      const day = diario[data];
      if (!day || !day.risposte) continue;
      for (const r of day.risposte) {
        if (!r.quiz_id) continue;
        if (r.mode === 'sync') continue;        // esclude propagazioni
        ultimoEsito[r.quiz_id] = {
          corretta: !!r.corretta,
          materia_id: r.materia_id || null,
        };
        // Traccia il timestamp dell'ultima risposta errata (per il cooldown)
        if (!r.corretta) {
          ultimaTsErrato[r.quiz_id] = r.ts || 0;
        }
      }
    }
    // Set di quiz_id con ultimo esito errato (no filtro piano ancora)
    const candidatiIds = new Set();
    for (const id in ultimoEsito) {
      if (!ultimoEsito[id].corretta) candidatiIds.add(id);
    }
    if (candidatiIds.size === 0) {
      return { ids: new Set(), perMateria: new Map(), totale: 0, pool: [] };
    }
    // Filtro piano + verifica esistenza nelle banche dati: costruisco il pool
    // ranked (che già applica getFiltroPianoAttivo) e tengo solo quelli che
    // sono anche tra i candidati.
    const poolFull = rankedCostruisciPool();
    if (!poolFull) return { ids: new Set(), perMateria: new Map(), totale: 0, pool: [] };
    const pool = poolFull.filter(p => candidatiIds.has(p.id));
    const ids = new Set();
    const perMateria = new Map();
    for (const item of pool) {
      ids.add(item.id);
      const mid = item.materiaId || '?';
      if (!perMateria.has(mid)) perMateria.set(mid, new Set());
      perMateria.get(mid).add(item.id);
    }
    return { ids, perMateria, totale: ids.size, pool, ultimaTsErrato };
  }

  // — Selezione "Recupero": quiz da ripadroneggiare ─────────────────────
  // Usa l'helper unico. Opzionalmente restringe a UNA materia.
  // Il recupero ESPLICITO (l'utente clicca "Recupera N errori") include TUTTI
  // gli errori recuperabili: il numero deve coincidere con quello mostrato sul
  // bottone (rankedContaErroriAperti). NON si applica più un cooldown che
  // escludeva gli errori recenti — prima causava il bug "9 errori contati ma
  // solo 1 nella batteria" se gli errori erano stati commessi da poco.
  // Il cooldown resta solo come PRIORITÀ: gli errori "maturi" (più vecchi di
  // RANKED_RECUPERO_COOLDOWN_MIN) vanno davanti, i recenti dopo — così se
  // n < totale si parte dai più stagionati, ma nessuno viene escluso.
  function rankedSelezionaRecupero(n, opts) {
    opts = opts || {};
    const materiaTarget = opts.materiaId || null;
    const dati = _rankedErroriRecuperabili();
    let candidati = dati.pool;
    if (materiaTarget) candidati = candidati.filter(p => p.materiaId === materiaTarget);
    if (candidati.length === 0) return [];

    const cooldownMs = RANKED_RECUPERO_COOLDOWN_MIN * 60 * 1000;
    const ora = Date.now();
    const maturi  = candidati.filter(p => (ora - (dati.ultimaTsErrato[p.id] || 0)) >= cooldownMs);
    const freschi = candidati.filter(p => (ora - (dati.ultimaTsErrato[p.id] || 0)) <  cooldownMs);
    shuffle(maturi); shuffle(freschi);
    const ordinati = maturi.concat(freschi);   // maturi prima, poi recenti — nessuno escluso
    return ordinati.slice(0, Math.min(n, ordinati.length));
  }

  // — Conta errori "maturi" per cooldown (usato dalla UI per mostrare contatore corretto) —
  function rankedContaErroriRecuperabiliMaturi() {
    const dati = _rankedErroriRecuperabili();
    const cooldownMs = RANKED_RECUPERO_COOLDOWN_MIN * 60 * 1000;
    const ora = Date.now();
    return dati.pool.filter(p => (ora - (dati.ultimaTsErrato[p.id] || 0)) >= cooldownMs).length;
  }

  // — Conta gli "errori aperti recuperabili": usa l'helper unico.
  //   Ora restituisce ESATTAMENTE lo stesso numero di "Recupera N errori".
  function rankedContaErroriAperti() {
    return _rankedErroriRecuperabili().totale;
  }

  // — Numero di errori recuperabili per ciascuna materia ─────────────────
  function rankedErroriPerMateria() {
    const dati = _rankedErroriRecuperabili();
    const out = {};
    dati.perMateria.forEach((set, mid) => { out[mid] = set.size; });
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
    aggiungi(_rankedPescaPesata(errori, quotaErrori));

    // ── Priorità 2: override materie deboli sul restante ──
    // Pesco solo dai cluster classificati (non dal pool grezzo): così i quiz
    // "in riposo" per saturazione restano esclusi anche se di materia debole.
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
    aggiungi(_rankedPescaPesata(filtra(review), tRev));
    aggiungi(_rankedPescaPesata(filtra(consolidati), tCons));

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
    });
    carSalvaDiario(diario);

    // 2) Padroneggiamento algebrico (modello v0.7).
    //    Determino se il quiz era "in recupero" (ultimo esito errato): in
    //    quel caso una risposta corretta vale +2 (bonus recupero), una
    //    errata vale −1 normale. Per i nuovi quiz: +1 / −1.
    const padronPrima = carCaricaPadron()[id] || { saldo: 0, ultimoCorretto: false };
    const eraInRecupero = !!(padronPrima.ultimoTs && padronPrima.ultimoCorretto === false);
    const saldoPrima = padronPrima.saldo || 0;
    const padronDopo = carAggiornaPadron(id, corretta, eraInRecupero);
    if (corretta && saldoPrima < 3 && padronDopo.saldo >= 3) {
      try { toast('Quiz padroneggiato ✓ va in oblio (anti-ripetizione)'); } catch (e) {}
    } else if (!corretta && saldoPrima >= 3 && padronDopo.saldo < 3) {
      try { toast('Quiz uscito dall\'oblio: torna in rotazione normale', true); } catch (e) {}
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
