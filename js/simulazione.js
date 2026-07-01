  // ═══════════════════════════════════════════════════════
  // SIMULAZIONE — Prova d'esame completa (preselettiva quiz + scritto quesiti)
  //
  // Flusso:
  //   CONFIG → [PRESELETTIVA] → [SCRITTO] → RISULTATO
  // L'utente sceglie quali prove includere (entrambe / solo quiz / solo scritto).
  //
  //   • Preselettiva: riusa il motore quiz (SESSIONE + renderQuizCorrente),
  //     modalità esame, timer a tempo. Punteggi esatta/sbagliata/non-risposta
  //     scelti dall'utente. Voto /30, soglia 21.
  //   • Scritto: N quesiti random dalle materie scelte. Stessa UI traccia +
  //     pannello di scrittura. Flusso "consegna N° quesito"; rivedibili e
  //     modificabili. Valutazione IA (geminiValuta) sulla risposta perfetta.
  //     Voto scritto = media dei N quesiti. Si può avviare in qualsiasi momento
  //     (prova sospesa, persistita su storage).
  //   • Idoneità: ≥21 su ENTRAMBE. Voto finale = media preselettiva + scritto.
  //
  // Persistenza: cm:simulazione:corrente (prova in corso) + cm:simulazione:storico.
  // ═══════════════════════════════════════════════════════

  (function () {
    'use strict';

    const SK_CORRENTE = 'cm:simulazione:corrente';
    const SK_STORICO  = 'cm:simulazione:storico';
    const SOGLIA = 21;

    // Stato della prova corrente (in RAM; specchiato su storage).
    let SIM = null;
    let _scrTimer = null;

    // ─── Helpers storage ───
    function _loadCorrente() { try { return caricaDaStorage(SK_CORRENTE); } catch (_) { return null; } }
    function _saveCorrente() {
      if (!SIM) { try { localStorage.removeItem(_resolveK(SK_CORRENTE)); } catch (_) {} return; }
      // Serializza senza timer/funzioni
      const clone = JSON.parse(JSON.stringify(SIM, (k, v) => (k.startsWith('_') ? undefined : v)));
      salvaInStorage(SK_CORRENTE, clone);
    }
    function _resolveK(k) { return k; } // chiave globale (no per-save routing necessario)
    function _clearCorrente() { SIM = null; try { localStorage.removeItem(SK_CORRENTE); } catch (_) {} }
    function _loadStorico() { return caricaDaStorage(SK_STORICO) || []; }
    function _pushStorico(rec) { const s = _loadStorico(); s.unshift(rec); salvaInStorage(SK_STORICO, s.slice(0, 50)); }

    function _esc(s) { return (typeof escapeHTML === 'function') ? escapeHTML(s) : String(s == null ? '' : s); }
    function _votoClasse(v) { return v >= 27 ? 'sim-v-ottimo' : v >= SOGLIA ? 'sim-v-buono' : v >= 18 ? 'sim-v-suff' : 'sim-v-insuff'; }

    // ─── Dati: pool quiz per materia (rispetta il piano del save attivo) ───
    function _quizPerMateria() {
      const pool = (typeof rankedCostruisciPool === 'function') ? rankedCostruisciPool() : null;
      const map = {}; // materiaId → { nome, items:[] }
      if (!pool) return map;
      for (const it of pool) {
        const mid = it.materiaId;
        if (!map[mid]) map[mid] = { nome: _nomeMateriaQuiz(mid), items: [] };
        map[mid].items.push(it);
      }
      return map;
    }
    function _nomeMateriaQuiz(mid) {
      try {
        const prog = STATE.pacchetto && STATE.pacchetto.programma;
        if (prog && prog.materie) {
          const m = prog.materie.find(x => x.id === mid || x.materia_id === mid);
          if (m && (m.nome || m.materia)) return m.nome || m.materia;
        }
        const mod = STATE.pacchetto && STATE.pacchetto.manifest && STATE.pacchetto.manifest.moduli;
        if (mod) { const mm = mod.find(x => x.materia_id === mid); if (mm && mm.nome) return mm.nome; }
      } catch (_) {}
      return mid;
    }

    // ─── Dati: quesiti scritto per materia ───
    function _quesitiPerMateria() {
      const map = {}; // materiaId → { nome, items:[quesito] }
      const arr = (window.CM_QUESITI && Array.isArray(CM_QUESITI.quesiti)) ? CM_QUESITI.quesiti : [];
      for (const q of arr) {
        const mid = q.materia_id || q.materia || '?';
        if (!map[mid]) map[mid] = { nome: q.materia || mid, items: [] };
        map[mid].items.push(q);
      }
      return map;
    }

    // ═══════════════════════════════════════════════════════
    // CONFIG (schermata principale)
    // ═══════════════════════════════════════════════════════
    function renderSimulazione() {
      _simStopTimer();
      SIM = _loadCorrente();
      const main = document.getElementById('main');

      // Se c'è una prova in corso, mostra il pannello "riprendi"
      if (SIM && SIM.fase && SIM.fase !== 'config' && SIM.fase !== 'done') {
        _renderRiprendi(main);
        return;
      }

      const quizMat = _quizPerMateria();
      const quesMat = _quesitiPerMateria();
      const quizIds = Object.keys(quizMat).sort((a, b) => quizMat[b].items.length - quizMat[a].items.length);
      const quesIds = Object.keys(quesMat).sort((a, b) => quesMat[b].items.length - quesMat[a].items.length);
      const haKey = (typeof geminiHaKey === 'function') && geminiHaKey();

      // Precompila il calibratore quiz con le quote del bando del save attivo
      // (se presente): resta comunque modificabile a mano, è solo il default
      // iniziale invece di partire da 0. Totale di default = 30 (stesso
      // valore di default dell'input "Totale quiz della prova" sotto).
      const TOTALE_DEFAULT_PRE = 30;
      const composizioneSim = (typeof carComposizioneBando === 'function') ? carComposizioneBando() : null;
      const quotePrefill = composizioneSim
        ? ripartisciProporzionale(TOTALE_DEFAULT_PRE, composizioneSim)
        : {};

      main.innerHTML = `
        <div class="page-header page-header-bg pagebg-mappa">
          <h1 class="page-title">🎓 Simulazione d'esame</h1>
          <div class="page-sub">Configura una prova realistica: preselettiva a quiz e/o prova scritta a quesiti, con punteggi, materie e tempi a tua scelta.</div>
        </div>

        <div class="sim-top-actions">
          <button class="btn" id="sim-storico-top">🗂 Prove svolte</button>
        </div>

        <div class="sim-config">
          <!-- Quali prove -->
          <div class="sim-card">
            <div class="sim-card-h">1 · Quali prove includere</div>
            <label class="sim-toggle"><input type="checkbox" id="sim-inc-pre" checked> <span>📝 Preselettiva (quiz a risposta multipla)</span></label>
            <label class="sim-toggle"><input type="checkbox" id="sim-inc-scr" checked> <span>✍️ Prova scritta (quesiti aperti, valutazione IA)</span></label>
          </div>

          <!-- PRESELETTIVA -->
          <div class="sim-card" id="sim-block-pre">
            <div class="sim-card-h">2 · Preselettiva — punteggi e tempo</div>
            <div class="sim-grid3">
              <label class="sim-field"><span>Punti risposta esatta</span><input type="number" id="sim-p-ok" value="1" step="0.25"></label>
              <label class="sim-field"><span>Punti risposta sbagliata</span><input type="number" id="sim-p-ko" value="0" step="0.25"></label>
              <label class="sim-field"><span>Punti non risposta</span><input type="number" id="sim-p-na" value="0" step="0.25"></label>
            </div>
            <div class="sim-grid2">
              <label class="sim-field"><span>Tempo a disposizione (minuti)</span><input type="number" id="sim-t-pre" value="60" min="1"></label>
              <label class="sim-field"><span>Totale quiz della prova</span><input type="number" id="sim-tot-quiz" value="30" min="1"></label>
            </div>

            <div class="sim-calib-h">Quiz per materia <span class="sim-calib-rem" id="sim-rem-quiz"></span></div>
            <div class="scr-search-row sim-search-row">
              <span class="scr-search-ic">🔎</span>
              <input type="search" class="scr-search-big" id="sim-quiz-search" placeholder="Cerca una materia…">
            </div>
            <div class="sim-calib" id="sim-calib-quiz">
              ${quizIds.length ? quizIds.map(mid => {
                const prefill = Math.min(quotePrefill[mid] || 0, quizMat[mid].items.length);
                return `
                <div class="sim-calib-row" data-nome="${_esc(quizMat[mid].nome.toLowerCase())}">
                  <span class="sim-calib-nome">${_esc(quizMat[mid].nome)}</span>
                  <span class="sim-calib-disp">disp. ${quizMat[mid].items.length}</span>
                  <input type="number" class="sim-calib-input" data-sim-qmat="${_esc(mid)}" data-max="${quizMat[mid].items.length}" value="${prefill}" min="0" max="${quizMat[mid].items.length}">
                </div>`;
              }).join('') : '<div class="sim-vuoto">Nessuna banca quiz disponibile (controlla il piano del save).</div>'}
            </div>
          </div>

          <!-- SCRITTO -->
          <div class="sim-card" id="sim-block-scr">
            <div class="sim-card-h">3 · Prova scritta — quesiti e tempo</div>
            ${!haKey ? `<div class="dash-warn"><span>🔑 Per la valutazione IA serve la API key Gemini.</span><button class="btn btn-primary" id="sim-vai-key">Configura</button></div>` : ''}
            <div class="sim-grid2">
              <label class="sim-field"><span>Numero quesiti</span><input type="number" id="sim-n-ques" value="3" min="1" max="10"></label>
              <label class="sim-field"><span>Tempo a disposizione (minuti)</span><input type="number" id="sim-t-scr" value="180" min="1"></label>
            </div>
            <div class="sim-calib-h">Materie da cui estrarre i quesiti</div>
            <div class="scr-search-row sim-search-row">
              <span class="scr-search-ic">🔎</span>
              <input type="search" class="scr-search-big" id="sim-ques-search" placeholder="Cerca una materia…">
            </div>
            <div class="sim-chips" id="sim-ques-chips">
              ${quesIds.length ? quesIds.map(mid => `
                <button class="sim-chip" data-sim-qsmat="${_esc(mid)}" data-nome="${_esc(quesMat[mid].nome.toLowerCase())}"><span class="sim-chip-tick">＋</span>${_esc(quesMat[mid].nome)} <span class="sim-chip-n">${quesMat[mid].items.length}</span></button>`).join('') : '<div class="sim-vuoto">Nessun quesito disponibile.</div>'}
            </div>
          </div>

          <div class="sim-actions">
            <button class="btn btn-primary btn-lg" id="sim-avvia">🚀 Avvia simulazione</button>
          </div>
        </div>
      `;

      _wireConfig(quizMat, quesMat);
    }

    function _wireConfig(quizMat, quesMat) {
      const selQuesMaterie = new Set();

      const incPre = document.getElementById('sim-inc-pre');
      const incScr = document.getElementById('sim-inc-scr');
      const blockPre = document.getElementById('sim-block-pre');
      const blockScr = document.getElementById('sim-block-scr');
      const syncBlocks = () => {
        blockPre.style.display = incPre.checked ? '' : 'none';
        blockScr.style.display = incScr.checked ? '' : 'none';
      };
      incPre.addEventListener('change', syncBlocks);
      incScr.addEventListener('change', syncBlocks);
      syncBlocks();

      const bKey = document.getElementById('sim-vai-key');
      if (bKey) bKey.addEventListener('click', () => mostraModaleSettings());

      // ── Calibratore quiz ──
      const totEl = document.getElementById('sim-tot-quiz');
      const remEl = document.getElementById('sim-rem-quiz');
      const inputs = Array.from(document.querySelectorAll('[data-sim-qmat]'));
      function sommaQuiz() { return inputs.reduce((s, i) => s + (parseInt(i.value, 10) || 0), 0); }
      function aggiornaCalib(changed) {
        const totale = Math.max(0, parseInt(totEl.value, 10) || 0);
        let somma = sommaQuiz();
        // Se la somma supera il totale, taglia l'input appena modificato al massimo consentito
        if (changed && somma > totale) {
          const altri = somma - (parseInt(changed.value, 10) || 0);
          const maxConsentito = Math.max(0, Math.min(parseInt(changed.dataset.max, 10), totale - altri));
          changed.value = maxConsentito;
          somma = sommaQuiz();
        }
        // Aggiorna i max dinamici e segnala il residuo
        const residuo = Math.max(0, totale - somma);
        inputs.forEach(i => {
          const propri = parseInt(i.value, 10) || 0;
          const dispBanca = parseInt(i.dataset.max, 10);
          const maxDin = Math.min(dispBanca, propri + residuo);
          i.max = maxDin;
        });
        remEl.textContent = `· totale ${somma}/${totale} · ancora ${residuo} assegnabili`;
        remEl.className = 'sim-calib-rem' + (somma > totale ? ' over' : (somma === totale && totale > 0 ? ' full' : ''));
      }
      inputs.forEach(i => i.addEventListener('input', () => aggiornaCalib(i)));
      totEl.addEventListener('input', () => aggiornaCalib(null));
      aggiornaCalib(null);

      // ── Chip materie quesiti ──
      document.querySelectorAll('[data-sim-qsmat]').forEach(btn => {
        btn.addEventListener('click', () => {
          const mid = btn.dataset.simQsmat;
          if (selQuesMaterie.has(mid)) { selQuesMaterie.delete(mid); btn.classList.remove('on'); btn.querySelector('.sim-chip-tick').textContent = '＋'; }
          else { selQuesMaterie.add(mid); btn.classList.add('on'); btn.querySelector('.sim-chip-tick').textContent = '✓'; }
        });
      });

      // ── Ricerca live materie (quiz + quesiti), stesso stile di "Studia & Esercitati" ──
      const qSearch = document.getElementById('sim-quiz-search');
      if (qSearch) qSearch.addEventListener('input', () => {
        const t = qSearch.value.trim().toLowerCase();
        document.querySelectorAll('#sim-calib-quiz .sim-calib-row').forEach(r => {
          r.style.display = (!t || (r.dataset.nome || '').includes(t)) ? '' : 'none';
        });
      });
      const qsSearch = document.getElementById('sim-ques-search');
      if (qsSearch) qsSearch.addEventListener('input', () => {
        const t = qsSearch.value.trim().toLowerCase();
        document.querySelectorAll('#sim-ques-chips .sim-chip').forEach(c => {
          c.style.display = (!t || (c.dataset.nome || '').includes(t)) ? '' : 'none';
        });
      });

      document.getElementById('sim-storico-top').addEventListener('click', _mostraStorico);

      document.getElementById('sim-avvia').addEventListener('click', () => {
        const includePre = incPre.checked;
        const includeScritto = incScr.checked;
        if (!includePre && !includeScritto) { toast('Seleziona almeno una prova', true); return; }

        // Config preselettiva
        const materiePre = {};
        let nQuiz = 0;
        if (includePre) {
          inputs.forEach(i => { const n = parseInt(i.value, 10) || 0; if (n > 0) { materiePre[i.dataset.simQmat] = n; nQuiz += n; } });
          if (nQuiz === 0) { toast('Assegna almeno un quiz a una materia', true); return; }
        }
        const punti = {
          e: parseFloat(document.getElementById('sim-p-ok').value) || 0,
          s: parseFloat(document.getElementById('sim-p-ko').value) || 0,
          n: parseFloat(document.getElementById('sim-p-na').value) || 0,
        };
        const tempoPre = Math.max(1, parseInt(document.getElementById('sim-t-pre').value, 10) || 60);

        // Config scritto
        let nQuesiti = 0, materieScritto = [], tempoScritto = 0;
        if (includeScritto) {
          materieScritto = Array.from(selQuesMaterie);
          if (materieScritto.length === 0) { toast('Scegli almeno una materia per i quesiti', true); return; }
          nQuesiti = Math.max(1, parseInt(document.getElementById('sim-n-ques').value, 10) || 3);
          tempoScritto = Math.max(1, parseInt(document.getElementById('sim-t-scr').value, 10) || 180);
          // Verifica disponibilità quesiti
          const dispo = materieScritto.reduce((s, mid) => s + (quesMat[mid] ? quesMat[mid].items.length : 0), 0);
          if (dispo < nQuesiti) { toast(`Solo ${dispo} quesiti disponibili nelle materie scelte`, true); return; }
        }

        SIM = {
          config: { includePre, includeScritto, materiePre, nQuiz, punti, tempoPre, materieScritto, nQuesiti, tempoScritto },
          fase: includePre ? 'preselettiva' : 'scritto',
          startedAt: new Date().toISOString(),
          pre: null,
          scritto: null,
        };
        _saveCorrente();
        if (includePre) _avviaPreselettiva();
        else _preparaScritto();
      });
    }

    // ═══════════════════════════════════════════════════════
    // RIPRENDI (prova in corso)
    // ═══════════════════════════════════════════════════════
    function _renderRiprendi(main) {
      const c = SIM.config;
      let stato = '';
      if (SIM.fase === 'preselettiva') stato = 'Preselettiva da svolgere';
      else if (SIM.fase === 'scritto') stato = SIM.pre ? `Preselettiva completata (${SIM.pre.voto.toFixed(1)}/30) · scritto da svolgere` : 'Prova scritta da svolgere';
      main.innerHTML = `
        <div class="page-header page-header-bg pagebg-mappa">
          <h1 class="page-title">🎓 Simulazione in corso</h1>
          <div class="page-sub">${stato}</div>
        </div>
        <div class="sim-config">
          <div class="sim-card">
            <div class="sim-card-h">Hai una prova sospesa</div>
            <p class="sim-desc">Avviata il ${_esc(new Date(SIM.startedAt).toLocaleString('it-IT'))}.</p>
            <div class="sim-actions">
              ${SIM.fase === 'preselettiva' ? `<button class="btn btn-primary btn-lg" id="sim-go">▶ Inizia la preselettiva</button>` : ''}
              ${SIM.fase === 'scritto' ? `<button class="btn btn-primary btn-lg" id="sim-go">▶ ${SIM.scritto ? 'Riprendi' : 'Inizia'} la prova scritta</button>` : ''}
              <button class="btn btn-danger" id="sim-abbandona">✕ Abbandona la prova</button>
            </div>
          </div>
        </div>`;
      const go = document.getElementById('sim-go');
      if (go) go.addEventListener('click', () => {
        if (SIM.fase === 'preselettiva') _avviaPreselettiva();
        else _preparaScritto();
      });
      document.getElementById('sim-abbandona').addEventListener('click', () => {
        showModal('Abbandonare la prova?', 'La simulazione in corso verrà eliminata. Irreversibile.', () => {
          _clearCorrente(); renderSimulazione();
        }, 'Sì, abbandona');
      });
    }

    // ═══════════════════════════════════════════════════════
    // PRESELETTIVA — costruisce SESSIONE e avvia il motore quiz
    // ═══════════════════════════════════════════════════════
    function _avviaPreselettiva() {
      const c = SIM.config;
      const quizMat = _quizPerMateria();
      const scelti = [];
      for (const mid in c.materiePre) {
        const items = (quizMat[mid] ? quizMat[mid].items.slice() : []);
        shuffle(items);
        scelti.push(...items.slice(0, c.materiePre[mid]));
      }
      shuffle(scelti);
      if (scelti.length === 0) { toast('Nessun quiz disponibile', true); return; }

      SESSIONE = {
        config: {
          modalita: 'esame',
          timerMode: 'limite',
          timerMinuti: c.tempoPre,
          materieSelezionate: new Set(),
          _simulazione: true,
        },
        quiz: scelti.map((s, idx) => {
          const q = s.quiz;
          return {
            ...q,
            _materia_id: q._materia_id || q.materia,
            _idx: idx,
            _opzioni_mescolate: shuffle([...(q.opzioni || [])]),
            _risposta_data: null,
            _corretta: null,
            _tempo: 0,
          };
        }),
        iCorrente: 0,
        avvio: Date.now(),
        timerStart: Date.now(),
        timerInterval: null,
        terminata: false,
      };
      avviaTimer();
      renderQuizCorrente();
    }

    // Chiamata da quiz-engine.terminaBatteria quando config._simulazione.
    function finePreselettiva(sess) {
      const c = SIM.config;
      const esatte = sess.quiz.filter(q => q._corretta === true).length;
      const sbagliate = sess.quiz.filter(q => q._corretta === false).length;
      const nonRisp = sess.quiz.filter(q => q._risposta_data === null || q._risposta_data === 'SKIP').length;
      const raw = esatte * c.punti.e + sbagliate * c.punti.s + nonRisp * c.punti.n;
      const max = sess.quiz.length * c.punti.e;
      let voto = max > 0 ? (raw / max) * 30 : 0;
      voto = Math.max(0, Math.min(30, voto));
      const dettaglio = sess.quiz.map(q => ({
        materia: q.materia || q._materia_id || '',
        domanda: q.domanda,
        opzioni: (q._opzioni_mescolate || q.opzioni || []).slice(),
        tua: q._risposta_data,        // testo opzione, 'SKIP' o null
        corretta: q.corretta,
        esito: q._corretta,           // true / false / null
      }));
      SIM.pre = { esatte, sbagliate, nonRisp, raw, max, voto, tempo: sess.tempoTotale || 0, totale: sess.quiz.length, dettaglio };
      SIM.fase = SIM.config.includeScritto ? 'scritto' : 'done';
      if (SIM.fase === 'done') _finalizza();
      _saveCorrente();
      _renderRisultatoPre();
    }

    function _renderRisultatoPre() {
      const p = SIM.pre;
      const ok = p.voto >= SOGLIA;
      const main = document.getElementById('main');
      main.innerHTML = `
        <div class="quiz-session">
          <div class="results-header">
            <div class="results-voto-sub">Preselettiva — voto</div>
            <div class="results-voto ${ok ? 'sufficiente' : 'insufficiente'}">${p.voto.toFixed(1)} <span style="font-size:36px;color:var(--text-muted)">/30</span></div>
            <div class="results-voto-sub">${ok ? '✓ Idonea (≥21)' : '✗ Non idonea (<21)'} · ${p.esatte} esatte · ${p.sbagliate} sbagliate · ${p.nonRisp} non risposte · punti ${p.raw.toFixed(2)}/${p.max.toFixed(2)}</div>
          </div>
          <div class="quiz-controls" style="margin-top:32px">
            <div class="quiz-controls-left">
              <button class="btn btn-ghost" id="sim-home">← Torna alla simulazione</button>
              <button class="btn" id="sim-rivedi">🔍 Rivedi le risposte</button>
            </div>
            <div class="quiz-controls-right">
              ${SIM.config.includeScritto
                ? `<button class="btn btn-primary" id="sim-to-scr">Vai alla prova scritta →</button>`
                : `<button class="btn btn-primary" id="sim-fine">Vedi esito finale →</button>`}
            </div>
          </div>
          <p class="sim-desc" style="text-align:center;margin-top:14px">${SIM.config.includeScritto ? 'La prova scritta resta sospesa: puoi iniziarla ora o in qualsiasi altro momento dalla sezione Simulazione.' : ''}</p>
        </div>`;
      document.getElementById('sim-home').addEventListener('click', () => { navigaA('simulazione'); aggiornaNavSidebar('simulazione'); });
      const riv = document.getElementById('sim-rivedi');
      if (riv) riv.addEventListener('click', () => _renderRevisionePre());
      const toScr = document.getElementById('sim-to-scr');
      if (toScr) toScr.addEventListener('click', () => _preparaScritto());
      const fine = document.getElementById('sim-fine');
      if (fine) fine.addEventListener('click', () => _renderRisultatoFinale());
    }

    // Revisione completa della preselettiva (solo dopo la consegna).
    function _renderRevisionePre() {
      const d = (SIM.pre && SIM.pre.dettaglio) || [];
      const main = document.getElementById('main');
      const esitoTag = (e, tua) => {
        if (tua === null || tua === 'SKIP') return '<span class="sim-rev-tag na">— non risposto</span>';
        return e ? '<span class="sim-rev-tag ok">✓ corretta</span>' : '<span class="sim-rev-tag ko">✗ sbagliata</span>';
      };
      main.innerHTML = `
        <div class="quiz-session sim-revisione">
          <div class="page-header"><h1 class="page-title">🔍 Revisione preselettiva</h1>
            <div class="page-sub">${SIM.pre.esatte} esatte · ${SIM.pre.sbagliate} sbagliate · ${SIM.pre.nonRisp} non risposte · voto ${SIM.pre.voto.toFixed(1)}/30</div>
          </div>
          ${d.map((q, k) => `
            <div class="sim-rev-card ${q.esito === true ? 'ok' : (q.tua === null || q.tua === 'SKIP') ? 'na' : 'ko'}">
              <div class="sim-rev-head"><span class="sim-rev-n">${k + 1}</span> <span class="sim-rev-mat">${_esc(q.materia)}</span> ${esitoTag(q.esito, q.tua)}</div>
              <div class="sim-rev-dom">${_esc(q.domanda)}</div>
              <div class="sim-rev-opts">
                ${q.opzioni.map(opt => {
                  let c = 'sim-rev-opt';
                  if (opt === q.corretta) c += ' giusta';
                  if (opt === q.tua && q.tua !== q.corretta && q.tua !== 'SKIP') c += ' tua-sbagliata';
                  return `<div class="${c}">${opt === q.corretta ? '✓ ' : (opt === q.tua && q.tua !== 'SKIP' ? '✗ ' : '')}${_esc(opt)}</div>`;
                }).join('')}
              </div>
            </div>`).join('')}
          <div class="quiz-controls" style="margin-top:24px">
            <div class="quiz-controls-left"><button class="btn btn-ghost" id="sim-rev-back">← Torna al risultato</button></div>
            <div class="quiz-controls-right">
              ${SIM.config.includeScritto ? `<button class="btn btn-primary" id="sim-rev-scr">Vai alla prova scritta →</button>` : `<button class="btn btn-primary" id="sim-rev-fine">Esito finale →</button>`}
            </div>
          </div>
        </div>`;
      document.getElementById('sim-rev-back').addEventListener('click', () => _renderRisultatoPre());
      const rs = document.getElementById('sim-rev-scr'); if (rs) rs.addEventListener('click', () => _preparaScritto());
      const rf = document.getElementById('sim-rev-fine'); if (rf) rf.addEventListener('click', () => _renderRisultatoFinale());
    }

    // ═══════════════════════════════════════════════════════
    // SCRITTO — N quesiti, flusso "consegna N° quesito"
    // ═══════════════════════════════════════════════════════
    function _preparaScritto() {
      const c = SIM.config;
      if (!SIM.scritto) {
        // Estrai N quesiti random dalle materie scelte
        const quesMat = _quesitiPerMateria();
        let pool = [];
        for (const mid of c.materieScritto) if (quesMat[mid]) pool = pool.concat(quesMat[mid].items);
        shuffle(pool);
        const scelti = pool.slice(0, c.nQuesiti);
        SIM.scritto = {
          quesiti: scelti.map(q => q.id),
          testi: {},
          consegnati: {},
          valutazioni: {},
          voto: null,
          iCorrente: 0,
          startTs: Date.now(),
          tempoScadeTs: Date.now() + c.tempoScritto * 60 * 1000,
        };
      } else if (!SIM.scritto.tempoScadeTs) {
        // resume legacy
        SIM.scritto.tempoScadeTs = Date.now() + c.tempoScritto * 60 * 1000;
      }
      SIM.fase = 'scritto';
      _saveCorrente();
      _renderScrittoQuesito();
    }

    function _quesitoById(id) {
      const arr = (window.CM_QUESITI && CM_QUESITI.quesiti) || [];
      return arr.find(q => q.id === id) || null;
    }

    function _renderScrittoQuesito() {
      _simStopTimer();
      const s = SIM.scritto;
      const i = s.iCorrente;
      const id = s.quesiti[i];
      const q = _quesitoById(id);
      const tot = s.quesiti.length;
      const main = document.getElementById('main');
      if (!q) { main.innerHTML = '<div class="sim-vuoto">Quesito non trovato.</div>'; return; }

      const consegnatiN = Object.keys(s.consegnati).filter(k => s.consegnati[k]).length;
      const isConsegnato = !!s.consegnati[id];

      main.innerHTML = `
        <div class="scr-eserc sim-scritto">
          <div class="page-header" style="padding-bottom:6px">
            <h1 class="page-title">✍️ Prova scritta — quesito ${i + 1}/${tot}</h1>
            <div class="page-sub">${_esc(q.materia)} · Legge: ${_esc(q.normativa || '—')} · consegnati ${consegnatiN}/${tot}</div>
          </div>

          <div class="sim-scritto-bar">
            <div class="sim-ques-nav">
              ${s.quesiti.map((qid, k) => `<button class="sim-ques-dot ${k === i ? 'cur' : ''} ${s.consegnati[qid] ? 'done' : ''}" data-sim-goto="${k}" title="Quesito ${k + 1}${s.consegnati[qid] ? ' (consegnato)' : ''}">${k + 1}</button>`).join('')}
            </div>
            <div class="scr-timer sim-timer" id="sim-scr-timer">⏱ --:--</div>
          </div>

          <div class="scr-blocco scr-blocco-dom"><div class="scr-blocco-h">Traccia</div><div class="scr-dom-testo">${_esc(q.domanda)}</div></div>

          <div class="scr-blocco">
            <div class="scr-blocco-h">Il tuo elaborato ${isConsegnato ? '<span class="sim-tag-done">✓ consegnato</span>' : ''}</div>
            <textarea id="sim-scr-testo" class="scr-textarea" placeholder="Scrivi qui la tua risposta…">${_esc(s.testi[id] || '')}</textarea>
            <div class="scr-eserc-bar"><span class="scr-counter" id="sim-scr-counter">0 parole</span></div>
          </div>

          <div class="scr-eserc-actions sim-scritto-actions">
            ${i > 0 ? `<button class="btn" id="sim-scr-prev">← Quesito precedente</button>` : '<span></span>'}
            <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;">
              ${i < tot - 1
                ? `<button class="btn btn-primary" id="sim-scr-consegna">📨 Consegna ${i + 1}° quesito e prosegui</button>`
                : `<button class="btn btn-primary" id="sim-scr-termina">✅ Termina e consegna tutto</button>`}
              <button class="btn btn-ghost" id="sim-scr-abbandona">Abbandona</button>
            </div>
          </div>
        </div>`;

      const ta = document.getElementById('sim-scr-testo');
      const counter = document.getElementById('sim-scr-counter');
      const updCount = () => { const t = ta.value.trim(); counter.textContent = `${t ? t.split(/\s+/).length : 0} parole · ${ta.value.length} caratteri`; };
      ta.addEventListener('input', () => { s.testi[id] = ta.value; updCount(); _saveCorrenteDebounced(); });
      updCount();
      ta.focus();

      document.querySelectorAll('[data-sim-goto]').forEach(b => b.addEventListener('click', () => {
        s.testi[id] = ta.value; _saveCorrente();
        s.iCorrente = parseInt(b.dataset.simGoto, 10); _renderScrittoQuesito();
      }));
      const prev = document.getElementById('sim-scr-prev');
      if (prev) prev.addEventListener('click', () => { s.testi[id] = ta.value; s.iCorrente--; _saveCorrente(); _renderScrittoQuesito(); });
      const cons = document.getElementById('sim-scr-consegna');
      if (cons) cons.addEventListener('click', () => {
        s.testi[id] = ta.value; s.consegnati[id] = true; s.iCorrente++; _saveCorrente(); _renderScrittoQuesito();
      });
      const term = document.getElementById('sim-scr-termina');
      if (term) term.addEventListener('click', () => {
        s.testi[id] = ta.value; s.consegnati[id] = true; _saveCorrente();
        _confermaTerminaScritto();
      });
      document.getElementById('sim-scr-abbandona').addEventListener('click', () => {
        s.testi[id] = ta.value; _saveCorrente();
        showModal('Abbandonare la prova?', 'La simulazione verrà eliminata. Irreversibile.', () => { _simStopTimer(); _clearCorrente(); navigaA('simulazione'); aggiornaNavSidebar('simulazione'); }, 'Sì, abbandona');
      });

      _avviaTimerScritto();
    }

    function _avviaTimerScritto() {
      const el = document.getElementById('sim-scr-timer');
      const tick = () => {
        if (!SIM || !SIM.scritto) return;
        const rim = Math.floor((SIM.scritto.tempoScadeTs - Date.now()) / 1000);
        if (rim <= 0) {
          if (el) { el.textContent = '⏱ 00:00'; el.classList.add('danger'); }
          _simStopTimer();
          toast('Tempo scaduto: consegna automatica', true);
          // salva testo corrente del campo visibile
          const ta = document.getElementById('sim-scr-testo');
          if (ta && SIM.scritto) { SIM.scritto.testi[SIM.scritto.quesiti[SIM.scritto.iCorrente]] = ta.value; }
          // segna consegnati tutti quelli con testo
          SIM.scritto.quesiti.forEach(qid => { if ((SIM.scritto.testi[qid] || '').trim()) SIM.scritto.consegnati[qid] = true; });
          _eseguiValutazioneScritto();
          return;
        }
        if (el) {
          const m = Math.floor(rim / 60), sx = rim % 60;
          el.textContent = `⏱ ${String(m).padStart(2, '0')}:${String(sx).padStart(2, '0')}`;
          el.classList.toggle('danger', rim < 60);
          el.classList.toggle('warning', rim >= 60 && rim < 300);
        }
      };
      tick();
      _scrTimer = setInterval(tick, 500);
    }

    function _confermaTerminaScritto() {
      const s = SIM.scritto;
      const vuoti = s.quesiti.filter(qid => !(s.testi[qid] || '').trim()).length;
      const msg = vuoti > 0
        ? `${vuoti} quesit${vuoti === 1 ? 'o' : 'i'} ${vuoti === 1 ? 'è' : 'sono'} ancora vuot${vuoti === 1 ? 'o' : 'i'} e prender${vuoti === 1 ? 'à' : 'anno'} 0. Consegnare comunque?`
        : 'Consegnare tutti i quesiti per la valutazione IA?';
      showModal('Terminare la prova scritta?', msg, () => _eseguiValutazioneScritto(), 'Sì, consegna');
    }

    async function _eseguiValutazioneScritto() {
      _simStopTimer();
      const s = SIM.scritto;
      const main = document.getElementById('main');
      const haKey = (typeof geminiHaKey === 'function') && geminiHaKey();
      main.innerHTML = `<div class="sim-loading"><div class="scr-spinner"></div><div>Valutazione dei quesiti in corso…</div><div class="sim-loading-sub" id="sim-val-prog"></div></div>`;
      const prog = document.getElementById('sim-val-prog');

      for (let k = 0; k < s.quesiti.length; k++) {
        const id = s.quesiti[k];
        const q = _quesitoById(id);
        const testo = (s.testi[id] || '').trim();
        if (prog) prog.textContent = `Quesito ${k + 1} di ${s.quesiti.length}…`;
        if (!testo || testo.length < 20 || !haKey) {
          s.valutazioni[id] = { voto: 0, giudizioSintetico: !haKey ? 'Valutazione IA non disponibile (manca API key)' : 'Elaborato assente o troppo breve', _noeval: true };
          continue;
        }
        try {
          const val = await geminiValuta(q, testo, {
            onWait: (sec, att) => { if (prog) prog.textContent = `Quesito ${k + 1}/${s.quesiti.length}: limite IA raggiunto, attendo ${sec}s (tentativo ${att})…`; },
          });
          s.valutazioni[id] = val;
          // Piccola pausa tra le valutazioni per non saturare il rate-limit/minuto.
          if (k < s.quesiti.length - 1) await new Promise(r => setTimeout(r, 1500));
          // Registra anche nello storico scritto standard (riusa il diario quesiti)
          try {
            if (typeof scrAggiungiTentativo === 'function') {
              scrAggiungiTentativo({
                quesitoId: id, ts: new Date().toISOString(), materia: q.materia, normativa: q.normativa,
                voto: val.voto, perCriterio: val.perCriterio, giudizioSintetico: val.giudizioSintetico,
                concettiPresenti: val.concettiPresenti, concettiMancanti: val.concettiMancanti,
                puntiForza: val.puntiForza, puntiDebolezza: val.puntiDebolezza, feedback: val.feedback,
                testo, durataSec: 0, nParole: testo.split(/\s+/).length, _simulazione: true,
              });
            }
          } catch (_) {}
        } catch (e) {
          s.valutazioni[id] = { voto: 0, giudizioSintetico: 'Errore valutazione: ' + (e.message || e), _noeval: true };
        }
      }

      // Media sui N quesiti (mancanti = 0)
      const somma = s.quesiti.reduce((acc, id) => acc + ((s.valutazioni[id] && s.valutazioni[id].voto) || 0), 0);
      s.voto = s.quesiti.length > 0 ? somma / s.quesiti.length : 0;
      SIM.fase = 'done';
      _finalizza();
      _saveCorrente();
      _renderRisultatoFinale();
    }

    // ═══════════════════════════════════════════════════════
    // RISULTATO FINALE
    // ═══════════════════════════════════════════════════════
    function _finalizza() {
      const voti = [];
      if (SIM.config.includePre && SIM.pre) voti.push(SIM.pre.voto);
      if (SIM.config.includeScritto && SIM.scritto) voti.push(SIM.scritto.voto);
      SIM.votoFinale = voti.length ? voti.reduce((a, b) => a + b, 0) / voti.length : 0;
      const preOk = !SIM.config.includePre || (SIM.pre && SIM.pre.voto >= SOGLIA);
      const scrOk = !SIM.config.includeScritto || (SIM.scritto && SIM.scritto.voto >= SOGLIA);
      SIM.idoneo = !!(preOk && scrOk);
      // Salva nello storico (una sola volta) — record COMPLETO e riapribile.
      if (!SIM._salvato) {
        SIM._salvato = true;
        SIM._storicoId = 'sim_' + Date.now().toString(36);
        _pushStorico(_recordCompleto());
      }
    }

    // Costruisce il record completo (config + dettaglio preselettiva + scritto).
    function _recordCompleto() {
      return {
        id: SIM._storicoId,
        ts: new Date().toISOString(),
        config: {
          includePre: SIM.config.includePre, includeScritto: SIM.config.includeScritto,
          nQuiz: SIM.config.nQuiz, nQuesiti: SIM.config.nQuesiti,
        },
        pre: SIM.pre ? {
          esatte: SIM.pre.esatte, sbagliate: SIM.pre.sbagliate, nonRisp: SIM.pre.nonRisp,
          raw: SIM.pre.raw, max: SIM.pre.max, voto: SIM.pre.voto, totale: SIM.pre.totale,
          dettaglio: SIM.pre.dettaglio || [],
        } : null,
        scritto: SIM.scritto ? {
          quesiti: SIM.scritto.quesiti, testi: SIM.scritto.testi,
          valutazioni: SIM.scritto.valutazioni, voto: SIM.scritto.voto,
        } : null,
        votoPre: SIM.pre ? SIM.pre.voto : null,
        votoScritto: SIM.scritto ? SIM.scritto.voto : null,
        votoFinale: SIM.votoFinale,
        idoneo: SIM.idoneo,
      };
    }

    function _renderRisultatoFinale() {
      const main = document.getElementById('main');
      const idoneo = SIM.idoneo;
      const preBlock = (SIM.config.includePre && SIM.pre) ? `
        <div class="sim-res-row">
          <span>Preselettiva</span>
          <strong class="${_votoClasse(SIM.pre.voto)}">${SIM.pre.voto.toFixed(1)}/30 ${SIM.pre.voto >= SOGLIA ? '✓' : '✗'}</strong>
        </div>` : '';
      const scrBlock = (SIM.config.includeScritto && SIM.scritto) ? `
        <div class="sim-res-row">
          <span>Prova scritta (media ${SIM.scritto.quesiti.length} quesiti)</span>
          <strong class="${_votoClasse(SIM.scritto.voto)}">${SIM.scritto.voto.toFixed(1)}/30 ${SIM.scritto.voto >= SOGLIA ? '✓' : '✗'}</strong>
        </div>
        <div class="sim-quesiti-dettaglio">
          ${SIM.scritto.quesiti.map((id, k) => {
            const v = SIM.scritto.valutazioni[id] || {};
            const q = _quesitoById(id);
            const fallita = !!v._noeval;
            const provOpts = _providerOptions();
            const rivalutaHTML = provOpts.length
              ? `<div class="sim-rivaluta">
                   <select class="sim-rivaluta-prov" data-q="${id}">${provOpts.map(o => `<option value="${o.v}">${o.l}</option>`).join('')}</select>
                   <button class="btn ${fallita ? 'btn-primary' : 'btn-ghost'} sim-rivaluta-btn" data-q="${id}">🔄 ${fallita ? 'Rivaluta ora' : 'Rivaluta'}</button>
                 </div>`
              : '<div class="sim-vuoto">Configura una API key in Impostazioni per rivalutare.</div>';
            return `<details class="sim-ques-det ${fallita ? 'fallita' : ''}" ${fallita ? 'open' : ''}>
              <summary><span class="sim-ques-n">Quesito ${k + 1}</span> <span class="${_votoClasse(v.voto || 0)}">${(v.voto || 0)}/30</span> <span class="sim-ques-mat">${_esc(q ? q.materia : '')}</span>${fallita ? ' <span class="sim-rev-tag ko">⚠ non valutato</span>' : ''}</summary>
              <div class="sim-ques-body">
                <div class="sim-ques-giud">${_esc(v.giudizioSintetico || '')}</div>
                ${v.feedback ? `<div class="sim-ques-fb">${_esc(v.feedback)}</div>` : ''}
                ${rivalutaHTML}
              </div>
            </details>`;
          }).join('')}
        </div>` : '';

      const mostraFinale = SIM.config.includePre && SIM.config.includeScritto;

      main.innerHTML = `
        <div class="quiz-session">
          <div class="results-header">
            <div class="results-voto-sub">${mostraFinale ? 'Voto finale (media)' : 'Voto'}</div>
            <div class="results-voto ${idoneo ? 'sufficiente' : 'insufficiente'}">${(SIM.votoFinale).toFixed(1)} <span style="font-size:36px;color:var(--text-muted)">/30</span></div>
            <div class="results-voto-sub sim-esito ${idoneo ? 'ok' : 'ko'}">${idoneo ? '✅ IDONEO' : '❌ NON IDONEO'} ${mostraFinale ? '· serve ≥21 su entrambe le prove' : '· serve ≥21'}</div>
          </div>
          <div class="sim-res-card">
            ${preBlock}
            ${scrBlock}
            ${mostraFinale ? `<div class="sim-res-row sim-res-final"><span>Voto finale</span><strong class="${_votoClasse(SIM.votoFinale)}">${SIM.votoFinale.toFixed(1)}/30</strong></div>` : ''}
          </div>
          <div class="quiz-controls" style="margin-top:28px">
            <div class="quiz-controls-left"><button class="btn btn-ghost" id="sim-storico2">🗂 Prove svolte</button></div>
            <div class="quiz-controls-right"><button class="btn btn-primary" id="sim-nuova">🎓 Nuova simulazione</button></div>
          </div>
        </div>`;
      document.getElementById('sim-nuova').addEventListener('click', () => { _clearCorrente(); renderSimulazione(); });
      document.getElementById('sim-storico2').addEventListener('click', _mostraStorico);
      // Rivaluta per quesito (scelta provider)
      document.querySelectorAll('.sim-rivaluta-btn').forEach(btn => btn.addEventListener('click', () => {
        const id = btn.dataset.q;
        const sel = document.querySelector('.sim-rivaluta-prov[data-q="' + id + '"]');
        _rivalutaQuesito(id, sel ? sel.value : null);
      }));
    }

    // Provider con chiave configurata (per il menù "Rivaluta").
    function _providerOptions() {
      const out = [];
      try { if (window.groqGetKey && window.groqGetKey()) out.push({ v: 'groq', l: 'Groq (gratis)' }); } catch (_) {}
      try { if (window.geminiGetKey && window.geminiGetKey()) out.push({ v: 'gemini', l: 'Gemini' }); } catch (_) {}
      // Metti il provider attivo per primo
      const att = (typeof aiGetProvider === 'function') ? aiGetProvider() : 'groq';
      out.sort((a, b) => (a.v === att ? -1 : b.v === att ? 1 : 0));
      return out;
    }

    // Ricalcola voto scritto + finale + idoneità e aggiorna lo storico recente.
    function _recomputeFinale() {
      if (SIM.scritto) {
        const somma = SIM.scritto.quesiti.reduce((acc, id) => acc + ((SIM.scritto.valutazioni[id] && SIM.scritto.valutazioni[id].voto) || 0), 0);
        SIM.scritto.voto = SIM.scritto.quesiti.length ? somma / SIM.scritto.quesiti.length : 0;
      }
      const voti = [];
      if (SIM.config.includePre && SIM.pre) voti.push(SIM.pre.voto);
      if (SIM.config.includeScritto && SIM.scritto) voti.push(SIM.scritto.voto);
      SIM.votoFinale = voti.length ? voti.reduce((a, b) => a + b, 0) / voti.length : 0;
      const preOk = !SIM.config.includePre || (SIM.pre && SIM.pre.voto >= SOGLIA);
      const scrOk = !SIM.config.includeScritto || (SIM.scritto && SIM.scritto.voto >= SOGLIA);
      SIM.idoneo = !!(preOk && scrOk);
      // Aggiorna il record completo nello storico (per id).
      try {
        if (SIM._storicoId) {
          const s = _loadStorico();
          const idx = s.findIndex(r => r.id === SIM._storicoId);
          if (idx >= 0) { s[idx] = _recordCompleto(); salvaInStorage(SK_STORICO, s); }
        }
      } catch (_) {}
      _saveCorrente();
    }

    async function _rivalutaQuesito(id, provider) {
      const q = _quesitoById(id);
      const testo = (SIM.scritto.testi[id] || '').trim();
      if (!testo || testo.length < 20) { toast('Elaborato troppo breve o assente: nulla da valutare.', true); return; }
      if (provider && typeof aiSetProvider === 'function') aiSetProvider(provider);
      if (typeof geminiHaKey === 'function' && !geminiHaKey()) { toast('Nessuna API key per il provider scelto.', true); return; }
      toast('Rivalutazione in corso…');
      try {
        const val = await geminiValuta(q, testo, { onWait: (sec) => toast('Limite IA: attendo ' + sec + 's…') });
        SIM.scritto.valutazioni[id] = val;
        _recomputeFinale();
        _renderRisultatoFinale();
        toast('Quesito rivalutato ✓');
      } catch (e) {
        toast('Rivalutazione fallita: ' + (e.message || e), true);
      }
    }

    // ═══════════════════════════════════════════════════════
    // STORICO PROVE
    // ═══════════════════════════════════════════════════════
    function _mostraStorico() {
      const entries = _loadStorico();
      const stato = { q: '', sort: 'recenti' };
      const html = `
        <div class="scr-vista">
          <p class="am-fonti-intro">${entries.length} prov${entries.length === 1 ? 'a' : 'e'} svolt${entries.length === 1 ? 'a' : 'e'} — clicca per riaprire.</p>
          <div class="scr-vista-ctrl">
            <input type="search" class="scr-vista-search" id="sim-st-q" placeholder="🔎 cerca (data, esito)…">
            <select class="scr-vista-sel" id="sim-st-sort">
              <option value="recenti">Più recenti</option>
              <option value="voto_desc">Voto ↓</option>
              <option value="voto_asc">Voto ↑</option>
            </select>
          </div>
          <ul class="scr-vista-lista" id="sim-st-list"></ul>
          ${entries.length ? '<button class="btn btn-danger" id="sim-st-clear">🗑 Elimina tutte le prove</button>' : ''}
        </div>`;
      showModal('🗂 Prove svolte', html, () => {}, 'Chiudi');
      const mc = document.getElementById('modalConfirm'); if (mc) mc.style.display = 'none';

      function render() {
        const list = document.getElementById('sim-st-list');
        if (!list) return;
        let arr = _loadStorico().filter(r => {
          if (!stato.q) return true;
          const t = (new Date(r.ts).toLocaleString('it-IT') + ' ' + (r.idoneo ? 'idoneo' : 'non idoneo')).toLowerCase();
          return t.includes(stato.q);
        });
        arr.sort(stato.sort === 'voto_desc' ? (a, b) => (b.votoFinale || 0) - (a.votoFinale || 0)
               : stato.sort === 'voto_asc' ? (a, b) => (a.votoFinale || 0) - (b.votoFinale || 0)
               : (a, b) => (b.ts || '').localeCompare(a.ts || ''));
        list.innerHTML = arr.length ? arr.map(r => `
          <li class="scr-vista-clic sim-st-row" data-open="${_esc(r.id || '')}">
            <span class="scr-vista-voto ${_votoClasse(r.votoFinale || 0)}">${r.votoFinale != null ? r.votoFinale.toFixed(1) : '—'}/30</span>
            <span class="sim-esito ${r.idoneo ? 'ok' : 'ko'}">${r.idoneo ? 'IDONEO' : 'NON IDONEO'}</span>
            <span class="scr-vista-data">${_esc(new Date(r.ts).toLocaleString('it-IT'))}</span>
            <span class="sim-st-voti">${r.votoPre != null ? 'Pre ' + r.votoPre.toFixed(1) : ''}${r.votoScritto != null ? ' · Scr ' + r.votoScritto.toFixed(1) : ''}</span>
            <button class="sim-st-del" data-del="${_esc(r.id || '')}" title="Elimina questa prova">🗑</button>
            <span class="scr-vista-go">apri ›</span>
          </li>`).join('') : '<li class="scr-vuoto">Nessun risultato.</li>';

        list.querySelectorAll('.sim-st-row').forEach(li => li.addEventListener('click', (e) => {
          if (e.target.closest('.sim-st-del')) return; // il cestino non apre
          const rec = _loadStorico().find(x => x.id === li.dataset.open);
          if (rec) { closeModal(); _renderProvaStorica(rec); }
        }));
        list.querySelectorAll('.sim-st-del').forEach(b => b.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = b.dataset.del;
          showModal('Eliminare questa prova?', 'La prova verrà rimossa dallo storico. Irreversibile.', () => {
            _deleteStorico(id);
            _mostraStorico(); // riapre aggiornato
          }, 'Sì, elimina');
        }));
      }

      setTimeout(() => {
        const qEl = document.getElementById('sim-st-q');
        if (qEl) qEl.addEventListener('input', () => { stato.q = qEl.value.trim().toLowerCase(); render(); });
        const sEl = document.getElementById('sim-st-sort');
        if (sEl) sEl.addEventListener('change', () => { stato.sort = sEl.value; render(); });
        const cl = document.getElementById('sim-st-clear');
        if (cl) cl.addEventListener('click', () => {
          closeModal();
          showModal('Eliminare TUTTE le prove?', 'Verranno rimosse tutte le prove svolte dallo storico. Irreversibile.', () => {
            salvaInStorage(SK_STORICO, []); _mostraStorico();
          }, 'Sì, elimina tutte');
        });
        render();
      }, 30);
    }

    function _deleteStorico(id) {
      const s = _loadStorico().filter(r => r.id !== id);
      salvaInStorage(SK_STORICO, s);
    }

    // ─── Visualizzatore READ-ONLY di una prova salvata ───
    function _renderProvaStorica(rec) {
      const main = document.getElementById('main');
      const mostraFinale = rec.config && rec.config.includePre && rec.config.includeScritto;
      const preBlock = rec.pre ? `
        <div class="sim-res-row"><span>Preselettiva</span><strong class="${_votoClasse(rec.pre.voto)}">${rec.pre.voto.toFixed(1)}/30 ${rec.pre.voto >= SOGLIA ? '✓' : '✗'}</strong></div>
        <div class="sim-storico-sub">${rec.pre.esatte} esatte · ${rec.pre.sbagliate} sbagliate · ${rec.pre.nonRisp} non risposte</div>` : '';
      const scrBlock = rec.scritto ? `
        <div class="sim-res-row"><span>Prova scritta (media ${rec.scritto.quesiti.length} quesiti)</span><strong class="${_votoClasse(rec.scritto.voto)}">${rec.scritto.voto.toFixed(1)}/30 ${rec.scritto.voto >= SOGLIA ? '✓' : '✗'}</strong></div>
        <div class="sim-quesiti-dettaglio">
          ${rec.scritto.quesiti.map((id, k) => {
            const v = (rec.scritto.valutazioni && rec.scritto.valutazioni[id]) || {};
            const q = _quesitoById(id);
            const testo = (rec.scritto.testi && rec.scritto.testi[id]) || '';
            return `<details class="sim-ques-det">
              <summary><span class="sim-ques-n">Quesito ${k + 1}</span> <span class="${_votoClasse(v.voto || 0)}">${(v.voto || 0)}/30</span> <span class="sim-ques-mat">${_esc(q ? q.materia : '')}</span></summary>
              <div class="sim-ques-body">
                <div class="sim-ques-giud">${_esc(v.giudizioSintetico || '')}</div>
                ${v.feedback ? `<div class="sim-ques-fb">${_esc(v.feedback)}</div>` : ''}
                ${q ? `<details class="sim-ques-testo"><summary>Traccia ed elaborato</summary><div class="sim-rev-dom" style="margin-top:8px">${_esc(q.domanda)}</div><div class="sim-ques-fb"><strong>Il tuo elaborato:</strong><br>${_esc(testo) || '<em>(vuoto)</em>'}</div></details>` : ''}
              </div>
            </details>`;
          }).join('')}
        </div>` : '';
      main.innerHTML = `
        <div class="quiz-session">
          <div class="page-header"><button class="btn btn-ghost" id="sim-st-back">← Prove svolte</button>
            <h1 class="page-title" style="margin-top:10px">🗂 Prova del ${_esc(new Date(rec.ts).toLocaleString('it-IT'))}</h1>
          </div>
          <div class="results-header">
            <div class="results-voto-sub">${mostraFinale ? 'Voto finale (media)' : 'Voto'}</div>
            <div class="results-voto ${rec.idoneo ? 'sufficiente' : 'insufficiente'}">${(rec.votoFinale || 0).toFixed(1)} <span style="font-size:36px;color:var(--text-muted)">/30</span></div>
            <div class="results-voto-sub sim-esito ${rec.idoneo ? 'ok' : 'ko'}">${rec.idoneo ? '✅ IDONEO' : '❌ NON IDONEO'}</div>
          </div>
          <div class="sim-res-card">
            ${preBlock}
            ${scrBlock}
            ${mostraFinale ? `<div class="sim-res-row sim-res-final"><span>Voto finale</span><strong class="${_votoClasse(rec.votoFinale || 0)}">${(rec.votoFinale || 0).toFixed(1)}/30</strong></div>` : ''}
          </div>
          ${rec.pre && rec.pre.dettaglio && rec.pre.dettaglio.length ? `<div class="quiz-controls" style="margin-top:16px"><div class="quiz-controls-left"><button class="btn" id="sim-st-rivedi-pre">🔍 Rivedi i quiz della preselettiva</button></div></div>` : ''}
        </div>`;
      document.getElementById('sim-st-back').addEventListener('click', () => { navigaA('simulazione'); aggiornaNavSidebar('simulazione'); setTimeout(_mostraStorico, 60); });
      const rp = document.getElementById('sim-st-rivedi-pre');
      if (rp) rp.addEventListener('click', () => _renderRevisioneStorica(rec));
    }

    // Revisione quiz preselettiva da un record salvato.
    function _renderRevisioneStorica(rec) {
      const d = (rec.pre && rec.pre.dettaglio) || [];
      const main = document.getElementById('main');
      const esitoTag = (e, tua) => (tua === null || tua === 'SKIP') ? '<span class="sim-rev-tag na">— non risposto</span>' : (e ? '<span class="sim-rev-tag ok">✓ corretta</span>' : '<span class="sim-rev-tag ko">✗ sbagliata</span>');
      main.innerHTML = `
        <div class="quiz-session sim-revisione">
          <div class="page-header"><button class="btn btn-ghost" id="sim-strev-back">← Torna alla prova</button>
            <h1 class="page-title" style="margin-top:10px">🔍 Revisione preselettiva</h1></div>
          ${d.map((q, k) => `
            <div class="sim-rev-card ${q.esito === true ? 'ok' : (q.tua === null || q.tua === 'SKIP') ? 'na' : 'ko'}">
              <div class="sim-rev-head"><span class="sim-rev-n">${k + 1}</span> <span class="sim-rev-mat">${_esc(q.materia)}</span> ${esitoTag(q.esito, q.tua)}</div>
              <div class="sim-rev-dom">${_esc(q.domanda)}</div>
              <div class="sim-rev-opts">
                ${q.opzioni.map(opt => {
                  let c = 'sim-rev-opt';
                  if (opt === q.corretta) c += ' giusta';
                  if (opt === q.tua && q.tua !== q.corretta && q.tua !== 'SKIP') c += ' tua-sbagliata';
                  return `<div class="${c}">${opt === q.corretta ? '✓ ' : (opt === q.tua && q.tua !== 'SKIP' ? '✗ ' : '')}${_esc(opt)}</div>`;
                }).join('')}
              </div>
            </div>`).join('')}
          <div class="quiz-controls" style="margin-top:24px"><div class="quiz-controls-left"><button class="btn btn-ghost" id="sim-strev-back2">← Torna alla prova</button></div></div>
        </div>`;
      const back = () => _renderProvaStorica(rec);
      document.getElementById('sim-strev-back').addEventListener('click', back);
      document.getElementById('sim-strev-back2').addEventListener('click', back);
    }

    // ─── Util ───
    let _saveDebounceT = null;
    function _saveCorrenteDebounced() { clearTimeout(_saveDebounceT); _saveDebounceT = setTimeout(_saveCorrente, 600); }
    function _simStopTimer() { if (_scrTimer) { clearInterval(_scrTimer); _scrTimer = null; } }

    // ─── Esposizione ───
    window.renderSimulazione = renderSimulazione;
    window.SimEngine = { finePreselettiva, _simStopTimer };
  })();
