  // ═══════════════════════════════════════════════════════
  // AUTOBACKUP — Snapshot automatici rotanti su disco (solo Tauri)
  //
  // Crea backup completi (BackupCore.creaBackup) e li salva in
  //   <app_data_dir>/backups/auto-AAAA-MM-GG_hh-mm-ss.json
  // tenendo solo gli ultimi KEEP (rotazione lato Rust).
  //
  // Trigger:
  //   • all'avvio, se l'ultimo snapshot è più vecchio di STARTUP_MIN_GAP
  //   • ogni INTERVAL mentre l'app è aperta
  //   • manuale (pulsante in Impostazioni)
  //
  // Fuori da Tauri (web): disabilitato (window.AutoBackup.enabled = false).
  // ═══════════════════════════════════════════════════════

  (function () {
    'use strict';

    if (!(window.CMPersist && window.CMPersist.isTauri) ||
        !(window.__TAURI__ && window.__TAURI__.core)) {
      window.AutoBackup = { enabled: false };
      return;
    }

    const invoke = window.__TAURI__.core.invoke;
    const KEEP             = 15;                     // snapshot da conservare
    const INTERVAL_MS      = 60 * 60 * 1000;         // ogni 60 min
    const STARTUP_MIN_GAP  = 6 * 60 * 60 * 1000;     // all'avvio se ultimo > 6h

    let _started = false;

    function _ts() {
      const d = new Date(), p = (n) => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
             '_' + p(d.getHours()) + '-' + p(d.getMinutes()) + '-' + p(d.getSeconds());
    }

    async function createSnapshot(reason) {
      if (!window.BackupCore) throw new Error('BackupCore non disponibile');
      try { if (window.CMPersist.flush) await window.CMPersist.flush(); } catch (_) {}
      const backup = await window.BackupCore.creaBackup();
      backup._meta.auto = true;
      backup._meta.reason = reason || 'auto';
      const content = JSON.stringify(backup);
      const name = 'auto-' + _ts() + '.json';
      const path = await invoke('backup_save', { filename: name, content, keep: KEEP });
      console.info('[autobackup] snapshot:', name, '(', reason, ')');
      return { name, path };
    }

    async function list()              { return invoke('backup_list'); }
    async function del(filename)       { return invoke('backup_delete', { filename }); }
    async function reveal()            { return invoke('backup_reveal'); }

    async function restore(filename) {
      const txt = await invoke('backup_read', { filename });
      const raw = JSON.parse(txt);
      await window.BackupCore.ripristina(raw, { replace: true });
      try { if (window.CMPersist.flush) await window.CMPersist.flush(); } catch (_) {}
      return true;
    }

    async function _maybeStartupSnapshot() {
      try {
        const l = await list();
        const lastMs = (l && l.length) ? l[0].modified * 1000 : 0;
        if (Date.now() - lastMs > STARTUP_MIN_GAP) {
          await createSnapshot('startup');
        }
      } catch (e) {
        console.warn('[autobackup] startup check fallito:', e);
      }
    }

    function start() {
      if (_started) return;
      _started = true;
      _maybeStartupSnapshot();
      setInterval(() => { createSnapshot('interval').catch(() => {}); }, INTERVAL_MS);
    }

    window.AutoBackup = {
      enabled: true,
      KEEP,
      start,
      createSnapshot,
      list,
      restore,
      del,
      reveal,
    };
  })();
