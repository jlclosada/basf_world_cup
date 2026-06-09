/* ============================================================
 * CONFIGURACIÓN DE LA PORRA · MUNDIAL 2026
 * ------------------------------------------------------------
 * Edita SOLO este archivo para adaptar la porra:
 *   - backend / sheetsUrl  -> dónde se guardan los datos
 *   - adminCode            -> clave para introducir resultados
 *   - groups               -> equipos reales de cada grupo (tras el sorteo)
 *   - scoring              -> puntos de cada concepto
 * El calendario de los 72 partidos se genera solo a partir de groups.
 * ============================================================ */

const WC_CONFIG = {
  edition: 'Mundial 2026 🇨🇦🇺🇸🇲🇽',

  // -------- Backend --------
  // "local"  -> guarda en el navegador (ideal para probar tú solo)
  // "sheets" -> guarda en Google Sheets (compartido entre todos)
  backend: 'sheets',
  sheetsUrl:
    'https://script.google.com/macros/s/AKfycbwSrx5a_5pfsv4vPKcp5vA6UNnU3_oM3EulTMgR96lYZx-R78vUy7TW-J7yc84chvFf/exec', // URL del despliegue de Apps Script (/exec)

  // Clave para acceder a la pestaña "Resultados (admin)".
  // Cámbiala y NO la compartas con los participantes.
  adminCode: 'mundial2026',

  topScorerCount: 3,

  // -------- Puntuación --------
  scoring: {
    exact: 5, // resultado exacto en un partido de grupos
    outcome: 3, // acierto 1X2 sin marcador exacto
    groupPos: 5, // por cada posición acertada en la tabla de un grupo
    scorer: 15, // por cada goleador del Top 3 en su posición exacta
    champion: 20, // acertar el campeón
    finalist: 10, // acertar el subcampeón (finalista que pierde)
    semifinalist: 5, // por cada semifinalista (los 2 que caen en semis)
    koExact: 5, // resultado exacto en partido de eliminatoria (90')
    koOutcome: 3, // acertar quién pasa de ronda
  },

  // -------- Grupos (EDITA tras el sorteo real) --------
  // 12 grupos (A-L) de 4 equipos. Cada equipo: { name, flag }.
  groups: {
    A: [
      t('México', '🇲🇽'),
      t('Polonia', '🇵🇱'),
      t('Arabia Saudí', '🇸🇦'),
      t('Nueva Zelanda', '🇳🇿'),
    ],
    B: [
      t('Canadá', '🇨🇦'),
      t('Bélgica', '🇧🇪'),
      t('Egipto', '🇪🇬'),
      t('Catar', '🇶🇦'),
    ],
    C: [
      t('Estados Unidos', '🇺🇸'),
      t('Croacia', '🇭🇷'),
      t('Nigeria', '🇳🇬'),
      t('Uzbekistán', '🇺🇿'),
    ],
    D: [
      t('Argentina', '🇦🇷'),
      t('Japón', '🇯🇵'),
      t('Argelia', '🇩🇿'),
      t('Panamá', '🇵🇦'),
    ],
    E: [
      t('Francia', '🇫🇷'),
      t('Senegal', '🇸🇳'),
      t('Australia', '🇦🇺'),
      t('Jordania', '🇯🇴'),
    ],
    F: [
      t('Brasil', '🇧🇷'),
      t('Suiza', '🇨🇭'),
      t('Corea del Sur', '🇰🇷'),
      t('Costa Rica', '🇨🇷'),
    ],
    G: [
      t('Inglaterra', '🏴'),
      t('Dinamarca', '🇩🇰'),
      t('Irán', '🇮🇷'),
      t('Jamaica', '🇯🇲'),
    ],
    H: [
      t('España', '🇪🇸'),
      t('Uruguay', '🇺🇾'),
      t('Ghana', '🇬🇭'),
      t('Noruega', '🇳🇴'),
    ],
    I: [
      t('Portugal', '🇵🇹'),
      t('Colombia', '🇨🇴'),
      t('Marruecos', '🇲🇦'),
      t('Perú', '🇵🇪'),
    ],
    J: [
      t('Países Bajos', '🇳🇱'),
      t('Serbia', '🇷🇸'),
      t('Costa de Marfil', '🇨🇮'),
      t('Ecuador', '🇪🇨'),
    ],
    K: [
      t('Alemania', '🇩🇪'),
      t('Turquía', '🇹🇷'),
      t('Camerún', '🇨🇲'),
      t('Chile', '🇨🇱'),
    ],
    L: [
      t('Italia', '🇮🇹'),
      t('Austria', '🇦🇹'),
      t('Túnez', '🇹🇳'),
      t('Paraguay', '🇵🇾'),
    ],
  },
};

// Atajo para definir equipos.
function t(name, flag) {
  return { name, flag: flag || '🏳️' };
}

/* ---------- Generación automática del calendario de grupos ----------
 * 4 equipos por grupo => 6 partidos (round-robin) => 72 partidos totales.
 * Patrón de jornadas (índices 0-3):
 *   J1: 0-1, 2-3   |   J2: 0-2, 3-1   |   J3: 3-0, 1-2
 */
WC_CONFIG.groupMatches = (function buildFixtures() {
  const pattern = [
    [
      [0, 1],
      [2, 3],
    ],
    [
      [0, 2],
      [3, 1],
    ],
    [
      [3, 0],
      [1, 2],
    ],
  ];
  const matches = [];
  Object.keys(WC_CONFIG.groups).forEach((g) => {
    const teams = WC_CONFIG.groups[g];
    let n = 0;
    pattern.forEach((day, di) => {
      day.forEach(([h, a]) => {
        n++;
        matches.push({
          id: `G-${g}-${n}`,
          stage: 'group',
          group: g,
          matchday: di + 1,
          home: teams[h].name,
          away: teams[a].name,
        });
      });
    });
  });
  return matches;
})();

// Lista plana de todos los equipos (para selects de bracket/goleadores).
WC_CONFIG.allTeams = Object.values(WC_CONFIG.groups).flat();

// Rondas de eliminatoria (solo etiquetas; los cruces los define el admin
// en Fase 2 cuando se conocen los clasificados).
WC_CONFIG.koRounds = [
  { id: 'R32', name: 'Dieciseisavos' },
  { id: 'R16', name: 'Octavos' },
  { id: 'QF', name: 'Cuartos' },
  { id: 'SF', name: 'Semifinales' },
  { id: 'TP', name: '3er y 4º puesto' },
  { id: 'F', name: 'Final' },
];
