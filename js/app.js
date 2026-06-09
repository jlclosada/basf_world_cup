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
      let lastDay = 0;
      byGroup[g].forEach((m) => {
        if (m.matchday !== lastDay) {
          html += `<div class="matchday-tag">Jornada ${m.matchday}</div>`;
          lastDay = m.matchday;
        }
        const p = pred.groupMatches[m.id] || { home: '', away: '' };
        const badge = matchBadge(
          p,
          rgm[m.id],
          WC_CONFIG.scoring.exact,
          WC_CONFIG.scoring.outcome,
        );
        html += `
          <div class="match">
            <div class="team home"><span class="flag">${flagOf(m.home)}</span><span class="name">${esc(m.home)}</span></div>
            <div class="score">
              <input type="number" min="0" max="30" data-mid="${m.id}" data-side="home" value="${p.home}" ${locked ? 'disabled' : ''}/>
              <span class="dash">–</span>
              <input type="number" min="0" max="30" data-mid="${m.id}" data-side="away" value="${p.away}" ${locked ? 'disabled' : ''}/>
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
    let html = `<p class="hint">Ordena cada grupo del 1º al 4º. Los dos primeros pasan directos (y los mejores terceros). ${WC_CONFIG.scoring.groupPos} pts por cada posición acertada.</p>`;
    Object.keys(WC_CONFIG.groups).forEach((g) => {
      const teams = WC_CONFIG.groups[g];
      const order = pred.groupStandings[g] || teams.map((t) => t.name);
      html += `<div class="card standings-card"><h3 class="group-title">Grupo ${g}</h3>`;
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
      html += `</div>`;
    });
    $('#sub-tablas').innerHTML = html;
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

    if (!ko.active || !ko.matches.length) {
      $('#sub-eliminatorias').innerHTML = `<div class="card admin-locked">
        <h3>⏳ Eliminatorias aún no disponibles</h3>
        <p class="hint">Cuando termine la fase de grupos, el organizador activará el «modo eliminatoria» y aquí aparecerán los cruces para que metas tus resultados.</p></div>`;
      return;
    }

    const sc = WC_CONFIG.scoring;
    let html = `<p class="hint">Mete el resultado de cada cruce (marcador a los 90'). ${sc.koExact} pts exacto · ${sc.koOutcome} pts por acertar quién pasa.</p>`;
    WC_CONFIG.koRounds.forEach((r) => {
      const ms = ko.matches.filter((m) => m.round === r.id);
      if (!ms.length) return;
      html += `<div class="group-block"><h3 class="group-title">${r.name}</h3>`;
      ms.forEach((m) => {
        const p = pred.koMatches[m.id] || { home: '', away: '' };
        const badge = matchBadge(p, rko[m.id], sc.koExact, sc.koOutcome);
        html += `
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

    $$('#sub-grupos input[data-mid]').forEach((inp) => {
      const id = inp.dataset.mid,
        side = inp.dataset.side;
      pred.groupMatches[id] = pred.groupMatches[id] || { home: '', away: '' };
      pred.groupMatches[id][side] = inp.value === '' ? '' : +inp.value;
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
        groupsHtml += `<div class="match">
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

    // Clasificación final de grupos
    let standHtml = '';
    Object.keys(WC_CONFIG.groups).forEach((g) => {
      const teams = WC_CONFIG.groups[g];
      const order = (r.groupStandings || {})[g] || teams.map((t) => t.name);
      standHtml += `<div class="card standings-card"><h4 class="group-title">Grupo ${g}</h4>`;
      for (let pos = 0; pos < 4; pos++) {
        standHtml += `<div class="pos-row"><div class="pos-num ${pos < 2 ? 'q' : ''}">${pos + 1}º</div>
          <select data-rgroup="${g}" data-pos="${pos}">
            ${teams.map((t) => `<option value="${esc(t.name)}" ${order[pos] === t.name ? 'selected' : ''}>${t.flag} ${esc(t.name)}</option>`).join('')}
          </select></div>`;
      }
      standHtml += `</div>`;
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

    // Constructor de eliminatorias
    const koMatches = (r.knockout && r.knockout.matches) || [];
    let koListHtml = koMatches
      .map((m) => {
        const res = (r.koMatches || {})[m.id] || { home: '', away: '' };
        const rname =
          (WC_CONFIG.koRounds.find((x) => x.id === m.round) || {}).name ||
          m.round;
        return `<div class="match" data-koitem="${m.id}">
          <div class="team home"><span class="flag">${flagOf(m.home)}</span><span class="name">${esc(m.home)} <small style="color:var(--muted)">(${rname})</small></span></div>
          <div class="score">
            <input type="number" min="0" data-rkoid="${m.id}" data-side="home" value="${res.home}"/>
            <span class="dash">–</span>
            <input type="number" min="0" data-rkoid="${m.id}" data-side="away" value="${res.away}"/>
          </div>
          <div class="team away"><span class="name">${esc(m.away)}</span><span class="flag">${flagOf(m.away)}</span>
            <button class="btn small danger" data-removeko="${m.id}" style="margin-left:8px">✕</button></div>
        </div>`;
      })
      .join('');

    const roundOpts = WC_CONFIG.koRounds
      .map((r) => `<option value="${r.id}">${r.name}</option>`)
      .join('');
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
        <h3>🏟️ Cruces de eliminatoria</h3>
        <p class="hint">Añade cada cruce cuando se conozca. Aparecerán a los participantes para que predigan.</p>
        <div class="ko-builder">
          <select id="koRound">${roundOpts}</select>
          <input type="text" id="koHome" list="teamlist" placeholder="Local"/>
          <input type="text" id="koAway" list="teamlist" placeholder="Visitante"/>
          <button id="addKoBtn" class="btn small primary">+ Añadir</button>
        </div>
        <datalist id="teamlist">${teamList}</datalist>
        <div id="koList">${koListHtml || '<p class="hint">Sin cruces todavía.</p>'}</div>
      </div>

      <div class="card admin-section"><h3>⚽ Resultados de grupos</h3>${groupsHtml}</div>
      <div class="card admin-section"><h3>📋 Clasificación final de grupos</h3>${standHtml}</div>
      <div class="card admin-section"><h3>👟 Goleadores oficiales</h3>${scorersHtml}</div>
      <div class="card admin-section"><h3>🏆 Bracket oficial</h3>${bracketHtml}</div>

      <div class="save-bar" style="justify-content:flex-end">
        <span id="adminSaveStatus" class="save-status"></span>
        <button id="saveResultsBtn" class="btn primary">💾 Guardar resultados</button>
      </div>`;

    bindAdminEvents();
  }

  function bindAdminEvents() {
    $('#addKoBtn').addEventListener('click', () => {
      const round = $('#koRound').value;
      const home = $('#koHome').value.trim();
      const away = $('#koAway').value.trim();
      if (!home || !away) return;
      const matches = state.results.knockout.matches;
      const id =
        'K-' +
        round +
        '-' +
        (matches.filter((m) => m.round === round).length + 1) +
        '-' +
        Date.now().toString(36);
      matches.push({ id, round, home, away });
      state.results.knockout.active = true;
      renderAdminPanel();
    });

    $$('[data-removeko]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const id = btn.dataset.removeko;
        state.results.knockout.matches = state.results.knockout.matches.filter(
          (m) => m.id !== id,
        );
        delete state.results.koMatches[id];
        renderAdminPanel();
      }),
    );

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
