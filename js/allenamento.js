  // ═══════════════════════════════════════════════════════
  // ALLENAMENTO LIBERO (v2) — Tree picker + quick-launch per nodo
  // ═══════════════════════════════════════════════════════
  // Selettore ad albero (materia → argomento → legge → sotto-arg → articolo)
  // visivamente identico all'Analisi Quiz Materie. Due flussi:
  //  • Multi-select: spunta più nodi (checkbox) + config (n quiz, ordine,
  //    modalità feedback, pool) → "Avvia batteria mix"
  //  • Quick-launch: click ▶ su un singolo nodo → mini-dialog "Studio mirato"
  //    con opzione "salta padroneggiati" → batteria veloce su quel nodo
  // Le risposte vengono scritte nel diario condiviso (mode: 'libero') così
  // l'Analisi le vede; NON influenzano XP Carriera né RP Ranked.
  // ═══════════════════════════════════════════════════════

  // ─── Filtro quiz che richiedono immagini non disponibili ──────────────
  // Rileva quiz che nella domanda o nelle opzioni fanno riferimento a una
  // figura/immagine/grafico che l'app non può mostrare. Questi quiz vengono
  // esclusi da tutti i pool (Ranked + Libero) per evitare risposte impossibili.
  function quizRichiedeImmagine(quiz) {
    // Se il quiz HA le immagini, l'app le mostra: non va mai escluso.
    // (Le banche aggiornate includono le immagini dei quiz di logica; senza
    // questo check i quiz con figura venivano esclusi anche quando la figura
    // era disponibile, mentre i vecchi doppioni SENZA figura passavano.)
    if (Array.isArray(quiz.immagini) && quiz.immagini.length > 0) return false;
    // Domande che citano un'operazione mostrata solo in figura (residui della
    // vecchia banca senza immagini): senza numeri nel testo sono irrisolvibili.
    const dom = quiz.domanda || quiz.testo || '';
    if (/(?:della|la) seguente operazione[.:]?\s*$/i.test(dom.trim()) && !/\d/.test(dom)) return true;
    const PATTERN = [
      /nell['’\s]?immagin/i,
      /nella figura/i, /dalla figura/i, /osserva la figura/i, /vedi la figura/i,
      /in figura/i, /la figura (mostra|indica|rappresenta|di seguito|sotto|sopra|a lato)/i,
      /nel grafico/i, /dal grafico/i, /il grafico (mostra|indica|rappresenta)/i,
      /nel disegno/i, /nel diagramma/i, /nello schema/i,
      /l['’]area (colorata|ombreggiata|evidenziata|grigia|tratteggiata)/i,
      /la parte (colorata|ombreggiata|evidenziata|grigia|tratteggiata)/i,
      /porzione (colorata|ombreggiata|grigia|evidenziata|tratteggiata)/i,
      /area (colorata|ombreggiata|grigia|evidenziata|tratteggiata) (del|di|nel)/i,
      /come (mostrato|indicato|illustrato|visibile) (nella|in|dal|nell['’])/i,
      /\[immagine\]/i, /\[figura\]/i, /\[grafico\]/i, /\[img\]/i,
      /si (osserva|vede|nota) (nella|in) figura/i,
      /con riferimento (alla|all['’]) figura/i,
    ];
    const domanda = quiz.domanda || quiz.testo || '';
    const opzioni = (quiz.opzioni || []).map(o => typeof o === 'string' ? o : (o.testo || '')).join(' ');
    const testo = domanda + ' ' + opzioni;
    return PATTERN.some(p => p.test(testo));
  }
  window.quizRichiedeImmagine = quizRichiedeImmagine;

  // Stato configurazione
  const CONFIG = {
    nodiSelezionati: new Set(),   // chiavi tipo "M:M01_x", "A:A01_y", "L:A01|0", "S:A01|0|2", "X:A01|22"
    libTreePath:     [],          // drill-down: [livello0_id, livello1_id, ...]
    saltaPadron:     true,        // salta quiz già padroneggiati nei pool
    ignoraPiano:     true,        // Il Libero non usa mai il piano Ranked.
    bandiIds: [],
    composizione: {},
    argomentiEsclusi: {},
    nQuiz:           30,
    pool:            'tutti',     // 'tutti' | 'mai_visti' | 'errati' | 'mix'
    modalita:        'esercitazione',  // 'esercitazione' | 'esame'
    timerMode:       'off',
    timerMinuti:     30,
    ordine:          'bando',     // default: percentuali del piano; fallback casuale senza save
    // legacy (mantenuto per compat con riferimenti esterni)
    materieSelezionate: new Set(),
    argomentiEspansi:   new Set(),
  };
  const SK_LIB_CONFIG = 'cm:libero:config';
  function _libCaricaConfig() {
    const libSalvata = caricaDaStorage(SK_LIB_CONFIG);
    if (libSalvata) {
      for (const key of ['nQuiz','pool','modalita','timerMode','timerMinuti','ordine','saltaPadron','bandiIds','composizione','argomentiEsclusi']) {
        if (libSalvata[key] !== undefined) CONFIG[key] = libSalvata[key];
      }
      CONFIG.nodiSelezionati = new Set(libSalvata.nodiSelezionati || []);
    }
  }
  // Sul desktop SQLite viene ripristinato in modo asincrono. Come init(),
  // attendiamo il ripristino prima di leggere la configurazione salvata.
  (window.__storageReady || Promise.resolve()).then(_libCaricaConfig);
  function _libSalvaConfig() {
    salvaInStorage(SK_LIB_CONFIG, { ...CONFIG, nodiSelezionati: [...CONFIG.nodiSelezionati], materieSelezionate: [], argomentiEspansi: [] });
  }

  // ─── Helper Fase 5: materie consentite dal piano del save attivo ──────
  // Wrapper sull'helper centralizzato di saves-core, con override toggle
  // "ignora piano" (esclusivo di Libero).
  function _libGetMaterieAmmesse() {
    if (!CONFIG.bandiIds.length) return null;
    return new Set([...(STATE.pacchetto?.bandi || []).filter(b => CONFIG.bandiIds.includes(b.id))
      .flatMap(b => b.piano.materieIds || []), ...[...CONFIG.nodiSelezionati].filter(k => k.startsWith('M:')).map(k => k.slice(2))]);
  }
  function _libComposizione() {
    const ids = (STATE.pacchetto?.programma.materie || []).filter(m => _libMateriaAmmessa(m.id)).map(m => m.id);
    const pesi = { ...CONFIG.composizione };
    for (const m of (STATE.pacchetto?.programma.materie || [])) if (pesi[m.id] === undefined) pesi[m.id] = m.peso || 1;
    return normalizzaPercentuali(pesi, ids);
  }
  function _libMateriaDelNodo(key) {
    if (key.startsWith('M:')) return key.slice(2);
    if (key.startsWith('A:_altro_')) return key.slice(9);
    const aid = key.slice(2).split('|')[0];
    return STATE.pacchetto.programma.materie.find(m => (m.argomenti || []).some(a => a.id === aid))?.id;
  }
  function _libMateriaAmmessa(materiaId) {
    const set = _libGetMaterieAmmesse();
    return set === null ? true : set.has(materiaId);
  }

  // Stato sessione quiz in corso (condiviso con quiz-engine.js)
  let SESSIONE = null;

  // ═══════ Storage progress ═══════
  function caricaProgress() {
    return caricaDaStorage(SK_PROGRESS) || { risposte: [], sessioni: [] };
  }
  function salvaProgress(p) {
    salvaInStorage(SK_PROGRESS, p);
  }
  function quizId(q) {
    return (q.materia || '?') + '::' + (q.domanda || '').substring(0, 80);
  }
  function statoQuiz(quiz, progress) {
    const id    = quizId(quiz);
    const tutte = progress.risposte.filter(r => r.quiz_id === id);
    if (tutte.length === 0) return 'mai_visto';
    const ultima = tutte[tutte.length - 1];
    return ultima.corretta ? 'corretto' : 'errato';
  }

  // ═══════ Helper trovaArgomento (lookup nel programma) ═══════
  function _libTrovaArgomento(argId) {
    if (!STATE.pacchetto) return null;
    for (const m of (STATE.pacchetto.programma.materie || [])) {
      for (const a of (m.argomenti || [])) {
        if (a.id === argId) return a;
      }
    }
    return null;
  }

  // ═══════ Render: ALLENAMENTO LIBERO ═══════
  function renderAllenamentoLibero() {
    if (!STATE.pacchetto) { renderEmptyState(); return; }
    const catalogo      = (typeof _precomputaCatalogoAnalisi === 'function')
                            ? _precomputaCatalogoAnalisi() : null;
    const colonneHTML   = catalogo ? _libBuildColonne(catalogo) : '';
    const nSelezionati  = CONFIG.nodiSelezionati.size;
    const quizPool      = _libQuizDisponibili();
    const quizPescati   = Math.min(CONFIG.nQuiz, quizPool.length);
    const pronto        = quizPescati > 0;

    document.getElementById('main').innerHTML = `
      <div class="page-header page-header-bg pagebg-libera">
        <h1 class="page-title">Allenamento Libero</h1>
        <div class="page-subtitle">Selettore ad albero · spunta i nodi o clicca ▶ per studio mirato su un singolo nodo</div>
      </div>

      <div class="lib-toolbar">
        <div class="lib-quick-pick">
          <button class="quick-btn" onclick="quickPickAll()">Tutto</button>
          <button class="quick-btn" onclick="quickPickNone()">Niente</button>
          <button class="quick-btn" onclick="quickPickComuni()">Solo comuni</button>
          <button class="quick-btn" onclick="quickPickPesoAlto()">Peso ≥ 9</button>
        </div>
        <div class="lib-sel-counter">
          <strong>${nSelezionati}</strong> ${nSelezionati === 1 ? 'nodo selezionato' : 'nodi selezionati'}
          ${nSelezionati > 0 ? `· pool: <strong>${quizPool.length}</strong> quiz` : ''}
        </div>
      </div>
      <div class="lib-piano-status libero">Scelta indipendente da Ranked. Nessun bando spuntato = intera libreria.</div>
      <fieldset class="lib-bandi"><legend>Bandi per questo allenamento</legend>
        ${(STATE.pacchetto.bandi || []).filter(b => b.stato !== 'bozza').map(b => `<label class="lib-opt-row">
          <input type="checkbox" data-lib-bando="${escapeAttr(b.id)}" ${CONFIG.bandiIds.includes(b.id) ? 'checked' : ''}>
          ${escapeHTML(b.nome)}</label>`).join('')}
      </fieldset>
      <label>Schema materie e percentuali <select id="libSchemi"><option value="">Scegli uno schema salvato</option>
        ${(caricaDaStorage('cm:schemi-pesi') || []).map(s => `<option value="${escapeAttr(s.id)}">${escapeHTML(s.nome)}</option>`).join('')}</select></label>

      <div class="lib-tree-scroll">
        <div class="lib-tree-canvas" id="libTreeCanvas">
          ${colonneHTML}
        </div>
      </div>

      <div class="lib-config-grid">
        <div class="config-card">
          <div class="config-card-title">Pool quiz</div>
          <div class="option-pills">
            <div class="pill ${CONFIG.pool === 'tutti'     ? 'active' : ''}" onclick="setPool('tutti')">Tutti</div>
            <div class="pill ${CONFIG.pool === 'mai_visti' ? 'active' : ''}" onclick="setPool('mai_visti')">Mai visti</div>
            <div class="pill ${CONFIG.pool === 'errati'    ? 'active' : ''}" onclick="setPool('errati')">Solo errati</div>
            <div class="pill ${CONFIG.pool === 'mix'       ? 'active' : ''}" onclick="setPool('mix')">Mix (visti+errati)</div>
          </div>
          <label class="lib-opt-row">
            <input type="checkbox" id="lib-salta-padron" ${CONFIG.saltaPadron ? 'checked' : ''} onchange="CONFIG.saltaPadron = this.checked; refreshConfigUI();">
            <span>Salta i quiz già padroneggiati</span>
          </label>
        </div>

        <div class="config-card">
          <div class="config-card-title">Modalità feedback</div>
          <div class="option-pills">
            <div class="pill ${CONFIG.modalita === 'esercitazione' ? 'active' : ''}" onclick="setModalita('esercitazione')">Esercitazione (subito)</div>
            <div class="pill ${CONFIG.modalita === 'esame'         ? 'active' : ''}" onclick="setModalita('esame')">Esame (alla fine)</div>
          </div>
          <div class="config-card-title" style="margin-top:14px;">Ordine pesca</div>
          <div class="option-pills">
            <div class="pill ${CONFIG.ordine === 'casuale' ? 'active' : ''}" onclick="setOrdine('casuale')">Casuale</div>
            <div class="pill ${CONFIG.ordine === 'peso'    ? 'active' : ''}" onclick="setOrdine('peso')">Per peso</div>
            <div class="pill ${CONFIG.ordine === 'materia' ? 'active' : ''}" onclick="setOrdine('materia')">Per materia</div>
            <div class="pill ${CONFIG.ordine === 'bando' ? 'active' : ''}" onclick="setOrdine('bando')" title="Usa lo schema caricato o i pesi della libreria, mai il piano Ranked">⚖ Pesi allenamento</div>
          </div>
        </div>

        <div class="config-card">
          <div class="config-card-title">Numero di quiz</div>
          <div class="quiz-count-input">
            <input type="number" id="nQuizInput" value="${CONFIG.nQuiz}" min="1" max="500" onchange="setNQuiz(this.value)">
            <div class="option-pills">
              <div class="pill" onclick="setNQuiz(10)">10</div>
              <div class="pill" onclick="setNQuiz(20)">20</div>
              <div class="pill" onclick="setNQuiz(40)">40</div>
              <div class="pill" onclick="setNQuiz(100)">100</div>
            </div>
          </div>
          <div class="config-card-title" style="margin-top:14px;">Timer</div>
          <div class="option-pills">
            <div class="pill ${CONFIG.timerMode === 'off'    ? 'active' : ''}" onclick="setTimerMode('off')">Nessuno</div>
            <div class="pill ${CONFIG.timerMode === 'crono'  ? 'active' : ''}" onclick="setTimerMode('crono')">Cronometro</div>
            <div class="pill ${CONFIG.timerMode === 'limite' ? 'active' : ''}" onclick="setTimerMode('limite')">Tempo limite</div>
          </div>
          <div id="timerLimiteRow" style="margin-top:8px; ${CONFIG.timerMode === 'limite' ? '' : 'display:none'}">
            <input type="number" id="timerMinutiInput" value="${CONFIG.timerMinuti}" min="1" max="240" onchange="CONFIG.timerMinuti=parseInt(this.value)||30">
            <span style="font-size:12px; color:var(--text-muted)">minuti</span>
          </div>
        </div>
      </div>

      <div class="lib-summary">
        <div class="summary-info" id="libRiepilogo">
          Pronto a pescare <span class="num">${quizPescati}</span> quiz · pool disponibile: <strong>${quizPool.length}</strong>
        </div>
        <button class="btn btn-primary" id="libAvviaBatteria" onclick="avviaBatteria()" ${pronto ? '' : 'disabled style="opacity:0.4;cursor:not-allowed"'}>
          ▶ Avvia batteria mix
        </button>
      </div>
    `;

    _libAttaccaListenerTree();
    document.querySelectorAll('[data-lib-bando]').forEach(cb => cb.addEventListener('change', () => {
      CONFIG.bandiIds = [...document.querySelectorAll('[data-lib-bando]:checked')].map(c => c.dataset.libBando);
      CONFIG.nodiSelezionati.clear(); CONFIG.libTreePath = []; CONFIG.composizione = {}; CONFIG.argomentiEsclusi = {};
      refreshConfigUI();
    }));
    document.getElementById('libSchemi').addEventListener('change', e => {
      const schema = (caricaDaStorage('cm:schemi-pesi') || []).find(s => s.id === e.target.value);
      if (!schema) return;
      CONFIG.bandiIds = schema.piano.bandiIds || [];
      CONFIG.nodiSelezionati = new Set(schema.piano.materieIds.map(id => 'M:' + id));
      CONFIG.composizione = { ...schema.piano.composizione };
      CONFIG.argomentiEsclusi = { ...schema.piano.argomentiEsclusi };
      CONFIG.libTreePath = []; CONFIG.ordine = 'bando'; refreshConfigUI();
    });
  }

  // ═══════ Tree picker — colonne drill-down con checkbox + ▶ ═══════
  function _libBuildColonne(catalogo) {
    const tutteMaterie = [...(STATE.pacchetto.programma.materie || [])].sort((a, b) => {
      if (a.id === 'M99_altro') return  1;
      if (b.id === 'M99_altro') return -1;
      return (b.peso || 0) - (a.peso || 0);
    });
    // Fase 5: filtra le materie L0 in base al piano del save attivo
    // (a meno che CONFIG.ignoraPiano sia true → mostra tutto).
    const materieAmmesse = _libGetMaterieAmmesse();
    const materie = materieAmmesse
      ? tutteMaterie.filter(m => materieAmmesse.has(m.id))
      : tutteMaterie;
    const path = CONFIG.libTreePath || [];
    const cols = [];

    // L0 — Materie
    cols.push({
      livello: 0, titolo: 'Materie', nodi: materie.map(m => {
        const set = catalogo.quizPerMateria[m.id] || new Set();
        return { key: 'M:' + m.id, drillId: m.id, nome: m.nome, meta: 'Peso ' + (m.peso || '?') + '/10',
                 nQuiz: set.size, espandibile: true };
      })
    });

    // L1 — Argomenti
    const mSel = path[0] ? materie.find(m => m.id === path[0]) : null;
    if (mSel) {
      const nodi = (mSel.argomenti || []).map(a => {
        const set = catalogo.quizPerArgomento[a.id] || new Set();
        const haFigli = ((a.leggi || []).length > 0) || (catalogo.quizSenzaArticolo[a.id] && catalogo.quizSenzaArticolo[a.id].size > 0);
        return { key: 'A:' + a.id, drillId: a.id, nome: a.nome, meta: 'Peso ' + (a.peso || '?') + '/10',
                 nQuiz: set.size, espandibile: haFigli };
      });
      const senza = catalogo.quizSenzaArgomento[mSel.id];
      if (senza && senza.size > 0) {
        nodi.push({ key: 'A:_altro_' + mSel.id, drillId: '__altro__', nome: 'Altro',
                    meta: 'quiz senza argomento', nQuiz: senza.size, espandibile: false, altro: true });
      }
      cols.push({ livello: 1, titolo: 'Argomenti', nodi });
    }

    // L2 — Leggi
    const aSel = (mSel && path[1] && path[1] !== '__altro__')
      ? (mSel.argomenti || []).find(a => a.id === path[1]) : null;
    if (aSel) {
      const nodi = (aSel.leggi || []).map((l, idx) => {
        // calcolo quiz aggregati legge
        let n = 0;
        for (const s of (l.sotto_argomenti || [])) {
          for (const art of (s.articoli || [])) {
            const num = _normalizzaArticolo(typeof art === 'string' ? art : String(art.numero || ''));
            const set = catalogo.quizPerArticolo[aSel.id + '|' + num];
            if (set) n += set.size;
          }
        }
        return { key: 'L:' + aSel.id + '|' + idx, drillId: 'L' + idx, nome: l.nome,
                 meta: (l.sotto_argomenti || []).length + ' sotto-argomenti',
                 nQuiz: n, espandibile: (l.sotto_argomenti || []).length > 0 };
      });
      const orf = catalogo.quizSenzaArticolo[aSel.id];
      if (orf && orf.size > 0) {
        nodi.push({ key: 'L:' + aSel.id + '|_altro', drillId: '__altro__', nome: 'Altro',
                    meta: 'quiz senza articolo', nQuiz: orf.size, espandibile: false, altro: true });
      }
      cols.push({ livello: 2, titolo: 'Leggi', nodi });
    }

    // L3 — Sotto-argomenti
    const lSel = (aSel && path[2] && path[2] !== '__altro__' && path[2].charAt(0) === 'L')
      ? (aSel.leggi || [])[parseInt(path[2].slice(1), 10)] : null;
    if (lSel) {
      const nodi = (lSel.sotto_argomenti || []).map((s, idx) => {
        let n = 0;
        for (const art of (s.articoli || [])) {
          const num = _normalizzaArticolo(typeof art === 'string' ? art : String(art.numero || ''));
          const set = catalogo.quizPerArticolo[aSel.id + '|' + num];
          if (set) n += set.size;
        }
        const leggeIdx = aSel.leggi.indexOf(lSel);
        return { key: 'S:' + aSel.id + '|' + leggeIdx + '|' + idx, drillId: 'S' + idx, nome: s.nome,
                 meta: (s.articoli || []).length + ' articoli',
                 nQuiz: n, espandibile: (s.articoli || []).length > 0 };
      });
      cols.push({ livello: 3, titolo: 'Sotto-argomenti', nodi });
    }

    // L4 — Articoli
    const sSel = (lSel && path[3] && path[3].charAt(0) === 'S')
      ? (lSel.sotto_argomenti || [])[parseInt(path[3].slice(1), 10)] : null;
    if (sSel) {
      const nodi = (sSel.articoli || []).map((art, idx) => {
        const numero = typeof art === 'string' ? art : String(art.numero || '');
        const titolo = typeof art === 'object' ? (art.titolo || '') : '';
        const num = _normalizzaArticolo(numero);
        const set = catalogo.quizPerArticolo[aSel.id + '|' + num] || new Set();
        return { key: 'X:' + aSel.id + '|' + num, drillId: 'art' + idx, nome: 'art. ' + numero,
                 meta: titolo, nQuiz: set.size, espandibile: false };
      });
      cols.push({ livello: 4, titolo: 'Articoli', nodi });
    }

    return cols.map(_libRenderColonna).join('');
  }

  function _libRenderColonna(col) {
    const html = col.nodi.length
      ? col.nodi.map(nd => _libRenderNodo(nd, col.livello)).join('')
      : '<div class="lib-col-vuota">nessun elemento</div>';
    return `
      <div class="lib-tree-col" data-lib-col="${col.livello}">
        <div class="lib-col-h">${col.titolo}<span class="lib-col-n">${col.nodi.length}</span></div>
        <div class="lib-col-nodi">${html}</div>
      </div>
    `;
  }

  function _libRenderNodo(nd, livello) {
    const sel    = CONFIG.nodiSelezionati.has(nd.key);
    const drill  = CONFIG.libTreePath[livello] === nd.drillId;
    return `
      <div class="lib-node ${sel ? 'lib-node-sel' : ''} ${drill ? 'lib-node-drill' : ''} ${nd.altro ? 'lib-node-altro' : ''}"
           data-lib-key="${escapeAttr(nd.key)}" data-lib-liv="${livello}" data-lib-drill="${escapeAttr(nd.drillId)}">
        <label class="lib-node-check" onclick="event.stopPropagation()">
          <input type="checkbox" ${sel ? 'checked' : ''}
                 onchange="_libToggleSelezione('${escapeAttr(nd.key)}')">
        </label>
        <div class="lib-node-body">
          <div class="lib-node-nome">${escapeHTML(nd.nome)}</div>
          ${nd.meta ? `<div class="lib-node-meta">${escapeHTML(nd.meta)}</div>` : ''}
          <div class="lib-node-quiz">${nd.nQuiz.toLocaleString('it-IT')} quiz</div>
        </div>
        <button class="lib-node-go" title="Studio mirato su questo nodo"
                onclick="event.stopPropagation(); _libQuickLaunch('${escapeAttr(nd.key)}', '${escapeAttr(nd.nome)}')">▶</button>
      </div>
    `;
  }

  function _libAttaccaListenerTree() {
    // Click sul corpo del nodo (NON checkbox, NON ▶) → drill-down
    document.querySelectorAll('.lib-node .lib-node-body').forEach(body => {
      body.addEventListener('click', () => {
        const node = body.closest('.lib-node');
        const liv  = parseInt(node.dataset.libLiv, 10);
        const drillId = node.dataset.libDrill;
        // Aggiorna path al livello + tronca i più profondi
        CONFIG.libTreePath = CONFIG.libTreePath.slice(0, liv);
        CONFIG.libTreePath[liv] = drillId;
        renderAllenamentoLibero();
        requestAnimationFrame(() => {
          const sc = document.querySelector('.lib-tree-scroll');
          if (sc) sc.scrollTo({ left: sc.scrollWidth, behavior: 'smooth' });
        });
      });
    });
  }

  function _libToggleSelezione(key) {
    if (CONFIG.nodiSelezionati.has(key)) CONFIG.nodiSelezionati.delete(key);
    else CONFIG.nodiSelezionati.add(key);
    refreshConfigUI();
  }

  // ═══════ Quick-launch (studio mirato) ═══════
  function _libQuickLaunch(nodeKey, nodeNome) {
    const catalogo = _precomputaCatalogoAnalisi();
    const ids = _libQuizIdsDelNodo(nodeKey, catalogo);
    if (ids.size === 0) {
      toast('Nessun quiz disponibile su questo nodo', true);
      return;
    }
    const padron = carCaricaPadron();
    let nPadr = 0;
    for (const id of ids) {
      if (èPadroneggiato(padron[id])) nPadr++;
    }
    const nAperti = ids.size - nPadr;
    const opts = [10, 20, 40, ids.size].filter((v, i, arr) => arr.indexOf(v) === i && v <= ids.size);

    // Mini-dialog tramite il modale standard
    document.getElementById('modalTitle').textContent = '🎯 Studio mirato';
    document.getElementById('modalText').innerHTML = `
      <p style="margin:0 0 10px;color:var(--text-secondary);font-size:14px;">
        <strong>${escapeHTML(nodeNome)}</strong>
      </p>
      <p style="margin:0 0 14px;color:var(--text-muted);font-size:12px;">
        ${ids.size.toLocaleString('it-IT')} quiz disponibili ·
        ${nPadr.toLocaleString('it-IT')} padroneggiati ·
        <strong style="color:var(--neon-cyan)">${nAperti.toLocaleString('it-IT')} ancora aperti</strong>
      </p>
      <div style="margin-bottom:10px;font-size:12px;color:var(--text-secondary);">Quanti quiz vuoi affrontare?</div>
      <div class="option-pills" id="ql-pills">
        ${opts.map(v => `<div class="pill" data-ql-n="${v}">${v >= ids.size ? 'Tutti' : v}</div>`).join('')}
      </div>
      <label style="display:flex;gap:8px;align-items:center;margin-top:14px;font-size:13px;cursor:pointer;">
        <input type="checkbox" id="ql-salta-padr" checked>
        <span>Salta i ${nPadr.toLocaleString('it-IT')} già padroneggiati (consigliato)</span>
      </label>
    `;
    let scelto = Math.min(20, nAperti) || ids.size;
    setTimeout(() => {
      const pills = document.querySelectorAll('#ql-pills .pill');
      const setActive = (n) => {
        pills.forEach(p => p.classList.toggle('active', parseInt(p.dataset.qlN, 10) === n));
      };
      // default
      const defaultN = pills.length ? parseInt(pills[Math.min(1, pills.length - 1)].dataset.qlN, 10) : ids.size;
      scelto = defaultN;
      setActive(scelto);
      pills.forEach(p => p.addEventListener('click', () => {
        scelto = parseInt(p.dataset.qlN, 10);
        setActive(scelto);
      }));
    }, 0);

    const btnConf = document.getElementById('modalConfirm');
    btnConf.style.display = '';
    btnConf.textContent = '▶ Avvia';
    btnConf.onclick = () => {
      const salta = document.getElementById('ql-salta-padr').checked;
      closeModal();
      _libAvviaStudioMirato(ids, scelto, salta, _libMateriaDelNodo(nodeKey));
    };
    document.getElementById('modal').classList.add('active');
  }

  // Risolve il set di quiz_id coperti da una chiave di nodo
  function _libQuizIdsDelNodo(key, catalogo) {
    const ids = new Set();
    if (key.startsWith('M:')) {
      const set = catalogo.quizPerMateria[key.slice(2)];
      if (set) for (const id of set) ids.add(id);
    } else if (key.startsWith('A:')) {
      const aid = key.slice(2);
      if (aid.startsWith('_altro_')) {
        const set = catalogo.quizSenzaArgomento[aid.slice('_altro_'.length)];
        if (set) for (const id of set) ids.add(id);
      } else {
        const set = catalogo.quizPerArgomento[aid];
        if (set) for (const id of set) ids.add(id);
      }
    } else if (key.startsWith('L:')) {
      const [argId, leggeKey] = key.slice(2).split('|');
      if (leggeKey === '_altro') {
        const set = catalogo.quizSenzaArticolo[argId];
        if (set) for (const id of set) ids.add(id);
      } else {
        const arg = _libTrovaArgomento(argId);
        const legge = arg && arg.leggi && arg.leggi[parseInt(leggeKey, 10)];
        if (legge) {
          for (const s of (legge.sotto_argomenti || [])) {
            for (const art of (s.articoli || [])) {
              const num = _normalizzaArticolo(typeof art === 'string' ? art : String(art.numero || ''));
              const set = catalogo.quizPerArticolo[argId + '|' + num];
              if (set) for (const id of set) ids.add(id);
            }
          }
        }
      }
    } else if (key.startsWith('S:')) {
      const [argId, leggeIdx, sottoIdx] = key.slice(2).split('|');
      const arg = _libTrovaArgomento(argId);
      const legge = arg && arg.leggi && arg.leggi[parseInt(leggeIdx, 10)];
      const sotto = legge && legge.sotto_argomenti && legge.sotto_argomenti[parseInt(sottoIdx, 10)];
      if (sotto) {
        for (const art of (sotto.articoli || [])) {
          const num = _normalizzaArticolo(typeof art === 'string' ? art : String(art.numero || ''));
          const set = catalogo.quizPerArticolo[argId + '|' + num];
          if (set) for (const id of set) ids.add(id);
        }
      }
    } else if (key.startsWith('X:')) {
      const set = catalogo.quizPerArticolo[key.slice(2)];
      if (set) for (const id of set) ids.add(id);
    }
    return ids;
  }

  // Avvia uno studio mirato (mini-batteria su singolo nodo)
  function _libAvviaStudioMirato(idsSet, nQuiz, saltaPadron, materiaId) {
    const padron = carCaricaPadron();
    const ids = [...idsSet].filter(id => {
      if (!saltaPadron) return true;
      const p = padron[id];
      return !èPadroneggiato(p);
    });
    if (ids.length === 0) {
      toast('Tutti i quiz di questo nodo sono già padroneggiati', false);
      return;
    }

    // Materializzo i quiz object iterando le banche
    const wanted = new Set(ids);
    const quizObj = [];
    for (const m of STATE.pacchetto.manifest.moduli) {
      if (!_libMateriaAmmessa(m.materia_id) || (materiaId && m.materia_id !== materiaId)) continue;
      const banca = STATE.pacchetto.banche[m.materia_id];
      if (!banca) continue;
      const arr = banca.categorizzati || banca.quiz || [];
      for (const q of arr) {
        const arg = q.categorizzazione?.argomento_id;
        if (wanted.has(quizId(q)) && !(CONFIG.argomentiEsclusi[m.materia_id] || []).includes(arg) && !quizRichiedeImmagine(q)) {
          quizObj.push({ ...q, _materia_id: m.materia_id });
        }
      }
    }
    shuffle(quizObj);
    const scelti = quizObj.slice(0, Math.min(nQuiz, quizObj.length));
    if (!scelti.length) { toast('Nessun quiz disponibile con i filtri attuali', true); return; }

    SESSIONE = {
      config: {
        modalita: 'esercitazione',
        timerMode: 'off',
        materieSelezionate: new Set(),
      },
      quiz: scelti.map((q, idx) => ({
        ...q,
        _idx: idx,
        _opzioni_mescolate: shuffle([...(q.opzioni || [])]),
        _risposta_data: null,
        _corretta: null,
        _tempo: 0,
      })),
      iCorrente:     0,
      avvio:         Date.now(),
      timerStart:    Date.now(),
      timerInterval: null,
      terminata:     false,
    };
    if (typeof avviaTimer === 'function') avviaTimer();
    renderQuizCorrente();
  }

  // ═══════ Quick-pick (riadattati al nuovo modello di selezione) ═══════
  // Tutti i quick-pick rispettano il filtro piano del save attivo (a meno
  // che CONFIG.ignoraPiano sia true).
  function quickPickAll() {
    CONFIG.nodiSelezionati = new Set(
      (STATE.pacchetto.programma.materie || [])
        .filter(m => m.id !== 'M99_altro' && STATE.pacchetto.banche[m.id] && _libMateriaAmmessa(m.id))
        .map(m => 'M:' + m.id)
    );
    refreshConfigUI();
  }
  function quickPickNone() {
    CONFIG.nodiSelezionati = new Set();
    refreshConfigUI();
  }
  function quickPickComuni() {
    CONFIG.nodiSelezionati = new Set(
      (STATE.pacchetto.programma.materie || [])
        .filter(m => (m.tipologia || '').includes('comune') && STATE.pacchetto.banche[m.id] && _libMateriaAmmessa(m.id))
        .map(m => 'M:' + m.id)
    );
    refreshConfigUI();
  }
  function quickPickPesoAlto() {
    CONFIG.nodiSelezionati = new Set(
      (STATE.pacchetto.programma.materie || [])
        .filter(m => (m.peso || 0) >= 9 && STATE.pacchetto.banche[m.id] && _libMateriaAmmessa(m.id))
        .map(m => 'M:' + m.id)
    );
    refreshConfigUI();
  }

  // ═══════ Config setters ═══════
  function setPool(p)     { CONFIG.pool = p; refreshConfigUI(); }
  function setModalita(m) { CONFIG.modalita = m; refreshConfigUI(); }
  function setNQuiz(n) {
    CONFIG.nQuiz = Math.max(1, parseInt(n) || 1);
    const inp = document.getElementById('nQuizInput');
    if (inp) inp.value = CONFIG.nQuiz;
    _libSalvaConfig();
    const pool = _libQuizDisponibili().length, pescati = Math.min(CONFIG.nQuiz, pool);
    const riepilogo = document.getElementById('libRiepilogo');
    if (riepilogo) riepilogo.innerHTML = `Pronto a pescare <span class="num">${pescati}</span> quiz · pool disponibile: <strong>${pool}</strong>`;
    const avvia = document.getElementById('libAvviaBatteria');
    if (avvia) { avvia.disabled = pescati === 0; avvia.style.opacity = pescati ? '' : '0.4'; avvia.style.cursor = pescati ? '' : 'not-allowed'; }
  }
  function setTimerMode(m) { CONFIG.timerMode = m; refreshConfigUI(); }
  function setOrdine(o)    { CONFIG.ordine = o; refreshConfigUI(); }
  function setIgnoraPiano(v) {
    CONFIG.ignoraPiano = !!v;
    // Quando cambio modalità, resetto le selezioni che ora potrebbero
    // riferirsi a materie non più visibili. L'utente ripicchia ciò che vuole.
    CONFIG.nodiSelezionati = new Set();
    CONFIG.libTreePath = [];
    refreshConfigUI();
  }
  function refreshConfigUI() {
    _libSalvaConfig();
    const main = document.getElementById('main'), y = main.scrollTop, wy = window.scrollY;
    renderAllenamentoLibero(); main.scrollTop = y; window.scrollTo(0, wy);
  }

  // Legacy hooks (no-op, mantenuti per evitare ReferenceError su vecchi link)
  function toggleMateria()  { /* sostituito da _libToggleSelezione */ }
  function toggleArgomento(){ /* sostituito da _libToggleSelezione */ }
  function toggleEspandi()  { /* sostituito dal drill-down dell'albero */ }

  // ═══════ Pool quiz per batteria mix ═══════
  function _libQuizDisponibili() {
    if (!STATE.pacchetto || CONFIG.nodiSelezionati.size === 0) return [];
    const catalogo = (typeof _precomputaCatalogoAnalisi === 'function')
                       ? _precomputaCatalogoAnalisi() : null;
    if (!catalogo) return [];
    const wanted = new Set();
    for (const key of CONFIG.nodiSelezionati) {
      const ids = _libQuizIdsDelNodo(key, catalogo);
      for (const id of ids) wanted.add(id);
    }
    if (wanted.size === 0) return [];

    const padron = CONFIG.saltaPadron ? carCaricaPadron() : null;
    const progress = caricaProgress();
    const result = [];
    // Fase 5 + 7: filtro piano (materie + argomenti esclusi). Se ignoraPiano: null
    const materieSelezionate = new Set([...CONFIG.nodiSelezionati].map(_libMateriaDelNodo).filter(Boolean));
    for (const m of STATE.pacchetto.manifest.moduli) {
      if (!_libMateriaAmmessa(m.materia_id) || !materieSelezionate.has(m.materia_id)) continue;
      const banca = STATE.pacchetto.banche[m.materia_id];
      if (!banca) continue;
      const arr = banca.categorizzati || banca.quiz || [];
      for (const q of arr) {
        const id = quizId(q);
        if (!wanted.has(id)) continue;
        const argId = q.categorizzazione && q.categorizzazione.argomento_id;
        if ((CONFIG.argomentiEsclusi[m.materia_id] || []).includes(argId)) continue;
        // salta quiz che richiedono immagini non disponibili
        if (quizRichiedeImmagine(q)) continue;
        // salta padroneggiati
        if (padron) {
          const p = padron[id];
          if (èPadroneggiato(p)) continue;
        }
        // filtro pool (mai_visti/errati/mix)
        const stato = statoQuiz(q, progress);
        if (CONFIG.pool === 'mai_visti' && stato !== 'mai_visto') continue;
        if (CONFIG.pool === 'errati'    && stato !== 'errato')    continue;
        if (CONFIG.pool === 'mix'       && stato === 'corretto')  continue;
        result.push({ ...q, _materia_id: m.materia_id });
      }
    }
    return result;
  }

  function countQuizDisponibili() { return _libQuizDisponibili().length; }
  // Alias storico per quiz-engine che legge SESSIONE.config.materieSelezionate
  function getQuizDisponibili() { return _libQuizDisponibili(); }

  // ═══════ Avvio batteria mix ═══════
  function avviaBatteria() {
    const disponibili = _libQuizDisponibili();
    if (disponibili.length === 0) {
      toast('Nessun quiz disponibile con la selezione e i filtri attuali', true);
      return;
    }
    let pescati;
    if (CONFIG.ordine === 'bando') {
      const composizione = _libComposizione();
      pescati = (typeof pescaProporzionale === 'function')
                ? pescaProporzionale(disponibili, CONFIG.nQuiz, composizione, { getMateriaId: q => q._materia_id })
                : null;
      if (!pescati) pescati = shuffle([...disponibili]).slice(0, CONFIG.nQuiz);   // fallback: nessuna composizione attiva
    } else if (CONFIG.ordine === 'casuale') {
      pescati = shuffle([...disponibili]).slice(0, CONFIG.nQuiz);
    } else if (CONFIG.ordine === 'peso') {
      const pesi = mappaArgomentiPesi();
      pescati = [...disponibili]
        .sort((a, b) => (pesi[b.categorizzazione?.argomento_id] || 0) - (pesi[a.categorizzazione?.argomento_id] || 0))
        .slice(0, CONFIG.nQuiz);
    } else {
      pescati = [...disponibili]
        .sort((a, b) => (a._materia_id || '').localeCompare(b._materia_id || ''))
        .slice(0, CONFIG.nQuiz);
    }

    SESSIONE = {
      config: { ...CONFIG, nodiSelezionati: new Set(CONFIG.nodiSelezionati), materieSelezionate: new Set() },
      quiz: pescati.map((q, idx) => ({
        ...q,
        _idx: idx,
        _opzioni_mescolate: shuffle([...(q.opzioni || [])]),
        _risposta_data: null,
        _corretta: null,
        _tempo: 0,
      })),
      iCorrente:     0,
      avvio:         Date.now(),
      timerStart:    Date.now(),
      timerInterval: null,
      terminata:     false,
    };
    if (typeof avviaTimer === 'function') avviaTimer();
    renderQuizCorrente();
  }

  // ═══════ Hook per Libero ═══════
  // MODELLO: un SAVE riguarda SOLO la Ranked. L'Allenamento Libero NON deve
  // entrare nel diario per-save (lo inquinerebbe). Le risposte Libero finiscono
  // SOLO nello store GLOBALE (progress, scritto da quiz-engine.rispondiQuiz) e
  // alimentano l'Analisi Globale. Qui aggiorniamo solo il padroneggiamento, che
  // è conoscenza GLOBALE condivisa (chiave non per-save).
  function liberoHookRisposta(quiz, risposta, corretta) {
    if (!SESSIONE || !SESSIONE.config) return;
    if (SESSIONE.config._carriera || SESSIONE.config._ranked) return;  // gestiti altrove

    const id = quizId(quiz);

    // Padroneggiamento algebrico (GLOBALE): +1 corretto / -1 errato.
    const eraInRecupero = false;
    const prima = (carCaricaPadron()[id] || {}).saldo || 0;
    const dopo  = carAggiornaPadron(id, corretta, eraInRecupero);
    if (corretta && prima < 3 && dopo.saldo >= 3) {
      try { toast('Quiz padroneggiato ✓'); } catch (e) {}
    }
  }

  // ═══════ Utility ═══════
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function mappaArgomentiPesi() {
    const m = {};
    for (const mat of (STATE.pacchetto.programma.materie || []))
      for (const a of (mat.argomenti || [])) m[a.id] = a.peso;
    return m;
  }

  // Helper interni esportati per inline onclick
  // (assegnazioni a window vengono fatte da app.js)
