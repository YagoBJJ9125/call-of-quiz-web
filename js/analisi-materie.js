  // ═══════════════════════════════════════════════════════
  // ANALISI QUIZ MATERIE (Step D)
  // Vista capillare materia → argomento → legge → sotto-argomento → articolo
  // con conteggi quiz affrontati, corretti, errati, % copertura e precisione
  // per ciascun livello. Serve a capire dove si è forti e dove non si è studiato.
  // ═══════════════════════════════════════════════════════

  // Analisi Quiz Materie = vista GLOBALE: somma dei progressi di TUTTI i save.
  //   periodo  : '7' | '30' | 'tutti'
  //   origine  : 'tutti' | 'ranked' | 'libero' | 'carriera'
  //   materieVisibili : null = tutte; Set<materia_id> = solo queste mostrate (declutter)
  //   filtriExp: blocchi filtri espansi/collassati
  let _ANALISI_FILTRI = { periodo: 'tutti', origine: 'tutti', materieVisibili: null, filtriExp: false, ordineMaterie: 'peso' };

  // ─── Diario GLOBALE: unione dei diari di TUTTI i save ─────────────────
  // Ogni save tiene il proprio diario in cm:save:{id}:carriera:diario. L'Analisi
  // deve riflettere la somma di tutti — qualunque save vi confluisce. Ritorna
  // un array piatto: { quiz_id, corretta, ts, data, mode }. Esclude mode 'sync'
  // (propagazioni RP cross-save, non risposte reali).
  function _amDiarioGlobaleMerged() {
    const out = [];
    const _push = (diario) => {
      if (!diario) return;
      for (const [data, day] of Object.entries(diario)) {
        if (!day || !day.risposte) continue;
        for (const r of day.risposte) {
          if (!r.quiz_id) continue;
          if (r.mode === 'sync') continue;
          out.push({
            quiz_id: r.quiz_id,
            corretta: !!r.corretta,
            ts: r.ts || 0,
            data,
            mode: r.mode || 'carriera',
          });
        }
      }
    };
    if (window.SavesCore && typeof SavesCore.getListaSaves === 'function') {
      for (const sv of SavesCore.getListaSaves()) {
        let diario = null;
        try { diario = SavesCore.leggiSave(sv.id, 'cm:carriera:diario'); } catch (_) {}
        _push(diario);
      }
    } else {
      try { _push(carCaricaDiario()); } catch (_) {}
    }
    return out;
  }

  // Registry popolato a ogni render dell'albero. Usato dal bottone "▶ Avvia"
  // sui nodi per recuperare velocemente l'insieme di quiz_id ammessi e
  // lanciare un round Ranked ristretto a quel nodo.
  //   _AM_NODE_QUIZIDS[`${livello}|${id}`] = Set<quiz_id>
  //   _AM_NODE_NOMI[`${livello}|${id}`]    = stringa nome del nodo
  let _AM_NODE_QUIZIDS = Object.create(null);
  let _AM_NODE_NOMI    = Object.create(null);

  // ─── API pubblica: imposta scope e naviga (chiamato da Ranked) ────────
  // Compat: vecchia API → ora porta sempre all'Analisi Globale
  function vaiAnalisiConScope() {
    if (typeof navigaA === 'function') {
      navigaA('mappa');
      if (typeof aggiornaNavSidebar === 'function') aggiornaNavSidebar('mappa');
    } else {
      renderAnalisiGlobale();
    }
  }
  window.vaiAnalisiConScope = vaiAnalisiConScope;

  // ─── Scope dell'analisi: globale o piano di un save specifico ────────
  // Ritorna { type, materieSet, label, sv? }:
  //   - type='globale'  → materieSet = null (= tutte le materie del bundle)
  //   - type='save'     → materieSet = Set materie del piano del save scelto,
  //                       e applica anche argomentiEsclusi se presente
  // Due viste con la STESSA struttura ad albero:
  //   • _AM_SCOPE.type='globale' → Analisi Globale (somma di tutti i save)
  //   • _AM_SCOPE.type='save'    → Mappatura Materie Ranked (solo materie+diario
  //                                 del save indicato). Entry point: pulsante in
  //                                 Ranked / Progressi Ranked.
  let _AM_SCOPE = { type: 'globale', saveId: null };

  function _amGetScope() {
    if (_AM_SCOPE.type !== 'save' || !window.SavesCore) {
      return { type: 'globale', materieSet: null, label: 'Globale', sv: null, esclArg: null };
    }
    const sv = SavesCore.getListaSaves().find(s => s.id === _AM_SCOPE.saveId);
    if (!sv) {
      _AM_SCOPE = { type: 'globale', saveId: null };
      return { type: 'globale', materieSet: null, label: 'Globale', sv: null, esclArg: null };
    }
    const ids = (sv.piano && sv.piano.materieIds) || [];
    const esclArg = {};
    const esclRaw = (sv.piano && sv.piano.argomentiEsclusi) || {};
    Object.keys(esclRaw).forEach(mid => {
      if (Array.isArray(esclRaw[mid])) esclArg[mid] = new Set(esclRaw[mid]);
    });
    return { type: 'save', sv, materieSet: new Set(ids), esclArg, label: sv.nome };
  }

  // Diario di UN SOLO save (per la mappatura ranked)
  function _amDiarioDiSave(saveId) {
    const out = [];
    let diario = null;
    try {
      diario = (window.SavesCore && SavesCore.leggiSave)
        ? SavesCore.leggiSave(saveId, 'cm:carriera:diario')
        : carCaricaDiario();
    } catch (_) {}
    if (!diario) return out;
    // Un SAVE = mondo Ranked: conto SOLO le risposte mode='ranked'.
    // (Eventuale Libero finito nei diari per pollution storica è ignorato.)
    for (const [data, day] of Object.entries(diario)) {
      if (!day || !day.risposte) continue;
      for (const r of day.risposte) {
        if (!r.quiz_id || r.mode !== 'ranked') continue;
        out.push({ quiz_id: r.quiz_id, corretta: !!r.corretta, ts: r.ts || 0, data, mode: 'ranked' });
      }
    }
    return out;
  }

  // ─── Fonti dei quiz affrontati: breakdown per save × modalità ──────────
  function _amNomeModalita(mode) {
    return mode === 'ranked' ? '🏆 Ranked'
         : mode === 'libero' ? '🎲 Libero'
         : '🎯 Carriera';
  }
  function _amCalcolaFonti() {
    const nomeSave = {};
    if (window.SavesCore && SavesCore.getListaSaves) {
      for (const s of SavesCore.getListaSaves()) nomeSave[s.id] = s.nome;
    }
    const gruppi = new Map();   // chiave → { etichetta, mode, set, n }
    const unionAll = new Set();
    const countById = new Map(); // quiz_id → numero risposte (per la riconciliazione)
    const _add = (chiave, etichetta, mode, quizId) => {
      let g = gruppi.get(chiave);
      if (!g) { g = { etichetta, mode, set: new Set(), n: 0 }; gruppi.set(chiave, g); }
      g.set.add(quizId); g.n++;
      unionAll.add(quizId);
      countById.set(quizId, (countById.get(quizId) || 0) + 1);
    };

    if (_AM_SCOPE.type === 'save') {
      // Vista save = mondo Ranked: SOLO le risposte mode='ranked' di quel save.
      let diario = null;
      try { diario = SavesCore.leggiSave(_AM_SCOPE.saveId, 'cm:carriera:diario'); } catch (_) {}
      const nome = nomeSave[_AM_SCOPE.saveId] || 'questo save';
      if (diario) for (const day of Object.values(diario)) {
        if (!day || !day.risposte) continue;
        for (const r of day.risposte) {
          if (!r.quiz_id || r.mode !== 'ranked') continue;
          _add('rk', nome, 'ranked', r.quiz_id);
        }
      }
    } else {
      // Vista globale: ricostruisco dai DIARI di TUTTI i save (che hanno il
      // campo mode anche per lo storico): Ranked attribuito al save, Libero in
      // un unico bucket globale. Poi aggiungo gli "orfani" del progress (risposte
      // che non risultano in alcun diario: sessioni vecchie / save eliminati).
      const saves = (window.SavesCore && SavesCore.getListaSaves) ? SavesCore.getListaSaves() : [];
      for (const sv of saves) {
        let diario = null;
        try { diario = SavesCore.leggiSave(sv.id, 'cm:carriera:diario'); } catch (_) {}
        if (!diario) continue;
        for (const day of Object.values(diario)) {
          if (!day || !day.risposte) continue;
          for (const r of day.risposte) {
            if (!r.quiz_id || r.mode === 'sync') continue;
            if (r.mode === 'libero') {
              _add('libero', 'Allenamento Libero', 'libero', r.quiz_id);
            } else if (r.mode === 'ranked') {
              _add('rk|' + sv.id, sv.nome, 'ranked', r.quiz_id);
            } else {
              _add('carriera', 'Carriera (legacy)', 'carriera', r.quiz_id);
            }
          }
        }
      }
      // Orfani da progress (quiz affrontati che non compaiono in nessun diario)
      let progress = null;
      try { progress = caricaProgress(); } catch (_) {}
      const rs = (progress && Array.isArray(progress.risposte)) ? progress.risposte : [];
      for (const r of rs) {
        if (!r.quiz_id) continue;
        if (unionAll.has(r.quiz_id)) continue;   // già attribuito da un diario
        _add('storico', 'Storico (sessioni precedenti / save eliminati)', null, r.quiz_id);
      }
    }
    const righe = [...gruppi.values()]
      .map(g => ({ etichetta: g.etichetta, mode: g.mode, unici: g.set.size, risposte: g.n }))
      .sort((a, b) => b.risposte - a.risposte);

    // Riconciliazione (solo vista save): quanti quiz affrontati sono DENTRO il
    // piano attuale (= numero della barra di avanzamento) e quanti FUORI
    // (materie/argomenti esclusi o quiz non più in banca dati).
    let scopeInfo = null;
    if (_AM_SCOPE.type === 'save') {
      const scopeSet = _amScopeQuizSet();
      let inU = 0, inR = 0, outU = 0, outR = 0;
      countById.forEach((c, id) => {
        if (scopeSet.has(id)) { inU++; inR += c; } else { outU++; outR += c; }
      });
      scopeInfo = { inUnici: inU, inRisposte: inR, outUnici: outU, outRisposte: outR };
    }
    return { righe, unionUnici: unionAll.size, scopeInfo };
  }

  // Set dei quiz_id "validi" per lo scope corrente (piano del save + quiz
  // ancora presenti in banca dati). Stessa logica usata dalla barra di
  // avanzamento (_aggregaStats su quizScopeIds).
  function _amScopeQuizSet() {
    const set = new Set();
    if (!STATE.pacchetto) return set;
    const scope = (typeof _amGetScope === 'function') ? _amGetScope() : _AM_SCOPE;
    if (!scope || scope.type === 'globale') {
      for (const m of STATE.pacchetto.manifest.moduli) {
        const banca = STATE.pacchetto.banche[m.materia_id];
        if (!banca) continue;
        for (const q of (banca.categorizzati || banca.quiz || [])) set.add(quizId(q));
      }
      return set;
    }
    const materieSet = scope.materieSet || new Set();
    const esclArg = scope.esclArg || {};
    for (const mid of materieSet) {
      const banca = STATE.pacchetto.banche[mid];
      if (!banca) continue;
      const esc = esclArg[mid];
      for (const q of (banca.categorizzati || banca.quiz || [])) {
        const argId = q.categorizzazione && q.categorizzazione.argomento_id;
        if (argId && esc && esc.has(argId)) continue;
        set.add(quizId(q));
      }
    }
    return set;
  }

  function _amMostraFontiAffrontati() {
    const f = _amCalcolaFonti();
    const isSave = (_AM_SCOPE.type === 'save');
    const titolo = isSave ? 'Fonti — questo save' : 'Fonti dei quiz affrontati';
    let html = `
      <div class="am-fonti">
        <p class="am-fonti-intro">Da dove arrivano i quiz affrontati, per <strong>sorgente</strong> e <strong>modalità</strong>. <em>Unici</em> = quiz distinti; <em>risposte</em> = totale con i doppioni. (Un save = solo Ranked; il Libero è globale e non appartiene ad alcun save.)</p>
        <table class="am-fonti-tab">
          <thead><tr><th>Sorgente</th><th>Modalità</th><th>Unici</th><th>Risposte</th></tr></thead>
          <tbody>`;
    if (f.righe.length === 0) {
      html += `<tr><td colspan="4" class="am-fonti-vuoto">Nessuna risposta tracciata.</td></tr>`;
    } else {
      for (const r of f.righe) {
        html += `<tr>
          <td>${escapeHTML(r.etichetta)}</td>
          <td>${r.mode ? _amNomeModalita(r.mode) : '— storico'}</td>
          <td><strong>${r.unici.toLocaleString('it-IT')}</strong></td>
          <td>${r.risposte.toLocaleString('it-IT')} <em class="am-dup-note">(con doppioni)</em></td>
        </tr>`;
      }
    }
    html += `</tbody></table>`;
    html += `<div class="am-fonti-tot">Totale quiz unici affrontati: <strong>${f.unionUnici.toLocaleString('it-IT')}</strong></div>`;
    if (isSave && f.scopeInfo) {
      const si = f.scopeInfo;
      html += `<div class="am-fonti-scope" style="margin-top:12px;padding:12px 14px;border:1px solid var(--border-medium);border-radius:8px;font-size:13px;line-height:1.55;color:var(--text-secondary)">
        <p>📊 <strong>Nel piano attuale</strong> (materie/argomenti del save, quiz ancora in banca dati): <strong>${si.inUnici.toLocaleString('it-IT')}</strong> unici · ${si.inRisposte.toLocaleString('it-IT')} risposte — è il valore della barra di avanzamento.</p>
        ${si.outUnici > 0 ? `<p>📦 <strong>Fuori dal piano o non più in banca dati</strong>: ${si.outUnici.toLocaleString('it-IT')} unici · ${si.outRisposte.toLocaleString('it-IT')} risposte. Sono quiz risposti in materie/argomenti ora esclusi dal piano, oppure quiz cambiati/rimossi negli aggiornamenti delle banche. Restano nello storico ma non contano nell'avanzamento del piano.</p>` : ''}
      </div>`;
    }
    html += `</div>`;
    if (typeof showModal === 'function') {
      showModal('🔎 ' + titolo, html, () => {}, 'Chiudi');
      const mc = document.getElementById('modalConfirm');
      if (mc) mc.style.display = 'none';
    }
  }

  // ─── Entry point pubblici ───
  function renderAnalisiGlobale() {
    _AM_SCOPE = { type: 'globale', saveId: null };
    _AM_TREE_PATH = [];
    _amRenderTree();
  }
  // Mappatura materie del save (dedicata alla Ranked)
  function renderMappaturaRanked(saveId) {
    const sid = saveId || (window.SavesCore ? SavesCore.getSaveAttivoId() : null);
    if (!sid) { if (typeof toast === 'function') toast('Nessun save attivo', true); return; }
    _AM_SCOPE = { type: 'save', saveId: sid };
    _AM_TREE_PATH = [];
    if (typeof STATE !== 'undefined') STATE.pageCorrente = 'mappa-ranked';
    _amRenderTree();
    if (typeof applicaAspetto === 'function') applicaAspetto();
  }
  window.renderMappaturaRanked = renderMappaturaRanked;

  // Conta quiz appartenenti allo scope corrente, applicando esclusioni argomento
  function _amCalcolaCompletamentoScope(catalogo) {
    const scope = _amGetScope();
    const padron = (typeof carCaricaPadron === 'function') ? (carCaricaPadron() || {}) : {};

    // GLOBALE: conta tutti i quiz unici del catalogo
    if (scope.type === 'globale') {
      const tutti = new Set();
      for (const set of Object.values(catalogo.quizPerMateria)) {
        for (const id of set) tutti.add(id);
      }
      let nPadron = 0;
      for (const id of tutti) {
        const p = padron[id];
        if (èPadroneggiato(p)) nPadron++;
      }
      return {
        scope, tot: tutti.size, padron: nPadron,
        perc: tutti.size > 0 ? nPadron / tutti.size : 0,
        materieN: Object.keys(catalogo.quizPerMateria).length,
      };
    }

    // SAVE: conta i quiz UNICI del piano (dedup per quiz_id).
    // Importante: usa un Set di quiz_id per evitare di contare duplicati
    // (stesso quiz_id presente più volte nelle banche dati).
    const idsScope = new Set();
    for (const mid of scope.materieSet) {
      const banca = STATE.pacchetto.banche[mid];
      if (!banca) continue;
      const arr = banca.categorizzati || banca.quiz || [];
      const esc = scope.esclArg[mid];
      for (const q of arr) {
        const argId = q.categorizzazione && q.categorizzazione.argomento_id;
        if (argId && esc && esc.has(argId)) continue;
        idsScope.add(quizId(q));
      }
    }
    let nPadron = 0;
    for (const id of idsScope) {
      const p = padron[id];
      if (èPadroneggiato(p)) nPadron++;
    }
    return {
      scope,
      tot: idsScope.size,
      padron: nPadron,
      perc: idsScope.size > 0 ? nPadron / idsScope.size : 0,
      materieN: scope.materieSet.size,
      idsScope, // utilizzabile dal renderer per filtrare la "Visione d'insieme"
    };
  }
  let _ANALISI_ESP_LEGGI    = new Set();   // chiavi "argId|leggeIdx" per espansione leggi

  // ─── Previsione di copertura entro la data della prova ─────────────────
  //   Stima quanti quiz farai entro la prova in base al ritmo medio degli
  //   ultimi 7 giorni e al numero di giorni rimanenti. Ritorna numeri grezzi
  //   + un fattore = proiezione / banca.
  function analisiPrevedeCopertura(completamento) {
    if (!STATE.pacchetto) return null;
    const oggi = oggiISO();

    // Ritmo medio = quiz/giorno negli ultimi 7 giorni di calendario
    const diario = (typeof carCaricaDiario === 'function') ? (carCaricaDiario() || {}) : {};
    let tot7 = 0;
    let giorniAttivi = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(oggi);
      d.setDate(d.getDate() - i);
      const data = d.toISOString().substring(0, 10);
      const day = diario[data];
      if (day && day.risposte && day.risposte.length > 0) {
        tot7 += day.risposte.length;
        giorniAttivi++;
      }
    }
    const ritmoMedio = Math.round(tot7 / 7);          // media spalmata su 7gg (anche inattivi)
    const ritmoQuandoAttivo = giorniAttivi > 0 ? Math.round(tot7 / giorniAttivi) : 0;

    // Giorni rimanenti all'esame
    const dataProva = (typeof caricaDaStorage === 'function') ? caricaDaStorage(SK_DATA_PROVA) : null;
    let giorniRimanenti = null;
    if (dataProva) {
      const oggiD  = new Date(oggi);
      const provaD = new Date(dataProva);
      giorniRimanenti = Math.max(0, Math.floor((provaD - oggiD) / (1000 * 60 * 60 * 24)));
    }

    const bancaTot = completamento ? completamento.tot : 0;
    const proiezione = (ritmoMedio > 0 && giorniRimanenti !== null) ? ritmoMedio * giorniRimanenti : null;
    const fattore = (proiezione !== null && bancaTot > 0) ? proiezione / bancaTot : null;

    return {
      ritmoMedio,
      ritmoQuandoAttivo,
      giorniAttiviSu7: giorniAttivi,
      dataProva,
      giorniRimanenti,
      proiezione,
      bancaTot,
      fattore,
    };
  }

  // ─── Pre-calcolo catalogo (cache su STATE) ──────────────
  function _precomputaCatalogoAnalisi() {
    if (STATE._analisiCatalogo) return STATE._analisiCatalogo;
    const cat = {
      quizPerMateria:      {},   // materia_id -> Set<quiz_id>
      quizPerArgomento:    {},   // arg_id -> Set<quiz_id>
      quizPerArticolo:     {},   // "argId|articoloNorm" -> Set<quiz_id>
      quizSenzaArticolo:   {},   // arg_id -> Set<quiz_id> (articolo null)
      quizSenzaArgomento:  {},   // materia_id -> Set<quiz_id> (NO categorizzazione/argomento_id)
      articoloLookup:      {},   // "argId|articoloNorm" -> { sottoNome, leggeNome }
      argomentiMappati:    new Set(),  // argomento_id presenti almeno una volta nei quiz
      argomentiDelProgramma: new Set(),// argomento_id dichiarati nel programma
    };
    if (!STATE.pacchetto) return cat;

    // 1) Lookup articoli definiti nel programma + traccia argomenti dichiarati
    for (const m of (STATE.pacchetto.programma.materie || [])) {
      for (const a of (m.argomenti || [])) {
        cat.argomentiDelProgramma.add(a.id);
        for (const l of (a.leggi || [])) {
          for (const s of (l.sotto_argomenti || [])) {
            for (const art of (s.articoli || [])) {
              const numero = typeof art === 'string'
                ? art
                : String(art.numero || '');
              const numeroNorm = _normalizzaArticolo(numero);
              if (!numeroNorm) continue;
              cat.articoloLookup[`${a.id}|${numeroNorm}`] = {
                sottoNome: s.nome,
                leggeNome: l.nome,
                articoloTitolo: typeof art === 'object' ? (art.titolo || '') : '',
              };
            }
          }
        }
      }
    }

    // 2) Itero quiz categorizzati e indicizzo
    for (const m of STATE.pacchetto.manifest.moduli) {
      const banca = STATE.pacchetto.banche[m.materia_id];
      if (!banca) continue;
      const arr = banca.categorizzati || banca.quiz || [];
      for (const q of arr) {
        const id = quizId(q);
        if (!cat.quizPerMateria[m.materia_id]) cat.quizPerMateria[m.materia_id] = new Set();
        cat.quizPerMateria[m.materia_id].add(id);

        const argId = q.categorizzazione && q.categorizzazione.argomento_id;
        if (!argId) {
          // Quiz senza categorizzazione/argomento_id: tracciato per diagnostica
          if (!cat.quizSenzaArgomento[m.materia_id]) cat.quizSenzaArgomento[m.materia_id] = new Set();
          cat.quizSenzaArgomento[m.materia_id].add(id);
          continue;
        }
        cat.argomentiMappati.add(argId);
        if (!cat.quizPerArgomento[argId]) cat.quizPerArgomento[argId] = new Set();
        cat.quizPerArgomento[argId].add(id);

        const articolo = q.categorizzazione.articolo;
        if (articolo) {
          const numeroNorm = _normalizzaArticolo(articolo);
          const key = `${argId}|${numeroNorm}`;
          if (!cat.quizPerArticolo[key]) cat.quizPerArticolo[key] = new Set();
          cat.quizPerArticolo[key].add(id);
        } else {
          if (!cat.quizSenzaArticolo[argId]) cat.quizSenzaArticolo[argId] = new Set();
          cat.quizSenzaArticolo[argId].add(id);
        }
      }
    }

    // 3) Auto-categorizzazione dei quiz senza argomento_id
    //    Impara dai quiz già categorizzati dello stesso materia,
    //    poi assegna gli "orfani" all'argomento con miglior match testuale.
    _autocategorizzaQuizMancanti(cat);

    STATE._analisiCatalogo = cat;
    return cat;
  }

  // ─── Tokenizer italiano + stopwords minimali ───
  const _STOPWORDS_IT = new Set([
    'il','lo','la','i','gli','le','un','uno','una','di','a','da','in','con','su','per','tra','fra',
    'e','o','ma','che','è','sono','del','della','dello','dei','degli','delle','al','allo','alla',
    'ai','agli','alle','nel','nello','nella','nei','negli','nelle','dal','dallo','dalla','dai',
    'dagli','dalle','col','coi','sul','sullo','sulla','sui','sugli','sulle',
    'quale','quali','come','quando','dove','perchè','perché','se','non','né','si','ne',
    'questa','questo','questi','queste','quella','quello','quelli','quelle','suo','sua','suoi','sue',
    'mio','mia','miei','mie','tuo','tua','nostro','nostra','vostro','vostra','loro',
    'più','meno','molto','poco','tanto','solo','anche','già','quasi','sempre','mai','ora','oggi',
    'essere','stato','stata','stati','state','avere','aver','avuto','avuta','fare','fatto',
    'art','articolo','comma','co','par','paragrafo','lettera','punto','sub','seg','seguenti',
    'ai','sensi','seguente','presente','seguente','quanto','quale','tale','tutti','tutto','tutta',
    'altri','altre','altro','altra','dopo','prima','durante','mediante','attraverso','verso',
    'caso','casi','ovvero','cui','cosi','così','dunque','quindi','pertanto','sia','siano',
    'puo','può','possono','deve','devono','devo','dev','potrebbe','dovrebbe','dovrà','dovranno',
    'quesito','domanda','opzione','opzioni','risposta','corretta','errata','seguenti',
    'completa','frase','riportata','affermazione','indicare','indicato','indicata','seguente',
    'rispetto','riguardo','viene','vengono','venuto','ovvero'
  ]);

  function _tokenize(text) {
    if (!text) return [];
    // Rimuovo punteggiatura e numerazione tipica
    const cleaned = String(text)
      .toLowerCase()
      .replace(/['"`’‘“”]/g, '')
      .replace(/[.,;:!?()\[\]{}\/\\<>]/g, ' ')
      .replace(/\s+/g, ' ');
    const out = [];
    for (const w of cleaned.split(' ')) {
      if (w.length < 3) continue;
      if (_STOPWORDS_IT.has(w)) continue;
      if (/^\d+$/.test(w)) continue;       // numeri puri
      if (/^\d+[a-z]*$/i.test(w)) continue; // tipo "1bis", "26ter"
      out.push(w);
    }
    return out;
  }

  function _autocategorizzaQuizMancanti(cat) {
    cat.autoCategorizzati = {};        // argomento_id -> Set<quiz_id> (auto-assegnati)
    cat.totAutoCategorizzati = 0;

    if (!STATE.pacchetto) return;

    // ─── Fase 1: costruisci fingerprints per argomento dai quiz già categorizzati ───
    // fingerprint = { tokens: Map<word, count>, nQuiz, materia_id }
    const fingerprints = {};
    for (const m of STATE.pacchetto.manifest.moduli) {
      const banca = STATE.pacchetto.banche[m.materia_id];
      if (!banca) continue;
      const arr = banca.categorizzati || banca.quiz || [];
      for (const q of arr) {
        const argId = q.categorizzazione && q.categorizzazione.argomento_id;
        if (!argId) continue;
        // Considera SOLO argomenti che sono effettivamente nel programma
        if (!cat.argomentiDelProgramma.has(argId)) continue;
        const tokens = _tokenize((q.domanda || '') + ' ' + (q.opzioni || []).join(' '));
        if (!fingerprints[argId]) {
          fingerprints[argId] = { tokens: new Map(), nQuiz: 0, materia_id: m.materia_id };
        }
        fingerprints[argId].nQuiz++;
        for (const t of tokens) {
          fingerprints[argId].tokens.set(t, (fingerprints[argId].tokens.get(t) || 0) + 1);
        }
      }
    }

    // ─── Fase 2: discriminative weighting (token-IDF tra argomenti della stessa materia) ───
    // Per ogni materia con ≥2 argomenti, ricalibro i pesi dei token: un token che appare in
    // molti argomenti vale meno; uno che appare quasi solo in un argomento vale tanto.
    const materieIDF = {};   // materia_id -> Map<token, idf>
    const argomentiPerMateria = {};  // materia_id -> [arg_id]
    for (const [argId, fp] of Object.entries(fingerprints)) {
      if (!argomentiPerMateria[fp.materia_id]) argomentiPerMateria[fp.materia_id] = [];
      argomentiPerMateria[fp.materia_id].push(argId);
    }
    for (const [matId, argIds] of Object.entries(argomentiPerMateria)) {
      if (argIds.length < 2) continue;   // niente discriminazione con 1 solo argomento
      const idf = new Map();
      // Conta in quanti argomenti compare ciascun token
      const docFreq = new Map();
      for (const aId of argIds) {
        for (const t of fingerprints[aId].tokens.keys()) {
          docFreq.set(t, (docFreq.get(t) || 0) + 1);
        }
      }
      // IDF classica: log(N / df)
      const N = argIds.length;
      for (const [t, df] of docFreq) {
        idf.set(t, Math.log(N / df));
      }
      materieIDF[matId] = idf;
    }

    // ─── Fase 3: per ogni quiz uncategorized, score contro gli argomenti della sua materia ───
    const SOGLIA_MIN_SCORE      = 0.5;   // score assoluto minimo per assegnare
    const SOGLIA_MIN_MARGINE    = 1.15;  // miglior_score / secondo_score
    const MIN_TOKENS_QUIZ       = 3;     // ignora quiz troppo corti

    for (const m of STATE.pacchetto.manifest.moduli) {
      const argIds = argomentiPerMateria[m.materia_id];
      if (!argIds || argIds.length < 2) continue;
      const idf = materieIDF[m.materia_id];
      const banca = STATE.pacchetto.banche[m.materia_id];
      if (!banca) continue;
      const arr = banca.categorizzati || banca.quiz || [];

      for (const q of arr) {
        const argEsistente = q.categorizzazione && q.categorizzazione.argomento_id;
        if (argEsistente) continue;
        const tokens = _tokenize((q.domanda || '') + ' ' + (q.opzioni || []).join(' '));
        if (tokens.length < MIN_TOKENS_QUIZ) continue;

        // Score = somma di (tf_quiz_in_argomento_normalizzato × idf_token)
        const scores = [];
        for (const aId of argIds) {
          const fp = fingerprints[aId];
          let s = 0;
          for (const t of tokens) {
            const tf = fp.tokens.get(t) || 0;
            if (tf === 0) continue;
            // tf normalizzata per dimensione argomento + idf inter-argomento
            const wIdf = idf.get(t) || 0;
            s += (Math.log(1 + tf) / Math.log(1 + fp.nQuiz)) * (1 + wIdf);
          }
          // normalizza per lunghezza query
          scores.push({ aId, s: s * 100 / Math.sqrt(tokens.length) });
        }
        scores.sort((a, b) => b.s - a.s);
        const best = scores[0];
        const second = scores[1] || { s: 0.0001 };
        const margine = best.s / Math.max(0.0001, second.s);

        if (best.s >= SOGLIA_MIN_SCORE && margine >= SOGLIA_MIN_MARGINE) {
          const id = quizId(q);
          if (!cat.autoCategorizzati[best.aId]) cat.autoCategorizzati[best.aId] = new Set();
          cat.autoCategorizzati[best.aId].add(id);
          cat.totAutoCategorizzati++;
          // Inserisco anche nel pool principale così la cascata lo vede
          if (!cat.quizPerArgomento[best.aId]) cat.quizPerArgomento[best.aId] = new Set();
          cat.quizPerArgomento[best.aId].add(id);
          cat.argomentiMappati.add(best.aId);
          // Rimuovo dai "senza argomento"
          if (cat.quizSenzaArgomento[m.materia_id]) {
            cat.quizSenzaArgomento[m.materia_id].delete(id);
          }
        }
      }
    }
  }

  function _normalizzaArticolo(v) {
    return String(v).replace(/^art\.?\s*/i, '').trim().toLowerCase();
  }

  // ─── Build stats risposte filtrate dal diario ───
  //   Per ogni quiz:
  //     att = tentativi totali (storico, lifetime)
  //     cor = numero TOTALE di risposte corrette (su tutti i tentativi)
  //     err = numero TOTALE di risposte errate
  //     ultimoCorretta / ultimoTs = utili per altre logiche (es. mappa errori)
  //   Precisione del nodo = sum(cor) / (sum(cor) + sum(err)) sui suoi quiz =
  //   percentuale globale di risposte corrette, identica all'accuratezza Ranked.
  //
  // FONTE DATI: per coerenza con il resto dell'app, quando il filtro origine
  // è 'tutti' (default) leggo da `progress.risposte` GLOBALE — è la verità
  // oggettiva di "ho risposto a questo quiz almeno una volta nella mia vita
  // sull'app". Quando l'utente filtra per origine specifica (ranked/carriera/
  // libero), torno a leggere dal diario per-save (che è l'unico dataset che
  // contiene il campo mode).
  // SORGENTE UNICA: diario globale (somma di tutti i save). Così:
  //   • origine='tutti' = ranked+libero+carriera (la somma combacia con i singoli)
  //   • la vista è globale (tutti i save confluiscono), non solo il save attivo
  function _buildStatsRisposteAnalisi(filtri) {
    const stats = {};       // quiz_id -> { att, cor, err, ultimoTs, ultimoCorretta }
    const oggi  = oggiISO();

    let cutoff = null;
    if (filtri.periodo && filtri.periodo !== 'tutti') {
      const gg = parseInt(filtri.periodo, 10);
      if (!isNaN(gg) && gg > 0) {
        const d = new Date(oggi);
        d.setDate(d.getDate() - gg);
        cutoff = d.toISOString().substring(0, 10);
      }
    }

    // Scelta sorgente:
    //  • Scope SAVE   → diario di QUEL save = SOLO Ranked (un save = mondo Ranked)
    //  • Globale      → progress GLOBALE: ogni risposta mai data (Ranked di tutti
    //                   i save + Libero), con campo mode per il filtro origine.
    let righe;
    if (_AM_SCOPE.type === 'save') {
      righe = _amDiarioDiSave(_AM_SCOPE.saveId);   // ranked-only
    } else {
      righe = [];
      let progress = null;
      try { progress = (typeof caricaProgress === 'function') ? caricaProgress() : null; } catch (_) {}
      const rs = (progress && Array.isArray(progress.risposte)) ? progress.risposte : [];
      for (const r of rs) {
        if (!r.quiz_id) continue;
        const ts = r.timestamp || 0;
        righe.push({
          quiz_id: r.quiz_id,
          corretta: !!r.corretta,
          ts,
          data: ts ? new Date(ts).toISOString().substring(0, 10) : '0000-00-00',
          mode: r.mode || null,   // entry vecchie senza mode → null (solo in 'tutti')
        });
      }
    }

    for (const r of righe) {
      if (cutoff && r.data < cutoff) continue;
      if (filtri.origine !== 'tutti') {
        // entry senza mode (storico vecchio) non attribuibili → escluse dai filtri
        if (!r.mode) continue;
        const origineRisp = (r.mode === 'ranked') ? 'ranked'
                          : (r.mode === 'libero') ? 'libero'
                          : 'carriera';
        if (filtri.origine !== origineRisp) continue;
      }
      let s = stats[r.quiz_id];
      if (!s) s = stats[r.quiz_id] = { att: 0, cor: 0, err: 0, ultimoTs: -1, ultimoCorretta: false };
      s.att++;
      if (r.corretta) s.cor++; else s.err++;
      if (r.ts >= s.ultimoTs) {
        s.ultimoTs = r.ts;
        s.ultimoCorretta = r.corretta;
      }
    }
    return stats;
  }

  // ─── Aggrega stats su un Set di quiz_id ───
  function _aggregaStats(quizIds, statsRisposte) {
    let totale = 0, affrontati = 0, tentativi = 0, corretti = 0, errati = 0;
    if (!quizIds) return { totale, affrontati, tentativi, corretti, errati };
    for (const id of quizIds) {
      totale++;
      const s = statsRisposte[id];
      if (s) {
        affrontati++;
        tentativi += s.att;
        corretti  += s.cor;
        errati    += s.err;
      }
    }
    return { totale, affrontati, tentativi, corretti, errati };
  }

  // ─── Helper presentazione ───
  function _classeCopertura(perc) {
    if (perc >= 70) return 'cop-alta';
    if (perc >= 30) return 'cop-media';
    if (perc >  0)  return 'cop-bassa';
    return 'cop-nulla';
  }
  function _classePrecisione(perc) {
    if (perc >= 80) return 'prec-alta';
    if (perc >= 60) return 'prec-media';
    return 'prec-bassa';
  }
  function _renderStatBar(stats, denseMode) {
    const perc      = stats.totale > 0 ? (stats.affrontati / stats.totale) * 100 : 0;
    const percTot   = Math.round(perc);
    const denomReale = stats.corretti + stats.errati;
    const precisione = denomReale > 0 ? Math.round((stats.corretti / denomReale) * 100) : null;
    const cl        = _classeCopertura(perc);
    const cp        = precisione !== null ? _classePrecisione(precisione) : '';

    if (denseMode) {
      // Layout compatto per articoli/righe profonde
      return `
        <div class="am-stat-dense">
          <span class="am-num">${stats.totale.toLocaleString('it-IT')}q</span>
          <span class="am-num">${stats.affrontati.toLocaleString('it-IT')} fatti</span>
          <span class="am-sep">·</span>
          <span class="am-tag am-ok">${stats.corretti} ✓</span>
          <span class="am-tag am-ko">${stats.errati} ✗</span>
          ${precisione !== null ? `<span class="am-prec ${cp}">${precisione}%</span>` : '<span class="am-muted">—</span>'}
        </div>
      `;
    }
    return `
      <div class="am-stats">
        <div class="am-stat">
          <div class="am-stat-v">${stats.totale.toLocaleString('it-IT')}</div>
          <div class="am-stat-l">Quiz totali</div>
        </div>
        <div class="am-stat">
          <div class="am-stat-v">${stats.affrontati.toLocaleString('it-IT')}</div>
          <div class="am-stat-l">Affrontati</div>
        </div>
        <div class="am-stat">
          <div class="am-stat-v am-ok-v">${stats.corretti.toLocaleString('it-IT')}</div>
          <div class="am-stat-l">Corretti</div>
        </div>
        <div class="am-stat">
          <div class="am-stat-v am-ko-v">${stats.errati.toLocaleString('it-IT')}</div>
          <div class="am-stat-l">Errati</div>
        </div>
        <div class="am-stat">
          <div class="am-stat-v ${cp ? 'am-prec-v ' + cp : 'am-muted'}">${precisione !== null ? precisione + '%' : '—'}</div>
          <div class="am-stat-l">Precisione</div>
        </div>
      </div>
      <div class="am-bar-row">
        <div class="am-bar"><div class="am-bar-fill ${cl}" style="width:${Math.min(100, percTot)}%"></div></div>
        <div class="am-bar-lbl">${percTot}% affrontato</div>
      </div>
    `;
  }

  // ─── Render principale ────────────────────────────────
  // ─── Stato del drill-down ad albero ───
  // _AM_TREE_PATH[liv] = id del nodo selezionato al livello liv
  //   0=materia · 1=argomento · 2=legge · 3=sotto-argomento · 4=articolo
  let _AM_TREE_PATH  = [];
  let _amResizeBound = false;

  // Alias pubblico (route 'mappa') → Analisi Globale
  function renderAnalisiMaterie() { renderAnalisiGlobale(); }

  // Corpo render condiviso dalle due viste (globale / mappatura ranked).
  // Lo scope corrente è in _AM_SCOPE (NON resettarlo qui).
  function _amRenderTree() {
    if (!STATE.pacchetto) {
      document.getElementById('main').innerHTML = `
        <div class="empty-state">
          <h2>Pacchetto non caricato</h2>
          <p>Carica prima un pacchetto bando per accedere all'Analisi Quiz Materie.</p>
        </div>`;
      return;
    }

    const catalogo      = _precomputaCatalogoAnalisi();
    const statsRisposte = _buildStatsRisposteAnalisi(_ANALISI_FILTRI);

    // "Visione d'insieme" deve rispettare lo SCOPE selezionato:
    //   - scope = 'globale'  → quiz unici di tutto il bundle
    //   - scope = save_id    → quiz unici del piano del save (materie + arg esclusi)
    const scopeAttivo = _amGetScope();
    const quizScopeIds = new Set();
    if (scopeAttivo.type === 'globale') {
      for (const set of Object.values(catalogo.quizPerMateria)) {
        for (const id of set) quizScopeIds.add(id);
      }
    } else {
      for (const mid of scopeAttivo.materieSet) {
        const banca = STATE.pacchetto.banche[mid];
        if (!banca) continue;
        const arr = banca.categorizzati || banca.quiz || [];
        const esc = scopeAttivo.esclArg[mid];
        for (const q of arr) {
          const argId = q.categorizzazione && q.categorizzazione.argomento_id;
          if (argId && esc && esc.has(argId)) continue;
          quizScopeIds.add(quizId(q));
        }
      }
    }
    const statsGlobali = _aggregaStats(quizScopeIds, statsRisposte);
    const padron = carCaricaPadron();
    // nPadron globale (usato nel tag "X quiz padroneggiati") → conta solo quelli IN scope
    let nPadron = 0;
    for (const id of quizScopeIds) {
      const p = padron[id];
      if (èPadroneggiato(p)) nPadron++;
    }
    const nMaterie = (scopeAttivo.type === 'save')
      ? scopeAttivo.materieSet.size
      : (STATE.pacchetto.programma.materie || []).length;

    const _ttPer = (val) =>
      val === '7'  ? 'Conta solo le risposte degli ultimi 7 giorni'
      : val === '30' ? 'Conta solo le risposte degli ultimi 30 giorni'
      : 'Conta tutte le risposte mai date (storico intero)';
    const _ttOri = (val) =>
      val === 'tutti'    ? 'Mostra le risposte di ogni modalità (Ranked + Libero)'
      : val === 'carriera' ? 'Filtra alle sole risposte date nella vecchia modalità Carriera'
      : val === 'ranked'   ? 'Filtra alle sole risposte date in modalità Ranked'
      : 'Filtra alle sole risposte date in Allenamento Libero';
    const chipPer = (val, label) =>
      `<button class="am-chip ${_ANALISI_FILTRI.periodo === val ? 'active' : ''}" data-am-periodo="${val}" title="${escapeAttr(_ttPer(val))}">${label}</button>`;
    const chipOri = (val, label) =>
      `<button class="am-chip ${_ANALISI_FILTRI.origine === val ? 'active' : ''}" data-am-origine="${val}" title="${escapeAttr(_ttOri(val))}">${label}</button>`;

    // Filtro "materie da mostrare" — declutter dell'albero (non cambia i totali globali)
    const _scopeMat = _amGetScope();
    const materieOrdinate = [...(STATE.pacchetto.programma.materie || [])]
      .filter(m => m.id !== 'M99_altro')
      .filter(m => (catalogo.quizPerMateria[m.id] || new Set()).size > 0)
      .filter(m => _scopeMat.type !== 'save' || _scopeMat.materieSet.has(m.id))
      .sort((a, b) => _ANALISI_FILTRI.ordineMaterie === 'az'
        ? (a.nome || '').localeCompare(b.nome || '')
        : (b.peso || 0) - (a.peso || 0));
    const _matVis = _ANALISI_FILTRI.materieVisibili;   // null = tutte
    const chipMat = (m) => {
      const on = !_matVis || _matVis.has(m.id);
      return `<button class="am-chip am-chip-mat ${on ? 'active' : ''}" data-am-materia-filtro="${escapeAttr(m.id)}" data-am-matnome="${escapeAttr((m.nome || '').toLowerCase())}" title="${escapeAttr(m.nome)}">${escapeHTML(m.nome)}</button>`;
    };
    const nMaterieNascoste = _matVis ? (materieOrdinate.length - _matVis.size) : 0;

    // Scope dell'analisi: globale o save specifico
    const completamento = _amCalcolaCompletamentoScope(catalogo);
    const percIntera = Math.round(completamento.perc * 100);
    const colorClass =
      completamento.perc >= 0.80 ? 'cop-alta'
      : completamento.perc >= 0.45 ? 'cop-media'
      : completamento.perc >  0    ? 'cop-bassa'
      : 'cop-nulla';
    const _scopeView = _amGetScope();
    const _isSaveView = _scopeView.type === 'save';

    const colonneHTML = _amBuildColonne(catalogo, statsRisposte);

    // Sommario filtri (mostrato anche quando i filtri sono collassati)
    const periodoLabel = _ANALISI_FILTRI.periodo === '7' ? 'Ultimi 7 gg'
                       : _ANALISI_FILTRI.periodo === '30' ? 'Ultimi 30 gg' : 'Tutti';
    const origineLabel = _ANALISI_FILTRI.origine === 'tutti' ? 'Tutte'
                       : _ANALISI_FILTRI.origine === 'carriera' ? '🎯 Carriera'
                       : _ANALISI_FILTRI.origine === 'ranked' ? '🏆 Ranked'
                       : '🎲 Libero';

    document.getElementById('main').innerHTML = `
      <div class="analisi-page am-tree-page">
        <div class="page-header am-page-header page-header-bg pagebg-analisi">
          <div>
            <h1 class="page-title">${_isSaveView ? '🗺 Mappatura Materie Ranked' : '📊 Analisi Globale'}</h1>
            <div class="page-sub">${_isSaveView
              ? `Materie e progressi del save <strong>${escapeHTML(_scopeView.label)}</strong>. Solo le materie del suo piano, solo le sue risposte.`
              : `Esplora l'albero: clicca una card per aprire i suoi rami →. Ogni nodo mostra quiz affrontati, copertura e precisione.`}</div>
          </div>
          <div class="am-header-actions">
            ${_isSaveView
              ? `<button class="btn btn-ghost" id="am-torna-ranked" title="Torna alla Modalità Ranked">← Torna alla Ranked</button>`
              : `<button class="btn btn-ghost am-export-btn" id="am-esporta-ia" title="Esporta i quiz finiti nei nodi 'Altro' per farli categorizzare da un'IA">📥 Esporta "Altro" per IA</button>`}
          </div>
        </div>

        <!-- Scope dell'analisi: globale o piano di un save specifico -->
        ${(() => {
          const percAff = completamento.tot > 0
            ? Math.round(statsGlobali.affrontati / completamento.tot * 100)
            : 0;
          const ccAff =
            percAff >= 80 ? 'cop-alta'
            : percAff >= 45 ? 'cop-media'
            : percAff >  0  ? 'cop-bassa'
            : 'cop-nulla';
          // Battery bar: 20 segmenti con riempimento PARZIALE dell'ultimo
          // segmento per essere proporzionali al %. Al 2% vedi solo un
          // accenno luminoso (40% di un segmento), non un blocco intero.
          const segNum = 20;
          const exactFill = percAff / 100 * segNum;
          const segPiene = Math.floor(exactFill);
          const partialFrac = exactFill - segPiene;          // 0..1
          const segments = Array.from({length: segNum}, (_, i) => {
            let fill = 0;
            if (i < segPiene) fill = 100;
            else if (i === segPiene) fill = Math.round(partialFrac * 100);
            const on = fill > 0 ? 'on' : '';
            return `<div class="battery-seg ${on} ${ccAff}" style="--fill:${fill}%"></div>`;
          }).join('');
          return `
          <div class="am-scope-box">
            <div class="am-scope-h">
              <div class="am-scope-titolo">
                <span class="am-scope-label">${_isSaveView ? '🎯 SAVE: ' + escapeHTML(_scopeView.label).toUpperCase() : '🌐 ANALISI GLOBALE'}</span>
                <span class="am-scope-desc">${_isSaveView
                  ? 'Avanzamento su questo save: solo le materie del suo piano e le risposte date giocandolo.'
                  : 'Somma dei progressi di <strong>tutti i save</strong>: l\'avanzamento generale su tutta la libreria. (Per il singolo save: pulsante <em>Mappatura materie ranked</em> in Ranked.)'}</span>
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
              <button class="am-fonti-btn" id="amFontiBtn" title="Clicca per vedere da dove arrivano i quiz affrontati (save e modalità)"><strong>${statsGlobali.affrontati.toLocaleString('it-IT')}</strong> / ${completamento.tot.toLocaleString('it-IT')} affrontati (${percAff}%) <span class="am-fonti-ic">🔎 fonti</span></button>
              <span class="am-piano-sep">·</span>
              <span title="Numero TOTALE di risposte date, inclusi i quiz rivisti più volte (con doppioni)."><strong>${statsGlobali.tentativi.toLocaleString('it-IT')}</strong> risposte totali <em class="am-dup-note">(con doppioni)</em></span>
              <span class="am-piano-sep">·</span>
              <span title="Quiz che hai risposto correttamente in almeno 3 giorni diversi: si considerano padroneggiati e ricompaiono solo come refresh anti-oblio"><strong>${completamento.padron.toLocaleString('it-IT')}</strong> / ${completamento.tot.toLocaleString('it-IT')} padroneggiati</span>
              <span class="am-piano-sep">·</span>
              <span title="Numero di materie incluse nello scope selezionato (globale = tutte, save = solo quelle del piano)"><strong>${completamento.materieN}</strong> materie ${completamento.scope.type === 'save' ? 'nel save' : 'totali'}</span>
            </div>
          </div>
          `;
        })()}

        <!-- (Previsione copertura rimossa: vive solo in Progressi Ranked,
             dove è legata alle materie del save su cui ci si allena.) -->

        <!-- Filtri: collassabili (default chiusi) -->
        <div class="am-filtri-wrap ${_ANALISI_FILTRI.filtriExp ? 'open' : ''}">
          <button class="am-filtri-toggle" id="amFiltriToggle" aria-expanded="${_ANALISI_FILTRI.filtriExp ? 'true' : 'false'}">
            <span class="am-filtri-toggle-ic">${_ANALISI_FILTRI.filtriExp ? '▾' : '▸'}</span>
            <span class="am-filtri-toggle-label">Filtri</span>
            <span class="am-filtri-sum">${periodoLabel} · ${origineLabel}</span>
          </button>
          ${_ANALISI_FILTRI.filtriExp ? (() => {
            const nTent = Object.values(statsRisposte).reduce((a, s) => a + (s.att || 0), 0);
            const nQuizUnici = Object.keys(statsRisposte).length;
            return `
            <div class="am-filtri">
              <div class="am-filtro-block">
                <div class="am-filtro-label">Periodo</div>
                <div class="am-chip-row">
                  ${chipPer('7',     'Ultimi 7 gg')}
                  ${chipPer('30',    'Ultimi 30 gg')}
                  ${chipPer('tutti', 'Tutti')}
                </div>
              </div>
              <div class="am-filtro-block">
                <div class="am-filtro-label">Origine</div>
                <div class="am-chip-row">
                  ${chipOri('tutti',    'Tutte')}
                  ${chipOri('carriera', '🎯 Carriera')}
                  ${chipOri('ranked',   '🏆 Ranked')}
                  ${chipOri('libero',   '🎲 Libero')}
                </div>
              </div>
              <div class="am-filtro-block am-filtro-materie">
                <div class="am-filtro-label">
                  Materie da mostrare
                  <span class="am-mat-quick">
                    <input type="search" class="am-mat-search" id="amMatSearch" placeholder="Cerca materia… (es. 'diritt')">
                    <select class="am-mat-sort" id="amMatSort" title="Ordina materie">
                      <option value="peso" ${_ANALISI_FILTRI.ordineMaterie === 'peso' ? 'selected' : ''}>Per peso</option>
                      <option value="az" ${_ANALISI_FILTRI.ordineMaterie === 'az' ? 'selected' : ''}>A → Z</option>
                    </select>
                    <button class="am-mat-mini" data-am-mat-all="1" title="Mostra tutte le materie">Tutte</button>
                    <button class="am-mat-mini" data-am-mat-none="1" title="Nascondi tutte le materie">Nessuna</button>
                  </span>
                </div>
                <div class="am-chip-row am-chip-row-wrap" id="amMatChips">
                  ${materieOrdinate.map(chipMat).join('')}
                </div>
              </div>
              <div class="am-filtri-stato">
                Con questi filtri: <strong>${nTent.toLocaleString('it-IT')}</strong> risposte date
                · <strong class="am-filtri-net">${nQuizUnici.toLocaleString('it-IT')}</strong> quiz unici affrontati <em>(al netto dei doppioni)</em>.
                ${nMaterieNascoste > 0 ? `· <span class="am-filtri-hidden">${nMaterieNascoste} materie nascoste dall'albero</span>` : ''}
                ${_ANALISI_FILTRI.origine !== 'tutti'
                  ? `<div class="am-filtri-nota">ℹ︎ Le origini specifiche contano solo le risposte tracciate per modalità: la loro somma può essere inferiore a <em>Tutte</em>, che include l'intero storico.</div>`
                  : ''}
              </div>
            </div>
            `;
          })() : ''}
        </div>

        <div class="am-tree-toolbar">
          ${_AM_TREE_PATH.length > 0
            ? `<button class="btn btn-ghost am-collapse-btn" id="amCollapseAll" title="Chiudi tutti i rami aperti e torna alla sola colonna Materie">↩ Comprimi tutto</button>`
            : ''}
          <span class="am-tree-hint">Clicca una card per aprirne i rami · ri-clicca la card già aperta per richiuderla</span>
        </div>

        <div class="am-tree-scroll">
          <div class="am-tree-canvas" id="amTreeCanvas">
            <svg class="am-tree-svg" id="amTreeSvg" aria-hidden="true"></svg>
            ${colonneHTML}
          </div>
        </div>
      </div>
    `;

    _amAttaccaListenerTree();
    requestAnimationFrame(_amDisegnaConnettori);
  }

  // ─── Costruisce le colonne dell'albero in base a _AM_TREE_PATH ───
  function _amBuildColonne(catalogo, statsRisposte) {
    // Resetto i registry: vengono ripopolati ad ogni render
    _AM_NODE_QUIZIDS = Object.create(null);
    _AM_NODE_NOMI    = Object.create(null);
    function _regNodo(livello, id, ids, nome) {
      const key = livello + '|' + id;
      _AM_NODE_QUIZIDS[key] = ids || new Set();
      _AM_NODE_NOMI[key]    = nome || '';
    }

    const tutteMaterie = [...(STATE.pacchetto.programma.materie || [])].sort((a, b) => {
      if (a.id === 'M99_altro') return  1;
      if (b.id === 'M99_altro') return -1;
      return (b.peso || 0) - (a.peso || 0);
    });

    // Scope: filtra le materie in base allo scope corrente
    // - 'globale' → tutte
    // - save_id   → solo materie in piano(save)
    // Scope: globale = tutte; save = solo materie del piano. In più il filtro
    // "materie visibili" declutterizza la colonna L0.
    const scope = _amGetScope();
    const matVis = _ANALISI_FILTRI.materieVisibili;
    let materie = (scope.type === 'save')
      ? tutteMaterie.filter(m => scope.materieSet.has(m.id))
      : tutteMaterie;
    // Nascondi materie senza alcun quiz (es. "Altro - Quiz da classificare" vuoto)
    materie = materie.filter(m => (catalogo.quizPerMateria[m.id] || new Set()).size > 0);
    if (matVis) materie = materie.filter(m => matVis.has(m.id));
    const cols = [];

    // ── L0 — Materie ──
    cols.push({
      livello: 0, titolo: 'Materie',
      nodi: materie.map(m => {
        const ids = catalogo.quizPerMateria[m.id] || new Set();
        _regNodo(0, m.id, ids, m.nome);
        return {
          id: m.id, nome: m.nome,
          meta: 'Peso ' + (m.peso || '?') + '/10 · ' + (m.argomenti || []).length + ' argomenti',
          stats: _aggregaStats(ids, statsRisposte),
          espandibile: true,
        };
      }),
    });

    // ── L1 — Argomenti ──
    const mSel = _AM_TREE_PATH[0] ? materie.find(m => m.id === _AM_TREE_PATH[0]) : null;
    if (mSel) {
      const tuttiMatIds = catalogo.quizPerMateria[mSel.id] || new Set();
      const copertiArg = new Set();
      const nodi = (mSel.argomenti || []).map(a => {
        const haFigli = ((a.leggi || []).length > 0)
          || (catalogo.quizSenzaArticolo[a.id] && catalogo.quizSenzaArticolo[a.id].size > 0);
        const ids = catalogo.quizPerArgomento[a.id] || new Set();
        for (const id of ids) copertiArg.add(id);
        _regNodo(1, a.id, ids, a.nome);
        return {
          id: a.id, nome: a.nome, meta: 'Peso ' + (a.peso || '?') + '/10',
          stats: _aggregaStats(ids, statsRisposte),
          espandibile: haFigli,
        };
      });
      // "Altro" L1 = quiz della materia NON coperti da nessun argomento mappato.
      // Cattura: argomento_id null + argomento_id valorizzato ma non in programma.
      const orfArg = new Set();
      for (const id of tuttiMatIds) {
        if (!copertiArg.has(id)) orfArg.add(id);
      }
      if (orfArg.size > 0) {
        nodi.push({ id: '__altro__', nome: 'Altro', meta: 'quiz senza argomento o con argomento non mappato',
          stats: _aggregaStats(orfArg, statsRisposte), espandibile: false, altro: true });
      }
      cols.push({ livello: 1, titolo: 'Argomenti', nodi });
    }

    // ── L2 — Leggi ──
    const aSel = (mSel && _AM_TREE_PATH[1] && _AM_TREE_PATH[1] !== '__altro__')
      ? (mSel.argomenti || []).find(a => a.id === _AM_TREE_PATH[1]) : null;
    if (aSel) {
      // Tutti i quiz dell'argomento → punto di partenza per calcolare l'orphan set
      const tuttiArgIds = catalogo.quizPerArgomento[aSel.id] || new Set();
      // Dedupe orizzontale: ogni quiz_id va alla PRIMA legge che lo rivendica.
      // Necessario perché quizPerArticolo è indicizzato per `argId|num` senza
      // dimensione legge: due leggi con un "art. 5" condividerebbero lo stesso
      // set se non si fa dedupe (causa di gonfiamento dei figli rispetto al padre).
      const coperti = new Set();
      const nodi = (aSel.leggi || []).map((l, idx) => {
        const ids = new Set();
        for (const s of (l.sotto_argomenti || [])) {
          for (const art of (s.articoli || [])) {
            const num = _normalizzaArticolo(typeof art === 'string' ? art : String(art.numero || ''));
            const setQ = catalogo.quizPerArticolo[aSel.id + '|' + num];
            if (!setQ) continue;
            for (const id of setQ) {
              if (coperti.has(id)) continue;   // già rivendicato da una legge precedente
              ids.add(id);
              coperti.add(id);
            }
          }
        }
        const nid = 'L' + idx;
        _regNodo(2, nid, ids, l.nome);
        return {
          id: nid, nome: l.nome, meta: (l.sotto_argomenti || []).length + ' sotto-argomenti',
          stats: _aggregaStats(ids, statsRisposte),
          espandibile: (l.sotto_argomenti || []).length > 0,
        };
      });
      // "Altro" L2 = quiz dell'argomento NON coperti da nessuna legge.
      // Cattura: (a) quiz senza articolo, (b) quiz con articolo non mappato nel
      // programma. Prima il nodo "Altro" usava solo quizSenzaArticolo → quiz
      // con articolo "orfano" si perdevano (bug aggregazione padre vs figli).
      const orf = new Set();
      for (const id of tuttiArgIds) {
        if (!coperti.has(id)) orf.add(id);
      }
      if (orf.size > 0) {
        nodi.push({ id: '__altro__', nome: 'Altro', meta: 'quiz senza articolo o con articolo non mappato',
          stats: _aggregaStats(orf, statsRisposte), espandibile: false, altro: true });
      }
      cols.push({ livello: 2, titolo: 'Leggi', nodi });
    }

    // ── L3 — Sotto-argomenti ──
    const lSel = (aSel && _AM_TREE_PATH[2] && _AM_TREE_PATH[2].charAt(0) === 'L')
      ? (aSel.leggi || [])[parseInt(_AM_TREE_PATH[2].slice(1), 10)] : null;
    if (lSel) {
      // Tutti i quiz della legge corrente = unione di tutti gli articoli dei suoi sotto-arg
      const tuttiLeggeIds = new Set();
      for (const ss of (lSel.sotto_argomenti || [])) {
        for (const art of (ss.articoli || [])) {
          const num = _normalizzaArticolo(typeof art === 'string' ? art : String(art.numero || ''));
          const setQ = catalogo.quizPerArticolo[aSel.id + '|' + num];
          if (setQ) for (const id of setQ) tuttiLeggeIds.add(id);
        }
      }
      // Dedupe orizzontale tra sotto-argomenti (stessa logica L2): se due
      // sotto-arg hanno un articolo con stesso numero, il primo lo claima.
      const copertiSotto = new Set();
      const nodi = (lSel.sotto_argomenti || []).map((s, idx) => {
        const ids = new Set();
        for (const art of (s.articoli || [])) {
          const num = _normalizzaArticolo(typeof art === 'string' ? art : String(art.numero || ''));
          const setQ = catalogo.quizPerArticolo[aSel.id + '|' + num];
          if (!setQ) continue;
          for (const id of setQ) {
            if (copertiSotto.has(id)) continue;
            ids.add(id);
            copertiSotto.add(id);
          }
        }
        const nid = 'S' + idx;
        _regNodo(3, nid, ids, s.nome);
        return {
          id: nid, nome: s.nome, meta: (s.articoli || []).length + ' articoli',
          stats: _aggregaStats(ids, statsRisposte),
          espandibile: (s.articoli || []).length > 0,
        };
      });
      // "Altro" L3: articoli della legge non assegnati a nessun sotto-arg
      // (raro ma possibile se struttura programma incompleta)
      const orfSotto = new Set();
      for (const id of tuttiLeggeIds) {
        if (!copertiSotto.has(id)) orfSotto.add(id);
      }
      if (orfSotto.size > 0) {
        nodi.push({ id: '__altro__', nome: 'Altro', meta: 'articoli non assegnati a sotto-argomenti',
          stats: _aggregaStats(orfSotto, statsRisposte), espandibile: false, altro: true });
      }
      cols.push({ livello: 3, titolo: 'Sotto-argomenti', nodi });
    }

    // ── L4 — Articoli (foglie) ──
    const sSel = (lSel && _AM_TREE_PATH[3] && _AM_TREE_PATH[3].charAt(0) === 'S')
      ? (lSel.sotto_argomenti || [])[parseInt(_AM_TREE_PATH[3].slice(1), 10)] : null;
    if (sSel) {
      // Dedupe orizzontale tra articoli del sotto-argomento corrente
      const copertiArt = new Set();
      const nodi = (sSel.articoli || []).map((art, idx) => {
        const numero = typeof art === 'string' ? art : String(art.numero || '');
        const titolo = typeof art === 'object' ? (art.titolo || '') : '';
        const num = _normalizzaArticolo(numero);
        const raw = catalogo.quizPerArticolo[aSel.id + '|' + num] || new Set();
        const ids = new Set();
        for (const id of raw) {
          if (copertiArt.has(id)) continue;
          ids.add(id);
          copertiArt.add(id);
        }
        const nid = 'art' + idx;
        const nome = 'art. ' + numero;
        _regNodo(4, nid, ids, nome);
        return {
          id: nid, nome, meta: titolo,
          stats: _aggregaStats(ids, statsRisposte),
          espandibile: false,
        };
      });
      cols.push({ livello: 4, titolo: 'Articoli', nodi });
    }

    return cols.map(_amRenderColonna).join('');
  }

  function _amRenderColonna(col) {
    const nodiHTML = col.nodi.length
      ? col.nodi.map(nd => _amRenderNodo(nd, col.livello)).join('')
      : '<div class="am-col-vuota">nessun elemento</div>';
    // Tasto comprimi PER-LIVELLO: chiude solo questa colonna e torna a quella
    // precedente (non fino alle materie). Presente per ogni colonna figlia (L≥1).
    const collapseBtn = col.livello >= 1
      ? `<button class="am-col-collapse" data-am-col-collapse="${col.livello}" title="Chiudi questo livello e torna alla colonna precedente">↩</button>`
      : '';
    return `
      <div class="am-tree-col" data-am-col="${col.livello}">
        <div class="am-col-h">${collapseBtn}<span class="am-col-h-titolo">${col.titolo}</span><span class="am-col-n">${col.nodi.length}</span></div>
        <div class="am-col-nodi">${nodiHTML}</div>
      </div>
    `;
  }

  function _amRenderNodo(nd, livello) {
    const s = nd.stats;
    const perc = s.totale > 0 ? Math.round(s.affrontati / s.totale * 100) : 0;
    const cl   = _classeCopertura(perc);
    const denom = s.corretti + s.errati;
    const prec = denom > 0 ? Math.round(s.corretti / denom * 100) : null;
    const cp   = prec !== null ? _classePrecisione(prec) : '';
    const sel  = (_AM_TREE_PATH[livello] === nd.id);
    // Bottone "▶ Avvia quiz" — nascosto per i nodi 'Altro' (quiz senza
    // categorizzazione/articolo) e quando non ci sono quiz nel nodo.
    const lancabile = !nd.altro && s.totale > 0;
    const launchKey = livello + '|' + nd.id;
    // Tooltip dettagliati per le percentuali (utenti non gamer non arrivano
    // ai significati di "copertura" e "precisione" a colpo d'occhio).
    const ttCop = `Copertura: ${s.affrontati} quiz unici su ${s.totale} sono stati affrontati almeno una volta. Salire da 0 al 100% significa aver visto ogni quiz del blocco almeno una volta.`;
    const ttPerc = ttCop;
    const ttPrec = prec !== null
      ? `Precisione: sull'ultimo tentativo di ogni quiz, ${s.corretti} sono attualmente corretti su ${denom} risposti. È la foto attuale di "quanto sapresti rispondere adesso", non una media storica.`
      : 'Precisione: non disponibile finché non rispondi ad almeno un quiz di questo blocco.';
    const ttBarra = `Avanzamento copertura del blocco: ${perc}% dei quiz visti almeno una volta.`;
    return `
      <div class="am-node ${sel ? 'am-node-sel' : ''} ${nd.altro ? 'am-node-altro' : ''} ${nd.espandibile ? 'am-node-exp' : 'am-node-leaf'}"
           data-am-node="${escapeAttr(nd.id)}" data-am-liv="${livello}">
        <div class="am-node-top">
          <div class="am-node-nome">${escapeHTML(nd.nome)}</div>
          ${nd.espandibile ? '<span class="am-node-arrow">▸</span>' : ''}
        </div>
        ${nd.meta ? `<div class="am-node-meta">${escapeHTML(nd.meta)}</div>` : ''}
        <div class="am-node-bar" title="${escapeAttr(ttBarra)}"><div class="am-node-bar-fill ${cl}" style="width:${perc}%"></div></div>
        <div class="am-node-stats">
          <span class="am-node-cop" title="${escapeAttr(ttCop)}"><strong>${s.affrontati.toLocaleString('it-IT')}</strong>/${s.totale.toLocaleString('it-IT')}</span>
          <span class="am-node-perc ${cl}" title="${escapeAttr(ttPerc)}">${perc}%</span>
          ${prec !== null
            ? `<span class="am-node-prec ${cp}" title="${escapeAttr(ttPrec)}">${prec}% ✓</span>`
            : `<span class="am-muted" title="${escapeAttr(ttPrec)}">—</span>`}
        </div>
        ${lancabile ? `
          <button class="am-node-launch" data-am-launch="${escapeAttr(launchKey)}"
                  title="Avvia un round Ranked sui quiz di questo blocco. Vale come un round normale: contatori e RP si aggiornano.">▶ Avvia quiz</button>
        ` : ''}
      </div>
    `;
  }

  // ─── Disegna i connettori SVG tra colonna selezionata e figli ───
  function _amDisegnaConnettori() {
    const canvas = document.getElementById('amTreeCanvas');
    const svg    = document.getElementById('amTreeSvg');
    if (!canvas || !svg) return;
    const W = canvas.scrollWidth, H = canvas.scrollHeight;
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    const cols = Array.prototype.slice.call(canvas.querySelectorAll('.am-tree-col'));
    let d = '';
    for (let i = 0; i < cols.length - 1; i++) {
      const parent = cols[i].querySelector('.am-node-sel');
      if (!parent) continue;
      const px = parent.offsetLeft + parent.offsetWidth;
      const py = parent.offsetTop + parent.offsetHeight / 2;
      const figli = Array.prototype.slice.call(cols[i + 1].querySelectorAll('.am-node'));
      for (const f of figli) {
        const fx = f.offsetLeft;
        const fy = f.offsetTop + f.offsetHeight / 2;
        const dx = Math.max(20, (fx - px) * 0.5);
        const attivo = f.classList.contains('am-node-sel');
        d += `<path d="M ${px} ${py} C ${px + dx} ${py}, ${fx - dx} ${fy}, ${fx} ${fy}" `
           + `fill="none" stroke="${attivo ? '#34e5ff' : 'rgba(110,168,216,0.40)'}" `
           + `stroke-width="${attivo ? 2.6 : 1.5}" stroke-linecap="round" `
           + `${attivo ? 'filter="url(#amGlow)"' : ''}/>`;
      }
    }
    svg.innerHTML =
      '<defs><filter id="amGlow" x="-20%" y="-20%" width="140%" height="140%">'
      + '<feGaussianBlur stdDeviation="2" result="b"/>'
      + '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>'
      + '</filter></defs>' + d;
  }
  let _amResizeTimer = null;
  function _amDisegnaConnettoriDebounced() {
    clearTimeout(_amResizeTimer);
    _amResizeTimer = setTimeout(_amDisegnaConnettori, 120);
  }

  // ─── Modal "Avvia quiz" per un nodo dell'albero ───
  // Mostra picker dimensione (10/25/50/Tutti) + filtro (Tutti / Solo errati).
  // Lancia un round Ranked ristretto al nodo selezionato.
  function _amMostraLaunchModal(launchKey) {
    const ids   = _AM_NODE_QUIZIDS[launchKey];
    const nome  = _AM_NODE_NOMI[launchKey] || 'Quiz selezionati';
    if (!ids || ids.size === 0) {
      if (typeof toast === 'function') toast('Nessun quiz disponibile in questo blocco', true);
      return;
    }
    // Conta gli errori aperti che ricadono in questo nodo (per il filtro)
    let nErratiNodo = 0;
    if (typeof rankedContaErroriAperti === 'function') {
      try {
        const diario = carCaricaDiario();
        const padron = carCaricaPadron();
        // ultimo esito per quiz (last-wins per ts)
        const ultimo = {};
        for (const data of Object.keys(diario).sort()) {
          const day = diario[data];
          if (!day || !day.risposte) continue;
          for (const r of day.risposte) {
            if (!r.quiz_id) continue;
            const cur = ultimo[r.quiz_id];
            const ts  = r.ts || 0;
            if (!cur || ts >= cur.ts) ultimo[r.quiz_id] = { ts, ok: !!r.corretta };
          }
        }
        for (const id of ids) {
          const u = ultimo[id];
          if (!u || u.ok) continue;
          // padroneggiato? un quiz padroneggiato + ultima errata è regressione
          // → conta lo stesso come errore da recuperare
          nErratiNodo++;
        }
      } catch (e) { nErratiNodo = 0; }
    }

    const nTot = ids.size;
    const opzioni = [10, 25, 50, Math.min(nTot, 200)].filter((v, i, a) => a.indexOf(v) === i);
    const defaultN = opzioni.includes(25) ? 25 : opzioni[0];

    const html = `
      <div class="am-launch-modal">
        <div class="am-launch-info">
          <div class="am-launch-titolo">${escapeHTML(nome)}</div>
          <div class="am-launch-stats">
            <span>📚 Quiz nel blocco: <strong>${nTot.toLocaleString('it-IT')}</strong></span>
            <span class="am-launch-err">🎯 Errati aperti: <strong>${nErratiNodo.toLocaleString('it-IT')}</strong></span>
          </div>
        </div>
        <div class="am-launch-section">
          <div class="am-launch-label">Filtro</div>
          <div class="am-launch-chips" data-am-launch-group="filtro">
            <button class="am-launch-chip active" data-val="tutti">Tutti i quiz</button>
            <button class="am-launch-chip" data-val="errati" ${nErratiNodo === 0 ? 'disabled' : ''}>Solo errati aperti (${nErratiNodo})</button>
          </div>
        </div>
        <div class="am-launch-section">
          <div class="am-launch-label">Quanti quiz</div>
          <div class="am-launch-chips" data-am-launch-group="n">
            ${opzioni.map(v => `
              <button class="am-launch-chip ${v === defaultN ? 'active' : ''}" data-val="${v}">
                ${v === Math.min(nTot, 200) && v !== 10 && v !== 25 && v !== 50 ? 'Tutti (' + v + ')' : v}
              </button>
            `).join('')}
          </div>
        </div>
        <button class="btn btn-primary am-launch-start" id="amLaunchStart">▶ Avvia round Ranked</button>
        <div class="am-launch-nota">Le risposte contano per la Ranked: contatori, RP e materie deboli si aggiornano normalmente.</div>
      </div>
    `;
    showModal('▶ Avvia quiz dal blocco', html, () => {}, 'Annulla');
    const mc = document.getElementById('modalConfirm');
    if (mc) mc.style.display = 'none';

    // Stato locale del modal
    const stato = { n: defaultN, filtro: 'tutti' };
    setTimeout(() => {
      document.querySelectorAll('.am-launch-chips').forEach(group => {
        group.querySelectorAll('.am-launch-chip').forEach(b => {
          b.addEventListener('click', () => {
            if (b.disabled) return;
            const g = group.dataset.amLaunchGroup;
            group.querySelectorAll('.am-launch-chip').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            const v = b.dataset.val;
            if (g === 'n')      stato.n = parseInt(v, 10);
            if (g === 'filtro') stato.filtro = v;
          });
        });
      });
      const btnGo = document.getElementById('amLaunchStart');
      if (btnGo) btnGo.addEventListener('click', () => {
        closeModal();
        if (typeof avviaRoundDaAnalisi === 'function') {
          avviaRoundDaAnalisi(ids, {
            n: stato.n,
            soloErrati: stato.filtro === 'errati',
            nomeNodo: nome,
          });
        }
      });
    }, 30);
  }

  // ─── Listener della pagina albero ───
  function _amAttaccaListenerTree() {
    const btnExp = document.getElementById('am-esporta-ia');
    if (btnExp) btnExp.addEventListener('click', _mostraExportIA);

    const btnFonti = document.getElementById('amFontiBtn');
    if (btnFonti) btnFonti.addEventListener('click', _amMostraFontiAffrontati);

    document.querySelectorAll('[data-am-periodo]').forEach(b => {
      b.addEventListener('click', () => {
        _ANALISI_FILTRI.periodo = b.dataset.amPeriodo;
        _amRenderTree();
      });
    });
    document.querySelectorAll('[data-am-origine]').forEach(b => {
      b.addEventListener('click', () => {
        _ANALISI_FILTRI.origine = b.dataset.amOrigine;
        _amRenderTree();
      });
    });
    // Filtro "materie da mostrare" — toggle singola materia
    document.querySelectorAll('[data-am-materia-filtro]').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.dataset.amMateriaFiltro;
        const tutte = (STATE.pacchetto.programma.materie || [])
          .filter(m => m.id !== 'M99_altro').map(m => m.id);
        // null = tutte visibili → materializza in Set per poter togliere
        let vis = _ANALISI_FILTRI.materieVisibili
          ? new Set(_ANALISI_FILTRI.materieVisibili)
          : new Set(tutte);
        if (vis.has(id)) vis.delete(id); else vis.add(id);
        // Se torna a "tutte", riporto a null (stato pulito)
        _ANALISI_FILTRI.materieVisibili = (vis.size >= tutte.length) ? null : vis;
        // Se il nodo aperto non è più visibile, comprimi
        if (_AM_TREE_PATH[0] && _ANALISI_FILTRI.materieVisibili
            && !_ANALISI_FILTRI.materieVisibili.has(_AM_TREE_PATH[0])) {
          _AM_TREE_PATH = [];
        }
        _amRenderTree();
      });
    });
    // Ordina materie (re-render)
    const matSort = document.getElementById('amMatSort');
    if (matSort) matSort.addEventListener('change', () => {
      _ANALISI_FILTRI.ordineMaterie = matSort.value;
      _amRenderTree();
    });
    // Ricerca live: filtra i chip senza re-render (mantiene focus + digitazione)
    const matSearch = document.getElementById('amMatSearch');
    if (matSearch) matSearch.addEventListener('input', () => {
      const q = matSearch.value.trim().toLowerCase();
      document.querySelectorAll('#amMatChips [data-am-materia-filtro]').forEach(c => {
        c.style.display = (!q || (c.dataset.amMatnome || '').includes(q)) ? '' : 'none';
      });
    });
    const matAll = document.querySelector('[data-am-mat-all]');
    if (matAll) matAll.addEventListener('click', () => {
      _ANALISI_FILTRI.materieVisibili = null;
      _amRenderTree();
    });
    const matNone = document.querySelector('[data-am-mat-none]');
    if (matNone) matNone.addEventListener('click', () => {
      _ANALISI_FILTRI.materieVisibili = new Set();   // nessuna
      _AM_TREE_PATH = [];
      _amRenderTree();
    });
    // Comprimi tutto: chiude tutti i rami aperti
    const collapseBtn = document.getElementById('amCollapseAll');
    if (collapseBtn) collapseBtn.addEventListener('click', () => {
      _AM_TREE_PATH = [];
      _amRenderTree();
    });
    // Comprimi PER-LIVELLO: il tasto ↩ in una colonna chiude solo quella colonna
    // (rimuove la selezione che l'ha aperta) → torna alla colonna precedente.
    document.querySelectorAll('[data-am-col-collapse]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const liv = parseInt(b.dataset.amColCollapse, 10);
        // Colonna L esiste perché path[L-1] è selezionato → rimuovo path[L-1].
        _AM_TREE_PATH = _AM_TREE_PATH.slice(0, Math.max(0, liv - 1));
        _amRenderTree();
      });
    });
    // Torna alla Ranked (solo nella vista mappatura save)
    const tornaRk = document.getElementById('am-torna-ranked');
    if (tornaRk) tornaRk.addEventListener('click', () => {
      if (typeof navigaA === 'function') navigaA('ranked');
    });
    // Toggle espansione filtri
    const filtriBtn = document.getElementById('amFiltriToggle');
    if (filtriBtn) {
      filtriBtn.addEventListener('click', () => {
        _ANALISI_FILTRI.filtriExp = !_ANALISI_FILTRI.filtriExp;
        _amRenderTree();
      });
    }

    document.querySelectorAll('.am-node').forEach(nd => {
      nd.addEventListener('click', () => {
        const liv = parseInt(nd.dataset.amLiv, 10);
        const id  = nd.dataset.amNode;
        const giaAperto = (_AM_TREE_PATH[liv] === id);
        if (giaAperto) {
          // Ri-click sulla card già aperta → richiude i suoi rami
          _AM_TREE_PATH = _AM_TREE_PATH.slice(0, liv);
          _amRenderTree();
          return;
        }
        // imposta il path a questo livello e tronca i livelli più profondi
        _AM_TREE_PATH = _AM_TREE_PATH.slice(0, liv);
        _AM_TREE_PATH[liv] = id;
        _amRenderTree();
        // scorre per mostrare la nuova colonna aperta
        requestAnimationFrame(() => {
          const sc = document.querySelector('.am-tree-scroll');
          if (sc) sc.scrollTo({ left: sc.scrollWidth, behavior: 'smooth' });
        });
      });
    });

    // Bottone "▶ Avvia quiz" sui nodi — apre modal picker e lancia round Ranked
    // ristretto. stopPropagation per non triggerare il drill-down della card.
    document.querySelectorAll('[data-am-launch]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = btn.dataset.amLaunch;
        _amMostraLaunchModal(key);
      });
    });

    if (!_amResizeBound) {
      window.addEventListener('resize', _amDisegnaConnettoriDebounced);
      _amResizeBound = true;
    }
  }

  // ─── Render Materia ───
  function _renderMateriaNode(m, catalogo, statsRisposte) {
    const quizMat = catalogo.quizPerMateria[m.id] || new Set();
    const stats   = _aggregaStats(quizMat, statsRisposte);
    const perc    = stats.totale > 0 ? Math.round(stats.affrontati / stats.totale * 100) : 0;
    const cl      = _classeCopertura(perc);
    const denomReale = stats.corretti + stats.errati;
    const precisione = denomReale > 0 ? Math.round((stats.corretti / denomReale) * 100) : null;
    const cp      = precisione !== null ? _classePrecisione(precisione) : '';
    const isExp   = STATE.espansioniMaterie.has(m.id);

    return `
      <div class="am-materia-node ${isExp ? 'expanded' : ''}" data-am-materia="${m.id}">
        <div class="am-materia-head">
          <svg class="am-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
          <div class="am-mat-titolo">
            <div class="am-mat-nome">${escapeHTML(m.nome)}</div>
            <div class="am-mat-meta">${escapeHTML(m.id)} · Peso ${m.peso || '?'}/10 · ${(m.argomenti || []).length} argomenti</div>
          </div>
          <div class="am-mat-bars">
            <div class="am-mat-bar"><div class="am-mat-bar-fill ${cl}" style="width:${perc}%"></div></div>
            <div class="am-mat-bar-info">
              <span><strong>${stats.affrontati.toLocaleString('it-IT')}</strong>/${stats.totale.toLocaleString('it-IT')} (${perc}%)</span>
              ${precisione !== null
                ? `<span class="am-prec ${cp}">${precisione}% precisione</span>`
                : `<span class="am-muted">non affrontato</span>`}
            </div>
          </div>
        </div>
        <div class="am-materia-body">
          ${_renderStatBar(stats, false)}
          <div class="am-argomenti">
            ${(m.argomenti || []).map(a => _renderArgomentoNode(a, m.id, catalogo, statsRisposte)).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // ─── Render Argomento ───
  function _renderArgomentoNode(a, materiaId, catalogo, statsRisposte) {
    const quizArg = catalogo.quizPerArgomento[a.id] || new Set();
    const stats   = _aggregaStats(quizArg, statsRisposte);
    const perc    = stats.totale > 0 ? Math.round(stats.affrontati / stats.totale * 100) : 0;
    const cl      = _classeCopertura(perc);
    const denomReale = stats.corretti + stats.errati;
    const precisione = denomReale > 0 ? Math.round((stats.corretti / denomReale) * 100) : null;
    const cp      = precisione !== null ? _classePrecisione(precisione) : '';
    const isExp   = STATE.espansioniArgomenti.has(a.id);

    return `
      <div class="am-arg-node ${isExp ? 'expanded' : ''}" data-am-argomento="${a.id}">
        <div class="am-arg-head">
          <svg class="am-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
          <div class="am-arg-titolo">
            <div class="am-arg-nome">${escapeHTML(a.nome)}</div>
            <div class="am-arg-meta">${escapeHTML(a.id)} · Peso ${a.peso || '?'}/10</div>
          </div>
          <div class="am-arg-bars">
            <div class="am-mat-bar small"><div class="am-mat-bar-fill ${cl}" style="width:${perc}%"></div></div>
            <div class="am-mat-bar-info">
              <span><strong>${stats.affrontati.toLocaleString('it-IT')}</strong>/${stats.totale.toLocaleString('it-IT')} (${perc}%)</span>
              ${precisione !== null
                ? `<span class="am-prec ${cp}">${precisione}%</span>`
                : `<span class="am-muted">—</span>`}
            </div>
          </div>
        </div>
        <div class="am-arg-body">
          <div class="am-arg-quick">
            <span class="am-tag am-ok">${stats.corretti} ✓</span>
            <span class="am-tag am-ko">${stats.errati} ✗</span>
            <span class="am-tag am-info">${stats.tentativi} tentativi</span>
          </div>
          ${_renderLeggiBlock(a, catalogo, statsRisposte)}
        </div>
      </div>
    `;
  }

  // ─── Render Leggi + sotto-argomenti + articoli ───
  function _renderLeggiBlock(argomento, catalogo, statsRisposte) {
    const leggi = argomento.leggi || [];

    if (leggi.length === 0) {
      return `<div class="am-empty">Nessuna legge/articolo configurato per questo argomento.</div>`;
    }

    let html = '';
    leggi.forEach((l, leggeIdx) => {
      const keyL = `${argomento.id}|${leggeIdx}`;
      const espansa = _ANALISI_ESP_LEGGI.has(keyL);

      // Aggrego stats della legge (somma articoli)
      const idsLegge = new Set();
      for (const s of (l.sotto_argomenti || [])) {
        for (const art of (s.articoli || [])) {
          const numero = typeof art === 'string' ? art : String(art.numero || '');
          const numeroNorm = _normalizzaArticolo(numero);
          if (!numeroNorm) continue;
          const setQ = catalogo.quizPerArticolo[`${argomento.id}|${numeroNorm}`];
          if (setQ) for (const id of setQ) idsLegge.add(id);
        }
      }
      const statsL = _aggregaStats(idsLegge, statsRisposte);

      html += `
        <div class="am-legge-block ${espansa ? 'expanded' : ''}" data-am-legge="${keyL}">
          <div class="am-legge-head">
            <svg class="am-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
            <div class="am-legge-nome">${escapeHTML(l.nome)}</div>
            <div class="am-legge-stats">${_renderStatBar(statsL, true)}</div>
          </div>
          <div class="am-legge-body">
            ${(l.sotto_argomenti || []).map(s => _renderSottoArgBlock(s, argomento.id, catalogo, statsRisposte)).join('')}
          </div>
        </div>
      `;
    });

    return html;
  }

  function _renderSottoArgBlock(s, argId, catalogo, statsRisposte) {
    const idsSotto = new Set();
    for (const art of (s.articoli || [])) {
      const numero = typeof art === 'string' ? art : String(art.numero || '');
      const numeroNorm = _normalizzaArticolo(numero);
      if (!numeroNorm) continue;
      const setQ = catalogo.quizPerArticolo[`${argId}|${numeroNorm}`];
      if (setQ) for (const id of setQ) idsSotto.add(id);
    }
    const stats = _aggregaStats(idsSotto, statsRisposte);

    return `
      <div class="am-sotto-block">
        <div class="am-sotto-head">
          <div class="am-sotto-titolo">${escapeHTML(s.nome)}</div>
          <div class="am-sotto-meta">peso ${s.peso || '?'}/10</div>
        </div>
        ${s.note ? `<div class="am-sotto-note">${escapeHTML(s.note)}</div>` : ''}
        <div class="am-sotto-stats">${_renderStatBar(stats, true)}</div>
        ${(s.articoli || []).length > 0
          ? `<div class="am-articoli-list">
               ${s.articoli.map(art => _renderArticoloRow(art, argId, catalogo, statsRisposte)).join('')}
             </div>`
          : ''}
      </div>
    `;
  }

  function _renderArticoloRow(art, argId, catalogo, statsRisposte) {
    const numero = typeof art === 'string' ? art : String(art.numero || '');
    const titolo = typeof art === 'object' ? (art.titolo || '') : '';
    const numeroNorm = _normalizzaArticolo(numero);
    const setQ  = catalogo.quizPerArticolo[`${argId}|${numeroNorm}`] || new Set();
    const stats = _aggregaStats(setQ, statsRisposte);
    if (stats.totale === 0) {
      return `
        <div class="am-art-row am-art-vuoto">
          <div class="am-art-num">art. ${escapeHTML(numero)}</div>
          <div class="am-art-titolo">${escapeHTML(titolo)}</div>
          <div class="am-art-stats am-muted">nessun quiz</div>
        </div>
      `;
    }
    return `
      <div class="am-art-row">
        <div class="am-art-num">art. ${escapeHTML(numero)}</div>
        <div class="am-art-titolo">${escapeHTML(titolo)}</div>
        <div class="am-art-stats">${_renderStatBar(stats, true)}</div>
      </div>
    `;
  }

  // ─── Listener ───
  function _attaccaListenerAnalisi() {
    const btnExp = document.getElementById('am-esporta-ia');
    if (btnExp) btnExp.addEventListener('click', _mostraExportIA);
    document.querySelectorAll('[data-am-periodo]').forEach(b => {
      b.addEventListener('click', () => {
        _ANALISI_FILTRI.periodo = b.dataset.amPeriodo;
        _amRenderTree();
      });
    });
    document.querySelectorAll('[data-am-origine]').forEach(b => {
      b.addEventListener('click', () => {
        _ANALISI_FILTRI.origine = b.dataset.amOrigine;
        _amRenderTree();
      });
    });
    document.querySelectorAll('.am-materia-head').forEach(h => {
      h.addEventListener('click', () => {
        const node = h.closest('.am-materia-node');
        const id   = node.dataset.amMateria;
        if (STATE.espansioniMaterie.has(id)) {
          STATE.espansioniMaterie.delete(id);
          node.classList.remove('expanded');
        } else {
          STATE.espansioniMaterie.add(id);
          node.classList.add('expanded');
        }
      });
    });
    document.querySelectorAll('.am-arg-head').forEach(h => {
      h.addEventListener('click', (e) => {
        e.stopPropagation();
        const node = h.closest('.am-arg-node');
        const id   = node.dataset.amArgomento;
        if (STATE.espansioniArgomenti.has(id)) {
          STATE.espansioniArgomenti.delete(id);
          node.classList.remove('expanded');
        } else {
          STATE.espansioniArgomenti.add(id);
          node.classList.add('expanded');
        }
      });
    });
    document.querySelectorAll('.am-legge-head').forEach(h => {
      h.addEventListener('click', (e) => {
        e.stopPropagation();
        const node = h.closest('.am-legge-block');
        const key  = node.dataset.amLegge;
        if (_ANALISI_ESP_LEGGI.has(key)) {
          _ANALISI_ESP_LEGGI.delete(key);
          node.classList.remove('expanded');
        } else {
          _ANALISI_ESP_LEGGI.add(key);
          node.classList.add('expanded');
        }
      });
    });
  }

  // ─── Invalida cache catalogo quando il pacchetto cambia ───
  // (chiamato esternamente da pacchetto.js dopo importazione)
  function _invalidaCacheAnalisi() {
    STATE._analisiCatalogo = null;
  }

  // ═══════════════════════════════════════════════════════
  // EXPORT QUIZ "ALTRO" PER CATEGORIZZAZIONE IA
  // Costruisce un JSON con programma compatto + quiz finiti nei nodi "Altro",
  // da passare a un'IA insieme a un prompt strutturato per ottenere
  // argomento/sotto-argomento/articolo proposti per ciascun quiz.
  // ═══════════════════════════════════════════════════════

  function _costruisciExportPayload(catalogo) {
    if (!STATE.pacchetto) return { payload: null, stats: null };

    // Programma compatto (solo info utili all'IA per non gonfiare il file)
    const programma = {};
    for (const m of (STATE.pacchetto.programma.materie || [])) {
      programma[m.id] = {
        nome: m.nome,
        peso: m.peso,
        argomenti: (m.argomenti || []).map(a => ({
          id: a.id,
          nome: a.nome,
          peso: a.peso,
          leggi: (a.leggi || []).map(l => ({
            nome: l.nome,
            sotto_argomenti: (l.sotto_argomenti || []).map(s => ({
              nome: s.nome,
              peso: s.peso,
              articoli: (s.articoli || []).map(art =>
                typeof art === 'string' ? art : { numero: art.numero, titolo: art.titolo || '' }
              )
            }))
          }))
        }))
      };
    }

    // Quiz "Altro" = quelli finiti nel nodo virtuale (senza argomento_id)
    // + quelli orfani (con argomento ma senza articolo) per la categorizzazione fine.
    // Per evitare di esportare quiz già auto-categorizzati, filtro quelli ancora in quizSenzaArgomento.
    const quiz_senza_argomento  = [];
    const quiz_senza_articolo   = [];

    for (const m of STATE.pacchetto.manifest.moduli) {
      const banca = STATE.pacchetto.banche[m.materia_id];
      if (!banca) continue;
      const arr = banca.categorizzati || banca.quiz || [];

      const setSenzaArg = catalogo.quizSenzaArgomento[m.materia_id] || new Set();

      // Costruisco un set degli argomenti di questa materia per filtrare quizSenzaArticolo
      const argomentiMateria = new Set();
      const programmaMat = (STATE.pacchetto.programma.materie || []).find(pm => pm.id === m.materia_id);
      if (programmaMat) for (const a of (programmaMat.argomenti || [])) argomentiMateria.add(a.id);

      for (const q of arr) {
        const id   = quizId(q);
        const cz   = q.categorizzazione || {};
        const argId = cz.argomento_id || null;
        const isSenzaArg = setSenzaArg.has(id);
        const isOrfanoArticolo = argId && argomentiMateria.has(argId)
          && !cz.articolo
          && (catalogo.quizSenzaArticolo[argId] && catalogo.quizSenzaArticolo[argId].has(id));

        if (!isSenzaArg && !isOrfanoArticolo) continue;

        const obj = {
          quiz_id: id,
          materia_id: m.materia_id,
          materia_nome: m.nome,
          argomento_id_attuale: argId,  // null se senza, oppure presente ma senza articolo
          domanda: (q.domanda || '').trim(),
          opzioni: q.opzioni || [],
          risposta_corretta: q.corretta || null,
        };

        if (isSenzaArg) quiz_senza_argomento.push(obj);
        else            quiz_senza_articolo.push(obj);
      }
    }

    const totaleQuiz = quiz_senza_argomento.length + quiz_senza_articolo.length;
    const materiePerQuiz = {};
    for (const q of quiz_senza_argomento.concat(quiz_senza_articolo)) {
      materiePerQuiz[q.materia_id] = (materiePerQuiz[q.materia_id] || 0) + 1;
    }

    return {
      payload: {
        metadata: {
          data_export: new Date().toISOString(),
          totale_quiz: totaleQuiz,
          n_quiz_senza_argomento: quiz_senza_argomento.length,
          n_quiz_senza_articolo: quiz_senza_articolo.length,
          n_materie: Object.keys(programma).length,
          fonte: 'concorso_manager v0.6.4 modulare',
        },
        programma_corrente: programma,
        quiz_senza_argomento,
        quiz_senza_articolo,
      },
      stats: {
        totaleQuiz,
        nSenzaArg: quiz_senza_argomento.length,
        nSenzaArt: quiz_senza_articolo.length,
        materie: Object.keys(programma).length,
        materiePerQuiz,
      }
    };
  }

  function _scaricaExportIA() {
    const catalogo = _precomputaCatalogoAnalisi();
    const { payload, stats } = _costruisciExportPayload(catalogo);
    if (!payload || stats.totaleQuiz === 0) {
      toast('Nessun quiz "Altro" da esportare 🎉', false);
      return;
    }
    const json  = JSON.stringify(payload, null, 2);
    const blob  = new Blob([json], { type: 'application/json' });
    const url   = URL.createObjectURL(blob);
    const oggi  = new Date().toISOString().substring(0, 10);
    const a     = document.createElement('a');
    a.href      = url;
    a.download  = `quiz_altro_da_categorizzare_${oggi}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast(`File scaricato: ${stats.totaleQuiz.toLocaleString('it-IT')} quiz`);
  }

  function _promptIA() {
    return `Sei un assistente esperto di normativa italiana per concorsi pubblici (RIPAM Assistenti 2026). Devi categorizzare quiz finora non assegnati a un argomento/articolo specifico, all'interno della struttura del programma di studio fornito.

INPUT (file JSON allegato):
- "programma_corrente": albero materie → argomenti → leggi → sotto_argomenti → articoli già definiti.
- "quiz_senza_argomento": quiz dove conosciamo solo la materia (manca argomento_id). Hai libertà piena di proporre argomento + sotto-arg + articolo.
- "quiz_senza_articolo": quiz dove conosciamo materia + argomento ma manca l'articolo specifico. Devi solo determinare legge + sotto-argomento + articolo dentro l'argomento già fissato.

OBIETTIVO PER OGNI QUIZ:
1. Usa SEMPRE un argomento ESISTENTE della stessa materia se il quiz vi rientra per tema (anche affinità). NON spostare il quiz su altra materia.
2. Se nessun argomento esistente è davvero adatto, proponi un NUOVO argomento per quella materia con id "AXX_nome_breve" (XX = numero progressivo subito dopo l'ultimo argomento esistente di quella materia).
3. Sotto-argomento e legge: identifica quella citata dal testo del quiz. Se non c'è una legge esplicita, usa il nome più descrittivo possibile o "Generale".
4. Articolo: ESTRAI dal testo del quiz se cita "art. N" o "articolo N" di una specifica legge. Altrimenti null. NON inventare numeri.
5. "confidence": 0-100, quanto sei sicuro della categorizzazione.

REGOLE FERREE:
- Mantieni "quiz_id" e "materia_id" IDENTICI all'input. Non li modificare mai.
- Per i quiz in "quiz_senza_articolo" l'argomento_id attuale è già corretto: completa solo legge/sotto-arg/articolo.
- Output JSON PURO. Nessun markdown, nessun preambolo, nessun commento.
- Se un quiz è veramente impossibile da categorizzare (testo troppo generico), confidence ≤ 20 e usa sotto_argomento_nome "Altro".

FORMATO OUTPUT ESATTO:
{
  "categorizzazioni": [
    {
      "quiz_id": "<identico all'input>",
      "materia_id": "<identico all'input>",
      "argomento_id": "<esistente o nuovo>",
      "argomento_nome": "<nome leggibile>",
      "argomento_nuovo": false,
      "legge_nome": "<es. Legge 7 agosto 1990, n. 241>",
      "sotto_argomento_nome": "<nome leggibile>",
      "sotto_argomento_nuovo": false,
      "articolo": "<numero come stringa, es. '22-bis'> oppure null",
      "confidence": 85
    }
  ],
  "nuovi_argomenti_proposti": [
    {
      "materia_id": "M01_diritto_amministrativo",
      "id": "A05_nome_breve",
      "nome": "Nome leggibile",
      "peso": 6,
      "leggi": [
        {
          "nome": "Nome legge",
          "sotto_argomenti": [
            { "nome": "Nome sotto-arg", "peso": 5, "articoli": ["1","2","5-bis"] }
          ]
        }
      ]
    }
  ]
}

Procedi ora con la categorizzazione di tutti i quiz forniti.`;
  }

  function _mostraExportIA() {
    const catalogo = _precomputaCatalogoAnalisi();
    const { stats } = _costruisciExportPayload(catalogo);

    if (stats.totaleQuiz === 0) {
      toast('Nessun quiz "Altro" da esportare 🎉');
      return;
    }

    const distribuzione = Object.entries(stats.materiePerQuiz)
      .sort((a, b) => b[1] - a[1])
      .map(([mat, n]) => `<li><code>${escapeHTML(mat)}</code> · <strong>${n.toLocaleString('it-IT')}</strong> quiz</li>`)
      .join('');

    const promptText = _promptIA();
    const promptEsc  = escapeHTML(promptText);

    const html = `
      <div class="export-ia-content">
        <p>
          Pronti a esportare <strong>${stats.totaleQuiz.toLocaleString('it-IT')}</strong> quiz
          (${stats.nSenzaArg.toLocaleString('it-IT')} senza argomento + ${stats.nSenzaArt.toLocaleString('it-IT')} senza articolo specifico)
          attualmente nei nodi "Altro", su ${stats.materie} materie.
        </p>
        <details>
          <summary>Distribuzione per materia</summary>
          <ul>${distribuzione}</ul>
        </details>

        <div class="exp-step">
          <div class="exp-step-h">📥 Passo 1 — Scarica il file</div>
          <p class="exp-desc">Contiene il programma corrente + tutti i quiz "Altro" con testo, opzioni e risposta corretta.</p>
          <button class="btn btn-primary" onclick="window._scaricaExportIA(); return false;">⬇ Scarica JSON</button>
        </div>

        <div class="exp-step">
          <div class="exp-step-h">📋 Passo 2 — Copia il prompt per l'IA</div>
          <p class="exp-desc">Incolla questo prompt in una chat con un'IA capace di leggere file JSON.</p>
          <textarea readonly id="exp-prompt-text" class="exp-textarea" rows="8">${promptEsc}</textarea>
          <button class="btn" onclick="(function(){var t=document.getElementById('exp-prompt-text');t.select();navigator.clipboard.writeText(t.value).then(function(){window.toast&&window.toast('Prompt copiato negli appunti ✓');},function(){window.toast&&window.toast('Copia manuale: il testo è già selezionato',true);});})(); return false;">📋 Copia prompt</button>
        </div>

        <div class="exp-step">
          <div class="exp-step-h">🤖 Passo 3 — Dai entrambi all'IA</div>
          <p class="exp-desc">
            In una chat con Claude / ChatGPT (con upload file abilitato): incolla il prompt e allega il file JSON.
            Riceverai un nuovo JSON con le categorizzazioni proposte. Salvalo e portalo qui
            per l'integrazione nel codice (nuovi argomenti, sotto-argomenti, articoli e ri-assegnazioni).
          </p>
        </div>
      </div>
    `;

    showModal('Esporta quiz "Altro" per categorizzazione IA', html, () => {}, 'Chiudi');
  }
