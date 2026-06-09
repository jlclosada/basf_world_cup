/* ============================================================
 * MOTOR DE PUNTUACIÓN
 * Calcula los puntos de una predicción contra los resultados oficiales.
 * Todo se calcula en el navegador a partir de los datos del backend.
 * ============================================================ */

const Scoring = (function () {
  const S = WC_CONFIG.scoring;

  const norm = (v) =>
    String(v == null ? '' : v)
      .trim()
      .toLowerCase();
  const sign = (h, a) => (h > a ? 1 : h < a ? -1 : 0);
  const hasScore = (m) =>
    m && m.home !== '' && m.away !== '' && m.home != null && m.away != null;

  // Puntos de un único partido (sirve para grupos y eliminatorias).
  function matchPoints(pred, real, exactPts, outcomePts) {
    if (!hasScore(pred) || !hasScore(real)) return 0;
    const ph = +pred.home,
      pa = +pred.away,
      rh = +real.home,
      ra = +real.away;
    if (ph === rh && pa === ra) return exactPts;
    if (sign(ph, pa) === sign(rh, ra)) return outcomePts;
    return 0;
  }

  // Calcula la clasificación de un grupo a partir de los resultados reales.
  // Devuelve { order: [nombres ordenados], complete: bool, table: [...] }.
  // Desempate: puntos > diferencia de goles > goles a favor > alfabético.
  function groupTable(group, results) {
    const teams = WC_CONFIG.groups[group].map((t) => t.name);
    const st = {};
    teams.forEach((n) => {
      st[n] = { team: n, pj: 0, pts: 0, gf: 0, ga: 0, gd: 0, w: 0, d: 0, l: 0 };
    });
    const rgm = (results && results.groupMatches) || {};
    let played = 0;
    WC_CONFIG.groupMatches
      .filter((m) => m.group === group)
      .forEach((m) => {
        const r = rgm[m.id];
        if (!hasScore(r)) return;
        const h = +r.home,
          a = +r.away,
          sh = st[m.home],
          sa = st[m.away];
        if (!sh || !sa) return;
        played++;
        sh.pj++;
        sa.pj++;
        sh.gf += h;
        sh.ga += a;
        sa.gf += a;
        sa.ga += h;
        if (h > a) {
          sh.pts += 3;
          sh.w++;
          sa.l++;
        } else if (h < a) {
          sa.pts += 3;
          sa.w++;
          sh.l++;
        } else {
          sh.pts++;
          sa.pts++;
          sh.d++;
          sa.d++;
        }
      });
    const table = Object.values(st);
    table.forEach((s) => (s.gd = s.gf - s.ga));
    table.sort(
      (x, y) =>
        y.pts - x.pts ||
        y.gd - x.gd ||
        y.gf - x.gf ||
        x.team.localeCompare(y.team),
    );
    return {
      table,
      order: table.map((s) => s.team),
      complete: played === 6, // 6 partidos por grupo
    };
  }

  // Orden real de un grupo para puntuar: usa el override manual del admin si
  // está completo (4 equipos); si no, el calculado automáticamente cuando el
  // grupo ya ha terminado. Devuelve null si aún no se puede puntuar.
  function realGroupOrder(group, results) {
    const manual = ((results && results.groupStandings) || {})[group] || [];
    if (manual.length === 4 && manual.every(Boolean)) return manual;
    const t = groupTable(group, results);
    return t.complete ? t.order : null;
  }

  // Calcula el desglose completo de una predicción.
  function score(prediction, results) {
    prediction = prediction || {};
    results = results || {};
    const b = {
      groupMatches: 0,
      groupStandings: 0,
      topScorers: 0,
      koMatches: 0,
      champion: 0,
      finalist: 0,
      semifinalists: 0,
      exactCount: 0,
      total: 0,
    };

    // --- Partidos de grupos ---
    const pgm = prediction.groupMatches || {};
    const rgm = results.groupMatches || {};
    WC_CONFIG.groupMatches.forEach((m) => {
      const pts = matchPoints(pgm[m.id], rgm[m.id], S.exact, S.outcome);
      b.groupMatches += pts;
      if (pts === S.exact) b.exactCount++;
    });

    // --- Clasificación de grupos (por posición) ---
    // El orden real se calcula automáticamente desde los resultados (o el
    // override manual del admin). Solo puntúa cuando el grupo ha terminado.
    const pgs = prediction.groupStandings || {};
    Object.keys(WC_CONFIG.groups).forEach((g) => {
      const pred = pgs[g] || [];
      const real = realGroupOrder(g, results);
      if (!real) return;
      for (let i = 0; i < 4; i++) {
        if (pred[i] && real[i] && norm(pred[i]) === norm(real[i])) {
          b.groupStandings += S.groupPos;
        }
      }
    });

    // --- Top goleadores (posición exacta) ---
    const pts3 = prediction.topScorers || [];
    const rts3 = results.topScorers || [];
    for (let i = 0; i < WC_CONFIG.topScorerCount; i++) {
      if (pts3[i] && rts3[i] && norm(pts3[i]) === norm(rts3[i])) {
        b.topScorers += S.scorer;
      }
    }

    // --- Bracket bonus (campeón / finalista / semifinalistas) ---
    const pb = prediction.bracket || {};
    const rb = results.bracket || {};
    if (pb.champion && rb.champion && norm(pb.champion) === norm(rb.champion)) {
      b.champion += S.champion;
    }
    if (pb.finalist && rb.finalist && norm(pb.finalist) === norm(rb.finalist)) {
      b.finalist += S.finalist;
    }
    const realSemis = (rb.semifinalists || []).map(norm);
    (pb.semifinalists || []).forEach((s) => {
      if (s && realSemis.includes(norm(s))) b.semifinalists += S.semifinalist;
    });

    // --- Partidos de eliminatoria ---
    const pko = prediction.koMatches || {};
    const rko = results.koMatches || {};
    const koList =
      WC_CONFIG.koFixtures && WC_CONFIG.koFixtures.length
        ? WC_CONFIG.koFixtures
        : (results.knockout && results.knockout.matches) || [];
    koList.forEach((m) => {
      const pts = matchPoints(pko[m.id], rko[m.id], S.koExact, S.koOutcome);
      b.koMatches += pts;
      if (pts === S.koExact) b.exactCount++;
    });

    b.total =
      b.groupMatches +
      b.groupStandings +
      b.topScorers +
      b.koMatches +
      b.champion +
      b.finalist +
      b.semifinalists;

    return b;
  }

  // Construye la tabla de clasificación a partir de todas las predicciones.
  function leaderboard(predictionsMap, results) {
    const rows = Object.keys(predictionsMap || {}).map((user) => {
      const breakdown = score(predictionsMap[user], results);
      return { user, ...breakdown };
    });
    rows.sort(
      (a, b) =>
        b.total - a.total ||
        b.exactCount - a.exactCount ||
        a.user.localeCompare(b.user),
    );
    let pos = 0,
      last = null;
    rows.forEach((r, i) => {
      if (last === null || r.total !== last) pos = i + 1;
      r.position = pos;
      last = r.total;
    });
    return rows;
  }

  return { score, leaderboard, matchPoints, groupTable, realGroupOrder };
})();
