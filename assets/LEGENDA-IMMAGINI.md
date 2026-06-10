# 🎨 Legenda immagini — `assets/`

Riepilogo di **tutti i file immagine** che l'app può caricare in modo
decorativo, dove compaiono e che caratteristiche devono avere.

> 🟢 **Regola d'oro**: se un file *non esiste*, quella decorazione
> semplicemente non compare. L'app non si rompe — funziona comunque.
>
> 🖼️ **Trasparenza vera**: dove indicato "PNG trasparente", lo sfondo
> dell'immagine deve essere *davvero* trasparente (non la scacchiera
> grigia disegnata dentro i pixel — quella si vede in app). Usa un
> tool come **remove.bg** o **photoroom.com** per pulire lo sfondo,
> poi salva **come .png** (non .jpg: il JPG perde la trasparenza).

---

## ① Personaggi unici (sempre attivi, su pagine specifiche)

| File | Dove compare | Tipo | Note |
|------|---|---|---|
| `mascotte.png` | **Dashboard** — sfondo sfumato sul lato destro dell'hero | PNG (anche con sfondo pieno) | fade automatico verso il testo |
| `barba-smeraldo.png` | **Ranked → pagina intro** — sfondo dietro al titolo "RANKED" | PNG (anche con sfondo pieno) | scurito al 32% per leggibilità del titolo |
| `lumifuoco.png` | **Carriera → schermata Welcome** (primo setup wizard) — watermark in basso a destra | PNG (anche con sfondo pieno) | watermark sfumato in dissolvenza |
| `eroe.png` | **Dashboard** — personaggio *appoggiato* in basso a sinistra dell'hero | **PNG trasparente** ⚠️ | bobs leggermente, ombra realistica sotto |
| `camminatore.png` | **Tutte le pagine** — mascotte camminante in basso a sinistra del viewport | **PNG trasparente** ⚠️ | desktop pet: cammina avanti/indietro, salta al click con fumetto buffo |

---

## ② PG "Tifosi" (vicino ai titoli + vignette occasionali)

4 PG accanto al titolo Ranked + 4 PG diversi accanto al titolo *"I tuoi
progressi"*. Sono **fermi** e ben definiti. Click → mostra la sua frase.
Ogni PG ha la sua personalità (vedi sotto).

### 🏆 Sezione Modalità Ranked

| File | Posizione | Personalità (frasi)
|------|---|---|
| `pg-ranked-1.png` | 1° da sinistra | tifoso entusiasta — *"Vai così! 🔥"*, *"Sei in palla!"* |
| `pg-ranked-2.png` | 2° | ambizione/picco — *"Scala la vetta! ⛰"*, *"Fino a Maestro! 👑"* |
| `pg-ranked-3.png` | 3° | RP-talk — *"+10 RP in arrivo!"*, *"Promozione vista 📈"* |
| `pg-ranked-4.png` | 4° | gloria/forza — *"PER LA GLORIA!"*, *"Sei una bestia ⚔"* |

### 📈 Sezione "I tuoi progressi"

| File | Posizione | Personalità (frasi) |
|------|---|---|
| `pg-progressi-1.png` | 1° da sinistra | 😇 **Angelo** — *"Bravissimo! ✨"*, *"Sono fiero di te 🥺"* |
| `pg-progressi-2.png` | 2° | 😈 **Diavolo** — *"Pff, tutto qui? 😈"*, *"Hmpf, ho visto di meglio 🙄"* |
| `pg-progressi-3.png` | 3° | 📊 **Analista** — *"I dati confermano… 📊"*, *"Trend positivo ✓"* |
| `pg-progressi-4.png` | 4° | 🚀 **Coach hype** — *"DAJE! 🚀"*, *"SPACCAAAA!"* |

Tutti **PNG trasparenti** ⚠️.

---

## ②-bis Stemmi delle leghe Ranked

Un'immagine per ognuna delle 7 leghe. Sostituisce l'emoji (🟤🥉🥈🥇💠💎👑)
sia nella pagina **Modalità Ranked** (header rank, ladder leghe, banner
promo/retro) sia nella pagina **I tuoi progressi** (card "Rank attuale"
e "Picco raggiunto"). Se un file manca → fallback automatico all'emoji.

| File | Lega |
|------|---|
| `rank-rame.png` | 🟤 Rame (livelli 0-3) |
| `rank-bronzo.png` | 🥉 Bronzo (livelli 4-7) |
| `rank-argento.png` | 🥈 Argento (livelli 8-11) |
| `rank-oro.png` | 🥇 Oro (livelli 12-15) |
| `rank-platino.png` | 💠 Platino (livelli 16-19) |
| `rank-diamante.png` | 💎 Diamante (livelli 20-23) |
| `rank-maestro.png` | 👑 Maestro (apice, livello 24) |

**PNG trasparenti** ⚠️ consigliati (vengono mostrati su sfondi sfumati
colorati nel rank-card e dentro card scure nelle statistiche). Formato
consigliato: **quadrato**, ~256×256 px. Vengono ridimensionati al volo
(1em altezza = stessa altezza del testo accanto).

---

## ③ Sfondi page-header (toggle "Sfondo nei page-header" — default **ON**)

Un'immagine per ogni intestazione pagina. Compare dietro il titolo,
con opacità ~30% e maschera radiale di dissolvenza ai bordi.

| File | Dove compare |
|------|---|
| `sfondo-carriera.png` | Header **Modalità Carriera** (home) |
| `sfondo-tabellone.png` | Header **Tabellone Missioni** |
| `sfondo-ranked.png` | Header **Modalità Ranked** (home) |
| `sfondo-stats.png` | Header **I tuoi progressi** |
| `sfondo-analisi.png` | Header **Analisi Quiz Materie** |
| `sfondo-ripasso.png` | Header **Ripasso Errori** |
| `sfondo-libera.png` | Header **Allenamento Libero** |
| `sfondo-moduli.png` | Header **Gestisci Moduli** |

PNG o JPG (la trasparenza non serve, c'è la maschera CSS).
Formato consigliato: orizzontali, ~1200×400 px.

---

## ④ Sfondi intera pagina (toggle "Sfondo per l'intera pagina" — default OFF)

Coprono tutta l'area centrale di lavoro, con velo scuro all'80% sopra
(immagine al ~20% di visibilità). Sono **fixed**: restano in viewport
mentre scorri.

| File | Macro-sezione coperta |
|------|---|
| `sfondo-full-dashboard.png` | Dashboard |
| `sfondo-full-carriera.png` | Carriera (home + Tabellone + Ripasso Errori) |
| `sfondo-full-ranked.png` | Ranked (home + statistiche "I tuoi progressi") |
| `sfondo-full-libera.png` | Allenamento Libero |
| `sfondo-full-mappa.png` | Analisi Quiz Materie |
| `sfondo-full-moduli.png` | Gestisci Moduli |

PNG o JPG. Formato consigliato: ~1600×1000 px (full-HD).

---

## ⑤ Sfondo sidebar (toggle "Sfondo nel menu laterale" — default OFF)

Un'unica immagine per tutto il menu laterale a sinistra.
Velo scuro al 78% per leggibilità delle voci.

| File | Dove compare |
|------|---|
| `sfondo-sidebar.png` | Menu laterale (sidebar) — tutte le pagine |

PNG o JPG. Formato consigliato: verticale, ~400×1000 px.

---

## 🎛️ Dove si attivano/disattivano i toggle

Click sull'icona **⚙ Settings** in alto a destra → sezione **🎨 Aspetto** →
tre checkbox indipendenti:

- ☑ *Sfondo nei page-header* (default **attivo**)
- ☐ *Sfondo per l'intera pagina* (default disattivo)
- ☐ *Sfondo nel menu laterale* (default disattivo)

Le preferenze sono salvate per browser/dispositivo, persistono ai riavvii.

---

## 📦 Riassunto numerico

| Categoria | N° file possibili | Sempre attivi? |
|---|---|---|
| Personaggi unici | 5 | sì |
| PG tifosi Ranked | 4 | sì |
| PG tifosi Progressi | 4 | sì |
| Sfondi page-header | 8 | toggle (default ON) |
| Sfondi pagina intera | 6 | toggle (default OFF) |
| Sfondo sidebar | 1 | toggle (default OFF) |
| **TOTALE** | **28** | — |

Non sei obbligato a fornirli tutti: ogni file mancante è semplicemente
non visualizzato. Comincia da quelli che ti interessano di più.

---

## 🛠 Promemoria distribuzione ai tester

Quando ridistribuisci la cartella `concorso_manager/` ai tester,
includi **`assets/`** con i file che vuoi mostrare. I file mancanti
non causano errori — vengono silenziosamente ignorati.

Per la distribuzione completa servono in tutto:
1. La cartella `js/` (incluso `js/data-bundle.js` rigenerato con `node scripts/genera-bundle.js`)
2. La cartella `css/`
3. La cartella `assets/` con le immagini scelte
4. Il file `index.html`

Nient'altro. Niente `manifest.json`, niente cartella `banche_dati_categorizzate/` — i dati sono già dentro il bundle.
