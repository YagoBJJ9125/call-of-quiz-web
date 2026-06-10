  // ═══════════════════════════════════════════════════════
  // PACCHETTO — Caricamento e importazione pacchetto bando
  // ═══════════════════════════════════════════════════════

  async function caricaPacchettoSalvato() {
    const manifest  = caricaDaStorage(SK_MANIFEST);
    const programma = caricaDaStorage(SK_PROGRAMMA);

    if (!manifest || !programma) return false;

    const banche = {};
    for (const m of manifest.moduli) {
      try {
        const quizCat = await dbGet(SK_BANCA_CAT_PFX + m.materia_id);
        if (quizCat) {
          banche[m.materia_id] = { quiz: quizCat, categorizzati: quizCat };
        }
      } catch (err) {
        console.error('Errore caricamento banca', m.materia_id, err);
      }
    }

    STATE.pacchetto = { manifest, programma, banche };
    return true;
  }

  // Carica il pacchetto dal bundle incluso nell'app (js/data-bundle.js).
  // Pensato per la distribuzione ai tester: i dati sono sempre quelli del
  // bundle — aggiornati ad ogni rigenerazione — senza importazione manuale.
  function caricaPacchettoDaBundle(bundle) {
    const banche = {};
    for (const mid of Object.keys(bundle.banche || {})) {
      const arr = bundle.banche[mid] || [];
      banche[mid] = { quiz: arr, categorizzati: arr };
    }
    STATE.pacchetto = {
      manifest:  bundle.manifest,
      programma: bundle.programma,
      banche,
    };
    STATE._analisiCatalogo = null;   // invalida la cache dell'Analisi
    return true;
  }

  function avviaImportazione() {
    selezionaFileMultipli();
  }

  document.getElementById('filePacchetto').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length) processaFiles(files);
  });

  async function processaFiles(files) {
    files = files.filter(f => f.name.toLowerCase().endsWith('.json'));
    if (!files.length) {
      toast('Nessun file .json trovato', true);
      return;
    }

    toast(`Lettura ${files.length} file in corso...`);

    let manifest = null;
    let programma = null;
    const banche = [];
    const errori = [];

    for (const file of files) {
      try {
        const txt  = await file.text();
        const data = JSON.parse(txt);

        if (data && data.bando && Array.isArray(data.moduli)) {
          manifest = data;
        } else if (data && Array.isArray(data.materie)) {
          programma = data;
        } else if (Array.isArray(data) && data.length > 0 && data[0].domanda) {
          let materia_id = null;
          if (data[0].categorizzazione && data[0].categorizzazione.materia_id) {
            materia_id = data[0].categorizzazione.materia_id;
          }
          if (!materia_id) {
            const m = file.name.match(/^(M\d+_\w+?)(?:_categorizzato)?\.json$/);
            if (m) materia_id = m[1];
          }
          if (materia_id) {
            banche.push({ materia_id, data, hasCategorizzazione: !!(data[0].categorizzazione) });
          } else {
            errori.push(`${file.name}: impossibile determinare materia_id`);
          }
        } else {
          errori.push(`${file.name}: formato non riconosciuto`);
        }
      } catch (err) {
        errori.push(`${file.name}: ${err.message}`);
      }
    }

    const problemi = [];
    if (!manifest)          problemi.push('manifest.json non trovato');
    if (!programma)         problemi.push('programma_studio.json non trovato');
    if (banche.length === 0) problemi.push('nessuna banca dati trovata');

    if (problemi.length) {
      toast('Errori: ' + problemi.join(', '), true);
      console.warn('Dettagli:', errori);
      return;
    }

    salvaInStorage(SK_MANIFEST,  manifest);
    salvaInStorage(SK_PROGRAMMA, programma);

    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(SK_BANCA_PFX) || key.startsWith(SK_BANCA_CAT_PFX)) {
          localStorage.removeItem(key);
        }
      }
    } catch (e) { console.warn('Pulizia vecchi dati:', e); }

    let okBanche = 0;
    toast(`Salvataggio ${banche.length} banche dati in corso...`);
    for (const b of banche) {
      try {
        await dbSet(SK_BANCA_CAT_PFX + b.materia_id, b.data);
        okBanche++;
      } catch (err) {
        errori.push(`Errore salvataggio ${b.materia_id}: ${err.message}`);
        console.error('Errore salvataggio', b.materia_id, err);
      }
    }

    toast(`✅ Importati: manifest, programma e ${okBanche}/${banche.length} banche dati`);
    if (errori.length) console.warn('Avvisi:', errori);
    setTimeout(() => location.reload(), 1500);
  }
