  // ═══════════════════════════════════════════════════════
  // QUIZ ENGINE — Sessione quiz, timer, risultati
  // ═══════════════════════════════════════════════════════

  function renderQuizCorrente() {
    if (!SESSIONE) return;

    const i       = SESSIONE.iCorrente;
    const totale  = SESSIONE.quiz.length;
    const q       = SESSIONE.quiz[i];
    const corretti = SESSIONE.quiz.filter(x => x._corretta === true).length;
    const errati   = SESSIONE.quiz.filter(x => x._corretta === false).length;
    const lasciati = SESSIONE.quiz.filter(x => x._risposta_data === 'SKIP').length;

    const isSkipped   = q._risposta_data === 'SKIP';
    const hasAnswered = q._risposta_data !== null && !isSkipped;
    const showFeedback = SESSIONE.config.modalita === 'esercitazione' && hasAnswered;

    document.getElementById('main').innerHTML = `
      <div class="quiz-session">

        ${SESSIONE._modoRecuperoSkip ? `
          <div style="background:rgba(212,154,63,0.1);border:1px solid var(--amber);border-left:4px solid var(--amber);padding:10px 16px;border-radius:6px;margin-bottom:14px;color:var(--text-primary);font-size:13px;">
            🎯 <strong style="color:var(--amber-bright);">Recupero quiz lasciati</strong> · <span style="font-family:'JetBrains Mono',monospace;">${lasciati} ${lasciati === 1 ? 'quiz rimasto' : 'quiz rimasti'}</span>
          </div>
        ` : ''}

        <div class="quiz-topbar">
          <div class="quiz-progress-display">
            <span class="quiz-progress-numbers">
              <span class="current">${i + 1}</span>
              <span class="total">/ ${totale}</span>
            </span>
          </div>
          <div class="quiz-progress-bar">
            <div class="quiz-progress-bar-fill" style="width:${((i + 1) / totale * 100).toFixed(1)}%"></div>
          </div>
          ${SESSIONE.config._simulazione ? '' : `
          <div class="quiz-stats-inline">
            <span class="ok">✓ ${corretti}</span>
            <span class="ko">✗ ${errati}</span>
            <span title="Lasciati per dopo">↷ ${lasciati}</span>
          </div>`}
          ${SESSIONE.config.timerMode !== 'off' ? `
            <div class="quiz-timer" id="quizTimer">⏱ <span id="timerValue">00:00</span></div>
          ` : ''}
        </div>

        ${SESSIONE.config._simulazione ? `
          <div class="sim-dots" title="Verde = risposto · Grigio = da fare. Clicca un pallino per andare al quiz.">
            ${SESSIONE.quiz.map((qq, k) => {
              const ans = qq._risposta_data !== null && qq._risposta_data !== 'SKIP';
              return `<button class="sim-dot ${ans ? 'on' : 'todo'}${k === i ? ' cur' : ''}" data-sim-dot="${k}" title="Quiz ${k + 1}${ans ? '' : ' — da fare'}">${k + 1}</button>`;
            }).join('')}
          </div>` : ''}

        <div class="quiz-card">
          <div class="quiz-materia-tag">${q.materia || q._materia_id || '—'}</div>
          <div class="quiz-question">${escapeHTML(q.domanda)}</div>
          <div class="quiz-options">
            ${q._opzioni_mescolate.map((opt, idx) => {
              const letter = String.fromCharCode(65 + idx);
              let cls = 'quiz-option';
              if (hasAnswered) {
                cls += ' disabled';
                if (SESSIONE.config._simulazione) {
                  // Esame: NON rivelare giusta/sbagliata. Solo "selezionata".
                  if (opt === q._risposta_data) cls += ' selected';
                } else {
                  if (opt === q.corretta) cls += ' correct';
                  else if (opt === q._risposta_data) cls += ' wrong';
                }
              } else if (q._risposta_data === opt) {
                cls += ' selected';
              }
              // NB: usiamo data-quiz-opt-idx + event delegation invece di onclick
              // inline. Motivo: il testo dell'opzione può contenere QUALSIASI
              // carattere (backslash, apice, virgolette, line break, ecc.) e
              // iniettarlo in un attributo HTML/JS richiederebbe escape perfetto.
              // Con l'indice numerico nessun escape è necessario: il listener
              // recupera il testo da SESSIONE.quiz[i]._opzioni_mescolate.
              return `
                <div class="${cls}" data-quiz-opt-idx="${idx}">
                  <div class="opt-letter">${letter}</div>
                  <div class="opt-text">${escapeHTML(opt)}</div>
                </div>
              `;
            }).join('')}
          </div>

          ${showFeedback ? `
            <div class="quiz-feedback ${q._corretta ? 'ok' : 'ko'}">
              <strong>${q._corretta ? '✓ Corretta!' : '✗ Sbagliata'}</strong>
              ${q._corretta ? '' : `La risposta corretta è: ${escapeHTML(q.corretta)}`}
              ${(window.studioLinkPerQuiz && studioLinkPerQuiz(q))
                ? `<button class="btn btn-ghost quiz-studia-teoria" onclick="studioApriQuizCorrente()" title="Apri l'articolo di legge collegato a questo quiz in una finestra sopra la batteria: i progressi non si perdono">📖 Studia la teoria</button>`
                : ''}
            </div>
          ` : ''}

          <!-- Frecce di navigazione libera tra i quiz (avanti/indietro senza vincoli) -->
          ${i > 0 ? `<button class="quiz-nav-arrow quiz-nav-prev" title="Vai al quiz precedente" data-quiz-nav="prev">‹</button>` : ''}
          ${i < totale - 1 ? `<button class="quiz-nav-arrow quiz-nav-next" title="Vai al quiz successivo (anche senza rispondere)" data-quiz-nav="next">›</button>` : ''}
        </div>

        <div class="quiz-controls">
          <div class="quiz-controls-left"></div>
          <div class="quiz-controls-right">
            ${i > 0 ? `<button class="btn" onclick="vaiAQuiz(${i - 1})">← Indietro</button>` : ''}
            ${!hasAnswered && !SESSIONE._modoRecuperoSkip ? `<button class="btn" onclick="saltaQuiz()" title="Il quiz resterà da affrontare alla fine">${isSkipped ? 'Lasciato per dopo' : 'Lascia per dopo'} ↷</button>` : ''}
            <button class="btn btn-ghost" onclick="terminaBatteria(true)" title="Chiudi la batteria adesso. In Ranked i punti RP si ricevono solo se completi tutti i quiz.">Termina ora</button>
            ${hasAnswered || (isSkipped && !SESSIONE._modoRecuperoSkip) || SESSIONE.config.modalita === 'esame' ? `
              <button class="btn btn-primary" onclick="quizAvanti()">
                ${SESSIONE._modoRecuperoSkip
                  ? (lasciati <= 1 ? 'Concludi missione →' : 'Prossimo lasciato →')
                  : (i === totale - 1 ? 'Concludi batteria →' : 'Avanti →')}
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    // Listener delegato per le opzioni del quiz: usa data-quiz-opt-idx
    // per recuperare il testo dell'opzione (no escape JS richiesto).
    const opts = document.querySelectorAll('.quiz-option[data-quiz-opt-idx]');
    opts.forEach(el => {
      if (el.classList.contains('disabled')) return;   // dopo risposta data
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.quizOptIdx, 10);
        if (isNaN(idx)) return;
        const qNow = SESSIONE && SESSIONE.quiz[SESSIONE.iCorrente];
        if (!qNow || !qNow._opzioni_mescolate) return;
        const opt = qNow._opzioni_mescolate[idx];
        if (opt == null) return;
        rispondiQuiz(opt);
      });
    });
    // Simulazione: mappa a pallini → salta al quiz cliccato.
    document.querySelectorAll('[data-sim-dot]').forEach(el => {
      el.addEventListener('click', () => {
        const k = parseInt(el.dataset.simDot, 10);
        if (!isNaN(k)) vaiAQuiz(k);
      });
    });
    // Listener frecce di navigazione libera (avanti/indietro senza vincoli)
    document.querySelectorAll('[data-quiz-nav]').forEach(el => {
      el.addEventListener('click', () => {
        const dir = el.dataset.quizNav;
        if (!SESSIONE) return;
        if (dir === 'prev' && SESSIONE.iCorrente > 0) {
          vaiAQuiz(SESSIONE.iCorrente - 1);
        } else if (dir === 'next' && SESSIONE.iCorrente < SESSIONE.quiz.length - 1) {
          vaiAQuiz(SESSIONE.iCorrente + 1);
        }
      });
    });

    aggiornaTimerDisplay();
  }

  function escapeHTML(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(s) {
    if (s == null) return '';
    // ORDINE CRITICO: il backslash va escappato PRIMA, altrimenti i backslash
    // aggiunti dall'escape dell'apice verrebbero raddoppiati.
    // Se non escappi il backslash, sequenze come "165 \2001" vengono
    // interpretate da JS come escape OTTALE (\2 = char code 0x02) quando
    // la stringa viene interpolata in onclick="rispondiQuiz('...')",
    // causando confronti errati con q.corretta. Bug fix v0.7.
    return String(s)
      .replace(/\\/g, '\\\\')   // \ → \\
      .replace(/'/g, "\\'")     // ' → \'
      .replace(/"/g, '&quot;')  // " → &quot; (sicurezza attributo HTML)
      .replace(/\r?\n/g, ' ');  // newline → spazio
  }

  function rispondiQuiz(risposta) {
    const q = SESSIONE.quiz[SESSIONE.iCorrente];
    if (q._risposta_data !== null && q._risposta_data !== 'SKIP') return;
    q._risposta_data = risposta;
    q._corretta      = (risposta === q.corretta);

    // Simulazione d'esame: modalità ISOLATA. Niente diario/progress, niente
    // padroneggiamento, niente RP. L'esame è neutro rispetto alle statistiche.
    if (!SESSIONE.config._simulazione) {
      const progress = caricaProgress();
      const _modeRisp = SESSIONE.config._ranked ? 'ranked'
                      : SESSIONE.config._carriera ? 'carriera' : 'libero';
      progress.risposte.push({
        quiz_id:     quizId(q),
        materia_id:  q._materia_id,
        argomento_id: q.categorizzazione?.argomento_id,
        articolo:    q.categorizzazione?.articolo,
        risposta,
        corretta:    q._corretta,
        timestamp:   Date.now(),
        sessione:    SESSIONE.avvio,
        // Tracciamento sorgente (per Analisi Globale: filtro origine + finestra fonti)
        mode:        _modeRisp,
        saveId:      (_modeRisp === 'ranked' && window.SavesCore) ? SavesCore.getSaveAttivoId() : null,
      });
      salvaProgress(progress);

      // Dispatch hook in base alla modalità (Ranked / Libero).
      // Modalità Carriera/Missioni rimossa nella v0.7.
      if (SESSIONE.config._ranked) {
        rankedHookRisposta(q, risposta, q._corretta);
      } else if (typeof liberoHookRisposta === 'function') {
        liberoHookRisposta(q, risposta, q._corretta);
      }
    }

    if (SESSIONE.config.modalita === 'esame') {
      setTimeout(() => quizAvanti(), 200);
    } else {
      renderQuizCorrente();
    }
  }

  function saltaQuiz() {
    const q = SESSIONE.quiz[SESSIONE.iCorrente];
    q._risposta_data = 'SKIP';
    q._corretta      = null;
    quizAvanti();
  }

  function quizAvanti() {
    // Simulazione: avanzamento lineare. Le "non risposte" sono ammesse e
    // contano nel punteggio: nessun recupero forzato dei saltati. A fine lista
    // si consegna la preselettiva.
    if (SESSIONE.config && SESSIONE.config._simulazione) {
      if (SESSIONE.iCorrente >= SESSIONE.quiz.length - 1) {
        // Fine lista: NON consegna automaticamente. Chiede conferma, così
        // l'utente può annullare e rivedere i quiz "da fare" (pallini grigi).
        terminaBatteria(true);
        return;
      }
      SESSIONE.iCorrente++;
      renderQuizCorrente();
      return;
    }

    function trovaProssimoSkip(start) {
      for (let k = start; k < SESSIONE.quiz.length; k++)
        if (SESSIONE.quiz[k]._risposta_data === 'SKIP') return k;
      return -1;
    }
    function contaSkipResidui() {
      let n = 0;
      for (const q of SESSIONE.quiz) if (q._risposta_data === 'SKIP') n++;
      return n;
    }
    function contaNullResidui() {
      let n = 0;
      for (const q of SESSIONE.quiz) if (q._risposta_data === null) n++;
      return n;
    }

    if (!SESSIONE._modoRecuperoSkip && contaNullResidui() === 0 && contaSkipResidui() > 0) {
      SESSIONE._modoRecuperoSkip = true;
    }

    if (SESSIONE._modoRecuperoSkip) {
      let prox = trovaProssimoSkip(SESSIONE.iCorrente + 1);
      if (prox === -1 && contaSkipResidui() > 0) prox = trovaProssimoSkip(0);
      if (prox === -1) {
        SESSIONE._modoRecuperoSkip = false;
        terminaBatteria(false);
        return;
      }
      SESSIONE.iCorrente = prox;
      renderQuizCorrente();
      return;
    }

    if (SESSIONE.iCorrente >= SESSIONE.quiz.length - 1) {
      const indiciSkip = [];
      for (let k = 0; k < SESSIONE.quiz.length; k++)
        if (SESSIONE.quiz[k]._risposta_data === 'SKIP') indiciSkip.push(k);
      if (indiciSkip.length > 0) {
        showModal('Quiz lasciati per dopo',
          `Hai <strong>${indiciSkip.length}</strong> quiz lasciat${indiciSkip.length === 1 ? 'o' : 'i'} per dopo. Lo scopo dell'esercizio è affrontare tutti i quiz: ora ti faccio scorrere solo tra quelli. Se non sai rispondere, prova comunque — anche sbagliando si impara.`,
          () => {
            SESSIONE._modoRecuperoSkip = true;
            SESSIONE.iCorrente = indiciSkip[0];
            renderQuizCorrente();
                },
          'Vai ai quiz lasciati');
        return;
      }
      terminaBatteria(false);
      return;
    }

    SESSIONE.iCorrente++;
    renderQuizCorrente();
  }

  function vaiAQuiz(i) {
    if (i < 0 || i >= SESSIONE.quiz.length) return;
    SESSIONE.iCorrente = i;
    renderQuizCorrente();
  }

  // ═══════ Timer ═══════

  function avviaTimer() {
    if (SESSIONE.timerInterval) clearInterval(SESSIONE.timerInterval);
    if (SESSIONE.config.timerMode === 'off') return;
    SESSIONE.timerStart    = Date.now();
    SESSIONE.timerInterval = setInterval(aggiornaTimerDisplay, 500);
  }

  function aggiornaTimerDisplay() {
    if (!SESSIONE || SESSIONE.config.timerMode === 'off') return;
    const el = document.getElementById('quizTimer');
    if (!el) return;
    const elapsed = Math.floor((Date.now() - SESSIONE.timerStart) / 1000);

    if (SESSIONE.config.timerMode === 'limite') {
      const totale  = SESSIONE.config.timerMinuti * 60;
      const rimasti = totale - elapsed;
      if (rimasti <= 0) {
        document.getElementById('timerValue').textContent = '00:00';
        el.classList.add('danger');
        clearInterval(SESSIONE.timerInterval);
        toast('Tempo scaduto!', true);
        terminaBatteria(false);
        return;
      }
      const min = Math.floor(rimasti / 60);
      const sec = rimasti % 60;
      document.getElementById('timerValue').textContent = `${pad(min)}:${pad(sec)}`;
      if (rimasti < 60)  el.classList.add('danger');
      else if (rimasti < 300) el.classList.add('warning');
    } else {
      const min = Math.floor(elapsed / 60);
      const sec = elapsed % 60;
      document.getElementById('timerValue').textContent = `${pad(min)}:${pad(sec)}`;
    }
  }

  function pad(n) { return n.toString().padStart(2, '0'); }

  // ═══════ Termina e risultati ═══════

  function terminaBatteria(confermaUtente) {
    // Simulazione d'esame: ramo isolato. Consegna → calcolo voto via SimEngine.
    if (SESSIONE.config && SESSIONE.config._simulazione) {
      if (confermaUtente && !SESSIONE.terminata) {
        const fatti = SESSIONE.quiz.filter(q => q._risposta_data !== null && q._risposta_data !== 'SKIP').length;
        showModal('Consegnare la preselettiva?',
          `Hai risposto a <strong>${fatti} di ${SESSIONE.quiz.length}</strong> quiz. Le non risposte verranno conteggiate col punteggio scelto. Consegnare ora?`,
          () => terminaBatteria(false), 'Sì, consegna');
        return;
      }
      SESSIONE.terminata = true;
      if (SESSIONE.timerInterval) clearInterval(SESSIONE.timerInterval);
      SESSIONE.tempoTotale = Math.floor((Date.now() - SESSIONE.timerStart) / 1000);
      if (window.SimEngine) window.SimEngine.finePreselettiva(SESSIONE);
      return;
    }

    if (confermaUtente && !SESSIONE.terminata) {
      const fatti     = SESSIONE.quiz.filter(q => q._risposta_data !== null && q._risposta_data !== 'SKIP').length;
      const totali    = SESSIONE.quiz.length;
      const èRankedC  = SESSIONE.config && SESSIONE.config._ranked;
      let messaggio;
      if (èRankedC && fatti < totali) {
        messaggio = `Hai completato <strong>${fatti} di ${totali}</strong> quiz. `
          + `⚠ In Ranked i <strong>punti RP si guadagnano solo terminando l'intera batteria</strong>: `
          + `i quiz già fatti resteranno conteggiati nei contatori del giorno, ma il rank non si muoverà. `
          + `Vuoi davvero terminare ora?`;
      } else {
        messaggio = `Hai completato ${fatti} su ${totali} quiz. Vedrai comunque i risultati.`;
      }
      showModal('Terminare la batteria?', messaggio, () => terminaBatteria(false));
      return;
    }

    SESSIONE.terminata  = true;
    if (SESSIONE.timerInterval) clearInterval(SESSIONE.timerInterval);
    SESSIONE.tempoTotale = Math.floor((Date.now() - SESSIONE.timerStart) / 1000);

    const èRanked    = SESSIONE.config && SESSIONE.config._ranked;
    const fatti      = SESSIONE.quiz.filter(q => q._risposta_data !== null && q._risposta_data !== 'SKIP').length;
    const tuttiFatti = fatti === SESSIONE.quiz.length;

    if (èRanked) {
      // Fine round Ranked: applica la sommatoria RP SOLO se la batteria è
      // stata terminata per intero. Se l'utente esce in anticipo, i conteggi
      // del giorno (fatti/corrette/errate) restano aggiornati ma non c'è
      // alcun movimento del rank. Idempotente.
      rankedHookFineRound(tuttiFatti);
      if (!tuttiFatti) {
        navigaA('ranked');
        aggiornaNavSidebar('ranked');
        return;
      }
      // round completo → prosegue verso la schermata risultati
    }

    const progress  = caricaProgress();
    const corretti  = SESSIONE.quiz.filter(q => q._corretta === true).length;
    const errati    = SESSIONE.quiz.filter(q => q._corretta === false).length;
    const saltati   = SESSIONE.quiz.filter(q => q._risposta_data === 'SKIP' || q._risposta_data === null).length;
    progress.sessioni.push({
      timestamp: SESSIONE.avvio,
      tipo:      èRanked ? 'ranked' : 'allenamento_libero',
      modalita:  SESSIONE.config.modalita,
      pool:      SESSIONE.config.pool,
      totale:    SESSIONE.quiz.length,
      corretti, errati, saltati,
      tempo:     SESSIONE.tempoTotale,
    });
    salvaProgress(progress);

    renderRisultati();
  }

  function renderRisultati() {
    const totale  = SESSIONE.quiz.length;
    const corretti = SESSIONE.quiz.filter(q => q._corretta === true).length;
    const errati   = SESSIONE.quiz.filter(q => q._corretta === false).length;
    const saltati  = totale - corretti - errati;

    const punteggio        = (corretti * 0.75) - (errati * 0.25);
    const punteggioMassimo = totale * 0.75;
    const votoTrentesimi   = punteggioMassimo > 0 ? (punteggio / punteggioMassimo * 30) : 0;
    const sufficiente      = votoTrentesimi >= 21;

    const min = Math.floor(SESSIONE.tempoTotale / 60);
    const sec = SESSIONE.tempoTotale % 60;

    const perMateria = {};
    for (const q of SESSIONE.quiz) {
      const m = q._materia_id || '_';
      if (!perMateria[m]) perMateria[m] = { tot: 0, ok: 0, ko: 0, skip: 0 };
      perMateria[m].tot++;
      if (q._corretta === true)  perMateria[m].ok++;
      else if (q._corretta === false) perMateria[m].ko++;
      else perMateria[m].skip++;
    }

    const sbagliati = SESSIONE.quiz.filter(q => q._corretta === false);

    document.getElementById('main').innerHTML = `
      <div class="quiz-session">
        <div class="results-header">
          <div class="results-voto-sub">Voto stimato</div>
          <div class="results-voto ${sufficiente ? 'sufficiente' : 'insufficiente'}">${votoTrentesimi.toFixed(1)} <span style="font-size:36px; color:var(--text-muted)">/30</span></div>
          <div class="results-voto-sub">${sufficiente ? '✓ Soglia raggiunta (21/30)' : '✗ Sotto soglia (21/30)'} · Punteggio reale: ${punteggio.toFixed(2)} su ${punteggioMassimo.toFixed(2)}</div>

          <div class="results-breakdown">
            <div class="result-stat ok">
              <div class="result-stat-label">Corrette</div>
              <div class="result-stat-value">${corretti}</div>
            </div>
            <div class="result-stat ko">
              <div class="result-stat-label">Errate</div>
              <div class="result-stat-value">${errati}</div>
            </div>
            <div class="result-stat skip">
              <div class="result-stat-label">Saltate</div>
              <div class="result-stat-value">${saltati}</div>
            </div>
            <div class="result-stat neutral">
              <div class="result-stat-label">Tempo</div>
              <div class="result-stat-value">${pad(min)}:${pad(sec)}</div>
            </div>
          </div>
        </div>

        ${Object.keys(perMateria).length > 1 ? `
          <div class="config-card">
            <div class="config-card-title">Breakdown per materia</div>
            ${Object.entries(perMateria).map(([m, s]) => {
              const pct  = s.tot > 0 ? (s.ok / s.tot * 100).toFixed(0) : 0;
              const nome = (STATE.pacchetto.programma.materie.find(mm => mm.id === m) || {}).nome || m;
              return `
                <div style="display:grid; grid-template-columns:1fr auto auto; gap:12px; padding:8px 0; border-bottom:1px solid var(--border-soft); font-size:13px">
                  <div>${nome}</div>
                  <div style="font-family:var(--font-mono); font-size:12px"><span style="color:var(--sage-bright)">${s.ok}</span>·<span style="color:var(--rust-bright)">${s.ko}</span>·${s.skip}/${s.tot}</div>
                  <div style="font-family:var(--font-mono); font-weight:600; color:${pct >= 70 ? 'var(--sage-bright)' : 'var(--rust-bright)'}">${pct}%</div>
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}

        ${sbagliati.length > 0 ? (
          SESSIONE.config._ranked ? `
            <div class="wrong-summary" style="margin-top:24px;padding:18px 20px;background:rgba(194,96,74,0.06);border:1px solid var(--rust);border-radius:10px;">
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
                <span style="font-size:22px;">🎯</span>
                <div style="font-family:'EB Garamond',serif;font-size:19px;color:var(--rust-bright);font-weight:500;">${sbagliati.length} quiz da consolidare</div>
              </div>
              <p style="margin:0;color:var(--text-secondary);font-size:13px;line-height:1.5;">
                Non serve una lista: in Ranked gli errori <strong>tornano automaticamente con priorità</strong>
                nei prossimi round (fino al 55% delle domande) finché non li padroneggi —
                3 risposte corrette in giorni diversi. Il rank salirà davvero solo quando li avrai consolidati.
              </p>
            </div>
          ` : `
            <div class="wrong-list">
              <div class="section-header" style="margin-top: 32px">
                <div class="section-title">Quiz sbagliati (${sbagliati.length})</div>
                <div class="section-meta">Rivedi le risposte</div>
              </div>
              ${sbagliati.map(q => `
                <div class="wrong-quiz-item">
                  <div class="wrong-quiz-meta">${q.materia || q._materia_id}</div>
                  <div class="wrong-quiz-q">${escapeHTML(q.domanda)}</div>
                  <div class="wrong-quiz-your">${escapeHTML(q._risposta_data === 'SKIP' ? '(saltata)' : q._risposta_data)}</div>
                  <div class="wrong-quiz-correct">${escapeHTML(q.corretta)}</div>
                </div>
              `).join('')}
            </div>
          `
        ) : ''}

        ${SESSIONE.config._ranked ? (() => {
          const r = rankedHookFineRoundRiepilogo();
          if (!r) return '';
          const rp = r.rpRound;
          const corr = r.rankAttuale.corrente;
          const valori = rankedValoriRP();
          const target = r.daily.target || 0;
          const fatti  = r.daily.fatti  || 0;
          const perc   = target > 0 ? Math.min(100, Math.round(fatti/target*100)) : 0;
          return `
            <div class="car-xp-summary" style="border-color:${corr.lega.colorBase};">
              <h4>🏆 Riepilogo della sessione Ranked</h4>
              <div class="xp-row"><span>Risposte corrette</span><strong>${r.corrette}</strong></div>
              <div class="xp-row"><span>Risposte errate</span><strong>${r.errate}</strong></div>
              <div class="xp-tot"><span>Punti rank (RP) di questa sessione</span><strong>${rp >= 0 ? '+' : ''}${rp.toFixed(1)}</strong></div>
              <div class="xp-row" style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px;">
                <span>Livello attuale (rank): <strong>${corr.etichetta}</strong></span>
                <strong>${Math.round(r.rankAttuale.rp)}/${r.rankAttuale.costoProssimo || '∞'} punti</strong>
              </div>
              <div class="xp-row">
                <span>Valore risposte in ${corr.lega.nome}</span>
                <strong>✓ +${valori.corretta} · ✗ ${valori.errata}</strong>
              </div>
              <div class="xp-row">
                <span>Obiettivo di quiz per oggi</span>
                <strong>${fatti}/${target} (${perc}%)</strong>
              </div>
            </div>
          `;
        })() : ''}

        <div class="quiz-controls" style="margin-top:32px">
          <div class="quiz-controls-left">
            <button class="btn btn-ghost" onclick="${
              SESSIONE.config._ranked   ? `navigaA('ranked'); aggiornaNavSidebar('ranked')`
              : `navigaA('libera'); aggiornaNavSidebar('libera')`
            }">← ${
              SESSIONE.config._ranked   ? 'Torna alla Ranked'
              : 'Torna all\'Allenamento Libero'
            }</button>
          </div>
          <div class="quiz-controls-right">
            ${sbagliati.length > 0 && !SESSIONE.config._ranked ? `<button class="btn" onclick="ripetiSoloErrori()">Ripeti solo errori</button>` : ''}
            ${SESSIONE.config._ranked
              ? `<button class="btn btn-primary" onclick="navigaA('ranked'); aggiornaNavSidebar('ranked')">Vai alla Ranked</button>`
              : `<button class="btn btn-primary" onclick="renderAllenamentoLibero()">Nuova batteria</button>`}
          </div>
        </div>
      </div>
    `;
  }

  function ripetiSoloErrori() {
    const sbagliati = SESSIONE.quiz.filter(q => q._corretta === false);
    SESSIONE = {
      config: { ...SESSIONE.config },
      quiz: sbagliati.map((q, idx) => ({
        ...q,
        _idx: idx,
        _opzioni_mescolate: shuffle([...q.opzioni]),
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
    avviaTimer();
    renderQuizCorrente();
  }
