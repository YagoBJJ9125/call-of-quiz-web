  // ═══════════════════════════════════════════════════════
  // SAVES-PROPAGATION — Fase 3: propagazione live RP cross-save
  //
  // Quando rispondi a un quiz Q durante il save A:
  //   • Save A: comportamento normale (RP accumulato nel round, applicato a fine)
  //   • Per ogni save B ≠ A, se Q.materia_id ∈ piano(B):
  //       - calcola delta con la scala di B (suo rank corrente)
  //       - applica subito (B non è in round, non c'è accumulo)
  //       - scrive riga "shadow" nel diario di B: { mode:'sync', da_save:A, rp_propagato }
  //       - registra eventuale transizione promo/retro nel save B per mostrarla
  //         al prossimo accesso a quel save
  //
  // Toast finale (uno per risposta): "+10 RP   ↗ +8 Vigili · +6 ASL"
  // ═══════════════════════════════════════════════════════

  (function () {
    'use strict';

    // ── Utility: lista save attivi (cm:saves:lista) ──
    function _listaSave() {
      if (!window.SavesCore) return [];
      return SavesCore.getListaSaves();
    }

    // ── Coda di transizioni "in attesa" per save in background ──
    // Quando un save B promuove/retrocede mentre stai giocando in A, mostriamo
    // il banner al primo accesso a B. Storage globale: cm:saves:transizioni_pending.
    const SK_TRANS_PENDING = 'cm:saves:transizioni_pending';
    function _leggiTransizioniPending() {
      try {
        const v = localStorage.getItem(SK_TRANS_PENDING);
        return v ? JSON.parse(v) : {};
      } catch (_) { return {}; }
    }
    function _salvaTransizioniPending(map) {
      try { localStorage.setItem(SK_TRANS_PENDING, JSON.stringify(map)); }
      catch (e) { console.warn('[propagation] salva transizioni:', e); }
    }
    function _accumulaTransizione(saveId, tipo, livelloDopo) {
      const map = _leggiTransizioniPending();
      if (!map[saveId]) map[saveId] = [];
      map[saveId].push({ tipo, livelloDopo, ts: Date.now() });
      _salvaTransizioniPending(map);
    }
    // API pubblica per le home dei save (usata in Fase 6/banner)
    function consumaTransizioniSave(saveId) {
      const map = _leggiTransizioniPending();
      const t = map[saveId] || [];
      if (t.length > 0) { delete map[saveId]; _salvaTransizioniPending(map); }
      return t;
    }

    // ── Helper: il save target ha questo quiz nel piano? ──
    function _quizInPianoSave(save, materiaId) {
      const ids = (save && save.piano && save.piano.materieIds) || [];
      return ids.indexOf(materiaId) !== -1;
    }

    // ── Costruzione/recupero stato ranked di un save ──
    function _statoRankedDi(saveId) {
      const raw = SavesCore.leggiSave(saveId, 'cm:ranked:stato');
      if (raw) return raw;
      // Stato di default identico a rankedCaricaStato() per save vergini
      return {
        rp: 0,
        sublevelIndice: 0,
        picco: { sublevelIndice: 0, data: (typeof oggiISO === 'function' ? oggiISO() : new Date().toISOString().slice(0,10)) },
        streak: 0,
        ultimoGiornoChiuso: null,
        ultimoGiornoAttivo: null,
      };
    }

    // ── Aggiorna lo "shadow diario" del save target con riga mode:'sync' ──
    function _appendShadowDiario(saveId, quiz, corretta, deltaPropagato, daSaveId) {
      const diario = SavesCore.leggiSave(saveId, 'cm:carriera:diario') || {};
      const oggi = (typeof oggiISO === 'function') ? oggiISO() : new Date().toISOString().slice(0,10);
      if (!diario[oggi]) {
        diario[oggi] = {
          missioni: { mattutina: null, pomeridiana: null },
          risposte: [],
          xpGuadagnati: 0,
        };
      }
      diario[oggi].risposte.push({
        quiz_id: (typeof quizId === 'function') ? quizId(quiz) : (quiz.id || ''),
        materia_id: quiz._materia_id || quiz.materia || '?',
        argomento_id: quiz.categorizzazione && quiz.categorizzazione.argomento_id,
        corretta: !!corretta,
        ts: Date.now(),
        slot: null,
        mode: 'sync',
        da_save: daSaveId,
        rp_propagato: deltaPropagato,
      });
      SavesCore.scriviSave(saveId, 'cm:carriera:diario', diario);
    }

    // ─── Funzione principale di propagazione ─────────────────────────────
    // Chiamata da rankedHookRisposta dopo aver registrato l'azione sul save
    // corrente. Ritorna l'array di propagazioni per costruire il toast.
    function propagaRPCrossSave(quiz, corretta) {
      if (!window.SavesCore || typeof rankedApplicaRPSuStato !== 'function') return [];
      if (typeof rankedValoriRP !== 'function') return [];

      const attivoId = SavesCore.getSaveAttivoId();
      const lista = _listaSave();
      const materiaQuiz = quiz._materia_id || quiz.materia || null;
      if (!materiaQuiz) return [];

      const propagati = [];
      for (const s of lista) {
        if (s.id === attivoId) continue;
        if (!_quizInPianoSave(s, materiaQuiz)) continue;

        const stato = _statoRankedDi(s.id);
        // Maestro non guadagna né perde RP (lega apicale, regola esistente)
        const ind = stato.sublevelIndice || 0;
        const liv = (typeof rankedDescriviLivello === 'function') ? rankedDescriviLivello(ind) : null;
        const valori = rankedValoriRP(ind);
        const delta = corretta ? valori.corretta : valori.errata;

        const res = rankedApplicaRPSuStato(stato, delta);
        SavesCore.scriviSave(s.id, 'cm:ranked:stato', res.statoNuovo);

        // Shadow diario nel save target
        _appendShadowDiario(s.id, quiz, corretta, delta, attivoId);

        // Promo/retro nel background → la metto in coda per quel save
        if (res.transizione) {
          _accumulaTransizione(s.id, res.transizione, {
            etichetta: res.livelloDopo.etichetta,
            sublevelIndice: res.livelloDopo.sublevelIndice,
            legaIndice: res.livelloDopo.legaIndice,
          });
        }

        propagati.push({
          saveId: s.id,
          saveName: s.nome,
          delta,
          rpDopo: res.rpDopo,
          transizione: res.transizione,
          livelloDopo: res.livelloDopo.etichetta,
        });
      }
      return propagati;
    }

    // ─── Toast inline per il feedback live ───────────────────────────────
    // Mostrato dopo ogni risposta ranked: "+10 RP   ↗ +8 Vigili · +6 ASL"
    function mostraToastPropagazione(deltaAttivo, propagati) {
      const segno = deltaAttivo >= 0 ? '+' : '';
      const principale = segno + deltaAttivo + ' RP';
      let testo = principale;
      if (propagati && propagati.length > 0) {
        const arrows = propagati.map(p => {
          const segP = p.delta >= 0 ? '+' : '';
          const arrow = p.delta >= 0 ? '↗' : '↘';
          return arrow + ' ' + segP + p.delta + ' ' + p.saveName;
        }).join(' · ');
        testo = principale + '   ' + arrows;
      }

      // Toast custom (non riusa toast() perché vogliamo classi extra per gli arrow)
      const t = document.createElement('div');
      t.className = 'toast toast-rp-propaga' + (deltaAttivo < 0 ? ' neg' : '');
      t.innerHTML = '<span class="trp-main">' + _esc(principale) + '</span>' +
                    (propagati && propagati.length > 0
                      ? '<span class="trp-prop">' + propagati.map(p => {
                          const seg = p.delta >= 0 ? '+' : '';
                          const arr = p.delta >= 0 ? '↗' : '↘';
                          return '<span class="trp-item ' + (p.delta >= 0 ? 'pos' : 'neg') + '">' +
                                 arr + ' ' + seg + p.delta + ' ' + _esc(p.saveName) +
                                 '</span>';
                        }).join('') + '</span>'
                      : '');
      document.body.appendChild(t);
      setTimeout(() => t.classList.add('show'), 10);
      setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 300);
      }, 2600);
    }
    function _esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ─── Banner: riassunto transizioni "in background" al primo accesso ───
    // Chiamato dalla home Ranked. Se mentre giocavi in altri save sono
    // arrivate promozioni/retrocessioni a questo save, le mostra in un
    // overlay riassuntivo (una sola apparizione: consumate al click).
    function mostraBannerTransizioniBackgroundSeServono(saveId) {
      const trans = consumaTransizioniSave(saveId);
      if (!trans || trans.length === 0) return false;
      const promo = trans.filter(t => t.tipo === 'promozione');
      const retro = trans.filter(t => t.tipo === 'retrocessione');
      // Rank finale: prendo l'ultima transizione (quella più recente)
      const ultima = trans[trans.length - 1];
      const etichetta = (ultima.livelloDopo && ultima.livelloDopo.etichetta) || '—';

      let titolo, sottotitolo, accent;
      if (promo.length && !retro.length) {
        titolo = promo.length === 1
          ? '📥 Promozione mentre eri altrove!'
          : '📥 ' + promo.length + ' promozioni mentre eri altrove!';
        sottotitolo = 'Ora sei a <strong>' + _esc(etichetta) + '</strong> · le risposte date negli altri save che condividevano materie hanno fatto crescere anche questo.';
        accent = 'promo';
      } else if (retro.length && !promo.length) {
        titolo = retro.length === 1
          ? '📥 Retrocessione mentre eri altrove'
          : '📥 ' + retro.length + ' retrocessioni mentre eri altrove';
        sottotitolo = 'Ora sei a <strong>' + _esc(etichetta) + '</strong> · alcuni errori su quiz condivisi con altri save hanno pesato anche qui.';
        accent = 'retro';
      } else {
        titolo = '📥 ' + (promo.length + retro.length) + ' cambi di rank in background';
        sottotitolo = '<strong>' + promo.length + '</strong> promozioni e <strong>' + retro.length + '</strong> retrocessioni dalle risposte negli altri save. Ora sei a <strong>' + _esc(etichetta) + '</strong>.';
        accent = 'misto';
      }

      const ov = document.createElement('div');
      ov.className = 'bg-trans-overlay ' + accent;
      ov.innerHTML = `
        <div class="bg-trans-card">
          <div class="bg-trans-titolo">${titolo}</div>
          <div class="bg-trans-sub">${sottotitolo}</div>
          <div class="bg-trans-finale">
            <span class="bg-trans-label">Rank attuale</span>
            <span class="bg-trans-rank">${_esc(etichetta)}</span>
          </div>
          <button class="btn btn-primary bg-trans-btn">Ho capito</button>
        </div>
      `;
      document.body.appendChild(ov);
      requestAnimationFrame(() => ov.classList.add('show'));
      const chiudi = () => {
        ov.classList.remove('show');
        setTimeout(() => ov.remove(), 240);
      };
      ov.querySelector('.bg-trans-btn').addEventListener('click', chiudi);
      ov.addEventListener('click', e => { if (e.target === ov) chiudi(); });
      return true;
    }

    // ─── Popup centrato di fine batteria (Fase 9) ─────────────────────
    // Mostrato al termine del round Ranked. Riassume:
    //   - RP guadagnati/persi nel save corrente
    //   - RP propagati negli altri save (somma per ciascuno)
    //   - Eventuali promo/retro pendenti
    // Sostituisce il toast invasivo per-risposta.
    //
    // Argomenti:
    //   ctx = {
    //     saveCorrenteId, saveCorrenteName,
    //     deltaCorrente,        // RP del round nel save attivo
    //     livelloDopoCorrente?, transizioneCorrente?,
    //     propagatiPerSave: { [saveId]: {saveName, delta, transizioni, rpFinale} }
    //   }
    function mostraPopupFineBatteria(ctx) {
      if (!ctx) return;
      const dc = ctx.deltaCorrente || 0;
      const propagati = Object.values(ctx.propagatiPerSave || {});
      const segno = dc >= 0 ? '+' : '';
      const segnoCl = dc >= 0 ? 'pos' : 'neg';
      const incompleto = (ctx.roundCompleto === false);
      const rpPot = +(ctx.rpPotenziale || 0).toFixed(0);

      let titolo, sottotitolo;
      if (incompleto) {
        // Batteria interrotta in anticipo: nessun RP assegnato.
        titolo = '⏸ Batteria interrotta';
        sottotitolo = rpPot !== 0
          ? `I punti rank si guadagnano solo terminando l'intera batteria. RP potenziali persi: <strong>${rpPot >= 0 ? '+' : ''}${rpPot}</strong>. I quiz risposti restano nei contatori del giorno.`
          : `I punti rank si guadagnano solo terminando l'intera batteria. I quiz risposti restano nei contatori del giorno.`;
      } else if (ctx.recupero) {
        // Batteria di recupero errori (Fase 10)
        const suffisso = ctx.recuperoMateriaId ? ' su ' + _esc(ctx.recuperoMateriaId) : '';
        if (dc > 0) {
          titolo = '♻️ Recupero completato!' + suffisso;
          sottotitolo = 'Hai consolidato i tuoi errori. Gli ID corretti escono dalla lista "da ripadroneggiare".';
        } else if (dc < 0) {
          titolo = '♻️ Recupero concluso';
          sottotitolo = 'Alcuni errori restano aperti — riproveremo al prossimo recupero.';
        } else {
          titolo = '♻️ Recupero completato';
          sottotitolo = 'Riepilogo della sessione di recupero.';
        }
      } else if (dc > 0) {
        titolo = '🎯 Batteria completata!';
        sottotitolo = 'Bel lavoro, ecco il riepilogo punti rank.';
      } else if (dc < 0) {
        titolo = '⚠ Batteria conclusa';
        sottotitolo = 'Non è andata benissimo — ma ogni errore ti rende più forte.';
      } else {
        titolo = '🎯 Batteria completata';
        sottotitolo = 'Riepilogo punti rank di questa sessione.';
      }

      // Riga delta save corrente
      const deltaLabel = incompleto
        ? `<span class="fb-row-delta neutral" title="Punti non applicati: batteria incompleta">0 RP <span class="fb-rp-pot">(persi ${rpPot >= 0 ? '+' : ''}${rpPot})</span></span>`
        : `<span class="fb-row-delta ${segnoCl}">${segno}${dc.toFixed(0)} RP</span>`;

      const rigaCorrente = `
        <div class="fb-row principale">
          <div class="fb-row-titolo">
            <span class="fb-row-ic">${incompleto ? '⏸' : (dc >= 0 ? '🏆' : '🛡')}</span>
            <span class="fb-row-nome">${_esc(ctx.saveCorrenteName || 'Save corrente')}</span>
          </div>
          ${deltaLabel}
        </div>
        ${(!incompleto && ctx.transizioneCorrente) ? `
          <div class="fb-row-trans">
            ${ctx.transizioneCorrente === 'promozione' ? '⬆ Promozione' : '⬇ Retrocessione'}
            ${ctx.livelloDopoCorrente ? ' → <strong>' + _esc(ctx.livelloDopoCorrente) + '</strong>' : ''}
          </div>
        ` : ''}
      `;

      const righeAltri = propagati.length === 0 ? '' : `
        <div class="fb-sep">↗ Propagazione su altri save che condividevano i quiz</div>
        ${propagati.map(p => {
          const sc = p.delta >= 0 ? '+' : '';
          const cl = p.delta >= 0 ? 'pos' : 'neg';
          const arrow = p.delta >= 0 ? '↗' : '↘';
          return `
            <div class="fb-row">
              <div class="fb-row-titolo">
                <span class="fb-row-ic">${arrow}</span>
                <span class="fb-row-nome">${_esc(p.saveName)}</span>
              </div>
              <span class="fb-row-delta ${cl}">${sc}${p.delta.toFixed(0)} RP</span>
            </div>
            ${(p.transizioni && p.transizioni.length > 0) ? `
              <div class="fb-row-trans">
                ${p.transizioni.map(t => {
                  const lab = t.tipo === 'promozione' ? '⬆ Promozione' : '⬇ Retrocessione';
                  const liv = t.livello && t.livello.etichetta ? ' → <strong>' + _esc(t.livello.etichetta) + '</strong>' : '';
                  return lab + liv;
                }).join(' · ')}
              </div>
            ` : ''}
          `;
        }).join('')}
      `;

      const ov = document.createElement('div');
      ov.className = 'fb-overlay ' + (incompleto ? 'neutral' : (dc >= 0 ? 'pos' : 'neg'));
      ov.innerHTML = `
        <div class="fb-card">
          <div class="fb-titolo">${titolo}</div>
          <div class="fb-sub">${sottotitolo}</div>
          <div class="fb-rows">
            ${rigaCorrente}
            ${righeAltri}
          </div>
          <button class="btn btn-primary fb-btn">Continua</button>
        </div>
      `;
      document.body.appendChild(ov);
      requestAnimationFrame(() => ov.classList.add('show'));
      const chiudi = () => {
        ov.classList.remove('show');
        setTimeout(() => ov.remove(), 240);
      };
      ov.querySelector('.fb-btn').addEventListener('click', chiudi);
      ov.addEventListener('click', e => { if (e.target === ov) chiudi(); });
    }

    // ── Esposizione globale ──
    window.SavesPropagation = {
      propagaRPCrossSave,
      mostraToastPropagazione,   // mantenuto per retrocompatibilità — non usato
      consumaTransizioniSave,
      mostraBannerTransizioniBackgroundSeServono,
      mostraPopupFineBatteria,
    };
  })();
