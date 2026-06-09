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
    const pgs = prediction.groupStandings || {};
    const rgs = results.groupStandings || {};
    Object.keys(WC_CONFIG.groups).forEach((g) => {
      const pred = pgs[g] || [];
      const real = rgs[g] || [];
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
    (results.knockout && results.knockout.matches
      ? results.knockout.matches
      : []
    ).forEach((m) => {
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

  return { score, leaderboard, matchPoints };
})();
