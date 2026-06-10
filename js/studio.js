  // ═══════════════════════════════════════════════════════
  // STUDIO — Sezione di studio delle fonti normative (Fase 1).
  //
  // Tre viste: home (fonti raggruppate per materia) → fonte (elenco
  // articoli con ricerca) → articolo (lettore + chat IA con l'articolo
  // iniettato come contesto). I dati delle fonti sono generati da
  // scripts/estrai-fonti.py in js/fonti/ e caricati lazy: l'indice al
  // primo ingresso nella sezione, ogni fonte solo quando viene aperta.
  // Provider e API key IA sono quelli già configurati in gemini-client.js.
  // ═══════════════════════════════════════════════════════
  (function () {
    'use strict';

    const STUDIO = {
      fonteId: null,        // fonte aperta
      artIdx: null,         // indice articolo aperto
      ricerca: '',          // filtro corrente nell'elenco articoli
      chat: {},             // storia chat per "fonteId:numeroArticolo" (solo sessione)
      _scriptCaricati: new Set(),
      _aiOccupata: false,
      _pendingPrompt: null, // {label, prompt}: chip extra nella chat (da quiz o ricerca)
      _ultimaDomanda: '',   // ultima ricerca semantica (ripristino UI)
    };

    const SK_POSIZIONE = 'cm:studio:posizione';  // ultima posizione visitata

    // ─── Caricamento lazy dei bundle fonte ───
    function caricaScript(src) {
      if (STUDIO._scriptCaricati.has(src)) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => { STUDIO._scriptCaricati.add(src); resolve(); };
        s.onerror = () => reject(new Error('Impossibile caricare ' + src));
        document.head.appendChild(s);
      });
    }
    function caricaIndice() {
      if (window.CM_FONTI_INDEX) return Promise.resolve();
      return caricaScript('js/fonti/index.js');
    }
    function caricaFonte(id) {
      if (window.CM_FONTI_DATA && window.CM_FONTI_DATA[id]) return Promise.resolve();
      return caricaScript('js/fonti/' + id + '.js');
    }
    function fonteDati(id) {
      return (window.CM_FONTI_DATA && window.CM_FONTI_DATA[id]) || null;
    }

    // ─── Contenitore di rendering: pagina principale O overlay ───
    // Quando l'overlay è aperto (Studio sopra una batteria di quiz in corso)
    // tutte le viste si disegnano lì dentro: la pagina quiz sotto resta
    // intatta e alla chiusura si riprende esattamente da dove si era.
    function _cont() {
      return document.getElementById('studioOverlayBody') || document.getElementById('main');
    }

    function studioApriOverlay() {
      if (document.getElementById('studioOverlay')) return;
      const ov = document.createElement('div');
      ov.className = 'studio-overlay';
      ov.id = 'studioOverlay';
      ov.innerHTML = `
        <div class="studio-overlay-box">
          <div class="studio-overlay-head">
            <span class="studio-overlay-titolo">📚 Studio Fonti <span class="studio-overlay-nota">— la batteria resta in pausa, non perdi nulla</span></span>
            <button class="btn btn-primary" id="studioOverlayClose">✕ Torna ai quiz</button>
          </div>
          <div class="studio-overlay-body" id="studioOverlayBody"></div>
        </div>`;
      document.body.appendChild(ov);
      document.getElementById('studioOverlayClose').addEventListener('click', studioChiudiOverlay);
      ov.addEventListener('click', e => { if (e.target === ov) studioChiudiOverlay(); });
      document.addEventListener('keydown', _overlayEsc);
    }
    function _overlayEsc(e) { if (e.key === 'Escape') studioChiudiOverlay(); }
    function studioChiudiOverlay() {
      const ov = document.getElementById('studioOverlay');
      if (ov) ov.remove();
      document.removeEventListener('keydown', _overlayEsc);
    }

    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    // ─── VISTA 1: home — fonti per materia ───
    function renderStudio() {
      const main = _cont();
      main.innerHTML = '<div class="page-header"><h1 class="page-title">Studio</h1><div class="page-subtitle">Caricamento fonti…</div></div>';
      caricaIndice().then(() => {
        const indice = window.CM_FONTI_INDEX || [];
        const perMateria = {};
        indice.forEach(f => { (perMateria[f.materia] = perMateria[f.materia] || []).push(f); });
        const totArt = indice.reduce((s, f) => s + (f.nArticoli || 0), 0);

        main.innerHTML = `
          <div class="page-header page-header-bg pagebg-studio">
            <h1 class="page-title">📚 Studio</h1>
            <div class="page-subtitle">${indice.length} fonti normative · ${totArt} articoli sempre a disposizione, con tutor IA articolo per articolo</div>
          </div>
          <div class="studio-semantica">
            <div class="studio-semantica-label">🔍 Ricerca intelligente — fai una domanda, l'IA trova gli articoli giusti in tutte le fonti</div>
            <div class="studio-semantica-riga">
              <input type="text" class="studio-ricerca" id="studioDomanda" autocomplete="off"
                     placeholder="Es. chi nomina gli assessori? · quando serve il DPO? · termini dell'accesso civico…"
                     value="${esc(STUDIO._ultimaDomanda)}">
              <button class="btn btn-primary" id="studioCercaBtn">Trova articoli</button>
            </div>
            <div class="studio-sem-risultati" id="studioSemRisultati"></div>
          </div>
          ${_htmlFlashHome()}
          ${_htmlRipasso()}
          <div class="studio-home">
            ${Object.keys(perMateria).sort().map(mat => `
              <div class="studio-materia">
                <div class="studio-materia-titolo">${esc(mat)}</div>
                <div class="studio-fonti-grid">
                  ${perMateria[mat].map(f => `
                    <div class="studio-fonte-card" data-fonte="${esc(f.id)}">
                      <div class="studio-fonte-breve">${esc(f.titolo_breve)}</div>
                      <div class="studio-fonte-nome">${esc(f.nome)}</div>
                      <div class="studio-fonte-desc">${esc(f.descrizione)}</div>
                      <div class="studio-fonte-meta">${f.nArticoli} articoli</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>`;

        main.querySelectorAll('.studio-fonte-card').forEach(c => {
          c.addEventListener('click', () => apriFonte(c.dataset.fonte));
        });
        const domandaInput = document.getElementById('studioDomanda');
        const avviaRicerca = () => {
          const v = domandaInput.value.trim();
          if (v) ricercaSemantica(v);
        };
        document.getElementById('studioCercaBtn').addEventListener('click', avviaRicerca);
        domandaInput.addEventListener('keydown', e => { if (e.key === 'Enter') avviaRicerca(); });
        const flashBtn = document.getElementById('studioFlashRipassa');
        if (flashBtn) flashBtn.addEventListener('click', renderFlashReview);
        main.querySelectorAll('.studio-rip-card').forEach(c => {
          c.addEventListener('click', () => {
            const v = (STUDIO._ripassoVoci || [])[parseInt(c.dataset.rip, 10)];
            if (v) studioApriArticolo(v.link.fonteId, v.link.articolo);
          });
        });
      }).catch(err => {
        main.innerHTML = `<div class="page-header"><h1 class="page-title">📚 Studio</h1>
          <div class="page-subtitle">⚠ ${esc(err.message)} — rigenera i dati con scripts/estrai-fonti.py</div></div>`;
      });
    }

    // ─── VISTA 2: fonte — elenco articoli con ricerca ───
    function apriFonte(id, ricercaIniziale) {
      const main = _cont();
      STUDIO.fonteId = id;
      STUDIO.artIdx = null;
      STUDIO.ricerca = ricercaIniziale || '';
      main.innerHTML = '<div class="page-header"><h1 class="page-title">Studio</h1><div class="page-subtitle">Caricamento fonte…</div></div>';
      caricaFonte(id).then(() => renderFonte()).catch(err => {
        main.innerHTML = `<div class="page-header"><h1 class="page-title">📚 Studio</h1>
          <div class="page-subtitle">⚠ ${esc(err.message)}</div></div>`;
      });
    }

    function renderFonte() {
      const f = fonteDati(STUDIO.fonteId);
      if (!f) { renderStudio(); return; }
      const main = _cont();
      main.innerHTML = `
        <div class="page-header page-header-bg pagebg-studio">
          <div class="studio-breadcrumb">
            <button class="btn btn-ghost" id="studioBack">← Studio</button>
          </div>
          <h1 class="page-title">${esc(f.titolo_breve)}</h1>
          <div class="page-subtitle">${esc(f.nome)} · ${f.articoli.length} articoli · ${esc(f.materia)}</div>
        </div>
        <div class="studio-ricerca-wrap">
          <input type="text" class="studio-ricerca" id="studioRicerca"
                 placeholder="Cerca per numero, rubrica o testo (es. 50, sindaco, accesso civico…)"
                 value="${esc(STUDIO.ricerca)}" autocomplete="off">
          <span class="studio-ricerca-conta" id="studioConta"></span>
        </div>
        <div class="studio-art-lista" id="studioLista"></div>`;

      document.getElementById('studioBack').addEventListener('click', renderStudio);
      const input = document.getElementById('studioRicerca');
      let timer = null;
      input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => { STUDIO.ricerca = input.value; aggiornaLista(); }, 150);
      });
      input.focus();
      aggiornaLista();
    }

    function aggiornaLista() {
      const f = fonteDati(STUDIO.fonteId);
      const lista = document.getElementById('studioLista');
      const conta = document.getElementById('studioConta');
      if (!f || !lista) return;
      const q = STUDIO.ricerca.trim().toLowerCase();
      let risultati = f.articoli.map((a, i) => ({ a, i }));
      if (q) {
        // numero esatto in testa, poi match su rubrica, poi sul testo
        const perNumero = risultati.filter(r => r.a.numero === q || r.a.numero.startsWith(q + '-'));
        const perTitolo = risultati.filter(r => !perNumero.includes(r) && r.a.titolo.toLowerCase().includes(q));
        const perTesto  = risultati.filter(r => !perNumero.includes(r) && !perTitolo.includes(r) && r.a.testo.toLowerCase().includes(q));
        risultati = perNumero.concat(perTitolo, perTesto);
      }
      conta.textContent = q ? risultati.length + ' risultati' : '';
      const MAX = 400;
      lista.innerHTML = risultati.slice(0, MAX).map(({ a, i }) => `
        <div class="studio-art-riga" data-idx="${i}">
          <span class="studio-art-num">Art. ${esc(a.numero)}</span>
          <span class="studio-art-titolo">${esc(a.titolo) || '<em>(senza rubrica)</em>'}</span>
        </div>`).join('') || '<div class="studio-vuoto">Nessun articolo trovato.</div>';
      lista.querySelectorAll('.studio-art-riga').forEach(r => {
        r.addEventListener('click', () => apriArticolo(STUDIO.fonteId, parseInt(r.dataset.idx, 10)));
      });
    }

    // ─── VISTA 3: articolo — lettore + chat IA ───
    function apriArticolo(fonteId, idx, pending) {
      caricaFonte(fonteId).then(() => {
        STUDIO.fonteId = fonteId;
        STUDIO.artIdx = idx;
        STUDIO._pendingPrompt = pending || null;
        try { salvaInStorage(SK_POSIZIONE, { fonteId, idx }); } catch (_) {}
        renderArticolo();
      });
    }

    // Riscrive il testo estratto dal PDF in paragrafi leggibili:
    // nuova riga solo all'inizio di un comma ("1.", "2-bis.") o di una
    // lettera di elenco ("a)"), altrimenti le righe spezzate si riuniscono.
    function formattaTesto(testo) {
      const righe = testo.split('\n');
      const blocchi = [];
      let corrente = '';
      const inizioBlocco = /^(\d+(-\w+)?\s*[.)]\s|[a-z]\)\s|[a-z]-\w+\)\s|—|--)/;
      righe.forEach(r => {
        const rs = r.trim();
        if (!rs) return;
        if (inizioBlocco.test(rs) && corrente) {
          blocchi.push(corrente);
          corrente = rs;
        } else {
          corrente = corrente ? corrente + ' ' + rs : rs;
        }
      });
      if (corrente) blocchi.push(corrente);
      return blocchi.map(b => {
        const m = b.match(/^(\d+(?:-\w+)?)\s*[.)]\s/);
        const classe = m ? 'studio-comma' : (/^[a-z]/.test(b) ? 'studio-lettera' : 'studio-par');
        return `<p class="${classe}">${esc(b)}</p>`;
      }).join('');
    }

    function renderArticolo() {
      const f = fonteDati(STUDIO.fonteId);
      if (!f || STUDIO.artIdx == null || !f.articoli[STUDIO.artIdx]) { renderStudio(); return; }
      const a = f.articoli[STUDIO.artIdx];
      const main = _cont();
      const chiaveChat = STUDIO.fonteId + ':' + a.numero;
      const storia = STUDIO.chat[chiaveChat] || [];

      main.innerHTML = `
        <div class="studio-art-page">
          <div class="studio-art-top">
            <button class="btn btn-ghost" id="studioBackFonte">← ${esc(f.titolo_breve)}</button>
            <div class="studio-art-nav">
              <button class="btn btn-ghost" id="studioFlashGen" title="L'IA genera 5 flashcard da questo articolo, da ripassare con ripetizione spaziata">🎴 Genera flashcard</button>
              <button class="btn btn-ghost" id="studioPrec" ${STUDIO.artIdx === 0 ? 'disabled' : ''}>‹ Art. prec.</button>
              <button class="btn btn-ghost" id="studioSucc" ${STUDIO.artIdx >= f.articoli.length - 1 ? 'disabled' : ''}>Art. succ. ›</button>
            </div>
          </div>
          <div class="studio-split">
            <div class="studio-lettore">
              <div class="studio-lettore-fonte">${esc(f.nome)}</div>
              <h2 class="studio-lettore-titolo">Art. ${esc(a.numero)}${a.titolo ? ' — ' + esc(a.titolo) : ''}</h2>
              <div class="studio-lettore-testo">${formattaTesto(a.testo)}</div>
            </div>
            <div class="studio-chatbox">
              <div class="studio-chat-head">
                <span>🤖 Tutor IA</span>
                <span class="studio-chat-stato" id="studioChatStato">${window.geminiHaKey && geminiHaKey() ? '' : '⚠ nessuna API key — configurala nelle Impostazioni'}</span>
              </div>
              <div class="studio-chat-msgs" id="studioChatMsgs"></div>
              <div class="studio-chat-suggerimenti" id="studioSugg">
                ${STUDIO._pendingPrompt ? `<button class="studio-sugg-pending" id="studioSuggPending">${esc(STUDIO._pendingPrompt.label)}</button>` : ''}
                <button data-p="Spiegami questo articolo in parole semplici.">💡 Spiegamelo semplice</button>
                <button data-p="Fammi un esempio pratico di applicazione di questo articolo.">📋 Esempio pratico</button>
                <button data-p="Quali sono i punti di questo articolo più probabili in un quiz di concorso? Elencali.">🎯 Punti da quiz</button>
                <button data-p="Fammi 3 domande di verifica su questo articolo, una alla volta: parti dalla prima e attendi la mia risposta.">❓ Interrogami</button>
              </div>
              <div class="studio-chat-input">
                <textarea id="studioChatTesto" rows="2" placeholder="Chiedi qualcosa su questo articolo…"></textarea>
                <button class="btn btn-primary" id="studioChatInvia">Invia</button>
              </div>
            </div>
          </div>
        </div>`;

      document.getElementById('studioBackFonte').addEventListener('click', renderFonte);
      const flashGen = document.getElementById('studioFlashGen');
      flashGen.addEventListener('click', () => {
        if (!(window.geminiHaKey && geminiHaKey())) {
          appendiBolla('ai', 'Per generare flashcard serve una API key IA (Impostazioni → Intelligenza Artificiale).');
          return;
        }
        if (flashGen.disabled) return;
        flashGen.disabled = true;
        flashGen.textContent = '🎴 Genero…';
        _flashGenera(f, a).then(n => {
          flashGen.textContent = '✓ ' + n + ' carte aggiunte';
        }).catch(err => {
          flashGen.disabled = false;
          flashGen.textContent = '🎴 Genera flashcard';
          appendiBolla('ai', '⚠ ' + err.message);
        });
      });
      document.getElementById('studioPrec').addEventListener('click', () => apriArticolo(STUDIO.fonteId, STUDIO.artIdx - 1));
      document.getElementById('studioSucc').addEventListener('click', () => apriArticolo(STUDIO.fonteId, STUDIO.artIdx + 1));
      document.getElementById('studioSugg').querySelectorAll('button[data-p]').forEach(b => {
        b.addEventListener('click', () => inviaMessaggio(b.dataset.p));
      });
      const pendBtn = document.getElementById('studioSuggPending');
      if (pendBtn) {
        pendBtn.addEventListener('click', () => {
          const p = STUDIO._pendingPrompt;
          STUDIO._pendingPrompt = null;
          pendBtn.remove();
          if (p) inviaMessaggio(p.prompt);
        });
      }
      const txt = document.getElementById('studioChatTesto');
      document.getElementById('studioChatInvia').addEventListener('click', () => {
        const v = txt.value.trim();
        if (v) { txt.value = ''; inviaMessaggio(v); }
      });
      txt.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const v = txt.value.trim();
          if (v) { txt.value = ''; inviaMessaggio(v); }
        }
      });
      storia.forEach(m => appendiBolla(m.ruolo, m.testo));
    }

    // ─── Chat: rendering messaggi ───
    function appendiBolla(ruolo, testo, pensando) {
      const box = document.getElementById('studioChatMsgs');
      if (!box) return null;
      const div = document.createElement('div');
      div.className = 'studio-msg studio-msg-' + ruolo + (pensando ? ' studio-msg-pensando' : '');
      div.innerHTML = formattaRisposta(testo);
      box.appendChild(div);
      box.scrollTop = box.scrollHeight;
      return div;
    }

    // Markdown minimale: **grassetto**, elenchi "- ", a capo.
    function formattaRisposta(testo) {
      let h = esc(testo);
      h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      h = h.replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>');
      h = h.replace(/(<li>.*<\/li>\n?)+/gs, m => '<ul>' + m + '</ul>');
      h = h.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>');
      return '<p>' + h + '</p>';
    }

    function inviaMessaggio(testoUtente) {
      if (STUDIO._aiOccupata) return;
      const f = fonteDati(STUDIO.fonteId);
      const a = f && f.articoli[STUDIO.artIdx];
      if (!a) return;
      if (!(window.geminiHaKey && geminiHaKey())) {
        appendiBolla('ai', 'Nessuna API key configurata. Vai in Impostazioni → Intelligenza Artificiale e inserisci la chiave Groq (gratuita) o Gemini.');
        return;
      }
      const chiave = STUDIO.fonteId + ':' + a.numero;
      const storia = STUDIO.chat[chiave] = STUDIO.chat[chiave] || [];
      storia.push({ ruolo: 'user', testo: testoUtente });
      appendiBolla('user', testoUtente);
      const bolla = appendiBolla('ai', 'Sto ragionando…', true);
      STUDIO._aiOccupata = true;

      studioAiChiedi(f, a, storia).then(risposta => {
        storia.push({ ruolo: 'ai', testo: risposta });
        if (bolla) { bolla.classList.remove('studio-msg-pensando'); bolla.innerHTML = formattaRisposta(risposta); }
      }).catch(err => {
        storia.pop(); // la domanda non ha avuto risposta: non inquinare il contesto
        if (bolla) { bolla.classList.remove('studio-msg-pensando'); bolla.innerHTML = formattaRisposta('⚠ ' + err.message); }
      }).finally(() => {
        STUDIO._aiOccupata = false;
        const box = document.getElementById('studioChatMsgs');
        if (box) box.scrollTop = box.scrollHeight;
      });
    }

    // ─── Chat: chiamata IA (Groq o Gemini, secondo il provider attivo) ───
    const MAX_CONTESTO = 12000;   // caratteri di articolo iniettati (≈3k token)
    const MAX_STORIA = 12;        // ultimi messaggi inviati al modello

    function systemPromptStudio(f, a) {
      let testo = a.testo;
      if (testo.length > MAX_CONTESTO) testo = testo.slice(0, MAX_CONTESTO) + '\n[…testo troncato…]';
      return `Sei un tutor esperto di diritto per la preparazione ai concorsi pubblici italiani. Stai assistendo un candidato che studia questa norma:

FONTE: ${f.nome} — ${f.titolo_breve} (${f.materia})
ARTICOLO ${a.numero}${a.titolo ? ' — ' + a.titolo : ''}:
"""
${testo}
"""

REGOLE:
- Rispondi SOLO sulla base del testo dell'articolo e delle tue conoscenze giuridiche consolidate; se qualcosa non è nel testo, dillo chiaramente.
- Cita sempre i commi pertinenti (es. "comma 2-bis").
- Linguaggio chiaro e diretto, livello concorso pubblico: precisione tecnica senza paroloni inutili.
- Risposte concise: massimo 250 parole, usa elenchi puntati quando aiutano.
- Se il candidato sbaglia una risposta a una tua domanda di verifica, correggilo spiegando l'errore.
- Rispondi sempre in italiano.`;
    }

    async function studioAiChiedi(f, a, storia) {
      const sys = systemPromptStudio(f, a);
      const msgs = storia.slice(-MAX_STORIA);
      if (aiGetProvider() === 'gemini') return _chiediGemini(sys, msgs);
      return _chiediGroq(sys, msgs);
    }

    async function _chiediGroq(sys, msgs) {
      const key = groqGetKey();
      if (!key) throw new Error('Nessuna API key Groq configurata.');
      const body = {
        model: groqGetModel(),
        temperature: 0.4,
        max_tokens: 1024,
        messages: [{ role: 'system', content: sys }].concat(
          msgs.map(m => ({ role: m.ruolo === 'user' ? 'user' : 'assistant', content: m.testo }))
        ),
      };
      let res;
      try {
        res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
          body: JSON.stringify(body),
        });
      } catch (e) { throw new Error('Errore di rete: impossibile contattare Groq.'); }
      if (res.status === 429) throw new Error('Limite richieste Groq raggiunto. Riprova tra un minuto.');
      if (!res.ok) {
        let det = ''; try { const j = await res.json(); det = (j.error && j.error.message) || ''; } catch (_) {}
        if (res.status === 401) throw new Error('API key Groq non valida.');
        throw new Error('Groq: errore ' + res.status + (det ? ' — ' + det : ''));
      }
      const data = await res.json();
      const txt = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!txt) throw new Error('Risposta vuota dal modello.');
      return txt.trim();
    }

    async function _chiediGemini(sys, msgs) {
      const key = geminiGetKey();
      if (!key) throw new Error('Nessuna API key Gemini configurata.');
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/'
        + encodeURIComponent(geminiGetModel()) + ':generateContent?key=' + encodeURIComponent(key);
      const body = {
        systemInstruction: { parts: [{ text: sys }] },
        contents: msgs.map(m => ({ role: m.ruolo === 'user' ? 'user' : 'model', parts: [{ text: m.testo }] })),
        generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
      };
      let res;
      try {
        res = await fetch(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
      } catch (e) { throw new Error('Errore di rete: impossibile contattare Gemini.'); }
      if (res.status === 429) throw new Error('Quota Gemini esaurita. Riprova tra qualche minuto.');
      if (!res.ok) {
        let det = ''; try { const j = await res.json(); det = (j.error && j.error.message) || ''; } catch (_) {}
        throw new Error('Gemini: errore ' + res.status + (det ? ' — ' + det : ''));
      }
      const data = await res.json();
      const cand = data.candidates && data.candidates[0];
      const txt = cand && cand.content && cand.content.parts && cand.content.parts.map(p => p.text || '').join('');
      if (!txt) throw new Error('Risposta vuota dal modello.');
      return txt.trim();
    }

    // ═══════ RICERCA SEMANTICA CROSS-FONTE ═══════
    // Due stadi, senza embeddings né backend:
    //  1. retrieval lessicale locale su tutte le fonti (TF pesato su
    //     rubrica+testo, con folding accenti e stemming a prefisso);
    //  2. re-rank IA: i migliori candidati vengono passati al modello che
    //     sceglie i più pertinenti e motiva la scelta. Senza API key si
    //     mostrano direttamente i risultati lessicali.

    const STOPWORDS = new Set(('a al alla alle allo agli ai an che chi ci come con cosa cui da dal dalla dalle dallo dai degli dei del della delle dello di dove e ed è gli ha hanno il in io la le lo li loro ma mi ne nel nella nelle nello non o per più può quale quali quando questo questa questi queste qui se si sia sono su sul sulla sulle sullo tra un una uno vi viene essere quanto quanti deve devono entro').split(' '));

    function _fold(s) {
      return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    }
    // Stem grezzo: prefisso (tronca le desinenze italiane più comuni).
    function _stem(t) {
      t = t.replace(/(zioni|zione|menti|mento|ativa|ativo|ative|ativi|ita|ate|ati|are|ere|ire|ano|ono|ali|ale|ici|ico|iche|ica|i|e|o|a)$/, m => (t.length - m.length >= 4 ? '' : m));
      return t;
    }
    function _tokenizza(s) {
      return _fold(s).split(/[^a-z0-9]+/)
        .filter(t => t.length > 2 && !STOPWORDS.has(t))
        .map(_stem)
        .filter(t => t.length > 2);
    }

    function caricaTutteLeFonti() {
      return caricaIndice().then(() =>
        Promise.all((window.CM_FONTI_INDEX || []).map(f => caricaFonte(f.id)))
      );
    }

    // Cache del testo foldato per articolo (costruita alla prima ricerca).
    let _cacheFold = null;
    function _indiceRicerca() {
      if (_cacheFold) return _cacheFold;
      _cacheFold = [];
      (window.CM_FONTI_INDEX || []).forEach(meta => {
        const f = fonteDati(meta.id);
        if (!f) return;
        f.articoli.forEach((a, i) => {
          _cacheFold.push({
            fonteId: meta.id, idx: i, numero: a.numero,
            titoloFold: _fold(a.titolo || ''),
            testoFold: _fold(a.testo),
            lung: Math.max(200, a.testo.length),
          });
        });
      });
      return _cacheFold;
    }

    function _candidatiLessicali(domanda, quanti) {
      const tokens = [...new Set(_tokenizza(domanda))];
      if (!tokens.length) return [];
      const voci = _indiceRicerca();
      const conPunteggio = [];
      for (const v of voci) {
        let score = 0;
        for (const t of tokens) {
          let occ = 0, p = -1;
          while ((p = v.testoFold.indexOf(t, p + 1)) !== -1 && occ < 30) occ++;
          if (v.titoloFold.includes(t)) score += 6;          // rubrica pesa molto
          if (occ) score += Math.min(occ, 8) * (1000 / v.lung) + 1;
        }
        if (score > 0) conPunteggio.push({ v, score });
      }
      conPunteggio.sort((x, y) => y.score - x.score);
      return conPunteggio.slice(0, quanti).map(x => x.v);
    }

    function ricercaSemantica(domanda) {
      STUDIO._ultimaDomanda = domanda;
      const box = document.getElementById('studioSemRisultati');
      if (!box) return;
      box.innerHTML = '<div class="studio-sem-attesa">⏳ Cerco negli articoli di tutte le fonti…</div>';
      caricaTutteLeFonti().then(async () => {
        const candidati = _candidatiLessicali(domanda, 25);
        if (!candidati.length) {
          box.innerHTML = '<div class="studio-sem-attesa">Nessun articolo pertinente trovato. Prova con altre parole.</div>';
          return;
        }
        let risultati = null;
        if (window.geminiHaKey && geminiHaKey()) {
          box.innerHTML = '<div class="studio-sem-attesa">🤖 L\'IA sta scegliendo gli articoli più pertinenti…</div>';
          try { risultati = await _reRankIA(domanda, candidati); } catch (e) { risultati = null; }
        }
        if (!risultati) {
          // Fallback lessicale puro (nessuna key o errore IA)
          risultati = candidati.slice(0, 8).map(v => ({ v, motivo: '' }));
        }
        _renderRisultatiSemantici(box, domanda, risultati);
      }).catch(err => {
        box.innerHTML = `<div class="studio-sem-attesa">⚠ ${esc(err.message)}</div>`;
      });
    }

    async function _reRankIA(domanda, candidati) {
      const lista = candidati.map((v, n) => {
        const f = fonteDati(v.fonteId);
        const a = f.articoli[v.idx];
        const estratto = a.testo.slice(0, 350).replace(/\s+/g, ' ');
        return `[${n + 1}] ${f.titolo_breve}, Art. ${a.numero}${a.titolo ? ' — ' + a.titolo : ''}\n${estratto}`;
      }).join('\n\n');
      const sys = 'Sei un esperto di diritto per concorsi pubblici italiani. Ti viene data una domanda e un elenco numerato di articoli di legge (con estratto). Scegli SOLO gli articoli davvero pertinenti per rispondere alla domanda (da 1 a 5), in ordine di rilevanza. Rispondi SOLO con JSON: {"risultati":[{"n":<numero in elenco>,"motivo":"<max 15 parole, perché risponde alla domanda>"}]}';
      const user = `DOMANDA: ${domanda}\n\nARTICOLI CANDIDATI:\n${lista}`;
      const msgs = [{ ruolo: 'user', testo: user }];
      const grezzo = (aiGetProvider() === 'gemini')
        ? await _chiediGemini(sys, msgs)
        : await _chiediGroq(sys, msgs);
      const m = grezzo.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(m ? m[0] : grezzo);
      const out = [];
      (parsed.risultati || []).forEach(r => {
        const v = candidati[(r.n | 0) - 1];
        if (v && !out.some(x => x.v === v)) out.push({ v, motivo: String(r.motivo || '') });
      });
      return out.length ? out.slice(0, 5) : null;
    }

    function _renderRisultatiSemantici(box, domanda, risultati) {
      box.innerHTML = risultati.map(({ v, motivo }, k) => {
        const f = fonteDati(v.fonteId);
        const a = f.articoli[v.idx];
        return `
          <div class="studio-sem-card" data-k="${k}">
            <div class="studio-sem-fonte">${esc(f.titolo_breve)}</div>
            <div class="studio-sem-art">Art. ${esc(a.numero)}${a.titolo ? ' — ' + esc(a.titolo) : ''}</div>
            ${motivo ? `<div class="studio-sem-motivo">💬 ${esc(motivo)}</div>` : ''}
          </div>`;
      }).join('');
      box.querySelectorAll('.studio-sem-card').forEach(c => {
        c.addEventListener('click', () => {
          const r = risultati[parseInt(c.dataset.k, 10)];
          apriArticolo(r.v.fonteId, r.v.idx, {
            label: '🔍 Rispondi alla mia domanda',
            prompt: 'Sulla base di questo articolo, rispondi alla mia domanda: ' + domanda,
          });
        });
      });
    }

    // ═══════ COLLEGAMENTO QUIZ → ARTICOLO (Fase 2) ═══════
    // I quiz categorizzati portano legge+articolo in q.categorizzazione.
    // Mappa "numero legge_anno" → id fonte caricata nella sezione Studio.
    const LEGGE_A_FONTE = {
      '82_2005': 'DLgs_82_2005',   '267_2000': 'DLgs_267_2000',
      '165_2001': 'DLgs_165_2001', '196_2003': 'DLgs_196_2003',
      '33_2013': 'DLgs_33_2013',   '190_2012': 'L_190_2012',
      '445_2000': 'DPR_445_2000',  '36_2023': 'DLgs_36_2023',
      '679_2016': 'REG_UE_679_2016', '2016_679': 'REG_UE_679_2016',
    };
    const FONTI_DISPONIBILI = new Set(Object.values(LEGGE_A_FONTE));
    function _anno4(a) {
      a = String(a || '').replace(/\D/g, '');
      if (a.length === 4) return a;
      if (a.length === 2) return (parseInt(a, 10) < 50 ? '20' : '19') + a;
      return '';
    }

    // Dal quiz ricava {fonteId, articolo} oppure null se la legge del quiz
    // non è tra le fonti caricate. Ordine: riferimenti espliciti della
    // categorizzazione → nome legge → citazione nel testo della domanda.
    function studioLinkPerQuiz(q) {
      try { return _linkPerQuiz(q); } catch (_) { return null; }
    }
    function _linkPerQuiz(q) {
      const cat = (q && q.categorizzazione) || {};
      const tenta = (numero, anno, articolo) => {
        const fonteId = LEGGE_A_FONTE[String(parseInt(numero, 10)) + '_' + _anno4(anno)];
        return fonteId ? { fonteId, articolo: String(articolo || '').trim() } : null;
      };
      const refs = Array.isArray(cat.riferimenti_espliciti) ? cat.riferimenti_espliciti : [];
      for (const r of refs) {
        const hit = tenta(r.legge_numero, r.legge_anno, r.articolo || cat.articolo);
        if (hit) return hit;
      }
      const nomi = [cat.legge_nome, q && q.domanda];
      for (const s of nomi) {
        if (!s) continue;
        const m = String(s).match(/n?\.?\s*(\d{1,4})\s*[\/,]\s*(\d{2,4})|(\d{4})\s*\/\s*(\d{1,4})/);
        if (m) {
          const hit = m[3] ? tenta(m[4], m[3], cat.articolo) : tenta(m[1], m[2], cat.articolo);
          if (hit) return hit;
        }
        const md = String(s).match(/n\.\s*(\d{1,4})/);
        const ma = String(s).match(/(\d{4})/);
        if (md && ma) {
          const hit = tenta(md[1], ma[1], cat.articolo);
          if (hit) return hit;
        }
      }
      // 3) Programma di studio del pacchetto: materia → argomento → leggi.
      // Gli id delle leggi nel programma usano la stessa convenzione delle
      // fonti (DLgs_82_2005, …): match diretto. Necessario perché la
      // categorizzazione nel bundle runtime è snella (niente legge_nome).
      const ST = (typeof STATE !== 'undefined' && STATE) || window.STATE || null;
      const prog = ST && ST.pacchetto && ST.pacchetto.programma;
      if (prog && cat.materia_id) {
        for (const m of (prog.materie || [])) {
          if (m.id !== cat.materia_id) continue;
          for (const arg of (m.argomenti || [])) {
            if (cat.argomento_id && arg.id !== cat.argomento_id) continue;
            const leggi = arg.leggi || [];
            const cand = leggi.filter(l => l && FONTI_DISPONIBILI.has(l.id));
            if (!cand.length) continue;
            const contieneArt = l => (l.sotto_argomenti || []).some(sa =>
              (sa.articoli || []).some(x => String(x.numero) === String(cat.articolo)));
            let scelta = cand[0];
            if (cand.length > 1 && cat.articolo) scelta = cand.find(contieneArt) || scelta;
            // Articolo affidabile solo se la legge è unica nell'argomento o
            // se il programma lo elenca proprio in quella legge: altrimenti
            // si apre la fonte con l'articolo come ricerca (niente falsi match).
            const affidabile = (leggi.length === 1) || (cat.articolo && contieneArt(scelta));
            return { fonteId: scelta.id, articolo: affidabile ? String(cat.articolo || '').trim() : '', ricerca: !affidabile ? String(cat.articolo || '') : '' };
          }
        }
      }
      return null;
    }

    // Chiamato dal bottone "Studia la teoria" nel feedback del quiz corrente.
    function studioApriQuizCorrente() {
      // SESSIONE è un binding lessicale globale (let in quiz-engine.js)
      const S = (typeof SESSIONE !== 'undefined' && SESSIONE) || window.SESSIONE || null;
      const q = S && S.quiz && S.quiz[S.iCorrente];
      const link = q && studioLinkPerQuiz(q);
      if (!link) return;
      const sbagliata = q._risposta_data != null && q._risposta_data !== q.corretta;
      const prompt = 'Ho affrontato questo quiz:\n«' + q.domanda + '»\n'
        + 'Risposta corretta: «' + q.corretta + '».'
        + (sbagliata ? ' Io ho risposto «' + q._risposta_data + '» (sbagliata).' : ' Ho risposto correttamente.')
        + '\nSpiegami la teoria dietro questo quiz basandoti sull\'articolo e perché la risposta corretta è quella'
        + (sbagliata ? ', chiarendo il mio errore.' : '.');
      // Overlay sopra la batteria in corso: la pagina quiz sotto NON viene
      // toccata, niente progressi persi (anche in Ranked e Simulazione).
      studioApriOverlay();
      caricaIndice().then(() => caricaFonte(link.fonteId)).then(() => {
        const f = fonteDati(link.fonteId);
        const idx = f ? f.articoli.findIndex(x => x.numero === link.articolo) : -1;
        const pending = { label: '🎯 Spiegami questo quiz', prompt };
        if (idx >= 0) apriArticolo(link.fonteId, idx, pending);
        else apriFonte(link.fonteId, link.articolo || link.ricerca || '');
      }).catch(() => renderStudio());
    }

    // ═══════ HEAT-MAP RIPASSO (Fase 3) ═══════
    // Incrocia lo storico risposte (caricaProgress) con gli articoli delle
    // fonti: gli articoli dove sbagli di più, pesando il doppio gli errori
    // degli ultimi 14 giorni. Solo voci mappabili con certezza a una fonte.
    function _calcolaRipasso(maxVoci) {
      try {
        if (typeof caricaProgress !== 'function') return [];
        const risposte = caricaProgress().risposte || [];
        const agg = {};
        const recente = Date.now() - 14 * 86400000;
        for (const r of risposte) {
          if (!r.articolo || !r.materia_id) continue;
          const k = r.materia_id + '|' + (r.argomento_id || '') + '|' + r.articolo;
          const e = agg[k] = agg[k] || {
            materia_id: r.materia_id, argomento_id: r.argomento_id,
            articolo: r.articolo, tot: 0, errate: 0, errateRecenti: 0,
          };
          e.tot++;
          if (!r.corretta) { e.errate++; if ((r.timestamp || 0) >= recente) e.errateRecenti++; }
        }
        const voci = [];
        for (const k in agg) {
          const e = agg[k];
          if (!e.errate) continue;
          const link = studioLinkPerQuiz({ categorizzazione: {
            materia_id: e.materia_id, argomento_id: e.argomento_id, articolo: e.articolo,
          } });
          if (!link || !link.articolo) continue;
          voci.push(Object.assign({ link, score: e.errate + e.errateRecenti * 2 }, e));
        }
        voci.sort((a, b) => b.score - a.score);
        return voci.slice(0, maxVoci);
      } catch (_) { return []; }
    }

    function _htmlRipasso() {
      const voci = _calcolaRipasso(12);
      if (!voci.length) return '';
      const meta = {};
      (window.CM_FONTI_INDEX || []).forEach(f => { meta[f.id] = f; });
      STUDIO._ripassoVoci = voci;
      return `
        <div class="studio-ripasso">
          <div class="studio-materia-titolo">🎯 Da ripassare — gli articoli dove sbagli di più</div>
          <div class="studio-sem-risultati">
            ${voci.map((v, k) => `
              <div class="studio-sem-card studio-rip-card" data-rip="${k}">
                <div class="studio-sem-fonte">${esc((meta[v.link.fonteId] || {}).titolo_breve || v.link.fonteId)}</div>
                <div class="studio-sem-art">Art. ${esc(v.link.articolo)}</div>
                <div class="studio-rip-stat">${v.errate} error${v.errate === 1 ? 'e' : 'i'} su ${v.tot} rispost${v.tot === 1 ? 'a' : 'e'}${v.errateRecenti ? ' · 🔥 recenti' : ''}</div>
              </div>`).join('')}
          </div>
        </div>`;
    }

    // ═══════ FLASHCARD IA con ripetizione spaziata (Fase 3) ═══════
    // Le carte si generano dall'articolo aperto (5 per volta, via IA) e si
    // ripassano dalla home. Intervalli: 1 → 3 → 7 → 21 → 60 giorni se
    // rispondi bene; un errore riporta la carta all'inizio (riproposta
    // dopo 10 minuti). Salvate per-save come il resto dei progressi.
    const SK_FLASH = 'cm:studio:flashcards';
    const FLASH_PASSI_GIORNI = [1, 3, 7, 21, 60];

    function _flashTutte()    { return caricaDaStorage(SK_FLASH) || []; }
    function _flashSalva(arr) { salvaInStorage(SK_FLASH, arr); }
    function _flashDovute()   { const ora = Date.now(); return _flashTutte().filter(c => (c.dovuta || 0) <= ora); }

    async function _flashGenera(f, a) {
      let testo = a.testo;
      if (testo.length > MAX_CONTESTO) testo = testo.slice(0, MAX_CONTESTO) + '\n[…troncato…]';
      const sys = 'Sei un tutor per concorsi pubblici italiani. Generi flashcard di studio da articoli di legge. Rispondi SOLO con JSON valido.';
      const user = `Da questo articolo genera ESATTAMENTE 5 flashcard utili per un quiz di concorso (i punti più probabili in un quiz: termini, soggetti competenti, numeri, eccezioni).

FONTE: ${f.nome} — Art. ${a.numero}${a.titolo ? ' (' + a.titolo + ')' : ''}
"""
${testo}
"""

Formato: {"flashcards":[{"domanda":"<domanda breve e specifica>","risposta":"<risposta secca, max 40 parole>"}]}`;
      const msgs = [{ ruolo: 'user', testo: user }];
      const grezzo = (aiGetProvider() === 'gemini') ? await _chiediGemini(sys, msgs) : await _chiediGroq(sys, msgs);
      const m = grezzo.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(m ? m[0] : grezzo);
      const nuove = (parsed.flashcards || [])
        .filter(c => c && c.domanda && c.risposta)
        .slice(0, 8)
        .map(c => ({
          id: STUDIO.fonteId + ':' + a.numero + ':' + Math.random().toString(36).slice(2, 8),
          fonteId: STUDIO.fonteId, numero: a.numero, titoloArt: a.titolo || '',
          domanda: String(c.domanda), risposta: String(c.risposta),
          passo: -1, dovuta: Date.now(), creata: Date.now(),
        }));
      if (!nuove.length) throw new Error('L\'IA non ha prodotto flashcard valide. Riprova.');
      _flashSalva(_flashTutte().concat(nuove));
      return nuove.length;
    }

    function _htmlFlashHome() {
      const tutte = _flashTutte();
      if (!tutte.length) return '';
      const dovute = _flashDovute().length;
      return `
        <div class="studio-flash-home">
          <div class="studio-flash-home-info">🎴 <strong>${tutte.length}</strong> flashcard · <strong>${dovute}</strong> da ripassare ${dovute ? 'adesso' : '(tutto in pari ✓)'}</div>
          ${dovute ? '<button class="btn btn-primary" id="studioFlashRipassa">Ripassa ora</button>' : ''}
        </div>`;
    }

    function renderFlashReview() {
      const main = _cont();
      const coda = _flashDovute();
      if (!coda.length) { renderStudio(); return; }
      const carta = coda[0];
      const rimaste = coda.length;
      const meta = {};
      (window.CM_FONTI_INDEX || []).forEach(f => { meta[f.id] = f; });
      main.innerHTML = `
        <div class="page-header page-header-bg pagebg-studio">
          <div class="studio-breadcrumb"><button class="btn btn-ghost" id="studioFlashEsci">← Studio</button></div>
          <h1 class="page-title">🎴 Ripasso flashcard</h1>
          <div class="page-subtitle">${rimaste} cart${rimaste === 1 ? 'a' : 'e'} in coda</div>
        </div>
        <div class="studio-flash-card">
          <div class="studio-sem-fonte">${esc((meta[carta.fonteId] || {}).titolo_breve || carta.fonteId)} · Art. ${esc(carta.numero)}${carta.titoloArt ? ' — ' + esc(carta.titoloArt) : ''}</div>
          <div class="studio-flash-domanda">${esc(carta.domanda)}</div>
          <div class="studio-flash-risposta" id="studioFlashRisposta" style="display:none">${esc(carta.risposta)}</div>
          <div class="studio-flash-azioni">
            <button class="btn btn-primary" id="studioFlashMostra">Mostra risposta</button>
            <span id="studioFlashVoto" style="display:none">
              <button class="btn studio-flash-ko" id="studioFlashKo">✗ Sbagliata</button>
              <button class="btn studio-flash-ok" id="studioFlashOk">✓ La sapevo</button>
            </span>
            <button class="btn btn-ghost" id="studioFlashApri" title="Apri l'articolo collegato">📖 Articolo</button>
            <button class="btn btn-ghost" id="studioFlashElimina" title="Elimina questa carta">🗑</button>
          </div>
        </div>`;
      document.getElementById('studioFlashEsci').addEventListener('click', renderStudio);
      document.getElementById('studioFlashMostra').addEventListener('click', () => {
        document.getElementById('studioFlashRisposta').style.display = '';
        document.getElementById('studioFlashMostra').style.display = 'none';
        document.getElementById('studioFlashVoto').style.display = '';
      });
      const valuta = ok => {
        const arr = _flashTutte();
        const c = arr.find(x => x.id === carta.id);
        if (c) {
          if (ok) {
            c.passo = Math.min((c.passo | 0) + 1, FLASH_PASSI_GIORNI.length - 1);
            c.dovuta = Date.now() + FLASH_PASSI_GIORNI[c.passo] * 86400000;
          } else {
            c.passo = -1;
            c.dovuta = Date.now() + 10 * 60000;   // ritenta tra 10 minuti
          }
          _flashSalva(arr);
        }
        renderFlashReview();
      };
      document.getElementById('studioFlashOk').addEventListener('click', () => valuta(true));
      document.getElementById('studioFlashKo').addEventListener('click', () => valuta(false));
      document.getElementById('studioFlashElimina').addEventListener('click', () => {
        _flashSalva(_flashTutte().filter(x => x.id !== carta.id));
        renderFlashReview();
      });
      document.getElementById('studioFlashApri').addEventListener('click', () => {
        studioApriArticolo(carta.fonteId, carta.numero);
      });
    }

    // ─── API pubblica ───
    // Deep-link per la Fase 2 (bottone "Studia teoria" dai quiz):
    // apre direttamente un articolo per numero, o la fonte con una ricerca.
    function studioApriArticolo(fonteId, numeroArticolo) {
      caricaIndice().then(() => caricaFonte(fonteId)).then(() => {
        const f = fonteDati(fonteId);
        if (!f) { renderStudio(); return; }
        const idx = f.articoli.findIndex(x => x.numero === String(numeroArticolo));
        if (idx >= 0) apriArticolo(fonteId, idx);
        else apriFonte(fonteId, String(numeroArticolo || ''));
      }).catch(() => renderStudio());
    }

    window.renderStudio = renderStudio;
    window.studioApriArticolo = studioApriArticolo;
    window.studioLinkPerQuiz = studioLinkPerQuiz;
    window.studioApriQuizCorrente = studioApriQuizCorrente;
  })();
