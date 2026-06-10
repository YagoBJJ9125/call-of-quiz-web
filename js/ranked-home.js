  // ═══════════════════════════════════════════════════════
  // RANKED HOME — Pagina principale: header rank, obiettivo, round
  // ═══════════════════════════════════════════════════════

  // — Entry point chiamato da nav.js —
  function renderRanked() {
    if (!STATE.pacchetto) {
      document.getElementById('main').innerHTML = `
        <div class="empty-state">
          <h2>Pacchetto non caricato</h2>
          <p>Carica prima un pacchetto bando per accedere alla modalità Ranked.</p>
        </div>`;
      return;
    }
    const profilo = rankedAssicuraProfilo();
    // Prima volta: mostra la pagina di introduzione/avvio
    if (!profilo.introVista) {
      renderRankedIntro();
      return;
    }
    // Migrazione one-shot del rank al nuovo sistema (curva progressiva).
    // Se ritorna info ≠ null, mostro un banner dedicato che spiega lo spostamento.
    const migr = rankedMigraStato();
    rankedRollover();   // applica eventuali chiusure di giornata + decay
    rankedRender();
    // Se è appena avvenuta la migrazione, banner informativo PRIMA del banner pending.
    if (migr) rankedMostraBannerMigrazione(migr);
    // Banner della transizione di rank dell'ultimo round (popup centrato)
    const pend = rankedLeggiTransizionePending();
    if (pend && !migr) rankedMostraBannerTransizione(pend);
    // Banner "📥 mentre giocavi altrove..." per le transizioni in background
    // accumulate dalla propagazione live cross-save (Fase 3 + 6)
    if (window.SavesPropagation && window.SavesCore) {
      try {
        const sid = SavesCore.getSaveAttivoId();
        if (sid) SavesPropagation.mostraBannerTransizioniBackgroundSeServono(sid);
      } catch (e) { console.warn('banner background:', e); }
    }
  }

  // — Pagina di introduzione e avvio della Modalità Ranked —
  function renderRankedIntro() {
    const leghe = RANKED_LEGHE;
    document.getElementById('main').innerHTML = `
      <div class="ranked-intro">
        <div class="rki-hero" data-tilt3d="6">
          <div class="rki-hero-fx" aria-hidden="true">
            <div class="rki-burst"></div>
            <div class="rki-halftone"></div>
          </div>
          <div class="rki-emblema">🏆</div>
          <div class="rki-kicker">◆ MODALITÀ CLASSIFICATA ◆</div>
          <h1 class="rki-title">RANKED</h1>
          <p class="rki-lead">La salita competitiva verso il titolo di <strong>Maestro del Concorso</strong>.</p>
        </div>

        <div class="rki-block">
          <div class="rki-block-h">⛰ Le 7 leghe da scalare</div>
          <div class="rki-ladder">
            ${leghe.map((l, i) => `
              <div class="rki-lega" style="--lg:${l.colorBase};--lg2:${l.colorAccent};">
                <div class="rki-lega-emblema">${rankedSimboloHTML(l)}</div>
                <div class="rki-lega-nome">${l.nome}</div>
              </div>
              ${i < leghe.length - 1 ? '<div class="rki-ladder-sep">▸</div>' : ''}
            `).join('')}
          </div>
        </div>

        <div class="rki-block">
          <div class="rki-block-h">⚙ Come funziona</div>
          <div class="rki-rules">
            ${_rkiRule('⚔', 'Round di gioco', 'Ogni sessione è un round di quiz: scegli tu quanti (da 10 a 50). Le risposte contano subito.')}
            ${_rkiRule('📊', 'Punti Rank (RP)', 'Ogni risposta vale RP — positivi se giusta, negativi se sbagliata. Accumulati 100 RP sali di un sotto-livello.')}
            ${_rkiRule('🏅', '7 leghe × 4 livelli', 'Rame → Bronzo → Argento → Oro → Platino → Diamante → Maestro. Ogni lega ha 4 sotto-livelli interni.')}
            ${_rkiRule('🎯', 'Obiettivo giornaliero', 'Un target di quiz al giorno, calcolato sulla data della prova. Completarlo dà bonus RP a fine giornata.')}
            ${_rkiRule('🔥', 'Streak', 'Giorni consecutivi in cui completi l\'obiettivo: più la streak cresce, più bonus RP guadagni.')}
            ${_rkiRule('⚠', 'Errori in priorità', 'I quiz sbagliati ritornano con priorità nei round successivi finché non li padroneggi: 3 risposte giuste in 3 giorni diversi.')}
            ${_rkiRule('📈', 'Difficoltà crescente', 'Ai rank bassi sali in fretta. Ai rank alti la risposta sbagliata pesa più di quella giusta: solo la precisione ti fa salire.')}
          </div>
        </div>

        <div class="rki-cta">
          <button class="btn btn-primary rki-btn" id="rki-avvia">⚡ Avvia Modalità Ranked</button>
          <div class="rki-cta-note">Partirai da <strong>Rame IV</strong>. La salita inizia adesso.</div>
        </div>
      </div>
    `;
    document.getElementById('rki-avvia').addEventListener('click', () => {
      const p = rankedAssicuraProfilo();
      p.introVista = true;
      rankedSalvaProfilo(p);
      renderRanked();
    });
    if (typeof attaccaTilt3D === 'function') attaccaTilt3D();
  }

  function _rkiRule(icona, titolo, desc) {
    return `
      <div class="rki-rule">
        <div class="rki-rule-icon">${icona}</div>
        <div class="rki-rule-body">
          <div class="rki-rule-titolo">${titolo}</div>
          <div class="rki-rule-desc">${desc}</div>
        </div>
      </div>
    `;
  }

  // — Banner popup centrato: promozione / retrocessione —
  function rankedMostraBannerTransizione(pend) {
    const overlay = document.getElementById('rkBannerOverlay');
    if (!overlay || !pend || !pend.livelloDopo) return;
    const promo = pend.tipo === 'promozione';
    const dopo  = pend.livelloDopo;
    const lega  = dopo.lega;

    const banner = document.getElementById('rkBanner');
    banner.style.setProperty('--rk-base',   lega.colorBase);
    banner.style.setProperty('--rk-accent', lega.colorAccent);

    document.getElementById('rkBannerEmblema').innerHTML = promo ? rankedSimboloHTML(lega) : '📉';
    const tipoEl = document.getElementById('rkBannerTipo');
    tipoEl.textContent = promo ? 'PROMOZIONE' : 'RETROCESSIONE';
    tipoEl.className   = 'rk-banner-tipo ' + (promo ? 'promo' : 'demo');
    document.getElementById('rkBannerRank').textContent = dopo.etichetta;
    document.getElementById('rkBannerSub').textContent = promo
      ? `Complimenti! Sei salito da ${pend.livelloPrima.etichetta} a ${dopo.etichetta}.`
      : `Sei sceso da ${pend.livelloPrima.etichetta} a ${dopo.etichetta}. Recupera gli errori e risali.`;

    overlay.classList.add('active');
    document.getElementById('rkBannerBtn').onclick = () => overlay.classList.remove('active');
  }

  // — Banner popup: migrazione one-shot al nuovo sistema rank progressivo —
  //   Mostrato la PRIMA volta che si apre la home dopo l'introduzione della
  //   curva di costo variabile. Spiega all'utente perché il suo rank è
  //   "cambiato": è un ricalcolo onesto sui punti accumulati col vecchio sistema.
  function rankedMostraBannerMigrazione(migr) {
    const overlay = document.getElementById('rkBannerOverlay');
    if (!overlay || !migr || !migr.livelloDopo) return;
    const dopo = migr.livelloDopo;
    const prima = migr.livelloPrima;
    const stessoLivello = prima.sublevelIndice === dopo.sublevelIndice;
    const sceso = dopo.sublevelIndice < prima.sublevelIndice;
    const lega = dopo.lega;

    const banner = document.getElementById('rkBanner');
    banner.style.setProperty('--rk-base',   lega.colorBase);
    banner.style.setProperty('--rk-accent', lega.colorAccent);

    document.getElementById('rkBannerEmblema').innerHTML = rankedSimboloHTML(lega);
    const tipoEl = document.getElementById('rkBannerTipo');
    tipoEl.textContent = 'SISTEMA RANK AGGIORNATO';
    tipoEl.className   = 'rk-banner-tipo ' + (sceso ? 'demo' : 'promo');
    document.getElementById('rkBannerRank').textContent = dopo.etichetta;

    let testo;
    if (stessoLivello) {
      testo = `La curva di salita è ora progressiva — i sub-livelli successivi richiedono più punti. Il tuo rank è rimasto ${dopo.etichetta}.`;
    } else if (sceso) {
      testo = `Curva di salita ora progressiva: i sub-livelli alti richiedono più punti. In base ai tuoi ${migr.oldTotale} punti accumulati col vecchio sistema, il tuo rank è stato ricalcolato da ${prima.etichetta} a ${dopo.etichetta}. Niente di cui preoccuparsi: è il rank che davvero rispecchia il tuo percorso. Da qui in poi salirai con i nuovi costi.`;
    } else {
      testo = `Curva aggiornata. Ricalcolo onesto: il tuo rank è ${dopo.etichetta}.`;
    }
    document.getElementById('rkBannerSub').textContent = testo;

    overlay.classList.add('active');
    document.getElementById('rkBannerBtn').onclick = () => overlay.classList.remove('active');
  }

  // ─── Avanzamento banca dati del save attivo (piano corrente) ────────
  // Conta i quiz del piano (materie incluse, argomenti esclusi rimossi).
  // Ritorna { tot, padron, affrontati, perc, saveId, saveNome }.
  function _rkCalcolaAvanzamentoBanca() {
    if (!STATE.pacchetto || !window.SavesCore) {
      return { tot: 0, padron: 0, affrontati: 0, perc: 0, saveId: null, saveNome: null };
    }
    const sv = SavesCore.getSaveAttivo();
    if (!sv) return { tot: 0, padron: 0, affrontati: 0, perc: 0, saveId: null, saveNome: null };

    // Usa il filtro centrale (materie + argomenti esclusi)
    const filtro = SavesCore.getFiltroPianoAttivo
                    ? SavesCore.getFiltroPianoAttivo() : null;
    const padronMap = (typeof carCaricaPadron === 'function') ? (carCaricaPadron() || {}) : {};

    // "Affrontati" = quiz UNICI affrontati IN QUESTO SAVE (diario del save),
    // NON il progress globale. Così combacia con la Mappatura Materie Ranked.
    // tentativiPerId = quante volte ho risposto a ciascun quiz (per i doppioni).
    const tentativiPerId = new Map();
    let diarioSave = null;
    try { diarioSave = SavesCore.leggiSave(sv.id, 'cm:carriera:diario'); } catch (_) {}
    if (diarioSave) {
      // Save = mondo Ranked: conto SOLO le risposte mode='ranked'.
      for (const day of Object.values(diarioSave)) {
        if (!day || !day.risposte) continue;
        for (const r of day.risposte) {
          if (!r.quiz_id || r.mode !== 'ranked') continue;
          tentativiPerId.set(r.quiz_id, (tentativiPerId.get(r.quiz_id) || 0) + 1);
        }
      }
    }

    // Dedup per quiz_id: stesso ID nelle banche multiple → conta UNA volta.
    const idsInPiano = new Set();
    for (const m of STATE.pacchetto.manifest.moduli) {
      if (filtro && filtro.materieAmmesse && !filtro.materieAmmesse.has(m.materia_id)) continue;
      const banca = STATE.pacchetto.banche[m.materia_id];
      if (!banca) continue;
      const arr = banca.categorizzati || banca.quiz || [];
      for (const q of arr) {
        const argId = q.categorizzazione && q.categorizzazione.argomento_id;
        if (filtro && !filtro.quizPassa(m.materia_id, argId)) continue;
        idsInPiano.add(quizId(q));
      }
    }
    let padron = 0, affrontati = 0, tentativi = 0;
    for (const id of idsInPiano) {
      const p = padronMap[id];
      if (èPadroneggiato(p)) padron++;
      const t = tentativiPerId.get(id);
      if (t) { affrontati++; tentativi += t; }   // affrontati = unici; tentativi = con doppioni
    }
    const tot = idsInPiano.size;
    return {
      tot, padron, affrontati, tentativi,
      perc: tot > 0 ? padron / tot : 0,
      saveId: sv.id, saveNome: sv.nome,
    };
  }

  function rankedRender() {
    const profilo = rankedAssicuraProfilo();
    const dimRound = profilo.dimensioneRound || RANKED_DIM_ROUND_DEFAULT;
    const rank   = rankedCalcolaRank();
    const daily  = rankedGetDaily();
    const stat1  = rankedStatPeriodo(1);
    const stat7  = rankedStatPeriodo(7);
    const stat30 = rankedStatPeriodo(30);
    const deboli = rankedMaterieDeboli();
    const nErrori = rankedContaErroriAperti();
    // Conteggio "errori recuperabili" per materia: stesso criterio di
    // nErrori e di rankedSelezionaRecupero — così i numeri quadrano ovunque.
    const erroriPerMateria = (typeof rankedErroriPerMateria === 'function')
      ? rankedErroriPerMateria() : {};
    const stato  = rankedCaricaStato();

    const corrente = rank.corrente;
    const prossimo = rank.prossimo;
    const picco    = rank.picco;
    const perc     = rank.percInterno;

    // Valori RP della lega corrente. Nessuna lega "protetta": si può scendere
    // fino a Rame 4 in caso di errori prolungati.
    const valori = rankedValoriRP(corrente.sublevelIndice);
    const protezioneTxt = corrente.isApice
      ? '👑 Apice raggiunto — sbagliando troppo puoi retrocedere'
      : '⚠ Ogni errore conta: sbagliando si scende, niente lega protetta';

    const target = daily.target || 0;
    const fatti  = daily.fatti  || 0;
    const percObiettivo = target > 0 ? Math.min(100, Math.round(fatti / target * 100)) : 0;
    const restantiObiettivo = Math.max(0, target - fatti);
    const obiettivoCompletato = target > 0 && fatti >= target;

    const denomReale = (daily.corrette || 0) + (daily.errate || 0);
    const accOggi = denomReale > 0 ? Math.round(daily.corrette / denomReale * 100) : null;
    const rpDeltaOggi = (daily.rpDelta && daily.rpDelta.totale) || 0;

    const acc1    = stat1.fatti > 0 ? Math.round(stat1.accuratezza * 100) : null;
    const acc7    = stat7.fatti > 0 ? Math.round(stat7.accuratezza * 100) : null;
    const acc30   = stat30.fatti > 0 ? Math.round(stat30.accuratezza * 100) : null;
    const giorniAttivi7 = stat7.giorniAttivi;
    const completati7   = stat7.completati;

    document.getElementById('main').innerHTML = `
      <div class="ranked-page">

        <div class="page-header rk-page-header page-header-bg pagebg-ranked">
          <div>
            <h1 class="page-title">🏆 Modalità Ranked Quiz <span class="rk-titolo-nota">(classificata)</span></h1>
          </div>
          <div class="rk-header-right">
            ${_pgTifosiHTML('ranked')}
            <button class="btn btn-ghost" id="rk-modifica-piano" title="Modifica materie e argomenti del piano di questo save">✎ Modifica Piano</button>
            <button class="btn btn-ghost" id="rk-vai-stats">📈 Visualizza i tuoi progressi</button>
          </div>
        </div>

        <!-- Header Rank -->
        <div class="rk-rank-card" style="--rk-base:${corrente.lega.colorBase};--rk-accent:${corrente.lega.colorAccent};">
          <div class="rk-rank-emblema">
            <div class="rk-emblema-cerchio">
              <div class="rk-emblema-icona">${rankedSimboloHTML(corrente.lega)}</div>
            </div>
            <div class="rk-emblema-sub">${corrente.sub ? ['','I','II','III','IV'][corrente.sub] : ''}</div>
          </div>
          <div class="rk-rank-info">
            <div class="rk-rank-label" title="Il tuo livello attuale nella modalità Ranked, ricalcolato in tempo reale a fine di ogni batteria completata">Rank attuale (il tuo livello)</div>
            <div class="rk-rank-nome">${corrente.lega.nome}</div>
            <div class="rk-rank-meta">
              ${corrente.isApice
                ? `<span class="rk-rp-max" title="Sei al massimo livello raggiungibile. Da qui si può solo retrocedere se peggiori molto.">Massimo apice raggiunto</span>`
                : `<div class="rk-rp-box ${rank.rp < 0 ? 'rk-rp-neg' : ''}" title="RP = Rank Points: punti di avanzamento. Ne servono ${rank.costoProssimo} per salire al prossimo sub-livello.">
                    <span class="rk-rp-val">${Math.round(rank.rp)}</span><span class="rk-rp-sep">/</span><span class="rk-rp-max">${rank.costoProssimo}</span>
                    <span class="rk-rp-lbl">RP</span>
                    ${rank.rp < 0 ? '<span class="rk-rp-debt">⚠ in debito</span>' : ''}
                  </div>`}
              ${picco.sublevelIndice > corrente.sublevelIndice
                ? `<span class="rk-picco" title="Il rank più alto che hai mai raggiunto. Resta visibile anche se scendi.">Record raggiunto (picco): ${picco.etichetta}</span>` : ''}
              <span class="rk-streak" title="Giorni consecutivi in cui hai fatto almeno un quiz Ranked. Si interrompe se salti un giorno intero. Da 3 in poi sblocca un piccolo bonus RP a fine giornata.">${stato.streak || 0} giorni consecutivi (streak)${(stato.streak||0) >= 3 ? ' 🔥' : ''}</span>
            </div>
            ${!corrente.isApice ? `
              <div class="rk-rank-progress">
                <div class="rk-rank-bar"><div class="rk-rank-fill" style="width:${perc}%"></div></div>
                <div class="rk-rank-progress-lbl">
                  ${prossimo ? `Ti mancano ${Math.max(0, rank.costoProssimo - Math.round(rank.rp))} punti (RP) per salire a ${prossimo.etichetta}` : ''}
                </div>
              </div>
            ` : ''}
            <div class="rk-rank-economia">
              <span class="rk-eco-item rk-eco-ok" title="Punti rank per ogni risposta corretta in questa lega">✓ risposta giusta: +${valori.corretta} punti</span>
              <span class="rk-eco-item rk-eco-ko" title="Punti rank persi per ogni risposta sbagliata in questa lega">✗ risposta sbagliata: ${valori.errata} punti</span>
            </div>
            <div class="rk-rank-protezione">${protezioneTxt}</div>
          </div>
        </div>

        <!-- Avanzamento banca dati del save (gemello del box "Analisi") -->
        ${(() => {
          const av = _rkCalcolaAvanzamentoBanca();
          if (!av.saveId || av.tot === 0) return '';
          const percAff = av.tot > 0 ? Math.round(av.affrontati / av.tot * 100) : 0;
          const ccAff =
            percAff >= 80 ? 'cop-alta'
            : percAff >= 45 ? 'cop-media'
            : percAff >  0  ? 'cop-bassa'
            : 'cop-nulla';
          // Battery bar con riempimento parziale (vedi commento in analisi-materie)
          const segNum = 20;
          const exactFill = percAff / 100 * segNum;
          const segPiene = Math.floor(exactFill);
          const partialFrac = exactFill - segPiene;
          const segments = Array.from({length: segNum}, (_, i) => {
            let fill = 0;
            if (i < segPiene) fill = 100;
            else if (i === segPiene) fill = Math.round(partialFrac * 100);
            const on = fill > 0 ? 'on' : '';
            return `<div class="battery-seg ${on} ${ccAff}" style="--fill:${fill}%"></div>`;
          }).join('');
          return `
            <div class="am-scope-box rk-banca-card">
              <div class="am-scope-h">
                <div class="am-scope-titolo">
                  <span class="am-scope-label">AVANZAMENTO BANCA DATI</span>
                  <span class="rk-banca-save">${escapeHTML(av.saveNome)}</span>
                </div>
                <div class="am-scope-perc"
                     title="Percentuale di quiz della banca che hai affrontato almeno una volta">
                  <strong class="${ccAff}">${percAff}%</strong> affrontato
                </div>
              </div>
              <div class="battery-bar" aria-label="${percAff}% affrontato">
                ${segments}
              </div>
              <div class="am-piano-meta">
                <span title="Quiz UNICI affrontati almeno una volta in questo save (al netto dei doppioni). È questo che riempie la barra."><strong>${av.affrontati.toLocaleString('it-IT')}</strong> / ${av.tot.toLocaleString('it-IT')} affrontati (${percAff}%)</span>
                <span class="am-piano-sep">·</span>
                <span title="Numero TOTALE di risposte date in questo save, inclusi i quiz rivisti più volte (con doppioni)."><strong>${(av.tentativi||0).toLocaleString('it-IT')}</strong> risposte totali <em class="rk-dup-note">(con doppioni)</em></span>
                <span class="am-piano-sep">·</span>
                <span title="Quiz padroneggiati: risposti correttamente in almeno 3 giorni diversi."><strong>${av.padron.toLocaleString('it-IT')}</strong> / ${av.tot.toLocaleString('it-IT')} padroneggiati</span>
                <button class="btn btn-ghost btn-rk-dettaglio" id="rk-vai-analisi"
                        title="Apri la mappa capillare delle materie di questo save (solo le sue materie e le sue risposte)">🗺 Mappatura materie ranked</button>
              </div>
            </div>
          `;
        })()}

        <!-- Obiettivo Oggi -->
        <div class="rk-obj-card">
          <div class="rk-obj-head">
            <div>
              <div class="rk-obj-label" title="Quanti quiz dovresti affrontare oggi per arrivare alla prova con copertura completa. Calcolato in base ai giorni rimanenti.">Obiettivo di oggi</div>
              <div class="rk-obj-numeri" title="Risposte già date oggi su target previsto">
                <span class="rk-obj-fatti">${fatti}</span>
                <span class="rk-obj-sep">/</span>
                <span class="rk-obj-target">${target}</span>
                <span class="rk-obj-unit">quiz</span>
              </div>
            </div>
            <div class="rk-obj-stato">
              ${obiettivoCompletato
                ? `<span class="rk-tag rk-tag-ok" title="Hai raggiunto il target di quiz di oggi. Bonus RP a fine giornata, se batteria di rilascio è stata completata.">✓ Obiettivo raggiunto</span>`
                : `<span class="rk-tag rk-tag-neutral" title="Quiz ancora da fare oggi per raggiungere il target">${restantiObiettivo} restanti</span>`}
              ${accOggi !== null ? `<span class="rk-tag rk-tag-info" title="% di risposte corrette oggi, sull'ultimo tentativo di ogni quiz">${accOggi}% accuratezza oggi</span>` : ''}
              <span class="rk-tag ${rpDeltaOggi >= 0 ? 'rk-tag-up' : 'rk-tag-down'}"
                    title="Punti rank guadagnati o persi oggi nelle batterie effettivamente completate. RP non assegnato per batterie interrotte.">
                ${rpDeltaOggi >= 0 ? '+' : ''}${rpDeltaOggi.toFixed(2)} punti rank oggi
              </span>
            </div>
          </div>
          <div class="rk-obj-bar" title="Avanzamento verso il target giornaliero di quiz"><div class="rk-obj-fill" style="width:${percObiettivo}%"></div></div>
          <div class="rk-round-setup">
            <span class="rk-round-setup-label" title="Dimensione della prossima batteria. I punti RP si guadagnano solo terminando l'intera batteria.">Quiz per round (per sessione di gioco)</span>
            <div class="rk-chip-row">
              ${RANKED_DIMENSIONI_ROUND.map(d => `
                <button class="rk-chip ${d === dimRound ? 'active' : ''}" data-rk-dim="${d}">${d}</button>
              `).join('')}
            </div>
          </div>
          <div class="rk-obj-actions">
            <button class="btn btn-primary rk-btn-round" id="rk-inizia-round">▶ Inizia round (${dimRound} quiz)</button>
            <button class="btn btn-ghost" id="rk-cambia-target">Modifica obiettivo giornaliero...</button>
          </div>
        </div>

        <!-- Riepilogo periodo -->
        <div class="rk-recap-grid">
          <div class="rk-recap-card">
            <div class="rk-recap-h" title="La tua attività Ranked solo di oggi">Oggi</div>
            <div class="rk-recap-stats">
              <div title="Risposte date oggi (include doppioni)"><strong>${stat1.fatti.toLocaleString('it-IT')}</strong> quiz</div>
              <div title="% di risposte corrette oggi"><strong>${acc1 !== null ? acc1+'%' : '—'}</strong> accuratezza</div>
              <div title="${stat1.completati > 0 ? 'Obiettivo giornaliero raggiunto' : 'Obiettivo giornaliero non ancora raggiunto'}"><strong>${stat1.completati > 0 ? '✓' : '–'}</strong> obiettivo</div>
              <div class="rk-recap-rp ${stat1.rpDelta >= 0 ? 'up' : 'down'}" title="Variazione netta di punti rank (RP) di oggi">
                ${stat1.rpDelta >= 0 ? '+' : ''}${stat1.rpDelta.toFixed(1)} punti rank
              </div>
            </div>
          </div>

          <div class="rk-recap-card">
            <div class="rk-recap-h" title="Riepilogo della tua attività Ranked degli ultimi 7 giorni di calendario">Ultimi 7 giorni</div>
            <div class="rk-recap-stats">
              <div title="Quiz totali risposti negli ultimi 7 giorni (include doppioni)"><strong>${stat7.fatti.toLocaleString('it-IT')}</strong> quiz</div>
              <div title="% di risposte corrette nel periodo, calcolata sull'ultimo tentativo di ogni quiz"><strong>${acc7 !== null ? acc7+'%' : '—'}</strong> accuratezza</div>
              <div title="Giorni con almeno una risposta Ranked sui 7 totali"><strong>${giorniAttivi7}</strong>/7 giorni attivi</div>
              <div title="Giorni in cui hai raggiunto il target di quiz giornaliero su 7 totali"><strong>${completati7}</strong>/7 obiettivi completati</div>
              <div class="rk-recap-rp ${stat7.rpDelta >= 0 ? 'up' : 'down'}" title="Variazione netta di punti rank (RP) negli ultimi 7 giorni: somma di guadagni e perdite">
                ${stat7.rpDelta >= 0 ? '+' : ''}${stat7.rpDelta.toFixed(1)} punti rank
              </div>
            </div>
          </div>

          <div class="rk-recap-card">
            <div class="rk-recap-h" title="Riepilogo della tua attività Ranked degli ultimi 30 giorni di calendario">Ultimi 30 giorni</div>
            <div class="rk-recap-stats">
              <div title="Quiz totali risposti negli ultimi 30 giorni (include doppioni)"><strong>${stat30.fatti.toLocaleString('it-IT')}</strong> quiz</div>
              <div title="% di risposte corrette nel periodo, calcolata sull'ultimo tentativo di ogni quiz"><strong>${acc30 !== null ? acc30+'%' : '—'}</strong> accuratezza</div>
              <div title="Giorni con almeno una risposta Ranked sui 30 totali"><strong>${stat30.giorniAttivi}</strong>/30 giorni attivi</div>
              <div title="Giorni in cui hai raggiunto il target di quiz giornaliero su 30 totali"><strong>${stat30.completati}</strong>/30 obiettivi completati</div>
              <div class="rk-recap-rp ${stat30.rpDelta >= 0 ? 'up' : 'down'}" title="Variazione netta di punti rank (RP) negli ultimi 30 giorni: somma di guadagni e perdite">
                ${stat30.rpDelta >= 0 ? '+' : ''}${stat30.rpDelta.toFixed(1)} punti rank
              </div>
            </div>
          </div>

          <div class="rk-recap-card rk-deboli">
            <div class="rk-recap-h" title="Quiz e materie su cui dovresti concentrarti per consolidare le aree deboli">Da recuperare</div>
            <div class="rk-errori-box ${nErrori > 0 ? 'has-err' : ''}" title="Quiz la cui ultima risposta è stata sbagliata e che non sono ancora padroneggiati. Vengono ripresentati con priorità nei prossimi round (fino al 55%).">
              <span class="rk-errori-num">${nErrori.toLocaleString('it-IT')}</span>
              <span class="rk-errori-lbl">quiz sbagliati da ripadroneggiare</span>
            </div>
            ${nErrori > 0 ? `
              <button class="btn btn-primary rk-btn-recupero" id="rk-recupera-tutti"
                      title="Batteria focalizzata sui tuoi errori. Stesso RP, stessa padronanza di un round normale.">
                ▶ Recupera ${Math.min(dimRound, nErrori)} errori
              </button>
            ` : ''}
            ${deboli.length === 0
              ? `<div class="rk-empty-deb">Nessuna materia sotto il 60% 👌</div>`
              : (() => {
                  // Filtro le "materie deboli" tenendo SOLO quelle che hanno
                  // anche errori recuperabili (>0). Coerente con la batteria
                  // di recupero per materia: se erroreRecuperabili[m]=0,
                  // cliccarci darebbe "Nessun errore aperto" → non mostrarla.
                  const deboliConErrori = deboli
                    .map(d => ({ ...d, nErr: erroriPerMateria[d.materia_id] || 0 }))
                    .filter(d => d.nErr > 0);
                  if (deboliConErrori.length === 0) {
                    return `<div class="rk-empty-deb">Nessuna materia con errori da recuperare 👌</div>`;
                  }
                  return `<div class="rk-deboli-sub">Materie deboli (acc &lt; 60% / 7gg) — clicca per esercitarti</div>
                   <ul class="rk-deboli-list">
                    ${deboliConErrori.slice(0, 5).map(d => `
                      <li class="rk-deb-row" data-rk-recupera-mat="${escapeAttr(d.materia_id)}"
                          title="Lancia una batteria recupero su ${escapeAttr(d.materia_id)}">
                        <code>${escapeHTML(d.materia_id)}</code>
                        <span class="rk-deb-acc">${Math.round(d.accuratezza*100)}%</span>
                        <span class="rk-deb-tot">${d.nErr} ${d.nErr === 1 ? 'errore' : 'errori'} da recuperare</span>
                        <span class="rk-deb-go">▶</span>
                      </li>
                    `).join('')}
                   </ul>`;
                })()
              }
          </div>
        </div>

        <!-- Composizione round attuale (cluster mix) -->
        <div class="rk-mix-card">
          <div class="rk-mix-h">Come sarà composto il prossimo round (in base al tuo livello)</div>
          ${rankedRenderMixBar()}
        </div>

      </div>
    `;

    // Chip dimensione round → salva preferenza e ri-renderizza
    document.querySelectorAll('[data-rk-dim]').forEach(b => {
      b.addEventListener('click', () => {
        const d = parseInt(b.dataset.rkDim, 10);
        const p = rankedCaricaProfilo() || {};
        p.dimensioneRound = d;
        rankedSalvaProfilo(p);
        rankedRender();
      });
    });
    // Inizia round → parte subito con la dimensione salvata
    document.getElementById('rk-inizia-round').addEventListener('click', () => {
      rankedAvviaRound(dimRound);
    });
    document.getElementById('rk-cambia-target').addEventListener('click', rankedMostraPickerTarget);
    const btnStats = document.getElementById('rk-vai-stats');
    if (btnStats) btnStats.addEventListener('click', () => renderRankedStats());
    // Modifica piano del save attivo senza uscire da Ranked
    const btnPiano = document.getElementById('rk-modifica-piano');
    if (btnPiano) btnPiano.addEventListener('click', () => {
      const sid = window.SavesCore ? SavesCore.getSaveAttivoId() : null;
      if (!sid) { toast('Nessun save attivo', true); return; }
      if (window.SavesUI && typeof SavesUI.apriWizardModificaSave === 'function') {
        SavesUI.apriWizardModificaSave(sid, { returnPage: 'ranked' });
      } else {
        toast('Wizard non disponibile', true);
      }
    });
    // Mappatura materie ranked → mappa scoped al save attivo
    const btnDettaglio = document.getElementById('rk-vai-analisi');
    if (btnDettaglio) {
      btnDettaglio.addEventListener('click', () => {
        const sid = window.SavesCore ? SavesCore.getSaveAttivoId() : null;
        if (typeof window.renderMappaturaRanked === 'function') {
          window.renderMappaturaRanked(sid);
        } else if (typeof navigaA === 'function') {
          navigaA('mappa');
        }
      });
    }
    // Recupero errori — batteria focalizzata sugli errori aperti (Fase 10)
    const btnRecuperaTutti = document.getElementById('rk-recupera-tutti');
    if (btnRecuperaTutti) {
      btnRecuperaTutti.addEventListener('click', () => rankedAvviaRecupero(dimRound, null));
    }
    document.querySelectorAll('[data-rk-recupera-mat]').forEach(el => {
      el.addEventListener('click', () => {
        const mid = el.dataset.rkRecuperaMat;
        if (mid) rankedAvviaRecupero(dimRound, mid);
      });
    });
  }

  // — Barra orizzontale che mostra il mix nuovi/review/consolidati —
  function rankedRenderMixBar() {
    const mix = rankedMixCorrente();
    return `
      <div class="rk-mix-bar">
        <div class="rk-mix-seg seg-nuovi"        style="width:${(mix[0]*100).toFixed(0)}%" title="Quiz mai visti prima">Mai visti ${(mix[0]*100).toFixed(0)}%</div>
        <div class="rk-mix-seg seg-review"       style="width:${(mix[1]*100).toFixed(0)}%" title="Quiz già visti ma non ancora padroneggiati">Da ripassare ${(mix[1]*100).toFixed(0)}%</div>
        <div class="rk-mix-seg seg-consolidati"  style="width:${(mix[2]*100).toFixed(0)}%" title="Quiz già padroneggiati, riproposti di rado">Già appresi ${(mix[2]*100).toFixed(0)}%</div>
      </div>
      <div class="rk-mix-note">
        ⚠ Gli <strong>errori aperti</strong> hanno priorità: occupano fino al
        ${(RANKED_ERRORI_QUOTA_MAX*100).toFixed(0)}% del round finché non li padroneggi.
        Il mix qui sopra si applica ai quiz restanti, con +${(RANKED_OVERRIDE_QUOTA*100).toFixed(0)}%
        sulle materie deboli. I quiz già visti correttamente ${RANKED_SATURAZIONE_CORRETTE}+ volte
        vanno temporaneamente "in riposo".
      </div>
    `;
  }

  // — Picker target personalizzato (modal) —
  function rankedMostraPickerTarget() {
    const auto = rankedCalcolaTargetOggi();
    const daily = rankedGetDaily();
    const html = `
      <div class="rk-picker">
        <p class="rk-picker-desc">
          L'obiettivo giornaliero è quanti quiz dovresti affrontare oggi. Quello automatico
          è calcolato in base alla banca dati e alla data della prova:
          <strong>${auto}</strong> quiz al giorno. Puoi sovrascriverlo solo per oggi.
        </p>
        <div style="display:flex;gap:10px;align-items:center;margin-top:14px;">
          <label>Obiettivo di oggi:</label>
          <input type="number" id="rk-target-n" min="10" max="2000" value="${daily.target}" class="car-input" style="width:120px;">
          <button class="btn btn-primary" id="rk-target-save">Salva</button>
          <button class="btn btn-ghost" id="rk-target-auto">Usa automatico</button>
        </div>
      </div>
    `;
    showModal('Modifica obiettivo di oggi', html, () => {}, 'Chiudi');
    document.getElementById('modalConfirm').style.display = 'none';
    setTimeout(() => {
      document.getElementById('rk-target-save').addEventListener('click', () => {
        const n = parseInt(document.getElementById('rk-target-n').value || '0', 10);
        if (!n || n < 10) { toast('Minimo 10', true); return; }
        rankedAggiornaDaily(d => { d.target = n; });
        closeModal();
        rankedRender();
      });
      document.getElementById('rk-target-auto').addEventListener('click', () => {
        rankedAggiornaDaily(d => { d.target = rankedCalcolaTargetOggi(); });
        closeModal();
        rankedRender();
      });
    }, 50);
  }

  // — Avvia batteria di RECUPERO ERRORI (Fase 10) ───────────────────
  // Crea una sessione Ranked focalizzata SOLO sugli errori aperti.
  // Stesso flag _ranked degli round normali → RP, daily, padronanza,
  // propagation cross-save funzionano identicamente. Aggiunge _recupero
  // per eventuale styling/messaging del popup di fine batteria.
  function rankedAvviaRecupero(n, materiaId) {
    const scelti = rankedSelezionaRecupero(n, { materiaId });
    if (scelti.length === 0) {
      toast(materiaId
        ? 'Nessun errore aperto su ' + materiaId
        : 'Nessun errore aperto da recuperare', true);
      return;
    }
    SESSIONE = {
      config: {
        modalita: 'esercitazione',
        timerMode: 'off',
        materieSelezionate: new Set(),
        _ranked: true,
        _recupero: true,
        _recuperoMateriaId: materiaId || null,
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
      pausaTimer: null,
    };
    avviaTimer();
    renderQuizCorrente();
  }

  // — Helper interno: costruisce la SESSIONE e avvia il quiz —
  //   Usato da tutti gli entry point Ranked (round normale, recupero, da Analisi).
  //   NB: assegnazione DIRETTA a `SESSIONE` (let in allenamento.js). NON usare
  //   window.SESSIONE: sarebbe una variabile distinta dal binding lessicale.
  function _rankedAvviaSessione(scelti, extraConfig) {
    if (!scelti || scelti.length === 0) {
      toast('Nessun quiz disponibile per il round', true);
      return false;
    }
    SESSIONE = {
      config: Object.assign({
        modalita: 'esercitazione',
        timerMode: 'off',
        materieSelezionate: new Set(),
        _ranked: true,
      }, extraConfig || {}),
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
      pausaTimer: null,
    };
    avviaTimer();
    renderQuizCorrente();
    return true;
  }

  // — Avvia round Ranked standard —
  function rankedAvviaRound(n) {
    _rankedAvviaSessione(rankedSelezionaRound(n));
  }

  // — Avvia round Ranked da un nodo dell'Analisi Quiz Materie —
  //   restrictIds: Set di quiz_id ammessi (il nodo selezionato)
  //   opts: { n, soloErrati, nomeNodo }
  //   Resta un round Ranked a tutti gli effetti: priorità errori 55%,
  //   contatori giornalieri aggiornati, RP applicato a fine round.
  function avviaRoundDaAnalisi(restrictIds, opts) {
    opts = opts || {};
    const n = Math.max(1, parseInt(opts.n, 10) || 25);
    const scelti = rankedSelezionaRound(n, {
      restrictIds,
      soloErrati: !!opts.soloErrati,
    });
    if (scelti.length === 0) {
      toast(opts.soloErrati
        ? 'Nessun errore aperto in questo blocco'
        : 'Nessun quiz disponibile in questo blocco', true);
      return;
    }
    _rankedAvviaSessione(scelti, {
      _daAnalisi: true,
      _daAnalisiNodo: opts.nomeNodo || null,
      _daAnalisiSoloErrati: !!opts.soloErrati,
    });
  }
  window.avviaRoundDaAnalisi = avviaRoundDaAnalisi;
