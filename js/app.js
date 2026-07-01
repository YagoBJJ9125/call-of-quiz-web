  // ═══════════════════════════════════════════════════════
  // APP — Bootstrap: init, window exports
  // ═══════════════════════════════════════════════════════

  // Mostra la versione reale dell'app nella topbar (dinamica).
  // In Tauri la legge dal binario (app.getVersion) → si aggiorna da sola dopo
  // ogni auto-update. In web mostra una sigla generica.
  async function _mostraVersione() {
    const el = document.getElementById('appVersion');
    if (!el) return;
    try {
      const T = window.__TAURI__;
      if (T) {
        if (T.app && typeof T.app.getVersion === 'function') {
          el.textContent = 'v' + (await T.app.getVersion());
          return;
        }
        if (T.core && typeof T.core.invoke === 'function') {
          const v = await T.core.invoke('plugin:app|version');
          if (v) { el.textContent = 'v' + v; return; }
        }
      }
    } catch (_) {}
    el.textContent = 'Web';
  }

  async function init() {
    _mostraVersione();
    // Mostra un loader nella main area mentre carica
    document.getElementById('main').innerHTML = `
      <div class="loading">Caricamento pacchetto</div>
    `;

    // ─── Save manager: PRIMA cosa in assoluto ───
    // Esegue migrazione legacy (se serve), seleziona il save attivo e da qui
    // in poi tutte le chiamate a salvaInStorage/caricaDaStorage per chiavi
    // PER-SAVE (cm:carriera:*, cm:ranked:*) vengono auto-instradate al
    // namespace del save attivo. Il resto del codice non se ne accorge.
    if (window.SavesCore) {
      try { window.SavesCore.init(); }
      catch (e) { console.error('SavesCore.init fallito:', e); }
    }

    try {
      let caricato;
      if (window.CM_DATA_BUNDLE && window.CM_DATA_BUNDLE.manifest) {
        // Dati inclusi nell'app (bundle): caricamento automatico, sempre
        // aggiornato. Nessuna importazione manuale richiesta ai tester.
        caricato = caricaPacchettoDaBundle(window.CM_DATA_BUNDLE);
      } else {
        // Nessun bundle presente: modalità classica con import manuale.
        caricato = await caricaPacchettoSalvato();
      }
      // Se il save attivo non ha ancora un piano popolato (es. appena
      // migrato o appena creato vuoto), gli diamo TUTTE le materie del
      // pacchetto come default. L'utente può poi restringerlo a piacere.
      if (window.SavesCore && caricato) {
        try { window.SavesCore.popolaPianoDefaultSeVuoto(); }
        catch (e) { console.warn('popolaPianoDefaultSeVuoto:', e); }
        // Aggiunge ai piani già popolati le materie introdotte con gli update
        // (es. M16 Informatica e ICT), così compaiono anche per chi ha già un save.
        try { window.SavesCore.migraNuoveMaterie(); }
        catch (e) { console.warn('migraNuoveMaterie:', e); }
      }
      aggiornaCountdown();
      if (caricato) {
        renderDashboard();
      } else {
        renderEmptyState();
      }
    } catch (err) {
      console.error('Errore init:', err);
      renderEmptyState();
      toast('Errore caricamento pacchetto: ' + err.message, true);
    }
    // Mascotte camminante (desktop pet) — in basso a sinistra, su tutte le pagine
    avviaMascotteCamminante();
    // PG "tifosi" accanto ai titoli Ranked, con vignette occasionali
    avviaPgTifosi();
    // Aspetto: applica lo stato dei toggle sfondi (header/page/sidebar)
    applicaAspetto();
    // UI multi-save: chip in topbar + voce sidebar "Piani & Partite"
    if (window.SavesUI) {
      try { window.SavesUI.init(); }
      catch (e) { console.error('SavesUI.init:', e); }
    }
    // Pannello Bandi: patch navigazione pagina 'admin-bandi' (innocuo se mai
    // raggiunta — la voce in Impostazioni compare solo se AdminPanel.enabled).
    if (window.AdminPanel && window.AdminPanel._init) {
      try { window.AdminPanel._init(); }
      catch (e) { console.error('AdminPanel._init:', e); }
    }
    // Backup automatici rotanti (solo Tauri): avvia lo scheduler.
    if (window.AutoBackup && window.AutoBackup.enabled) {
      try { window.AutoBackup.start(); }
      catch (e) { console.error('AutoBackup.start:', e); }
    }
    // Auto-update (solo Tauri): controllo all'avvio + periodico.
    if (window.AppUpdater && window.AppUpdater.enabled) {
      try { window.AppUpdater.startAutoCheck(); }
      catch (e) { console.error('AppUpdater.startAutoCheck:', e); }
    }
  }

  // ═══════════════════════════════════════════════════════
  // MASCOTTE CAMMINANTE — personaggio animato in basso a sinistra
  // Cammina avanti e indietro in una piccola zona; al click salta,
  // si schiaccia/allunga (squash & stretch) e dice una frase buffa.
  // Usa un'unica immagine PNG trasparente: assets/camminatore.png
  // ═══════════════════════════════════════════════════════
  function avviaMascotteCamminante() {
    if (document.getElementById('mascotWalker')) return;

    const w = document.createElement('div');
    w.id = 'mascotWalker';
    w.innerHTML = `
      <div class="mw-bubble" id="mwBubble"></div>
      <div class="mw-flip" id="mwFlip">
        <img class="mw-sprite" id="mwSprite" src="assets/camminatore.png" alt="" draggable="false"
             onerror="var n=document.getElementById('mascotWalker'); if(n) n.remove();">
      </div>
    `;
    document.body.appendChild(w);

    const flip   = document.getElementById('mwFlip');
    const sprite = document.getElementById('mwSprite');
    const bubble = document.getElementById('mwBubble');
    if (!flip || !sprite || !bubble) return;

    const MIN_X = 6, MAX_X = 172;
    let x = MIN_X, dir = 1, inAzione = false;

    // Ciclo di camminata: muove il contenitore avanti/indietro e gira il verso
    setInterval(() => {
      if (inAzione) return;
      x += dir * 1.3;
      if (x >= MAX_X) { x = MAX_X; dir = -1; }
      if (x <= MIN_X) { x = MIN_X; dir =  1; }
      w.style.transform   = 'translateX(' + x.toFixed(1) + 'px)';
      flip.style.transform = 'scaleX(' + dir + ')';
    }, 45);

    const frasi = [
      'Ripassa, ripassa! 📚', 'Il concorso trema 😼', 'Dai che spacchi tutto! 💥',
      'Quiz quiz quiz!', 'Ce la fai, fidati 🐾', 'Un passo avanti anche oggi!',
      'Boop! 👆', 'Studia ora, festeggia poi 🎉', 'Pausa? Solo una, eh!',
      'Forza, futuro vincitore!', 'Ancora un round? 🔥'
    ];

    sprite.addEventListener('click', () => {
      if (inAzione) return;
      inAzione = true;
      sprite.classList.add('mw-salto');
      bubble.textContent = frasi[Math.floor(Math.random() * frasi.length)];
      bubble.classList.add('mw-bubble-on');
      setTimeout(() => { sprite.classList.remove('mw-salto'); inAzione = false; }, 720);
      setTimeout(() => bubble.classList.remove('mw-bubble-on'), 2800);
    });
  }

  // Espongo globalmente alcune funzioni per gli onclick inline
  window.avviaImportazione = avviaImportazione;
  window.selezionaCartella = selezionaCartella;
  window.selezionaFileMultipli = selezionaFileMultipli;
  window.closeModal = closeModal;
  window.cancellaTutto = cancellaTutto;
  // Simulatore quiz
  window.renderAllenamentoLibero = renderAllenamentoLibero;
  window.toggleMateria = toggleMateria;
  window.toggleArgomento = toggleArgomento;
  window.toggleEspandi = toggleEspandi;
  window.quickPickAll = quickPickAll;
  window.quickPickNone = quickPickNone;
  window.quickPickComuni = quickPickComuni;
  window.quickPickPesoAlto = quickPickPesoAlto;
  window.setPool = setPool;
  window.setModalita = setModalita;
  window.setNQuiz = setNQuiz;
  window.setTimerMode = setTimerMode;
  window.setOrdine = setOrdine;
  window.setIgnoraPiano = setIgnoraPiano;
  window.avviaBatteria = avviaBatteria;
  window.rispondiQuiz = rispondiQuiz;
  window.saltaQuiz = saltaQuiz;
  window.quizAvanti = quizAvanti;
  window.vaiAQuiz = vaiAQuiz;
  window.terminaBatteria = terminaBatteria;
  window.ripetiSoloErrori = ripetiSoloErrori;
  window.navigaA = navigaA;
  window.aggiornaNavSidebar = aggiornaNavSidebar;
  // Analisi Quiz Materie (Step D)
  window.renderAnalisiMaterie = renderAnalisiMaterie;
  window._scaricaExportIA     = _scaricaExportIA;
  // Helper utilizzati negli onclick inline dei modali (es. export IA)
  window.toast                = toast;

  // Fase 2: su Tauri attendiamo l'idratazione del DB SQLite prima di init().
  // Su web __storageReady è già risolta (Promise.resolve), quindi parte subito.
  (window.__storageReady || Promise.resolve())
    .then(init)
    .catch((e) => { console.error('storage bootstrap fallito, avvio comunque:', e); init(); });
