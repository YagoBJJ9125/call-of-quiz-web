  // ═══════════════════════════════════════════════════════
  // SYNC-CORE — Account utente + sincronizzazione cloud dei progressi.
  //
  // Backend: Supabase (auth email+password via GoTrue REST, snapshot in
  // tabella `snapshots` via PostgREST). Nessun SDK: solo fetch, coerente
  // con l'app senza bundler. La chiave `anon` è pubblica by-design: la
  // sicurezza sta nelle Row Level Security policy (ogni utente legge e
  // scrive SOLO la propria riga).
  //
  // Il payload sincronizzato è lo snapshot completo di BackupCore
  // (tutti i save, progressi, ranked, flashcard, impostazioni), MENO le
  // chiavi cm:sync:* (sessione locale del dispositivo, non deve viaggiare).
  //
  // Politica di sincronizzazione (v1, semplice e onesta):
  //  - al boot, PRIMA che l'app si avvii: se il cloud è più recente
  //    dell'ultimo sync di questo dispositivo → si scarica e ripristina;
  //  - dopo ogni scrittura locale (debounce 45s), all'uscita e ogni 5 min:
  //    se ci sono modifiche locali → si carica sul cloud;
  //  - ultimo-che-scrive-vince. Caso limite (stesso account modificato su
  //    due dispositivi SENZA sync di mezzo): vince il più recente, l'altro
  //    viene avvisato con un toast.
  //
  // CONFIGURAZIONE: compilare i due valori qui sotto dopo aver creato il
  // progetto su supabase.com (vedi GUIDA-SUPABASE.md nel repo). Finché
  // sono vuoti, tutta la sezione account in Impostazioni mostra
  // "non configurato" e il resto dell'app non cambia di una virgola.
  // ═══════════════════════════════════════════════════════
  (function () {
    'use strict';

    // ── CONFIG (da GUIDA-SUPABASE.md) ──
    const SUPABASE_URL = '';        // es. 'https://abcdefgh.supabase.co'
    const SUPABASE_ANON_KEY = '';   // chiave "anon public" del progetto

    const SK_SESSIONE = 'cm:sync:sessione';   // {access_token, refresh_token, scadeA, user:{id,email,nick}}
    const SK_ULTIMO   = 'cm:sync:ultimo';     // {at: iso, verso: 'push'|'pull'}
    const SK_SPORCO   = 'cm:sync:sporco';     // '1' se ci sono modifiche locali non pushate
    const DEBOUNCE_MS = 45000;
    const PERIODICO_MS = 5 * 60000;

    function configurato() { return !!(SUPABASE_URL && SUPABASE_ANON_KEY); }

    // Storage di sessione: SEMPRE localStorage diretto (mai instradato nei
    // save, mai dentro i backup → escluso dal payload e preservato al restore).
    function _leggi(k)    { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } }
    function _scrivi(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
    function _togli(k)    { try { localStorage.removeItem(k); } catch (_) {} }

    function sessione() { return _leggi(SK_SESSIONE); }
    function loggato()  { return !!(sessione() && sessione().refresh_token); }
    function utente()   { const s = sessione(); return (s && s.user) || null; }

    // ─── Auth (GoTrue REST) ───
    async function _authFetch(percorso, body) {
      const res = await fetch(SUPABASE_URL + '/auth/v1' + percorso, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.msg || data.message || data.error_description || data.error || ('errore ' + res.status);
        throw new Error(_msgItaliano(msg));
      }
      return data;
    }
    function _msgItaliano(msg) {
      const m = String(msg);
      if (/already registered/i.test(m)) return 'Esiste già un account con questa email.';
      if (/invalid login credentials/i.test(m)) return 'Email o password sbagliate.';
      if (/at least 6 characters/i.test(m)) return 'La password deve avere almeno 6 caratteri.';
      if (/valid email/i.test(m)) return 'Inserisci una email valida.';
      if (/rate limit/i.test(m)) return 'Troppi tentativi: aspetta un minuto e riprova.';
      return m;
    }
    function _salvaSessione(data, nickFallback) {
      const u = data.user || {};
      _scrivi(SK_SESSIONE, {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        scadeA: Date.now() + ((data.expires_in || 3600) - 90) * 1000,
        user: {
          id: u.id,
          email: u.email,
          nick: (u.user_metadata && u.user_metadata.nick) || nickFallback || (u.email || '').split('@')[0],
        },
      });
    }

    async function registra(nick, email, password) {
      if (!configurato()) throw new Error('Sincronizzazione non configurata.');
      const data = await _authFetch('/signup', {
        email: email.trim(), password,
        data: { nick: (nick || '').trim() },
      });
      // Se la conferma email è disattivata (consigliato, vedi guida) la
      // risposta contiene già la sessione completa.
      if (data.access_token) { _salvaSessione(data, nick); return true; }
      throw new Error('Account creato: conferma l\'email ricevuta, poi fai Accedi.');
    }

    async function accedi(email, password) {
      if (!configurato()) throw new Error('Sincronizzazione non configurata.');
      const data = await _authFetch('/token?grant_type=password', { email: email.trim(), password });
      _salvaSessione(data);
      return true;
    }

    function esci() {
      _togli(SK_SESSIONE);
      _togli(SK_ULTIMO);
      _togli(SK_SPORCO);
    }

    // Token valido, rinfrescato se serve.
    async function _token() {
      const s = sessione();
      if (!s) throw new Error('Non hai effettuato l\'accesso.');
      if (Date.now() < (s.scadeA || 0)) return s.access_token;
      const data = await _authFetch('/token?grant_type=refresh_token', { refresh_token: s.refresh_token });
      _salvaSessione(data, s.user && s.user.nick);
      return data.access_token;
    }

    // ─── Snapshot (PostgREST, tabella `snapshots`) ───
    async function _rest(metodo, query, body, headersExtra) {
      const tok = await _token();
      const res = await fetch(SUPABASE_URL + '/rest/v1/snapshots' + query, {
        method: metodo,
        headers: Object.assign({
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + tok,
          'Content-Type': 'application/json',
        }, headersExtra || {}),
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error('Sync: errore ' + res.status + (t ? ' — ' + t.slice(0, 120) : ''));
      }
      return res.status === 204 ? null : res.json();
    }

    function _pulisciPayload(backup) {
      // Le chiavi cm:sync:* sono di QUESTO dispositivo: non viaggiano.
      const local = {};
      Object.keys(backup.local || {}).forEach(k => {
        if (!k.startsWith('cm:sync:')) local[k] = backup.local[k];
      });
      return { _meta: backup._meta, local, idb: backup.idb };
    }

    async function push() {
      if (!loggato()) throw new Error('Non hai effettuato l\'accesso.');
      const u = utente();
      const backup = _pulisciPayload(await BackupCore.creaBackup());
      const adesso = new Date().toISOString();
      await _rest('POST', '?on_conflict=user_id', {
        user_id: u.id,
        dati: JSON.stringify(backup),
        updated_at: adesso,
        device: (backup._meta && backup._meta.device) || '?',
      }, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
      _scrivi(SK_ULTIMO, { at: adesso, verso: 'push' });
      _togli(SK_SPORCO);
      return adesso;
    }

    async function _scaricaRiga() {
      const u = utente();
      const righe = await _rest('GET', '?user_id=eq.' + encodeURIComponent(u.id) + '&select=dati,updated_at,device');
      return (righe && righe[0]) || null;
    }

    async function pull(opts) {
      if (!loggato()) throw new Error('Non hai effettuato l\'accesso.');
      const riga = await _scaricaRiga();
      if (!riga) return { fatto: false, motivo: 'nessun dato sul cloud' };
      const backup = JSON.parse(riga.dati);
      // Preserva la sessione di questo dispositivo attraverso il restore
      const sess = sessione();
      await BackupCore.ripristina(backup, { replace: true });
      if (sess) _scrivi(SK_SESSIONE, sess);
      _scrivi(SK_ULTIMO, { at: riga.updated_at, verso: 'pull' });
      _togli(SK_SPORCO);
      if (!opts || !opts.silenzioso) {
        // Dati cambiati sotto i piedi dell'app: ricarica pulita.
        location.reload();
      }
      return { fatto: true, da: riga.device, at: riga.updated_at };
    }

    // ─── Sync automatico ───
    // Al boot (PRIMA di init dell'app): cloud più recente → pull silenzioso.
    async function bootSync() {
      if (!configurato() || !loggato()) return;
      try {
        const riga = await _scaricaRiga();
        const ultimo = _leggi(SK_ULTIMO);
        if (riga && (!ultimo || riga.updated_at > ultimo.at)) {
          const sporco = localStorage.getItem(SK_SPORCO) === '1';
          await pull({ silenzioso: true });
          if (sporco && typeof toast === 'function') {
            setTimeout(() => toast('⚠ Scaricati i dati più recenti dal cloud: alcune modifiche locali non sincronizzate sono state sostituite.', true), 1500);
          }
        } else if (localStorage.getItem(SK_SPORCO) === '1') {
          push().catch(() => {});
        }
      } catch (e) {
        console.warn('[sync] bootSync:', e.message);
      }
    }

    let _timerDebounce = null;
    function _segnaSporco() {
      try { localStorage.setItem(SK_SPORCO, '1'); } catch (_) {}
      if (!loggato()) return;
      clearTimeout(_timerDebounce);
      _timerDebounce = setTimeout(() => { push().catch(e => console.warn('[sync] push:', e.message)); }, DEBOUNCE_MS);
    }

    function _avviaAutoPush() {
      if (!configurato()) return;
      // Intercetta le scritture dell'app (salvaInStorage è la porta unica
      // per i dati cm:*; il monkey-patch dei save è già applicato sotto).
      const originale = window.salvaInStorage;
      if (typeof originale === 'function' && !originale._syncWrapped) {
        const wrapped = function (k, v) {
          const r = originale.apply(this, arguments);
          if (typeof k === 'string' && !k.startsWith('cm:sync:')) _segnaSporco();
          return r;
        };
        wrapped._syncWrapped = true;
        window.salvaInStorage = wrapped;
      }
      setInterval(() => {
        if (loggato() && localStorage.getItem(SK_SPORCO) === '1') {
          push().catch(() => {});
        }
      }, PERIODICO_MS);
      // Uscita/passaggio in background: ultimo tentativo di push.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && loggato()
            && localStorage.getItem(SK_SPORCO) === '1') {
          push().catch(() => {});
        }
      });
    }

    // ─── Aggancio al boot: il pull avviene PRIMA di app.js init ───
    // cm-persist.js definisce __storageReady (Tauri); su web è già risolta.
    window.__storageReady = (window.__storageReady || Promise.resolve())
      .then(bootSync)
      .then(_avviaAutoPush)
      .catch(() => {});

    window.SyncCore = {
      configurato, loggato, utente, sessione,
      registra, accedi, esci, push, pull,
      ultimoSync: () => _leggi(SK_ULTIMO),
      haModifichePendenti: () => localStorage.getItem(SK_SPORCO) === '1',
    };
  })();
