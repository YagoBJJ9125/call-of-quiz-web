  // ═══════════════════════════════════════════════════════
  // CARRIERA CORE — Costanti, rank, storage, helpers base
  // ═══════════════════════════════════════════════════════

  // — Storage keys Carriera —
  const SK_CAR_PROFILO      = 'cm:carriera:profilo';
  const SK_CAR_DIARIO       = 'cm:carriera:diario';
  const SK_CAR_PADRON       = 'cm:carriera:padroneggiati';
  const SK_CAR_XP           = 'cm:carriera:xp';
  const SK_CAR_MISSIONE_RUN = 'cm:carriera:missione_run';

  // — Livelli giornalieri —
  const CAR_LIVELLI = {
    easy:    { nome: 'Easy',    quizOra: 50,  mattina: 150, pomeriggio: 175, totaleDie: 325,  desc: 'Ritmo blando, bilanciato' },
    medium:  { nome: 'Medium',  quizOra: 70,  mattina: 210, pomeriggio: 245, totaleDie: 455,  desc: 'Standard di studio serio' },
    high:    { nome: 'High',    quizOra: 100, mattina: 300, pomeriggio: 350, totaleDie: 650,  desc: 'Full immersion' },
    extreme: { nome: 'Extreme', quizOra: 200, mattina: 600, pomeriggio: 700, totaleDie: 1300, desc: 'Modalità "disperato"' }
  };

  // — Preset copertura —
  const CAR_PRESET = {
    esplorativo: { nome: 'Esplorativo', mult: 1, criterio: 'visto_1',         desc: 'Vedere tutti i quiz unici almeno una volta' },
    solido:      { nome: 'Solido',      mult: 2, criterio: 'visto_2',         desc: 'Ogni quiz unico visto 2 volte in giorni diversi' },
    padronanza:  { nome: 'Padronanza',  mult: 3, criterio: 'padroneggiato_3', desc: 'Padroneggiare ogni quiz (3 risposte corrette in giorni diversi)' }
  };

  // — Rank —
  const CAR_RANK = [
    { soglia: 0,       nome: 'Assistente Apprendista',  desc: 'Si comincia' },
    { soglia: 2000,    nome: 'Assistente',              desc: 'Primi passi' },
    { soglia: 8000,    nome: 'Assistente Senior',       desc: 'Hai sostanza' },
    { soglia: 20000,   nome: 'Funzionario Apprendista', desc: 'Cresci bene' },
    { soglia: 50000,   nome: 'Funzionario',             desc: 'Esperto del campo' },
    { soglia: 100000,  nome: 'Funzionario Senior',      desc: 'Anima del concorso' },
    { soglia: 180000,  nome: 'Vice Dirigente',          desc: 'Quasi al top' },
    { soglia: 300000,  nome: 'Dirigente',               desc: 'Élite' },
    { soglia: 420000,  nome: 'Dirigente Generale',      desc: 'Eccellenza' },
    { soglia: Infinity, nome: 'Maestro del Concorso',   desc: 'Padronanza totale raggiunta', soloPadronanza: true }
  ];

  function calcolaRank(xp) {
    let padronanzaCompleta = false;
    try {
      if (STATE.pacchetto) {
        const tot    = carCalcolaTotaliPacchetto();
        const padron = carCaricaPadron();
        const nPadr  = Object.values(padron).filter(èPadroneggiato).length;
        padronanzaCompleta = (tot.unici > 0 && nPadr >= tot.unici);
      }
    } catch (e) { padronanzaCompleta = false; }

    const rankUsabili = CAR_RANK.filter(r => !r.soloPadronanza || padronanzaCompleta);

    let cur = rankUsabili[0], next = null;
    for (let i = 0; i < rankUsabili.length; i++) {
      if (rankUsabili[i].soloPadronanza && padronanzaCompleta) {
        cur  = rankUsabili[i];
        next = null;
        break;
      }
      if (xp >= rankUsabili[i].soglia) {
        cur  = rankUsabili[i];
        next = rankUsabili[i + 1] || null;
      }
    }

    let prog;
    if (!next || next.soglia === Infinity) {
      if (next && next.soloPadronanza) {
        try {
          const tot    = carCalcolaTotaliPacchetto();
          const padron = carCaricaPadron();
          const nPadr  = Object.values(padron).filter(èPadroneggiato).length;
          prog = tot.unici > 0 ? Math.min(100, (nPadr / tot.unici) * 100) : 0;
        } catch (e) { prog = 0; }
      } else {
        prog = 100;
      }
    } else {
      prog = Math.min(100, ((xp - cur.soglia) / (next.soglia - cur.soglia)) * 100);
    }
    return { corrente: cur, prossimo: next, percentuale: prog };
  }

  // — Migrazione profilo formato vecchio → nuovo (v2: quizOra/oreMattina/orePomeriggio + modalitaPiano) —
  function carMigraProfilo(p) {
    if (!p) return p;

    // Capacità (vecchio livello → nuovo modello esplicito)
    if (p.quizOra === undefined) {
      const liv = (typeof CAR_LIVELLI !== 'undefined' && p.livello && CAR_LIVELLI[p.livello])
        || (typeof CAR_LIVELLI !== 'undefined' && CAR_LIVELLI.medium)
        || null;
      if (liv) {
        p.quizOra       = liv.quizOra;
        p.oreMattina    = +(liv.mattina / liv.quizOra).toFixed(2);
        p.orePomeriggio = +(liv.pomeriggio / liv.quizOra).toFixed(2);
      } else {
        p.quizOra = 70; p.oreMattina = 3; p.orePomeriggio = 3.5;
      }
    }

    // Tipo piano (vecchio preset → nuovo modello modalitaPiano)
    if (p.modalitaPiano === undefined) {
      // Default safe per profili vecchi: pre-impostata (tutto il bando)
      p.modalitaPiano = 'preimpostata';
    }

    // Retrocompat per codice che legge ancora vecchi campi
    if (p.preset && !p.obiettivo)            p.obiettivo            = p.preset;
    if (p.livello && !p.livelloRiferimento)  p.livelloRiferimento   = p.livello;
    if (p.marginePerc === undefined)         p.marginePerc          = 0;

    return p;
  }

  // — Helpers storage Carriera —
  function carCaricaProfilo()  { return caricaDaStorage(SK_CAR_PROFILO); }
  function carSalvaProfilo(p)  { salvaInStorage(SK_CAR_PROFILO, p); }
  function carCaricaDiario()   { return caricaDaStorage(SK_CAR_DIARIO) || {}; }
  function carSalvaDiario(d)   { salvaInStorage(SK_CAR_DIARIO, d); }
  function carCaricaPadron()   {
    // Modello v0.7: { saldo, ultimoTs, ultimoCorretto, daRecupero, giorniCorretti(legacy) }
    // Migrazione automatica dal modello legacy giorniCorretti.length → saldo.
    const raw = caricaDaStorage(SK_CAR_PADRON) || {};
    let modificato = false;
    for (const id in raw) {
      const p = raw[id];
      if (p && typeof p === 'object' && typeof p.saldo !== 'number') {
        const gg = (p.giorniCorretti || []).length;
        p.saldo = Math.min(3, gg);     // approssimazione: cap a +3 (= padroneggiato)
        p.ultimoTs = p.ultimoTs || 0;
        p.ultimoCorretto = p.ultimoCorretto != null ? p.ultimoCorretto : (gg > 0);
        modificato = true;
      }
    }
    if (modificato) salvaInStorage(SK_CAR_PADRON, raw);
    return raw;
  }
  function carSalvaPadron(p)   { salvaInStorage(SK_CAR_PADRON, p); }

  // — Soglia padroneggiamento algebrico (v0.7) —
  //   Modello: saldo = somma corretti (+1 normale, +2 se recupero) − errati (−1).
  //   Padroneggiato quando saldo ≥ 3. Se sbagliato dopo, saldo scende e il
  //   quiz torna nella rotazione normale.
  const PADRON_SOGLIA = 3;
  function èPadroneggiato(p) {
    if (!p) return false;
    if (typeof p.saldo === 'number') return p.saldo >= PADRON_SOGLIA;
    // fallback su modello legacy se per qualche motivo non migrato
    return (p.giorniCorretti || []).length >= PADRON_SOGLIA;
  }

  // — Aggiorna padron per una risposta: si occupa anche del bonus recupero —
  //   eraInRecupero = true: il quiz era negli "errori da recuperare" (ultimo
  //   esito errato), quindi una risposta corretta vale +2 (annulla l'errore +
  //   premia il recupero). Una risposta errata in recupero vale comunque −1.
  //   Idempotente: NON deduplica per ts/sessione, accetta il chiamante.
  function carAggiornaPadron(quizId, corretta, eraInRecupero) {
    const padron = carCaricaPadron();
    const p = padron[quizId] || { saldo: 0, ultimoTs: 0, ultimoCorretto: false, daRecupero: false };
    if (corretta) {
      p.saldo += eraInRecupero ? 2 : 1;
    } else {
      p.saldo -= 1;
    }
    // Cap morbido: limito il saldo per evitare esplosioni numeriche
    if (p.saldo > 10)  p.saldo = 10;
    if (p.saldo < -5)  p.saldo = -5;
    p.ultimoTs = Date.now();
    p.ultimoCorretto = !!corretta;
    p.daRecupero = !corretta;       // se sbaglio → diventa errore "da recuperare"
    padron[quizId] = p;
    carSalvaPadron(padron);
    return p;
  }
  function carCaricaXP()       { return caricaDaStorage(SK_CAR_XP) || { totale: 0 }; }
  function carSalvaXP(x)       { salvaInStorage(SK_CAR_XP, x); }

  // — Peso materia (helper condiviso con Ranked) —
  // Priorità: pesiOverride del piano del save attivo (preset bando, vedi
  // bandi_catalogo.json) > peso globale di programma_studio.json > 5.
  function carPesoMateria(materiaId) {
    const save = (typeof SavesCore !== 'undefined') ? SavesCore.getSaveAttivo() : null;
    const override = save && save.piano && save.piano.pesiOverride && save.piano.pesiOverride[materiaId];
    if (typeof override === 'number') return override;
    if (!STATE.pacchetto || !STATE.pacchetto.programma) return 5;
    const mat = (STATE.pacchetto.programma.materie || []).find(m => m.id === materiaId);
    if (mat && typeof mat.peso === 'number') return mat.peso;
    if (mat && typeof mat.priorita === 'number') return mat.priorita;
    return 5;
  }

  function oggiISO() { return new Date().toISOString().substring(0, 10); }
  function dataITA(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // — Totali pacchetto (unici e totali) —
  function carCalcolaTotaliPacchetto() {
    if (!STATE.pacchetto) return { totali: 0, unici: 0 };
    let totali = 0;
    const idSet = new Set();
    for (const m of STATE.pacchetto.manifest.moduli) {
      const banca    = STATE.pacchetto.banche[m.materia_id];
      if (!banca) continue;
      const quizArr  = banca.categorizzati || banca.quiz || [];
      totali        += quizArr.length;
      for (const q of quizArr) idSet.add(quizId(q));
    }
    return { totali, unici: idSet.size };
  }

  // — Giorni di studio effettivi tra oggi e data prova —
  function carCalcolaGiorniStudio(dataProva, giorniSettimana) {
    if (!dataProva || !giorniSettimana || giorniSettimana.length === 0) return 0;
    const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    const fine = new Date(dataProva); fine.setHours(0, 0, 0, 0);
    if (fine <= oggi) return 0;
    const map = ['dom','lun','mar','mer','gio','ven','sab'];
    let n = 0;
    const d = new Date(oggi);
    while (d < fine) {
      if (giorniSettimana.includes(map[d.getDay()])) n++;
      d.setDate(d.getDate() + 1);
    }
    return n;
  }
