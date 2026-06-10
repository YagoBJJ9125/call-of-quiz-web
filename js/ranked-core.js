  // ═══════════════════════════════════════════════════════
  // RANKED CORE — Storage, leghe, RP, rollover, target giornaliero
  // ═══════════════════════════════════════════════════════
  //
  // Modalità separata dalla Carriera. Le risposte vengono tracciate nel
  // diario unico (cm:carriera:diario) con tag mode='ranked' per distinguerle.
  // Padroneggiamento condiviso (un quiz è padroneggiato se hai risposto
  // bene in ≥3 giorni diversi, indipendentemente dalla modalità).
  //
  // Stato Ranked: sublevelIndice (0..24) + rp interni 0..100.
  //   0  → Rame 4   (livello iniziale)
  //   3  → Rame 1
  //   4  → Bronzo 4
  //   ...
  //   23 → Diamante 1
  //   24 → Maestro  (apicale, senza sub)
  // ═══════════════════════════════════════════════════════

  // — Storage keys —
  const SK_RANKED_PROFILO  = 'cm:ranked:profilo';
  const SK_RANKED_STATO    = 'cm:ranked:stato';
  const SK_RANKED_DAILY    = 'cm:ranked:daily';

  // — Costanti meccaniche —
  const RANKED_SCHEMA_VERSION = 2;    // bump → triggera migrazione una tantum (curva progressiva)
  const RANKED_RP_PER_SUB    = 100;   // [LEGACY/FALLBACK] usato solo se rankedCostoProssimo() non risolve
  const RANKED_PARACADUTE_FRAZ = 0.80; // dopo retrocessione: rp = 80% del costo del nuovo sub
  const RANKED_DEBITO_FRAZ     = 0.50; // debt floor: rp non scende sotto -50% del costo del sub corrente

  // — Costo per promuovere da sublevelIndice X a X+1 (24 valori, indici 0..23) —
  //   Curva progressiva: per ogni lega un costo base, moltiplicato 1.0/1.3/1.7/2.2
  //   per i 4 sub. Salendo di lega il costo base raddoppia ~1.5×.
  //   Totale per arrivare a Maestro ≈ 7250 RP (vs 2400 del vecchio sistema flat).
  const RANKED_COSTI_SUB = [
     60,  78, 102, 132,  // Rame      (sub 0..3, base 60)
     90, 117, 153, 198,  // Bronzo    (sub 4..7, base 90)
    130, 169, 221, 286,  // Argento   (sub 8..11, base 130)
    200, 260, 340, 440,  // Oro       (sub 12..15, base 200)
    290, 377, 493, 638,  // Platino   (sub 16..19, base 290)
    400, 520, 680, 880,  // Diamante  (sub 20..23, base 400)
  ];

  // — Valore RP per risposta, PER LEGA (indice 0=Rame ... 6=Maestro) —
  //   Curva di difficoltà progettata statisticamente:
  //   - ai rank bassi la risposta giusta vale molto e quella sbagliata poco
  //     → si sale in fretta (sistema incentivante all'inizio)
  //   - ai rank alti i valori si invertono: la risposta SBAGLIATA pesa più
  //     di quella giusta → si sale solo con accuratezza molto alta
  //   "Accuratezza di pareggio" = % minima di risposte giuste per non perdere RP:
  //     Rame 16,7% · Bronzo 27,3% · Argento 40% · Oro 50% · Platino 63,6% · Diamante 76,9%
  const RANKED_VALORI_RP = [
    { corretta: 10, errata: -2  },  // 0 Rame      — pareggio 16,7%
    { corretta: 8,  errata: -3  },  // 1 Bronzo    — pareggio 27,3%
    { corretta: 6,  errata: -4  },  // 2 Argento   — pareggio 40,0%
    { corretta: 5,  errata: -5  },  // 3 Oro       — pareggio 50,0% (pivot)
    { corretta: 4,  errata: -7  },  // 4 Platino   — pareggio 63,6%
    { corretta: 3,  errata: -10 },  // 5 Diamante  — pareggio 76,9%
    { corretta: 3,  errata: -10 },  // 6 Maestro   — apice (valori = Diamante)
  ];

  // — Rollover (bonus/penalità di fine giornata) —
  const RANKED_RP_BONUS_OBIETTIVO   = 5;   // a fine giornata se ≥100% dell'obiettivo
  const RANKED_RP_BONUS_STREAK_DIE  = 2;   // /giorno consecutivo (oltre il 1°)
  const RANKED_RP_PENALITA_PER_MISS = -0.25; // per ogni quiz mancato sotto la soglia 80%
  const RANKED_SOGLIA_TOLLERANZA    = 0.80;  // 80% del target → niente penalità
  const RANKED_DECAY_RP_DIE         = -2;   // /giorno dopo 3 di stop
  const RANKED_DECAY_CAP            = -50;  // cap massimo decay per inattività
  const RANKED_DECAY_DOPO_GIORNI    = 3;    // giorni di stop prima di iniziare il decay

  // — Definizione leghe (6 + Maestro) —
  // sub: 4 → 3 → 2 → 1 (così sub=1 è il più alto, come nei videogiochi)
  // colorBase / colorAccent usate dal CSS via inline style
  const RANKED_LEGHE = [
    // Palette iconica per lega (ogni lega ha un colore distintivo netto)
    { nome: 'Rame',     simbolo: '🟤', file: 'rank-rame.png',     colorBase: '#8B4513', colorAccent: '#D17A3A' }, // rame/cuoio
    { nome: 'Bronzo',   simbolo: '🥉', file: 'rank-bronzo.png',   colorBase: '#A0522D', colorAccent: '#F0A85E' }, // bronzo caldo
    { nome: 'Argento',  simbolo: '🥈', file: 'rank-argento.png',  colorBase: '#7A8590', colorAccent: '#E6EAEE' }, // argento freddo
    { nome: 'Oro',      simbolo: '🥇', file: 'rank-oro.png',      colorBase: '#B8860B', colorAccent: '#FFD700' }, // oro brillante
    { nome: 'Platino',  simbolo: '💠', file: 'rank-platino.png',  colorBase: '#1ABC9C', colorAccent: '#5FE0CC' }, // platino-turchese
    { nome: 'Diamante', simbolo: '💎', file: 'rank-diamante.png', colorBase: '#1E5FFF', colorAccent: '#5B9DFF' }, // blu diamante saturo
    { nome: 'Maestro',  simbolo: '👑', file: 'rank-maestro.png',  colorBase: '#9B1B1B', colorAccent: '#E74C3C' }, // rosso apicale
  ];
  const RANKED_INDICE_MAESTRO = 24;  // sublevelIndice del livello apicale

  // — Helper: HTML del simbolo del rank (immagine assets/ con fallback emoji) —
  // Accetta un oggetto lega oppure un indice 0..6. Se l'immagine
  // assets/rank-<nome>.png esiste, viene usata; altrimenti si vede l'emoji.
  // Le pagine usano sempre questo helper così rank e statistiche sono coerenti.
  function rankedSimboloHTML(legaOrIndex) {
    const lega = (typeof legaOrIndex === 'number')
      ? RANKED_LEGHE[Math.max(0, Math.min(RANKED_LEGHE.length - 1, legaOrIndex))]
      : legaOrIndex;
    if (!lega) return '';
    return `<span class="rank-sym" title="${lega.nome}">`
         + `<img src="assets/${lega.file}" alt="" draggable="false" `
         + `onerror="this.parentNode.classList.add('rank-sym-fallback');this.remove();">`
         + `<span class="rank-sym-emoji">${lega.simbolo}</span>`
         + `</span>`;
  }

  // — Mix cluster [nuovi, review, consolidati] per indice di lega 0..6 —
  //   Salendo di lega: i NUOVI crescono, REVIEW e CONSOLIDATI calano.
  //   La quota CONSOLIDATI ("già appresi") cala ma NON arriva mai a 0: resta
  //   sempre una piccola percentuale di ricomparsa anti-oblio (min 5%), così
  //   i quiz padroneggiati tornano ogni tanto e non vengono dimenticati.
  const RANKED_MIX_LEGA = [
    [0.30, 0.55, 0.15],   // Rame
    [0.40, 0.45, 0.15],   // Bronzo
    [0.54, 0.34, 0.12],   // Argento
    [0.62, 0.28, 0.10],   // Oro
    [0.71, 0.21, 0.08],   // Platino
    [0.81, 0.13, 0.06],   // Diamante
    [0.86, 0.09, 0.05],   // Maestro
  ];

  // — Helpers storage —
  function rankedCaricaProfilo() { return caricaDaStorage(SK_RANKED_PROFILO); }
  function rankedSalvaProfilo(p) { salvaInStorage(SK_RANKED_PROFILO, p); }
  function rankedCaricaStato()   {
    const s = caricaDaStorage(SK_RANKED_STATO);
    if (s) return s;
    return {
      rp: 0,
      sublevelIndice: 0,             // Rame 4
      picco: { sublevelIndice: 0, data: oggiISO() },
      streak: 0,                     // giorni consecutivi obiettivo completato
      ultimoGiornoChiuso: null,      // 'YYYY-MM-DD' dell'ultimo rollover applicato
      ultimoGiornoAttivo: null,      // 'YYYY-MM-DD' della più recente risposta ranked
    };
  }
  function rankedSalvaStato(s) { salvaInStorage(SK_RANKED_STATO, s); }
  function rankedCaricaDaily() { return caricaDaStorage(SK_RANKED_DAILY) || {}; }
  function rankedSalvaDaily(d) { salvaInStorage(SK_RANKED_DAILY, d); }

  // — Preset dimensione round —
  const RANKED_DIMENSIONI_ROUND = [10, 25, 50, 100];
  const RANKED_DIM_ROUND_DEFAULT = 25;

  // — Inizializza profilo Ranked alla prima apertura —
  function rankedAssicuraProfilo() {
    let p = rankedCaricaProfilo();
    let modificato = false;
    if (!p) {
      // Profilo nuovo: la pagina di introduzione va mostrata
      p = {
        attivato: true,
        dataAttivazione: oggiISO(),
        dimensioneRound: RANKED_DIM_ROUND_DEFAULT,
        introVista: false,
      };
      modificato = true;
    }
    if (p.dimensioneRound === undefined) {
      p.dimensioneRound = RANKED_DIM_ROUND_DEFAULT;
      modificato = true;
    }
    // Profili già esistenti (creati prima della pagina intro): la saltano
    if (p.introVista === undefined) {
      p.introVista = true;
      modificato = true;
    }
    if (modificato) rankedSalvaProfilo(p);
    return p;
  }

  // ═══════ PG "tifosi" — personaggi affiancati ai titoli ═══════
  // 4 PG che fanno il tifo accanto al titolo, con vignette (fumetti)
  // che compaiono ogni tanto. Immagini attese: assets/pg-1..4.png
  // (PNG trasparenti). Se un file manca, quel PG sparisce in silenzio.

  function _pgTifosiHTML(ctx) {
    // Prefisso file diverso per sezione:
    //   ranked    → assets/pg-ranked-1..4.png
    //   progressi → assets/pg-progressi-1..4.png
    const prefix = (ctx === 'progressi') ? 'pg-progressi' : 'pg-ranked';
    let units = '';
    for (let i = 1; i <= 4; i++) {
      units += '<div class="pgt-unit" data-pg-idx="' + i + '">'
        + '<div class="pgt-bubble"></div>'
        + '<img class="pgt-img" src="assets/' + prefix + '-' + i + '.png" alt="" draggable="false" '
        + 'onerror="this.closest(\'.pgt-unit\').remove()">'
        + '</div>';
    }
    return '<div class="pg-tifosi" data-pg-ctx="' + ctx + '">' + units + '</div>';
  }

  // Frasi PER personaggio (indice 1..4). Ogni PG ha la sua personalità.
  const _PG_FRASI = {
    progressi: {
      1: [  // 😇 angelo — incoraggiante, positivo, dolce
        'Bravissimo! ✨', 'Sei fortissimo 💖', 'Continua così, ce la fai!',
        'Sono fiero di te 🥺', 'Che progressi splendidi!', 'Numeri da paura ⭐',
        'Vai così, campione!', 'Cresciuto tantissimo 🌱',
      ],
      2: [  // 😈 diavolo — sarcastico, malevolo, provocatorio
        'Pff, tutto qui? 😈', 'Hmpf, ho visto di meglio 🙄', 'Potresti spingere di più…',
        'Davvero ti accontenti? 😏', 'Mah… continua pure 🤨', 'Sei sicuro che basti?',
        'Lo dico per il tuo bene… 😏', 'Aspetta, è tutto qui?',
      ],
      3: [  // 📊 analista — neutro, fattuale, dati
        'I dati confermano la crescita 📊', 'Trend positivo ✓', 'Curva in salita, bene',
        'Statisticamente, miglioramento netto', 'Numeri coerenti col piano',
      ],
      4: [  // 🚀 hype coach — energico, motivatore
        'DAJE! 🚀', 'SPACCAAAA!', 'A tutto gas! ⚡', 'Sei un missile!',
        'PUSH PUSH PUSH! 🔥', 'Caricato a mille! 💥',
      ],
    },
    ranked: {
      1: ['Vai così! 🔥', 'Avanti tutta! ⚡', 'Sei in palla!', 'Spacca tutto!'],
      2: ['Scala la vetta! ⛰', 'Fino a Maestro! 👑', 'Non ti fermare!', 'Quel rank è tuo!'],
      3: ['+10 RP in arrivo!', 'Promozione vista 📈', 'Mira al picco!', 'Punti rank facili 💰'],
      4: ['Forza! 💪', 'Sei una bestia ⚔', 'Eccolo, il campione!', 'PER LA GLORIA!'],
    },
    _def: ['Forza! 💪', 'Grande!', 'Vai! 🔥'],
  };

  function _pgMostraVignetta(unit) {
    if (!unit) return;
    const riga = unit.closest('.pg-tifosi');
    const ctx  = (riga && riga.dataset.pgCtx) || '_def';
    const idx  = parseInt(unit.dataset.pgIdx, 10) || 1;
    // Seleziona la lista frasi dedicata a QUESTO PG (indice 1..4)
    const ctxObj = _PG_FRASI[ctx];
    let lista;
    if (ctxObj && typeof ctxObj === 'object' && !Array.isArray(ctxObj)) {
      lista = ctxObj[idx] || ctxObj[1] || _PG_FRASI._def;
    } else {
      lista = ctxObj || _PG_FRASI._def;
    }
    const bubble = unit.querySelector('.pgt-bubble');
    if (bubble) {
      bubble.textContent = lista[Math.floor(Math.random() * lista.length)];
      bubble.classList.add('pgt-bubble-on');
      clearTimeout(bubble._pgT);
      bubble._pgT = setTimeout(() => bubble.classList.remove('pgt-bubble-on'), 3200);
    }
    // Nessun movimento del PG: restano fermi e ben definiti
  }

  function avviaPgTifosi() {
    if (window._pgTifosiAvviato) return;
    window._pgTifosiAvviato = true;
    // Click su un PG → vignetta immediata
    document.addEventListener('click', e => {
      const img = e.target.closest && e.target.closest('.pgt-img');
      if (img) _pgMostraVignetta(img.closest('.pgt-unit'));
    });
    // Vignette automatiche "ogni tanto" (intervallo casuale 5-12 s)
    function tick() {
      const righe = document.querySelectorAll('.pg-tifosi');
      if (righe.length) {
        const riga  = righe[Math.floor(Math.random() * righe.length)];
        const units = riga.querySelectorAll('.pgt-unit');
        if (units.length) _pgMostraVignetta(units[Math.floor(Math.random() * units.length)]);
      }
      setTimeout(tick, 5000 + Math.random() * 7000);
    }
    setTimeout(tick, 3500);
  }

  // — Conversione sublevelIndice → {lega, sub, etichetta, lookups} —
  function rankedDescriviLivello(sublevelIndice) {
    if (sublevelIndice >= RANKED_INDICE_MAESTRO) {
      const m = RANKED_LEGHE[RANKED_LEGHE.length - 1];
      return {
        sublevelIndice: RANKED_INDICE_MAESTRO,
        lega: m,
        legaIndice: RANKED_LEGHE.length - 1,
        sub: null,
        etichetta: m.nome,
        etichettaBreve: 'M',
        isApice: true,
      };
    }
    const legaIndice = Math.floor(sublevelIndice / 4);
    const sub = 4 - (sublevelIndice % 4);   // 4..1
    const lega = RANKED_LEGHE[legaIndice];
    return {
      sublevelIndice,
      lega,
      legaIndice,
      sub,
      etichetta: `${lega.nome} ${sub}`,
      etichettaBreve: lega.nome.charAt(0) + sub,
      isApice: false,
    };
  }

  // — Valore RP per risposta nella lega di un dato sotto-livello —
  //   Se omesso, usa la lega corrente dello stato salvato.
  function rankedValoriRP(sublevelIndice) {
    if (sublevelIndice === undefined) {
      sublevelIndice = rankedCaricaStato().sublevelIndice;
    }
    const liv = rankedDescriviLivello(sublevelIndice);
    return RANKED_VALORI_RP[liv.legaIndice] || RANKED_VALORI_RP[0];
  }

  // — Floor di retrocessione: nessuna protezione, si può scendere fino a Rame 4.
  //   (Versione v0.7: rimosso il paracadute Oro su richiesta utente.)
  function rankedFloorIndex(_sublevelIndice) {
    return 0;
  }

  // ─── Helper curva di costo progressiva ──────────────────────────────────
  // Costo (in RP) per promuovere da un dato sub al successivo.
  // Per sub apicali oltre l'ultimo indice, ritorna il fallback flat (sicurezza).
  function rankedCostoProssimo(sublevelIndice) {
    if (sublevelIndice < 0) sublevelIndice = 0;
    if (sublevelIndice >= RANKED_COSTI_SUB.length) return RANKED_RP_PER_SUB;
    return RANKED_COSTI_SUB[sublevelIndice];
  }

  // Costo cumulativo per arrivare ESATTAMENTE all'inizio di sublevelIndice
  // (cioè con rp=0 in quel sub). Per sub 0 = 0. Per Maestro (24) = somma di tutti.
  function rankedCostoCumulativo(sublevelIndice) {
    let tot = 0;
    const limite = Math.min(sublevelIndice, RANKED_COSTI_SUB.length);
    for (let i = 0; i < limite; i++) tot += RANKED_COSTI_SUB[i];
    return tot;
  }

  // Converte un totale di RP cumulativo in {sublevelIndice, rp} sotto la nuova curva.
  // Usato dalla migrazione (one-shot) e da operazioni di ricalcolo.
  // Supporta totali negativi: restano nel sub 0 con rp negativo (poi clampato).
  function rankedDaCumulativoARank(totaleRP) {
    let rimanente = totaleRP;
    let sub = 0;
    while (sub < RANKED_INDICE_MAESTRO && rimanente >= RANKED_COSTI_SUB[sub]) {
      rimanente -= RANKED_COSTI_SUB[sub];
      sub++;
    }
    // Se è arrivato a Maestro, eventuali RP eccedenti vengono buttati (apice)
    if (sub >= RANKED_INDICE_MAESTRO) {
      return { sublevelIndice: RANKED_INDICE_MAESTRO, rp: 0 };
    }
    return { sublevelIndice: sub, rp: Math.round(rimanente) };
  }

  // Debt floor dinamico per il sub corrente (fraz × costo del sub).
  function rankedDebitoMax(sublevelIndice) {
    return Math.round(rankedCostoProssimo(sublevelIndice) * RANKED_DEBITO_FRAZ);
  }

  // Paracadute dinamico al sub di destinazione dopo retrocessione.
  function rankedParacadute(sublevelIndice) {
    return Math.round(rankedCostoProssimo(sublevelIndice) * RANKED_PARACADUTE_FRAZ);
  }

  // ─── Migrazione one-shot del rank (vecchio sistema flat → nuova curva) ───
  // Si attiva al primo render della home Ranked SE lo stato non ha _schemaVer
  // oppure ha _schemaVer < RANKED_SCHEMA_VERSION (2).
  //
  // Strategia:
  //   - oldTotale = oldSublevelIndice * 100 + oldRp  (cumulativo sistema flat)
  //   - newState  = rankedDaCumulativoARank(oldTotale) (sulla nuova curva)
  //   - picco ricalcolato analogamente (resta consistente con la nuova curva)
  //
  // Salva _schemaVer = RANKED_SCHEMA_VERSION così non riapplica.
  // Ritorna info sulla migrazione (per banner UI) oppure null se non c'è stato bisogno.
  function rankedMigraStato() {
    const s = rankedCaricaStato();
    const verCorrente = s._schemaVer || 1;
    if (verCorrente >= RANKED_SCHEMA_VERSION) return null;

    // Stato di partenza
    const oldSub = s.sublevelIndice || 0;
    const oldRp  = s.rp || 0;
    const oldTotale = oldSub * 100 + oldRp;   // sistema vecchio flat
    const livelloPrima = rankedDescriviLivello(oldSub);

    // Ridistribuzione sulla nuova curva
    const nuovo = rankedDaCumulativoARank(oldTotale);
    s.sublevelIndice = nuovo.sublevelIndice;
    s.rp = nuovo.rp;

    // Applico il debt floor dinamico (nel caso oldTotale fosse molto negativo)
    const debitoMax = rankedDebitoMax(s.sublevelIndice);
    if (s.rp < -debitoMax) s.rp = -debitoMax;

    // Picco: stessa logica. Se non c'è picco salvato, uso il nuovo sublevelIndice.
    if (s.picco && typeof s.picco.sublevelIndice === 'number') {
      const oldPiccoTotale = s.picco.sublevelIndice * 100;
      const nuovoPicco = rankedDaCumulativoARank(oldPiccoTotale);
      // Il picco non può essere sotto il rank attuale (matematicamente non capita
      // se non per quirks; safety).
      if (nuovoPicco.sublevelIndice < s.sublevelIndice) {
        nuovoPicco.sublevelIndice = s.sublevelIndice;
      }
      s.picco.sublevelIndice = nuovoPicco.sublevelIndice;
      // Conservo la data del picco originale
    } else {
      s.picco = { sublevelIndice: s.sublevelIndice, data: oggiISO() };
    }

    s._schemaVer = RANKED_SCHEMA_VERSION;
    rankedSalvaStato(s);

    const livelloDopo = rankedDescriviLivello(s.sublevelIndice);
    return {
      livelloPrima,
      livelloDopo,
      oldTotale,
      nuovoRp: s.rp,
      costoProssimo: rankedCostoProssimo(s.sublevelIndice),
    };
  }

  // — Calcola rank visualizzazione (corrente + prossimo + % barra) —
  //   Include `costoProssimo` (RP necessari per il prossimo sub) così la UI può
  //   mostrare X/Y RP coerente con la curva progressiva del sub corrente.
  function rankedCalcolaRank() {
    const s = rankedCaricaStato();
    const corrente = rankedDescriviLivello(s.sublevelIndice);
    const prossimo = corrente.isApice ? null : rankedDescriviLivello(s.sublevelIndice + 1);
    const picco = rankedDescriviLivello(s.picco.sublevelIndice);
    const costoProssimo = corrente.isApice ? 0 : rankedCostoProssimo(s.sublevelIndice);
    const perc = corrente.isApice
      ? 100
      : (costoProssimo > 0 ? Math.max(0, Math.min(100, (s.rp / costoProssimo) * 100)) : 0);
    return { corrente, prossimo, picco, percInterno: perc, rp: s.rp, costoProssimo };
  }

  // — Applica delta RP allo stato, con eventuali promozione/retrocessione —
  // Ritorna { transizione, livelloPrima, livelloDopo, rpDopo, deltaEffettivo }
  //
  // CURVA PROGRESSIVA:
  //   - Promozione: avviene quando rp ≥ rankedCostoProssimo(sub corrente).
  //     I costi crescono dentro la lega (×1.0/1.3/1.7/2.2) e tra leghe.
  //   - Paracadute (post-retrocessione): rp = 80% del costo del nuovo sub.
  //   - Debt floor (al fondo della lega protetta): rp ≥ -50% del costo del sub.
  //
  // deltaEffettivo = variazione reale di "RP assoluto" (costo cumulativo + rp).
  // I contatori giornalieri usano questo valore così "RP oggi" coincide sempre
  // col movimento reale del rank.
  //
  // Retrocessione: la caduta si ferma a rankedFloorIndex() — fino a Oro non si
  // cambia lega (solo sotto-livelli interni), da Platino in su si può tornare
  // indietro fino a Oro 4. Al floor l'RP può andare in piccolo "debito"
  // (negativo, limitato): così il risultato non dipende dall'ordine delle risposte.
  function rankedApplicaRP(delta, opts) {
    opts = opts || {};
    const s = rankedCaricaStato();
    const livelloPrima = rankedDescriviLivello(s.sublevelIndice);
    const assolutoPrima = rankedCostoCumulativo(s.sublevelIndice) + s.rp;
    s.rp += delta;

    let transizione = null;

    // Promozione (anche multipla se delta molto positivo).
    // Leggo il costo corrente DENTRO il loop perché cambia ad ogni sub.
    let costoCorr;
    while (s.sublevelIndice < RANKED_INDICE_MAESTRO &&
           s.rp >= (costoCorr = rankedCostoProssimo(s.sublevelIndice))) {
      s.rp -= costoCorr;
      s.sublevelIndice++;
      transizione = 'promozione';
      if (s.sublevelIndice > s.picco.sublevelIndice) {
        s.picco = { sublevelIndice: s.sublevelIndice, data: oggiISO() };
      }
      if (s.sublevelIndice === RANKED_INDICE_MAESTRO) {
        s.rp = 0;
        break;
      }
    }

    // Retrocessione (paracadute dinamico) — fino al floor consentito.
    while (s.rp < 0 && s.sublevelIndice > rankedFloorIndex(s.sublevelIndice)) {
      s.sublevelIndice--;
      s.rp = rankedParacadute(s.sublevelIndice);
      transizione = 'retrocessione';
    }

    // Maestro: rp fisso a 0
    if (s.sublevelIndice === RANKED_INDICE_MAESTRO) s.rp = 0;

    // Al floor: l'RP può restare negativo (debito) ma con un limite dinamico.
    const debitoMax = rankedDebitoMax(s.sublevelIndice);
    if (s.rp < -debitoMax) s.rp = -debitoMax;

    rankedSalvaStato(s);
    const assolutoDopo = rankedCostoCumulativo(s.sublevelIndice) + s.rp;
    return {
      transizione,
      livelloPrima,
      livelloDopo: rankedDescriviLivello(s.sublevelIndice),
      rpDopo: s.rp,
      deltaEffettivo: assolutoDopo - assolutoPrima,
    };
  }

  // — Versione PURA di rankedApplicaRP: opera su uno stato passato, niente I/O.
  //   Usata dalla propagazione cross-save per applicare RP a un save diverso
  //   da quello attivo senza dover commutare il save corrente.
  //   Ritorna { statoNuovo, transizione, livelloPrima, livelloDopo,
  //            deltaEffettivo, rpDopo }.
  function rankedApplicaRPSuStato(stato, delta) {
    // Clono lo stato in input (input immutabile)
    const s = {
      rp: stato.rp || 0,
      sublevelIndice: stato.sublevelIndice || 0,
      picco: stato.picco
        ? { sublevelIndice: stato.picco.sublevelIndice || 0, data: stato.picco.data || oggiISO() }
        : { sublevelIndice: stato.sublevelIndice || 0, data: oggiISO() },
      streak: stato.streak || 0,
      ultimoGiornoChiuso: stato.ultimoGiornoChiuso || null,
      ultimoGiornoAttivo: stato.ultimoGiornoAttivo || null,
    };
    const livelloPrima = rankedDescriviLivello(s.sublevelIndice);
    const assolutoPrima = rankedCostoCumulativo(s.sublevelIndice) + s.rp;
    s.rp += delta;
    let transizione = null;

    let costoCorr;
    while (s.sublevelIndice < RANKED_INDICE_MAESTRO &&
           s.rp >= (costoCorr = rankedCostoProssimo(s.sublevelIndice))) {
      s.rp -= costoCorr;
      s.sublevelIndice++;
      transizione = 'promozione';
      if (s.sublevelIndice > s.picco.sublevelIndice) {
        s.picco = { sublevelIndice: s.sublevelIndice, data: oggiISO() };
      }
      if (s.sublevelIndice === RANKED_INDICE_MAESTRO) { s.rp = 0; break; }
    }
    while (s.rp < 0 && s.sublevelIndice > rankedFloorIndex(s.sublevelIndice)) {
      s.sublevelIndice--;
      s.rp = rankedParacadute(s.sublevelIndice);
      transizione = 'retrocessione';
    }
    if (s.sublevelIndice === RANKED_INDICE_MAESTRO) s.rp = 0;
    const debitoMax = rankedDebitoMax(s.sublevelIndice);
    if (s.rp < -debitoMax) s.rp = -debitoMax;

    const assolutoDopo = rankedCostoCumulativo(s.sublevelIndice) + s.rp;
    return {
      statoNuovo: s,
      transizione,
      livelloPrima,
      livelloDopo: rankedDescriviLivello(s.sublevelIndice),
      rpDopo: s.rp,
      deltaEffettivo: assolutoDopo - assolutoPrima,
    };
  }

  // — Transizione di rank "in attesa" di essere mostrata come banner in home —
  //   Impostata a fine round, consumata (one-shot) al primo render della home.
  let _rankedTransizionePending = null;
  function rankedSalvaTransizionePending(t) { _rankedTransizionePending = t; }
  function rankedLeggiTransizionePending() {
    const t = _rankedTransizionePending;
    _rankedTransizionePending = null;
    return t;
  }

  // — Daily Ranked: legge/crea record di oggi —
  function rankedGetDaily(dataISO) {
    dataISO = dataISO || oggiISO();
    const d = rankedCaricaDaily();
    if (!d[dataISO]) {
      d[dataISO] = {
        target: rankedCalcolaTargetOggi(),
        fatti: 0, corrette: 0, errate: 0,
        rpDelta: { base: 0, bonus: 0, penalita: 0, decay: 0, totale: 0 },
        completato: false,
        chiuso: false,
      };
      rankedSalvaDaily(d);
    }
    return d[dataISO];
  }
  function rankedAggiornaDaily(updater) {
    const dataISO = oggiISO();
    const d = rankedCaricaDaily();
    if (!d[dataISO]) {
      d[dataISO] = {
        target: rankedCalcolaTargetOggi(),
        fatti: 0, corrette: 0, errate: 0,
        rpDelta: { base: 0, bonus: 0, penalita: 0, decay: 0, totale: 0 },
        completato: false, chiuso: false,
      };
    }
    updater(d[dataISO]);
    rankedSalvaDaily(d);
    return d[dataISO];
  }

  // — Conta i quiz UNICI del PIANO del save attivo (materie + arg esclusi) —
  //   Il target deve basarsi su ciò che l'utente studia davvero, non sull'intero
  //   bundle (che con 15 materie gonfia il numero in modo irrealistico).
  function rankedPianoUnici() {
    if (!STATE.pacchetto) return 0;
    const filtro = (window.SavesCore && SavesCore.getFiltroPianoAttivo)
                    ? SavesCore.getFiltroPianoAttivo() : null;
    const ids = new Set();
    for (const m of STATE.pacchetto.manifest.moduli) {
      if (filtro && filtro.materieAmmesse && !filtro.materieAmmesse.has(m.materia_id)) continue;
      const banca = STATE.pacchetto.banche[m.materia_id];
      if (!banca) continue;
      const arr = banca.categorizzati || banca.quiz || [];
      for (const q of arr) {
        const argId = q.categorizzazione && q.categorizzazione.argomento_id;
        if (filtro && !filtro.quizPassa(m.materia_id, argId)) continue;
        ids.add(quizId(q));
      }
    }
    return ids.size;
  }

  // — Info target giornaliero (fonte UNICA per home + statistiche) —
  //   { target, pianoUnici, giorniRes, dataProva, giorniBase }
  function rankedTargetInfo() {
    const pianoUnici = rankedPianoUnici();
    const dataProva = caricaDaStorage(SK_DATA_PROVA);
    if (!STATE.pacchetto) return { target: 0, pianoUnici, giorniRes: 0, dataProva: null, giorniBase: 'nessun pacchetto' };
    if (!dataProva) {
      return { target: 100, pianoUnici, giorniRes: null, dataProva: null, giorniBase: 'data prova non impostata' };
    }
    const profiloCar = carCaricaProfilo ? carCaricaProfilo() : null;
    const giorniSet  = (profiloCar && profiloCar.giorniSettimana && profiloCar.giorniSettimana.length)
      ? profiloCar.giorniSettimana
      : ['dom','lun','mar','mer','gio','ven','sab'];
    const giorniRes = carCalcolaGiorniStudio(dataProva, giorniSet);
    if (giorniRes <= 0) {
      return { target: Math.max(50, Math.ceil(pianoUnici / 30)), pianoUnici, giorniRes: 0, dataProva, giorniBase: 'pre-prova' };
    }
    return {
      target: Math.max(20, Math.ceil(pianoUnici / giorniRes)),
      pianoUnici, giorniRes, dataProva, giorniBase: 'giorni di studio',
    };
  }

  // — Calcola target di quiz/die (basato sul PIANO del save attivo) —
  function rankedCalcolaTargetOggi() {
    return rankedTargetInfo().target;
  }

  // — Rollover: alla prima apertura della giornata, chiude i giorni precedenti
  //   aperti, applica bonus/penalità + decay inattività —
  //
  // NB importanti:
  //  • STREAK = giorni consecutivi con almeno 1 quiz risposto (modello Duolingo).
  //    Prima richiedeva obiettivo COMPLETATO al 100% e restava quasi sempre a 0.
  //  • Lo stato si LEGGE FRESH alla fine, dopo che rankedApplicaRP ha aggiornato
  //    rp/sublevelIndice. Così non sovrascriviamo i bonus appena applicati col
  //    valore in memoria letto a inizio rollover (bug precedente).
  function rankedRollover() {
    const oggi  = oggiISO();
    const daily = rankedCaricaDaily();
    const giorniDailyOrdinati = Object.keys(daily).filter(k => k < oggi).sort();

    // Streak corrente come accumulatore locale (sarà persistito alla fine)
    let streakCorrente = (rankedCaricaStato().streak) || 0;
    let qualcosaScritto = false;

    for (const data of giorniDailyOrdinati) {
      const rec = daily[data];
      if (rec.chiuso) continue;

      const target = rec.target || 0;
      const fatti  = rec.fatti  || 0;
      const attivo = fatti > 0;            // ← criterio "Duolingo": almeno 1 quiz
      const completato = target > 0 ? (fatti >= target) : false;

      // Streak: cresce con l'attività, si azzera se la giornata è stata vuota
      if (attivo) streakCorrente += 1;
      else        streakCorrente  = 0;

      // Bonus obiettivo + bonus streak ≥3 (resta legato a obiettivo completato)
      let bonus = 0;
      if (completato) {
        bonus += RANKED_RP_BONUS_OBIETTIVO;
        if (streakCorrente >= 3) bonus += RANKED_RP_BONUS_STREAK_DIE;
      }

      // Penalità incompletezza: solo se sotto soglia tolleranza
      let penalita = 0;
      if (target > 0) {
        const soglia = Math.floor(target * RANKED_SOGLIA_TOLLERANZA);
        if (fatti < soglia) {
          const mancanti = soglia - fatti;
          penalita = mancanti * RANKED_RP_PENALITA_PER_MISS;
        }
      }

      rec.completato = completato;
      rec.rpDelta.bonus    = bonus;
      rec.rpDelta.penalita = penalita;
      rec.rpDelta.totale   = (rec.rpDelta.base || 0) + bonus + penalita + (rec.rpDelta.decay || 0);
      rec.chiuso = true;

      const deltaNetto = bonus + penalita;
      if (deltaNetto !== 0) rankedApplicaRP(deltaNetto);

      qualcosaScritto = true;
    }

    // Decay per inattività: calcolato sui giorni tra ultimo attivo e oggi (esclusi)
    const statoPerDecay = rankedCaricaStato();
    if (statoPerDecay.ultimoGiornoAttivo && statoPerDecay.ultimoGiornoAttivo < oggi) {
      const ultima = new Date(statoPerDecay.ultimoGiornoAttivo);
      const adesso = new Date(oggi);
      const giorniStop = Math.floor((adesso - ultima) / (1000 * 60 * 60 * 24));
      if (giorniStop > RANKED_DECAY_DOPO_GIORNI) {
        const giorniDecay = giorniStop - RANKED_DECAY_DOPO_GIORNI;
        let decay = giorniDecay * RANKED_DECAY_RP_DIE;
        if (decay < RANKED_DECAY_CAP) decay = RANKED_DECAY_CAP;
        rankedApplicaRP(decay);
        rankedAggiornaDaily(d => { d.rpDelta.decay = (d.rpDelta.decay || 0) + decay; d.rpDelta.totale += decay; });
        // Pulisco ultimoGiornoAttivo per non riapplicare il decay
        const s2 = rankedCaricaStato();
        s2.ultimoGiornoAttivo = oggi;
        rankedSalvaStato(s2);
        qualcosaScritto = true;
      }
    }

    if (qualcosaScritto) {
      // RICARICO FRESH lo stato (per preservare rp/sublevelIndice modificati da
      // rankedApplicaRP) e aggiorno solo streak + ultimoGiornoChiuso.
      const stato = rankedCaricaStato();
      stato.streak = streakCorrente;
      stato.ultimoGiornoChiuso = oggi;
      rankedSalvaStato(stato);
      rankedSalvaDaily(daily);
    }
  }

  // — Mix attuale di cluster in base alla lega corrente —
  function rankedMixCorrente() {
    const r = rankedCalcolaRank();
    return RANKED_MIX_LEGA[r.corrente.legaIndice] || RANKED_MIX_LEGA[0];
  }

  // — Filtra le risposte del diario marcate come ranked —
  function rankedRisposteDelGiorno(dataISO) {
    dataISO = dataISO || oggiISO();
    const diario = carCaricaDiario();
    const day = diario[dataISO];
    if (!day || !day.risposte) return [];
    return day.risposte.filter(r => r.mode === 'ranked');
  }

  // — Materie deboli (acc < 60% negli ultimi 7gg di risposte ranked) —
  function rankedMaterieDeboli(soglia, giorni) {
    soglia = (soglia === undefined) ? 0.60 : soglia;
    giorni = (giorni === undefined) ? 7 : giorni;
    const stat = {};  // materia_id → {ok, ko}
    const diario = carCaricaDiario();
    const oggi = new Date(oggiISO());
    for (let i = 0; i < giorni; i++) {
      const d = new Date(oggi);
      d.setDate(d.getDate() - i);
      const data = d.toISOString().substring(0, 10);
      const day = diario[data];
      if (!day || !day.risposte) continue;
      for (const r of day.risposte) {
        if (r.mode !== 'ranked') continue;
        const m = r.materia_id || '?';
        if (!stat[m]) stat[m] = { ok: 0, ko: 0 };
        if (r.corretta) stat[m].ok++; else stat[m].ko++;
      }
    }
    const out = [];
    for (const [m, s] of Object.entries(stat)) {
      const tot = s.ok + s.ko;
      if (tot < 10) continue;  // ignora materie con campione troppo piccolo
      const acc = s.ok / tot;
      if (acc < soglia) out.push({ materia_id: m, tot, accuratezza: acc, ok: s.ok, ko: s.ko });
    }
    out.sort((a, b) => a.accuratezza - b.accuratezza);
    return out;
  }

  // — Stat ultimi N giorni (per home + analisi) —
  function rankedStatPeriodo(giorni) {
    const oggi = new Date(oggiISO());
    const daily = rankedCaricaDaily();
    const out = { fatti: 0, corrette: 0, errate: 0, giorniAttivi: 0, target: 0, rpDelta: 0, completati: 0 };
    for (let i = 0; i < giorni; i++) {
      const d = new Date(oggi);
      d.setDate(d.getDate() - i);
      const data = d.toISOString().substring(0, 10);
      const rec = daily[data];
      if (!rec) continue;
      if (rec.fatti > 0) out.giorniAttivi++;
      out.fatti    += rec.fatti    || 0;
      out.corrette += rec.corrette || 0;
      out.errate   += rec.errate   || 0;
      out.target   += rec.target   || 0;
      out.rpDelta  += (rec.rpDelta && rec.rpDelta.totale) || 0;
      if (rec.completato) out.completati++;
    }
    const denomReale = out.corrette + out.errate;
    out.accuratezza = denomReale > 0 ? (out.corrette / denomReale) : 0;
    return out;
  }

  // — Reset modalità ranked (azzera tutto, conserva diario+padron) —
  function rankedReset() {
    localStorage.removeItem(SK_RANKED_PROFILO);
    localStorage.removeItem(SK_RANKED_STATO);
    localStorage.removeItem(SK_RANKED_DAILY);
  }

  // Expose alcune funzioni per debug/console
  window._rankedDebug = {
    stato:    rankedCaricaStato,
    daily:    rankedCaricaDaily,
    rollover: rankedRollover,
    reset:    rankedReset,
    rank:     rankedCalcolaRank,
  };
