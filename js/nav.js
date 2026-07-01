  // ═══════════════════════════════════════════════════════
  // NAV — Dashboard, mappa materie, navigazione, settings
  // ═══════════════════════════════════════════════════════

  // Backup completo: logica in js/backup-core.js (window.BackupCore).

  // ═══════ Dashboard — intro del gestionale + modalità ═══════

  function renderDashboard() {
    const haPacchetto = !!STATE.pacchetto;
    let nQuiz = 0;
    try { if (haPacchetto) nQuiz = carCalcolaTotaliPacchetto().unici || 0; } catch (e) { nQuiz = 0; }

    document.getElementById('main').innerHTML = `
      <div class="dash-page">

        <div class="dash-hero-wrap">
        <div class="dash-hero" data-tilt3d="5">
          <div class="dash-hero-fx" aria-hidden="true">
            <div class="dash-orb dash-orb-1"></div>
            <div class="dash-orb dash-orb-2"></div>
            <div class="dash-orb dash-orb-3"></div>
            <div class="dash-speedlines"></div>
            <div class="dash-halftone"></div>
          </div>
          <div class="dash-hero-content">
            <div class="dash-kicker">⚡ CALL OF QUIZ · LA TUA ARENA DI STUDIO</div>
            <h1 class="dash-title">Studia. <span class="dash-title-hl">Scala.</span> Vinci.</h1>
            <p class="dash-lead">
              La piattaforma che trasforma qualunque banca dati in una sfida.
              Crea più save, scegli la tua banca, scala 7 leghe, padroneggia
              i quiz uno ad uno. <strong>Studia come si gioca.</strong>
            </p>
          </div>
        </div>
          <div class="dash-eroe-box" aria-hidden="true">
            <div class="dash-eroe-ombra"></div>
            <img class="dash-eroe" src="assets/eroe.png" alt=""
                 onerror="this.closest('.dash-eroe-box').remove()">
          </div>
        </div>

        ${!haPacchetto ? `
          <div class="dash-warn">
            <span>⚠ Nessuna banca dati caricata — alcune sezioni non saranno disponibili.</span>
            <button class="btn btn-primary" id="dash-carica">📦 Carica i moduli</button>
          </div>
        ` : ''}

        <div class="dash-section">
          <div class="dash-section-h"><span class="dsh-deco"></span>Modalità di gioco<span class="dsh-deco"></span></div>
          <div class="dash-grid dash-grid-modes">
            ${_dashCard('ranked','🏆','Modalità Ranked Quiz','LA SCALATA',
              'La sfida competitiva. Round dopo round scali 7 leghe — da Rame a Maestro — accumulando Punti Rank. Gli errori tornano con priorità finché non li domini. Più sali, più serve precisione.')}
            ${_dashCard('libera','🎲','Allenamento Libero','LIBERO',
              'Sessioni rapide e senza vincoli. Scegli le materie, il numero di quiz e la modalità di feedback: ti alleni come vuoi, quando vuoi, su tutta la libreria.')}
          </div>
        </div>

        <div class="dash-section">
          <div class="dash-section-h"><span class="dsh-deco"></span>Strumenti<span class="dsh-deco"></span></div>
          <div class="dash-grid dash-grid-tools">
            ${_dashCard('scritto','✍️','Prova Scritta','AI',
              'Studia i quesiti aperti e le risposte di riferimento, poi scrivi il tuo elaborato e fatti correggere dall\'AI sui criteri reali del concorso: voto in trentesimi, punti mancanti e feedback.')}
            ${_dashCard('mappa','📊','Analisi Globale','DATI',
              'La mappa capillare di TUTTA la libreria: ogni materia, argomento, legge e articolo con i numeri reali — quiz affrontati, copertura e precisione, sommando i progressi di tutti i save.')}
            ${_dashCard('moduli','🧩','Gestisci Moduli','PACCHETTO',
              'Importi o aggiorni le banche dati e controlli lo stato dei moduli caricati nel browser.')}
          </div>
        </div>

        <div class="dash-footer">
          ⬡ Call Of Quiz — piattaforma multi-banca per concorsi pubblici, esami e auto-studio
          ${(window.CM_DATA_BUNDLE && window.CM_DATA_BUNDLE.generato)
            ? '<br><span class="dash-footer-ver">📦 dati aggiornati al ' + window.CM_DATA_BUNDLE.generato + '</span>'
            : ''}
        </div>
      </div>
    `;

    document.querySelectorAll('[data-dash-goto]').forEach(c => {
      c.addEventListener('click', () => {
        const page = c.dataset.dashGoto;
        STATE.pageCorrente = page;
        aggiornaNavSidebar(page);
        navigaA(page);
      });
    });
    const btnCarica = document.getElementById('dash-carica');
    if (btnCarica) btnCarica.addEventListener('click', () => selezionaFileMultipli());

    attaccaTilt3D();
  }

  function _dashCard(id, icona, titolo, tag, desc) {
    return `
      <div class="dash-card dash-card-${id}" data-dash-goto="${id}" data-tilt3d="9" role="button" tabindex="0">
        <div class="dash-card-glow" aria-hidden="true"></div>
        <div class="dash-card-tag">${tag}</div>
        <div class="dash-card-icon">${icona}</div>
        <div class="dash-card-titolo">${titolo}</div>
        <div class="dash-card-desc">${desc}</div>
        <div class="dash-card-cta">Entra <span class="dcc-arrow">→</span></div>
      </div>
    `;
  }

  // ── Effetto 3D interattivo ──
  // I pannelli con data-tilt3d si inclinano seguendo il puntatore;
  // personaggi (::after) ed effetti (-fx) si muovono in parallasse a
  // velocità diverse → illusione di profondità "diorama".
  function attaccaTilt3D() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.querySelectorAll('[data-tilt3d]').forEach(el => {
      if (el._tilt3dBound) return;
      el._tilt3dBound = true;
      const forza = parseFloat(el.dataset.tilt3d) || 6;
      el.addEventListener('mousemove', (e) => {
        const r  = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width  - 0.5;   // -0.5 .. 0.5
        const py = (e.clientY - r.top)  / r.height - 0.5;
        el.style.setProperty('--ry', ( px * forza).toFixed(2) + 'deg');
        el.style.setProperty('--rx', (-py * forza).toFixed(2) + 'deg');
        el.style.setProperty('--px', ( px * 24).toFixed(1) + 'px');
        el.style.setProperty('--py', ( py * 24).toFixed(1) + 'px');
        el.classList.add('tilt-attivo');
      });
      el.addEventListener('mouseleave', () => {
        el.style.setProperty('--ry', '0deg');
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--px', '0px');
        el.style.setProperty('--py', '0px');
        el.classList.remove('tilt-attivo');
      });
    });
  }

  // ═══════ Schermata di benvenuto / import pacchetto ═══════

  function renderEmptyState() {
    document.getElementById('main').innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Benvenuto</h1>
        <div class="page-subtitle">Nessun pacchetto bando ancora caricato</div>
      </div>
      <div class="empty-state" id="dropZone">
        <div class="empty-glyph">∅</div>
        <div class="empty-title">Carica il pacchetto dati</div>
        <div class="empty-text">
          Estrai lo zip <code>GameQuiz.zip</code> in una cartella del tuo PC.<br>
          Poi <strong>trascina qui</strong> l'intera cartella <code>GameQuiz</code>
          oppure clicca un pulsante qui sotto.
          <br><br>
          L'app riconoscerà automaticamente i file (manifest, programma, banche dati)
          e salverà tutto nel browser. Alla prossima apertura ritroverai tutto già caricato.
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center">
          <button class="btn btn-primary" onclick="selezionaCartella()">
            📁 Seleziona cartella
          </button>
          <button class="btn" onclick="selezionaFileMultipli()">
            📄 Seleziona file uno a uno
          </button>
        </div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:20px; font-family:var(--font-mono); letter-spacing:0.05em">
          Oppure trascina la cartella sopra l'area di benvenuto
        </div>
      </div>
    `;
    attaccaDragDrop();
  }

  function selezionaCartella() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.webkitdirectory = true;
    inp.directory = true;
    inp.multiple = true;
    inp.addEventListener('change', (e) => processaFiles(Array.from(e.target.files)));
    inp.click();
  }

  function selezionaFileMultipli() {
    document.getElementById('filePacchetto').click();
  }

  function attaccaDragDrop() {
    const dz = document.getElementById('dropZone');
    if (!dz) return;

    ['dragenter', 'dragover'].forEach(ev => {
      dz.addEventListener(ev, (e) => {
        e.preventDefault(); e.stopPropagation();
        dz.style.borderColor = 'var(--amber-bright)';
        dz.style.background  = 'var(--bg-hover)';
      });
    });

    ['dragleave', 'drop'].forEach(ev => {
      dz.addEventListener(ev, (e) => {
        e.preventDefault(); e.stopPropagation();
        dz.style.borderColor = '';
        dz.style.background  = '';
      });
    });

    dz.addEventListener('drop', async (e) => {
      const items    = e.dataTransfer.items;
      const allFiles = [];

      async function readEntry(entry) {
        if (entry.isFile) {
          await new Promise(res => {
            entry.file(f => { if (f.name.endsWith('.json')) allFiles.push(f); res(); });
          });
        } else if (entry.isDirectory) {
          const reader = entry.createReader();
          await new Promise(res => {
            const readAll = () => {
              reader.readEntries(async (entries) => {
                if (entries.length === 0) { res(); return; }
                for (const ent of entries) await readEntry(ent);
                readAll();
              });
            };
            readAll();
          });
        }
      }

      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.();
        if (entry) await readEntry(entry);
      }

      if (allFiles.length === 0) {
        toast('Nessun file .json trovato nella cartella trascinata', true);
        return;
      }
      processaFiles(allFiles);
    });
  }

  // ═══════ Helpers contatori ═══════

  function countArticoli(programma) {
    let n = 0;
    for (const m of programma.materie)
      for (const a of m.argomenti)
        for (const l of a.leggi || [])
          for (const s of l.sotto_argomenti || [])
            n += (s.articoli || []).length;
    return n;
  }

  function countSottoArgomenti(programma) {
    let n = 0;
    for (const m of programma.materie)
      for (const a of m.argomenti)
        for (const l of a.leggi || [])
          n += (l.sotto_argomenti || []).length;
    return n;
  }

  // ═══════ Mappa progresso espandibile ═══════

  function renderMappaMaterie() {
    const { programma, banche } = STATE.pacchetto;
    const statsMateria = calcolaStatsMateria();

    const materie = [...programma.materie].sort((a, b) => {
      if (a.id === 'M99_altro') return 1;
      if (b.id === 'M99_altro') return -1;
      return b.peso - a.peso;
    });

    return materie.map(m => {
      const stats          = statsMateria[m.id] || { totale: 0, fatti: 0, corretti: 0, errati: 0 };
      const percCompletato = stats.totale > 0 ? Math.round(stats.fatti / stats.totale * 100) : 0;
      const isExpanded     = STATE.espansioniMaterie.has(m.id);

      return `
        <div class="materia-node ${isExpanded ? 'expanded' : ''}" data-materia="${m.id}">
          <div class="materia-header">
            <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
            <div class="materia-title-block">
              <div class="materia-title">${m.nome}</div>
              <div class="materia-meta">${m.id} · Peso ${m.peso}/10 · ${m.argomenti.length} argomenti</div>
            </div>
            <span class="badge ${m.peso >= 8 ? 'badge-amber' : 'badge-muted'}">${m.tipologia || '—'}</span>
            <div class="stat-mini">
              <div class="stat-mini-value">${stats.totale.toLocaleString('it')}</div>
              <div class="stat-mini-label">Quiz</div>
            </div>
            <div class="stat-mini">
              <div class="stat-mini-value">${percCompletato}%</div>
              <div class="stat-mini-label">Completato</div>
            </div>
          </div>
          <div class="materia-body">
            ${renderArgomenti(m, banche[m.id])}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderArgomenti(materia, banca) {
    const quizPerArg = {};
    if (banca && banca.categorizzati) {
      for (const q of banca.categorizzati) {
        const argId = q.categorizzazione?.argomento_id || '_';
        quizPerArg[argId] = (quizPerArg[argId] || 0) + 1;
      }
    }

    return materia.argomenti.map(a => {
      const nQuiz  = quizPerArg[a.id] || 0;
      const isExp  = STATE.espansioniArgomenti.has(a.id);

      return `
        <div class="argomento-node ${isExp ? 'expanded' : ''}" data-argomento="${a.id}">
          <div class="argomento-header">
            <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
            <div>
              <div class="argomento-title">${a.nome}</div>
              <div class="argomento-meta">${a.id} · Peso ${a.peso}/10</div>
            </div>
            <span class="badge badge-muted">${nQuiz} quiz</span>
            <span class="badge badge-sage" style="opacity:.4">0% letti</span>
          </div>
          <div class="argomento-body">
            ${renderLeggi(a, quizPerArg)}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderLeggi(argomento, quizPerArg) {
    return (argomento.leggi || []).map(l => `
      <div class="legge-node">
        <div class="legge-title">${l.nome}</div>
        ${(l.sotto_argomenti || []).map(s => `
          <div class="sub-node">
            <div class="sub-title">${s.nome} <span style="color:var(--text-muted); font-weight:400">· peso ${s.peso}/10</span></div>
            ${s.note ? `<div class="sub-note">${s.note}</div>` : ''}
            ${renderArticoli(s.articoli || [])}
          </div>
        `).join('')}
      </div>
    `).join('');
  }

  function renderArticoli(articoli) {
    if (!articoli.length) return '';
    return `
      <div class="articoli-list">
        ${articoli.map(a => {
          const num = typeof a === 'string' ? a : a.numero;
          const tit = typeof a === 'object' ? (a.titolo || '') : '';
          return `
            <div class="articolo-row">
              <div class="articolo-num">art. ${num}</div>
              <div class="articolo-titolo">${tit}</div>
              <div class="articolo-stats">0 quiz</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function calcolaStatsMateria() {
    const stats = {};
    if (!STATE.pacchetto) return stats;
    for (const m of STATE.pacchetto.manifest.moduli) {
      const banca = STATE.pacchetto.banche[m.materia_id];
      stats[m.materia_id] = {
        totale:   banca ? banca.quiz.length : 0,
        fatti:    0,
        corretti: 0,
        errati:   0,
      };
    }
    return stats;
  }

  function attaccaListenersMappa() {
    document.querySelectorAll('.materia-header').forEach(h => {
      h.addEventListener('click', () => {
        const node = h.closest('.materia-node');
        const id   = node.dataset.materia;
        if (STATE.espansioniMaterie.has(id)) {
          STATE.espansioniMaterie.delete(id);
          node.classList.remove('expanded');
        } else {
          STATE.espansioniMaterie.add(id);
          node.classList.add('expanded');
        }
      });
    });

    document.querySelectorAll('.argomento-header').forEach(h => {
      h.addEventListener('click', (e) => {
        e.stopPropagation();
        const node = h.closest('.argomento-node');
        const id   = node.dataset.argomento;
        if (STATE.espansioniArgomenti.has(id)) {
          STATE.espansioniArgomenti.delete(id);
          node.classList.remove('expanded');
        } else {
          STATE.espansioniArgomenti.add(id);
          node.classList.add('expanded');
        }
      });
    });
  }

  // ═══════ Navigazione ═══════

  function aggiornaNavSidebar(page) {
    document.querySelectorAll('.nav-item').forEach(i => {
      i.classList.toggle('active', i.dataset.page === page);
    });
  }

  function navigaA(page) {
    // Round Ranked abbandonato a metà: NON assegno l'RP accumulato.
    // Le batterie assegnano punti solo se completate al 100% (decisione v0.7).
    // Cancello la sessione e l'utente perde i punti parziali — quindi è
    // motivato a portare a termine ciò che inizia.
    if (SESSIONE && SESSIONE.config && SESSIONE.config._ranked
        && !SESSIONE.terminata && !SESSIONE._rankedFinalizzato) {
      if (SESSIONE.timerInterval) clearInterval(SESSIONE.timerInterval);
      // Niente rankedHookFineRound qui: la batteria abbandonata non finalizza.
      SESSIONE = null;
    }
    // Simulazione: preselettiva lasciata a metà → libera la sessione (la prova
    // resta sospesa in cm:simulazione:corrente e si potrà rigenerare).
    if (SESSIONE && SESSIONE.config && SESSIONE.config._simulazione && !SESSIONE.terminata) {
      if (SESSIONE.timerInterval) clearInterval(SESSIONE.timerInterval);
      SESSIONE = null;
    }
    // Ferma l'eventuale timer della prova scritta (simulazione).
    if (window.SimEngine && SimEngine._simStopTimer) { try { SimEngine._simStopTimer(); } catch (_) {} }
    STATE.pageCorrente = page;
    switch (page) {
      case 'dashboard': renderDashboard(); break;
      case 'moduli':    renderModuli(); break;
      case 'mappa':     renderAnalisiMaterie(); break;
      case 'studio':    renderStudio(); break;
      case 'progressi-ranked': renderRankedStats(); break;
      case 'scritto':       renderScritto(); break;
      case 'scritto-stats': renderScrittoStats(); break;
      case 'ranked':    renderRanked(); break;
      case 'libera':    renderAllenamentoLibero(); break;
      case 'simulazione': renderSimulazione(); break;
      default:          renderDashboard();
    }
    applicaAspetto();   // aggiorna le classi body + mainbg-<pagina>
  }

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const page = item.dataset.page;
      STATE.pageCorrente = page;
      navigaA(page);
    });
  });

  function renderModuli() {
    if (!STATE.pacchetto) { renderEmptyState(); return; }
    const { manifest } = STATE.pacchetto;
    document.getElementById('main').innerHTML = `
      <div class="page-header page-header-bg pagebg-moduli">
        <h1 class="page-title">Gestisci moduli</h1>
        <div class="page-subtitle">${manifest.moduli.length} moduli caricati per il bando "${manifest.bando.nome}"</div>
      </div>
      <div style="margin-bottom:20px">
        <button class="btn btn-primary" onclick="avviaImportazione()">Importa/Sostituisci pacchetto</button>
        <button class="btn btn-ghost" onclick="cancellaTutto()" style="margin-left:8px">Cancella pacchetto</button>
      </div>
      ${manifest.moduli.map(m => `
        <div class="materia-node" style="cursor:default">
          <div class="materia-header" style="cursor:default">
            <span style="width:28px"></span>
            <div class="materia-title-block">
              <div class="materia-title">${m.nome}</div>
              <div class="materia-meta">${m.materia_id} · ${m.n_quiz.toLocaleString('it')} quiz · ${Object.keys(m.distribuzione_argomenti).length} argomenti identificati</div>
            </div>
            <span class="badge badge-sage">caricato</span>
          </div>
        </div>
      `).join('')}
    `;
  }

  function cancellaTutto() {
    showModal(
      'Cancellare tutto?',
      'Verranno rimossi pacchetto e progressi dalla memoria del browser. Questa azione è irreversibile.',
      async () => {
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith('cm:')) localStorage.removeItem(key);
        }
        try { await dbDelAll('cm:'); } catch (e) { console.error('Errore pulizia IndexedDB:', e); }
        location.reload();
      }
    );
  }

  // ═══════ Countdown concorso ═══════

  function aggiornaCountdown() {
    const dataProva = caricaDaStorage(SK_DATA_PROVA);
    const el = document.getElementById('countdown');
    if (!dataProva) { el.style.display = 'none'; return; }
    const giorni = Math.ceil((new Date(dataProva) - new Date()) / (1000 * 60 * 60 * 24));
    el.style.display = 'flex';
    document.getElementById('countdownValue').textContent = giorni > 0 ? `${giorni} giorni` : 'Oggi!';
  }

  // ═══════ Modale Settings ═══════

  document.getElementById('btnSettings').addEventListener('click', mostraModaleSettings);
  // Impostazioni anche dalla sidebar
  const _navBtnSettings = document.getElementById('navBtnSettings');
  if (_navBtnSettings) _navBtnSettings.addEventListener('click', () => {
    // Deseleziona active (non è una pagina reale)
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    // Ripristina active sulla pagina corrente dopo chiusura modale
    mostraModaleSettings();
    setTimeout(() => aggiornaNavSidebar(STATE.pageCorrente), 50);
  });

  // ═══════ Impostazioni "Aspetto" — toggle sfondi decorativi ═══════
  // 3 toggle indipendenti: page-header / pagina intera / sidebar.
  // Le immagini PNG vanno in /assets (vedi mappatura CSS).
  const SK_ASPETTO = 'cm:impostazioni:aspetto';
  const _ASPETTO_DEFAULT = { header: true, page: false, sidebar: false };

  function caricaAspetto() {
    const s = caricaDaStorage(SK_ASPETTO);
    return Object.assign({}, _ASPETTO_DEFAULT, s || {});
  }
  function salvaAspetto(s) { salvaInStorage(SK_ASPETTO, s); }

  // ═══════ Tema (scuro / chiaro stile Claude) ═══════
  const SK_TEMA = 'cm:impostazioni:tema';   // 'scuro' | 'chiaro' (GLOBAL)
  function caricaTema() { return caricaDaStorage(SK_TEMA) || 'scuro'; }
  function applicaTema() {
    document.body.classList.toggle('theme-light', caricaTema() === 'chiaro');
  }
  window.applicaTema = applicaTema;

  function applicaAspetto() {
    applicaTema();
    const s = caricaAspetto();
    document.body.classList.toggle('aspect-header-bg',  !!s.header);
    document.body.classList.toggle('aspect-page-bg',    !!s.page);
    document.body.classList.toggle('aspect-sidebar-bg', !!s.sidebar);
    // Assicura la classe mainbg-<pagina> su #main per lo sfondo full-page
    const main = document.getElementById('main');
    if (main) {
      main.className = main.className.replace(/\bmainbg-\S+/g, '').trim();
      const pg = (STATE && STATE.pageCorrente) || 'dashboard';
      main.classList.add('mainbg-' + pg);
    }
  }

  function mostraModaleSettings() {
    const dataProva = caricaDaStorage(SK_DATA_PROVA);
    const diario    = carCaricaDiario();
    const padron    = carCaricaPadron();

    const nGiorniDiario = Object.keys(diario).length;
    const nPadron = Object.values(padron).filter(èPadroneggiato).length;

    const asp = caricaAspetto();
    document.getElementById('modalTitle').textContent = '⚙ Impostazioni';
    const _syncOn = window.SyncCore && SyncCore.configurato();
    const _syncUser = _syncOn && SyncCore.loggato() ? SyncCore.utente() : null;
    const _syncUlt = _syncOn ? SyncCore.ultimoSync() : null;
    document.getElementById('modalText').innerHTML = `
      <div class="settings-section">
        <h4 class="settings-h">👤 Account e sincronizzazione</h4>
        ${!_syncOn ? `
          <p class="settings-desc">La sincronizzazione cloud non è configurata in questa versione dell'app.
          Quando sarà attiva potrai accedere con nick e password e ritrovare i tuoi progressi su PC e smartphone.</p>
        ` : _syncUser ? `
          <div class="settings-info"><span>Connesso come:</span>
            <strong>${escapeHTML(_syncUser.nick)} (${escapeHTML(_syncUser.email)})</strong></div>
          <div class="settings-info"><span>Ultimo sync:</span>
            <strong id="set-sync-stato">${_syncUlt ? new Date(_syncUlt.at).toLocaleString('it-IT') + (_syncUlt.verso === 'push' ? ' ↑' : ' ↓') : 'mai'}${SyncCore.haModifichePendenti() ? ' · modifiche da inviare' : ''}</strong></div>
          <p class="settings-desc">I progressi si sincronizzano da soli (all'avvio, dopo ogni attività e all'uscita). Puoi forzare ora:</p>
          <div class="settings-actions">
            <button class="btn btn-primary" id="set-sync-push">⬆ Invia al cloud</button>
            <button class="btn" id="set-sync-pull">⬇ Scarica dal cloud</button>
            <button class="btn btn-ghost" id="set-sync-esci">Esci dall'account</button>
            <button class="btn btn-danger" id="set-sync-elimina">🗑 Elimina account</button>
          </div>
          <p class="settings-desc" style="font-size:.85em;opacity:.75;margin-top:8px">
            ⚠ "Scarica dal cloud" <strong>sostituisce</strong> i dati di questo dispositivo con quelli sincronizzati.
            "Esci" scollega solo questo dispositivo (i dati locali e quelli sul cloud restano).
            "Elimina account" cancella account e dati dal cloud: l'email torna libera, i dati locali restano.</p>
        ` : `
          <p class="settings-desc">Accedi (o crea un account) per ritrovare i tuoi progressi su tutti i dispositivi: PC e smartphone sempre allineati.</p>
          <div class="settings-row"><input type="text" class="car-input" id="set-sync-nick" placeholder="Nick (solo per la registrazione)"></div>
          <div class="settings-row"><input type="email" class="car-input" id="set-sync-email" placeholder="Email"></div>
          <div class="settings-row"><input type="password" class="car-input" id="set-sync-pass" placeholder="Password (min 6 caratteri)"></div>
          <div class="settings-actions">
            <button class="btn btn-primary" id="set-sync-login">Accedi</button>
            <button class="btn" id="set-sync-signup">Crea account</button>
            <button class="btn btn-ghost" id="set-sync-recupero" title="Riceverai una email con il link per impostare una nuova password">Password dimenticata?</button>
          </div>
          <div class="settings-info" id="set-sync-msg" style="display:none"></div>
        `}
      </div>

      <div class="settings-section">
        <h4 class="settings-h">📅 Data della prova</h4>
        <div class="settings-row">
          <input type="date" class="car-input" id="set-data-prova" value="${dataProva || ''}" min="${oggiISO()}">
          <button class="btn" id="set-data-save">Salva</button>
        </div>
      </div>

      <div class="settings-section">
        <h4 class="settings-h">💾 Backup completo</h4>
        <p class="settings-desc">
          Salva <strong>tutti</strong> i tuoi dati in un unico file: progressi, padroneggiamento,
          <strong>tutti i save (piani e partite)</strong>, diario ranked, prova scritta e impostazioni.
          Usalo come copia di sicurezza, per spostarti su un altro dispositivo o
          <strong>prima di aggiornare l'app a una nuova versione</strong>.
        </p>
        <div class="settings-info">
          <span>Stato locale:</span>
          <strong>${nGiorniDiario} giorni di studio · ${nPadron.toLocaleString('it-IT')} quiz padroneggiati</strong>
        </div>
        <div class="settings-actions">
          <button class="btn btn-primary" id="set-export">📤 Esporta backup</button>
          <button class="btn" id="set-import">📥 Ripristina da file</button>
        </div>
        <input type="file" id="set-import-file" accept=".json,application/json" style="display:none;">
        <p class="settings-desc" style="margin-top:8px;font-size:.85em;opacity:.75;">
          ⚠ Il ripristino <strong>sostituisce</strong> i dati attuali con quelli del file.
        </p>
        <div class="settings-info" id="set-db-info" style="display:none;"></div>
      </div>

      <div class="settings-section" id="set-autobackup-sec" style="display:none;">
        <h4 class="settings-h">🛟 Backup automatici</h4>
        <p class="settings-desc">
          Snapshot completi salvati su disco automaticamente (all'avvio e ogni ora),
          rotazione sugli ultimi ${(window.AutoBackup && window.AutoBackup.KEEP) || 15}.
          Puoi ripristinarne uno in qualsiasi momento.
        </p>
        <div class="settings-actions">
          <button class="btn btn-primary" id="set-ab-now">📸 Crea snapshot ora</button>
          <button class="btn" id="set-ab-folder">📂 Apri cartella</button>
        </div>
        <div id="set-ab-list" style="margin-top:12px;"></div>
      </div>

      <div class="settings-section" id="set-update-sec" style="display:none;">
        <h4 class="settings-h">🔄 Aggiornamenti</h4>
        <p class="settings-desc">
          L'app si aggiorna automaticamente all'avvio. Puoi anche controllare ora.
        </p>
        <div class="settings-actions">
          <button class="btn" id="set-update-check">🔄 Cerca aggiornamenti</button>
        </div>
      </div>

      <div class="settings-section" id="set-adminpanel-sec" style="display:none;">
        <h4 class="settings-h">🛠 Pannello Bandi (avanzato)</h4>
        <p class="settings-desc">
          Editor del catalogo bandi: materie richieste, import banche quiz, proporzioni.
          Scrive direttamente i file del progetto — solo per build di sviluppo.
        </p>
        <div class="settings-actions">
          <button class="btn" id="set-adminpanel-apri">🛠 Apri pannello</button>
        </div>
      </div>

      <div class="settings-section">
        <h4 class="settings-h">🎨 Aspetto</h4>
        <div class="settings-row">
          <span>Tema dell'interfaccia</span>
          <select class="car-input" id="set-tema" style="min-width:160px">
            <option value="scuro"  ${caricaTema() === 'scuro'  ? 'selected' : ''}>🌙 Scuro (default)</option>
            <option value="chiaro" ${caricaTema() === 'chiaro' ? 'selected' : ''}>☀️ Chiaro (stile Claude)</option>
          </select>
        </div>
        <p class="settings-desc">
          Mostra immagini di sfondo decorative in dissolvenza (PNG in <code>assets/</code>).
          Disattiva ciò che non ti serve per un look più essenziale.
        </p>
        <label class="settings-toggle">
          <input type="checkbox" id="set-bg-header" ${asp.header ? 'checked' : ''}>
          <span>Sfondo nei <strong>page-header</strong> (intestazioni delle pagine)</span>
        </label>
        <label class="settings-toggle">
          <input type="checkbox" id="set-bg-page" ${asp.page ? 'checked' : ''}>
          <span>Sfondo per <strong>l'intera pagina</strong> (area centrale)</span>
        </label>
        <label class="settings-toggle">
          <input type="checkbox" id="set-bg-sidebar" ${asp.sidebar ? 'checked' : ''}>
          <span>Sfondo nel <strong>menu laterale</strong> (sidebar a sinistra)</span>
        </label>
      </div>

      <div class="settings-section">
        <h4 class="settings-h">🤖 Valutazione AI (Prova Scritta)</h4>
        <p class="settings-desc">
          La correzione degli elaborati usa un'IA. Scegli il <strong>provider</strong>.
          Consigliato <strong>Groq</strong> (gratuito, nessuna carta richiesta): crea la chiave su
          <code>console.groq.com/keys</code>. In alternativa <strong>Google Gemini</strong>
          (<code>aistudio.google.com/apikey</code>). La chiave resta <strong>solo su questo dispositivo</strong>.
        </p>
        <div class="settings-row">
          <span>Provider IA</span>
          <select class="car-input" id="set-ai-provider" style="min-width:200px">
            <option value="groq"   ${(typeof aiGetProvider === 'function' && aiGetProvider() === 'groq')   ? 'selected' : ''}>⚡ Groq — gratis (consigliato)</option>
            <option value="gemini" ${(typeof aiGetProvider === 'function' && aiGetProvider() === 'gemini') ? 'selected' : ''}>🔷 Google Gemini</option>
          </select>
        </div>
        <div class="settings-row">
          <input type="password" class="car-input" id="set-gemini-key"
                 placeholder="Incolla qui la tua API key"
                 value="${(typeof aiGetProvider === 'function' && aiGetProvider() === 'gemini') ? (typeof geminiGetKey === 'function' ? geminiGetKey() : '') : (typeof groqGetKey === 'function' ? groqGetKey() : '')}">
          <button class="btn" id="set-gemini-save">Salva</button>
          <button class="btn btn-ghost" id="set-gemini-test">Test</button>
        </div>
        <div class="settings-info" id="set-gemini-stato">
          <span>Stato:</span>
          <strong>${(typeof geminiHaKey === 'function' && geminiHaKey()) ? 'chiave configurata ✓' : 'nessuna chiave'}</strong>
        </div>
        <div id="set-ai-quota" style="margin-top:10px"></div>
      </div>

      <div class="settings-section">
        <h4 class="settings-h" style="color:var(--rust);">⚠ Zona pericolosa</h4>
        <p class="settings-desc">Operazioni irreversibili. Esegui prima un backup.</p>
        <div class="settings-actions">
          <button class="btn btn-danger" id="set-reset-studiati">Azzera "studiati" (scritto)</button>
          <button class="btn btn-danger" id="set-reset-elaborati">Azzera elaborati (scritto)</button>
          <button class="btn btn-danger" id="set-reset-tutto">Resetta tutti i dati</button>
        </div>
      </div>
    `;

    document.getElementById('modalConfirm').style.display = 'none';
    document.getElementById('modal').classList.add('active');

    setTimeout(() => {
      // ── Account e sincronizzazione ──
      const _syncMsg = (txt, errore) => {
        const el = document.getElementById('set-sync-msg');
        if (!el) { toast(txt, !!errore); return; }
        el.style.display = '';
        el.innerHTML = '<span></span><strong style="' + (errore ? 'color:var(--rust-bright)' : '') + '">' + escapeHTML(txt) + '</strong>';
      };
      const _syncDopoAuth = async (azione) => {
        try {
          _syncMsg('Un momento…');
          await azione();
          // Primo accesso su questo dispositivo: se il cloud ha già dati
          // chiedo cosa fare, altrimenti invio quelli locali.
          _syncMsg('Connesso. Controllo i dati sul cloud…');
          let scaricato = false;
          try { scaricato = (await SyncCore.pull({ silenzioso: true })).fatto; } catch (_) {}
          if (!scaricato) await SyncCore.push();   // cloud vuoto → invia i dati locali
          location.reload();
        } catch (e) { _syncMsg(e.message, true); }
      };
      const btnLogin = document.getElementById('set-sync-login');
      if (btnLogin) btnLogin.onclick = () => {
        const email = document.getElementById('set-sync-email').value;
        const pass  = document.getElementById('set-sync-pass').value;
        if (!email || !pass) { _syncMsg('Inserisci email e password.', true); return; }
        _syncDopoAuth(() => SyncCore.accedi(email, pass));
      };
      const btnSignup = document.getElementById('set-sync-signup');
      if (btnSignup) btnSignup.onclick = () => {
        const nick  = document.getElementById('set-sync-nick').value;
        const email = document.getElementById('set-sync-email').value;
        const pass  = document.getElementById('set-sync-pass').value;
        if (!nick || !email || !pass) { _syncMsg('Compila nick, email e password.', true); return; }
        _syncDopoAuth(() => SyncCore.registra(nick, email, pass));
      };
      const btnPush = document.getElementById('set-sync-push');
      if (btnPush) btnPush.onclick = async () => {
        try { btnPush.disabled = true; await SyncCore.push(); toast('Progressi inviati al cloud ✓'); closeModalSettings(); }
        catch (e) { toast('Sync: ' + e.message, true); }
        finally { btnPush.disabled = false; }
      };
      const btnPull = document.getElementById('set-sync-pull');
      if (btnPull) btnPull.onclick = () => {
        closeModalSettings();
        showModal('⬇ Scarica dal cloud',
          'I dati di questo dispositivo verranno SOSTITUITI con quelli sincronizzati sul cloud. Continuare?',
          async () => {
            try { await SyncCore.pull(); }
            catch (e) { toast('Sync: ' + e.message, true); }
          }, 'Sì, scarica');
      };
      const btnEsci = document.getElementById('set-sync-esci');
      if (btnEsci) btnEsci.onclick = () => {
        SyncCore.esci();
        toast('Disconnesso. I dati locali restano su questo dispositivo.');
        closeModalSettings();
      };
      const btnRecupero = document.getElementById('set-sync-recupero');
      if (btnRecupero) btnRecupero.onclick = async () => {
        const email = document.getElementById('set-sync-email').value;
        try {
          await SyncCore.recuperaPassword(email);
          _syncMsg('Email inviata a ' + email + ': apri il link per impostare la nuova password.');
        } catch (e) { _syncMsg(e.message, true); }
      };
      const btnElimina = document.getElementById('set-sync-elimina');
      if (btnElimina) btnElimina.onclick = () => {
        closeModalSettings();
        showModal('🗑 Elimina account',
          'L\'account e i dati sincronizzati sul cloud verranno CANCELLATI definitivamente. ' +
          'L\'email tornerà libera per un nuovo account. I dati su questo dispositivo NON vengono toccati. Continuare?',
          async () => {
            try { await SyncCore.eliminaAccount(); toast('Account eliminato. I dati locali sono ancora qui.'); }
            catch (e) { toast(e.message, true); }
          }, 'Sì, elimina');
      };

      document.getElementById('set-data-save').onclick = () => {
        const v = document.getElementById('set-data-prova').value;
        if (v) salvaInStorage(SK_DATA_PROVA, v);
        else localStorage.removeItem(SK_DATA_PROVA);
        aggiornaCountdown();
        toast('Data prova aggiornata');
        closeModalSettings();
      };
      // Toggle Aspetto: aggiornano lo storage e applicano subito le classi
      const toggleAspetto = (id, chiave) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', () => {
          const a = caricaAspetto();
          a[chiave] = el.checked;
          salvaAspetto(a);
          applicaAspetto();
        });
      };
      toggleAspetto('set-bg-header',  'header');
      toggleAspetto('set-bg-page',    'page');
      toggleAspetto('set-bg-sidebar', 'sidebar');
      const temaSel = document.getElementById('set-tema');
      if (temaSel) temaSel.addEventListener('change', () => {
        salvaInStorage(SK_TEMA, temaSel.value);
        applicaTema();
      });

      // Barra quota Groq (dagli header rate-limit dell'ultima chiamata).
      function _renderQuota() {
        const box = document.getElementById('set-ai-quota');
        if (!box) return;
        const prov = (typeof aiGetProvider === 'function') ? aiGetProvider() : 'groq';
        if (prov !== 'groq') { box.innerHTML = ''; return; }
        const q = (typeof aiGetQuota === 'function') ? aiGetQuota() : null;
        if (!q) { box.innerHTML = '<span class="settings-desc" style="font-size:12px;opacity:.7">Quota: ancora nessun dato. Fai un Test o una valutazione per iniziare a misurare.</span>'; return; }
        // barra di USATO (riempie man mano che consumi)
        const bar = (used, lim, label, extra) => {
          if (!lim || lim <= 0) return '';
          const pct = Math.max(0, Math.min(100, Math.round(used / lim * 100)));
          const col = pct < 60 ? 'var(--sage-bright,#8fbf7f)' : pct < 85 ? 'var(--amber-bright,#d9a23f)' : 'var(--rust-bright,#e0795a)';
          return `<div style="margin:6px 0">
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-secondary)"><span>${label}</span><span>${used}/${lim}${extra ? ' · ' + extra : ''}</span></div>
            <div style="height:7px;background:rgba(128,128,128,.25);border-radius:4px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${col}"></div></div>
          </div>`;
        };
        box.innerHTML = `
          <div class="settings-info" style="margin-bottom:6px">
            <span>Valutazioni ancora possibili (stima):</span>
            <strong>~${q.evalsMin} in questo minuto · ~${q.evalsDay} oggi</strong>
          </div>
          <div class="settings-desc" style="font-size:11px;margin-bottom:2px">Consumo Groq (stima locale, modello ${(typeof groqGetModel === 'function' ? groqGetModel() : '')}):</div>
          ${bar(q.tokMin, q.lim.tpm, 'Token / minuto', q.resetMinSec ? 'reset tra ' + q.resetMinSec + 's' : '')}
          ${bar(q.tokDay, q.lim.tpd, 'Token / giorno', '')}
          ${bar(q.reqMin, q.lim.rpm, 'Richieste / minuto', '')}
          <div class="settings-desc" style="font-size:10px;opacity:.6;margin-top:4px">Stima basata sui token realmente usati (~${q.avgTok}/valutazione). I limiti del piano gratuito possono variare.</div>
        `;
      }
      _renderQuota();

      // Provider IA (Groq / Gemini): cambia provider e ricarica il campo chiave.
      const provSel = document.getElementById('set-ai-provider');
      const keyInput = document.getElementById('set-gemini-key');
      if (provSel) provSel.onchange = () => {
        if (typeof aiSetProvider === 'function') aiSetProvider(provSel.value);
        if (keyInput) keyInput.value = (provSel.value === 'gemini' ? geminiGetKey() : groqGetKey());
        const stato = document.getElementById('set-gemini-stato');
        if (stato) stato.querySelector('strong').textContent = geminiHaKey() ? 'chiave configurata ✓' : 'nessuna chiave';
        _renderQuota();
        toast('Provider: ' + (provSel.value === 'gemini' ? 'Gemini' : 'Groq'));
      };

      // Salva la chiave nel provider ATTIVO.
      const gemSave = document.getElementById('set-gemini-save');
      if (gemSave) gemSave.onclick = () => {
        const v = document.getElementById('set-gemini-key').value;
        if (aiGetProvider() === 'gemini') geminiSetKey(v); else groqSetKey(v);
        const stato = document.getElementById('set-gemini-stato');
        if (stato) stato.querySelector('strong').textContent = geminiHaKey() ? 'chiave configurata ✓' : 'nessuna chiave';
        toast('API key salvata ✓');
      };
      const gemTest = document.getElementById('set-gemini-test');
      if (gemTest) gemTest.onclick = async () => {
        const v = document.getElementById('set-gemini-key').value.trim();
        // Salva prima, così il test usa la chiave appena inserita.
        if (aiGetProvider() === 'gemini') geminiSetKey(v); else groqSetKey(v);
        gemTest.disabled = true; gemTest.textContent = 'Test…';
        try {
          await geminiTestKey(v);
          toast('Connessione ' + (aiGetProvider() === 'gemini' ? 'Gemini' : 'Groq') + ' riuscita ✓');
          const stato = document.getElementById('set-gemini-stato');
          if (stato) stato.querySelector('strong').textContent = geminiHaKey() ? 'chiave configurata ✓' : 'nessuna chiave';
          _renderQuota();
        } catch (e) {
          toast(e.message || 'Test fallito', true);
        } finally {
          gemTest.disabled = false; gemTest.textContent = 'Test';
        }
      };

      // Modalità app desktop (Tauri): mostra il percorso reale del DB SQLite.
      if (window.CMPersist && window.CMPersist.isTauri && window.CMPersist.dbPath) {
        const info = document.getElementById('set-db-info');
        if (info) {
          window.CMPersist.dbPath().then((p) => {
            info.style.display = '';
            info.innerHTML = '<span>💽 Database su disco (app desktop):</span><br><code style="word-break:break-all;font-size:.8em;">' + p + '</code>';
          }).catch(() => {});
        }
      }

      // Backup automatici (solo Tauri): mostra sezione + lista snapshot.
      if (window.AutoBackup && window.AutoBackup.enabled) {
        const sec = document.getElementById('set-autobackup-sec');
        if (sec) sec.style.display = '';
        const bNow = document.getElementById('set-ab-now');
        if (bNow) bNow.onclick = async () => {
          bNow.disabled = true;
          try { await window.AutoBackup.createSnapshot('manuale'); toast('Snapshot creato ✓'); _renderAutobackupList(); }
          catch (e) { toast('Errore snapshot: ' + e.message, true); }
          finally { bNow.disabled = false; }
        };
        const bFold = document.getElementById('set-ab-folder');
        if (bFold) bFold.onclick = () => window.AutoBackup.reveal().catch(() => toast('Impossibile aprire la cartella', true));
        _renderAutobackupList();
      }

      // Aggiornamenti (solo Tauri): pulsante check manuale.
      if (window.AppUpdater && window.AppUpdater.enabled) {
        const usec = document.getElementById('set-update-sec');
        if (usec) usec.style.display = '';
        const bUpd = document.getElementById('set-update-check');
        if (bUpd) bUpd.onclick = async () => {
          bUpd.disabled = true;
          const old = bUpd.textContent;
          bUpd.textContent = 'Controllo…';
          try { await window.AppUpdater.check(false); }
          finally { bUpd.disabled = false; bUpd.textContent = old; }
        };
      }

      // Pannello Bandi (solo Tauri dev, cfg!(debug_assertions) lato Rust).
      if (window.AdminPanel && window.AdminPanel.enabled) {
        const asec = document.getElementById('set-adminpanel-sec');
        if (asec) asec.style.display = '';
        const bAdmin = document.getElementById('set-adminpanel-apri');
        if (bAdmin) bAdmin.onclick = () => window.AdminPanel.apriPannello();
      }

      document.getElementById('set-export').onclick = esportaProgressi;
      document.getElementById('set-import').onclick = () => document.getElementById('set-import-file').click();
      document.getElementById('set-import-file').onchange = (e) => {
        if (e.target.files && e.target.files[0]) importaProgressi(e.target.files[0]);
      };
      const _bRStud = document.getElementById('set-reset-studiati');
      if (_bRStud) _bRStud.onclick = () => {
        closeModalSettings();
        showModal('Azzerare i quesiti "studiati"?',
          'Rimuove lo stato "studiato" da tutti i quesiti scritti. Elaborati e voti restano. Irreversibile.',
          () => { if (window.scrAzzeraStudiati) scrAzzeraStudiati(); toast('Studiati azzerati'); },
          'Sì, azzera');
      };
      const _bRElab = document.getElementById('set-reset-elaborati');
      if (_bRElab) _bRElab.onclick = () => {
        closeModalSettings();
        showModal('Azzerare gli elaborati dello scritto?',
          '⚠ Elimina <strong>tutti</strong> gli elaborati consegnati e le valutazioni/voti (storico per-quesito). Lo stato "studiato" resta. Irreversibile.',
          () => { if (window.scrAzzeraDiario) scrAzzeraDiario(); toast('Elaborati azzerati'); },
          'Sì, azzera');
      };
      document.getElementById('set-reset-tutto').onclick = () => {
        closeModalSettings();
        showModal('Resettare TUTTI i dati?',
          '⚠ <strong>ATTENZIONE</strong>: questa azione cancella TUTTI i dati salvati: banche dati, progressi, save, padroneggiati, diario, RP ranked. Operazione irreversibile. Si raccomanda di esportare prima un backup.',
          async () => {
            localStorage.clear();
            indexedDB.deleteDatabase('concorso_manager_db');
            if (window.CMPersist && window.CMPersist.isTauri) {
              try { await window.CMPersist.flush(); } catch (_) {}
            }
            toast('Tutti i dati cancellati. Ricarico la pagina...');
            setTimeout(() => location.reload(), 1000);
          });
      };
    }, 0);
  }

  function closeModalSettings() {
    closeModal();
    setTimeout(() => {
      const btnConf = document.getElementById('modalConfirm');
      if (btnConf) btnConf.style.display = '';
    }, 250);
  }

  // ═══════ Backup completo (export / restore) — usa window.BackupCore ═══════

  async function esportaProgressi() {
    if (!window.BackupCore) { toast('Modulo backup non disponibile', true); return; }
    try {
      await BackupCore.esporta();
      toast('Backup completo esportato ✓');
    } catch (err) {
      console.error('esporta backup:', err);
      toast('Errore esportazione: ' + err.message, true);
    }
  }

  function importaProgressi(file) {
    if (!window.BackupCore) { toast('Modulo backup non disponibile', true); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      let raw;
      try { raw = JSON.parse(e.target.result); }
      catch (err) { toast('File non leggibile (JSON non valido)', true); return; }

      if (!BackupCore.valida(raw)) {
        toast('File non riconosciuto come backup di Call Of Quiz', true);
        return;
      }

      const s = BackupCore.stats(raw);
      const dataExport = s.exportedAt ? new Date(s.exportedAt).toLocaleString('it-IT') : 'sconosciuta';

      closeModalSettings();
      showModal('Ripristinare questo backup?',
        `<strong>File di backup</strong><br>Esportato il ${dataExport} da <em>${s.device}</em>.<br><br>
        <strong>Contenuto del file:</strong><br>
        ┃ ${s.saves} save · ${s.giorni} giorni di studio · ${s.padron.toLocaleString('it-IT')} padroneggiati<br>
        ┃ ${s.chiavi} chiavi dati${s.idb ? ' · ' + s.idb + ' banche/manifest' : ''}<br><br>
        ⚠ I dati attuali verranno <strong>sostituiti completamente</strong> con quelli del backup.
        L'app verrà ricaricata.`,
        async () => {
          try {
            await BackupCore.ripristina(raw, { replace: true });
            if (window.CMPersist && window.CMPersist.isTauri) {
              try { await window.CMPersist.flush(); } catch (_) {}
            }
            toast('Backup ripristinato ✓ Ricarico…');
            setTimeout(() => location.reload(), 900);
          } catch (err) {
            console.error('ripristina backup:', err);
            toast('Errore ripristino: ' + err.message, true);
          }
        },
        'Sì, ripristina');
    };
    reader.onerror = () => toast('Errore lettura file', true);
    reader.readAsText(file);
  }

  // ═══════ Backup automatici — lista / ripristino (solo Tauri) ═══════

  async function _renderAutobackupList() {
    const cont = document.getElementById('set-ab-list');
    if (!cont || !window.AutoBackup || !window.AutoBackup.enabled) return;
    cont.innerHTML = '<div class="settings-desc" style="opacity:.7;">Carico…</div>';
    let lista;
    try { lista = await window.AutoBackup.list(); }
    catch (e) { cont.innerHTML = '<div class="settings-desc">Errore lettura snapshot</div>'; return; }
    if (!lista || !lista.length) {
      cont.innerHTML = '<div class="settings-desc" style="opacity:.7;">Nessuno snapshot ancora. Il primo verrà creato a breve.</div>';
      return;
    }
    cont.innerHTML = lista.map(b => {
      const data = new Date(b.modified * 1000).toLocaleString('it-IT');
      const kb = (b.size / 1024).toFixed(0);
      return `<div style="display:flex;align-items:center;gap:8px;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(128,128,128,.2);">
        <span style="font-size:.85em;">📦 <strong>${data}</strong> · ${kb} KB</span>
        <span style="display:flex;gap:6px;flex-shrink:0;">
          <button class="btn btn-ghost btn-ab-restore" data-name="${b.name}" title="Ripristina">↩ Ripristina</button>
          <button class="btn btn-ghost btn-ab-del" data-name="${b.name}" title="Elimina">🗑</button>
        </span>
      </div>`;
    }).join('');
    cont.querySelectorAll('.btn-ab-restore').forEach(btn => {
      btn.onclick = () => _ripristinaAutobackup(btn.dataset.name);
    });
    cont.querySelectorAll('.btn-ab-del').forEach(btn => {
      btn.onclick = async () => {
        try { await window.AutoBackup.del(btn.dataset.name); toast('Snapshot eliminato'); _renderAutobackupList(); }
        catch (e) { toast('Errore eliminazione', true); }
      };
    });
  }

  function _ripristinaAutobackup(name) {
    closeModalSettings();
    showModal('Ripristinare questo snapshot?',
      `Snapshot: <strong>${name}</strong>.<br><br>⚠ I dati attuali verranno <strong>sostituiti</strong>. L'app verrà ricaricata.`,
      async () => {
        try {
          await window.AutoBackup.restore(name);
          toast('Snapshot ripristinato ✓ Ricarico…');
          setTimeout(() => location.reload(), 900);
        } catch (e) {
          console.error('restore autobackup:', e);
          toast('Errore ripristino: ' + e.message, true);
        }
      },
      'Sì, ripristina');
  }

  // ═══════ Hamburger menu (mobile) ═══════

  function toggleSidebarMobile(forceOpen) {
    const sidebar  = document.querySelector('.sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (!sidebar || !backdrop) return;
    const isOpen    = sidebar.classList.contains('open');
    const shouldOpen = (forceOpen === true) || (forceOpen === undefined && !isOpen);
    if (shouldOpen) {
      sidebar.classList.add('open');
      backdrop.classList.add('active');
    } else {
      sidebar.classList.remove('open');
      backdrop.classList.remove('active');
    }
  }

  document.getElementById('btnHamburger').addEventListener('click', () => toggleSidebarMobile());
  document.getElementById('sidebarBackdrop').addEventListener('click', () => toggleSidebarMobile(false));

  document.querySelectorAll('.sidebar .nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const isMobile = window.matchMedia
        ? window.matchMedia('(max-width: 768px)').matches
        : (window.innerWidth <= 768);
      if (isMobile) toggleSidebarMobile(false);
    });
  });
