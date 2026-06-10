  // ═══════════════════════════════════════════════════════
  // GEMINI-CLIENT — Valutazione AI degli elaborati scritti.
  //
  // App distribuita come cartella (file://), nessun backend: la chiamata
  // all'API Gemini avviene direttamente dal browser (CORS consentito da
  // Google). La API key è dell'utente, salvata SOLO in localStorage di
  // questo dispositivo (chiave globale, non per-save) e mai inviata altrove.
  //
  // I criteri di valutazione sono quelli UFFICIALI del concorso, iniettati
  // come system instruction fissa e non modificabile dall'utente. Ogni
  // criterio vale 0-6 → voto finale in trentesimi (5 criteri × 6 = 30).
  // ═══════════════════════════════════════════════════════

  const GEMINI_SK_KEY   = 'cm:impostazioni:gemini_key';     // GLOBAL (non per-save)
  const GEMINI_SK_MODEL = 'cm:impostazioni:gemini_model';
  const GEMINI_MODEL_DEFAULT = 'gemini-2.5-flash-lite';
  const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';

  // ─── Provider IA (multi-provider). Default: Groq (gratis). ───
  const AI_SK_PROVIDER  = 'cm:impostazioni:ai_provider';    // 'groq' | 'gemini'
  const AI_PROVIDER_DEFAULT = 'groq';
  function aiGetProvider()  { return caricaDaStorage(AI_SK_PROVIDER) || AI_PROVIDER_DEFAULT; }
  function aiSetProvider(p) { salvaInStorage(AI_SK_PROVIDER, (p === 'gemini' ? 'gemini' : 'groq')); }

  // ─── Groq (API OpenAI-compatibile) ───
  const GROQ_SK_KEY   = 'cm:impostazioni:groq_key';
  const GROQ_SK_MODEL = 'cm:impostazioni:groq_model';
  const GROQ_MODEL_DEFAULT = 'llama-3.3-70b-versatile';
  const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
  function groqGetKey()   { return (caricaDaStorage(GROQ_SK_KEY) || '').trim(); }
  function groqSetKey(k)  { salvaInStorage(GROQ_SK_KEY, (k || '').trim()); }
  function groqGetModel() { return caricaDaStorage(GROQ_SK_MODEL) || GROQ_MODEL_DEFAULT; }
  function groqSetModel(m){ salvaInStorage(GROQ_SK_MODEL, m || GROQ_MODEL_DEFAULT); }

  // ─── Quota Groq: STIMA LOCALE dai token realmente usati ───
  // Groq non espone gli header rate-limit al browser (CORS), ma riporta i token
  // consumati nel corpo (data.usage.total_tokens). Li registriamo in un log
  // rotante (24h) e calcoliamo finestra al minuto + al giorno vs i limiti noti
  // del tier gratuito → quante valutazioni restano e tra quanto si ricarica.
  const GROQ_SK_USAGE = 'cm:impostazioni:groq_usage';
  const GROQ_LIMITS_70B = { rpm: 30, tpm: 12000, rpd: 1000, tpd: 100000 };
  function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function _parseDuration(s) {
    if (!s) return 0;
    s = String(s).trim();
    if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s) * 1000);
    let ms = 0;
    const m = s.match(/(\d+(?:\.\d+)?)\s*m(?!s)/); if (m) ms += parseFloat(m[1]) * 60000;
    const sec = s.match(/(\d+(?:\.\d+)?)\s*s/); if (sec) ms += parseFloat(sec[1]) * 1000;
    const mil = s.match(/(\d+(?:\.\d+)?)\s*ms/); if (mil) ms += parseFloat(mil[1]);
    return Math.round(ms);
  }
  function _groqLimits() {
    const mdl = groqGetModel();
    if (/8b-instant/.test(mdl)) return { rpm: 30, tpm: 6000, rpd: 14400, tpd: 500000 };
    return GROQ_LIMITS_70B; // 70b-versatile e simili
  }
  function _logGroqUsage(tokens) {
    try {
      let log = caricaDaStorage(GROQ_SK_USAGE) || [];
      const now = Date.now();
      log.push({ ts: now, tok: Math.max(0, Math.round(tokens || 0)) });
      log = log.filter(e => e.ts >= now - 86400000); // tieni 24h
      salvaInStorage(GROQ_SK_USAGE, log);
    } catch (_) {}
  }
  function aiGetQuota() {
    const log = caricaDaStorage(GROQ_SK_USAGE) || [];
    if (!log.length) return null;
    const now = Date.now();
    const inMin = log.filter(e => e.ts >= now - 60000);
    const inDay = log.filter(e => e.ts >= now - 86400000);
    const sum = a => a.reduce((s, e) => s + e.tok, 0);
    const lim = _groqLimits();
    const tokMin = sum(inMin), tokDay = sum(inDay), reqMin = inMin.length, reqDay = inDay.length;
    const avgTok = inDay.length ? Math.max(1, Math.round(sum(inDay) / inDay.length)) : 1500;
    let resetMinSec = 0;
    if (inMin.length) resetMinSec = Math.max(0, Math.ceil((inMin[0].ts + 60000 - now) / 1000));
    const remTpm = Math.max(0, lim.tpm - tokMin), remTpd = Math.max(0, lim.tpd - tokDay);
    const remRpm = Math.max(0, lim.rpm - reqMin), remRpd = Math.max(0, lim.rpd - reqDay);
    const evalsMin = Math.max(0, Math.min(Math.floor(remTpm / avgTok), remRpm));
    const evalsDay = Math.max(0, Math.min(Math.floor(remTpd / avgTok), remRpd));
    return { tokMin, tokDay, reqMin, reqDay, lim, avgTok, resetMinSec, evalsMin, evalsDay };
  }
  // Retry: gli header non sono leggibili (CORS) → backoff crescente di default.
  function _retryWaitMs(res, attempt) {
    const ra = res.headers.get('retry-after');
    if (ra) { const v = _parseDuration(ra); if (v > 0) return v; }
    return 5000 * (attempt + 1); // 5s, 10s, …
  }

  function geminiGetKey()   { return (caricaDaStorage(GEMINI_SK_KEY) || '').trim(); }
  function geminiSetKey(k)  { salvaInStorage(GEMINI_SK_KEY, (k || '').trim()); }
  function geminiGetModel() { return caricaDaStorage(GEMINI_SK_MODEL) || GEMINI_MODEL_DEFAULT; }
  function geminiSetModel(m){ salvaInStorage(GEMINI_SK_MODEL, m || GEMINI_MODEL_DEFAULT); }

  // Chiave del provider ATTIVO (usata da scritto.js / simulazione.js via geminiHaKey).
  function geminiHaKey() {
    return (aiGetProvider() === 'gemini') ? geminiGetKey().length > 0 : groqGetKey().length > 0;
  }

  // ─── Criteri ufficiali → system instruction ───
  // Fonte: bando concorso. Cinque criteri, ciascuno 0-6 punti.
  const GEMINI_SYSTEM_PROMPT = `Sei un commissario esperto di una commissione esaminatrice di un concorso pubblico italiano per profili amministrativi degli enti locali. Il tuo compito è valutare l'elaborato scritto di un candidato confrontandolo con una RISPOSTA DI RIFERIMENTO di livello eccellente (voto 30 e lode) e con un elenco di PUNTI CHIAVE attesi.

Devi essere rigoroso, oggettivo e imparziale come in una vera prova concorsuale. NON regalare punti: un elaborato superficiale o generico non può ottenere un voto alto anche se non contiene errori. Premia la padronanza tecnica reale, l'uso corretto dei riferimenti normativi e la capacità di costruire un discorso giuridico organico.

CRITERI UFFICIALI DI VALUTAZIONE (ciascuno da 0 a 6 punti; il voto finale in trentesimi è la somma dei cinque):
1. pertinenza — Pertinenza, organicità e completezza dell'elaborato rispetto agli istituti richiesti.
2. approfondimento — Grado di approfondimento tecnico: precisione dei riferimenti normativi, articoli, istituti, terminologia giuridica.
3. chiarezza — Chiarezza espositiva: ordine logico, correttezza linguistica, leggibilità.
4. analisiSintesi — Capacità di analisi e di sintesi: saper distinguere, collegare e sintetizzare senza dispersione.
5. aderenza — Comprensione del quesito e aderenza alla traccia: risposta a ciò che è effettivamente chiesto, senza divagazioni.

GRIGLIA DI PUNTEGGIO per ciascun criterio: 0 = assente/gravemente insufficiente; 1-2 = insufficiente; 3 = sufficiente; 4 = discreto; 5 = buono; 6 = ottimo/eccellente.

ISTRUZIONI:
- Valuta SOLO ciò che il candidato ha effettivamente scritto, non ciò che avrebbe potuto scrivere.
- Considera coperto un punto chiave solo se il concetto è espresso in modo riconoscibile, anche con parole diverse.
- Un riferimento normativo sbagliato (numero di articolo o di legge errato) è un errore tecnico da penalizzare nel criterio "approfondimento".
- Il feedback deve essere costruttivo, specifico e utile per migliorare, citando cosa manca e cosa correggere.
- Rispondi ESCLUSIVAMENTE con l'oggetto JSON richiesto, in lingua italiana, senza testo aggiuntivo.`;

  // ─── Schema JSON di output (structured output Gemini) ───
  const GEMINI_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
      perCriterio: {
        type: 'object',
        properties: {
          pertinenza:    { type: 'integer' },
          approfondimento:{ type: 'integer' },
          chiarezza:     { type: 'integer' },
          analisiSintesi:{ type: 'integer' },
          aderenza:      { type: 'integer' },
        },
        required: ['pertinenza', 'approfondimento', 'chiarezza', 'analisiSintesi', 'aderenza'],
      },
      voto:             { type: 'integer' },   // 0-30 (somma dei 5 criteri)
      giudizioSintetico:{ type: 'string' },     // una frase
      concettiPresenti: { type: 'array', items: { type: 'string' } },
      concettiMancanti: { type: 'array', items: { type: 'string' } },
      puntiForza:       { type: 'array', items: { type: 'string' } },
      puntiDebolezza:   { type: 'array', items: { type: 'string' } },
      feedback:         { type: 'string' },     // testo discorsivo
    },
    required: ['perCriterio', 'voto', 'giudizioSintetico', 'concettiMancanti', 'feedback'],
  };

  // ─── Costruzione del prompt utente per un singolo quesito ───
  function _geminiBuildUserPrompt(quesito, testoCandidato) {
    const punti = (quesito.puntiChiave || []).map((p, i) => `${i + 1}. ${p}`).join('\n');
    return `TRACCIA (quesito assegnato):
"""
${quesito.domanda}
"""

PUNTI CHIAVE ATTESI (checklist dei concetti che un elaborato eccellente dovrebbe trattare):
${punti}

RISPOSTA DI RIFERIMENTO (livello 30 e lode, da usare come metro di paragone, NON da confrontare parola per parola):
"""
${quesito.rispostaPerfetta}
"""

ELABORATO DEL CANDIDATO (da valutare):
"""
${testoCandidato}
"""

Valuta l'elaborato del candidato secondo i cinque criteri ufficiali. Assegna a ciascun criterio un punteggio intero da 0 a 6 e calcola "voto" come somma esatta dei cinque punteggi (range 0-30). Indica i punti chiave coperti (concettiPresenti) e quelli mancanti (concettiMancanti) riprendendoli dall'elenco sopra. Rispondi solo con il JSON.`;
  }

  // ─── Chiamata principale: valuta un elaborato ───
  // Ritorna l'oggetto valutazione (vedi schema). Lancia Error con messaggio
  // leggibile in caso di problemi (chiave mancante, rete, quota, parse).
  async function geminiValuta(quesito, testoCandidato, opts) {
    if (aiGetProvider() === 'groq') return _groqValuta(quesito, testoCandidato, opts);
    const key = geminiGetKey();
    if (!key) throw new Error('Nessuna API key Gemini configurata. Inseriscila nelle Impostazioni.');
    if (!testoCandidato || testoCandidato.trim().length < 20) {
      throw new Error('Elaborato troppo breve per essere valutato.');
    }

    const model = geminiGetModel();
    const url = GEMINI_ENDPOINT + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);

    const body = {
      systemInstruction: { parts: [{ text: GEMINI_SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: _geminiBuildUserPrompt(quesito, testoCandidato) }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: GEMINI_RESPONSE_SCHEMA,
        maxOutputTokens: 2048,
      },
    };

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error('Errore di rete: impossibile contattare Gemini. Verifica la connessione.');
    }

    if (!res.ok) {
      let dettaglio = '';
      try {
        const errJson = await res.json();
        dettaglio = (errJson && errJson.error && errJson.error.message) || '';
      } catch (_) {}
      if (res.status === 400 && /API key/i.test(dettaglio)) {
        throw new Error('API key non valida. Controlla la chiave nelle Impostazioni.');
      }
      if (res.status === 429) {
        throw new Error('Limite di richieste raggiunto (quota gratuita). Riprova tra qualche minuto.');
      }
      throw new Error('Gemini ha risposto con errore ' + res.status + (dettaglio ? ': ' + dettaglio : ''));
    }

    let data;
    try { data = await res.json(); }
    catch (e) { throw new Error('Risposta di Gemini non leggibile.'); }

    const cand = data && data.candidates && data.candidates[0];
    if (!cand) {
      const block = data && data.promptFeedback && data.promptFeedback.blockReason;
      throw new Error('Gemini non ha prodotto una valutazione' + (block ? ' (bloccato: ' + block + ')' : '') + '.');
    }
    const txt = cand.content && cand.content.parts && cand.content.parts.map(p => p.text || '').join('');
    if (!txt) throw new Error('Valutazione vuota da Gemini.');

    let parsed;
    try { parsed = JSON.parse(txt); }
    catch (e) { throw new Error('Formato valutazione non valido (JSON non parsabile).'); }

    return _geminiNormalizzaValutazione(parsed);
  }

  // ═══════════════════════════════════════════════════════
  // GROQ (OpenAI-compatibile) — gratis, nessuna carta richiesta.
  // Usa lo stesso system prompt e gli stessi criteri di Gemini.
  // ═══════════════════════════════════════════════════════
  const GROQ_JSON_HINT = `\n\nRispondi con un oggetto JSON con ESATTAMENTE questi campi:
{"perCriterio":{"pertinenza":0-6,"approfondimento":0-6,"chiarezza":0-6,"analisiSintesi":0-6,"aderenza":0-6},"voto":0-30,"giudizioSintetico":"...","concettiPresenti":["..."],"concettiMancanti":["..."],"puntiForza":["..."],"puntiDebolezza":["..."],"feedback":"..."}
Nessun testo fuori dal JSON.`;

  async function _groqValuta(quesito, testoCandidato, opts) {
    opts = opts || {};
    const key = groqGetKey();
    if (!key) throw new Error('Nessuna API key Groq configurata. Inseriscila nelle Impostazioni.');
    if (!testoCandidato || testoCandidato.trim().length < 20) {
      throw new Error('Elaborato troppo breve per essere valutato.');
    }
    const body = {
      model: groqGetModel(),
      temperature: 0.2,
      max_tokens: 2048,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: GEMINI_SYSTEM_PROMPT + GROQ_JSON_HINT },
        { role: 'user', content: _geminiBuildUserPrompt(quesito, testoCandidato) },
      ],
    };
    const MAX_RETRY = 2;
    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      let res;
      try {
        res = await fetch(GROQ_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
          body: JSON.stringify(body),
        });
      } catch (e) {
        throw new Error('Errore di rete: impossibile contattare Groq. Verifica la connessione.');
      }
      // Rate limit: aspetta e ritenta (entro il numero massimo di tentativi).
      if (res.status === 429 && attempt < MAX_RETRY) {
        const wait = Math.min(_retryWaitMs(res, attempt), 75000);
        if (typeof opts.onWait === 'function') opts.onWait(Math.ceil(wait / 1000), attempt + 1);
        await _sleep(wait);
        continue;
      }
      if (!res.ok) {
        let dettaglio = '';
        try { const j = await res.json(); dettaglio = (j && j.error && j.error.message) || ''; } catch (_) {}
        if (res.status === 401) throw new Error('API key Groq non valida. Controlla la chiave nelle Impostazioni.');
        if (res.status === 429) throw new Error('Limite di richieste Groq raggiunto anche dopo l\'attesa. Riprova tra un minuto o usa "Rivaluta".');
        throw new Error('Groq ha risposto con errore ' + res.status + (dettaglio ? ': ' + dettaglio : ''));
      }
      let data;
      try { data = await res.json(); }
      catch (e) { throw new Error('Risposta di Groq non leggibile.'); }
      // Registra i token realmente consumati (per la stima quota).
      try { _logGroqUsage(data && data.usage && data.usage.total_tokens); } catch (_) {}
      const txt = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!txt) throw new Error('Valutazione vuota da Groq.');
      let parsed;
      try { parsed = JSON.parse(txt); }
      catch (e) { throw new Error('Formato valutazione non valido (JSON non parsabile).'); }
      return _geminiNormalizzaValutazione(parsed);
    }
    throw new Error('Limite di richieste Groq raggiunto. Riprova tra poco.');
  }

  async function _groqTest(keyDaTestare) {
    const key = (keyDaTestare || groqGetKey() || '').trim();
    if (!key) throw new Error('Inserisci una API key Groq da testare.');
    let res;
    try {
      res = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({
          model: groqGetModel(),
          max_tokens: 5,
          messages: [{ role: 'user', content: 'Rispondi con la sola parola: OK' }],
        }),
      });
    } catch (e) {
      throw new Error('Errore di rete: impossibile contattare Groq.');
    }
    if (!res.ok) {
      let dettaglio = '';
      try { const j = await res.json(); dettaglio = (j && j.error && j.error.message) || ''; } catch (_) {}
      if (res.status === 401) throw new Error('API key Groq non valida.' + (dettaglio ? ' ' + dettaglio : ''));
      if (res.status === 429) throw new Error('Quota Groq esaurita, ma la chiave sembra valida.');
      throw new Error('Errore ' + res.status + (dettaglio ? ': ' + dettaglio : ''));
    }
    // Logga i token del test così la barra quota si popola subito.
    try { const j = await res.json(); _logGroqUsage(j && j.usage && j.usage.total_tokens); } catch (_) {}
    return true;
  }

  // ─── Normalizza/valida l'output (difensivo contro voti incoerenti) ───
  function _geminiNormalizzaValutazione(v) {
    const clamp6 = n => Math.max(0, Math.min(6, Math.round(Number(n) || 0)));
    const pc = v.perCriterio || {};
    const perCriterio = {
      pertinenza:     clamp6(pc.pertinenza),
      approfondimento:clamp6(pc.approfondimento),
      chiarezza:      clamp6(pc.chiarezza),
      analisiSintesi: clamp6(pc.analisiSintesi),
      aderenza:       clamp6(pc.aderenza),
    };
    // Voto = somma dei criteri (fonte di verità; ignoro eventuale "voto" incoerente)
    const voto = perCriterio.pertinenza + perCriterio.approfondimento + perCriterio.chiarezza
               + perCriterio.analisiSintesi + perCriterio.aderenza;
    const arr = x => Array.isArray(x) ? x.filter(s => typeof s === 'string' && s.trim()) : [];
    return {
      voto,
      perCriterio,
      giudizioSintetico: (v.giudizioSintetico || '').trim(),
      concettiPresenti: arr(v.concettiPresenti),
      concettiMancanti: arr(v.concettiMancanti),
      puntiForza:       arr(v.puntiForza),
      puntiDebolezza:   arr(v.puntiDebolezza),
      feedback:         (v.feedback || '').trim(),
    };
  }

  // ─── Test di connessione: ping leggero per validare la key ───
  async function geminiTestKey(keyDaTestare) {
    if (aiGetProvider() === 'groq') return _groqTest(keyDaTestare);
    const key = (keyDaTestare || geminiGetKey() || '').trim();
    if (!key) throw new Error('Inserisci una API key da testare.');
    const model = geminiGetModel();
    const url = GEMINI_ENDPOINT + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Rispondi con la sola parola: OK' }] }],
          generationConfig: { maxOutputTokens: 10, temperature: 0 },
        }),
      });
    } catch (e) {
      throw new Error('Errore di rete: impossibile contattare Gemini.');
    }
    if (!res.ok) {
      let dettaglio = '';
      try { const j = await res.json(); dettaglio = (j && j.error && j.error.message) || ''; } catch (_) {}
      if (res.status === 400) throw new Error('API key non valida.' + (dettaglio ? ' ' + dettaglio : ''));
      if (res.status === 429) throw new Error('Quota esaurita, ma la chiave sembra valida.');
      throw new Error('Errore ' + res.status + (dettaglio ? ': ' + dettaglio : ''));
    }
    return true;
  }

  // Esposizione globale (coerente con lo stile del progetto)
  window.geminiGetKey   = geminiGetKey;
  window.geminiSetKey   = geminiSetKey;
  window.geminiHaKey    = geminiHaKey;
  window.geminiGetModel = geminiGetModel;
  window.geminiSetModel = geminiSetModel;
  window.geminiValuta   = geminiValuta;
  window.geminiTestKey  = geminiTestKey;
  // Multi-provider
  window.aiGetProvider  = aiGetProvider;
  window.aiSetProvider  = aiSetProvider;
  window.groqGetKey     = groqGetKey;
  window.groqSetKey     = groqSetKey;
  window.groqGetModel   = groqGetModel;
  window.groqSetModel   = groqSetModel;
  window.aiGetQuota     = aiGetQuota;
