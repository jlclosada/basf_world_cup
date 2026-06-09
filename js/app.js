/* ============================================================
 * LÓGICA DE LA APP (UI)
 * ============================================================ */

const App = (function () {
  let state = API.emptyState();
  let currentUser = null;

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

  // --- Horarios y bloqueo por partido ---
  // Las horas del calendario son del Este de EE. UU. (EDT = UTC-4 en jun/jul).
  // El bloqueo se cierra 1 h antes del inicio (instante absoluto).
  const ET_OFFSET = 4; // horas que hay que SUMAR a ET para obtener UTC en verano
  const LOCK_MS = 60 * 60 * 1000; // 1 hora

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
    if (m.date) parts.push('📅 ' + fmtDate(m.date));
    const st = spainTime(m);
    if (st) parts.push('⏰ ' + st + ' (Spain)');
    else if (m.time) parts.push('⏰ ' + m.time);
    if (m.venue) parts.push('📍 ' + esc(venueEN(m.venue)));
    let lockHtml = '';
    if (showLock && kickoffMs(m) != null) {
      lockHtml = matchClosed(m)
        ? `<span class="lock-tag closed">🔒 closed</span>`
        : `<span class="lock-tag open">✏️ editable until ${deadlineSpainTime(m)}</span>`;
    }
    if (!parts.length && !lockHtml) return '';
    return `<div class="match-meta">${parts.join(' · ')}${lockHtml}</div>`;
  }

  // Cuadro de eliminatorias: fixtures de config + nombres reales que el
  // organizador haya rellenado (state.results.koTeams[id] = {home, away}).
  function koMatchList() {
    const overrides = state.results.koTeams || {};
    return WC_CONFIG.koFixtures.map((m) => {
      const o = overrides[m.id] || {};
      return Object.assign({}, m, {
        home: o.home || slotEN(m.home),
        away: o.away || slotEN(m.away),
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

  // ---------- Arranque ----------
  async function init() {
    $('#title').textContent = WC_CONFIG.edition;
    $('#backendInfo').textContent =
      WC_CONFIG.backend === 'sheets'
        ? 'Shared data via Google Sheets'
        : 'Local mode (this browser) · set up Google Sheets to share';

    bindGlobalEvents();
    await reload();

    const saved = localStorage.getItem('wc2026_user');
    if (saved) {
      currentUser = saved;
      showApp();
    }
  }

  async function reload() {
    try {
      state = await API.load();
    } catch (e) {
      showBanner('⚠️ Could not load data: ' + e.message, 'lock');
    }
  }

  // ---------- Eventos globales ----------
  function bindGlobalEvents() {
    $('#enterBtn').addEventListener('click', doLogin);
    $('#usernameInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doLogin();
    });
    $('#changeUserBtn').addEventListener('click', () => {
      localStorage.removeItem('wc2026_user');
      currentUser = null;
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
  }

  function doLogin() {
    const name = $('#usernameInput').value.trim();
    if (name.length < 2) {
      $('#loginHint').textContent = 'Enter a name with at least 2 characters.';
      return;
    }
    currentUser = name;
    localStorage.setItem('wc2026_user', name);
    showApp();
  }

  function showApp() {
    $('#loginScreen').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#userLabel').textContent = '👤 ' + currentUser;
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

  function showBanner(msg, type) {
    const b = $('#banner');
    b.className = 'banner' + (type ? ' ' + type : '');
    b.textContent = msg;
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
        '🔒 The group stage is closed. You can no longer edit those predictions.',
        'lock',
      );
    } else if (state.locks.knockout) {
      showBanner('🔒 All predictions are closed. Enjoy the World Cup!', 'lock');
    } else if (state.results.knockout.active) {
      showBanner(
        '🔥 Knockout mode is on! Fill in the ties on the «Knockouts» tab.',
        '',
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
    const locked = state.locks.groups;
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
            <div class="col-head">Real ${live.complete ? '✅' : '(live)'}</div>
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
    const locked = state.locks.groups;
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
        <label>${i + 1}${ordSuffix(i + 1)} top scorer (${sc.scorer} pts)</label>
        <input type="text" class="scorer" data-scorer="${i}" maxlength="40"
          placeholder="Player name" value="${esc(pred.topScorers[i] || '')}" ${locked ? 'disabled' : ''}/>
      </div>`;
    }

    $('#sub-bracket').innerHTML = `
      <div class="card">
        <h3 class="group-title">🏆 Bracket bonus</h3>
        <p class="hint">These picks keep the pool alive until the final.</p>
        <div class="grid2">
          <div class="field"><label>Champion (${sc.champion} pts)</label>
            <select id="pred-champion" ${locked ? 'disabled' : ''}>${opts(pred.bracket.champion)}</select></div>
          <div class="field"><label>Runner-up / finalist (${sc.finalist} pts)</label>
            <select id="pred-finalist" ${locked ? 'disabled' : ''}>${opts(pred.bracket.finalist)}</select></div>
        </div>
        <div class="grid2">
          <div class="field"><label>Semi-finalist 1 (${sc.semifinalist} pts)</label>
            <select id="pred-semi-0" ${locked ? 'disabled' : ''}>${opts(pred.bracket.semifinalists[0])}</select></div>
          <div class="field"><label>Semi-finalist 2 (${sc.semifinalist} pts)</label>
            <select id="pred-semi-1" ${locked ? 'disabled' : ''}>${opts(pred.bracket.semifinalists[1])}</select></div>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <h3 class="group-title">👟 Top ${WC_CONFIG.topScorerCount} scorers</h3>
        <p class="hint">Type the name exactly (e.g. «Mbappé», «Haaland»). The exact order matters.</p>
        ${scorers}
      </div>`;
  }

  // ---------- Predicciones: eliminatorias ----------
  function renderKnockout() {
    const pred = myPrediction();
    const ko = state.results.knockout;
    const locked = state.locks.knockout;
    const rko = state.results.koMatches || {};
    const matches = koMatchList();

    if (!ko.active) {
      $('#sub-eliminatorias').innerHTML = `<div class="card admin-locked">
        <h3>⏳ Knockouts not available yet</h3>
        <p class="hint">When the group stage ends, the organizer will turn on «knockout mode» and the 32 ties (with their slots, e.g. «1st Group A») will appear here for you to enter your results.</p></div>`;
      return;
    }

    const sc = WC_CONFIG.scoring;
    let html = `<p class="hint">Enter the result of each tie (score after 90'). ${sc.koExact} pts exact · ${sc.koOutcome} pts for picking who advances.</p>`;
    WC_CONFIG.koRounds.forEach((r) => {
      const ms = matches.filter((m) => m.round === r.id);
      if (!ms.length) return;
      html += `<div class="group-block"><h3 class="group-title">${r.name}</h3>`;
      ms.forEach((m) => {
        const p = pred.koMatches[m.id] || { home: '', away: '' };
        const badge = matchBadge(p, rko[m.id], sc.koExact, sc.koOutcome);
        html += `
          ${matchMeta(m)}
          <div class="match">
            <div class="team home"><span class="flag">${flagOf(m.home)}</span><span class="name">${esc(m.home)}</span></div>
            <div class="score">
              <input type="number" min="0" max="30" data-koid="${m.id}" data-side="home" value="${p.home}" ${locked ? 'disabled' : ''}/>
              <span class="dash">–</span>
              <input type="number" min="0" max="30" data-koid="${m.id}" data-side="away" value="${p.away}" ${locked ? 'disabled' : ''}/>
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
    $$('#sub-tablas select[data-group]').forEach((sel) => {
      pred.groupStandings[sel.dataset.group][+sel.dataset.pos] = sel.value;
    });

    pred.bracket.champion = ($('#pred-champion') || {}).value || '';
    pred.bracket.finalist = ($('#pred-finalist') || {}).value || '';
    pred.bracket.semifinalists = [
      ($('#pred-semi-0') || {}).value || '',
      ($('#pred-semi-1') || {}).value || '',
    ];

    pred.topScorers = $$('#sub-bracket input[data-scorer]')
      .sort((a, b) => a.dataset.scorer - b.dataset.scorer)
      .map((i) => i.value.trim());

    $$('#sub-eliminatorias input[data-koid]').forEach((inp) => {
      const id = inp.dataset.koid,
        side = inp.dataset.side;
      pred.koMatches[id] = pred.koMatches[id] || { home: '', away: '' };
      pred.koMatches[id][side] = inp.value === '' ? '' : +inp.value;
    });

    return pred;
  }

  async function savePrediction() {
    const dup = checkStandingsDuplicates();
    if (dup) {
      $('#saveStatus').textContent =
        '⚠️ Group ' + dup + ': there are duplicate teams in the standings.';
      return;
    }
    const pred = collectPrediction();
    $('#saveStatus').textContent = 'Saving…';
    $('#savePredBtn').disabled = true;
    try {
      state = await API.savePrediction(currentUser, pred);
      $('#saveStatus').textContent =
        '✅ Saved ' + new Date().toLocaleTimeString();
    } catch (e) {
      $('#saveStatus').textContent = '❌ Error: ' + e.message;
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
    $('#saveStatus').textContent = 'Deleting…';
    $('#resetPredBtn').disabled = true;
    try {
      state = await API.deletePrediction(currentUser);
      renderAll();
      $('#saveStatus').textContent = '🗑️ Predictions deleted';
    } catch (e) {
      $('#saveStatus').textContent = '❌ Error: ' + e.message;
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
    const medal = (p) => (p === 1 ? '🥇' : p === 2 ? '🥈' : p === 3 ? '🥉' : p);
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
          <h2 style="margin:0">📊 Leaderboard</h2>
          <button id="refreshLb" class="btn small">🔄 Refresh</button>
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
    $('#rules').innerHTML = `
      <div class="card">
        <h2 style="margin-top:0">📖 How the pool works</h2>
        <table class="rules-table">
          <tr><th>Item</th><th>Points</th></tr>
          <tr><td>Exact match result (e.g. 2–1)</td><td>${s.exact}</td></tr>
          <tr><td>Correct outcome (winner or draw, without exact score)</td><td>${s.outcome}</td></tr>
          <tr><td>Correct position in a group table (each one)</td><td>${s.groupPos}</td></tr>
          <tr><td>Top ${WC_CONFIG.topScorerCount} scorer in the exact position (each one)</td><td>${s.scorer}</td></tr>
          <tr><td>World champion</td><td>${s.champion}</td></tr>
          <tr><td>Runner-up / finalist</td><td>${s.finalist}</td></tr>
          <tr><td>Semi-finalist (each of the 2 knocked out in the semis)</td><td>${s.semifinalist}</td></tr>
          <tr><td>Knockout match exact / correct team advancing</td><td>${s.koExact} / ${s.koOutcome}</td></tr>
        </table>
        <h3>🗓️ Two phases</h3>
        <ul>
          <li><strong>Phase 1 (before the World Cup):</strong> fill in the 72 group matches, the standings of the 12 groups, the Top ${WC_CONFIG.topScorerCount} scorers and the bracket (champion, finalist and semi-finalists).</li>
          <li><strong>Phase 2 (knockout mode):</strong> once the ties are known, come back and fill in the knockout results.</li>
        </ul>
        <h3>✅ Tips</h3>
        <ul>
          <li>You can edit your predictions as many times as you like <strong>until they lock</strong>. Each match locks 1 hour before kick-off (Spain time).</li>
          <li>Always log in with the <strong>same name</strong>.</li>
          <li>Type scorer names the same way as the organizer: the system ignores case and spaces.</li>
        </ul>
      </div>`;
  }

  // ---------- Admin ----------
  let adminUnlocked = false;
  function renderAdmin() {
    if (!adminUnlocked) {
      $('#adminPanel').innerHTML = `<div class="card admin-locked">
        <h3>🔒 Organizer area</h3>
        <p class="hint">Enter the admin code to manage results and locks.</p>
        <input type="password" id="adminCodeInput" placeholder="Admin code"/>
        <button id="adminUnlockBtn" class="btn primary">Enter</button>
        <p class="hint" id="adminMsg"></p></div>`;
      $('#adminUnlockBtn').addEventListener('click', () => {
        if ($('#adminCodeInput').value === WC_CONFIG.adminCode) {
          adminUnlocked = true;
          renderAdmin();
        } else {
          $('#adminMsg').textContent = 'Incorrect code.';
        }
      });
      return;
    }
    renderAdminPanel();
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
      standHtml += `<div class="card standings-card"><h4 class="group-title">Group ${g} ${live.complete ? '✅ complete' : '(live)'}</h4>
        <div class="live-auto">${liveStandingsHtml(live)}</div>
        <details class="override"><summary>✏️ Adjust order manually (only for official tie-breaks)</summary>`;
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

    // Cuadro de eliminatorias (predefinido). El admin rellena el nombre real
    // de cada equipo (sustituyendo el slot) y el resultado.
    const koTeams = r.koTeams || {};
    let koListHtml = '';
    WC_CONFIG.koRounds.forEach((round) => {
      const ms = WC_CONFIG.koFixtures.filter((m) => m.round === round.id);
      if (!ms.length) return;
      koListHtml += `<h4 class="group-title">${round.name}</h4>`;
      ms.forEach((m) => {
        const res = (r.koMatches || {})[m.id] || { home: '', away: '' };
        const ov = koTeams[m.id] || {};
        koListHtml += `${matchMeta(m)}<div class="ko-admin-row">
          <input type="text" class="ko-team" list="teamlist" data-koteam="${m.id}" data-side="home" placeholder="${esc(slotEN(m.home))}" value="${esc(ov.home || '')}"/>
          <div class="score">
            <input type="number" min="0" data-rkoid="${m.id}" data-side="home" value="${res.home}"/>
            <span class="dash">–</span>
            <input type="number" min="0" data-rkoid="${m.id}" data-side="away" value="${res.away}"/>
          </div>
          <input type="text" class="ko-team" list="teamlist" data-koteam="${m.id}" data-side="away" placeholder="${esc(slotEN(m.away))}" value="${esc(ov.away || '')}"/>
        </div>`;
      });
    });

    const teamList = WC_CONFIG.allTeams
      .map((t) => `<option value="${esc(t.name)}">`)
      .join('');

    $('#adminPanel').innerHTML = `
      <div class="card admin-section">
        <h3>⚙️ Locks and knockout mode</h3>
        <div class="toggle-row">
          <label><input type="checkbox" id="lockGroups" ${state.locks.groups ? 'checked' : ''}/> 🔒 Lock Phase 1 predictions (groups)</label>
        </div>
        <div class="toggle-row">
          <label><input type="checkbox" id="koActive" ${r.knockout.active ? 'checked' : ''}/> 🔥 Enable knockout mode</label>
          <label><input type="checkbox" id="lockKnockout" ${state.locks.knockout ? 'checked' : ''}/> 🔒 Lock knockout predictions</label>
        </div>
      </div>

      <div class="card admin-section">
        <h3>🏟️ Knockout bracket</h3>
        <p class="hint">The 32 ties are already loaded with their slots (e.g. «1st Group A»). As they become known, type the real team in each box (leave empty to keep the slot) and enter the result.</p>
        <datalist id="teamlist">${teamList}</datalist>
        <div id="koList">${koListHtml}</div>
      </div>

      <div class="card admin-section"><h3>⚽ Group results</h3>${groupsHtml}</div>
      <div class="card admin-section"><h3>📋 Group standings (automatic)</h3><p class="hint">Computed automatically from the results. Only use the manual adjustment if you need to fix an official FIFA tie-break.</p>${standHtml}</div>
      <div class="card admin-section"><h3>👟 Official top scorers</h3>${scorersHtml}</div>
      <div class="card admin-section"><h3>🏆 Official bracket</h3>${bracketHtml}</div>

      <div class="save-bar" style="justify-content:flex-end">
        <span id="adminSaveStatus" class="save-status"></span>
        <button id="resetAllBtn" class="btn danger small">🗑️ Delete ALL data</button>
        <button id="saveResultsBtn" class="btn primary">💾 Save results</button>
      </div>`;

    bindAdminEvents();
  }

  function bindAdminEvents() {
    $('#saveResultsBtn').addEventListener('click', saveResults);
    $('#resetAllBtn').addEventListener('click', resetAllData);
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
    return r;
  }

  async function saveResults() {
    const results = collectResults();
    const locks = {
      groups: $('#lockGroups').checked,
      knockout: $('#lockKnockout').checked,
    };
    $('#adminSaveStatus').textContent = 'Saving…';
    try {
      state = await API.saveResults(results, locks, WC_CONFIG.adminCode);
      $('#adminSaveStatus').textContent =
        '✅ Saved ' + new Date().toLocaleTimeString();
      renderBanners();
    } catch (e) {
      $('#adminSaveStatus').textContent = '❌ ' + e.message;
    }
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
    $('#adminSaveStatus').textContent = 'Deleting everything…';
    try {
      state = await API.resetAll(WC_CONFIG.adminCode);
      renderAll();
      renderAdminPanel();
      $('#adminSaveStatus').textContent = '🗑️ All data deleted';
    } catch (e) {
      $('#adminSaveStatus').textContent = '❌ ' + e.message;
    }
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
