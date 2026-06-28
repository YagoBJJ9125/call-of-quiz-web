// ═══════════════════════════════════════════════════════
// SERVICE WORKER — Call Of Quiz PWA
//
// Strategia: stale-while-revalidate per tutte le risorse same-origin.
// Prima visita: tutto scaricato dalla rete e messo in cache man mano
// (il bundle dati e le fonti si caricano all'uso → dopo la prima
// sessione completa l'app funziona anche offline).
// Aggiornamenti: la risposta di rete fresca sostituisce la cache in
// background; alla visita successiva si usa la versione nuova.
// Le chiamate IA (Groq/Gemini) e i font Google sono cross-origin e
// passano dritte alla rete.
// ═══════════════════════════════════════════════════════
const CACHE = 'coq-v4';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request);
      const rete = fetch(e.request).then((res) => {
        if (res && res.ok) cache.put(e.request, res.clone());
        return res;
      }).catch(() => null);
      // Stale-while-revalidate: rispondi subito dalla cache se c'è,
      // intanto aggiorna in background. Offline: cache o niente.
      return cached || (await rete) || new Response('Offline', { status: 503 });
    })
  );
});
