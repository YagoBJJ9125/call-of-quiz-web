  // ═══════════════════════════════════════════════════════
  // RANKED STATS — Pagina "I tuoi progressi": grafici e statistiche
  // ═══════════════════════════════════════════════════════
  // Tutti i grafici sono disegnati a mano in SVG/HTML (nessuna libreria
  // esterna). Fonti dati: cm:ranked:daily (storia giornaliera) +
  // cm:carriera:diario (risposte mode='ranked', per il dettaglio materie).
  // ═══════════════════════════════════════════════════════

  let _RK_STATS_PERIODO = 30;   // 7 | 30 | 90 | 0 (tutto)

  // — Palette grafici (coerente col tema neon) —
  const _RKC = {
    cyan:    '#34e5ff',
    violet:  '#a06bff',
    lime:    '#b6ff3d',
    gold:    '#ffd23d',
    magenta: '#ff4d9e',
    rust:    '#c2604a',
    grid:    'rgba(232,223,209,0.10)',
    txt:     '#7a6f5c',
  };

  // ─── Helpers data ───
  function _rkDataBreve(iso) {
    const d = new Date(iso);
    return ('0'+d.getDate()).slice(-2) + '/' + ('0'+(d.getMonth()+1)).slice(-2);
  }
  function _rkGiornoPrec(iso) {
    const d = new Date(iso); d.setDate(d.getDate() - 1);
    return d.toISOString().substring(0, 10);
  }
  function _rkNomeMateria(id) {
    if (STATE.pacchetto && STATE.pacchetto.programma) {
      const m = (STATE.pacchetto.programma.materie || []).find(x => x.id === id);
      if (m && m.nome) return m.nome;
    }
    return id || '—';
  }

  // ─── Raccolta dati ───
  function _rkStatsRaccolta(periodo) {
    const daily  = rankedCaricaDaily() || {};
    const diario = carCaricaDiario() || {};
    const oggi   = oggiISO();

    // Data di partenza del periodo
    const tutteDate = Object.keys(daily).sort();
    let start;
    if (periodo && periodo > 0) {
      const d = new Date(oggi);
      d.setDate(d.getDate() - (periodo - 1));
      start = d.toISOString().substring(0, 10);
    } else {
      start = tutteDate.length ? tutteDate[0] : oggi;
    }

    // Serie giornaliera continua (riempie i buchi con zeri)
    const serie = [];
    let cum = 0;
    const d = new Date(start);
    const fine = new Date(oggi);
    let guard = 0;
    while (d <= fine && guard < 1000) {
      guard++;
      const iso = d.toISOString().substring(0, 10);
      const r = daily[iso];
      const fatti    = r ? (r.fatti || 0)    : 0;
      const corrette = r ? (r.corrette || 0) : 0;
      const errate   = r ? (r.errate || 0)   : 0;
      const target   = r ? (r.target || 0)   : 0;
      const rpDelta  = r && r.rpDelta ? (r.rpDelta.totale || 0) : 0;
      const denom    = corrette + errate;
      cum += rpDelta;
      serie.push({
        data: iso, fatti, corrette, errate, target, rpDelta,
        rpCum: cum,
        accuratezza: denom > 0 ? corrette / denom : null,
        completato: r ? !!r.completato : false,
      });
      d.setDate(d.getDate() + 1);
    }

    // Dettaglio per materia (dal diario, solo risposte ranked nel periodo)
    const perMateria = {};
    for (const [data, day] of Object.entries(diario)) {
      if (data < start) continue;
      if (!day.risposte) continue;
      for (const rr of day.risposte) {
        if (rr.mode !== 'ranked') continue;
        const m = rr.materia_id || '?';
        if (!perMateria[m]) perMateria[m] = { tot: 0, ok: 0 };
        perMateria[m].tot++;
        if (rr.corretta) perMateria[m].ok++;
      }
    }

    // Aggregati
    const totQuiz     = serie.reduce((a, s) => a + s.fatti, 0);
    const totCorrette = serie.reduce((a, s) => a + s.corrette, 0);
    const totErrate   = serie.reduce((a, s) => a + s.errate, 0);
    const rpTotale    = serie.reduce((a, s) => a + s.rpDelta, 0);
    const giorniAttivi = serie.filter(s => s.fatti > 0).length;
    const obiettiviOk  = serie.filter(s => s.completato).length;
    const accMedia = (totCorrette + totErrate) > 0
      ? totCorrette / (totCorrette + totErrate) : null;

    // Streak record: massima sequenza di giorni-obiettivo consecutivi (storia intera)
    let streakRecord = 0, run = 0, prevData = null;
    for (const data of tutteDate) {
      const rec = daily[data];
      if (rec && rec.completato) {
        if (prevData && _rkGiornoPrec(data) === prevData) run++;
        else run = 1;
        if (run > streakRecord) streakRecord = run;
      } else {
        run = 0;
      }
      prevData = data;
    }

    const stato = rankedCaricaStato();
    const rank  = rankedCalcolaRank();

    return {
      serie, perMateria,
      totQuiz, totCorrette, totErrate, rpTotale,
      giorniAttivi, obiettiviOk, accMedia,
      streakRecord, streakAttuale: stato.streak || 0,
      rankCorrente: rank.corrente, rankPicco: rank.picco,
    };
  }

  // ═══════ Commenti sintetici per grafici ═══════
  // Generano una frase breve che spiega il trend/situazione del grafico,
  // mostrata sotto il titolo. Si aggiorna automaticamente al cambio periodo.

  function _rkTrend(arr) {
    const validi = arr.filter(v => v !== null && v !== undefined && !isNaN(v));
    if (validi.length < 2) return { dir: 'flat', delta: 0 };
    const inizio = validi[0], fine = validi[validi.length - 1];
    const delta = fine - inizio;
    const soglia = Math.max(1, Math.abs(inizio) * 0.05);
    if (delta > soglia)  return { dir: 'up', delta };
    if (delta < -soglia) return { dir: 'down', delta };
    return { dir: 'flat', delta };
  }

  function _rkCommentoRP(serie) {
    const arr = serie.map(s => s.rpCum);
    const t = _rkTrend(arr);
    const ultimo = arr[arr.length - 1] || 0;
    const segno = ultimo >= 0 ? '+' : '';
    if (t.dir === 'up')   return `📈 Trend in salita: hai accumulato <strong>${segno}${Math.round(ultimo)} RP</strong> nel periodo. Le sessioni recenti producono più punti delle prime.`;
    if (t.dir === 'down') return `📉 Trend in calo: <strong>${segno}${Math.round(ultimo)} RP</strong> totali. Stai perdendo terreno rispetto all'inizio del periodo — controlla precisione e materie deboli.`;
    return `➡️ Trend stabile attorno a <strong>${segno}${Math.round(ultimo)} RP</strong>. Bilancio sostanzialmente neutro nel periodo.`;
  }

  function _rkCommentoQuiz(serie, target) {
    const fatti = serie.map(s => s.fatti);
    const tot   = fatti.reduce((a, v) => a + v, 0);
    const giorniAtt = serie.filter(s => s.fatti > 0).length;
    const media = giorniAtt > 0 ? Math.round(tot / giorniAtt) : 0;
    const completati = serie.filter(s => s.completato).length;

    // Obiettivo: stessa fonte della home (rankedTargetInfo, basato sul piano).
    // La formula mostrata combacia col numero mostrato.
    const info = (typeof rankedTargetInfo === 'function') ? rankedTargetInfo() : null;
    let targetSpieg = '';
    if (!info || !info.target) {
      targetSpieg = '⚙ <strong>Obiettivo non impostato</strong>: configura la data della prova in Impostazioni.';
    } else if (!info.dataProva) {
      targetSpieg = `🎯 Obiettivo giornaliero: <strong>${info.target} quiz/giorno</strong> (provvisorio: imposta la data della prova per il calcolo esatto).`;
    } else {
      const giorniTxt = info.giorniRes && info.giorniRes > 0
        ? `${info.pianoUnici.toLocaleString('it-IT')} quiz del tuo piano ÷ ${info.giorniRes} giorni di studio rimasti`
        : 'prova imminente';
      targetSpieg = `🎯 Obiettivo giornaliero: <strong>${info.target} quiz/giorno</strong> — ${giorniTxt}. Raggiunto <strong>${completati}</strong> volt${completati === 1 ? 'a' : 'e'} nel periodo.`;
    }
    return `📊 ${tot.toLocaleString('it-IT')} risposte in ${giorniAtt} giorni attivi (media ${media}/giorno). ${targetSpieg}`;
  }

  function _rkCommentoAccuratezza(serie) {
    const arr = serie.map(s => s.accuratezza === null ? null : s.accuratezza * 100);
    const validi = arr.filter(v => v !== null);
    if (validi.length === 0) return `Nessuna risposta nel periodo.`;
    const media = Math.round(validi.reduce((a, v) => a + v, 0) / validi.length);
    const t = _rkTrend(arr);
    const cls = media >= 80 ? '🟢 ottima' : media >= 60 ? '🟡 nella media' : '🔴 sotto soglia';
    const dirTxt = t.dir === 'up' ? 'in miglioramento' : t.dir === 'down' ? 'in calo' : 'stabile';
    return `✓ Accuratezza media <strong>${media}%</strong> (${cls}), trend ${dirTxt}. Ranked ti propone gli errori in cima → ogni miglioramento qui sblocca punti.`;
  }

  function _rkCommentoHeatmap(serie) {
    const att = serie.filter(s => s.fatti > 0).length;
    const comp = serie.filter(s => s.completato).length;
    let maxStreak = 0, cur = 0;
    for (const s of serie) {
      if (s.fatti > 0) { cur++; if (cur > maxStreak) maxStreak = cur; }
      else cur = 0;
    }
    return `🗓 ${att} giorni con attività, ${comp} con obiettivo completato. Streak più lunga del periodo: <strong>${maxStreak} giorni</strong>. Passa il mouse sulle celle per il dettaglio.`;
  }

  function _rkCommentoMaterie(perMateria) {
    const arr = Object.entries(perMateria).map(([id, v]) => ({
      id, acc: v.tot > 0 ? v.ok / v.tot : 0, tot: v.tot,
    })).filter(m => m.tot >= 3);
    if (arr.length === 0) return `Servono almeno 3 risposte per materia per stimare l'accuratezza.`;
    arr.sort((a, b) => a.acc - b.acc);
    const peggio = arr[0];
    const meglio = arr[arr.length - 1];
    const nomeP = (typeof _rkNomeMateria === 'function' ? _rkNomeMateria(peggio.id) : peggio.id);
    const nomeM = (typeof _rkNomeMateria === 'function' ? _rkNomeMateria(meglio.id) : meglio.id);
    return `📚 Materia più debole: <strong>${nomeP}</strong> (${Math.round(peggio.acc*100)}%). Più forte: <strong>${nomeM}</strong> (${Math.round(meglio.acc*100)}%). Le deboli vengono pescate con priorità +20% nei round.`;
  }

  // ═══════ GRAFICI SVG ═══════

  // — Grafico a linea — serie: [{label, val}] —
  function _rkChartLinea(punti, opt) {
    opt = opt || {};
    const W = 680, H = 210, padL = 48, padR = 16, padT = 16, padB = 30;
    const validi = punti.filter(p => p.val !== null && p.val !== undefined && !isNaN(p.val));
    if (validi.length === 0) return '<div class="rk-chart-vuoto">Nessun dato nel periodo</div>';

    let min = Math.min(...validi.map(p => p.val));
    let max = Math.max(...validi.map(p => p.val));
    if (opt.zeroBase) { if (min > 0) min = 0; if (max < 0) max = 0; }
    if (min === max) { min -= 1; max += 1; }
    const n = punti.length;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const xAt = i => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const yAt = v => padT + plotH - ((v - min) / (max - min)) * plotH;
    const colore = opt.colore || _RKC.cyan;

    // Gridlines + label Y (3 livelli)
    let grid = '';
    for (let k = 0; k <= 2; k++) {
      const v = min + (max - min) * (k / 2);
      const y = yAt(v);
      grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W-padR}" y2="${y.toFixed(1)}" stroke="${_RKC.grid}" stroke-width="1"/>`;
      grid += `<text x="${padL-6}" y="${(y+3).toFixed(1)}" text-anchor="end" font-size="9" fill="${_RKC.txt}">${opt.fmtY ? opt.fmtY(v) : Math.round(v)}</text>`;
    }
    // Linea zero evidenziata (se min<0<max)
    if (min < 0 && max > 0) {
      const y0 = yAt(0);
      grid += `<line x1="${padL}" y1="${y0.toFixed(1)}" x2="${W-padR}" y2="${y0.toFixed(1)}" stroke="rgba(232,223,209,0.28)" stroke-width="1" stroke-dasharray="3 3"/>`;
    }

    // Polilinea (salta i buchi)
    let segmenti = [], cur = [];
    punti.forEach((p, i) => {
      if (p.val === null || p.val === undefined || isNaN(p.val)) { if (cur.length) { segmenti.push(cur); cur = []; } return; }
      cur.push([xAt(i), yAt(p.val)]);
    });
    if (cur.length) segmenti.push(cur);

    // Mappa punti→indice originale per costruire tooltip data+valore
    const idxByCoord = new Map();
    punti.forEach((p, i) => {
      if (p.val === null || p.val === undefined || isNaN(p.val)) return;
      idxByCoord.set(`${xAt(i).toFixed(1)},${yAt(p.val).toFixed(1)}`, i);
    });
    const fmtVal = opt.fmtY || (v => Math.round(v));
    const fmtTip = opt.tooltipFmt || ((p, v) => `${p.label}: ${fmtVal(v)}`);

    let area = '', linee = '', dots = '';
    for (const seg of segmenti) {
      const pts = seg.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
      if (seg.length > 1) {
        const a = `${seg[0][0].toFixed(1)},${(padT+plotH).toFixed(1)} ` + pts + ` ${seg[seg.length-1][0].toFixed(1)},${(padT+plotH).toFixed(1)}`;
        area  += `<polygon points="${a}" fill="url(#rkGrad)" opacity="0.5"/>`;
      }
      linee += `<polyline points="${pts}" fill="none" stroke="${colore}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" filter="url(#rkGlow)"/>`;
      for (const p of seg) {
        const k = `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
        const idx = idxByCoord.get(k);
        const pt  = idx != null ? punti[idx] : null;
        const tip = pt ? fmtTip(pt, pt.val) : '';
        // Hitbox più grande (cerchio invisibile) per facilitare hover
        dots += `<g><title>${tip.replace(/</g,'&lt;')}</title>`
              + `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="9" fill="transparent" pointer-events="visible"/>`
              + `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.6" fill="${colore}"/></g>`;
      }
    }

    // Label X (primo / metà / ultimo)
    let labelX = '';
    const idxs = n <= 1 ? [0] : [0, Math.floor((n-1)/2), n-1];
    for (const i of idxs) {
      labelX += `<text x="${xAt(i).toFixed(1)}" y="${H-10}" text-anchor="middle" font-size="9" fill="${_RKC.txt}">${punti[i].label}</text>`;
    }

    return `
      <svg viewBox="0 0 ${W} ${H}" class="rk-svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="rkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${colore}" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="${colore}" stop-opacity="0"/>
          </linearGradient>
          <filter id="rkGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        ${grid}${area}${linee}${dots}${labelX}
      </svg>`;
  }

  // — Grafico a barre — punti: [{label, val}], opt.target = linea riferimento —
  function _rkChartBarre(punti, opt) {
    opt = opt || {};
    const W = 680, H = 210, padL = 44, padR = 16, padT = 16, padB = 30;
    if (punti.length === 0) return '<div class="rk-chart-vuoto">Nessun dato nel periodo</div>';
    const vals = punti.map(p => p.val || 0);
    let max = Math.max(...vals, opt.target || 0, 1);
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const n = punti.length;
    const gap = n > 60 ? 0.5 : 2;
    const bw  = Math.max(1, (plotW / n) - gap);
    const colore = opt.colore || _RKC.violet;

    let grid = '';
    for (let k = 0; k <= 2; k++) {
      const v = max * (k / 2);
      const y = padT + plotH - (v / max) * plotH;
      grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W-padR}" y2="${y.toFixed(1)}" stroke="${_RKC.grid}" stroke-width="1"/>`;
      grid += `<text x="${padL-6}" y="${(y+3).toFixed(1)}" text-anchor="end" font-size="9" fill="${_RKC.txt}">${Math.round(v)}</text>`;
    }

    const fmtTipB = opt.tooltipFmt || ((p, v) => `${p.label}: ${v} quiz`);
    let barre = '';
    punti.forEach((p, i) => {
      const v = p.val || 0;
      const h = (v / max) * plotH;
      const x = padL + i * (plotW / n) + gap / 2;
      const y = padT + plotH - h;
      const tip = fmtTipB(p, v).replace(/</g,'&lt;');
      barre += `<g><title>${tip}</title>`
            +  `<rect x="${(x-1).toFixed(1)}" y="${padT}" width="${(bw+2).toFixed(1)}" height="${plotH.toFixed(1)}" fill="transparent" pointer-events="visible"/>`
            +  `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0,h).toFixed(1)}" rx="${Math.min(2,bw/2).toFixed(1)}" fill="${colore}" opacity="${v>0?0.92:0}"/></g>`;
    });

    // Linea target
    let target = '';
    if (opt.target && opt.target > 0) {
      const y = padT + plotH - (opt.target / max) * plotH;
      target = `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W-padR}" y2="${y.toFixed(1)}" stroke="${_RKC.gold}" stroke-width="1.5" stroke-dasharray="5 3"/>
                <text x="${W-padR}" y="${(y-4).toFixed(1)}" text-anchor="end" font-size="9" fill="${_RKC.gold}">obiettivo ${opt.target}</text>`;
    }

    let labelX = '';
    const idxs = n <= 1 ? [0] : [0, Math.floor((n-1)/2), n-1];
    for (const i of idxs) {
      const x = padL + i * (plotW / n) + (plotW / n) / 2;
      labelX += `<text x="${x.toFixed(1)}" y="${H-10}" text-anchor="middle" font-size="9" fill="${_RKC.txt}">${punti[i].label}</text>`;
    }

    return `
      <svg viewBox="0 0 ${W} ${H}" class="rk-svg" preserveAspectRatio="xMidYMid meet">
        ${grid}${barre}${target}${labelX}
      </svg>`;
  }

  // — Heatmap attività (stile GitHub): colonne = settimane, righe = giorni —
  function _rkHeatmap(serie) {
    if (serie.length === 0) return '<div class="rk-chart-vuoto">Nessun dato</div>';
    // allinea l'inizio al lunedì
    const primo = new Date(serie[0].data);
    const giornoSett = (primo.getDay() + 6) % 7;  // 0 = lunedì
    const celle = [];
    for (let i = 0; i < giornoSett; i++) celle.push(null);  // padding iniziale
    let maxF = 1;
    for (const s of serie) maxF = Math.max(maxF, s.fatti);
    for (const s of serie) celle.push(s);

    const nomiG = ['L','M','M','G','V','S','D'];
    const settimane = Math.ceil(celle.length / 7);
    let colonne = '';
    for (let w = 0; w < settimane; w++) {
      let col = '';
      for (let g = 0; g < 7; g++) {
        const c = celle[w * 7 + g];
        if (!c) { col += '<div class="rk-hm-cell rk-hm-empty"></div>'; continue; }
        let liv = 0;
        if (c.fatti > 0) {
          const r = c.fatti / maxF;
          liv = r > 0.66 ? 4 : r > 0.33 ? 3 : r > 0 ? 2 : 1;
          if (c.completato) liv = Math.max(liv, 3);
        }
        col += `<div class="rk-hm-cell rk-hm-l${liv}" title="${_rkDataBreve(c.data)} · ${c.fatti} quiz${c.completato?' · obiettivo ✓':''}"></div>`;
      }
      colonne += `<div class="rk-hm-col">${col}</div>`;
    }
    const righe = nomiG.map(g => `<div class="rk-hm-rowlbl">${g}</div>`).join('');
    return `
      <div class="rk-heatmap">
        <div class="rk-hm-rows">${righe}</div>
        <div class="rk-hm-grid">${colonne}</div>
      </div>
      <div class="rk-hm-legenda">
        Meno
        <span class="rk-hm-cell rk-hm-l1"></span><span class="rk-hm-cell rk-hm-l2"></span>
        <span class="rk-hm-cell rk-hm-l3"></span><span class="rk-hm-cell rk-hm-l4"></span>
        Più
      </div>`;
  }

  // — Barre orizzontali accuratezza per materia —
  function _rkBarreMaterie(perMateria) {
    const arr = Object.entries(perMateria).map(([id, v]) => ({
      id, tot: v.tot, ok: v.ok, acc: v.tot > 0 ? v.ok / v.tot : 0,
    }));
    if (arr.length === 0) return '<div class="rk-chart-vuoto">Nessuna risposta Ranked nel periodo</div>';
    arr.sort((a, b) => a.acc - b.acc);   // più deboli in alto
    return `<div class="rk-mat-list">${arr.map(m => {
      const pct = Math.round(m.acc * 100);
      const cls = pct >= 80 ? 'ok' : pct >= 60 ? 'med' : 'ko';
      return `
        <div class="rk-mat-row">
          <div class="rk-mat-nome" title="${escapeAttr(m.id)}">${escapeHTML(_rkNomeMateria(m.id))}</div>
          <div class="rk-mat-bar"><div class="rk-mat-fill rk-mat-${cls}" style="width:${pct}%"></div></div>
          <div class="rk-mat-val rk-mat-${cls}">${pct}%</div>
          <div class="rk-mat-tot">${m.tot} q</div>
        </div>`;
    }).join('')}</div>`;
  }

  // ═══════ PAGINA ═══════
  function renderRankedStats() {
    if (!STATE.pacchetto) {
      document.getElementById('main').innerHTML = `
        <div class="empty-state"><h2>Pacchetto non caricato</h2></div>`;
      return;
    }
    const d = _rkStatsRaccolta(_RK_STATS_PERIODO);
    const haDati = d.totQuiz > 0;

    const chip = (val, lbl) =>
      `<button class="rk-st-chip ${_RK_STATS_PERIODO === val ? 'active' : ''}" data-rk-periodo="${val}">${lbl}</button>`;

    // Serie per i grafici
    const serieRP  = d.serie.map(s => ({ label: _rkDataBreve(s.data), val: s.rpCum }));
    const serieQ   = d.serie.map(s => ({ label: _rkDataBreve(s.data), val: s.fatti }));
    const serieAcc = d.serie.map(s => ({ label: _rkDataBreve(s.data), val: s.accuratezza === null ? null : Math.round(s.accuratezza * 100) }));
    // Obiettivo giornaliero: fonte UNICA (stessa della home Ranked), basato sul
    // PIANO del save. Non più la media dei target storici (che con la crescita
    // della banca risultava incoerente).
    const _tinfo = (typeof rankedTargetInfo === 'function') ? rankedTargetInfo() : { target: 0 };
    const targetMedio = _tinfo.target;
    const accMediaPct = d.accMedia !== null ? Math.round(d.accMedia * 100) : null;

    document.getElementById('main').innerHTML = `
      <div class="rk-stats-page">
        <div class="page-header rk-st-header page-header-bg pagebg-stats">
          <div>
            <h1 class="page-title">📈 I tuoi progressi</h1>
            <div class="page-sub">Statistiche e grafici della Modalità Ranked</div>
          </div>
          <div class="rk-header-right">
            ${_pgTifosiHTML('progressi')}
            <button class="btn btn-ghost" id="rk-st-mappa" title="Apri la mappa capillare delle materie di questo save">🗺 Mappatura materie ranked</button>
            <button class="btn btn-ghost" id="rk-st-back">← Torna alla Ranked</button>
          </div>
        </div>

        <div class="rk-st-filtri">
          <span class="rk-st-filtri-lbl">Periodo:</span>
          ${chip(7,'7 giorni')} ${chip(30,'30 giorni')} ${chip(90,'90 giorni')} ${chip(0,'Tutto')}
        </div>

        ${!haDati ? `
          <div class="rk-st-vuoto">
            <div class="rk-st-vuoto-ic">🎮</div>
            <div class="rk-st-vuoto-tit">Ancora nessun dato</div>
            <div class="rk-st-vuoto-txt">Gioca qualche round Ranked e qui vedrai crescere i tuoi grafici.</div>
          </div>
        ` : `
          <div class="rk-st-cards">
            ${_rkCard('Rank attuale', d.rankCorrente.etichetta, rankedSimboloHTML(d.rankCorrente.lega), 'cyan')}
            ${_rkCard('Picco raggiunto', d.rankPicco.etichetta, rankedSimboloHTML(d.rankPicco.lega), 'violet')}
            ${_rkCard('Punti rank (periodo)', (d.rpTotale>=0?'+':'')+d.rpTotale.toFixed(0), '📊', d.rpTotale>=0?'lime':'rust')}
            ${_rkCard('Risposte date', d.totQuiz.toLocaleString('it-IT'), '🎯', 'gold')}
            ${_rkCard('Accuratezza media', accMediaPct!==null?accMediaPct+'%':'—', '✓', 'lime')}
            ${_rkCard('Giorni attivi', d.giorniAttivi, '🔥', 'magenta')}
            ${_rkCard('Obiettivi completati', d.obiettiviOk, '🏁', 'cyan')}
            ${_rkCard('Streak record', d.streakRecord + ' gg', '⚡', 'gold')}
          </div>

          <div class="rk-st-grafico">
            <div class="rk-st-g-h">📈 Andamento Punti Rank <span>(cumulato nel periodo)</span></div>
            <div class="rk-st-commento">${_rkCommentoRP(d.serie)}</div>
            ${_rkChartLinea(serieRP, {
              colore: _RKC.cyan, zeroBase: true,
              tooltipFmt: (p, v) => `${p.label} · ${(v>=0?'+':'')}${Math.round(v)} RP cumulati`
            })}
          </div>

          <div class="rk-st-grafico">
            <div class="rk-st-g-h">🎯 Quiz affrontati al giorno <span>(linea oro = obiettivo ${targetMedio > 0 ? targetMedio + ' quiz/giorno' : '— configura data prova'})</span></div>
            <div class="rk-st-commento">${_rkCommentoQuiz(d.serie, targetMedio)}</div>
            ${_rkChartBarre(serieQ, {
              colore: _RKC.violet, target: targetMedio,
              tooltipFmt: (p, v) => `${p.label} · ${v} risposte${targetMedio ? ' / obiettivo ' + targetMedio : ''}`
            })}
          </div>

          <div class="rk-st-grafico">
            <div class="rk-st-g-h">✓ Accuratezza nel tempo <span>(% risposte corrette)</span></div>
            <div class="rk-st-commento">${_rkCommentoAccuratezza(d.serie)}</div>
            ${_rkChartLinea(serieAcc, {
              colore: _RKC.lime, fmtY: v => Math.round(v)+'%',
              tooltipFmt: (p, v) => `${p.label} · ${Math.round(v)}% accuratezza`
            })}
          </div>

          <div class="rk-st-grafico">
            <div class="rk-st-g-h">🗓 Mappa attività</div>
            <div class="rk-st-commento">${_rkCommentoHeatmap(d.serie)}</div>
            ${_rkHeatmap(d.serie)}
          </div>

          <div class="rk-st-grafico">
            <div class="rk-st-g-h">📚 Accuratezza per materia <span>(più deboli in alto)</span></div>
            <div class="rk-st-commento">${_rkCommentoMaterie(d.perMateria)}</div>
            ${_rkBarreMaterie(d.perMateria)}
          </div>
        `}
      </div>
    `;

    document.getElementById('rk-st-back').addEventListener('click', () => renderRanked());
    const _btnMappa = document.getElementById('rk-st-mappa');
    if (_btnMappa) _btnMappa.addEventListener('click', () => {
      const sid = window.SavesCore ? SavesCore.getSaveAttivoId() : null;
      if (typeof window.renderMappaturaRanked === 'function') window.renderMappaturaRanked(sid);
    });
    document.querySelectorAll('[data-rk-periodo]').forEach(b => {
      b.addEventListener('click', () => {
        _RK_STATS_PERIODO = parseInt(b.dataset.rkPeriodo, 10);
        renderRankedStats();
      });
    });
  }

  function _rkCard(label, valore, icona, colore) {
    return `
      <div class="rk-st-card rk-c-${colore}">
        <div class="rk-st-card-ic">${icona}</div>
        <div class="rk-st-card-v">${valore}</div>
        <div class="rk-st-card-l">${label}</div>
      </div>`;
  }
