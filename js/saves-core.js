  // ═══════════════════════════════════════════════════════
  // SAVES-CORE — Multi-save manager (Fase 1: foundation)
  //
  // Modello "Playstation":
  //   • BANCHE DATI  — libreria globale (window.CM_DATA_BUNDLE + cm:banca:*)
  //   • PIANI        — subset di materie per ogni save
  //   • SAVE         — partite indipendenti (RP, missioni, diario, badge)
  //
  // Verità oggettiva (GLOBALE, condivisa da tutti i save):
  //   - cm:progress              (risposte di sempre)
  //   - cm:carriera:padroneggiati  (padroneggiamento globale)
  //   - cm:saves:lista / cm:saves:attivo
  //
  // Stato di gioco (PER-SAVE, namespace cm:save:{id}:<key>):
  //   - cm:carriera:profilo / diario / xp / sessione / missione_run / anticipi_oggi
  //   - cm:ranked:profilo / stato / daily
  //
  // Strategia di Fase 1: MONKEY-PATCH NON INVASIVO.
  // `salvaInStorage` e `caricaDaStorage` di storage.js vengono wrappati per
  // intercettare le chiavi PER-SAVE e riscriverle automaticamente nel
  // namespace del save attivo. Il codice di Carriera/Ranked non sa di nulla
  // e continua a usare le sue costanti SK_CAR_* / SK_RANKED_* esistenti.
  //
  // Migrazione al primo avvio: se trovo dati legacy (cm:carriera:diario, ...)
  // ma nessuna lista save, creo automaticamente "Bando RIPAM 2026" e ci
  // sposto sotto tutto il PER-SAVE state. Backup difensivo preservato.
  // ═══════════════════════════════════════════════════════

  (function () {
    'use strict';

    // ── Chiavi globali del save manager ──
    const SK_SAVES_LISTA  = 'cm:saves:lista';
    const SK_SAVES_ATTIVO = 'cm:saves:attivo';
    const SK_BACKUP_PFX   = 'cm:backup:';

    // ── Chiavi PER-SAVE (auto-instradate al save attivo) ──
    // Tutto il resto (cm:progress, cm:carriera:padroneggiati, cm:manifest,
    // cm:banca:*, cm:impostazioni:*, cm:saves:*, cm:backup:*) resta GLOBAL.
    const PER_SAVE_KEYS = new Set([
      'cm:carriera:profilo',
      'cm:carriera:diario',
      'cm:carriera:xp',
      'cm:carriera:sessione',
      'cm:carriera:anticipi_oggi',
      'cm:carriera:missione_run',
      'cm:ranked:profilo',
      'cm:ranked:stato',
      'cm:ranked:daily',
      // Prova scritta: diario tentativi (performance) → PER-SAVE.
      // (Lo stato "studiato" dei quesiti è invece GLOBALE, vedi scritto.js.)
      'cm:scritto:diario',
    ]);

    // ── Save attivo (id corrente) ──
    let _activeSaveId = null;

    // ── Resolver: data una chiave, restituisce quella effettiva su storage ──
    function _resolveKey(key) {
      if (typeof key !== 'string') return key;
      if (!PER_SAVE_KEYS.has(key)) return key;
      if (!_activeSaveId) return key;  // safety: nessun save attivo → fallback legacy
      // 'cm:carriera:diario' → 'cm:save:{id}:carriera:diario'
      return 'cm:save:' + _activeSaveId + ':' + key.substring(3);
    }

    // ── Monkey-patch di storage.js ──
    const _origSalva  = window.salvaInStorage;
    const _origCarica = window.caricaDaStorage;
    if (typeof _origSalva !== 'function' || typeof _origCarica !== 'function') {
      console.error('[saves-core] storage.js non caricato prima di saves-core.js!');
      return;
    }
    window.salvaInStorage = function (key, data) {
      return _origSalva(_resolveKey(key), data);
    };
    window.caricaDaStorage = function (key) {
      return _origCarica(_resolveKey(key));
    };

    // ── API di base ──
    function getListaSaves() {
      return _origCarica(SK_SAVES_LISTA) || [];
    }
    function _salvaListaSaves(lista) {
      _origSalva(SK_SAVES_LISTA, lista);
    }
    function getSaveAttivoId() { return _activeSaveId; }
    function getSaveAttivo() {
      if (!_activeSaveId) return null;
      return getListaSaves().find(s => s.id === _activeSaveId) || null;
    }

    function _genId() {
      return 'save_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    function creaSave(opts) {
      opts = opts || {};
      const id = opts.id || _genId();
      const save = {
        id,
        nome: opts.nome || 'Nuovo Save',
        descrizione: opts.descrizione || '',
        dataCreazione: new Date().toISOString(),
        dataUltimoUso: new Date().toISOString(),
        // Piano di studio: in Fase 1 solo materieIds (subset di moduli del bundle)
        piano: opts.piano || { materieIds: [] },
        // Configurazione iniziale ranked (Fase 1: default, useremo i suggerimenti
        // dalla mappa % → rank nelle fasi successive)
        rankIniziale: opts.rankIniziale || 0,
        // Id del preset bando da cui il piano è stato inizializzato (opzionale,
        // vedi bandi_catalogo.json). Serve solo a mostrare il badge "da preset X"
        // e a offrire il bottone "ri-applica preset" nel wizard di modifica.
        bandoId: opts.bandoId || null,
      };
      const lista = getListaSaves();
      lista.push(save);
      _salvaListaSaves(lista);
      return save;
    }

    function caricaSave(id) {
      const lista = getListaSaves();
      const s = lista.find(x => x.id === id);
      if (!s) { console.warn('[saves-core] save non trovato:', id); return false; }
      _activeSaveId = id;
      _origSalva(SK_SAVES_ATTIVO, id);
      s.dataUltimoUso = new Date().toISOString();
      _salvaListaSaves(lista);
      return true;
    }

    function eliminaSave(id) {
      const lista = getListaSaves();
      const trovato = lista.find(s => s.id === id);
      if (!trovato) return false;
      const nuovaLista = lista.filter(s => s.id !== id);
      _salvaListaSaves(nuovaLista);
      // Purge di tutte le chiavi del save in localStorage
      const prefix = 'cm:save:' + id + ':';
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) toRemove.push(k);
      }
      toRemove.forEach(k => localStorage.removeItem(k));
      // Se era l'attivo, switcha al primo disponibile (o nessuno)
      if (_activeSaveId === id) {
        _activeSaveId = nuovaLista[0] ? nuovaLista[0].id : null;
        if (_activeSaveId) _origSalva(SK_SAVES_ATTIVO, _activeSaveId);
        else localStorage.removeItem(SK_SAVES_ATTIVO);
      }
      return true;
    }

    function rinominaSave(id, nuovoNome) {
      const lista = getListaSaves();
      const s = lista.find(x => x.id === id);
      if (!s) return false;
      s.nome = String(nuovoNome || '').trim() || s.nome;
      _salvaListaSaves(lista);
      return true;
    }

    function aggiornaPianoSave(id, piano) {
      const lista = getListaSaves();
      const s = lista.find(x => x.id === id);
      if (!s) return false;
      s.piano = piano || { materieIds: [] };
      _salvaListaSaves(lista);
      return true;
    }

    function duplicaSave(id, nuovoNome) {
      const src = getListaSaves().find(s => s.id === id);
      if (!src) return null;
      // Crea il nuovo save (struttura piano clonata)
      const nuovo = creaSave({
        nome: nuovoNome || (src.nome + ' (copia)'),
        descrizione: src.descrizione,
        piano: JSON.parse(JSON.stringify(src.piano || { materieIds: [] })),
        rankIniziale: src.rankIniziale || 0,
      });
      // NB: NON copio diario/RP — il nuovo save parte vergine (i progressi
      // arriveranno via propagazione live nelle fasi successive). Per ora
      // questo è il comportamento "save vuoto pronto".
      return nuovo;
    }

    // ─── Migrazione legacy → primo save ────────────────────────────
    function _migrateLegacyToFirstSave() {
      const listaAttuale = getListaSaves();
      if (listaAttuale.length > 0) return false;  // già migrato o saves già creati

      // Verifica presenza dati legacy (chi ha già usato l'app prima del multisave)
      const chiaviLegacy = [];
      PER_SAVE_KEYS.forEach(k => { if (localStorage.getItem(k) !== null) chiaviLegacy.push(k); });

      if (chiaviLegacy.length > 0) {
        // ── Backup difensivo (rollback manuale in caso di disastro) ──
        const backup = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('cm:') && !k.startsWith(SK_BACKUP_PFX)) {
            try { backup[k] = localStorage.getItem(k); } catch (_) {}
          }
        }
        try {
          _origSalva(SK_BACKUP_PFX + 'pre-multisave-' + Date.now(), backup);
        } catch (e) {
          console.warn('[saves-core] backup pre-migration fallito:', e);
        }

        // ── Crea save default ──
        const save = creaSave({
          id: 'save_default_ripam_2026',
          nome: 'Bando RIPAM 2026',
          descrizione: 'Save creato automaticamente dai tuoi dati precedenti.',
          piano: { materieIds: [] },  // popolato da app.js dopo load pacchetto
        });

        // ── Sposta chiavi per-save nel namespace del save ──
        chiaviLegacy.forEach(k => {
          const v = localStorage.getItem(k);
          if (v !== null) {
            const newKey = 'cm:save:' + save.id + ':' + k.substring(3);
            localStorage.setItem(newKey, v);
            localStorage.removeItem(k);
          }
        });

        _activeSaveId = save.id;
        _origSalva(SK_SAVES_ATTIVO, save.id);

        console.info(
          '[saves-core] Migrazione completata: dati legacy → save "%s" (id=%s)',
          save.nome, save.id
        );
        return true;
      }

      // Nessun dato legacy → crea save vuoto neutro (sarà personalizzato in Fase 2)
      const save = creaSave({
        nome: 'Save 1',
        descrizione: 'Primo save (verrà personalizzato).',
        piano: { materieIds: [] },
      });
      _activeSaveId = save.id;
      _origSalva(SK_SAVES_ATTIVO, save.id);
      return false;
    }

    // ── Bootstrap: chiamato da app.js in init() PRIMA di tutto il resto ──
    function initSaves() {
      _migrateLegacyToFirstSave();

      // Carica il save indicato come attivo (se valido)
      const attivoSalvato = _origCarica(SK_SAVES_ATTIVO);
      const lista = getListaSaves();
      if (attivoSalvato && lista.some(s => s.id === attivoSalvato)) {
        _activeSaveId = attivoSalvato;
      } else if (lista.length > 0) {
        _activeSaveId = lista[0].id;
        _origSalva(SK_SAVES_ATTIVO, _activeSaveId);
      } else {
        _activeSaveId = null;
      }

      const attivo = getSaveAttivo();
      console.info(
        '[saves-core] Save attivo: %s  (id=%s, %d save totali)',
        attivo ? attivo.nome : '∅',
        _activeSaveId || '∅',
        lista.length
      );
    }

    // ── Helper: popola il piano del save con TUTTE le materie del pacchetto ──
    // Usato da app.js dopo che il pacchetto è caricato, per dare al save
    // default (creato da migrazione) un piano completo "tutto incluso".
    function popolaPianoDefaultSeVuoto() {
      const save = getSaveAttivo();
      if (!save) return;
      if (save.piano && save.piano.materieIds && save.piano.materieIds.length > 0) return;
      if (!STATE.pacchetto || !STATE.pacchetto.manifest || !STATE.pacchetto.manifest.moduli) return;
      const tutteMaterie = STATE.pacchetto.manifest.moduli.map(m => m.materia_id);
      save.piano = { materieIds: tutteMaterie };
      const lista = getListaSaves();
      const idx = lista.findIndex(s => s.id === save.id);
      if (idx >= 0) { lista[idx] = save; _salvaListaSaves(lista); }
      console.info('[saves-core] piano default popolato con %d materie', tutteMaterie.length);
    }

    // ── Migrazione: aggiunge ai piani ESISTENTI le materie introdotte dopo
    // che il piano dell'utente era già stato popolato. I save "tutto incluso"
    // (piano vuoto = nessun filtro) e i save nuovi vedono già tutto; qui si
    // toccano solo i piani non vuoti. Ogni materia è aggiunta UNA volta sola
    // per save (flag _materieMigrate): se l'utente la rimuove poi, non torna.
    // AGGIORNARE questa lista quando si aggiungono materie in un update.
    const MATERIE_AGGIUNTE = ['M16_informatica_ict'];
    function migraNuoveMaterie() {
      if (!MATERIE_AGGIUNTE.length) return;
      const lista = getListaSaves();
      let cambiato = false;
      for (const s of lista) {
        if (!s.piano || !Array.isArray(s.piano.materieIds) || s.piano.materieIds.length === 0) continue;
        if (!Array.isArray(s._materieMigrate)) s._materieMigrate = [];
        for (const id of MATERIE_AGGIUNTE) {
          if (s._materieMigrate.includes(id)) continue;       // già migrata su questo save
          if (!s.piano.materieIds.includes(id)) {
            s.piano.materieIds.push(id);
            console.info('[saves-core] migrata materia %s nel piano del save %s', id, s.id);
          }
          s._materieMigrate.push(id);
          cambiato = true;
        }
      }
      if (cambiato) _salvaListaSaves(lista);
    }

    // ─── Accessor diretti per save SPECIFICI (bypass monkey-patch) ────────
    // Servono alla propagazione live cross-save: per scrivere RP nello stato
    // di un save diverso da quello attivo, le chiamate normali NON vanno bene
    // (verrebbero comunque instradate al save attivo). Questi helper accedono
    // direttamente alla chiave fisica `cm:save:{id}:<sottoChiave>`.
    //
    // chiavePerSave: una delle PER_SAVE_KEYS (es. 'cm:carriera:diario',
    //                'cm:ranked:stato', ...). Per le chiavi globali usa
    //                direttamente caricaDaStorage/salvaInStorage senza save id.
    function _chiaveFisicaPerSave(saveId, chiavePerSave) {
      if (!PER_SAVE_KEYS.has(chiavePerSave)) {
        console.warn('[saves-core] chiave non per-save:', chiavePerSave);
        return chiavePerSave;
      }
      return 'cm:save:' + saveId + ':' + chiavePerSave.substring(3);
    }
    function leggiSave(saveId, chiavePerSave) {
      return _origCarica(_chiaveFisicaPerSave(saveId, chiavePerSave));
    }
    function scriviSave(saveId, chiavePerSave, valore) {
      return _origSalva(_chiaveFisicaPerSave(saveId, chiavePerSave), valore);
    }

    // ─── Esporta save in JSON ──────────────────────────────────────────
    // Restituisce un blob JSON con: meta + tutti i dati per-save (diario,
    // ranked-stato, ranked-daily, carriera profilo/xp/sessione/...).
    // NB: padroneggiamento e progress sono globali, NON inclusi nell'export
    // (sono dell'utente, non del save).
    function esportaSave(saveId) {
      const sv = getListaSaves().find(s => s.id === saveId);
      if (!sv) return null;
      const data = {};
      PER_SAVE_KEYS.forEach(k => {
        const v = leggiSave(saveId, k);
        if (v !== null && v !== undefined) data[k] = v;
      });
      return {
        format: 'cm-save-export',
        version: 1,
        exportedAt: new Date().toISOString(),
        meta: {
          id: sv.id,
          nome: sv.nome,
          descrizione: sv.descrizione,
          dataCreazione: sv.dataCreazione,
          dataUltimoUso: sv.dataUltimoUso,
          piano: sv.piano,
          rankIniziale: sv.rankIniziale,
        },
        data,
      };
    }

    // ─── Importa save da JSON ──────────────────────────────────────────
    // Crea un nuovo save (nuovo id) con i dati del JSON. Il nome può essere
    // sovrascritto per evitare collisioni. Ritorna il save creato o null.
    function importaSave(payload, nuovoNome) {
      if (!payload || payload.format !== 'cm-save-export') {
        throw new Error('Formato file non riconosciuto');
      }
      if (!payload.meta) throw new Error('Manca la sezione "meta" nel file');
      const meta = payload.meta;
      const sv = creaSave({
        nome: (nuovoNome && nuovoNome.trim()) || (meta.nome || 'Save importato'),
        descrizione: meta.descrizione || ('Importato il ' + new Date().toLocaleDateString('it-IT')),
        piano: meta.piano || { materieIds: [] },
        rankIniziale: meta.rankIniziale || 0,
      });
      // Riversa i dati per-save nel nuovo namespace
      const data = payload.data || {};
      Object.keys(data).forEach(k => {
        if (PER_SAVE_KEYS.has(k)) scriviSave(sv.id, k, data[k]);
      });
      return sv;
    }

    // ─── Helper "materie ammesse dal piano del save attivo" ────────────
    // Ritorna:
    //   - Set<materia_id> se il save attivo ha un piano non vuoto
    //   - null in tutti gli altri casi (= nessun filtro, retrocompatibile:
    //     niente save, save senza piano, piano vuoto)
    // Usato da Carriera/Ranked/Libero per filtrare il pool quiz.
    function getMaterieAmmessePianoAttivo() {
      const sv = getSaveAttivo();
      if (!sv || !sv.piano || !Array.isArray(sv.piano.materieIds)) return null;
      if (sv.piano.materieIds.length === 0) return null;
      return new Set(sv.piano.materieIds);
    }

    // ─── Filtro completo del piano: materia + argomenti esclusi ───────
    // Estensione che supporta granularità a livello argomento:
    //   piano: { materieIds: [...], argomentiEsclusi: { 'M01_x': ['A01','A03'] } }
    // L'esclusione argomenti è OPZIONALE e retrocompatibile:
    //   - Se argomentiEsclusi assente o vuoto → solo filtro materie
    //   - Se argomentiEsclusi[materia] esiste → quei quiz con quell'arg sono FUORI
    //   - Quiz senza argomento_id (= argomento_id null/undefined): SEMPRE inclusi
    //     se la materia è in piano (sono il "resto" della materia)
    //
    // Ritorna un oggetto:
    //   { quizPassa(materiaId, argomentoId) → bool,
    //     materieAmmesse: Set|null,
    //     argomentiEsclusi: { materiaId: Set<argId> }|null }
    //
    // Se non c'è filtro: ritorna oggetto con quizPassa = () => true (tutto passa).
    function getFiltroPianoAttivo() {
      const sv = getSaveAttivo();
      const piano = sv && sv.piano;
      const materieIds = piano && Array.isArray(piano.materieIds) ? piano.materieIds : [];
      // Nessun filtro: tutto passa (retrocompatibile)
      if (materieIds.length === 0) {
        return {
          quizPassa: () => true,
          materieAmmesse: null,
          argomentiEsclusi: null,
        };
      }
      const materieSet = new Set(materieIds);
      const esclMap = {};
      const esclRaw = (piano && piano.argomentiEsclusi) || {};
      Object.keys(esclRaw).forEach(mid => {
        if (Array.isArray(esclRaw[mid]) && esclRaw[mid].length > 0) {
          esclMap[mid] = new Set(esclRaw[mid]);
        }
      });
      return {
        quizPassa: function (materiaId, argomentoId) {
          if (!materieSet.has(materiaId)) return false;
          // Quiz senza argomento_id: sempre incluso se la materia è in piano
          if (argomentoId == null) return true;
          const esc = esclMap[materiaId];
          if (esc && esc.has(argomentoId)) return false;
          return true;
        },
        materieAmmesse: materieSet,
        argomentiEsclusi: esclMap,
      };
    }

    // ── Esposizione globale ──
    window.SavesCore = {
      init: initSaves,
      popolaPianoDefaultSeVuoto,
      migraNuoveMaterie,
      getListaSaves,
      getSaveAttivo,
      getSaveAttivoId,
      creaSave,
      caricaSave,
      eliminaSave,
      rinominaSave,
      duplicaSave,
      aggiornaPianoSave,
      esportaSave,
      importaSave,
      // Accessor diretti cross-save (propagazione live)
      leggiSave,
      scriviSave,
      // Filtro materie dal piano del save attivo
      getMaterieAmmessePianoAttivo,
      getFiltroPianoAttivo,
      PER_SAVE_KEYS,
    };
  })();
