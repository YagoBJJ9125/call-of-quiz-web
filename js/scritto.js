  // ═══════════════════════════════════════════════════════
  // SCRITTO — Prova scritta. Struttura a due viste:
  //   1) MAPPA (renderScritto): filtro materie a scomparsa → mappa 2 livelli
  //      Materia → Argomento(=legge/normativa), ogni nodo conta i quesiti e
  //      apre la lista. (Nessun "avvia quiz": è studio/esercizio, non quiz.)
  //   2) LISTA quesiti (scrApriListaQuesiti): card quesito ridisegnate, con
  //      filtri (difficoltà, studiato), header organizzato e STORICO per-quesito
  //      (elaborati consegnati + valutazioni ricevute, in memoria).
  //
  //   • Banca quesiti: window.CM_QUESITI
  //   • Diario tentativi: cm:scritto:diario  → PER-SAVE (testo + valutazione)
  //   • Stato "studiato":  cm:scritto:studiati → GLOBALE
  //   • Valutazione AI: gemini-client.js
  // ═══════════════════════════════════════════════════════

  const SCR_SK_DIARIO    = 'cm:scritto:diario';     // PER-SAVE
  const SCR_SK_STUDIATI  = 'cm:scritto:studiati';   // GLOBAL
  const SCR_CRITERI = [
    { k: 'pertinenza',     label: 'Pertinenza e completezza' },
    { k: 'approfondimento',label: 'Approfondimento tecnico' },
    { k: 'chiarezza',      label: 'Chiarezza espositiva' },
    { k: 'analisiSintesi', label: 'Analisi e sintesi' },
    { k: 'aderenza',       label: 'Aderenza alla traccia' },
  ];

  // ─── Stato vista ───
  let _SCR_EX        = null;                 // esercitazione corrente
  // Default: NESSUNA materia selezionata (Set vuoto). L'utente le aggiunge dal
  // filtro/ricerca. null = "mostra tutte" (impostato da "Mostra tutto").
  let _SCR_MATVIS    = new Set();
  let _SCR_FILTRI_EXP = true;                // filtro aperto di default
  let _SCR_OPEN_MAT  = null;                 // materia_id selezionata nella mappa
  let _SCR_ORD       = 'peso';               // ordine materie: 'peso' | 'az'
  let _SCR_LISTA     = null;                 // { materiaId, argId } contesto lista
  let _SCR_QFILTRO   = { diff: 'tutte', studiato: 'tutti' };

  // ─── Lookup PIANO scritto (tassonomia dedicata, js/quesiti-piano.js) ───
  function _scrPiano() {
    return (window.CM_QUESITI_PIANO && Array.isArray(window.CM_QUESITI_PIANO.materie))
      ? window.CM_QUESITI_PIANO.materie : [];
  }
  // Compat: alcune funzioni usano ancora _scrProgramma()
  function _scrProgramma() { return _scrPiano(); }
  // Quesiti previsti per una materia (somma n_quesiti dei suoi argomenti)
  function _scrPrevistiMateria(m) {
    return (m.argomenti || []).reduce((s, a) => s + (a.n_quesiti || 0), 0);
  }

  // ─── MACRO-MATERIE: raggruppano le materie-piano in poche categorie leggibili.
  // La mappa parte da qui (L1 = macro). Le materie-piano non elencate finiscono
  // automaticamente in "Altre materie".
  const SCR_MACRO = [
    { id: 'g_amm',        nome: 'Diritto Amministrativo',             materie: ['M01_legge_241', 'M14_dpr_445', 'M23_redazione_atti', 'M27_urp_comunicazione'] },
    { id: 'g_trasp',      nome: 'Trasparenza e Anticorruzione',        materie: ['M04_anticorruzione', 'M05_trasparenza'] },
    { id: 'g_impiego',    nome: 'Pubblico Impiego e Personale',        materie: ['M02_dlgs_165', 'M03_dpr_62', 'M12_performance', 'M25_gestione_personale', 'M19_competenze_trasversali'] },
    { id: 'g_entiloc',    nome: 'Enti Locali',                         materie: ['M10_tuel', 'M26_figure_speciali_bilancio', 'M22_servizi_demografici'] },
    { id: 'g_contab',     nome: 'Contabilità e Tributi',               materie: ['M11_dlgs_118', 'M24_contabilita_tributaria_avanzata', 'M21_tributi_locali'] },
    { id: 'g_contratti',  nome: 'Contratti Pubblici',                  materie: ['M13_contratti_pubblici'] },
    { id: 'g_digitale',   nome: 'Privacy e Amministrazione Digitale',  materie: ['M06_gdpr', 'M15_cad', 'M20_informatica_applicata'] },
    { id: 'g_penale',     nome: 'Diritto Penale',                      materie: ['M07_diritto_penale_pa'] },
    { id: 'g_giuridiche', nome: 'Costituzionale, Civile e UE',         materie: ['M08_diritto_costituzionale', 'M09_diritto_civile', 'M16_diritto_ue'] },
    { id: 'g_difesa',     nome: 'Ordinamento Difesa',                  materie: ['M17_ordinamento_difesa'] },
    { id: 'g_inglese',    nome: 'Inglese',                             materie: ['M18_inglese'] },
  ];
  // Costruisce i gruppi effettivi (solo materie-piano esistenti) + "Altre".
  function _scrGruppi() {
    const piano = _scrPiano();
    const idSet = new Set(piano.map(m => m.materia_id));
    const usate = new Set();
    const gruppi = [];
    for (const g of SCR_MACRO) {
      const mids = g.materie.filter(id => idSet.has(id));
      mids.forEach(id => usate.add(id));
      if (mids.length) gruppi.push({ id: g.id, nome: g.nome, materie: mids });
    }
    const altre = piano.filter(m => !usate.has(m.materia_id)).map(m => m.materia_id);
    if (altre.length) gruppi.push({ id: 'g_altre', nome: 'Altre materie', materie: altre });
    return gruppi;
  }
  // Raggruppa i quesiti per materia_id → argomento_id
  function _scrRaggruppa() {
    const perMat = {};   // materiaId → { tot, args: { argId: [quesiti] } }
    for (const q of scrGetQuesiti()) {
      const mid = q.materia_id || '__nc__';
      const aid = q.argomento_id || '__nc__';
      const M = (perMat[mid] = perMat[mid] || { tot: 0, args: {} });
      M.tot++;
      (M.args[aid] = M.args[aid] || []).push(q);
    }
    return perMat;
  }
  // Etichetta argomento (piano): nome + (legge) tra parentesi
  function _scrArgLabel(argObj) {
    if (!argObj) return 'Altro';
    const nome = argObj.argomento || argObj.nome || 'Argomento';
    return argObj.legge ? `${nome} (${argObj.legge})` : nome;
  }

  // ─── Accesso dati ───
  function scrGetQuesiti() {
    return (window.CM_QUESITI && Array.isArray(window.CM_QUESITI.quesiti))
      ? window.CM_QUESITI.quesiti : [];
  }
  function scrQuesitoById(id) { return scrGetQuesiti().find(q => q.id === id) || null; }
  function scrCaricaDiario()  { return caricaDaStorage(SCR_SK_DIARIO) || []; }
  function scrSalvaDiario(d)  { salvaInStorage(SCR_SK_DIARIO, d); }
  function scrCaricaStudiati(){ return caricaDaStorage(SCR_SK_STUDIATI) || {}; }
  function scrSalvaStudiati(s){ salvaInStorage(SCR_SK_STUDIATI, s); }

  function scrMarcaStudiato(id) {
    const s = scrCaricaStudiati();
    const cur = s[id] || { conteggio: 0 };
    s[id] = { conteggio: (cur.conteggio || 0) + 1, ultimoTs: new Date().toISOString() };
    scrSalvaStudiati(s);
  }
  function scrRimuoviStudiato(id) {
    const s = scrCaricaStudiati();
    if (s[id]) { delete s[id]; scrSalvaStudiati(s); }
  }
  function scrEStudiato(id) { return !!scrCaricaStudiati()[id]; }
  function scrAzzeraStudiati() { scrSalvaStudiati({}); }
  function scrAzzeraDiario()   { scrSalvaDiario([]); }

  // ─── Viste rapide: elenco studiati / elaborati (modale) ───
  function _scrSnippet(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; }

  // Barra controlli condivisa (ricerca + materia + ordine)
  function _scrControlliVista(materie, sortOpts) {
    return `
      <div class="scr-vista-ctrl">
        <input type="search" class="scr-vista-search" id="scr-vista-q" placeholder="🔎 cerca…">
        <select class="scr-vista-sel" id="scr-vista-mat">
          <option value="__tutte__">Tutte le materie</option>
          ${materie.map(m => `<option value="${_scrEsc(m)}">${_scrEsc(m)}</option>`).join('')}
        </select>
        <select class="scr-vista-sel" id="scr-vista-sort">
          ${sortOpts.map(o => `<option value="${o.v}">${o.l}</option>`).join('')}
        </select>
      </div>`;
  }

  // ── STUDIATI ──
  function scrMostraStudiati() {
    const studiati = scrCaricaStudiati();
    let entries = Object.keys(studiati).map(id => {
      const q = scrQuesitoById(id);
      return q ? { id, q, ts: studiati[id].ultimoTs || '' } : null;
    }).filter(Boolean);
    if (!entries.length) {
      showModal('📖 Quesiti studiati', '<p class="scr-vuoto">Nessun quesito segnato come studiato.</p>', () => {}, 'Chiudi');
      const mc0 = document.getElementById('modalConfirm'); if (mc0) mc0.style.display = 'none';
      return;
    }
    const materie = [...new Set(entries.map(e => e.q.materia))].sort();
    const stato = { q: '', mat: '__tutte__', sort: 'recenti' };
    const html = `
      <div class="scr-vista">
        <p class="am-fonti-intro">${entries.length} quesiti <strong>studiati</strong> — clicca per aprirli.</p>
        ${_scrControlliVista(materie, [{ v: 'recenti', l: 'Più recenti' }, { v: 'materia', l: 'Materia A→Z' }])}
        <ul class="scr-vista-lista" id="scr-vista-list"></ul>
        <button class="btn btn-danger" id="scr-clear-studiati">🗑 Azzera tutti gli studiati</button>
      </div>`;
    showModal('📖 Quesiti studiati', html, () => {}, 'Chiudi');
    const mc = document.getElementById('modalConfirm'); if (mc) mc.style.display = 'none';
    function render() {
      let arr = entries.filter(e =>
        (stato.mat === '__tutte__' || e.q.materia === stato.mat) &&
        (!stato.q || (e.q.materia + ' ' + e.q.domanda).toLowerCase().includes(stato.q)));
      arr.sort(stato.sort === 'materia'
        ? (a, b) => a.q.materia.localeCompare(b.q.materia) || (b.ts).localeCompare(a.ts)
        : (a, b) => (b.ts).localeCompare(a.ts));
      const list = document.getElementById('scr-vista-list');
      list.innerHTML = arr.length ? arr.map(e =>
        `<li class="scr-vista-clic" data-scr-open-studio="${e.id}">
          <span class="scr-vista-mat">${_scrEsc(e.q.materia)}</span> — ${_scrEsc(_scrSnippet(e.q.domanda, 90))}
          <span class="scr-vista-go">apri ›</span>
        </li>`).join('') : '<li class="scr-vuoto">Nessun risultato.</li>';
      list.querySelectorAll('[data-scr-open-studio]').forEach(li =>
        li.addEventListener('click', () => { closeModal(); scrApriStudio(li.dataset.scrOpenStudio); }));
    }
    setTimeout(() => {
      document.getElementById('scr-vista-q').addEventListener('input', e => { stato.q = e.target.value.trim().toLowerCase(); render(); });
      document.getElementById('scr-vista-mat').addEventListener('change', e => { stato.mat = e.target.value; render(); });
      document.getElementById('scr-vista-sort').addEventListener('change', e => { stato.sort = e.target.value; render(); });
      document.getElementById('scr-clear-studiati').addEventListener('click', () => {
        closeModal();
        showModal('Azzerare tutti gli studiati?', 'Verrà rimosso lo stato "studiato" da tutti i quesiti. Gli elaborati e i voti restano. Irreversibile.',
          () => { scrAzzeraStudiati(); toast('Studiati azzerati'); renderScritto(); }, 'Sì, azzera');
      });
      render();
    }, 30);
  }

  // ── ELABORATI ──
  function scrMostraElaborati() {
    const diario = scrCaricaDiario();
    if (!diario.length) {
      showModal('✍️ Elaborati svolti', '<p class="scr-vuoto">Nessun elaborato svolto finora.</p>', () => {}, 'Chiudi');
      const mc0 = document.getElementById('modalConfirm'); if (mc0) mc0.style.display = 'none';
      return;
    }
    const entries = diario.map((t, i) => ({ t, i, q: scrQuesitoById(t.quesitoId), mat: (scrQuesitoById(t.quesitoId) || {}).materia || t.materia || '—' }));
    const materie = [...new Set(entries.map(e => e.mat))].sort();
    const stato = { q: '', mat: '__tutte__', sort: 'recenti' };
    const html = `
      <div class="scr-vista">
        <p class="am-fonti-intro">${entries.length} elaborati consegnati — clicca per rivedere la valutazione.</p>
        ${_scrControlliVista(materie, [{ v: 'recenti', l: 'Più recenti' }, { v: 'voto_desc', l: 'Voto ↓ (alto→basso)' }, { v: 'voto_asc', l: 'Voto ↑ (basso→alto)' }, { v: 'materia', l: 'Materia A→Z' }])}
        <ul class="scr-vista-lista" id="scr-vista-list"></ul>
        <button class="btn btn-danger" id="scr-clear-elaborati">🗑 Azzera tutti gli elaborati</button>
      </div>`;
    showModal('✍️ Elaborati svolti', html, () => {}, 'Chiudi');
    const mc = document.getElementById('modalConfirm'); if (mc) mc.style.display = 'none';
    function render() {
      let arr = entries.filter(e =>
        (stato.mat === '__tutte__' || e.mat === stato.mat) &&
        (!stato.q || (e.mat + ' ' + (e.q ? e.q.domanda : '')).toLowerCase().includes(stato.q)));
      const byTs = (a, b) => (b.t.ts || '').localeCompare(a.t.ts || '');
      arr.sort(
        stato.sort === 'voto_desc' ? (a, b) => (b.t.voto || 0) - (a.t.voto || 0) || byTs(a, b)
        : stato.sort === 'voto_asc' ? (a, b) => (a.t.voto || 0) - (b.t.voto || 0) || byTs(a, b)
        : stato.sort === 'materia' ? (a, b) => a.mat.localeCompare(b.mat) || byTs(a, b)
        : byTs);
      const list = document.getElementById('scr-vista-list');
      list.innerHTML = arr.length ? arr.map(e =>
        `<li class="scr-vista-clic" data-scr-open-elab="${e.i}">
          <span class="scr-vista-voto ${_scrVotoClasse(e.t.voto || 0)}">${e.t.voto != null ? e.t.voto + '/30' : '—'}</span>
          <span class="scr-vista-mat">${_scrEsc(e.mat)}</span>
          <span class="scr-vista-data">${_scrDataIT(e.t.ts)}</span>
          — ${_scrEsc(_scrSnippet(e.q ? e.q.domanda : '', 70))}
          <span class="scr-vista-go">apri ›</span>
        </li>`).join('') : '<li class="scr-vuoto">Nessun risultato.</li>';
      list.querySelectorAll('[data-scr-open-elab]').forEach(li =>
        li.addEventListener('click', () => {
          const t = diario[parseInt(li.dataset.scrOpenElab, 10)];
          if (!t) return;
          closeModal();
          const q = scrQuesitoById(t.quesitoId);
          scrMostraValutazione(q, t, t.testo || '');
        }));
    }
    setTimeout(() => {
      document.getElementById('scr-vista-q').addEventListener('input', e => { stato.q = e.target.value.trim().toLowerCase(); render(); });
      document.getElementById('scr-vista-mat').addEventListener('change', e => { stato.mat = e.target.value; render(); });
      document.getElementById('scr-vista-sort').addEventListener('change', e => { stato.sort = e.target.value; render(); });
      document.getElementById('scr-clear-elaborati').addEventListener('click', () => {
        closeModal();
        showModal('Azzerare tutti gli elaborati?', 'Verranno eliminati <strong>tutti</strong> gli elaborati e le valutazioni/voti (storico per-quesito incluso). Lo stato "studiato" resta. Irreversibile.',
          () => { scrAzzeraDiario(); toast('Elaborati azzerati'); renderScritto(); }, 'Sì, azzera');
      });
      render();
    }, 30);
  }
  window.scrMostraStudiati = scrMostraStudiati;
  window.scrMostraElaborati = scrMostraElaborati;
  window.scrAzzeraStudiati = scrAzzeraStudiati;
  window.scrAzzeraDiario = scrAzzeraDiario;
  function scrAggiungiTentativo(rec) { const d = scrCaricaDiario(); d.push(rec); scrSalvaDiario(d); }

  // Tentativi (storico) di un quesito, dal più recente
  function scrTentativiDi(id) {
    return scrCaricaDiario().filter(t => t.quesitoId === id)
      .sort((a, b) => (a.ts < b.ts ? 1 : -1));
  }
  function scrMigliorVoto(id) {
    const ts = scrTentativiDi(id); if (!ts.length) return null;
    return ts.reduce((m, t) => Math.max(m, t.voto || 0), 0);
  }
  function scrUltimoVoto(id) { const ts = scrTentativiDi(id); return ts.length ? (ts[0].voto || 0) : null; }
  function scrMediaVoto(id) {
    const ts = scrTentativiDi(id); if (!ts.length) return null;
    return Math.round(ts.reduce((s, t) => s + (t.voto || 0), 0) / ts.length);
  }

  function _scrEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function _scrVotoClasse(v) {
    if (v >= 27) return 'scr-v-ottimo';
    if (v >= 21) return 'scr-v-buono';
    if (v >= 18) return 'scr-v-suff';
    return 'scr-v-insuff';
  }
  function _scrDiffLabel(d) { return d >= 3 ? 'Difficile' : d === 2 ? 'Media' : 'Base'; }
  function _scrDataIT(iso) { try { return new Date(iso).toLocaleString('it-IT'); } catch (_) { return iso; } }
  function _scrStopTimer() { if (_SCR_EX && _SCR_EX._timer) clearInterval(_SCR_EX._timer); }

  // ═══════════════════════════════════════════════════════
  // VISTA 1 — MAPPA (materie → argomenti) con filtro materie a scomparsa
  // ═══════════════════════════════════════════════════════
  function renderScritto() {
    _scrStopTimer();
    _SCR_EX = null;
    _SCR_LISTA = null;
    const quesiti = scrGetQuesiti();
    const main = document.getElementById('main');

    if (!quesiti.length) {
      main.innerHTML = `
        <div class="page-header page-header-bg pagebg-mappa">
          <h1 class="page-title">✍️ Prova Scritta</h1>
          <div class="page-sub">Allenati a rispondere ai quesiti aperti con valutazione AI</div>
        </div>
        <div class="dash-warn"><span>⚠ Nessun quesito caricato (js/quesiti-data.js assente).</span></div>`;
      return;
    }

    const studiati = scrCaricaStudiati();
    const haKey = (typeof geminiHaKey === 'function') && geminiHaKey();

    const piano = _scrPiano();
    const matById = {}; piano.forEach(m => matById[m.materia_id] = m);
    const perMat = _scrRaggruppa();   // materiaId → {tot, args} (quesiti CARICATI)
    const caricatiMat = (mid) => (perMat[mid] ? perMat[mid].tot : 0);

    // Gruppi (macro-materie). Ogni gruppo: caricati / previsti = somma materie.
    const gruppi = _scrGruppi();
    const gById = {}; gruppi.forEach(g => gById[g.id] = g);
    const gCaricati = (g) => g.materie.reduce((s, mid) => s + caricatiMat(mid), 0);
    const gPrevisti = (g) => g.materie.reduce((s, mid) => s + (matById[mid] ? _scrPrevistiMateria(matById[mid]) : 0), 0);
    const gArgomenti = (g) => g.materie.reduce((s, mid) => s + ((matById[mid] && matById[mid].argomenti) ? matById[mid].argomenti.length : 0), 0);

    // Gruppi mostrati (filtro + ordine)
    let gruppiShown = gruppi.filter(g => !_SCR_MATVIS || _SCR_MATVIS.has(g.id));
    if (_SCR_ORD === 'az') gruppiShown = gruppiShown.slice().sort((a, b) => a.nome.localeCompare(b.nome));
    if (_SCR_OPEN_MAT && !gruppiShown.some(g => g.id === _SCR_OPEN_MAT)) _SCR_OPEN_MAT = null;

    const nStudiati = quesiti.filter(q => studiati[q.id]).length;
    const nElaborati = scrCaricaDiario().length;
    const nVis = _SCR_MATVIS ? gruppi.filter(g => _SCR_MATVIS.has(g.id)).length : gruppi.length;

    // Argomenti del GRUPPO aperto = unione argomenti di tutte le sue materie.
    let argHTML = '<div class="scr-map-vuoto">← Seleziona una materia per vedere gli argomenti</div>';
    let nArg = 0;
    const gAperto = _SCR_OPEN_MAT ? gById[_SCR_OPEN_MAT] : null;
    if (gAperto) {
      const rows = [];
      for (const mid of gAperto.materie) {
        const m = matById[mid]; if (!m) continue;
        for (const a of (m.argomenti || [])) {
          const caricati = (perMat[mid] && perMat[mid].args[a.argomento_id]) ? perMat[mid].args[a.argomento_id].length : 0;
          const previsti = a.n_quesiti || 0;
          const pronto = caricati > 0;
          const cerca = (a.argomento + ' ' + (a.legge || '') + ' ' + m.materia).toLowerCase();
          rows.push(`
            <div class="scr-map-node scr-map-leaf ${pronto ? '' : 'scr-map-attesa'}" data-scr-argnome="${_scrEsc(cerca)}">
              <div class="scr-map-node-nome">${_scrEsc(a.argomento)} <span class="scr-map-legge">(${_scrEsc(a.legge || '')})</span></div>
              <div class="scr-map-node-meta">${_scrEsc(m.materia)} · ${caricati}/${previsti} quesiti</div>
              ${pronto
                ? `<button class="btn btn-primary scr-map-apri" data-scr-apri-mat="${_scrEsc(mid)}" data-scr-apri-arg="${_scrEsc(a.argomento_id)}">📂 Apri quesiti</button>`
                : `<button class="btn btn-ghost scr-map-apri" disabled title="Nessun quesito ancora caricato">⏳ In arrivo</button>`}
            </div>`);
        }
      }
      nArg = rows.length;
      argHTML = rows.join('');
    }

    main.innerHTML = `
      <div class="page-header page-header-bg pagebg-mappa">
        <h1 class="page-title">✍️ Prova Scritta</h1>
        <div class="page-sub">Quesiti organizzati per macro-materia → argomento. Cerca e seleziona le materie, apri un argomento per studiare ed esercitarti con valutazione AI.</div>
      </div>

      ${!haKey ? `
        <div class="dash-warn scr-warn-key">
          <span>🔑 Valutazione AI non attiva — serve una API key Gemini (gratuita).</span>
          <button class="btn btn-primary" id="scr-vai-key">Configura ora</button>
        </div>` : ''}

      <div class="scr-riepilogo">
        <div class="scr-rk"><div class="scr-rk-v">${quesiti.length.toLocaleString('it-IT')}</div><div class="scr-rk-l">Quesiti caricati</div></div>
        <div class="scr-rk"><div class="scr-rk-v">${gruppi.length}</div><div class="scr-rk-l">Macro-materie</div></div>
        <button class="scr-rk scr-rk-btn" id="scr-rk-studiati"><div class="scr-rk-v">${nStudiati}</div><div class="scr-rk-l">Studiati <span class="scr-rk-go">vedi ›</span></div></button>
        <button class="scr-rk scr-rk-btn" id="scr-rk-elaborati"><div class="scr-rk-v">${nElaborati}</div><div class="scr-rk-l">Elaborati svolti <span class="scr-rk-go">vedi ›</span></div></button>
      </div>

      <!-- Filtro macro-materie: ricerca prominente + selezione (parti vuote) -->
      <div class="scr-filtri-wrap ${_SCR_FILTRI_EXP ? 'open' : ''}">
        <button class="scr-filtri-toggle" id="scr-filtri-toggle" aria-expanded="${_SCR_FILTRI_EXP}">
          <span>${_SCR_FILTRI_EXP ? '▾' : '▸'} Scegli le materie da studiare</span>
          <span class="scr-filtri-sum">${nVis}/${gruppi.length} selezionate</span>
        </button>
        ${_SCR_FILTRI_EXP ? `
          <div class="scr-filtri-body">
            <div class="scr-search-row">
              <span class="scr-search-ic">🔎</span>
              <input type="search" class="scr-search-big" id="scr-mat-search" placeholder="Cerca una macro-materia e cliccala per aggiungerla…  (es. «amm», «contab», «enti»)">
            </div>
            <div class="scr-filtri-controls">
              <select class="scr-sort" id="scr-mat-sort" title="Ordina">
                <option value="peso" ${_SCR_ORD === 'peso' ? 'selected' : ''}>Ordine consigliato</option>
                <option value="az" ${_SCR_ORD === 'az' ? 'selected' : ''}>A → Z</option>
              </select>
              <button class="scr-ctrl-btn" id="scr-mat-all">＋ Mostra tutto</button>
              <button class="scr-ctrl-btn" id="scr-mat-none">✕ Nascondi tutto</button>
            </div>
            <div class="scr-mat-grid" id="scr-mat-chips">
              ${gruppi.map(g => {
                const on = !_SCR_MATVIS || _SCR_MATVIS.has(g.id);
                return `<button class="scr-mat-chip ${on ? 'on' : ''}" data-scr-matf="${_scrEsc(g.id)}" data-scr-matnome="${_scrEsc(g.nome.toLowerCase())}">
                  <span class="scr-mat-chip-tick">${on ? '✓' : '＋'}</span>
                  <span class="scr-mat-chip-nome">${_scrEsc(g.nome)}</span>
                  <span class="scr-mat-chip-n">${gCaricati(g)}</span>
                </button>`;
              }).join('')}
            </div>
          </div>` : ''}
      </div>

      <!-- Mappa 2 colonne: Macro-materie | Argomenti -->
      <div class="scr-map">
        <div class="scr-map-col">
          <div class="scr-map-col-h">Materie <span class="scr-map-n">${gruppiShown.length}</span></div>
          <div class="scr-map-nodi">
            ${gruppiShown.length ? gruppiShown.map(g => {
              const car = gCaricati(g), prev = gPrevisti(g);
              return `
              <div class="scr-map-node ${_SCR_OPEN_MAT === g.id ? 'sel' : ''} ${car === 0 ? 'scr-map-attesa' : ''}" data-scr-mat-open="${_scrEsc(g.id)}">
                <div class="scr-map-node-nome">${_scrEsc(g.nome)}</div>
                <div class="scr-map-node-meta">${car}/${prev} quesiti · ${gArgomenti(g)} argomenti</div>
                <span class="scr-map-node-arrow">▸</span>
              </div>`; }).join('') : '<div class="scr-map-vuoto">👆 Cerca e seleziona le materie dal filtro qui sopra per popolare la mappa.</div>'}
          </div>
        </div>
        <div class="scr-map-col">
          <div class="scr-map-col-h">
            Argomenti ${_SCR_OPEN_MAT ? '<span class="scr-map-n">' + nArg + '</span>' : ''}
            ${gAperto ? `<input type="search" class="scr-arg-search" id="scr-arg-search" placeholder="🔎 filtra argomenti…">` : ''}
          </div>
          <div class="scr-map-nodi" id="scr-arg-nodi">${argHTML}</div>
        </div>
      </div>
    `;

    const bKey = document.getElementById('scr-vai-key');
    if (bKey) bKey.addEventListener('click', () => mostraModaleSettings());
    const bStud = document.getElementById('scr-rk-studiati');
    if (bStud) bStud.addEventListener('click', scrMostraStudiati);
    const bElab = document.getElementById('scr-rk-elaborati');
    if (bElab) bElab.addEventListener('click', scrMostraElaborati);

    document.getElementById('scr-filtri-toggle').addEventListener('click', () => {
      _SCR_FILTRI_EXP = !_SCR_FILTRI_EXP; renderScritto();
    });
    const ma = document.getElementById('scr-mat-all');
    if (ma) ma.addEventListener('click', () => { _SCR_MATVIS = null; renderScritto(); });
    const mn = document.getElementById('scr-mat-none');
    if (mn) mn.addEventListener('click', () => { _SCR_MATVIS = new Set(); _SCR_OPEN_MAT = null; renderScritto(); });
    const sort = document.getElementById('scr-mat-sort');
    if (sort) sort.addEventListener('change', () => { _SCR_ORD = sort.value; renderScritto(); });
    // Ricerca live macro-materie: filtra i chip senza re-render
    const search = document.getElementById('scr-mat-search');
    if (search) search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      document.querySelectorAll('#scr-mat-chips [data-scr-matf]').forEach(c => {
        c.style.display = (!q || (c.dataset.scrMatnome || '').includes(q)) ? '' : 'none';
      });
    });
    // Ricerca live ARGOMENTI nella colonna di destra (gruppo aperto)
    const argSearch = document.getElementById('scr-arg-search');
    if (argSearch) argSearch.addEventListener('input', () => {
      const q = argSearch.value.trim().toLowerCase();
      document.querySelectorAll('#scr-arg-nodi [data-scr-argnome]').forEach(c => {
        c.style.display = (!q || (c.dataset.scrArgnome || '').includes(q)) ? '' : 'none';
      });
    });
    document.querySelectorAll('[data-scr-matf]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.scrMatf;
      const allIds = gruppi.map(g => g.id);
      let vis = _SCR_MATVIS ? new Set(_SCR_MATVIS) : new Set(allIds);
      if (vis.has(id)) vis.delete(id); else vis.add(id);
      _SCR_MATVIS = (vis.size >= allIds.length) ? null : vis;
      if (_SCR_OPEN_MAT && _SCR_MATVIS && !_SCR_MATVIS.has(_SCR_OPEN_MAT)) _SCR_OPEN_MAT = null;
      renderScritto();
    }));
    document.querySelectorAll('[data-scr-mat-open]').forEach(n => n.addEventListener('click', () => {
      const g = n.dataset.scrMatOpen;
      _SCR_OPEN_MAT = (_SCR_OPEN_MAT === g) ? null : g;
      renderScritto();
    }));
    document.querySelectorAll('[data-scr-apri-mat]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      scrApriListaQuesiti(b.dataset.scrApriMat, b.dataset.scrApriArg);
    }));
  }

  // ═══════════════════════════════════════════════════════
  // VISTA 2 — LISTA QUESITI (di una materia+argomento) con filtri + card
  // ═══════════════════════════════════════════════════════
  function scrApriListaQuesiti(materiaId, argId) {
    _SCR_LISTA = { materiaId, argId };
    const main = document.getElementById('main');
    const studiati = scrCaricaStudiati();
    let quesiti = scrGetQuesiti().filter(q => q.materia_id === materiaId && q.argomento_id === argId);

    // Nomi dal piano + etichetta argomento (nome + legge)
    const piano = _scrPiano();
    const matObj = piano.find(m => m.materia_id === materiaId);
    const argObj = matObj ? (matObj.argomenti || []).find(a => a.argomento_id === argId) : null;
    const materiaNome = matObj ? matObj.materia : materiaId;
    const argLabel = _scrArgLabel(argObj);

    // Applica filtri lista
    quesiti = quesiti.filter(q => {
      if (_SCR_QFILTRO.diff !== 'tutte' && String(q.difficolta) !== String(_SCR_QFILTRO.diff)) return false;
      if (_SCR_QFILTRO.studiato === 'si' && !studiati[q.id]) return false;
      if (_SCR_QFILTRO.studiato === 'no' && studiati[q.id]) return false;
      return true;
    });

    const chipDiff = (val, label) =>
      `<button class="am-chip ${_SCR_QFILTRO.diff === val ? 'active' : ''}" data-scr-fdiff="${val}">${label}</button>`;
    const chipStud = (val, label) =>
      `<button class="am-chip ${_SCR_QFILTRO.studiato === val ? 'active' : ''}" data-scr-fstud="${val}">${label}</button>`;

    main.innerHTML = `
      <div class="page-header">
        <button class="btn btn-ghost" id="scr-back-map">← Torna alla mappa</button>
        <h1 class="page-title" style="margin-top:10px">📂 ${_scrEsc(materiaNome)}</h1>
        <div class="page-sub">Argomento: ${_scrEsc(argLabel)} · ${quesiti.length} quesit${quesiti.length === 1 ? 'o' : 'i'}</div>
      </div>

      <div class="am-filtri scr-lista-filtri">
        <div class="am-filtro-block">
          <div class="am-filtro-label">Difficoltà</div>
          <div class="am-chip-row">
            ${chipDiff('tutte', 'Tutte')} ${chipDiff('1', 'Base')} ${chipDiff('2', 'Media')} ${chipDiff('3', 'Difficile')}
          </div>
        </div>
        <div class="am-filtro-block">
          <div class="am-filtro-label">Studio</div>
          <div class="am-chip-row">
            ${chipStud('tutti', 'Tutti')} ${chipStud('si', '✓ Studiati')} ${chipStud('no', '✗ Da studiare')}
          </div>
        </div>
      </div>

      <div class="scr-qlista">
        ${quesiti.length ? quesiti.map(q => _scrCardQuesito(q, studiati)).join('')
          : '<div class="scr-vuoto">Nessun quesito con questi filtri.</div>'}
      </div>
    `;

    document.getElementById('scr-back-map').addEventListener('click', () => renderScritto());
    document.querySelectorAll('[data-scr-fdiff]').forEach(b => b.addEventListener('click', () => {
      _SCR_QFILTRO.diff = b.dataset.scrFdiff; scrApriListaQuesiti(materiaId, argId);
    }));
    document.querySelectorAll('[data-scr-fstud]').forEach(b => b.addEventListener('click', () => {
      _SCR_QFILTRO.studiato = b.dataset.scrFstud; scrApriListaQuesiti(materiaId, argId);
    }));
    _scrAttaccaListenerCard();
  }

  // Card quesito ridisegnata: header a elenco ordinato + azioni + storico
  function _scrCardQuesito(q, studiati) {
    const isStud = !!studiati[q.id];
    const tent = scrTentativiDi(q.id);
    const nTent = tent.length;
    const ultimo = nTent ? (tent[0].voto || 0) : null;
    const media = scrMediaVoto(q.id);

    const rigaInfo = (label, valHtml) =>
      `<div class="scr-qinfo-row"><span class="scr-qinfo-k">${label}</span><span class="scr-qinfo-v">${valHtml}</span></div>`;

    return `
      <div class="scr-qcard" data-scr-qid="${q.id}">
        <div class="scr-qinfo">
          ${rigaInfo('Argomento', `${_scrEsc(q.materia)} <span class="scr-qinfo-sub">(Legge: ${_scrEsc(q.normativa)})</span>`)}
          ${rigaInfo('Difficoltà', `<span class="scr-tag scr-diff-${q.difficolta}">${_scrDiffLabel(q.difficolta)}</span>`)}
          ${rigaInfo('Studiato', isStud ? '<span class="scr-si">SÌ</span>' : '<span class="scr-no">NO</span>')}
          ${rigaInfo('Voto', ultimo != null ? `<span class="${_scrVotoClasse(ultimo)}">${ultimo}/30</span> <span class="scr-qinfo-sub">(ultimo)</span>` : '—')}
          ${rigaInfo('Media voto', media != null ? `<span class="${_scrVotoClasse(media)}">${media}/30</span>` : '—')}
          ${rigaInfo('Affrontata', `${nTent} volt${nTent === 1 ? 'a' : 'e'}`)}
        </div>

        <div class="scr-qcard-dom">${_scrEsc(q.domanda)}</div>

        <div class="scr-qcard-actions">
          <button class="btn btn-ghost" data-scr-studia="${q.id}">📖 Studia</button>
          <button class="btn btn-primary" data-scr-eserc="${q.id}">✍️ Esercitati</button>
          ${nTent ? `<button class="btn btn-ghost scr-storico-toggle" data-scr-storico="${q.id}">🕘 Storico (${nTent})</button>` : ''}
        </div>

        <div class="scr-storico" id="scr-storico-${q.id}" style="display:none"></div>
      </div>`;
  }

  function _scrAttaccaListenerCard() {
    document.querySelectorAll('[data-scr-studia]').forEach(b =>
      b.addEventListener('click', () => scrApriStudio(b.dataset.scrStudia)));
    document.querySelectorAll('[data-scr-eserc]').forEach(b =>
      b.addEventListener('click', () => scrApriEsercizio(b.dataset.scrEserc)));
    document.querySelectorAll('[data-scr-storico]').forEach(b =>
      b.addEventListener('click', () => _scrToggleStorico(b.dataset.scrStorico)));
  }

  // ─── Storico per-quesito: elaborati consegnati + valutazioni ───
  function _scrToggleStorico(id) {
    const box = document.getElementById('scr-storico-' + id);
    if (!box) return;
    if (box.style.display !== 'none') { box.style.display = 'none'; box.innerHTML = ''; return; }
    const q = scrQuesitoById(id);
    const tent = scrTentativiDi(id);
    box.innerHTML = `
      <div class="scr-storico-h">Storico elaborati & valutazioni</div>
      ${tent.map((t, i) => `
        <details class="scr-storico-item">
          <summary>
            <span class="scr-storico-n">#${tent.length - i}</span>
            <span class="scr-storico-data">${_scrDataIT(t.ts)}</span>
            <span class="scr-storico-voto ${_scrVotoClasse(t.voto || 0)}">${t.voto != null ? t.voto + '/30' : '—'}</span>
            ${t.giudizioSintetico ? `<span class="scr-storico-giud">${_scrEsc(t.giudizioSintetico)}</span>` : ''}
          </summary>
          <div class="scr-storico-body">
            ${_scrValutazioneHTML(q, t, t.testo || '', { compact: true })}
          </div>
        </details>`).join('')}
    `;
    box.style.display = '';
  }

  // ═══════════════════════════════════════════════════════
  // STUDIO
  // ═══════════════════════════════════════════════════════
  function scrApriStudio(id) {
    const q = scrQuesitoById(id);
    if (!q) return;
    const main = document.getElementById('main');
    main.innerHTML = `
      <div class="page-header">
        <button class="btn btn-ghost" id="scr-back">← Torna ai quesiti</button>
        <h1 class="page-title" style="margin-top:10px">📖 Studio del quesito</h1>
        <div class="page-sub">${_scrEsc(q.materia)} · Legge: ${_scrEsc(q.normativa)}</div>
      </div>
      <div class="scr-studio">
        <div class="scr-blocco scr-blocco-dom"><div class="scr-blocco-h">Traccia</div><div class="scr-dom-testo">${_scrEsc(q.domanda)}</div></div>
        <div class="scr-blocco scr-blocco-punti"><div class="scr-blocco-h">Punti chiave da trattare</div><ul class="scr-punti">${(q.puntiChiave || []).map(p => `<li>${_scrEsc(p)}</li>`).join('')}</ul></div>
        <div class="scr-blocco scr-blocco-perfetta"><div class="scr-blocco-h">Risposta di riferimento <span class="scr-h-sub">(livello 30 e lode)</span></div><div class="scr-perfetta-testo">${_scrEsc(q.rispostaPerfetta)}</div></div>
        <div class="scr-studio-actions">
          ${scrEStudiato(id)
            ? `<button class="btn scr-btn-unmark" id="scr-studiato">✗ Togli "studiato"</button>`
            : `<button class="btn" id="scr-studiato">✓ Ho studiato</button>`}
          <button class="btn btn-primary" id="scr-vai-eserc">✍️ Esercitati ora</button>
        </div>
      </div>`;
    document.getElementById('scr-back').addEventListener('click', () => _scrTornaContesto());
    document.getElementById('scr-studiato').addEventListener('click', () => {
      if (scrEStudiato(id)) { scrRimuoviStudiato(id); toast('Rimosso da "studiati"'); }
      else { scrMarcaStudiato(id); toast('Quesito segnato come studiato ✓'); }
      scrApriStudio(id);   // re-render per aggiornare il tasto
    });
    document.getElementById('scr-vai-eserc').addEventListener('click', () => { scrMarcaStudiato(id); scrApriEsercizio(id); });
  }

  // Torna alla lista del contesto se presente, altrimenti alla mappa
  function _scrTornaContesto() {
    if (_SCR_LISTA) scrApriListaQuesiti(_SCR_LISTA.materiaId, _SCR_LISTA.argId);
    else renderScritto();
  }

  // ═══════════════════════════════════════════════════════
  // ESERCITAZIONE
  // ═══════════════════════════════════════════════════════
  function scrApriEsercizio(id) {
    const q = scrQuesitoById(id);
    if (!q) return;
    _SCR_EX = { quesito: q, startTs: Date.now() };
    const haKey = (typeof geminiHaKey === 'function') && geminiHaKey();
    const main = document.getElementById('main');
    main.innerHTML = `
      <div class="page-header">
        <button class="btn btn-ghost" id="scr-back">← Torna ai quesiti</button>
        <h1 class="page-title" style="margin-top:10px">✍️ Esercitazione</h1>
        <div class="page-sub">${_scrEsc(q.materia)} · Legge: ${_scrEsc(q.normativa)}</div>
      </div>
      <div class="scr-eserc">
        <div class="scr-blocco scr-blocco-dom"><div class="scr-blocco-h">Traccia</div><div class="scr-dom-testo">${_scrEsc(q.domanda)}</div></div>
        ${!haKey ? `<div class="dash-warn scr-warn-key"><span>🔑 Configura la API key Gemini per la valutazione.</span><button class="btn btn-primary" id="scr-vai-key2">Configura</button></div>` : ''}
        <div class="scr-blocco">
          <div class="scr-blocco-h">Il tuo elaborato</div>
          <textarea id="scr-testo" class="scr-textarea" placeholder="Scrivi qui la tua risposta: inquadramento normativo, ratio, istituti e articoli, raccordi, esempio operativo…"></textarea>
          <div class="scr-eserc-bar"><span class="scr-counter" id="scr-counter">0 parole · 0 caratteri</span><span class="scr-timer" id="scr-timer">⏱ 00:00</span></div>
        </div>
        <div class="scr-eserc-actions">
          <button class="btn btn-ghost" id="scr-vedi-perfetta">📖 Studia il riferimento</button>
          <button class="btn btn-primary" id="scr-valuta" ${!haKey ? 'disabled' : ''}>🤖 Valuta con AI</button>
        </div>
      </div>`;
    document.getElementById('scr-back').addEventListener('click', () => { _SCR_EX = null; _scrTornaContesto(); });
    const bk2 = document.getElementById('scr-vai-key2');
    if (bk2) bk2.addEventListener('click', () => mostraModaleSettings());
    document.getElementById('scr-vedi-perfetta').addEventListener('click', () => scrApriStudio(id));

    const ta = document.getElementById('scr-testo');
    const counter = document.getElementById('scr-counter');
    ta.addEventListener('input', () => {
      const txt = ta.value.trim();
      counter.textContent = `${txt ? txt.split(/\s+/).length : 0} parole · ${ta.value.length} caratteri`;
    });
    ta.focus();
    const timerEl = document.getElementById('scr-timer');
    if (_SCR_EX._timer) clearInterval(_SCR_EX._timer);
    _SCR_EX._timer = setInterval(() => {
      if (!_SCR_EX) return;
      const sec = Math.floor((Date.now() - _SCR_EX.startTs) / 1000);
      if (timerEl) timerEl.textContent = `⏱ ${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    }, 1000);
    document.getElementById('scr-valuta').addEventListener('click', () => scrInviaValutazione(id));
  }

  async function scrInviaValutazione(id) {
    const q = scrQuesitoById(id);
    const ta = document.getElementById('scr-testo');
    if (!q || !ta) return;
    const testo = ta.value.trim();
    if (testo.length < 20) { toast('Scrivi un elaborato più completo prima di valutare.', true); return; }
    const btn = document.getElementById('scr-valuta');
    const durataSec = _SCR_EX ? Math.floor((Date.now() - _SCR_EX.startTs) / 1000) : 0;
    btn.disabled = true; btn.innerHTML = '<span class="scr-spinner"></span> Valutazione in corso…';
    try {
      const val = await geminiValuta(q, testo);
      if (_SCR_EX && _SCR_EX._timer) clearInterval(_SCR_EX._timer);
      // Salva record COMPLETO (elaborato + valutazione) nello storico per-quesito
      scrAggiungiTentativo({
        quesitoId: id,
        ts: new Date().toISOString(),
        materia: q.materia,
        normativa: q.normativa,
        voto: val.voto,
        perCriterio: val.perCriterio,
        giudizioSintetico: val.giudizioSintetico,
        concettiPresenti: val.concettiPresenti,
        concettiMancanti: val.concettiMancanti,
        puntiForza: val.puntiForza,
        puntiDebolezza: val.puntiDebolezza,
        feedback: val.feedback,
        testo,
        durataSec,
        nParole: testo.split(/\s+/).length,
      });
      scrMostraValutazione(q, val, testo);
    } catch (e) {
      btn.disabled = false; btn.innerHTML = '🤖 Valuta con AI';
      toast(e.message || 'Errore nella valutazione.', true);
    }
  }

  // HTML valutazione, riusato live e nello storico (opts.compact riduce ingombro)
  function _scrValutazioneHTML(q, val, testo, opts) {
    opts = opts || {};
    const vClass = _scrVotoClasse(val.voto || 0);
    return `
      <div class="scr-valut ${opts.compact ? 'scr-valut-compact' : ''}">
        ${opts.compact ? '' : `
        <div class="scr-voto-box ${vClass}">
          <div class="scr-voto-num">${val.voto}<span class="scr-voto-den">/30</span></div>
          <div class="scr-voto-giudizio">${_scrEsc(val.giudizioSintetico || '')}</div>
        </div>`}

        <div class="scr-blocco">
          <div class="scr-blocco-h">Punteggio per criterio</div>
          <div class="scr-criteri">
            ${SCR_CRITERI.map(c => {
              const v = (val.perCriterio && val.perCriterio[c.k]) || 0;
              return `<div class="scr-crit-row"><div class="scr-crit-label">${c.label}</div><div class="scr-crit-bar"><div class="scr-crit-fill" style="width:${(v / 6 * 100).toFixed(0)}%"></div></div><div class="scr-crit-val">${v}/6</div></div>`;
            }).join('')}
          </div>
        </div>

        <div class="scr-due-col">
          <div class="scr-blocco scr-col-ok"><div class="scr-blocco-h">✓ Concetti trattati</div>${(val.concettiPresenti && val.concettiPresenti.length) ? `<ul class="scr-lista-concetti">${val.concettiPresenti.map(c => `<li>${_scrEsc(c)}</li>`).join('')}</ul>` : '<div class="scr-vuoto">—</div>'}</div>
          <div class="scr-blocco scr-col-ko"><div class="scr-blocco-h">✗ Concetti mancanti</div>${(val.concettiMancanti && val.concettiMancanti.length) ? `<ul class="scr-lista-concetti">${val.concettiMancanti.map(c => `<li>${_scrEsc(c)}</li>`).join('')}</ul>` : '<div class="scr-vuoto">Nessuno: ottima copertura!</div>'}</div>
        </div>

        ${(val.puntiForza && val.puntiForza.length) ? `<div class="scr-blocco"><div class="scr-blocco-h">Punti di forza</div><ul class="scr-lista-concetti">${val.puntiForza.map(c => `<li>${_scrEsc(c)}</li>`).join('')}</ul></div>` : ''}
        ${(val.puntiDebolezza && val.puntiDebolezza.length) ? `<div class="scr-blocco"><div class="scr-blocco-h">Aree di miglioramento</div><ul class="scr-lista-concetti">${val.puntiDebolezza.map(c => `<li>${_scrEsc(c)}</li>`).join('')}</ul></div>` : ''}

        <div class="scr-blocco scr-blocco-feedback"><div class="scr-blocco-h">Feedback del valutatore</div><div class="scr-feedback">${_scrEsc(val.feedback || '')}</div></div>

        <details class="scr-blocco scr-dettagli">
          <summary class="scr-blocco-h">Confronta: il tuo elaborato e il riferimento</summary>
          <div class="scr-confronto">
            <div class="scr-conf-col"><div class="scr-conf-h">Il tuo elaborato</div><div class="scr-conf-testo">${_scrEsc(testo)}</div></div>
            <div class="scr-conf-col"><div class="scr-conf-h">Risposta di riferimento</div><div class="scr-conf-testo">${_scrEsc(q ? q.rispostaPerfetta : '')}</div></div>
          </div>
        </details>
      </div>`;
  }

  function scrMostraValutazione(q, val, testo) {
    const main = document.getElementById('main');
    main.innerHTML = `
      <div class="page-header">
        <button class="btn btn-ghost" id="scr-back">← Torna ai quesiti</button>
        <h1 class="page-title" style="margin-top:10px">🤖 Valutazione</h1>
        <div class="page-sub">${_scrEsc(q.materia)} · Legge: ${_scrEsc(q.normativa)}</div>
      </div>
      ${_scrValutazioneHTML(q, val, testo, {})}
      <div class="scr-eserc-actions" style="max-width:900px">
        <button class="btn btn-ghost" id="scr-back2">← Quesiti</button>
        <button class="btn btn-primary" id="scr-riprova">🔁 Riprova questo quesito</button>
      </div>`;
    document.getElementById('scr-back').addEventListener('click', () => { _SCR_EX = null; _scrTornaContesto(); });
    document.getElementById('scr-back2').addEventListener('click', () => { _SCR_EX = null; _scrTornaContesto(); });
    document.getElementById('scr-riprova').addEventListener('click', () => scrApriEsercizio(q.id));
  }

  // Esposizione globale
  window.renderScritto       = renderScritto;
  window.renderScrittoStats  = renderScritto;   // compat route: rimanda alla mappa
  window.scrApriStudio       = scrApriStudio;
  window.scrApriEsercizio    = scrApriEsercizio;
  window.scrApriListaQuesiti = scrApriListaQuesiti;
