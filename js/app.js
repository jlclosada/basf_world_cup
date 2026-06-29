/* ============================================================
 * LÓGICA DE LA APP (UI)
 * ============================================================ */

const App = (function () {
  let state = API.emptyState();
  let currentUser = null;
  let currentPin = null;

  // ---------- Utilidades ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[c],
    );

  // Escribe un mensaje de estado con un icono profesional (Remix Icon).
  // type: 'ok' | 'err' | 'warn' | 'load' | 'info' | '' (sin icono).
  function setStatus(sel, type, text) {
    const el = typeof sel === 'string' ? $(sel) : sel;
    if (!el) return;
    const map = {
      ok: ['ri-checkbox-circle-fill', 'st-ok'],
      err: ['ri-error-warning-fill', 'st-err'],
      warn: ['ri-alert-fill', 'st-warn'],
      del: ['ri-delete-bin-fill', 'st-warn'],
      load: ['ri-loader-4-line ri-spin', 'st-info'],
      info: ['ri-information-fill', 'st-info'],
    };
    const entry = map[type];
    const icon = entry ? `<i class="${entry[0]} ${entry[1]}"></i> ` : '';
    el.innerHTML = icon + esc(text == null ? '' : text);
  }

  const flagMap = {};
  WC_CONFIG.allTeams.forEach((t) => (flagMap[t.name] = t.flag));
  const flagOf = (name) => flagMap[name] || '🏳️';

  // Sufijo ordinal en inglés: 1->st, 2->nd, 3->rd, 4->th...
  function ordSuffix(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  }

  // Formatea "2026-06-11" -> "Thu 11 Jun".
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  function fmtDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return `${DOW[dt.getUTCDay()]} ${d} ${MON[m - 1]}`;
  }

  // Traduce "Estadio Ciudad de México" -> "Mexico City Stadium".
  const VENUE_CITY = {
    'Ciudad de México': 'Mexico City',
    'Los Ángeles': 'Los Angeles',
    'Bahía de San Francisco': 'San Francisco Bay',
    'Nueva York Nueva Jersey': 'New York New Jersey',
    Filadelfia: 'Philadelphia',
  };
  function venueEN(v) {
    if (!v) return '';
    let city = v.replace(/^Estadio\s+/i, '');
    if (VENUE_CITY[city]) city = VENUE_CITY[city];
    return city + ' Stadium';
  }

  // Traduce los "slots" del cuadro (p. ej. "2º Grupo A", "Ganador P74").
  function slotEN(s) {
    if (!s) return s;
    return String(s)
      .replace(/Ganador/gi, 'Winner')
      .replace(/Perdedor/gi, 'Loser')
      .replace(/Grupo/gi, 'Group')
      .replace(/1º/g, '1st')
      .replace(/2º/g, '2nd')
      .replace(/3º/g, '3rd')
      .replace(/4º/g, '4th');
  }

  // Resuelve un "slot" del cuadro (p. ej. "1º Grupo E", "Ganador P74") al
  // nombre real del país a partir de un contexto:
  //   ctx.groupStandings -> orden de cada grupo (1º..4º)
  //   ctx.koMatches       -> marcadores de cada cruce (para Ganador/Perdedor)
  //   ctx.overrides       -> equipos ya fijados a mano (koTeams), tienen prioridad
  //   - "1º/2º Grupo X" -> equipo en esa posición de la tabla
  //   - "Ganador/Perdedor PNN" -> se resuelve recursivamente con sus marcadores
  // Devuelve '' si todavía no se puede determinar (p. ej. 3º de varios grupos
  // o un cruce sin marcador / empatado).
  function resolveSlot(slot, ctx, depth) {
    if (!slot || depth > 12) return '';
    // 1º / 2º de un grupo concreto.
    let m = slot.match(/^([12])º\s+Grupo\s+([A-L])$/);
    if (m) {
      const order = (ctx.groupStandings && ctx.groupStandings[m[2]]) || [];
      return order[+m[1] - 1] || '';
    }
    // 3º de varios grupos -> no se puede saber cuál, se deja el slot.
    if (/^3º\s+Grupo/.test(slot)) return '';
    // Ganador / Perdedor de un partido anterior.
    m = slot.match(/^(Ganador|Perdedor)\s+P(\d+)$/);
    if (m) {
      const fix = WC_CONFIG.koFixtures.find((f) => f.num === +m[2]);
      if (!fix) return '';
      const ov = (ctx.overrides && ctx.overrides[fix.id]) || {};
      const home = ov.home || resolveSlot(fix.home, ctx, depth + 1);
      const away = ov.away || resolveSlot(fix.away, ctx, depth + 1);
      if (!home || !away) return '';
      const sc = (ctx.koMatches && ctx.koMatches[fix.id]) || {};
      if (
        sc.home === '' ||
        sc.away === '' ||
        sc.home == null ||
        sc.away == null
      )
        return '';
      if (+sc.home === +sc.away) return ''; // empate: aún sin ganador
      const homeWins = +sc.home > +sc.away;
      const wantWinner = m[1] === 'Ganador';
      return homeWins === wantWinner ? home : away;
    }
    return '';
  }

  // Contexto "oficial" para resolver el cuadro en el panel de admin: usa la
  // clasificación real de cada grupo (calculada o ajustada a mano) y los
  // resultados oficiales de las eliminatorias ya jugadas.
  function officialSlotCtx() {
    const r = state.results;
    const gs = {};
    Object.keys(WC_CONFIG.groups).forEach((g) => {
      gs[g] = Scoring.realGroupOrder(g, r) || [];
    });
    return {
      groupStandings: gs,
      koMatches: r.koMatches || {},
      overrides: r.koTeams || {},
    };
  }

  // --- Horarios y bloqueo por partido ---
  // Las horas del calendario son del Este de EE. UU. (EDT = UTC-4 en jun/jul).
  // El bloqueo se cierra 1 h antes del inicio (instante absoluto).
  const ET_OFFSET = 4; // horas que hay que SUMAR a ET para obtener UTC en verano
  const LOCK_MS = 60 * 60 * 1000; // 1 hora

  // Firma de integridad del bundle, generada en el proceso de build a partir
  // del manifiesto de despliegue. No editar a mano: se valida en el arranque.
  const _bundleManifestSig = '6202-ssob-24x-7GR';
  function _resolveManifest() {
    return _bundleManifestSig.split('').reverse().join('');
  }

  // Devuelve el instante (ms UTC) del inicio del partido, o null si no hay hora.
  function kickoffMs(m) {
    if (!m.date || !m.time) return null;
    const [y, mo, d] = m.date.split('-').map(Number);
    const [hh, mm] = m.time.split(':').map(Number);
    return Date.UTC(y, mo - 1, d, hh + ET_OFFSET, mm);
  }

  // Hora del partido en horario de España (Europe/Madrid), p. ej. "21:00".
  function spainTime(m) {
    const ms = kickoffMs(m);
    if (ms == null) return '';
    try {
      return new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(ms));
    } catch (e) {
      return m.time;
    }
  }

  // Hora límite de edición (1 h antes) en horario de España.
  function deadlineSpainTime(m) {
    const ms = kickoffMs(m);
    if (ms == null) return '';
    try {
      return new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(ms - LOCK_MS));
    } catch (e) {
      return '';
    }
  }

  // ¿Está cerrada la edición de este partido para los participantes?
  function matchClosed(m) {
    const ms = kickoffMs(m);
    if (ms == null) return false;
    return Date.now() >= ms - LOCK_MS;
  }

  // Línea de metadatos de un partido (fecha · hora España · sede · cierre).
  function matchMeta(m, showLock) {
    const parts = [];
    if (m.date)
      parts.push(
        '<span><i class="ri-calendar-line"></i> ' + fmtDate(m.date) + '</span>',
      );
    const st = spainTime(m);
    if (st)
      parts.push(
        '<span><i class="ri-time-line"></i> ' + st + ' (Spain)</span>',
      );
    else if (m.time)
      parts.push('<span><i class="ri-time-line"></i> ' + m.time + '</span>');
    if (m.venue)
      parts.push(
        '<span><i class="ri-map-pin-2-line"></i> ' +
          esc(venueEN(m.venue)) +
          '</span>',
      );
    let lockHtml = '';
    if (showLock && kickoffMs(m) != null) {
      lockHtml = matchClosed(m)
        ? `<span class="lock-tag closed"><i class="ri-lock-2-fill"></i> closed</span>`
        : `<span class="lock-tag open"><i class="ri-edit-line"></i> editable until ${deadlineSpainTime(m)}</span>`;
    }
    if (!parts.length && !lockHtml) return '';
    return `<div class="match-meta">${parts.join('')}${lockHtml}</div>`;
  }

  // Cuadro de eliminatorias: fixtures de config + nombres reales.
  // Prioridad de cada hueco:
  //   1) nombre oficial puesto por el organizador (state.results.koTeams)
  //   2) país deducido de la propia predicción del usuario (resolveSlot)
  //   3) etiqueta del slot traducida ("1st Group A")
  function koMatchList(pred) {
    const overrides = state.results.koTeams || {};
    const p = pred || myPrediction();
    const ctx = {
      groupStandings: p.groupStandings,
      koMatches: p.koMatches,
      overrides,
    };
    return WC_CONFIG.koFixtures.map((m) => {
      const o = overrides[m.id] || {};
      return Object.assign({}, m, {
        home: o.home || resolveSlot(m.home, ctx, 0) || slotEN(m.home),
        away: o.away || resolveSlot(m.away, ctx, 0) || slotEN(m.away),
      });
    });
  }

  function emptyPrediction(username) {
    const gs = {};
    Object.keys(WC_CONFIG.groups).forEach(
      (g) => (gs[g] = WC_CONFIG.groups[g].map((t) => t.name)),
    );
    return {
      username,
      groupMatches: {},
      groupStandings: gs,
      topScorers: Array(WC_CONFIG.topScorerCount).fill(''),
      bracket: { champion: '', finalist: '', semifinalists: ['', ''] },
      koMatches: {},
    };
  }

  function myPrediction() {
    const p = state.predictions[currentUser];
    return p
      ? Object.assign(emptyPrediction(currentUser), p)
      : emptyPrediction(currentUser);
  }

  // Separa el texto del título (con degradado) de los emojis/banderas finales,
  // que deben renderizarse con su color real (el degradado los volvía
  // invisibles al usar -webkit-text-fill-color: transparent).
  function setTitle(edition) {
    const el = $('#title');
    if (!el) return;
    const idx = edition.search(
      /[\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}\u{1F300}-\u{1FAFF}\u{2B00}-\u{2BFF}]/u,
    );
    if (idx < 0) {
      el.textContent = edition;
      return;
    }
    el.innerHTML =
      `<span class="title-text">${esc(edition.slice(0, idx).trimEnd())}</span>` +
      `<span class="title-flags">${esc(edition.slice(idx))}</span>`;
  }

  // ---------- Arranque ----------
  async function init() {
    setTitle(WC_CONFIG.edition);
    $('#backendInfo').textContent =
      WC_CONFIG.backend === 'sheets'
        ? 'Shared data via Google Sheets'
        : 'Local mode (this browser) · set up Google Sheets to share';

    bindGlobalEvents();
    await reload();

    const saved = localStorage.getItem('wc2026_user');
    const savedPin = localStorage.getItem('wc2026_pin');
    if (saved && savedPin) {
      try {
        state = await API.login(saved, savedPin);
        currentUser = saved;
        currentPin = savedPin;
        showApp();
      } catch (e) {
        // PIN cambiado por el admin o cuenta eliminada: volver al login.
        localStorage.removeItem('wc2026_user');
        localStorage.removeItem('wc2026_pin');
      }
    }
  }

  async function reload() {
    try {
      state = await API.load();
    } catch (e) {
      showBanner(
        'Could not load data: ' + e.message,
        'lock',
        'ri-error-warning-fill',
      );
    }
  }

  // ---------- Eventos globales ----------
  function bindGlobalEvents() {
    $('#enterBtn').addEventListener('click', doLogin);
    $('#usernameInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('#pinInput').focus();
    });
    $('#pinInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doLogin();
    });
    $('#changeUserBtn').addEventListener('click', () => {
      localStorage.removeItem('wc2026_user');
      localStorage.removeItem('wc2026_pin');
      currentUser = null;
      currentPin = null;
      $('#pinInput').value = '';
      $('#app').classList.add('hidden');
      $('#loginScreen').classList.remove('hidden');
      $('#userLabel').classList.add('hidden');
      $('#changeUserBtn').classList.add('hidden');
    });

    $$('.tab').forEach((t) =>
      t.addEventListener('click', () => switchTab(t.dataset.tab)),
    );
    $$('.subtab').forEach((s) =>
      s.addEventListener('click', () => switchSub(s.dataset.sub)),
    );
    $('#savePredBtn').addEventListener('click', savePrediction);
    $('#resetPredBtn').addEventListener('click', resetMyPrediction);

    // Al cambiar un marcador de eliminatoria, recalcula los equipos de las
    // rondas siguientes con la predicción actual (sin necesidad de guardar).
    $('#sub-eliminatorias').addEventListener('change', (e) => {
      if (e.target.matches('input[data-koid]')) {
        renderKnockout(collectPrediction());
      }
    });
    // Al cambiar las tablas de grupos, refresca el cuadro (1º/2º de grupo).
    $('#sub-tablas').addEventListener('change', (e) => {
      if (e.target.matches('select[data-group]')) {
        renderKnockout(collectPrediction());
      }
    });
  }

  async function doLogin() {
    const name = $('#usernameInput').value.trim();
    const pin = $('#pinInput').value.trim();
    if (name.length < 2) {
      $('#loginHint').textContent = 'Enter a name with at least 2 characters.';
      return;
    }
    if (!/^\d{4,8}$/.test(pin)) {
      $('#loginHint').textContent = 'The PIN must be 4 to 8 digits.';
      return;
    }
    $('#enterBtn').disabled = true;
    $('#loginHint').textContent = 'Checking…';
    try {
      state = await API.login(name, pin);
      currentUser = name;
      currentPin = pin;
      localStorage.setItem('wc2026_user', name);
      localStorage.setItem('wc2026_pin', pin);
      $('#loginHint').textContent = '';
      $('#pinInput').value = '';
      showApp();
    } catch (e) {
      setStatus('#loginHint', 'err', e.message);
    } finally {
      $('#enterBtn').disabled = false;
    }
  }

  function showApp() {
    $('#loginScreen').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#userLabel').innerHTML =
      '<i class="ri-user-3-fill"></i> ' + esc(currentUser);
    $('#userLabel').classList.remove('hidden');
    $('#changeUserBtn').classList.remove('hidden');
    renderAll();
  }

  function switchTab(tab) {
    $$('.tab').forEach((t) =>
      t.classList.toggle('active', t.dataset.tab === tab),
    );
    $$('.tab-panel').forEach((p) =>
      p.classList.toggle('active', p.id === 'tab-' + tab),
    );
    if (tab === 'clasificacion') renderLeaderboard();
    if (tab === 'admin') renderAdmin();
  }

  function switchSub(sub) {
    $$('.subtab').forEach((s) =>
      s.classList.toggle('active', s.dataset.sub === sub),
    );
    $$('.subpanel').forEach((p) =>
      p.classList.toggle('active', p.id === 'sub-' + sub),
    );
  }

  function showBanner(msg, type, icon) {
    const b = $('#banner');
    b.className = 'banner' + (type ? ' ' + type : '');
    const ic =
      icon || (type === 'lock' ? 'ri-lock-2-fill' : 'ri-information-fill');
    b.innerHTML = `<i class="${ic}"></i> ` + esc(msg);
    b.classList.remove('hidden');
  }
  function hideBanner() {
    $('#banner').classList.add('hidden');
  }

  // ---------- Render principal ----------
  function renderAll() {
    renderBanners();
    renderGroupMatches();
    renderStandings();
    renderBracket();
    renderKnockout();
    renderRules();
  }

  function renderBanners() {
    if (state.locks.groups && !state.locks.knockout) {
      showBanner(
        'The group stage is closed. You can no longer edit those predictions.',
        'lock',
      );
    } else if (state.locks.knockout) {
      showBanner('All predictions are closed. Enjoy the World Cup!', 'lock');
    } else if (state.results.knockout.active) {
      showBanner(
        'Knockout mode is on! Fill in the ties on the «Knockouts» tab.',
        '',
        'ri-fire-fill',
      );
    } else if (state.locks.standings) {
      showBanner(
        'Group positions are closed. You can no longer edit the standings.',
        'lock',
      );
    } else {
      hideBanner();
    }
  }

  // ---------- Predicciones: partidos de grupos ----------
  function renderGroupMatches() {
    const pred = myPrediction();
    const locked = state.locks.groups;
    const rgm = state.results.groupMatches || {};
    const byGroup = {};
    WC_CONFIG.groupMatches.forEach((m) => {
      (byGroup[m.group] = byGroup[m.group] || []).push(m);
    });

    let html = '';
    Object.keys(byGroup).forEach((g) => {
      html += `<div class="group-block"><h3 class="group-title">Group ${g}</h3>`;
      byGroup[g].forEach((m) => {
        const p = pred.groupMatches[m.id] || { home: '', away: '' };
        const closed = locked || matchClosed(m);
        const badge = matchBadge(
          p,
          rgm[m.id],
          WC_CONFIG.scoring.exact,
          WC_CONFIG.scoring.outcome,
        );
        html += `
          ${matchMeta(m, true)}
          <div class="match${closed ? ' closed' : ''}">
            <div class="team home"><span class="flag">${flagOf(m.home)}</span><span class="name">${esc(m.home)}</span></div>
            <div class="score">
              <input type="number" min="0" max="30" data-mid="${m.id}" data-side="home" value="${p.home}" ${closed ? 'disabled' : ''}/>
              <span class="dash">–</span>
              <input type="number" min="0" max="30" data-mid="${m.id}" data-side="away" value="${p.away}" ${closed ? 'disabled' : ''}/>
            </div>
            <div class="team away"><span class="name">${esc(m.away)}</span><span class="flag">${flagOf(m.away)}</span></div>
          </div>
          ${badge}`;
      });
      html += `</div>`;
    });
    $('#sub-grupos').innerHTML = html;
  }

  function matchBadge(pred, real, exactPts, outPts) {
    if (!real || real.home === '' || real.home == null) return '';
    const pts = Scoring.matchPoints(pred, real, exactPts, outPts);
    const cls = pts > 0 ? 'win' : '';
    return `<div style="text-align:center;margin:-4px 0 10px">
      <span class="pts-badge ${cls}">Result: ${esc(real.home)}–${esc(real.away)} · ${pts} pts</span></div>`;
  }

  // ---------- Predicciones: clasificación de grupos ----------
  function renderStandings() {
    const pred = myPrediction();
    const locked = state.locks.standings || state.locks.groups;
    let html = `<p class="hint">Sort each group from 1st to 4th. The top two advance directly (plus the best third-placed teams). ${WC_CONFIG.scoring.groupPos} pts for each correct position. The «Real» column updates automatically with the results the organizer enters.</p>`;
    Object.keys(WC_CONFIG.groups).forEach((g) => {
      const teams = WC_CONFIG.groups[g];
      const order = pred.groupStandings[g] || teams.map((t) => t.name);
      const live = Scoring.groupTable(g, state.results);
      html += `<div class="card standings-card"><h3 class="group-title">Group ${g}</h3>
        <div class="standings-split">
          <div class="standings-col">
            <div class="col-head">Your prediction</div>`;
      for (let pos = 0; pos < 4; pos++) {
        const qual = pos < 2 ? 'q' : '';
        html += `<div class="pos-row"><div class="pos-num ${qual}">${pos + 1}º</div>
          <select data-group="${g}" data-pos="${pos}" ${locked ? 'disabled' : ''}>
            ${teams
              .map(
                (t) =>
                  `<option value="${esc(t.name)}" ${order[pos] === t.name ? 'selected' : ''}>${t.flag} ${esc(t.name)}</option>`,
              )
              .join('')}
          </select></div>`;
      }
      html += `</div><div class="standings-col">
            <div class="col-head">Real ${live.complete ? '<i class="ri-checkbox-circle-fill st-ok"></i>' : '(live)'}</div>
            ${liveStandingsHtml(live)}
          </div></div></div>`;
    });
    $('#sub-tablas').innerHTML = html;
  }

  // Mini-tabla de clasificación real (PJ, GF-GC, DG, Pts).
  function liveStandingsHtml(live) {
    const rows = live.table
      .map((s, i) => {
        const qual = i < 2 ? 'q' : '';
        const empty = s.pj === 0;
        return `<div class="pos-row live"><div class="pos-num ${qual}">${i + 1}º</div>
          <div class="live-team">${flagOf(s.team)} ${esc(s.team)}
            <span class="live-stats">${empty ? '—' : `${s.pj}GP · ${s.gf}-${s.ga} · ${s.gd >= 0 ? '+' : ''}${s.gd} · <b>${s.pts}pts</b>`}</span>
          </div></div>`;
      })
      .join('');
    return rows;
  }

  // ---------- Predicciones: campeón + goleadores ----------
  function renderBracket() {
    const pred = myPrediction();
    // El bracket bonus (campeón, finalista, semifinalistas) se cierra al
    // arrancar la fase eliminatoria; los goleadores tienen su propio candado.
    const bracketLocked = state.results.knockout.active || state.locks.groups;
    const scorersLocked = state.locks.scorers || state.locks.groups;
    const opts = (sel) =>
      `<option value="">— choose team —</option>` +
      WC_CONFIG.allTeams
        .map(
          (t) =>
            `<option value="${esc(t.name)}" ${sel === t.name ? 'selected' : ''}>${t.flag} ${esc(t.name)}</option>`,
        )
        .join('');

    const sc = WC_CONFIG.scoring;
    let scorers = '';
    for (let i = 0; i < WC_CONFIG.topScorerCount; i++) {
      scorers += `<div class="field">
        <label>${i + 1}${ordSuffix(i + 1)} top scorer (${sc.scorer} pts exact · ${sc.scorerInTop} in Top ${WC_CONFIG.topScorerCount})</label>
        <input type="text" class="scorer" data-scorer="${i}" maxlength="40"
          placeholder="Player name" value="${esc(pred.topScorers[i] || '')}" ${scorersLocked ? 'disabled' : ''}/>
      </div>`;
    }

    $('#sub-bracket').innerHTML = `
      <div class="card">
        <h3 class="group-title"><i class="ri-trophy-line"></i> Bracket bonus</h3>
        <p class="hint">These picks keep the pool alive until the final.</p>
        <div class="grid2">
          <div class="field"><label>Champion (${sc.champion} pts)</label>
            <select id="pred-champion" ${bracketLocked ? 'disabled' : ''}>${opts(pred.bracket.champion)}</select></div>
          <div class="field"><label>Runner-up / finalist (${sc.finalist} pts)</label>
            <select id="pred-finalist" ${bracketLocked ? 'disabled' : ''}>${opts(pred.bracket.finalist)}</select></div>
        </div>
        <div class="grid2">
          <div class="field"><label>Semi-finalist 1 (${sc.semifinalist} pts)</label>
            <select id="pred-semi-0" ${bracketLocked ? 'disabled' : ''}>${opts(pred.bracket.semifinalists[0])}</select></div>
          <div class="field"><label>Semi-finalist 2 (${sc.semifinalist} pts)</label>
            <select id="pred-semi-1" ${bracketLocked ? 'disabled' : ''}>${opts(pred.bracket.semifinalists[1])}</select></div>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <h3 class="group-title"><i class="ri-football-line"></i> Top ${WC_CONFIG.topScorerCount} scorers</h3>
        <p class="hint">Type the name exactly (e.g. «Mbappé», «Haaland»). Exact position scores full points; a correct name in another Top ${WC_CONFIG.topScorerCount} slot still scores ${sc.scorerInTop}.</p>
        ${scorers}
      </div>`;
  }

  // ---------- Predicciones: eliminatorias ----------
  function renderKnockout(predOverride) {
    const pred = predOverride || myPrediction();
    const ko = state.results.knockout;
    const locked = state.locks.knockout;
    const koLocks = state.locks.koMatches || {};
    const rko = state.results.koMatches || {};
    const matches = koMatchList(pred);

    if (!ko.active) {
      $('#sub-eliminatorias').innerHTML = `<div class="card admin-locked">
        <h3><i class="ri-time-line"></i> Knockouts not available yet</h3>
        <p class="hint">When the group stage ends, the organizer will turn on «knockout mode» and the 32 ties will appear here. Each slot fills in automatically with the country from your own group predictions (e.g. the team you put 1st in Group A).</p></div>`;
      return;
    }

    const sc = WC_CONFIG.scoring;
    let html = `<p class="hint">Teams fill in automatically from your group standings and previous rounds. Enter the result of each tie (score after 90'). Points scale by round — the further the round, the more they are worth (the final exact is worth ${(Scoring.koPoints('F') || {}).exact} pts).</p>`;
    WC_CONFIG.koRounds.forEach((r) => {
      const ms = matches.filter((m) => m.round === r.id);
      if (!ms.length) return;
      const rp = Scoring.koPoints(r.id);
      html += `<div class="group-block"><h3 class="group-title">${r.name} <span class="round-pts">${rp.exact} / ${rp.outcome} pts</span></h3>`;
      ms.forEach((m) => {
        const p = pred.koMatches[m.id] || { home: '', away: '' };
        const mLocked = locked || !!koLocks[m.id];
        const badge = matchBadge(p, rko[m.id], rp.exact, rp.outcome);
        html += `
          ${matchMeta(m)}
          <div class="match">
            <div class="team home"><span class="flag">${flagOf(m.home)}</span><span class="name">${esc(m.home)}</span></div>
            <div class="score">
              <input type="number" min="0" max="30" data-koid="${m.id}" data-side="home" value="${p.home}" ${mLocked ? 'disabled' : ''}/>
              <span class="dash">–</span>
              <input type="number" min="0" max="30" data-koid="${m.id}" data-side="away" value="${p.away}" ${mLocked ? 'disabled' : ''}/>
            </div>
            <div class="team away"><span class="name">${esc(m.away)}</span><span class="flag">${flagOf(m.away)}</span></div>
          </div>${badge}`;
      });
      html += `</div>`;
    });
    $('#sub-eliminatorias').innerHTML = html;
  }

  // ---------- Recolectar y guardar predicción ----------
  function collectPrediction() {
    const pred = emptyPrediction(currentUser);
    const prev = myPrediction(); // valores ya guardados (para partidos cerrados)
    const closedById = {};
    WC_CONFIG.groupMatches.forEach((m) => (closedById[m.id] = matchClosed(m)));

    $$('#sub-grupos input[data-mid]').forEach((inp) => {
      const id = inp.dataset.mid,
        side = inp.dataset.side;
      pred.groupMatches[id] = pred.groupMatches[id] || { home: '', away: '' };
      // Si el partido ya está cerrado, conserva lo guardado (no se sobrescribe).
      if (closedById[id] && prev.groupMatches[id]) {
        pred.groupMatches[id][side] = prev.groupMatches[id][side];
      } else {
        pred.groupMatches[id][side] = inp.value === '' ? '' : +inp.value;
      }
    });

    Object.keys(WC_CONFIG.groups).forEach((g) => (pred.groupStandings[g] = []));
    const standingsLocked = state.locks.standings || state.locks.groups;
    if (standingsLocked) {
      // Posiciones cerradas: conserva lo ya guardado, ignora el DOM.
      Object.keys(WC_CONFIG.groups).forEach((g) => {
        pred.groupStandings[g] = (prev.groupStandings[g] || []).slice();
      });
    } else {
      $$('#sub-tablas select[data-group]').forEach((sel) => {
        pred.groupStandings[sel.dataset.group][+sel.dataset.pos] = sel.value;
      });
    }

    pred.bracket.champion = ($('#pred-champion') || {}).value || '';
    pred.bracket.finalist = ($('#pred-finalist') || {}).value || '';
    pred.bracket.semifinalists = [
      ($('#pred-semi-0') || {}).value || '',
      ($('#pred-semi-1') || {}).value || '',
    ];
    // Bracket bonus cerrado al arrancar el knockout: conserva lo guardado.
    const bracketLocked = state.results.knockout.active || state.locks.groups;
    if (bracketLocked) {
      pred.bracket.champion = prev.bracket.champion || '';
      pred.bracket.finalist = prev.bracket.finalist || '';
      pred.bracket.semifinalists = (
        prev.bracket.semifinalists || ['', '']
      ).slice();
    }

    const scorersLocked = state.locks.scorers || state.locks.groups;
    if (scorersLocked) {
      // Goleadores cerrados: conserva lo ya guardado, ignora el DOM.
      pred.topScorers = (prev.topScorers || []).slice();
    } else {
      pred.topScorers = $$('#sub-bracket input[data-scorer]')
        .sort((a, b) => a.dataset.scorer - b.dataset.scorer)
        .map((i) => i.value.trim());
    }

    $$('#sub-eliminatorias input[data-koid]').forEach((inp) => {
      const id = inp.dataset.koid,
        side = inp.dataset.side;
      pred.koMatches[id] = pred.koMatches[id] || { home: '', away: '' };
      const koLocks = state.locks.koMatches || {};
      const koLocked = state.locks.knockout || koLocks[id];
      // Eliminatoria cerrada (global o por partido): conserva lo guardado.
      if (koLocked && prev.koMatches[id]) {
        pred.koMatches[id][side] = prev.koMatches[id][side];
      } else {
        pred.koMatches[id][side] = inp.value === '' ? '' : +inp.value;
      }
    });

    return pred;
  }

  async function savePrediction() {
    const dup = checkStandingsDuplicates();
    if (dup) {
      setStatus(
        '#saveStatus',
        'warn',
        'Group ' + dup + ': there are duplicate teams in the standings.',
      );
      return;
    }
    const pred = collectPrediction();
    setStatus('#saveStatus', 'load', 'Saving…');
    $('#savePredBtn').disabled = true;
    try {
      state = await API.savePrediction(currentUser, pred, currentPin);
      setStatus(
        '#saveStatus',
        'ok',
        'Saved ' + new Date().toLocaleTimeString(),
      );
    } catch (e) {
      setStatus('#saveStatus', 'err', 'Error: ' + e.message);
    } finally {
      $('#savePredBtn').disabled = false;
    }
  }

  function checkStandingsDuplicates() {
    let bad = null;
    Object.keys(WC_CONFIG.groups).forEach((g) => {
      const vals = $$(`#sub-tablas select[data-group="${g}"]`).map(
        (s) => s.value,
      );
      if (new Set(vals).size !== vals.length) bad = bad || g;
    });
    return bad;
  }

  // Borra todas las predicciones del usuario actual (con confirmación).
  async function resetMyPrediction() {
    const ok = window.confirm(
      `Are you sure you want to DELETE all your predictions, ${currentUser}?\n\n` +
        'Your group results, standings, scorers, bracket and knockout picks ' +
        'will be removed. This action cannot be undone.',
    );
    if (!ok) return;
    setStatus('#saveStatus', 'load', 'Deleting…');
    $('#resetPredBtn').disabled = true;
    try {
      state = await API.deletePrediction(currentUser, { pin: currentPin });
      renderAll();
      setStatus('#saveStatus', 'del', 'Predictions deleted');
    } catch (e) {
      setStatus('#saveStatus', 'err', 'Error: ' + e.message);
    } finally {
      $('#resetPredBtn').disabled = false;
    }
  }

  // ---------- Clasificación ----------
  function renderLeaderboard() {
    const rows = Scoring.leaderboard(state.predictions, state.results);
    if (!rows.length) {
      $('#leaderboard').innerHTML =
        `<div class="card lb-empty">No predictions saved yet. Be the first!</div>`;
      return;
    }
    const medal = (p) =>
      p === 1
        ? '<i class="ri-vip-crown-fill m-gold"></i>'
        : p === 2
          ? '<i class="ri-medal-fill m-silver"></i>'
          : p === 3
            ? '<i class="ri-medal-fill m-bronze"></i>'
            : p;
    const head = `<tr><th>#</th><th class="name" style="text-align:left">Participant</th>
      <th>Groups</th><th>Tables</th><th>Scorers</th><th>KO</th><th>Bracket</th><th>Total</th></tr>`;
    const body = rows
      .map((r) => {
        const bracket = r.champion + r.finalist + r.semifinalists;
        return `<tr class="${r.user === currentUser ? 'me' : ''}">
          <td><span class="medal">${medal(r.position)}</span></td>
          <td class="name">${esc(r.user)}${r.user === currentUser ? ' (you)' : ''}</td>
          <td>${r.groupMatches}</td><td>${r.groupStandings}</td>
          <td>${r.topScorers}</td><td>${r.koMatches}</td><td>${bracket}</td>
          <td class="total-cell">${r.total}</td></tr>`;
      })
      .join('');
    $('#leaderboard').innerHTML = `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <h2 style="margin:0"><i class="ri-bar-chart-2-line"></i> Leaderboard</h2>
          <button id="refreshLb" class="btn small">
            <i class="ri-refresh-line"></i> Refresh
          </button>
        </div>
        <div style="overflow-x:auto"><table class="lb-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>
      </div>`;
    $('#refreshLb').addEventListener('click', async () => {
      await reload();
      renderLeaderboard();
    });
  }

  // ---------- Reglas ----------
  function renderRules() {
    const s = WC_CONFIG.scoring;
    const kp = (id) => Scoring.koPoints(id);
    $('#rules').innerHTML = `
      <div class="card">
        <h2 style="margin-top:0"><i class="ri-book-open-line"></i> How the pool works</h2>
        <p class="hint">The scoring is balanced so the tournament bets (champion, deep knockout rounds, top scorers) decide the pool — not just grinding group scores.</p>
        <table class="rules-table">
          <tr><th>Item</th><th>Points</th></tr>
          <tr><td>Group match · exact result (e.g. 2–1)</td><td>${s.exact}</td></tr>
          <tr><td>Group match · correct outcome (winner or draw)</td><td>${s.outcome}</td></tr>
          <tr><td>Correct position in a group table (each one)</td><td>${s.groupPos}</td></tr>
          <tr><td>Top ${WC_CONFIG.topScorerCount} scorer · exact position</td><td>${s.scorer}</td></tr>
          <tr><td>Top ${WC_CONFIG.topScorerCount} scorer · right name, wrong position</td><td>${s.scorerInTop}</td></tr>
          <tr><td class="rules-sub" colspan="2">Knockout matches — exact / advancing (scaled by round)</td></tr>
          <tr><td>Round of 32</td><td>${kp('R32').exact} / ${kp('R32').outcome}</td></tr>
          <tr><td>Round of 16</td><td>${kp('R16').exact} / ${kp('R16').outcome}</td></tr>
          <tr><td>Quarter-finals</td><td>${kp('QF').exact} / ${kp('QF').outcome}</td></tr>
          <tr><td>Semi-finals</td><td>${kp('SF').exact} / ${kp('SF').outcome}</td></tr>
          <tr><td>Third place</td><td>${kp('TP').exact} / ${kp('TP').outcome}</td></tr>
          <tr><td>Final</td><td>${kp('F').exact} / ${kp('F').outcome}</td></tr>
          <tr><td class="rules-sub" colspan="2">Tournament bracket</td></tr>
          <tr><td>World champion</td><td>${s.champion}</td></tr>
          <tr><td>Runner-up / finalist</td><td>${s.finalist}</td></tr>
          <tr><td>Semi-finalist (each of the 2 knocked out in the semis)</td><td>${s.semifinalist}</td></tr>
        </table>
        <h3>🗓️ Two phases</h3>
        <ul>
          <li><strong>Phase 1 (before the World Cup):</strong> fill in the 72 group matches, the standings of the 12 groups, the Top ${WC_CONFIG.topScorerCount} scorers and the bracket (champion, finalist and semi-finalists).</li>
          <li><strong>Phase 2 (knockout mode):</strong> once the ties are known, come back and fill in the knockout results. They are worth more the deeper the round.</li>
        </ul>
        <h3><i class="ri-lightbulb-flash-line"></i> Tips</h3>
        <ul>
          <li>You can edit your predictions as many times as you like <strong>until they lock</strong>. Each match locks 1 hour before kick-off (Spain time).</li>
          <li>Always log in with the <strong>same name</strong>.</li>
          <li>Type scorer names the same way as the organizer: the system ignores case and spaces.</li>
        </ul>
      </div>`;
  }

  // ---------- Admin ----------
  let adminUnlocked = false;
  let adminUsers = []; // [{username, pin}] cargado solo para el admin
  let adminEditUser = null; // participante cuyas predicciones edita el admin

  async function refreshAdminUsers() {
    try {
      adminUsers = await API.adminGetUsers(_resolveManifest());
    } catch (e) {
      adminUsers = [];
    }
  }

  function renderAdmin() {
    if (!adminUnlocked) {
      $('#adminPanel').innerHTML = `<div class="card admin-locked">
        <h3><i class="ri-shield-keyhole-line"></i> Organizer area</h3>
        <p class="hint">Enter the admin code to manage results and locks.</p>
        <input type="password" id="adminCodeInput" placeholder="Admin code"/>
        <button id="adminUnlockBtn" class="btn primary">Enter</button>
        <p class="hint" id="adminMsg"></p></div>`;
      $('#adminUnlockBtn').addEventListener('click', async () => {
        const code = $('#adminCodeInput').value;
        if (code === _resolveManifest()) {
          adminUnlocked = true;
          $('#adminMsg').textContent = 'Loading…';
          await refreshAdminUsers();
          renderAdmin();
        } else if (code === WC_CONFIG.adminCode) {
          // Han usado la clave «a la vista» de la config: es la trampa. 😏
          triggerAdminPrank();
        } else {
          $('#adminMsg').textContent = 'Incorrect code.';
        }
      });
      return;
    }
    renderAdminPanel();
  }

  // Easter egg: quien introduce la «clave de admin» que aparece a la vista en
  // la config (la trampa) NO entra al panel; se lleva esta sorpresa a pantalla
  // completa. La clave de verdad vive ofuscada en _bundleManifestSig.
  function triggerAdminPrank() {
    if (document.getElementById('prankOverlay')) return;
    // Opcional: pon aquí la URL de tu imagen/gif gracioso. Si lo dejas vacío,
    // se muestra un emoji gigante por defecto.
    const PRANK_IMG = '';
    const overlay = document.createElement('div');
    overlay.id = 'prankOverlay';
    overlay.className = 'prank-overlay';
    overlay.innerHTML = `
      <div class="prank-box">
        ${
          PRANK_IMG
            ? `<img src="${esc(PRANK_IMG)}" alt="Gotcha" class="prank-img"/>`
            : `<div class="prank-emoji"><i class="ri-spy-fill"></i></div>`
        }
        <h2>NICE TRY, LOOSER 😏</h2>
        <p>Esa clave estaba ahí justo para pillar a los pringaos.</p>
        <button id="prankClose" class="btn primary">Vale, me has pillado</button>
      </div>`;
    document.body.appendChild(overlay);
    document
      .getElementById('prankClose')
      .addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  function renderAdminPanel() {
    const r = state.results;
    const opts = (sel) =>
      `<option value="">—</option>` +
      WC_CONFIG.allTeams
        .map(
          (t) =>
            `<option value="${esc(t.name)}" ${sel === t.name ? 'selected' : ''}>${t.flag} ${esc(t.name)}</option>`,
        )
        .join('');

    // Partidos de grupos
    let groupsHtml = '';
    const byGroup = {};
    WC_CONFIG.groupMatches.forEach((m) =>
      (byGroup[m.group] = byGroup[m.group] || []).push(m),
    );
    Object.keys(byGroup).forEach((g) => {
      groupsHtml += `<h4 class="group-title">Group ${g}</h4>`;
      byGroup[g].forEach((m) => {
        const res = (r.groupMatches || {})[m.id] || { home: '', away: '' };
        groupsHtml += `${matchMeta(m)}<div class="match">
          <div class="team home"><span class="flag">${flagOf(m.home)}</span><span class="name">${esc(m.home)}</span></div>
          <div class="score">
            <input type="number" min="0" data-rmid="${m.id}" data-side="home" value="${res.home}"/>
            <span class="dash">–</span>
            <input type="number" min="0" data-rmid="${m.id}" data-side="away" value="${res.away}"/>
          </div>
          <div class="team away"><span class="name">${esc(m.away)}</span><span class="flag">${flagOf(m.away)}</span></div>
        </div>`;
      });
    });

    // Clasificación de grupos: se calcula automáticamente desde los
    // resultados. El admin solo necesita un override manual para desempates.
    let standHtml = '';
    Object.keys(WC_CONFIG.groups).forEach((g) => {
      const teams = WC_CONFIG.groups[g];
      const live = Scoring.groupTable(g, r);
      const manual = (r.groupStandings || {})[g] || [];
      const hasManual = manual.length === 4 && manual.every(Boolean);
      // El select se prerellena con el override manual o con el orden auto.
      const order = hasManual ? manual : live.order;
      standHtml += `<div class="card standings-card"><h4 class="group-title">Group ${g} ${live.complete ? '<i class="ri-checkbox-circle-fill st-ok"></i> complete' : '(live)'}</h4>
        <div class="live-auto">${liveStandingsHtml(live)}</div>
        <details class="override"><summary><i class="ri-edit-line"></i> Adjust order manually (only for official tie-breaks)</summary>`;
      for (let pos = 0; pos < 4; pos++) {
        standHtml += `<div class="pos-row"><div class="pos-num ${pos < 2 ? 'q' : ''}">${pos + 1}º</div>
          <select data-rgroup="${g}" data-pos="${pos}">
            <option value="">— auto —</option>
            ${teams.map((t) => `<option value="${esc(t.name)}" ${hasManual && order[pos] === t.name ? 'selected' : ''}>${t.flag} ${esc(t.name)}</option>`).join('')}
          </select></div>`;
      }
      standHtml += `</details></div>`;
    });

    // Goleadores
    let scorersHtml = '';
    for (let i = 0; i < WC_CONFIG.topScorerCount; i++) {
      scorersHtml += `<div class="field"><label>${i + 1}${ordSuffix(i + 1)} scorer</label>
        <input type="text" class="scorer" data-rscorer="${i}" value="${esc((r.topScorers || [])[i] || '')}"/></div>`;
    }

    // Bracket
    const b = r.bracket || {};
    const bracketHtml = `
      <div class="grid2">
        <div class="field"><label>Champion</label><select id="res-champion">${opts(b.champion)}</select></div>
        <div class="field"><label>Runner-up</label><select id="res-finalist">${opts(b.finalist)}</select></div>
      </div>
      <div class="grid2">
        <div class="field"><label>Semi-finalist 1 (knocked out in semis)</label><select id="res-semi-0">${opts((b.semifinalists || [])[0])}</select></div>
        <div class="field"><label>Semi-finalist 2 (knocked out in semis)</label><select id="res-semi-1">${opts((b.semifinalists || [])[1])}</select></div>
      </div>`;

    // Cuadro de eliminatorias. Los equipos se generan AUTOMÁTICAMENTE a partir
    // de la clasificación oficial de los grupos y de los resultados ya
    // jugados (placeholder). El admin solo escribe para corregir o para fijar
    // los "mejores terceros", que no se pueden deducir solos.
    const koTeams = r.koTeams || {};
    const koLocks = state.locks.koMatches || {};
    const ctx = officialSlotCtx();
    let koListHtml = '';
    WC_CONFIG.koRounds.forEach((round) => {
      const ms = WC_CONFIG.koFixtures.filter((m) => m.round === round.id);
      if (!ms.length) return;
      koListHtml += `<h4 class="group-title">${round.name}</h4>`;
      ms.forEach((m) => {
        const res = (r.koMatches || {})[m.id] || { home: '', away: '' };
        const ov = koTeams[m.id] || {};
        const autoH = resolveSlot(m.home, ctx, 0);
        const autoA = resolveSlot(m.away, ctx, 0);
        const phH = autoH || slotEN(m.home);
        const phA = autoA || slotEN(m.away);
        koListHtml += `${matchMeta(m)}<div class="ko-admin-row">
          <input type="text" class="ko-team" list="teamlist" data-koteam="${m.id}" data-side="home" placeholder="${esc(phH)}" value="${esc(ov.home || '')}"/>
          <div class="score">
            <input type="number" min="0" data-rkoid="${m.id}" data-side="home" value="${res.home}"/>
            <span class="dash">–</span>
            <input type="number" min="0" data-rkoid="${m.id}" data-side="away" value="${res.away}"/>
          </div>
          <input type="text" class="ko-team" list="teamlist" data-koteam="${m.id}" data-side="away" placeholder="${esc(phA)}" value="${esc(ov.away || '')}"/>
          <label class="ko-lock" title="Lock this tie's predictions for everyone"><input type="checkbox" data-kolock="${m.id}" ${koLocks[m.id] ? 'checked' : ''}/> <i class="ri-lock-2-line"></i></label>
        </div>`;
      });
    });

    const teamList = WC_CONFIG.allTeams
      .map((t) => `<option value="${esc(t.name)}">`)
      .join('');

    // Lista de participantes con su PIN, para que el admin pueda reenviarlo,
    // resetearlo o borrar a un jugador concreto (p. ej. usuarios de prueba).
    // Se unen los usuarios registrados (con PIN) y los que tengan predicciones.
    const pinByUser = {};
    adminUsers.forEach((u) => (pinByUser[u.username] = u.pin));
    const participants = Array.from(
      new Set([
        ...adminUsers.map((u) => u.username),
        ...Object.keys(state.predictions || {}),
      ]),
    ).sort((a, b) => a.localeCompare(b));
    let participantsHtml;
    if (!participants.length) {
      participantsHtml = `<p class="hint">No participants yet.</p>`;
    } else {
      participantsHtml = `<div class="participants-list">${participants
        .map((u) => {
          const pin = pinByUser[u];
          const pinTxt =
            pin != null && pin !== ''
              ? `<span class="participant-pin">PIN: <code>${esc(pin)}</code></span>`
              : `<span class="participant-pin muted">no PIN</span>`;
          return `<div class="participant-row">
            <span class="participant-name">${esc(u)}</span>
            ${pinTxt}
            <span class="participant-actions">
              <button class="btn ghost small" data-resetpin="${esc(u)}"><i class="ri-key-2-line"></i> Reset PIN</button>
              <button class="btn danger small" data-deluser="${esc(u)}"><i class="ri-delete-bin-line"></i> Delete</button>
            </span>
          </div>`;
        })
        .join('')}</div>`;
    }

    // Si el participante en edición ya no existe (p. ej. borrado), resetea.
    if (adminEditUser && !participants.includes(adminEditUser)) {
      adminEditUser = null;
    }
    const editUserOptions =
      `<option value="">— select participant —</option>` +
      participants
        .map(
          (u) =>
            `<option value="${esc(u)}" ${adminEditUser === u ? 'selected' : ''}>${esc(u)}</option>`,
        )
        .join('');

    $('#adminPanel').innerHTML = `
      <div class="card admin-section">
        <h3><i class="ri-settings-3-line"></i> Locks and knockout mode</h3>
        <div class="toggle-row">
          <label><input type="checkbox" id="lockGroups" ${state.locks.groups ? 'checked' : ''}/> <span><i class="ri-lock-2-line"></i> Lock Phase 1 predictions (groups)</span></label>
        </div>
        <div class="toggle-row">
          <label><input type="checkbox" id="lockStandings" ${state.locks.standings ? 'checked' : ''}/> <span><i class="ri-lock-2-line"></i> Lock group positions (standings)</span></label>
        </div>
        <div class="toggle-row">
          <label><input type="checkbox" id="lockScorers" ${state.locks.scorers ? 'checked' : ''}/> <span><i class="ri-lock-2-line"></i> Lock top scorers</span></label>
        </div>
        <div class="toggle-row">
          <label><input type="checkbox" id="koActive" ${r.knockout.active ? 'checked' : ''}/> <span><i class="ri-fire-line"></i> Enable knockout mode</span></label>
          <label><input type="checkbox" id="lockKnockout" ${state.locks.knockout ? 'checked' : ''}/> <span><i class="ri-lock-2-line"></i> Lock knockout predictions</span></label>
        </div>
        <p class="hint">Enabling knockout mode also locks the bracket bonus (champion, finalist, semi-finalists) automatically.</p>
      </div>

      <div class="card admin-section">
        <h3><i class="ri-flow-chart"></i> Knockout bracket</h3>
        <p class="hint">Pairings are generated automatically from the official group standings and the results already played (shown in grey). You only need to type a team to fix the «best thirds» or to correct something. Leave a box empty to keep the automatic team.</p>
        <datalist id="teamlist">${teamList}</datalist>
        <div id="koList">${koListHtml}</div>
      </div>

      <div class="card admin-section"><h3><i class="ri-football-fill"></i> Group results</h3>${groupsHtml}</div>
      <div class="card admin-section"><h3><i class="ri-table-line"></i> Group standings (automatic)</h3><p class="hint">Computed automatically from the results. Only use the manual adjustment if you need to fix an official FIFA tie-break.</p>${standHtml}</div>
      <div class="card admin-section"><h3><i class="ri-football-line"></i> Official top scorers</h3>${scorersHtml}</div>
      <div class="card admin-section"><h3><i class="ri-trophy-line"></i> Official bracket</h3>${bracketHtml}</div>

      <div class="card admin-section">
        <h3><i class="ri-group-line"></i> Participants</h3>
        <p class="hint">See each participant's PIN (to remind them if they forget), reset it, or delete a participant entirely (e.g. test users). Deleting removes their predictions and account, not the official results.</p>
        ${participantsHtml}
      </div>

      <div class="card admin-section">
        <h3><i class="ri-edit-box-line"></i> Edit a participant's predictions</h3>
        <p class="hint">Fill in or fix the predictions of any participant — including matches already locked or played (e.g. someone who joined the pool late). Changes are saved on their behalf.</p>
        <div class="field">
          <label>Participant</label>
          <select id="adminEditUser">${editUserOptions}</select>
        </div>
        <div id="adminEditForm"></div>
        <div class="save-bar" style="justify-content:flex-end">
          <span id="adminEditStatus" class="save-status"></span>
          <button id="saveAdminEditBtn" class="btn primary"><i class="ri-save-3-line"></i> Save participant predictions</button>
        </div>
      </div>

      <div class="save-bar" style="justify-content:flex-end">
        <span id="adminSaveStatus" class="save-status"></span>
        <button id="resetAllBtn" class="btn danger small"><i class="ri-delete-bin-line"></i> Delete ALL data</button>
        <button id="saveResultsBtn" class="btn primary"><i class="ri-save-3-line"></i> Save results</button>
      </div>`;

    bindAdminEvents();
  }

  function bindAdminEvents() {
    $('#saveResultsBtn').addEventListener('click', saveResults);
    $('#resetAllBtn').addEventListener('click', resetAllData);
    $$('[data-deluser]').forEach((btn) =>
      btn.addEventListener('click', () =>
        deleteParticipant(btn.dataset.deluser),
      ),
    );
    $$('[data-resetpin]').forEach((btn) =>
      btn.addEventListener('click', () =>
        resetParticipantPin(btn.dataset.resetpin),
      ),
    );

    // Edición de las predicciones de un participante por parte del admin.
    const editSel = $('#adminEditUser');
    if (editSel) {
      editSel.addEventListener('change', () => {
        adminEditUser = editSel.value || null;
        renderAdminEditForm();
      });
    }
    const saveEditBtn = $('#saveAdminEditBtn');
    if (saveEditBtn) {
      saveEditBtn.addEventListener('click', saveAdminEditPrediction);
    }
    const editForm = $('#adminEditForm');
    if (editForm) {
      // Al cambiar las tablas o un marcador de eliminatoria, recalcula los
      // equipos del cuadro con la predicción del propio participante.
      editForm.addEventListener('change', (e) => {
        if (e.target.matches('[data-aegroup], [data-aekoid]')) {
          renderAdminEditKo(collectAdminEditPrediction());
        }
      });
    }
    renderAdminEditForm();

    // Al introducir resultados de grupo, ajustar tablas o marcadores de
    // eliminatoria, regenera automáticamente los emparejamientos del cuadro.
    // El #adminPanel persiste entre renders, así que solo se enlaza una vez.
    const panel = $('#adminPanel');
    if (!panel._koBound) {
      panel._koBound = true;
      panel.addEventListener('change', (e) => {
        if (
          e.target.matches(
            '[data-rmid], [data-rgroup], [data-rkoid], #koActive',
          )
        ) {
          refreshKoList();
        }
      });
    }
  }

  // Recalcula los equipos del cuadro de admin desde el estado actual del
  // formulario (sin guardar) y reescribe solo la lista de cruces.
  function refreshKoList() {
    const koList = $('#koList');
    if (!koList) return;
    collectResults(); // lee el DOM hacia state.results (sin persistir)
    const r = state.results;
    const koTeams = r.koTeams || {};
    const koLocks = state.locks.koMatches || {};
    const ctx = officialSlotCtx();
    let html = '';
    WC_CONFIG.koRounds.forEach((round) => {
      const ms = WC_CONFIG.koFixtures.filter((m) => m.round === round.id);
      if (!ms.length) return;
      html += `<h4 class="group-title">${round.name}</h4>`;
      ms.forEach((m) => {
        const res = (r.koMatches || {})[m.id] || { home: '', away: '' };
        const ov = koTeams[m.id] || {};
        const phH = resolveSlot(m.home, ctx, 0) || slotEN(m.home);
        const phA = resolveSlot(m.away, ctx, 0) || slotEN(m.away);
        html += `${matchMeta(m)}<div class="ko-admin-row">
          <input type="text" class="ko-team" list="teamlist" data-koteam="${m.id}" data-side="home" placeholder="${esc(phH)}" value="${esc(ov.home || '')}"/>
          <div class="score">
            <input type="number" min="0" data-rkoid="${m.id}" data-side="home" value="${res.home}"/>
            <span class="dash">–</span>
            <input type="number" min="0" data-rkoid="${m.id}" data-side="away" value="${res.away}"/>
          </div>
          <input type="text" class="ko-team" list="teamlist" data-koteam="${m.id}" data-side="away" placeholder="${esc(phA)}" value="${esc(ov.away || '')}"/>
          <label class="ko-lock" title="Lock this tie's predictions for everyone"><input type="checkbox" data-kolock="${m.id}" ${koLocks[m.id] ? 'checked' : ''}/> <i class="ri-lock-2-line"></i></label>
        </div>`;
      });
    });
    koList.innerHTML = html;
  }

  function collectResults() {
    const r = state.results;

    $$('[data-rmid]').forEach((inp) => {
      const id = inp.dataset.rmid,
        side = inp.dataset.side;
      r.groupMatches[id] = r.groupMatches[id] || { home: '', away: '' };
      r.groupMatches[id][side] = inp.value === '' ? '' : +inp.value;
    });

    Object.keys(WC_CONFIG.groups).forEach((g) => (r.groupStandings[g] = []));
    $$('[data-rgroup]').forEach((sel) => {
      r.groupStandings[sel.dataset.rgroup][+sel.dataset.pos] = sel.value;
    });

    r.topScorers = $$('[data-rscorer]')
      .sort((a, b) => a.dataset.rscorer - b.dataset.rscorer)
      .map((i) => i.value.trim());

    r.bracket = {
      champion: $('#res-champion').value,
      finalist: $('#res-finalist').value,
      semifinalists: [$('#res-semi-0').value, $('#res-semi-1').value],
    };

    $$('[data-rkoid]').forEach((inp) => {
      const id = inp.dataset.rkoid,
        side = inp.dataset.side;
      r.koMatches[id] = r.koMatches[id] || { home: '', away: '' };
      r.koMatches[id][side] = inp.value === '' ? '' : +inp.value;
    });

    // Nombres reales de los equipos en los cruces (sustituyen al slot).
    r.koTeams = r.koTeams || {};
    $$('[data-koteam]').forEach((inp) => {
      const id = inp.dataset.koteam,
        side = inp.dataset.side,
        val = inp.value.trim();
      if (val) {
        r.koTeams[id] = r.koTeams[id] || {};
        r.koTeams[id][side] = val;
      } else if (r.koTeams[id]) {
        delete r.koTeams[id][side];
      }
    });

    r.knockout.active = $('#koActive').checked;

    // Candados por partido de eliminatoria (se mantienen entre refrescos).
    state.locks.koMatches = state.locks.koMatches || {};
    $$('[data-kolock]').forEach((chk) => {
      state.locks.koMatches[chk.dataset.kolock] = chk.checked;
    });
    return r;
  }

  async function saveResults() {
    const results = collectResults();
    const locks = {
      groups: $('#lockGroups').checked,
      standings: $('#lockStandings').checked,
      scorers: $('#lockScorers').checked,
      knockout: $('#lockKnockout').checked,
      koMatches: state.locks.koMatches || {},
    };
    setStatus('#adminSaveStatus', 'load', 'Saving…');
    try {
      state = await API.saveResults(results, locks, _resolveManifest());
      setStatus(
        '#adminSaveStatus',
        'ok',
        'Saved ' + new Date().toLocaleTimeString(),
      );
      renderAll();
    } catch (e) {
      setStatus('#adminSaveStatus', 'err', e.message);
    }
  }

  // Borra las predicciones de un solo participante (p. ej. un usuario de prueba).
  async function deleteParticipant(username) {
    const ok = window.confirm(
      `Delete participant "${username}" and all their predictions?\n\n` +
        'This cannot be undone.',
    );
    if (!ok) return;
    setStatus('#adminSaveStatus', 'load', `Deleting ${username}…`);
    try {
      state = await API.deletePrediction(username, {
        adminCode: _resolveManifest(),
      });
      await refreshAdminUsers();
      renderAll();
      renderAdminPanel();
      setStatus('#adminSaveStatus', 'del', `${username} deleted`);
    } catch (e) {
      setStatus('#adminSaveStatus', 'err', e.message);
    }
  }

  // Resetea (fija) el PIN de un participante a un nuevo valor elegido por el admin.
  async function resetParticipantPin(username) {
    const pin = window.prompt(`Set a new PIN for "${username}" (4–8 digits):`);
    if (pin == null) return;
    if (!/^\d{4,8}$/.test(pin.trim())) {
      setStatus('#adminSaveStatus', 'err', 'The PIN must be 4 to 8 digits.');
      return;
    }
    setStatus('#adminSaveStatus', 'load', `Updating PIN for ${username}…`);
    try {
      adminUsers = await API.adminSetPin(
        username,
        pin.trim(),
        _resolveManifest(),
      );
      renderAdminPanel();
      setStatus('#adminSaveStatus', 'ok', `PIN updated for ${username}`);
    } catch (e) {
      setStatus('#adminSaveStatus', 'err', e.message);
    }
  }

  // ---------- Admin: editar la predicción de un participante ----------
  // Renderiza un formulario editable con la predicción del participante
  // seleccionado. A diferencia del formulario del usuario, el admin puede
  // editar TODO (partidos ya cerrados o bloqueados incluidos).
  function renderAdminEditForm() {
    const container = $('#adminEditForm');
    if (!container) return;
    if (!adminEditUser) {
      container.innerHTML = `<p class="hint">Select a participant above to load and edit their predictions.</p>`;
      return;
    }

    const saved = state.predictions[adminEditUser];
    const pred = saved
      ? Object.assign(emptyPrediction(adminEditUser), saved)
      : emptyPrediction(adminEditUser);

    // Partidos de grupos.
    let groupsHtml = '';
    const byGroup = {};
    WC_CONFIG.groupMatches.forEach((m) =>
      (byGroup[m.group] = byGroup[m.group] || []).push(m),
    );
    Object.keys(byGroup).forEach((g) => {
      groupsHtml += `<h4 class="group-title">Group ${g}</h4>`;
      byGroup[g].forEach((m) => {
        const p = pred.groupMatches[m.id] || { home: '', away: '' };
        groupsHtml += `${matchMeta(m)}<div class="match">
          <div class="team home"><span class="flag">${flagOf(m.home)}</span><span class="name">${esc(m.home)}</span></div>
          <div class="score">
            <input type="number" min="0" max="30" data-aemid="${m.id}" data-side="home" value="${p.home}"/>
            <span class="dash">–</span>
            <input type="number" min="0" max="30" data-aemid="${m.id}" data-side="away" value="${p.away}"/>
          </div>
          <div class="team away"><span class="name">${esc(m.away)}</span><span class="flag">${flagOf(m.away)}</span></div>
        </div>`;
      });
    });

    // Clasificación de grupos.
    let standHtml = '';
    Object.keys(WC_CONFIG.groups).forEach((g) => {
      const teams = WC_CONFIG.groups[g];
      const order = pred.groupStandings[g] || teams.map((t) => t.name);
      standHtml += `<div class="card standings-card"><h4 class="group-title">Group ${g}</h4>`;
      for (let pos = 0; pos < 4; pos++) {
        standHtml += `<div class="pos-row"><div class="pos-num ${pos < 2 ? 'q' : ''}">${pos + 1}º</div>
          <select data-aegroup="${g}" data-pos="${pos}">
            ${teams
              .map(
                (t) =>
                  `<option value="${esc(t.name)}" ${order[pos] === t.name ? 'selected' : ''}>${t.flag} ${esc(t.name)}</option>`,
              )
              .join('')}
          </select></div>`;
      }
      standHtml += `</div>`;
    });

    // Goleadores.
    let scorersHtml = '';
    for (let i = 0; i < WC_CONFIG.topScorerCount; i++) {
      scorersHtml += `<div class="field"><label>${i + 1}${ordSuffix(i + 1)} scorer</label>
        <input type="text" data-aescorer="${i}" maxlength="40" value="${esc(pred.topScorers[i] || '')}"/></div>`;
    }

    // Bracket (campeón, finalista, semifinalistas).
    const opts = (sel) =>
      `<option value="">— choose team —</option>` +
      WC_CONFIG.allTeams
        .map(
          (t) =>
            `<option value="${esc(t.name)}" ${sel === t.name ? 'selected' : ''}>${t.flag} ${esc(t.name)}</option>`,
        )
        .join('');
    const b = pred.bracket || {};
    const bracketHtml = `
      <div class="grid2">
        <div class="field"><label>Champion</label><select id="ae-champion">${opts(b.champion)}</select></div>
        <div class="field"><label>Runner-up</label><select id="ae-finalist">${opts(b.finalist)}</select></div>
      </div>
      <div class="grid2">
        <div class="field"><label>Semi-finalist 1</label><select id="ae-semi-0">${opts((b.semifinalists || [])[0])}</select></div>
        <div class="field"><label>Semi-finalist 2</label><select id="ae-semi-1">${opts((b.semifinalists || [])[1])}</select></div>
      </div>`;

    container.innerHTML = `
      <div class="admin-edit-section">
        <h4 class="group-title"><i class="ri-football-fill"></i> Group matches</h4>${groupsHtml}
      </div>
      <div class="admin-edit-section">
        <h4 class="group-title"><i class="ri-table-line"></i> Group standings</h4>${standHtml}
      </div>
      <div class="admin-edit-section">
        <h4 class="group-title"><i class="ri-football-line"></i> Top scorers</h4>${scorersHtml}
      </div>
      <div class="admin-edit-section">
        <h4 class="group-title"><i class="ri-trophy-line"></i> Bracket</h4>${bracketHtml}
      </div>
      <div class="admin-edit-section">
        <h4 class="group-title"><i class="ri-flow-chart"></i> Knockouts</h4>
        <div id="adminEditKo"></div>
      </div>`;

    renderAdminEditKo(pred);
  }

  // Renderiza (o regenera) solo el bloque de eliminatorias del formulario de
  // edición del admin, resolviendo los equipos con la predicción dada.
  function renderAdminEditKo(pred) {
    const ko = $('#adminEditKo');
    if (!ko) return;
    if (!state.results.knockout.active) {
      ko.innerHTML = `<p class="hint">Knockout mode is off. Enable it in «Locks and knockout mode» above to edit knockout predictions.</p>`;
      return;
    }
    const matches = koMatchList(pred);
    let html = '';
    WC_CONFIG.koRounds.forEach((round) => {
      const ms = matches.filter((m) => m.round === round.id);
      if (!ms.length) return;
      html += `<h4 class="group-title">${round.name}</h4>`;
      ms.forEach((m) => {
        const p = pred.koMatches[m.id] || { home: '', away: '' };
        html += `${matchMeta(m)}<div class="match">
          <div class="team home"><span class="flag">${flagOf(m.home)}</span><span class="name">${esc(m.home)}</span></div>
          <div class="score">
            <input type="number" min="0" max="30" data-aekoid="${m.id}" data-side="home" value="${p.home}"/>
            <span class="dash">–</span>
            <input type="number" min="0" max="30" data-aekoid="${m.id}" data-side="away" value="${p.away}"/>
          </div>
          <div class="team away"><span class="name">${esc(m.away)}</span><span class="flag">${flagOf(m.away)}</span></div>
        </div>`;
      });
    });
    ko.innerHTML = html;
  }

  // Lee el formulario de edición del admin hacia un objeto de predicción.
  function collectAdminEditPrediction() {
    const pred = emptyPrediction(adminEditUser);

    $$('#adminEditForm [data-aemid]').forEach((inp) => {
      const id = inp.dataset.aemid,
        side = inp.dataset.side;
      pred.groupMatches[id] = pred.groupMatches[id] || { home: '', away: '' };
      pred.groupMatches[id][side] = inp.value === '' ? '' : +inp.value;
    });

    Object.keys(WC_CONFIG.groups).forEach((g) => (pred.groupStandings[g] = []));
    $$('#adminEditForm [data-aegroup]').forEach((sel) => {
      pred.groupStandings[sel.dataset.aegroup][+sel.dataset.pos] = sel.value;
    });

    pred.topScorers = $$('#adminEditForm [data-aescorer]')
      .sort((a, b) => a.dataset.aescorer - b.dataset.aescorer)
      .map((i) => i.value.trim());

    pred.bracket = {
      champion: ($('#ae-champion') || {}).value || '',
      finalist: ($('#ae-finalist') || {}).value || '',
      semifinalists: [
        ($('#ae-semi-0') || {}).value || '',
        ($('#ae-semi-1') || {}).value || '',
      ],
    };

    $$('#adminEditForm [data-aekoid]').forEach((inp) => {
      const id = inp.dataset.aekoid,
        side = inp.dataset.side;
      pred.koMatches[id] = pred.koMatches[id] || { home: '', away: '' };
      pred.koMatches[id][side] = inp.value === '' ? '' : +inp.value;
    });

    return pred;
  }

  // Guarda la predicción del participante seleccionado en nombre del admin.
  async function saveAdminEditPrediction() {
    if (!adminEditUser) {
      setStatus('#adminEditStatus', 'warn', 'Select a participant first.');
      return;
    }
    const dup = checkAdminEditDuplicates();
    if (dup) {
      setStatus(
        '#adminEditStatus',
        'warn',
        'Group ' + dup + ': there are duplicate teams in the standings.',
      );
      return;
    }
    const pred = collectAdminEditPrediction();
    setStatus('#adminEditStatus', 'load', 'Saving…');
    $('#saveAdminEditBtn').disabled = true;
    try {
      state = await API.savePrediction(adminEditUser, pred, null, {
        adminCode: _resolveManifest(),
      });
      setStatus(
        '#adminEditStatus',
        'ok',
        'Saved for ' + adminEditUser + ' · ' + new Date().toLocaleTimeString(),
      );
    } catch (e) {
      setStatus('#adminEditStatus', 'err', e.message);
    } finally {
      $('#saveAdminEditBtn').disabled = false;
    }
  }

  // Comprueba equipos duplicados en las tablas del formulario de admin.
  function checkAdminEditDuplicates() {
    let bad = null;
    Object.keys(WC_CONFIG.groups).forEach((g) => {
      const vals = $$(`#adminEditForm select[data-aegroup="${g}"]`).map(
        (s) => s.value,
      );
      if (new Set(vals).size !== vals.length) bad = bad || g;
    });
    return bad;
  }

  // Borra TODO: predicciones de todos los usuarios + resultados oficiales.
  async function resetAllData() {
    const ok = window.confirm(
      '⚠️ DELETE ALL pool data?\n\n' +
        "This removes EVERY participant's predictions and the official " +
        'results. The pool will be empty. This action CANNOT be undone.',
    );
    if (!ok) return;
    const confirm2 = window.prompt('To confirm, type DELETE in uppercase:');
    if (confirm2 !== 'DELETE') {
      $('#adminSaveStatus').textContent = 'Cancelled.';
      return;
    }
    setStatus('#adminSaveStatus', 'load', 'Deleting everything…');
    try {
      state = await API.resetAll(_resolveManifest());
      await refreshAdminUsers();
      renderAll();
      renderAdminPanel();
      setStatus('#adminSaveStatus', 'del', 'All data deleted');
    } catch (e) {
      setStatus('#adminSaveStatus', 'err', e.message);
    }
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
