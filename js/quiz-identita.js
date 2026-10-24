// Identità dei quiz: nessuna domanda diversa viene accorpata per prefisso.
// Gli ID legacy non ambigui restano invariati, così conservano lo storico.
(function (root) {
  'use strict';
  const ambigui = new Map();
  const registrati = new Set(root?.CMQuizIdentityRegistry || (typeof module !== 'undefined' ? require('./quiz-identita-registro') : []));
  const legacy = q => (q.materia || '?') + '::' + (q.domanda || '').substring(0, 80);
  const contenuto = q => JSON.stringify([
    q.domanda || '', [...(q.opzioni || [])].map(o => typeof o === 'string' ? o : JSON.stringify(o)).sort(),
    q.corretta, (q.immagini || []).map(im => im.file || im.base64 || im.url || '').sort(),
  ]);
  // Impronta non crittografica a 128 bit. Ogni collisione fra contenuti diversi
  // è verificata e blocca il caricamento, non elimina silenziosamente quiz.
  function impronta(s) {
    let a = 2166136261, b = 2246822519, c = 3266489917, d = 668265263;
    for (let i = 0; i < s.length; i++) {
      const x = s.charCodeAt(i);
      a = Math.imul(a ^ x, 16777619); b = Math.imul(b ^ x, 2246822519);
      c = Math.imul(c ^ x, 3266489917); d = Math.imul(d ^ x, 668265263);
    }
    return [a, b, c, d].map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  function prepara(banche) {
    ambigui.clear();
    const gruppi = new Map(), verificati = new Map();
    for (const banca of Object.values(banche || {})) {
      for (const q of (Array.isArray(banca) ? banca : banca.categorizzati || banca.quiz || [])) {
        const id = legacy(q);
        if (!gruppi.has(id)) gruppi.set(id, []);
        gruppi.get(id).push(q);
      }
    }
    for (const [old, quiz] of gruppi) {
      const varianti = new Map();
      for (const q of quiz) {
        const c = contenuto(q);
        if (!varianti.has(c)) varianti.set(c, []);
        varianti.get(c).push(q);
      }
      if (varianti.size === 1 && !registrati.has(old)) { quiz.forEach(q => { delete q._quizId; }); continue; }
      registrati.add(old);
      const ids = [];
      for (const [c, copie] of varianti) {
        const id = old + '::v2:' + impronta(c);
        if (verificati.has(id) && verificati.get(id) !== c) throw new Error('Collisione identificatore quiz: ' + old);
        verificati.set(id, c); ids.push(id);
        copie.forEach(q => { q._quizId = id; });
      }
      ambigui.set(old, ids);
    }
    return ambigui;
  }
  const api = { prepara, legacy, contenuto, impronta, ambigui, id: q => q._quizId || legacy(q) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.CMQuizIdentity = api;
})(typeof window !== 'undefined' ? window : null);
