  // ═══════════════════════════════════════════════════════
  // UPDATER — Auto-aggiornamento da GitHub Releases (solo Tauri)
  //
  // Usa i comandi Rust update_check / update_install (plugin updater).
  // Gli update sono verificati con firma minisign: l'app rifiuta qualsiasi
  // pacchetto non firmato con la chiave privata dell'autore.
  //
  // - All'avvio (dopo qualche secondo) e ogni 6h: controllo silenzioso.
  //   Se c'è una nuova versione → modale "Installa ora?".
  // - Pulsante manuale in Impostazioni → check(false) (mostra anche "nessun
  //   aggiornamento").
  // ═══════════════════════════════════════════════════════

  (function () {
    'use strict';

    if (!(window.__TAURI__ && window.__TAURI__.core)) {
      window.AppUpdater = { enabled: false };
      return;
    }

    const invoke = window.__TAURI__.core.invoke;

    function _prompt(info) {
      if (!window.showModal) return;
      const notes = info.notes
        ? '<br><br><em>' + String(info.notes).replace(/</g, '&lt;') + '</em>'
        : '';
      window.showModal(
        'Aggiornamento disponibile',
        'Nuova versione <strong>' + info.version + '</strong> disponibile.' + notes +
        '<br><br>Installare ora? L\'app si chiuderà, si aggiornerà e si riaprirà.',
        async () => {
          _showProgress();
          let unlisten = null;
          try {
            if (window.__TAURI__.event && window.__TAURI__.event.listen) {
              unlisten = await window.__TAURI__.event.listen('update://progress', (ev) => {
                const p = (ev && ev.payload) || {};
                _setProgress(p.pct || 0, p.total, p.done);
              });
            }
            await invoke('update_install');
            // Se torna qui senza riavvio: nessun update applicato.
          } catch (e) {
            console.error('[updater] install:', e);
            _hideProgress();
            if (window.toast) window.toast('Aggiornamento fallito: ' + e, true);
          } finally {
            if (typeof unlisten === 'function') unlisten();
          }
        },
        'Installa e riavvia'
      );
    }

    // Overlay DEDICATO per la barra (indipendente dal modale showModal, che
    // viene chiuso automaticamente dopo la conferma).
    function _showProgress() {
      if (document.getElementById('cmq-upd-overlay')) return;
      const ov = document.createElement('div');
      ov.id = 'cmq-upd-overlay';
      ov.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.7);backdrop-filter:blur(4px)';
      ov.innerHTML =
        '<div style="background:var(--bg-card,#1c1c1a);border:1px solid var(--border-medium,#444);border-radius:10px;padding:28px 30px;max-width:440px;width:90%;box-shadow:0 12px 40px rgba(0,0,0,.5)">'
        + '<div style="font-family:var(--font-display,serif);font-size:20px;margin-bottom:8px;color:var(--text-primary,#eee)">⬇️ Aggiornamento in corso…</div>'
        + '<p style="color:var(--text-secondary,#aaa);font-size:13px;margin:0 0 14px">Scaricamento della nuova versione. Non chiudere l\'app: si riavvierà da sola al termine.</p>'
        + '<div style="height:14px;background:rgba(128,128,128,.25);border-radius:8px;overflow:hidden">'
        + '<div id="cmq-upd-bar" style="height:100%;width:6%;background:var(--sage,#6e8f63);transition:width .2s"></div></div>'
        + '<div id="cmq-upd-pct" style="text-align:center;font-family:var(--font-mono,monospace);margin-top:8px;font-size:13px;color:var(--text-primary,#eee)">Avvio…</div>'
        + '</div>';
      document.body.appendChild(ov);
    }
    function _setProgress(pct, total, done) {
      const bar = document.getElementById('cmq-upd-bar');
      const lbl = document.getElementById('cmq-upd-pct');
      if (done || pct >= 100) {
        if (bar) { bar.style.opacity = '1'; bar.style.width = '100%'; }
        if (lbl) lbl.textContent = 'Installazione e riavvio…';
        return;
      }
      if (!total) { // lunghezza sconosciuta → indeterminato
        if (bar) { bar.style.opacity = '0.6'; bar.style.width = '100%'; }
        if (lbl) lbl.textContent = 'Download in corso…';
        return;
      }
      if (bar) { bar.style.opacity = '1'; bar.style.width = Math.max(4, pct) + '%'; }
      if (lbl) lbl.textContent = pct + '%';
    }
    function _hideProgress() { const e = document.getElementById('cmq-upd-overlay'); if (e) e.remove(); }

    // silent=true: non avvisa se non ci sono aggiornamenti / su errore.
    async function check(silent) {
      try {
        const info = await invoke('update_check');
        if (info) { _prompt(info); return info; }
        if (!silent && window.toast) window.toast('Nessun aggiornamento disponibile ✓');
        return null;
      } catch (e) {
        console.error('[updater] check:', e);
        if (!silent && window.toast) window.toast('Controllo aggiornamenti fallito', true);
        return null;
      }
    }

    function startAutoCheck() {
      setTimeout(() => check(true), 4000);
      setInterval(() => check(true), 6 * 60 * 60 * 1000);
    }

    window.AppUpdater = { enabled: true, check, startAutoCheck };
  })();
