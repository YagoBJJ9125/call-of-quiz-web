  // ═══════════════════════════════════════════════════════
  // ADMIN PANEL — editor visuale del catalogo bandi (SOLO Tauri dev)
  //
  // Legge/scrive DIRETTAMENTE i JSON sorgente del progetto (bandi_catalogo.json,
  // manifest.json, programma_studio.json, banche_dati_categorizzate/*.json) via
  // i comandi Rust admin_leggi_file/admin_scrivi_file (src-tauri/src/lib.rs),
  // gated cfg!(debug_assertions) lato Rust — su un .exe installato da un utente
  // normale i comandi rispondono con errore, zero scritture, indipendentemente
  // da questa UI.
  //
  // NON sostituisce la pipeline di pubblicazione: dopo aver editato qui, va
  // comunque lanciato a mano node scripts/genera-bundle.js + valida-bando.js +
  // commit/push/deploy (promemoria mostrato in fondo alla pagina).
  //
  // Fuori da Tauri dev (web, PWA, .exe installato): window.AdminPanel.enabled
  // resta false, nessuna sezione in Impostazioni, nessun cambiamento visibile.
  // ═══════════════════════════════════════════════════════

  (function () {
    'use strict';

    window.AdminPanel = { enabled: false };

    if (!(window.__TAURI__ && window.__TAURI__.core)) return;   // web/PWA: fuori subito
    const invoke = window.__TAURI__.core.invoke;

    invoke('admin_disponibile').then(ok => {
      if (ok) window.AdminPanel.enabled = true;   // vero solo su build debug (tauri dev)
    }).catch(() => {});

    // ─── Helpers ─────────────────────────────────────────────────────────
    function _esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function _slug(s) {
      return String(s || '').trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    }

    async function _leggiJSON(nomeFile, fallback) {
      const txt = await invoke('admin_leggi_file', { nomeFile });
      if (txt == null) return fallback;
      try { return JSON.parse(txt); } catch (e) { console.error('[admin] JSON invalido', nomeFile, e); return fallback; }
    }
    async function _scriviJSON(nomeFile, obj) {
      await invoke('admin_scrivi_file', { nomeFile, content: JSON.stringify(obj, null, 1) });
    }

    // Stesso schema di normalizzaQuiz in scripts/integra-nuove-banche.js, ma
    // senza argomento_id (import grezzo dal pannello: nessuna categorizzazione
    // automatica — resta un "Altro senza argomento", già gestito ovunque).
    function _normalizzaQuiz(q, materiaId) {
      return {
        materia: q.materia,
        domanda: q.domanda,
        opzioni: q.opzioni,
        corretta: q.corretta,
        errata: q.errata || null,
        categorizzazione: { materia_id: materiaId, argomento_id: null, articolo: null },
      };
    }

    async function _scriviTesto(nomeFile, testo) {
      await invoke('admin_scrivi_file', { nomeFile, content: testo });
    }
    async function _eliminaFile(nomeFile) {
      await invoke('admin_elimina_file', { nomeFile });
    }
    function _pathCategorizzato(mid) { return 'banche_dati_categorizzate/' + mid + '_categorizzato.json'; }
    function _pathGrezzo(bandoId, mid) { return 'banche_dati/' + bandoId + '/' + mid + '.json'; }

    // ─── Stato di lavoro (ricaricato ad ogni ingresso in pagina) ──────────
    let _catalogo = null;    // { bandi: [...] }
    let _manifest = null;    // { bando:{...}, moduli:[...] }
    let _programma = null;   // { bando:{...}, materie:[...] }
    let _bandoSelId = null;
    let _busy = false;

    function _materiaInManifest(mid) {
      return (_manifest.moduli || []).find(m => m.materia_id === mid) || null;
    }
    function _materiaInProgramma(mid) {
      return (_programma.materie || []).find(m => m.id === mid) || null;
    }

    async function _caricaTutto() {
      _catalogo  = await _leggiJSON('bandi_catalogo.json', { bandi: [] });
      _manifest  = await _leggiJSON('manifest.json', { bando: {}, moduli: [] });
      _programma = await _leggiJSON('programma_studio.json', { bando: {}, materie: [] });
      if (!Array.isArray(_catalogo.bandi)) _catalogo.bandi = [];
    }

    // ─── Pagina: lista bandi ────────────────────────────────────────────
    async function renderPaginaAdmin() {
      const main = document.getElementById('main');
      if (!main) return;
      main.innerHTML = '<div class="page-header"><h1 class="page-title">🛠 Pannello Bandi</h1><p class="page-subtitle">Caricamento…</p></div>';
      await _caricaTutto();
      _bandoSelId = null;
      _renderLista();
    }

    function _renderLista() {
      const main = document.getElementById('main');
      main.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">🛠 Pannello Bandi</h1>
          <p class="page-subtitle">Editor del catalogo bandi — scrive direttamente i file del progetto. Dopo ogni pubblicazione: rigenera il bundle e pubblica come sempre (vedi promemoria in fondo).</p>
        </div>
        <div class="piani-toolbar">
          <button class="btn btn-primary" id="adminNuovoBando">＋ Nuovo bando</button>
          <span class="piani-count">${_catalogo.bandi.length} bandi</span>
        </div>
        <div class="piani-grid">
          ${_catalogo.bandi.map(_renderCardBando).join('') || '<p class="wiz-rank-none">Nessun bando ancora. Crea il primo.</p>'}
        </div>
        ${_renderPromemoria()}
      `;
      document.getElementById('adminNuovoBando').addEventListener('click', _apriFormNuovoBando);
      main.querySelectorAll('.admin-bando-card').forEach(card => {
        card.addEventListener('click', () => { _bandoSelId = card.dataset.id; _renderDettaglio(); });
      });
    }

    function _renderCardBando(b) {
      const pronto = b.stato !== 'bozza';
      const nMat = (b.piano && b.piano.materieIds || []).length;
      return `
        <div class="save-card admin-bando-card" data-id="${_esc(b.id)}">
          <div class="save-card-h">
            <div class="save-card-titolo">${_esc(b.nome)} ${pronto ? '<span class="save-card-pill">pronto</span>' : '<span class="save-card-pill" style="background:var(--neon-violet,#A06BFF)">bozza</span>'}</div>
          </div>
          <div class="save-card-stats"><div class="save-card-stat"><strong>${nMat}</strong> materie</div></div>
        </div>
      `;
    }

    function _renderPromemoria() {
      return `
        <div class="wiz-hint" style="margin-top:20px;">
          📋 Dopo ogni modifica qui: <code>node scripts/genera-bundle.js</code> → <code>node scripts/valida-bando.js</code> → commit → push → deploy. Il pannello scrive i JSON sorgente, non il bundle distribuito.
        </div>
      `;
    }

    // ─── Nuovo bando: materie + batteria allegata riga per riga ──────────
    function _apriFormNuovoBando() {
      const main = document.getElementById('main');
      const righe = [{ nome: '', file: null }];   // { nome, file:File|null }

      function render() {
        main.innerHTML = `
          <div class="page-header">
            <h1 class="page-title">＋ Nuovo bando</h1>
            <p class="page-subtitle">Scrivi le materie del bando e allega subito la rispettiva batteria (JSON scaricato). Puoi lasciarne alcune senza file e importarle dopo dal dettaglio.</p>
          </div>
          <div class="wiz-section">
            <label class="wiz-label">Nome del bando</label>
            <input type="text" class="wiz-input" id="adNome" placeholder="Es. Ministero della Difesa — Bando 1.100">
          </div>
          <div class="wiz-section">
            <label class="wiz-label">Ente / descrizione (opzionale)</label>
            <input type="text" class="wiz-input" id="adEnte" placeholder="Ente">
            <input type="text" class="wiz-input" id="adDescr" placeholder="Descrizione" style="margin-top:8px;">
          </div>
          <div class="wiz-section">
            <label class="wiz-label">Materie del bando</label>
            <div class="wiz-rows" style="max-height:none;overflow:visible;">
              ${righe.map((r, i) => `
                <div class="wiz-row" style="flex-wrap:wrap;">
                  <input type="text" class="wiz-input" data-riga-nome="${i}" value="${_esc(r.nome)}" placeholder="Nome materia (es. Diritto Amministrativo)" style="flex:1;min-width:220px;">
                  <label class="btn btn-ghost btn-sm" style="cursor:pointer;">
                    ${r.file ? '📄 ' + _esc(r.file.name) : '📁 Allega batteria (opzionale)'}
                    <input type="file" accept=".json,application/json" data-riga-file="${i}" style="display:none;">
                  </label>
                  ${righe.length > 1 ? `<button class="btn btn-ghost btn-sm" data-riga-rimuovi="${i}">🗑</button>` : ''}
                </div>
              `).join('')}
            </div>
            <button class="btn btn-ghost btn-sm" id="adRigaAggiungi" style="margin-top:8px;">＋ Aggiungi un'altra materia</button>
          </div>
          <div class="wiz-actions">
            <button class="btn btn-ghost" id="adAnnulla">Annulla</button>
            <button class="btn btn-primary" id="adCrea">Crea bando</button>
          </div>
        `;
        main.querySelectorAll('input[data-riga-nome]').forEach(inp => {
          inp.addEventListener('input', () => { righe[+inp.dataset.rigaNome].nome = inp.value; });
        });
        main.querySelectorAll('input[data-riga-file]').forEach(inp => {
          inp.addEventListener('change', () => {
            righe[+inp.dataset.rigaFile].file = inp.files && inp.files[0] || null;
            render();
          });
        });
        main.querySelectorAll('button[data-riga-rimuovi]').forEach(btn => {
          btn.addEventListener('click', () => { righe.splice(+btn.dataset.rigaRimuovi, 1); render(); });
        });
        document.getElementById('adRigaAggiungi').addEventListener('click', () => { righe.push({ nome: '', file: null }); render(); });
        document.getElementById('adAnnulla').addEventListener('click', _renderLista);
        document.getElementById('adCrea').addEventListener('click', () => _confermaNuovoBando(righe));
      }
      render();
    }

    async function _confermaNuovoBando(righe) {
      const nome = (document.getElementById('adNome').value || '').trim();
      if (!nome) { toast('Dai un nome al bando', true); return; }
      const valide = righe.filter(r => r.nome.trim());
      if (valide.length === 0) { toast('Aggiungi almeno una materia', true); return; }
      const id = _slug(nome).toUpperCase();
      if (_catalogo.bandi.some(b => b.id === id)) { toast('Esiste già un bando con questo id', true); return; }

      const materieIds = [];
      let toccatoProgramma = false;
      for (const r of valide) {
        const mid = 'M_' + _slug(r.nome);
        materieIds.push(mid);
        if (!_materiaInProgramma(mid)) {
          _programma.materie.push({ id: mid, nome: r.nome.trim(), peso: 5, tipologia: 'bando_esclusiva', bandi: [], note: 'Creata dal pannello admin per il bando "' + nome + '".', argomenti: [] });
          toccatoProgramma = true;
        }
      }
      const nuovo = {
        id, nome,
        ente: (document.getElementById('adEnte').value || '').trim() || undefined,
        descrizione: (document.getElementById('adDescr').value || '').trim() || undefined,
        stato: 'bozza',
        piano: { materieIds },
      };

      _busy = true;
      try {
        if (toccatoProgramma) await _scriviJSON('programma_studio.json', _programma);
        _catalogo.bandi.push(nuovo);
        await _scriviJSON('bandi_catalogo.json', _catalogo);
        _bandoSelId = id;

        // Importa subito le batterie allegate riga per riga.
        for (const r of valide) {
          if (!r.file) continue;
          const mid = 'M_' + _slug(r.nome);
          await _processaImport(nuovo, mid, r.file);
        }
        toast('Bando creato: ' + nome);
        _renderDettaglio();
      } catch (e) {
        toast('Errore: ' + e, true);
      } finally { _busy = false; }
    }

    // ─── Dettaglio bando: materie richieste, import, composizione, pubblica ──
    function _renderDettaglio() {
      const bando = _catalogo.bandi.find(b => b.id === _bandoSelId);
      if (!bando) { _renderLista(); return; }
      const materieIds = (bando.piano && bando.piano.materieIds) || [];
      const tutteComplete = materieIds.length > 0 && materieIds.every(mid => {
        const m = _materiaInManifest(mid);
        return m && m.n_quiz > 0;
      });

      const main = document.getElementById('main');
      main.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">${bando.stato === 'bozza' ? '🟡' : '🟢'} ${_esc(bando.nome)}</h1>
          <p class="page-subtitle">${_esc(bando.descrizione || '')}</p>
        </div>
        <button class="btn btn-ghost" id="adIndietro">← Tutti i bandi</button>

        <div class="wiz-section" style="margin-top:16px;">
          <label class="wiz-label">Materie richieste — stato banca quiz</label>
          <div class="wiz-rows wiz-rows-hier" style="max-height:none;overflow:visible;">
            ${materieIds.map(mid => _renderRigaMateria(mid)).join('')}
          </div>
          <div class="settings-actions" style="margin-top:10px;">
            <input type="text" class="wiz-input" id="adNuovaMateriaDett" placeholder="Aggiungi un'altra materia al bando…" style="flex:1;">
            <button class="btn btn-ghost btn-sm" id="adNuovaMateriaDettBtn">＋ Aggiungi materia</button>
          </div>
        </div>

        ${tutteComplete ? _renderComposizione(bando) : `
          <div class="wiz-hint">⚠ Importa la banca quiz per tutte le materie richieste per sbloccare proporzioni e pubblicazione.</div>
        `}

        ${_renderPromemoria()}
      `;
      document.getElementById('adIndietro').addEventListener('click', _renderLista);
      main.querySelectorAll('input[type=file][data-import-mid]').forEach(inp => {
        inp.addEventListener('change', (e) => _gestisciImport(e, inp.dataset.importMid, bando));
      });
      main.querySelectorAll('button[data-rimuovi-mid]').forEach(btn => {
        btn.addEventListener('click', () => _gestisciRimozione(btn.dataset.rimuoviMid, bando));
      });
      document.getElementById('adNuovaMateriaDettBtn').addEventListener('click', () => _aggiungiMateriaADettaglio(bando));
      if (tutteComplete) _wireComposizione(bando);
    }

    async function _aggiungiMateriaADettaglio(bando) {
      const inp = document.getElementById('adNuovaMateriaDett');
      const nome = (inp.value || '').trim();
      if (!nome) return;
      const mid = 'M_' + _slug(nome);
      if (bando.piano.materieIds.includes(mid)) { toast('Materia già nel bando', true); return; }
      _busy = true;
      try {
        if (!_materiaInProgramma(mid)) {
          _programma.materie.push({ id: mid, nome, peso: 5, tipologia: 'bando_esclusiva', bandi: [], note: 'Creata dal pannello admin per il bando "' + bando.nome + '".', argomenti: [] });
          await _scriviJSON('programma_studio.json', _programma);
        }
        bando.piano.materieIds.push(mid);
        await _scriviJSON('bandi_catalogo.json', _catalogo);
        _renderDettaglio();
      } catch (e) {
        toast('Errore: ' + e, true);
      } finally { _busy = false; }
    }

    function _renderRigaMateria(mid) {
      const inProgramma = _materiaInProgramma(mid);
      const inManifest = _materiaInManifest(mid);
      const nome = (inProgramma && inProgramma.nome) || mid;
      const pronta = inManifest && inManifest.n_quiz > 0;
      return `
        <div class="wiz-row-block ${pronta ? 'sel' : ''}">
          <div class="wiz-row" style="flex-wrap:wrap;">
            <span>${pronta ? '✅' : '⬜'}</span>
            <span class="wiz-row-nome">${_esc(nome)}</span>
            <span class="wiz-row-meta">${pronta ? inManifest.n_quiz.toLocaleString('it-IT') + ' quiz' : 'nessuna banca'}</span>
            <label class="btn btn-ghost btn-sm" style="cursor:pointer;">
              ${pronta ? '🔄 Sostituisci' : '📥 Importa JSON'}
              <input type="file" accept=".json,application/json" data-import-mid="${_esc(mid)}" style="display:none;">
            </label>
            ${pronta ? `<button class="btn btn-ghost btn-sm" data-rimuovi-mid="${_esc(mid)}">🗑 Rimuovi</button>` : ''}
          </div>
        </div>
      `;
    }

    // Import/sostituzione: normalizza, scrive l'archivio grezzo (banche_dati/<bando>/<mid>.json,
    // così come scaricato — utile per distinguere batterie diverse per la stessa
    // materia tra bandi, es. 3000 quiz RIPAM vs 250 Comune di Bari) e la banca
    // categorizzata usata dall'app (banche_dati_categorizzate/<mid>_categorizzato.json).
    async function _processaImport(bando, materiaId, file) {
      const txt = await file.text();
      const data = JSON.parse(txt);
      if (!Array.isArray(data) || data.length === 0 || !data[0].domanda) {
        throw new Error('File non riconosciuto: attesa una lista di quiz {materia,domanda,opzioni,corretta}');
      }
      await _scriviTesto(_pathGrezzo(bando.id, materiaId), txt);   // copia grezza, invariata

      const normalizzati = data.map(q => _normalizzaQuiz(q, materiaId));
      await _scriviJSON(_pathCategorizzato(materiaId), normalizzati);

      let mod = _materiaInManifest(materiaId);
      if (!mod) {
        const nome = (_materiaInProgramma(materiaId) || {}).nome || materiaId;
        mod = { materia_id: materiaId, nome, file_categorizzato: _pathCategorizzato(materiaId), n_quiz: 0, distribuzione_argomenti: {} };
        _manifest.moduli.push(mod);
      }
      mod.n_quiz = normalizzati.length;
      await _scriviJSON('manifest.json', _manifest);
      return normalizzati.length;
    }

    async function _gestisciImport(ev, materiaId, bando) {
      const f = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (!f || _busy) return;
      _busy = true;
      try {
        const n = await _processaImport(bando, materiaId, f);
        toast(`Importati ${n} quiz per ${materiaId}`);
        _renderDettaglio();
      } catch (e) {
        toast('Errore import: ' + (e.message || e), true);
      } finally { _busy = false; }
    }

    // Rimuove la banca di una materia (grezza + categorizzata), la riporta a
    // "nessuna banca" pronta per un nuovo import. Se il bando era pubblicato e
    // resta senza tutte le materie complete, torna in bozza (non ha senso
    // restare "pronto" con un buco) — nessuna cancellazione di dati per gli
    // utenti già in corso: il bundle distribuito cambia solo al prossimo deploy.
    async function _gestisciRimozione(materiaId, bando) {
      if (_busy) return;
      if (!confirm('Rimuovere la banca quiz di questa materia? Puoi reimportarla in qualsiasi momento.')) return;
      _busy = true;
      try {
        await _eliminaFile(_pathCategorizzato(materiaId));
        await _eliminaFile(_pathGrezzo(bando.id, materiaId));
        _manifest.moduli = (_manifest.moduli || []).filter(m => m.materia_id !== materiaId);
        await _scriviJSON('manifest.json', _manifest);

        if (bando.stato !== 'bozza') {
          bando.stato = 'bozza';
          await _scriviJSON('bandi_catalogo.json', _catalogo);
          toast('Banca rimossa — bando tornato in bozza (materia incompleta)');
        } else {
          toast('Banca rimossa');
        }
        _renderDettaglio();
      } catch (e) {
        toast('Errore: ' + e, true);
      } finally { _busy = false; }
    }

    // ─── Composizione (proporzioni) + pubblicazione ────────────────────
    function _renderComposizione(bando) {
      const materieIds = bando.piano.materieIds;
      const comp = Object.assign({}, bando.piano.composizione || {});
      const somma = Object.values(comp).reduce((s, v) => s + (v || 0), 0);
      return `
        <div class="wiz-section" id="adCompSezione">
          <label class="wiz-label">Proporzioni per materia (composizione batteria) <span class="wiz-counter" id="adCompSomma">somma ${somma}%</span></label>
          <div class="wiz-hint">Percentuale esatta di quiz per materia in ogni round/batteria. Visibili e modificabili anche dagli utenti dopo la pubblicazione.</div>
          <div class="sim-calib">
            ${materieIds.map(mid => {
              const nome = (_materiaInProgramma(mid) || {}).nome || mid;
              return `
                <div class="sim-calib-row">
                  <span class="sim-calib-nome">${_esc(nome)}</span>
                  <input type="number" class="sim-calib-input" data-comp-mid="${_esc(mid)}" value="${comp[mid] || 0}" min="0" max="100" step="0.5">
                </div>`;
            }).join('')}
          </div>
        </div>
        <div class="wiz-actions">
          <button class="btn btn-primary" id="adPubblica">${bando.stato === 'bozza' ? '✅ Pubblica bando' : '💾 Salva modifiche'}</button>
        </div>
      `;
    }

    function _wireComposizione(bando) {
      const inputs = [...document.querySelectorAll('input[data-comp-mid]')];
      const sommaEl = document.getElementById('adCompSomma');
      function aggiornaSomma() {
        const s = inputs.reduce((acc, i) => acc + (parseFloat(i.value) || 0), 0);
        sommaEl.textContent = 'somma ' + s + '%';
        sommaEl.className = 'wiz-counter' + (Math.abs(s - 100) > 5 ? '' : '');
      }
      inputs.forEach(i => i.addEventListener('input', aggiornaSomma));
      document.getElementById('adPubblica').addEventListener('click', async () => {
        const comp = {};
        inputs.forEach(i => { const v = parseFloat(i.value) || 0; if (v > 0) comp[i.dataset.compMid] = v; });
        bando.piano.composizione = comp;
        bando.stato = 'pronto';
        _busy = true;
        try {
          await _scriviJSON('bandi_catalogo.json', _catalogo);
          toast('Bando pubblicato: ' + bando.nome);
          _renderDettaglio();
        } catch (e) {
          toast('Errore: ' + e, true);
        } finally { _busy = false; }
      });
    }

    // ─── Navigazione: pagina 'admin-bandi' ─────────────────────────────
    function _installaNavigaPatch() {
      const orig = window.navigaA;
      if (typeof orig !== 'function') { console.warn('[admin-panel] navigaA non disponibile'); return; }
      if (orig._patchedByAdminPanel) return;
      const wrapped = function (page) {
        if (page === 'admin-bandi') {
          STATE.pageCorrente = 'admin-bandi';
          renderPaginaAdmin();
          if (typeof applicaAspetto === 'function') applicaAspetto();
          return;
        }
        return orig(page);
      };
      wrapped._patchedByAdminPanel = true;
      window.navigaA = wrapped;
    }

    function apriPannello() {
      if (typeof closeModal === 'function') closeModal();
      if (typeof navigaA === 'function') navigaA('admin-bandi');
    }

    window.AdminPanel.apriPannello = apriPannello;
    window.AdminPanel._init = _installaNavigaPatch;   // chiamato da app.js dopo init(), come SavesUI
  })();
