  // ═══════════════════════════════════════════════════════
  // SAVES-UI — Multi-save manager (Fase 2: interfaccia utente)
  //
  // Aggiunge:
  //   • chip "📁 [nome save] ▼" nella topbar (dropdown per switch rapido)
  //   • pagina "Piani & Partite" (CRUD: crea, rinomina, duplica, elimina)
  //   • wizard creazione save (nome + selezione materie + rank suggerito)
  //
  // In Fase 2 il *save attivo* è già usato implicitamente dal monkey-patch
  // di saves-core.js: cambiando save, tutto il diario/RP/missioni letti dal
  // codice esistente vengono auto-ricaricati dal namespace del nuovo save.
  // ═══════════════════════════════════════════════════════

  (function () {
    'use strict';

    // ─── Helpers ─────────────────────────────────────────────────────────

    function _esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _countQuizPerMateriaIds(materiaIds) {
      if (!STATE.pacchetto || !STATE.pacchetto.banche) return 0;
      let tot = 0;
      for (const id of materiaIds) {
        const b = STATE.pacchetto.banche[id];
        if (!b) continue;
        const arr = b.categorizzati || b.quiz || [];
        tot += arr.length;
      }
      return tot;
    }

    function _quizIdsDelPiano(materiaIds) {
      const ids = new Set();
      if (!STATE.pacchetto || !STATE.pacchetto.banche) return ids;
      for (const mid of materiaIds) {
        const b = STATE.pacchetto.banche[mid];
        if (!b) continue;
        const arr = b.categorizzati || b.quiz || [];
        for (const q of arr) ids.add(quizId(q));
      }
      return ids;
    }

    // ─── Calcolo rank iniziale suggerito ─────────────────────────────────
    // Mappa % padroneggiamento → sublevelIndice (vedi tabella concordata)
    function _calcolaRankSuggerito(materiaIds) {
      const idsPiano = _quizIdsDelPiano(materiaIds);
      const totale = idsPiano.size;
      if (totale === 0) return { totale: 0, padron: 0, perc: 0, sublevelIndice: 0, etichetta: 'Rame 4' };

      // Padroneggiamento globale: conta solo quiz con ≥3 giorni corretti
      const padron = (typeof carCaricaPadron === 'function') ? (carCaricaPadron() || {}) : {};
      let nPadron = 0;
      for (const id of idsPiano) {
        const p = padron[id];
        if (èPadroneggiato(p)) nPadron++;
      }
      const perc = nPadron / totale;

      // Mappa concordata
      let sub = 0;
      if      (perc < 0.10) sub = 0;                     // Rame 4
      else if (perc < 0.25) sub = Math.round(3 + (perc - 0.10) / 0.15 * 2);   // Rame 1 → Bronzo 3
      else if (perc < 0.45) sub = Math.round(8 + (perc - 0.25) / 0.20 * 2);   // Argento 4 → 2
      else if (perc < 0.65) sub = Math.round(12 + (perc - 0.45) / 0.20 * 2);  // Oro 4 → 2
      else if (perc < 0.80) sub = Math.round(16 + (perc - 0.65) / 0.15 * 2);  // Platino 4 → 2
      else if (perc < 0.95) sub = Math.round(20 + (perc - 0.80) / 0.15 * 2);  // Diamante 4 → 2
      else                  sub = 24;                                          // Maestro

      const desc = (typeof rankedDescriviLivello === 'function')
                   ? rankedDescriviLivello(sub)
                   : { etichetta: 'Rame 4' };
      return { totale, padron: nPadron, perc, sublevelIndice: sub, etichetta: desc.etichetta };
    }

    // ─── Switch save: protezione sessione attiva ─────────────────────────
    // opts.gotoPage: pagina da aprire dopo caricamento (default: pageCorrente).
    //   Card "Carica questo save" → passa 'ranked' per aprire direttamente la
    //   home Ranked. Dropdown switch → invariato (resta sulla pagina corrente).
    function cambiaSave(id, opts) {
      opts = opts || {};
      const corrente = SavesCore.getSaveAttivoId();
      if (corrente === id) {
        _chiudereDropdown();
        // Se l'utente clicca "Carica" sul save già attivo, lo portiamo
        // comunque alla pagina richiesta (es. Ranked dalla card).
        if (opts.gotoPage && typeof navigaA === 'function') {
          navigaA(opts.gotoPage);
        }
        return;
      }
      // Blocca lo switch se c'è una sessione quiz attiva
      if (typeof SESSIONE !== 'undefined' && SESSIONE && !SESSIONE.terminata) {
        toast('Termina o chiudi la sessione corrente prima di cambiare save', true);
        return;
      }
      if (!SavesCore.caricaSave(id)) {
        toast('Save non trovato', true);
        return;
      }
      _chiudereDropdown();
      const sv = SavesCore.getSaveAttivo();
      toast('Save caricato: ' + (sv ? sv.nome : id));
      aggiornaTopbarSaveChip();
      // Naviga alla pagina richiesta (default: pageCorrente)
      const pagina = opts.gotoPage || STATE.pageCorrente || 'dashboard';
      if (typeof navigaA === 'function') navigaA(pagina);
    }

    // ─── Topbar: chip save attivo ────────────────────────────────────────
    function aggiornaTopbarSaveChip() {
      const chip = document.getElementById('saveChip');
      if (!chip) return;
      const sv = SavesCore.getSaveAttivo();
      const nome = sv ? sv.nome : 'Nessun save';
      chip.innerHTML = `
        <span class="save-chip-ic">📁</span>
        <span class="save-chip-nome">${_esc(nome)}</span>
        <span class="save-chip-arrow">▾</span>
      `;
    }

    function _aprireDropdown() {
      _chiudereDropdown();
      const lista = SavesCore.getListaSaves();
      const attivoId = SavesCore.getSaveAttivoId();
      const drop = document.createElement('div');
      drop.id = 'saveDropdown';
      drop.className = 'save-dropdown';
      drop.innerHTML = `
        <div class="save-dropdown-h">Le tue partite</div>
        <div class="save-dropdown-list">
          ${lista.map(s => {
            const att = s.id === attivoId;
            const dt = s.dataUltimoUso ? new Date(s.dataUltimoUso).toLocaleDateString('it-IT') : '';
            const nMat = (s.piano && s.piano.materieIds || []).length;
            return `
              <div class="save-drop-item ${att ? 'active' : ''}" data-id="${_esc(s.id)}">
                <div class="save-drop-item-main">
                  <span class="save-drop-item-nome">${_esc(s.nome)}${att ? ' <span class="save-drop-pill">attivo</span>' : ''}</span>
                  <span class="save-drop-item-meta">${nMat} materie · ${dt}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <div class="save-dropdown-actions">
          <button class="btn btn-primary save-dropdown-btn" id="saveDropdownCrea">＋ Crea nuovo save</button>
          <button class="btn btn-ghost save-dropdown-btn" id="saveDropdownPiani">📋 Gestisci piani & partite</button>
        </div>
      `;
      document.body.appendChild(drop);

      // Posiziona sotto al chip
      const chip = document.getElementById('saveChip');
      if (chip) {
        const r = chip.getBoundingClientRect();
        drop.style.top   = (r.bottom + 6) + 'px';
        drop.style.right = (window.innerWidth - r.right) + 'px';
      }

      drop.querySelectorAll('.save-drop-item').forEach(el => {
        el.addEventListener('click', () => cambiaSave(el.dataset.id));
      });
      const bCrea = document.getElementById('saveDropdownCrea');
      if (bCrea) bCrea.addEventListener('click', () => { _chiudereDropdown(); apriWizardCreaSave(); });
      const bPiani = document.getElementById('saveDropdownPiani');
      if (bPiani) bPiani.addEventListener('click', () => { _chiudereDropdown(); navigaA('piani'); });

      // Click esterno → chiudi
      setTimeout(() => document.addEventListener('mousedown', _onClickFuori), 0);
    }
    function _chiudereDropdown() {
      const el = document.getElementById('saveDropdown');
      if (el) el.remove();
      document.removeEventListener('mousedown', _onClickFuori);
    }
    function _onClickFuori(e) {
      const drop = document.getElementById('saveDropdown');
      const chip = document.getElementById('saveChip');
      if (drop && !drop.contains(e.target) && chip && !chip.contains(e.target)) {
        _chiudereDropdown();
      }
    }

    function installaTopbarSaveChip() {
      if (document.getElementById('saveChip')) return;
      const right = document.querySelector('.topbar-right');
      if (!right) return;
      const chip = document.createElement('button');
      chip.id = 'saveChip';
      chip.className = 'save-chip';
      chip.title = 'Save attivo (clicca per cambiare)';
      chip.style.display = 'none';   // hidden by default — apparirà solo su Carriera/Ranked
      right.insertBefore(chip, right.firstChild);
      chip.addEventListener('click', () => {
        if (document.getElementById('saveDropdown')) _chiudereDropdown();
        else _aprireDropdown();
      });
      aggiornaTopbarSaveChip();
    }

    // Mostra/nasconde il chip in base alla pagina corrente.
    // Il concetto di "save attivo" è scoperto solo nelle modalità competitive:
    // Carriera e Ranked. Le altre pagine (Dashboard, Libero, Analisi, Moduli,
    // Piani & Partite) lo nascondono per non confondere — sono modalità
    // "globali" che non dipendono dal save corrente.
    const PAGINE_CON_CHIP_SAVE = new Set(['carriera', 'ranked']);
    function aggiornaVisibilitaChip(page) {
      const chip = document.getElementById('saveChip');
      if (!chip) return;
      chip.style.display = PAGINE_CON_CHIP_SAVE.has(page) ? '' : 'none';
    }

    // ─── Sidebar: voce "Piani & Partite" ─────────────────────────────────
    function installaSidebarPiani() {
      if (document.querySelector('.nav-item[data-page="piani"]')) return;
      // Cerco la section "Gioco" o ne creo una nuova "Save"
      const sidebar = document.querySelector('.sidebar');
      if (!sidebar) return;
      const section = document.createElement('div');
      section.className = 'nav-section';
      section.innerHTML = `
        <div class="nav-section-title">Save</div>
        <div class="nav-item" data-page="piani">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 5h7l2 2h9v12H3z"/>
            <path d="M8 13h8M8 17h5"/>
          </svg>
          Piani & Partite
        </div>
      `;
      sidebar.appendChild(section);
      section.querySelector('.nav-item').addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        section.querySelector('.nav-item').classList.add('active');
        STATE.pageCorrente = 'piani';
        navigaA('piani');
      });
    }

    // ─── Pagina: Piani & Partite ─────────────────────────────────────────
    function renderPianiPartite() {
      const main = document.getElementById('main');
      if (!main) return;
      const lista = SavesCore.getListaSaves();
      const attivoId = SavesCore.getSaveAttivoId();
      main.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">📋 Piani & Partite</h1>
          <p class="page-subtitle">Ogni save è una partita indipendente con il suo piano di studio, RP ranked, missioni e badge. Padroneggiamento e risposte sono globali — l'evoluzione di un save propaga su tutti gli altri che condividono le materie.</p>
        </div>

        <div class="piani-toolbar">
          <button class="btn btn-primary" id="btnNuovoSave">＋ Nuovo save</button>
          <button class="btn btn-ghost" id="btnImportaSave">📥 Importa save (JSON)</button>
          <span class="piani-count">${lista.length} save totali</span>
        </div>
        <input type="file" id="piImportInput" accept=".json,application/json" style="display:none">

        <div class="piani-hint">
          💡 <em>Esporta</em> un save per fare backup o spostarlo su un altro dispositivo. L'export contiene diario, RP, missioni e badge — il padroneggiamento globale resta nell'app perché è dell'utente, non del save.
        </div>

        <div class="piani-grid">
          ${lista.map(s => _renderSaveCard(s, s.id === attivoId)).join('')}
        </div>
      `;
      document.getElementById('btnNuovoSave').addEventListener('click', apriWizardCreaSave);
      const btnImp = document.getElementById('btnImportaSave');
      const inpImp = document.getElementById('piImportInput');
      if (btnImp && inpImp) {
        btnImp.addEventListener('click', () => inpImp.click());
        inpImp.addEventListener('change', _onImportFile);
      }
      main.querySelectorAll('.save-card').forEach(card => {
        const id = card.dataset.id;
        card.querySelector('.btn-carica')?.addEventListener('click', () => cambiaSave(id, { gotoPage: 'ranked' }));
        card.querySelector('.btn-mod-piano')?.addEventListener('click', () => apriWizardModificaSave(id));
        card.querySelector('.btn-rinomina')?.addEventListener('click', () => _azioneRinomina(id));
        card.querySelector('.btn-duplica')?.addEventListener('click', () => _azioneDuplica(id));
        card.querySelector('.btn-esporta')?.addEventListener('click', () => _azioneEsporta(id));
        card.querySelector('.btn-elimina')?.addEventListener('click', () => _azioneElimina(id));
      });
    }

    function _renderSaveCard(s, attivo) {
      const nMat = (s.piano && s.piano.materieIds || []).length;
      const nQuiz = _countQuizPerMateriaIds(s.piano?.materieIds || []);
      const dt = s.dataUltimoUso ? new Date(s.dataUltimoUso).toLocaleString('it-IT') : '—';
      const dc = s.dataCreazione ? new Date(s.dataCreazione).toLocaleDateString('it-IT') : '—';
      return `
        <div class="save-card ${attivo ? 'active' : ''}" data-id="${_esc(s.id)}">
          <div class="save-card-h">
            <div class="save-card-titolo">
              ${_esc(s.nome)}
              ${attivo ? '<span class="save-card-pill">in uso</span>' : ''}
            </div>
            <div class="save-card-meta">creato ${dc} · ultimo uso ${dt}</div>
          </div>
          ${s.descrizione ? `<div class="save-card-desc">${_esc(s.descrizione)}</div>` : ''}
          <div class="save-card-stats">
            <div class="save-card-stat"><strong>${nMat}</strong> materie</div>
            <div class="save-card-stat"><strong>${nQuiz.toLocaleString('it-IT')}</strong> quiz nel piano</div>
          </div>
          <div class="save-card-actions">
            ${attivo
              ? '<button class="btn btn-ghost" disabled>✓ Caricato</button>'
              : '<button class="btn btn-primary btn-carica">Carica questo save</button>'}
            <button class="btn btn-ghost btn-mod-piano" title="Modifica piano (materie e argomenti)">⚙ Piano</button>
            <button class="btn btn-ghost btn-rinomina" title="Rinomina">✎</button>
            <button class="btn btn-ghost btn-duplica" title="Duplica">⎘</button>
            <button class="btn btn-ghost btn-esporta" title="Esporta (JSON)">📤</button>
            <button class="btn btn-ghost btn-elimina" title="Elimina">🗑</button>
          </div>
        </div>
      `;
    }

    function _azioneEsporta(id) {
      const sv = SavesCore.getListaSaves().find(x => x.id === id);
      if (!sv) return;
      const payload = SavesCore.esportaSave(id);
      if (!payload) { toast('Export fallito', true); return; }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString().slice(0,10);
      const slug = (sv.nome || 'save').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      a.href = url;
      a.download = `cm-save-${slug}-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Save esportato');
    }

    function _onImportFile(ev) {
      const f = ev.target.files && ev.target.files[0];
      ev.target.value = '';   // permette di re-importare lo stesso file
      if (!f) return;
      const reader = new FileReader();
      reader.onerror = () => toast('Errore lettura file', true);
      reader.onload = () => {
        try {
          const payload = JSON.parse(reader.result);
          if (!payload || payload.format !== 'cm-save-export') {
            toast('File non riconosciuto come export di Call Of Quiz', true);
            return;
          }
          const suggerito = (payload.meta && payload.meta.nome) || 'Save importato';
          // Se esiste già un save con lo stesso nome, suggerisci (importato)
          const giaPresente = SavesCore.getListaSaves().some(s => s.nome === suggerito);
          const nuovoNome = prompt('Nome del save importato:', giaPresente ? (suggerito + ' (importato)') : suggerito);
          if (!nuovoNome || !nuovoNome.trim()) return;
          const sv = SavesCore.importaSave(payload, nuovoNome.trim());
          if (sv) {
            toast('Save importato: ' + sv.nome);
            renderPianiPartite();
          }
        } catch (e) {
          console.error('importa save:', e);
          toast('Errore: ' + (e.message || 'JSON non valido'), true);
        }
      };
      reader.readAsText(f);
    }

    function _azioneRinomina(id) {
      const s = SavesCore.getListaSaves().find(x => x.id === id);
      if (!s) return;
      const nuovo = prompt('Nuovo nome per il save:', s.nome);
      if (nuovo && nuovo.trim()) {
        SavesCore.rinominaSave(id, nuovo.trim());
        aggiornaTopbarSaveChip();
        renderPianiPartite();
        toast('Save rinominato');
      }
    }
    function _azioneDuplica(id) {
      const s = SavesCore.getListaSaves().find(x => x.id === id);
      if (!s) return;
      const nuovoNome = prompt('Nome del save duplicato:', s.nome + ' (copia)');
      if (!nuovoNome || !nuovoNome.trim()) return;
      SavesCore.duplicaSave(id, nuovoNome.trim());
      renderPianiPartite();
      toast('Save duplicato (vuoto: progressi non clonati)');
    }
    function _azioneElimina(id) {
      const s = SavesCore.getListaSaves().find(x => x.id === id);
      if (!s) return;
      const lista = SavesCore.getListaSaves();
      if (lista.length <= 1) {
        toast('Non puoi eliminare l\'ultimo save rimasto', true);
        return;
      }
      showModal(
        '🗑 Elimina save "' + s.nome + '"',
        `<p>Verranno eliminati <strong>per sempre</strong>:</p>
         <ul>
           <li>Diario delle risposte di questo save</li>
           <li>RP ranked, picco, streak, badge</li>
           <li>Stato missioni carriera</li>
         </ul>
         <p><strong>Restano salvi</strong>: padroneggiamento globale e progress generale (sono condivisi tra tutti i save).</p>
         <p>Vuoi davvero procedere?</p>`,
        () => {
          SavesCore.eliminaSave(id);
          aggiornaTopbarSaveChip();
          renderPianiPartite();
          toast('Save eliminato');
        },
        'Elimina definitivamente'
      );
    }

    // ─── Wizard: crea o MODIFICA save (Fase 7) ──────────────────────────
    // Opzioni:
    //   { editingSaveId?: string }
    //   Se editingSaveId è presente: modalità modifica (precompila, button
    //   "Salva modifiche", aggiorna piano del save esistente).
    function apriWizardCreaSave(opts) {
      opts = opts || {};
      const editingId  = opts.editingSaveId || null;
      const editing    = !!editingId;
      const returnPage = opts.returnPage || 'piani';  // pagina di ritorno dopo conferma

      if (!STATE.pacchetto || !STATE.pacchetto.manifest) {
        toast('Carica prima un pacchetto dati', true);
        return;
      }
      const moduli = STATE.pacchetto.manifest.moduli || [];
      const programma = STATE.pacchetto.programma || { materie: [] };

      // Mappa pesi/tipologie e argomenti per materia (lookup veloce)
      const argomentiPerMateria = {};   // mat.id → [{id, nome, peso}]
      const infoMateria = {};           // mat.id → {peso, tipologia, nome}
      for (const m of (programma.materie || [])) {
        infoMateria[m.id] = { peso: m.peso || 0, tipologia: m.tipologia || '', nome: m.nome || m.id };
        argomentiPerMateria[m.id] = (m.argomenti || []).map(a => ({ id: a.id, nome: a.nome, peso: a.peso || 0 }));
      }
      // Conta quiz per argomento (da banca categorizzata)
      const conteggioArgomento = {};    // 'M_id::A_id' → numero quiz
      const conteggioSenzaArg  = {};    // 'M_id' → numero quiz senza arg
      for (const m of moduli) {
        const banca = STATE.pacchetto.banche[m.materia_id];
        if (!banca) continue;
        const arr = banca.categorizzati || banca.quiz || [];
        for (const q of arr) {
          const argId = q.categorizzazione && q.categorizzazione.argomento_id;
          if (argId) {
            const k = m.materia_id + '::' + argId;
            conteggioArgomento[k] = (conteggioArgomento[k] || 0) + 1;
          } else {
            conteggioSenzaArg[m.materia_id] = (conteggioSenzaArg[m.materia_id] || 0) + 1;
          }
        }
      }

      // Stato locale del wizard
      const sel = new Set();                       // materia_id selezionate
      const argEsclusi = {};                       // materia_id → Set<arg_id> esclusi
      const espansi = new Set();                   // materia_id con dropdown aperto
      let pesiOverride = {};                        // materia_id → peso 0-10 (da preset bando)
      let bandoIdSelezionato = null;                // id del bando applicato (badge + salvataggio)
      let nomeScelto = '';                          // nome suggerito da precompilare in wizNome

      // Catalogo bandi disponibile (opzionale — bundle senza bandi_catalogo.json → []).
      // Le bozze (stato:'bozza', dal Pannello Bandi admin) restano invisibili agli
      // utenti finché non completate e pubblicate.
      const catalogoBandi = (STATE.pacchetto.bandi || []).filter(b => b.stato !== 'bozza');
      let composizione = {}; // materia_id → percentuale effettiva nelle batterie
      const bandiSelezionati = new Set();
      const SK_SCHEMI_PESI = 'cm:schemi-pesi';
      let schemaSelezionato = '';
      let nomeSchema = '';
      const schemi = () => caricaDaStorage(SK_SCHEMI_PESI) || [];
      function _idsBandi() {
        return [...new Set(catalogoBandi.filter(b => bandiSelezionati.has(b.id))
          .flatMap(b => b.piano.materieIds || []))];
      }
      function _moduliVisibili() {
        if (!bandiSelezionati.size) return moduli;
        const ids = new Set(_idsBandi());
        // Materie manuali preesistenti: restano accessibili senza mostrare
        // tutte le banche degli altri concorsi.
        for (const id of sel) ids.add(id);
        return moduli.filter(m => ids.has(m.materia_id));
      }

      function _normalizzaComposizione(sorgente, idsInput) {
        const ids = idsInput || [...sel];
        if (ids.length === 0) return {};
        const valori = {};
        let totale = 0;
        ids.forEach(id => {
          const v = Math.max(0, Number(sorgente && sorgente[id]) || 0);
          valori[id] = v;
          totale += v;
        });
        if (totale <= 0) {
          ids.forEach(id => { valori[id] = 1; });
          totale = ids.length;
        }
        const out = {};
        ids.forEach(id => { out[id] = valori[id] * 100 / totale; });
        return out;
      }

      function _pesiGlobali(idsInput) {
        const out = {};
        (idsInput || [...sel]).forEach(id => { out[id] = Number(infoMateria[id] && infoMateria[id].peso) || 1; });
        return out;
      }

      function _sorgentePreset(bando, idsInput) {
        const piano = bando && bando.piano;
        return (piano && piano.composizione && Object.keys(piano.composizione).length)
          ? piano.composizione
          : (piano && piano.pesiOverride && Object.keys(piano.pesiOverride).length)
            ? piano.pesiOverride
            : _pesiGlobali(idsInput);
      }
      function _pesiBandiCorrenti() {
        const out = _pesiGlobali([...sel]);
        for (const b of catalogoBandi.filter(b => bandiSelezionati.has(b.id)).reverse()) {
          Object.assign(out, _sorgentePreset(b, b.piano.materieIds || []));
        }
        return out;
      }

      function _impostaPercentuale(mid, valore) {
        if (sel.has(mid)) composizione[mid] = Math.max(0, Math.min(100, Number(valore) || 0));
      }

      function _nomeMateria(mid) {
        return (infoMateria[mid] && infoMateria[mid].nome) ||
               ((moduli.find(m => m.materia_id === mid) || {}).nome) || mid;
      }

      // Precompila in base alla modalità
      let saveEsistente = null;
      if (editing) {
        saveEsistente = SavesCore.getListaSaves().find(s => s.id === editingId);
        if (!saveEsistente) {
          toast('Save non trovato', true);
          navigaA('piani');
          return;
        }
        // Materie selezionate dal piano esistente
        const ids = (saveEsistente.piano && saveEsistente.piano.materieIds) || [];
        ids.forEach(id => sel.add(id));
        // Argomenti esclusi dal piano esistente
        const escl = (saveEsistente.piano && saveEsistente.piano.argomentiEsclusi) || {};
        Object.keys(escl).forEach(mid => {
          if (Array.isArray(escl[mid])) argEsclusi[mid] = new Set(escl[mid]);
        });
        pesiOverride = Object.assign({}, (saveEsistente.piano && saveEsistente.piano.pesiOverride) || {});
        bandoIdSelezionato = saveEsistente.bandoId || null;
        ((saveEsistente.piano && saveEsistente.piano.bandiIds) ||
          (bandoIdSelezionato ? [bandoIdSelezionato] : [])).forEach(id => bandiSelezionati.add(id));
      } else {
        // Crea da zero: pre-seleziona tutte le materie
        for (const m of moduli) sel.add(m.materia_id);
      }

      const bandoIniziale = bandoIdSelezionato ? catalogoBandi.find(b => b.id === bandoIdSelezionato) : null;
      const compSalvata = saveEsistente && saveEsistente.piano && saveEsistente.piano.composizione;
      const sorgenteIniziale = (compSalvata && Object.keys(compSalvata).length) ? compSalvata
                             : (pesiOverride && Object.keys(pesiOverride).length) ? pesiOverride
                             : bandoIniziale ? _sorgentePreset(bandoIniziale, [...sel])
                             : _pesiGlobali([...sel]);
      composizione = _normalizzaComposizione(sorgenteIniziale, [...sel]);

      // Due viste selezionabili in ogni momento (tab), sia in creazione che in
      // modifica: 'bando' = scegli un preset da bandi_catalogo.json, 'materie'
      // = griglia manuale materia/argomento (quella storica). Le tab compaiono
      // solo se esiste un catalogo bandi — altrimenti nessun cambio visibile.
      // Default: in creazione parti dalla vista bando (se il catalogo non è
      // vuoto), in modifica parti sempre dalla griglia (stai già modificando
      // un piano esistente).
      let vista = (!editing && catalogoBandi.length > 0) ? 'bando' : 'materie';

      function _applicaBando(bando) {
        bandiSelezionati.clear(); bandiSelezionati.add(bando.id);
        sel.clear(); espansi.clear();
        (bando.piano && bando.piano.materieIds || []).forEach(id => sel.add(id));
        Object.keys(argEsclusi).forEach(k => delete argEsclusi[k]);
        const escl = (bando.piano && bando.piano.argomentiEsclusi) || {};
        Object.keys(escl).forEach(mid => {
          if (Array.isArray(escl[mid])) argEsclusi[mid] = new Set(escl[mid]);
        });
        pesiOverride = Object.assign({}, (bando.piano && bando.piano.pesiOverride) || {});
        composizione = _normalizzaComposizione(_sorgentePreset(bando, [...sel]), [...sel]);
        bandoIdSelezionato = bando.id;
        if (!editing) nomeScelto = bando.nome || '';
        vista = 'materie';
        render(false);
      }

      function _cambiaBando(id, checked) {
        const prima = new Set(_idsBandi());
        if (checked) bandiSelezionati.add(id); else bandiSelezionati.delete(id);
        const dopo = new Set(_idsBandi());
        for (const mid of [...sel]) if (!dopo.has(mid)) { sel.delete(mid); delete composizione[mid]; }
        for (const mid of dopo) if (!prima.has(mid)) { sel.add(mid); composizione[mid] = 1; }
        bandoIdSelezionato = [...bandiSelezionati][0] || null;
        composizione = _normalizzaComposizione(composizione, [...sel]);
        render();
      }
      function _renderBandiMultipli() {
        return `<div class="wiz-section"><label class="wiz-label">Bandi del piano (puoi selezionarne più di uno)</label>
          <div class="wiz-bandi-select">${catalogoBandi.map(b => `<label class="wiz-opt">
            <input type="checkbox" data-wiz-bando="${_esc(b.id)}" ${bandiSelezionati.has(b.id) ? 'checked' : ''}>
            ${_esc(b.nome)}</label>`).join('')}</div></div>`;
      }

      const main = document.getElementById('main');
      const oldPage = STATE.pageCorrente;

      // ── Helper: conteggio quiz tenendo conto di argomenti esclusi ──
      function _quizConteggioPianoCorrente() {
        let tot = 0;
        for (const mid of sel) {
          const banca = STATE.pacchetto.banche[mid];
          if (!banca) continue;
          const arr = banca.categorizzati || banca.quiz || [];
          const esc = argEsclusi[mid];
          for (const q of arr) {
            const a = q.categorizzazione && q.categorizzazione.argomento_id;
            if (a && esc && esc.has(a)) continue;
            tot++;
          }
        }
        return tot;
      }

      // ── Render riga materia ──
      function _renderRigaMateria(m) {
        const inSel = sel.has(m.materia_id);
        const info = infoMateria[m.materia_id] || {};
        const banca = STATE.pacchetto.banche[m.materia_id];
        const nTot = banca ? (banca.categorizzati || banca.quiz || []).length : 0;
        const args = argomentiPerMateria[m.materia_id] || [];
        const esc = argEsclusi[m.materia_id];
        const nEsclusi = esc ? esc.size : 0;
        const nInclusi = args.length - nEsclusi;
        const isExp = espansi.has(m.materia_id);
        // Quiz effettivamente nel piano per QUESTA materia (rispettando esclusioni)
        let nQuizPiano = 0;
        if (inSel && banca) {
          const arr = banca.categorizzati || banca.quiz || [];
          for (const q of arr) {
            const a = q.categorizzazione && q.categorizzazione.argomento_id;
            if (a && esc && esc.has(a)) continue;
            nQuizPiano++;
          }
        }

        // Chevron: visibile a sinistra del nome, ruota quando espanso
        const hasArgs = args.length > 0;
        const chevronClass = hasArgs ? (isExp ? 'on' : '') : 'empty';
        const chevronBtn = `<span class="wiz-chevron ${chevronClass}" data-mat="${_esc(m.materia_id)}"
                                  title="${hasArgs ? (isExp ? 'Chiudi argomenti' : 'Espandi argomenti') : ''}">▶</span>`;

        // Pulsante contatore argomenti (a destra, informativo + click apre/chiude)
        const countBtn = hasArgs
          ? `<button class="wiz-mat-exp ${isExp ? 'on' : ''}" data-mat="${_esc(m.materia_id)}"
                     title="Clicca per ${isExp ? 'chiudere' : 'espandere'} gli argomenti (${args.length} totali)">
               ${args.length} arg
               ${nEsclusi > 0 ? `<span class="wiz-mat-excl">${nEsclusi} esclusi</span>` : ''}
             </button>`
          : '';

        const argsRows = (isExp && hasArgs) ? `
          <div class="wiz-args-grid">
            ${args.map(a => {
              const k = m.materia_id + '::' + a.id;
              const n = conteggioArgomento[k] || 0;
              const escluso = esc && esc.has(a.id);
              const aChecked = !escluso;
              return `
                <label class="wiz-arg-row ${aChecked ? 'sel' : 'fuori'} ${!inSel ? 'dis' : ''}">
                  <input type="checkbox" data-arg-mat="${_esc(m.materia_id)}" data-arg="${_esc(a.id)}"
                         ${aChecked ? 'checked' : ''} ${!inSel ? 'disabled' : ''}>
                  <span class="wiz-arg-nome">${_esc(a.nome)}</span>
                  <span class="wiz-arg-meta">${n > 0 ? n + ' quiz' : ''}${a.peso ? ' · p.' + a.peso : ''}</span>
                </label>
              `;
            }).join('')}
            ${conteggioSenzaArg[m.materia_id] ? `
              <div class="wiz-arg-row neutro">
                <span class="wiz-arg-nome"><em>Altro (senza argomento)</em></span>
                <span class="wiz-arg-meta">${conteggioSenzaArg[m.materia_id]} quiz · sempre incluso</span>
              </div>
            ` : ''}
          </div>
        ` : '';

        return `
          <div class="wiz-row-block ${inSel ? 'sel' : ''}">
            <div class="wiz-row-wrap">
              ${chevronBtn}
              <label class="wiz-row ${inSel ? 'sel' : ''}">
                <input type="checkbox" data-mat="${_esc(m.materia_id)}" ${inSel ? 'checked' : ''}>
                <span class="wiz-row-nome">${_esc(info.nome)}</span>
                <span class="wiz-row-meta">
                  ${inSel ? `<strong>${nQuizPiano.toLocaleString('it-IT')}</strong> / ${nTot.toLocaleString('it-IT')}` : `${nTot.toLocaleString('it-IT')}`} quiz
                  · peso ${info.peso || '–'}${info.tipologia ? ' · ' + _esc(info.tipologia) : ''}
                </span>
                ${countBtn}
              </label>
            </div>
            ${argsRows}
          </div>
        `;
      }

      // ── Tab bar condivisa: "📦 Piano Bandi" (preset) / "📋 Elenco Materie" (manuale) ──
      // Visibile solo se esiste un catalogo bandi — altrimenti nessun cambio
      // rispetto al comportamento storico (griglia diretta).
      function _renderTabBar() {
        if (catalogoBandi.length === 0) return '';
        return `
          <div class="wiz-tabs">
            <button class="wiz-tab ${vista === 'bando' ? 'active' : ''}" id="wizTabBando">📦 Piano Bandi</button>
            <button class="wiz-tab ${vista === 'materie' ? 'active' : ''}" id="wizTabMaterie">📋 Elenco Materie</button>
          </div>
        `;
      }
      function _attachTabListeners() {
        const bTabBando = document.getElementById('wizTabBando');
        if (bTabBando) bTabBando.addEventListener('click', () => { vista = 'bando'; render(); });
        const bTabMaterie = document.getElementById('wizTabMaterie');
        if (bTabMaterie) bTabMaterie.addEventListener('click', () => { vista = 'materie'; render(); });
      }

      // ── Vista "Piano Bandi": scelta di un preset da bandi_catalogo.json ──
      function _renderRiepilogoPesiBando(b) {
        const ids = (b.piano && b.piano.materieIds) || [];
        const percentuali = _normalizzaComposizione(_sorgentePreset(b, ids), ids);
        return `<div class="wiz-bando-pesi">${ids.map(mid =>
          `<span><strong>${_esc(_nomeMateria(mid))}</strong> ${percentuali[mid].toFixed(1)}%</span>`
        ).join('')}</div>`;
      }

      function _renderComposizione() {
        const ids = moduli.map(m => m.materia_id).filter(id => sel.has(id));
        const percentuali = composizione;
        const totale = ids.reduce((n, id) => n + (Number(composizione[id]) || 0), 0);
        const quote40 = (typeof ripartisciProporzionale === 'function')
          ? ripartisciProporzionale(40, percentuali) : {};
        return `
          <div class="wiz-section wiz-weight-section">
            <div class="wiz-section-h">
              <label class="wiz-label">Percentuale delle materie nelle batterie</label>
              <div class="wiz-quick">
                <button class="btn btn-ghost btn-sm" id="wizPesiPreset">Ripristina pesi</button>
                <button class="btn btn-ghost btn-sm" id="wizPesiUguali">Dividi in parti uguali</button>
                <button class="btn btn-ghost btn-sm" id="wizPesiNormalizza">Normalizza al 100%</button>
              </div>
            </div>
            <div class="wiz-hint">Modifica liberamente ogni valore: gli altri non cambiano. Totale: <strong id="wizPesoTotale">${totale.toFixed(1)}%</strong>. Prima di salvare deve essere 100%, oppure usa Normalizza. La stima a destra ripartisce 40 quiz in proporzione ai valori.</div>
            <div class="wiz-schemi">
              <label>Schema salvato <select id="wizSchemi"><option value="">Scegli uno schema</option>${schemi().map(s => `<option value="${_esc(s.id)}" ${s.id === schemaSelezionato ? 'selected' : ''}>${_esc(s.nome)}</option>`).join('')}</select></label>
              <button class="btn btn-ghost btn-sm" id="wizSchemaCarica">Carica schema</button>
              <button class="btn btn-ghost btn-sm" id="wizSchemaElimina">Elimina schema</button>
              <label>Nome schema <input id="wizSchemaNome" value="${_esc(nomeSchema)}" placeholder="Es. Inglese e logica"></label>
              <button class="btn btn-ghost btn-sm" id="wizSchemaSalva">Salva schema</button>
              <div class="wiz-hint">Gli schemi conservano materie, bandi, argomenti esclusi e percentuali. Non cambiano RP o storico.</div>
            </div>
            <div class="wiz-weight-list">
              ${ids.map(mid => {
                const pct = percentuali[mid] || 0;
                return `<label class="wiz-weight-row">
                  <span class="wiz-weight-name">${_esc(_nomeMateria(mid))}</span>
                  <span class="wiz-weight-bar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></span>
                  <span class="wiz-weight-input"><input type="number" data-wiz-peso="${_esc(mid)}" value="${pct.toFixed(1)}" min="0" max="100" step="0.1">%</span>
                  <span class="wiz-weight-preview">${quote40[mid] || 0} / 40 quiz</span>
                </label>`;
              }).join('')}
            </div>
          </div>`;
      }

      function _renderSchermataBando() {
        main.innerHTML = `
          <div class="page-header">
            <h1 class="page-title">${editing ? `✎ Modifica piano: ${_esc(saveEsistente.nome)}` : '＋ Nuovo save'}</h1>
            <p class="page-subtitle">Scegli un bando: materie, argomenti e pesi vengono precompilati dal preset, ma resti libero di modificare tutto nella vista "Elenco Materie".</p>
            ${_renderTabBar()}
          </div>
          <div class="wiz-bando-grid">
            ${catalogoBandi.map(b => {
              const n = (b.piano && b.piano.materieIds || []).length;
              return `
                <button class="wiz-bando-card ${bandoIdSelezionato === b.id ? 'sel' : ''}" data-bando="${_esc(b.id)}">
                  <div class="wiz-bando-nome">${_esc(b.nome)}</div>
                  ${b.ente ? `<div class="wiz-bando-ente">${_esc(b.ente)}</div>` : ''}
                  ${b.descrizione ? `<div class="wiz-bando-descr">${_esc(b.descrizione)}</div>` : ''}
                  ${_renderRiepilogoPesiBando(b)}
                  <div class="wiz-bando-meta">${n} materie${b.scadenza ? ' · scadenza ' + _esc(b.scadenza) : ''}</div>
                </button>
              `;
            }).join('')}
          </div>
          <div class="wiz-actions">
            <button class="btn btn-ghost" id="wizAnnulla">Annulla</button>
          </div>
        `;
        _attachTabListeners();
        main.querySelectorAll('.wiz-bando-card[data-bando]').forEach(btn => {
          btn.addEventListener('click', () => {
            const b = catalogoBandi.find(x => x.id === btn.dataset.bando);
            if (b) _applicaBando(b);
          });
        });
        document.getElementById('wizAnnulla').addEventListener('click', () => {
          STATE.pageCorrente = oldPage || 'piani';
          navigaA(STATE.pageCorrente);
        });
      }

      function render(preserva = true) {
        const y = main.scrollTop, wy = window.scrollY;
        const scrollInterni = ['.wiz-rows', '.wiz-weight-list'].map(selector => ({ selector, y: main.querySelector(selector)?.scrollTop || 0 }));
        const nome = document.getElementById('wizNome');
        if (nome) nomeScelto = nome.value;
        const schemaNome = document.getElementById('wizSchemaNome');
        if (schemaNome) nomeSchema = schemaNome.value;
        const active = document.activeElement;
        const attr = ['data-mat', 'data-arg', 'data-wiz-peso', 'data-wiz-bando'].find(a => active && active.hasAttribute(a));
        const focus = attr ? `${active.tagName.toLowerCase()}[${attr}="${CSS.escape(active.getAttribute(attr))}"]` : null;
        _render();
        if (preserva) {
          for (const s of scrollInterni) { const el = main.querySelector(s.selector); if (el) el.scrollTop = s.y; }
          main.scrollTop = y; window.scrollTo(0, wy);
          if (focus) main.querySelector(focus)?.focus({ preventScroll: true });
        } else { main.scrollTop = 0; window.scrollTo(0, 0); }
      }
      function _render() {
        if (vista === 'bando') { _renderSchermataBando(); return; }

        const calc = _calcolaRankSuggerito([...sel]);   // basato solo su materie
        const righe = _moduliVisibili().map(_renderRigaMateria).join('');

        const titolo = editing ? `✎ Modifica piano: ${_esc(saveEsistente.nome)}` : '＋ Nuovo save';
        const subtitolo = editing
          ? 'Modifica le materie e gli argomenti del piano. Diario, RP ranked e missioni non vengono toccati — cambia solo COSA viene proposto da qui in avanti.'
          : 'Dai un nome alla tua nuova partita e scegli le materie su cui giocare. Tutto il resto (RP ranked, missioni, badge) parte vergine — il padroneggiamento globale invece resta e ti farà partire avanti dove già sai.';

        const bandoAttivo = bandoIdSelezionato ? catalogoBandi.find(b => b.id === bandoIdSelezionato) : null;
        const bandoRiapplicabile = bandoAttivo || null;

        main.innerHTML = `
          <div class="page-header">
            <h1 class="page-title">${titolo}</h1>
            <p class="page-subtitle">${subtitolo}</p>
            ${_renderTabBar()}
            ${bandoAttivo ? `
              <div class="wiz-bando-badge">
                Preset: <strong>${_esc(catalogoBandi.filter(b => bandiSelezionati.has(b.id)).map(b => b.nome).join(' + ') || bandoAttivo.nome)}</strong>
                ${bandiSelezionati.size < 2 ? '<button class="btn-link" id="wizRiapplicaBando">🔄 Ri-applica preset</button>' : ''}
              </div>
            ` : ''}
          </div>

          ${editing ? '' : `
            <div class="wiz-section">
              <label class="wiz-label">Nome del save</label>
              <input type="text" class="wiz-input" id="wizNome" placeholder="Es. Bando RIPAM 2026, Vigili VVF, Studio leggero..." value="${_esc(nomeScelto)}">
            </div>
          `}

          ${_renderBandiMultipli()}

          <div class="wiz-section">
            <div class="wiz-section-h">
              <label class="wiz-label">Materie e argomenti del piano <span class="wiz-counter" id="wizCount"></span></label>
              <div class="wiz-quick">
                <button class="btn btn-ghost btn-sm" id="wizPickAll">Tutte materie</button>
                <button class="btn btn-ghost btn-sm" id="wizPickNone">Nessuna</button>
                <button class="btn btn-ghost btn-sm" id="wizArgAll">Includi tutti gli arg.</button>
              </div>
            </div>
            <div class="wiz-hint">💡 Clicca <strong>▸ N arg</strong> accanto a una materia per restringere alla granularità degli argomenti. Esclusioni vuote = tutti gli argomenti dentro.</div>
            <div class="wiz-rows wiz-rows-hier">${righe}</div>
          </div>

          ${_renderComposizione()}

          ${editing ? '' : `
            <div class="wiz-rank-suggest" id="wizRankBox">
              <div class="wiz-rank-h">🎯 Rank iniziale suggerito</div>
              <div class="wiz-rank-body" id="wizRankBody"></div>
            </div>
          `}

          <div class="wiz-actions">
            <button class="btn btn-ghost" id="wizAnnulla">Annulla</button>
            <button class="btn btn-primary" id="wizConferma">${editing ? 'Salva modifiche' : 'Crea save'}</button>
          </div>
        `;

        if (!editing) _aggiornaWizRank(calc);

        // ── Listeners ──
        // Toggle materia
        document.querySelectorAll('input[data-mat]').forEach(cb => {
          cb.addEventListener('change', () => {
            const id = cb.dataset.mat;
            if (cb.checked) {
              sel.add(id);
              composizione[id] = Number(infoMateria[id] && infoMateria[id].peso) || 1;
            } else {
              sel.delete(id);
              espansi.delete(id);
              delete composizione[id];
            }
            composizione = _normalizzaComposizione(composizione, [...sel]);
            render();
          });
        });
        // Toggle expand argomenti — chevron sinistro + pulsante contatore destro
        const _toggleExpand = (e) => {
          e.preventDefault(); e.stopPropagation();
          const id = e.currentTarget.dataset.mat;
          if (!id) return;
          if (espansi.has(id)) espansi.delete(id); else espansi.add(id);
          render();
        };
        document.querySelectorAll('.wiz-mat-exp').forEach(btn => btn.addEventListener('click', _toggleExpand));
        document.querySelectorAll('.wiz-chevron:not(.empty)').forEach(ch => ch.addEventListener('click', _toggleExpand));
        // Toggle argomento
        document.querySelectorAll('input[data-arg]').forEach(cb => {
          cb.addEventListener('change', e => {
            e.stopPropagation();
            const mid = cb.dataset.argMat;
            const aid = cb.dataset.arg;
            if (!argEsclusi[mid]) argEsclusi[mid] = new Set();
            if (cb.checked) argEsclusi[mid].delete(aid);
            else            argEsclusi[mid].add(aid);
            if (argEsclusi[mid].size === 0) delete argEsclusi[mid];
            render();
          });
        });
        document.getElementById('wizPickAll').addEventListener('click', () => {
          for (const m of _moduliVisibili()) {
            sel.add(m.materia_id);
            if (composizione[m.materia_id] == null) composizione[m.materia_id] = Number(infoMateria[m.materia_id] && infoMateria[m.materia_id].peso) || 1;
          }
          composizione = _normalizzaComposizione(composizione, [...sel]);
          render();
        });
        document.getElementById('wizPickNone').addEventListener('click', () => {
          sel.clear(); espansi.clear(); composizione = {};
          render();
        });
        document.getElementById('wizArgAll').addEventListener('click', () => {
          // Rimuove tutte le esclusioni argomento
          Object.keys(argEsclusi).forEach(k => delete argEsclusi[k]);
          render();
        });
        document.getElementById('wizAnnulla').addEventListener('click', () => {
          STATE.pageCorrente = oldPage || 'piani';
          navigaA(STATE.pageCorrente);
        });
        document.getElementById('wizConferma').addEventListener('click', _onConferma);
        _attachTabListeners();
        main.querySelectorAll('[data-wiz-bando]').forEach(cb => cb.addEventListener('change', () => _cambiaBando(cb.dataset.wizBando, cb.checked)));
        document.getElementById('wizPesiNormalizza')?.addEventListener('click', () => {
          composizione = _normalizzaComposizione(composizione, [...sel]); render();
        });
        document.getElementById('wizSchemi')?.addEventListener('change', e => { schemaSelezionato = e.target.value; });
        document.getElementById('wizSchemaSalva')?.addEventListener('click', async e => {
          const pulsante = e.currentTarget;
          const nome = document.getElementById('wizSchemaNome').value.trim();
          if (!nome) { toast('Dai un nome allo schema', true); return; }
          if (!_percentualiValide()) return;
          const lista = schemi();
          if (lista.some(s => s.nome.toLowerCase() === nome.toLowerCase())) { toast('Nome già usato: scegli un altro nome o elimina lo schema precedente', true); return; }
          const id = 'schema_' + Date.now().toString(36);
          lista.push({ id, nome, piano: _pianoCorrente() });
          if (!salvaInStorage(SK_SCHEMI_PESI, lista)) {
            toast('Schema non salvato: spazio di archiviazione non disponibile. Esporta un backup dalle Impostazioni.', true);
            return;
          }
          schemaSelezionato = id;
          if (!await _attendiSalvataggio(pulsante)) return;
          toast('Schema salvato'); if (pulsante.isConnected) render();
        });
        document.getElementById('wizSchemaCarica')?.addEventListener('click', () => {
          const schema = schemi().find(s => s.id === schemaSelezionato);
          if (!schema) { toast('Scegli uno schema', true); return; }
          const p = schema.piano;
          const noti = new Set(moduli.map(m => m.materia_id));
          if (p.materieIds.some(id => !noti.has(id))) { toast('Lo schema contiene materie non più disponibili', true); return; }
          sel.clear(); p.materieIds.forEach(id => sel.add(id));
          bandiSelezionati.clear(); (p.bandiIds || []).forEach(id => bandiSelezionati.add(id));
          bandoIdSelezionato = [...bandiSelezionati][0] || null;
          Object.keys(argEsclusi).forEach(id => delete argEsclusi[id]);
          Object.entries(p.argomentiEsclusi || {}).forEach(([id, arr]) => { argEsclusi[id] = new Set(arr); });
          composizione = Object.assign({}, p.composizione); pesiOverride = Object.assign({}, p.pesiOverride);
          espansi.clear(); render(); toast('Schema caricato: ' + schema.nome);
        });
        document.getElementById('wizSchemaElimina')?.addEventListener('click', () => {
          if (!schemaSelezionato) return;
          showModal('Eliminare lo schema?', 'Il piano e i progressi non saranno modificati.', async () => {
            if (!salvaInStorage(SK_SCHEMI_PESI, schemi().filter(s => s.id !== schemaSelezionato))) {
              toast('Impossibile eliminare lo schema: archiviazione non disponibile', true); return;
            }
            if (!await confermaSalvataggio()) return;
            schemaSelezionato = ''; render();
          });
        });
        const bRiapplica = document.getElementById('wizRiapplicaBando');
        if (bRiapplica) bRiapplica.addEventListener('click', () => _applicaBando(bandoRiapplicabile));
        document.querySelectorAll('[data-wiz-peso]').forEach(input => {
          input.addEventListener('input', () => {
            _impostaPercentuale(input.dataset.wizPeso, input.value);
            _aggiornaComposizione();
          });
          input.addEventListener('change', () => {
            _impostaPercentuale(input.dataset.wizPeso, input.value);
            input.value = composizione[input.dataset.wizPeso].toFixed(1);
            _aggiornaComposizione();
          });
        });
        const bPesiPreset = document.getElementById('wizPesiPreset');
        if (bPesiPreset) bPesiPreset.addEventListener('click', () => {
          composizione = _normalizzaComposizione(_pesiBandiCorrenti(), [...sel]);
          render();
        });
        const bPesiUguali = document.getElementById('wizPesiUguali');
        if (bPesiUguali) bPesiUguali.addEventListener('click', () => {
          const uguali = {}; [...sel].forEach(id => { uguali[id] = 1; });
          composizione = _normalizzaComposizione(uguali, [...sel]);
          render();
        });
        _aggiornaWizCount();
      }

      // Non sostituire i controlli durante input/blur: il click sul pulsante
      // successivo deve arrivare allo stesso elemento su cui è iniziato.
      function _aggiornaComposizione() {
        const totale = [...sel].reduce((n, id) => n + (Number(composizione[id]) || 0), 0);
        const el = document.getElementById('wizPesoTotale');
        if (el) el.textContent = totale.toFixed(1) + '%';
        const quote40 = typeof ripartisciProporzionale === 'function' ? ripartisciProporzionale(40, composizione) : {};
        main.querySelectorAll('[data-wiz-peso]').forEach(input => {
          const mid = input.dataset.wizPeso, row = input.closest('.wiz-weight-row');
          row.querySelector('.wiz-weight-bar i').style.width = (composizione[mid] || 0) + '%';
          row.querySelector('.wiz-weight-preview').textContent = (quote40[mid] || 0) + ' / 40 quiz';
        });
      }

      function _aggiornaWizCount() {
        const el = document.getElementById('wizCount');
        if (!el) return;
        const n = sel.size;
        const totEsclusi = Object.values(argEsclusi).reduce((s, set) => s + set.size, 0);
        const tot = _quizConteggioPianoCorrente();
        el.textContent = `${n}/${moduli.length} materie · ${tot.toLocaleString('it-IT')} quiz nel piano` +
                         (totEsclusi > 0 ? ` · ${totEsclusi} argomenti esclusi` : '');
      }

      function _aggiornaWizRank(calc) {
        const body = document.getElementById('wizRankBody');
        if (!body) return;
        if (calc.totale === 0) {
          body.innerHTML = '<div class="wiz-rank-none">Seleziona almeno una materia per vedere il rank suggerito.</div>';
          return;
        }
        const pp = Math.round(calc.perc * 100);
        body.innerHTML = `
          <div class="wiz-rank-stats">
            Già padroneggiati: <strong>${calc.padron}</strong> / ${calc.totale} (${pp}%)
          </div>
          <div class="wiz-rank-grade">
            Inizierai da <strong class="wiz-rank-name">${_esc(calc.etichetta)}</strong>
          </div>
          <div class="wiz-rank-opts">
            <label class="wiz-opt"><input type="radio" name="wizRankOpt" value="suggerito" checked> 🚀 Parti dal rank suggerito</label>
            <label class="wiz-opt"><input type="radio" name="wizRankOpt" value="zero"> 🌱 Parti da zero (Rame 4)</label>
          </div>
        `;
      }

      function _percentualiValide() {
        const tot = [...sel].reduce((n, id) => n + (Number(composizione[id]) || 0), 0);
        if (!sel.size || Math.abs(tot - 100) > 0.05) { toast('Le percentuali devono sommare al 100%. Correggi i valori o usa Normalizza.', true); return false; }
        return true;
      }
      function _pianoCorrente() {
        // Costruisco l'oggetto piano nel formato canonico
        const pianoOut = { materieIds: [...sel] };
        pianoOut.bandiIds = [...bandiSelezionati];
        const esclSerial = {};
        for (const mid of Object.keys(argEsclusi)) {
          if (sel.has(mid) && argEsclusi[mid].size > 0) {
            esclSerial[mid] = [...argEsclusi[mid]];
          }
        }
        if (Object.keys(esclSerial).length > 0) pianoOut.argomentiEsclusi = esclSerial;
        if (pesiOverride && Object.keys(pesiOverride).length > 0) pianoOut.pesiOverride = pesiOverride;
        pianoOut.composizione = {};
        [...sel].forEach(mid => { pianoOut.composizione[mid] = Number((composizione[mid] || 0).toFixed(4)); });
        return pianoOut;
      }
      let creazioneInAttesa = null;
      async function _attendiSalvataggio(pulsante) {
        const testo = pulsante?.textContent;
        if (pulsante) { pulsante.disabled = true; pulsante.textContent = 'Salvataggio…'; }
        try { return await confermaSalvataggio(); }
        finally { if (pulsante?.isConnected) { pulsante.disabled = false; pulsante.textContent = testo; } }
      }
      async function _onConferma() {
        const pulsante = document.getElementById('wizConferma');
        if (sel.size === 0) { toast('Seleziona almeno una materia', true); return; }
        if (!_percentualiValide()) return;
        const pianoOut = _pianoCorrente();

        if (editing) {
          // ── Modalità modifica: aggiorna piano del save esistente ──
          // bandoIdSelezionato riflette sempre lo stato corrente del wizard
          // (invariato se l'utente non ha toccato la vista "Piano Bandi",
          // aggiornato se ha applicato un preset diverso).
          if (!SavesCore.aggiornaPianoSave(editingId, pianoOut, bandoIdSelezionato)) {
            toast('Piano non salvato: archiviazione non disponibile. Esporta un backup dalle Impostazioni.', true);
            return;
          }
          if (!await _attendiSalvataggio(pulsante)) return;
          toast('Piano aggiornato: ' + saveEsistente.nome);
          aggiornaTopbarSaveChip();
          if (pulsante.isConnected) navigaA(returnPage);
          return;
        }

        // ── Modalità creazione ──
        const nomeEl = document.getElementById('wizNome');
        const nome = (nomeEl ? nomeEl.value : '').trim();
        if (!nome) { toast('Dai un nome al save', true); return; }
        const calc = _calcolaRankSuggerito([...sel]);
        const optEl = document.querySelector('input[name="wizRankOpt"]:checked');
        const usaSuggerito = !optEl || optEl.value === 'suggerito';
        const subIniziale = usaSuggerito ? calc.sublevelIndice : 0;

        const totQuizPiano = _quizConteggioPianoCorrente();
        const totEscl = Object.values(argEsclusi).reduce((s, set) => s + set.size, 0);
        const descrPezzi = [`${sel.size} materie`, `${totQuizPiano.toLocaleString('it-IT')} quiz`];
        if (totEscl > 0) descrPezzi.push(`${totEscl} arg. esclusi`);

        const nuovo = creazioneInAttesa || SavesCore.creaSave({
          nome,
          descrizione: descrPezzi.join(' · '),
          piano: pianoOut,
          rankIniziale: subIniziale,
          bandoId: bandoIdSelezionato,
        });

        creazioneInAttesa = nuovo;
        SavesCore.aggiornaPianoSave(nuovo.id, pianoOut, bandoIdSelezionato);
        SavesCore.caricaSave(nuovo.id);
        if (subIniziale > 0 && typeof rankedSalvaStato === 'function') {
          rankedSalvaStato({
            rp: 0,
            sublevelIndice: subIniziale,
            picco: { sublevelIndice: subIniziale, data: (typeof oggiISO === 'function' ? oggiISO() : new Date().toISOString().slice(0,10)) },
            streak: 0,
            ultimoGiornoChiuso: null,
            ultimoGiornoAttivo: null,
          });
        }
        if (!await _attendiSalvataggio(pulsante)) return;
        toast('Save creato: ' + nome);
        aggiornaTopbarSaveChip();
        if (pulsante.isConnected) navigaA('piani');
      }

      render();
    }

    // Wizard in modalità MODIFICA — entry point pubblico
    // opts: { returnPage?: string } — pagina di ritorno dopo conferma (default 'piani')
    function apriWizardModificaSave(saveId, opts) {
      apriWizardCreaSave({ editingSaveId: saveId, returnPage: (opts && opts.returnPage) || 'piani' });
    }

    // ─── Hook navigazione ─────────────────────────────────────────────────
    // Si appoggia al `navigaA` globale: estendo lo switch aggiungendo 'piani'.
    // NB: il patch va fatto dentro initSavesUI() perché app.js, in fondo,
    // fa `window.navigaA = navigaA;` e altrimenti sovrascriverebbe questo wrap.
    function _installaNavigaPatch() {
      const _origNavigaA = window.navigaA;
      if (typeof _origNavigaA !== 'function') {
        console.warn('[saves-ui] navigaA non disponibile, patch saltato');
        return;
      }
      if (_origNavigaA._patchedBySavesUI) return;  // idempotente
      const wrapped = function (page) {
        // Aggiorna sempre la visibilità del chip prima di renderizzare la pagina
        aggiornaVisibilitaChip(page);
        if (page === 'piani') {
          STATE.pageCorrente = 'piani';
          renderPianiPartite();
          if (typeof applicaAspetto === 'function') applicaAspetto();
          return;
        }
        return _origNavigaA(page);
      };
      wrapped._patchedBySavesUI = true;
      window.navigaA = wrapped;
    }

    // ─── Bootstrap UI: chiamato da app.js dopo init() ────────────────────
    function initSavesUI() {
      installaTopbarSaveChip();
      installaSidebarPiani();
      _installaNavigaPatch();
    }

    window.SavesUI = {
      init: initSavesUI,
      aggiornaTopbarSaveChip,
      renderPianiPartite,
      apriWizardCreaSave,
      apriWizardModificaSave,
      cambiaSave,
    };
    window.renderPianiPartite = renderPianiPartite;
  })();
