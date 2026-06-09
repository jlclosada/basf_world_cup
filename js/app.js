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

  // Formatea "2026-06-11" -> "jue 11 jun".
  const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const MON = [
    'ene',
    'feb',
    'mar',
    'abr',
    'may',
    'jun',
    'jul',
    'ago',
    'sep',
    'oct',
    'nov',
    'dic',
  ];
  function fmtDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return `${DOW[dt.getUTCDay()]} ${d} ${MON[m - 1]}`;
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
    if (st) parts.push('⏰ ' + st + ' (España)');
    else if (m.time) parts.push('⏰ ' + m.time);
    if (m.venue) parts.push('📍 ' + esc(m.venue));
    let lockHtml = '';
    if (showLock && kickoffMs(m) != null) {
      lockHtml = matchClosed(m)
        ? `<span class="lock-tag closed">🔒 cerrado</span>`
        : `<span class="lock-tag open">✏️ editable hasta ${deadlineSpainTime(m)}</span>`;
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
        home: o.home || m.home,
        away: o.away || m.away,
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
    $('#title').textContent = 'Porra ' + WC_CONFIG.edition;
    $('#backendInfo').textContent =
      WC_CONFIG.backend === 'sheets'
        ? 'Datos compartidos vía Google Sheets'
        : 'Modo local (este navegador) · configura Google Sheets para compartir';

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
      showBanner('⚠️ No se pudieron cargar los datos: ' + e.message, 'lock');
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
  }

  function doLogin() {
    const name = $('#usernameInput').value.trim();
    if (name.length < 2) {
      $('#loginHint').textContent =
        'Escribe un nombre de al menos 2 caracteres.';
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
        '🔒 La fase de grupos está cerrada. Ya no puedes editar esas predicciones.',
        'lock',
      );
    } else if (state.locks.knockout) {
      showBanner(
        '🔒 Todas las predicciones están cerradas. ¡A disfrutar del Mundial!',
        'lock',
      );
    } else if (state.results.knockout.active) {
      showBanner(
        '🔥 ¡Modo eliminatoria activo! Rellena los cruces en la pestaña «Eliminatorias».',
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
      html += `<div class="group-block"><h3 class="group-title">Grupo ${g}</h3>`;
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
      <span class="pts-badge ${cls}">Resultado: ${esc(real.home)}–${esc(real.away)} · ${pts} pts</span></div>`;
  }

  // ---------- Predicciones: clasificación de grupos ----------
  function renderStandings() {
    const pred = myPrediction();
    const locked = state.locks.groups;
    let html = `<p class="hint">Ordena cada grupo del 1º al 4º. Los dos primeros pasan directos (y los mejores terceros). ${WC_CONFIG.scoring.groupPos} pts por cada posición acertada. La columna «Real» se actualiza sola con los resultados que mete el organizador.</p>`;
    Object.keys(WC_CONFIG.groups).forEach((g) => {
      const teams = WC_CONFIG.groups[g];
      const order = pred.groupStandings[g] || teams.map((t) => t.name);
      const live = Scoring.groupTable(g, state.results);
      html += `<div class="card standings-card"><h3 class="group-title">Grupo ${g}</h3>
        <div class="standings-split">
          <div class="standings-col">
            <div class="col-head">Tu predicción</div>`;
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
            <div class="col-head">Real ${live.complete ? '✅' : '(en vivo)'}</div>
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
            <span class="live-stats">${empty ? '—' : `${s.pj}PJ · ${s.gf}-${s.ga} · ${s.gd >= 0 ? '+' : ''}${s.gd} · <b>${s.pts}pts</b>`}</span>
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
      `<option value="">— elige equipo —</option>` +
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
        <label>${i + 1}º máximo goleador (${sc.scorer} pts)</label>
        <input type="text" class="scorer" data-scorer="${i}" maxlength="40"
          placeholder="Nombre del jugador" value="${esc(pred.topScorers[i] || '')}" ${locked ? 'disabled' : ''}/>
      </div>`;
    }

    $('#sub-bracket').innerHTML = `
      <div class="card">
        <h3 class="group-title">🏆 Bracket bonus</h3>
        <p class="hint">Estas apuestas mantienen viva la porra hasta la final.</p>
        <div class="grid2">
          <div class="field"><label>Campeón (${sc.champion} pts)</label>
            <select id="pred-champion" ${locked ? 'disabled' : ''}>${opts(pred.bracket.champion)}</select></div>
          <div class="field"><label>Subcampeón / finalista (${sc.finalist} pts)</label>
            <select id="pred-finalist" ${locked ? 'disabled' : ''}>${opts(pred.bracket.finalist)}</select></div>
        </div>
        <div class="grid2">
          <div class="field"><label>Semifinalista 1 (${sc.semifinalist} pts)</label>
            <select id="pred-semi-0" ${locked ? 'disabled' : ''}>${opts(pred.bracket.semifinalists[0])}</select></div>
          <div class="field"><label>Semifinalista 2 (${sc.semifinalist} pts)</label>
            <select id="pred-semi-1" ${locked ? 'disabled' : ''}>${opts(pred.bracket.semifinalists[1])}</select></div>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <h3 class="group-title">👟 Top ${WC_CONFIG.topScorerCount} goleadores</h3>
        <p class="hint">Escribe el nombre tal cual (p. ej. «Mbappé», «Haaland»). Cuenta el orden exacto.</p>
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
        <h3>⏳ Eliminatorias aún no disponibles</h3>
        <p class="hint">Cuando termine la fase de grupos, el organizador activará el «modo eliminatoria» y aquí aparecerán los 32 cruces (con sus slots, p. ej. «1º Grupo A») para que metas tus resultados.</p></div>`;
      return;
    }

    const sc = WC_CONFIG.scoring;
    let html = `<p class="hint">Mete el resultado de cada cruce (marcador a los 90'). ${sc.koExact} pts exacto · ${sc.koOutcome} pts por acertar quién pasa.</p>`;
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
        '⚠️ Grupo ' + dup + ': hay equipos repetidos en la clasificación.';
      return;
    }
    const pred = collectPrediction();
    $('#saveStatus').textContent = 'Guardando…';
    $('#savePredBtn').disabled = true;
    try {
      state = await API.savePrediction(currentUser, pred);
      $('#saveStatus').textContent =
        '✅ Guardado ' + new Date().toLocaleTimeString();
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

  // ---------- Clasificación ----------
  function renderLeaderboard() {
    const rows = Scoring.leaderboard(state.predictions, state.results);
    if (!rows.length) {
      $('#leaderboard').innerHTML =
        `<div class="card lb-empty">Aún no hay predicciones guardadas. ¡Sé el primero!</div>`;
      return;
    }
    const medal = (p) => (p === 1 ? '🥇' : p === 2 ? '🥈' : p === 3 ? '🥉' : p);
    const head = `<tr><th>#</th><th class="name" style="text-align:left">Participante</th>
      <th>Grupos</th><th>Tablas</th><th>Golead.</th><th>Elim.</th><th>Bracket</th><th>Total</th></tr>`;
    const body = rows
      .map((r) => {
        const bracket = r.champion + r.finalist + r.semifinalists;
        return `<tr class="${r.user === currentUser ? 'me' : ''}">
          <td><span class="medal">${medal(r.position)}</span></td>
          <td class="name">${esc(r.user)}${r.user === currentUser ? ' (tú)' : ''}</td>
          <td>${r.groupMatches}</td><td>${r.groupStandings}</td>
          <td>${r.topScorers}</td><td>${r.koMatches}</td><td>${bracket}</td>
          <td class="total-cell">${r.total}</td></tr>`;
      })
      .join('');
    $('#leaderboard').innerHTML = `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <h2 style="margin:0">📊 Clasificación</h2>
          <button id="refreshLb" class="btn small">🔄 Actualizar</button>
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
        <h2 style="margin-top:0">📖 Cómo funciona la porra</h2>
        <table class="rules-table">
          <tr><th>Concepto</th><th>Puntos</th></tr>
          <tr><td>Resultado exacto de un partido (p. ej. 2–1)</td><td>${s.exact}</td></tr>
          <tr><td>Acierto del ganador o empate (sin marcador exacto)</td><td>${s.outcome}</td></tr>
          <tr><td>Posición acertada en la tabla de un grupo (cada una)</td><td>${s.groupPos}</td></tr>
          <tr><td>Goleador del Top ${WC_CONFIG.topScorerCount} en su posición exacta (cada uno)</td><td>${s.scorer}</td></tr>
          <tr><td>Campeón del mundo</td><td>${s.champion}</td></tr>
          <tr><td>Subcampeón / finalista</td><td>${s.finalist}</td></tr>
          <tr><td>Semifinalista (cada uno de los 2 que caen en semis)</td><td>${s.semifinalist}</td></tr>
          <tr><td>Partido de eliminatoria exacto / acierto de quién pasa</td><td>${s.koExact} / ${s.koOutcome}</td></tr>
        </table>
        <h3>🗓️ Dos fases</h3>
        <ul>
          <li><strong>Fase 1 (antes del Mundial):</strong> rellena los 72 partidos de grupos, la clasificación de los 12 grupos, el Top ${WC_CONFIG.topScorerCount} de goleadores y el bracket (campeón, finalista y semifinalistas).</li>
          <li><strong>Fase 2 (modo eliminatoria):</strong> cuando se conozcan los cruces, vuelve y rellena los resultados de las eliminatorias.</li>
        </ul>
        <h3>✅ Consejos</h3>
        <ul>
          <li>Puedes editar tus predicciones tantas veces como quieras <strong>hasta que se cierren</strong>.</li>
          <li>Usa siempre el <strong>mismo nombre</strong> para entrar.</li>
          <li>Escribe los goleadores igual que el organizador (sin tildes raras): el sistema ignora mayúsculas y espacios.</li>
        </ul>
      </div>`;
  }

  // ---------- Admin ----------
  let adminUnlocked = false;
  function renderAdmin() {
    if (!adminUnlocked) {
      $('#adminPanel').innerHTML = `<div class="card admin-locked">
        <h3>🔒 Zona del organizador</h3>
        <p class="hint">Introduce la clave de admin para gestionar resultados y cierres.</p>
        <input type="password" id="adminCodeInput" placeholder="Clave de admin"/>
        <button id="adminUnlockBtn" class="btn primary">Entrar</button>
        <p class="hint" id="adminMsg"></p></div>`;
      $('#adminUnlockBtn').addEventListener('click', () => {
        if ($('#adminCodeInput').value === WC_CONFIG.adminCode) {
          adminUnlocked = true;
          renderAdmin();
        } else {
          $('#adminMsg').textContent = 'Clave incorrecta.';
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
      groupsHtml += `<h4 class="group-title">Grupo ${g}</h4>`;
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
      standHtml += `<div class="card standings-card"><h4 class="group-title">Grupo ${g} ${live.complete ? '✅ completo' : '(en vivo)'}</h4>
        <div class="live-auto">${liveStandingsHtml(live)}</div>
        <details class="override"><summary>✏️ Ajustar orden manual (solo para desempates oficiales)</summary>`;
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
      scorersHtml += `<div class="field"><label>${i + 1}º goleador</label>
        <input type="text" class="scorer" data-rscorer="${i}" value="${esc((r.topScorers || [])[i] || '')}"/></div>`;
    }

    // Bracket
    const b = r.bracket || {};
    const bracketHtml = `
      <div class="grid2">
        <div class="field"><label>Campeón</label><select id="res-champion">${opts(b.champion)}</select></div>
        <div class="field"><label>Subcampeón</label><select id="res-finalist">${opts(b.finalist)}</select></div>
      </div>
      <div class="grid2">
        <div class="field"><label>Semifinalista 1 (eliminado en semis)</label><select id="res-semi-0">${opts((b.semifinalists || [])[0])}</select></div>
        <div class="field"><label>Semifinalista 2 (eliminado en semis)</label><select id="res-semi-1">${opts((b.semifinalists || [])[1])}</select></div>
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
          <input type="text" class="ko-team" list="teamlist" data-koteam="${m.id}" data-side="home" placeholder="${esc(m.home)}" value="${esc(ov.home || '')}"/>
          <div class="score">
            <input type="number" min="0" data-rkoid="${m.id}" data-side="home" value="${res.home}"/>
            <span class="dash">–</span>
            <input type="number" min="0" data-rkoid="${m.id}" data-side="away" value="${res.away}"/>
          </div>
          <input type="text" class="ko-team" list="teamlist" data-koteam="${m.id}" data-side="away" placeholder="${esc(m.away)}" value="${esc(ov.away || '')}"/>
        </div>`;
      });
    });

    const teamList = WC_CONFIG.allTeams
      .map((t) => `<option value="${esc(t.name)}">`)
      .join('');

    $('#adminPanel').innerHTML = `
      <div class="card admin-section">
        <h3>⚙️ Cierres y modo eliminatoria</h3>
        <div class="toggle-row">
          <label><input type="checkbox" id="lockGroups" ${state.locks.groups ? 'checked' : ''}/> 🔒 Cerrar predicciones de Fase 1 (grupos)</label>
        </div>
        <div class="toggle-row">
          <label><input type="checkbox" id="koActive" ${r.knockout.active ? 'checked' : ''}/> 🔥 Activar modo eliminatoria</label>
          <label><input type="checkbox" id="lockKnockout" ${state.locks.knockout ? 'checked' : ''}/> 🔒 Cerrar predicciones de eliminatorias</label>
        </div>
      </div>

      <div class="card admin-section">
        <h3>🏟️ Cuadro de eliminatorias</h3>
        <p class="hint">Los 32 cruces ya están cargados con sus slots (p. ej. «1º Grupo A»). A medida que se conozcan, escribe el equipo real en cada casilla (déjalo vacío para mantener el slot) y mete el resultado.</p>
        <datalist id="teamlist">${teamList}</datalist>
        <div id="koList">${koListHtml}</div>
      </div>

      <div class="card admin-section"><h3>⚽ Resultados de grupos</h3>${groupsHtml}</div>
      <div class="card admin-section"><h3>📋 Clasificación de grupos (automática)</h3><p class="hint">Se calcula sola con los resultados. Solo usa el ajuste manual si necesitas corregir un desempate oficial de la FIFA.</p>${standHtml}</div>
      <div class="card admin-section"><h3>👟 Goleadores oficiales</h3>${scorersHtml}</div>
      <div class="card admin-section"><h3>🏆 Bracket oficial</h3>${bracketHtml}</div>

      <div class="save-bar" style="justify-content:flex-end">
        <span id="adminSaveStatus" class="save-status"></span>
        <button id="saveResultsBtn" class="btn primary">💾 Guardar resultados</button>
      </div>`;

    bindAdminEvents();
  }

  function bindAdminEvents() {
    $('#saveResultsBtn').addEventListener('click', saveResults);
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
    $('#adminSaveStatus').textContent = 'Guardando…';
    try {
      state = await API.saveResults(results, locks, WC_CONFIG.adminCode);
      $('#adminSaveStatus').textContent =
        '✅ Guardado ' + new Date().toLocaleTimeString();
      renderBanners();
    } catch (e) {
      $('#adminSaveStatus').textContent = '❌ ' + e.message;
    }
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
