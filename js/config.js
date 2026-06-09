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
  edition: 'BASF-RG Team World Cup 2026 🇨🇦🇺🇸🇲🇽',

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

  // -------- Puntuación (rebalanceada) --------
  // Filosofía: la fase de grupos da MUCHOS partidos, así que cada uno pesa
  // poco; las apuestas "de torneo" (campeón, eliminatorias avanzadas,
  // goleadores) pesan más y son las que deciden la porra.
  scoring: {
    exact: 3, // resultado exacto en un partido de grupos
    outcome: 1, // acierto 1X2 sin marcador exacto
    groupPos: 3, // por cada posición acertada en la tabla de un grupo
    scorer: 12, // goleador del Top 3 en su posición EXACTA
    scorerInTop: 5, // goleador acertado pero en otra posición del Top 3
    champion: 30, // acertar el campeón
    finalist: 18, // acertar el subcampeón (finalista que pierde)
    semifinalist: 10, // por cada semifinalista (los 2 que caen en semis)

    // Eliminatorias: el valor sube según avanza la ronda (más emoción al
    // final). { exact, outcome } por ronda; si falta una ronda se usan
    // koExact/koOutcome como respaldo.
    koExact: 6, // respaldo (exacto)
    koOutcome: 3, // respaldo (acertar quién pasa)
    koByRound: {
      R32: { exact: 4, outcome: 2 }, // dieciseisavos
      R16: { exact: 6, outcome: 3 }, // octavos
      QF: { exact: 8, outcome: 4 }, // cuartos
      SF: { exact: 12, outcome: 6 }, // semifinales
      TP: { exact: 6, outcome: 3 }, // tercer puesto
      F: { exact: 16, outcome: 8 }, // final
    },
  },

  // -------- Grupos (sorteo real Mundial 2026) --------
  // 12 grupos (A-L) de 4 equipos. Cada equipo: { name, flag }.
  groups: {
    A: [
      t('Mexico', '🇲🇽'),
      t('South Africa', '🇿🇦'),
      t('South Korea', '🇰🇷'),
      t('Czechia', '🇨🇿'),
    ],
    B: [
      t('Canada', '🇨🇦'),
      t('Bosnia & Herzegovina', '🇧🇦'),
      t('Qatar', '🇶🇦'),
      t('Switzerland', '🇨🇭'),
    ],
    C: [
      t('Brazil', '🇧🇷'),
      t('Morocco', '🇲🇦'),
      t('Haiti', '🇭🇹'),
      t('Scotland', '🏴󠁧󠁢󠁳󠁣󠁴󠁿'),
    ],
    D: [
      t('United States', '🇺🇸'),
      t('Paraguay', '🇵🇾'),
      t('Australia', '🇦🇺'),
      t('Turkey', '🇹🇷'),
    ],
    E: [
      t('Germany', '🇩🇪'),
      t('Curaçao', '🇨🇼'),
      t('Ivory Coast', '🇨🇮'),
      t('Ecuador', '🇪🇨'),
    ],
    F: [
      t('Netherlands', '🇳🇱'),
      t('Japan', '🇯🇵'),
      t('Sweden', '🇸🇪'),
      t('Tunisia', '🇹🇳'),
    ],
    G: [
      t('Belgium', '🇧🇪'),
      t('Egypt', '🇪🇬'),
      t('Iran', '🇮🇷'),
      t('New Zealand', '🇳🇿'),
    ],
    H: [
      t('Spain', '🇪🇸'),
      t('Cape Verde', '🇨🇻'),
      t('Saudi Arabia', '🇸🇦'),
      t('Uruguay', '🇺🇾'),
    ],
    I: [
      t('France', '🇫🇷'),
      t('Senegal', '🇸🇳'),
      t('Iraq', '🇮🇶'),
      t('Norway', '🇳🇴'),
    ],
    J: [
      t('Argentina', '🇦🇷'),
      t('Algeria', '🇩🇿'),
      t('Austria', '🇦🇹'),
      t('Jordan', '🇯🇴'),
    ],
    K: [
      t('Portugal', '🇵🇹'),
      t('DR Congo', '🇨🇩'),
      t('Uzbekistan', '🇺🇿'),
      t('Colombia', '🇨🇴'),
    ],
    L: [
      t('England', '🏴󠁧󠁢󠁥󠁮󠁧󠁿'),
      t('Croatia', '🇭🇷'),
      t('Ghana', '🇬🇭'),
      t('Panama', '🇵🇦'),
    ],
  },
};

// Atajo para definir equipos.
function t(name, flag) {
  return { name, flag: flag || '🏳️' };
}

/* ---------- Calendario real de la fase de grupos (72 partidos) ----------
 * Cada partido: { id, group, date, time, venue, home, away }
 * El id es estable (G-<grupo>-<n>) para que las predicciones no se rompan.
 */
WC_CONFIG.groupMatches = (function buildFixtures() {
  // [grupo, fecha, hora, local, visitante, sede]
  const raw = [
    [
      'A',
      '2026-06-11',
      '15:00',
      'Mexico',
      'South Africa',
      'Estadio Ciudad de México',
    ],
    [
      'A',
      '2026-06-11',
      '22:00',
      'South Korea',
      'Czechia',
      'Estadio Guadalajara',
    ],
    [
      'B',
      '2026-06-12',
      '15:00',
      'Canada',
      'Bosnia & Herzegovina',
      'Estadio Toronto',
    ],
    [
      'D',
      '2026-06-12',
      '21:00',
      'United States',
      'Paraguay',
      'Estadio Los Ángeles',
    ],
    [
      'B',
      '2026-06-13',
      '15:00',
      'Qatar',
      'Switzerland',
      'Estadio Bahía de San Francisco',
    ],
    [
      'C',
      '2026-06-13',
      '18:00',
      'Brazil',
      'Morocco',
      'Estadio Nueva York Nueva Jersey',
    ],
    ['C', '2026-06-13', '21:00', 'Haiti', 'Scotland', 'Estadio Boston'],
    [
      'D',
      '2026-06-13',
      '00:00',
      'Australia',
      'Turkey',
      'Estadio BC Place Vancouver',
    ],
    ['E', '2026-06-14', '13:00', 'Germany', 'Curaçao', 'Estadio Houston'],
    ['F', '2026-06-14', '16:00', 'Netherlands', 'Japan', 'Estadio Dallas'],
    [
      'E',
      '2026-06-14',
      '19:00',
      'Ivory Coast',
      'Ecuador',
      'Estadio Filadelfia',
    ],
    ['F', '2026-06-14', '22:00', 'Sweden', 'Tunisia', 'Estadio Monterrey'],
    ['H', '2026-06-15', '12:00', 'Spain', 'Cape Verde', 'Estadio Atlanta'],
    ['G', '2026-06-15', '15:00', 'Belgium', 'Egypt', 'Estadio Seattle'],
    ['H', '2026-06-15', '18:00', 'Saudi Arabia', 'Uruguay', 'Estadio Miami'],
    ['G', '2026-06-15', '21:00', 'Iran', 'New Zealand', 'Estadio Los Ángeles'],
    [
      'I',
      '2026-06-16',
      '15:00',
      'France',
      'Senegal',
      'Estadio Nueva York Nueva Jersey',
    ],
    ['I', '2026-06-16', '18:00', 'Iraq', 'Norway', 'Estadio Boston'],
    ['J', '2026-06-16', '21:00', 'Argentina', 'Algeria', 'Estadio Kansas City'],
    [
      'J',
      '2026-06-16',
      '00:00',
      'Austria',
      'Jordan',
      'Estadio Bahía de San Francisco',
    ],
    ['K', '2026-06-17', '13:00', 'Portugal', 'DR Congo', 'Estadio Houston'],
    ['L', '2026-06-17', '16:00', 'England', 'Croatia', 'Estadio Dallas'],
    ['L', '2026-06-17', '19:00', 'Ghana', 'Panama', 'Estadio Toronto'],
    [
      'K',
      '2026-06-17',
      '22:00',
      'Uzbekistan',
      'Colombia',
      'Estadio Ciudad de México',
    ],
    ['A', '2026-06-18', '12:00', 'Czechia', 'South Africa', 'Estadio Atlanta'],
    [
      'B',
      '2026-06-18',
      '15:00',
      'Switzerland',
      'Bosnia & Herzegovina',
      'Estadio Los Ángeles',
    ],
    [
      'B',
      '2026-06-18',
      '18:00',
      'Canada',
      'Qatar',
      'Estadio BC Place Vancouver',
    ],
    [
      'A',
      '2026-06-18',
      '21:00',
      'Mexico',
      'South Korea',
      'Estadio Guadalajara',
    ],
    [
      'D',
      '2026-06-19',
      '15:00',
      'United States',
      'Australia',
      'Estadio Seattle',
    ],
    ['C', '2026-06-19', '18:00', 'Scotland', 'Morocco', 'Estadio Boston'],
    ['C', '2026-06-19', '21:00', 'Brazil', 'Haiti', 'Estadio Filadelfia'],
    [
      'D',
      '2026-06-19',
      '00:00',
      'Turkey',
      'Paraguay',
      'Estadio Bahía de San Francisco',
    ],
    ['F', '2026-06-20', '13:00', 'Netherlands', 'Sweden', 'Estadio Houston'],
    ['E', '2026-06-20', '16:00', 'Germany', 'Ivory Coast', 'Estadio Toronto'],
    ['E', '2026-06-20', '22:00', 'Ecuador', 'Curaçao', 'Estadio Kansas City'],
    ['F', '2026-06-20', '00:00', 'Tunisia', 'Japan', 'Estadio Monterrey'],
    ['H', '2026-06-21', '12:00', 'Spain', 'Saudi Arabia', 'Estadio Atlanta'],
    ['G', '2026-06-21', '15:00', 'Belgium', 'Iran', 'Estadio Los Ángeles'],
    ['H', '2026-06-21', '18:00', 'Uruguay', 'Cape Verde', 'Estadio Miami'],
    [
      'G',
      '2026-06-21',
      '21:00',
      'New Zealand',
      'Egypt',
      'Estadio BC Place Vancouver',
    ],
    ['J', '2026-06-22', '13:00', 'Argentina', 'Austria', 'Estadio Dallas'],
    ['I', '2026-06-22', '17:00', 'France', 'Iraq', 'Estadio Filadelfia'],
    [
      'I',
      '2026-06-22',
      '20:00',
      'Norway',
      'Senegal',
      'Estadio Nueva York Nueva Jersey',
    ],
    [
      'J',
      '2026-06-22',
      '23:00',
      'Jordan',
      'Algeria',
      'Estadio Bahía de San Francisco',
    ],
    ['K', '2026-06-23', '13:00', 'Portugal', 'Uzbekistan', 'Estadio Houston'],
    ['L', '2026-06-23', '16:00', 'England', 'Ghana', 'Estadio Boston'],
    ['L', '2026-06-23', '19:00', 'Panama', 'Croatia', 'Estadio Toronto'],
    ['K', '2026-06-23', '22:00', 'Colombia', 'DR Congo', 'Estadio Guadalajara'],
    [
      'B',
      '2026-06-24',
      '15:00',
      'Switzerland',
      'Canada',
      'Estadio BC Place Vancouver',
    ],
    [
      'B',
      '2026-06-24',
      '15:00',
      'Bosnia & Herzegovina',
      'Qatar',
      'Estadio Seattle',
    ],
    ['C', '2026-06-24', '18:00', 'Scotland', 'Brazil', 'Estadio Miami'],
    ['C', '2026-06-24', '18:00', 'Morocco', 'Haiti', 'Estadio Atlanta'],
    [
      'A',
      '2026-06-24',
      '21:00',
      'Czechia',
      'Mexico',
      'Estadio Ciudad de México',
    ],
    [
      'A',
      '2026-06-24',
      '21:00',
      'South Africa',
      'South Korea',
      'Estadio Monterrey',
    ],
    [
      'E',
      '2026-06-25',
      '16:00',
      'Curaçao',
      'Ivory Coast',
      'Estadio Filadelfia',
    ],
    [
      'E',
      '2026-06-25',
      '16:00',
      'Ecuador',
      'Germany',
      'Estadio Nueva York Nueva Jersey',
    ],
    ['F', '2026-06-25', '19:00', 'Japan', 'Sweden', 'Estadio Dallas'],
    [
      'F',
      '2026-06-25',
      '19:00',
      'Tunisia',
      'Netherlands',
      'Estadio Kansas City',
    ],
    [
      'D',
      '2026-06-25',
      '22:00',
      'Turkey',
      'United States',
      'Estadio Los Ángeles',
    ],
    [
      'D',
      '2026-06-25',
      '22:00',
      'Paraguay',
      'Australia',
      'Estadio Bahía de San Francisco',
    ],
    ['I', '2026-06-26', '15:00', 'Norway', 'France', 'Estadio Boston'],
    ['I', '2026-06-26', '15:00', 'Senegal', 'Iraq', 'Estadio Toronto'],
    [
      'H',
      '2026-06-26',
      '20:00',
      'Cape Verde',
      'Saudi Arabia',
      'Estadio Houston',
    ],
    ['H', '2026-06-26', '20:00', 'Uruguay', 'Spain', 'Estadio Guadalajara'],
    ['G', '2026-06-26', '23:00', 'Egypt', 'Iran', 'Estadio Seattle'],
    [
      'G',
      '2026-06-26',
      '23:00',
      'New Zealand',
      'Belgium',
      'Estadio BC Place Vancouver',
    ],
    [
      'L',
      '2026-06-27',
      '17:00',
      'Panama',
      'England',
      'Estadio Nueva York Nueva Jersey',
    ],
    ['L', '2026-06-27', '17:00', 'Croatia', 'Ghana', 'Estadio Filadelfia'],
    ['K', '2026-06-27', '19:30', 'Colombia', 'Portugal', 'Estadio Miami'],
    ['K', '2026-06-27', '19:30', 'DR Congo', 'Uzbekistan', 'Estadio Atlanta'],
    ['J', '2026-06-27', '22:00', 'Algeria', 'Austria', 'Estadio Kansas City'],
    ['J', '2026-06-27', '22:00', 'Jordan', 'Argentina', 'Estadio Dallas'],
  ];
  const counters = {};
  return raw.map(([group, date, time, home, away, venue]) => {
    counters[group] = (counters[group] || 0) + 1;
    return {
      id: `G-${group}-${counters[group]}`,
      stage: 'group',
      group,
      date,
      time,
      venue,
      home,
      away,
    };
  });
})();

// Lista plana de todos los equipos (para selects de bracket/goleadores).
WC_CONFIG.allTeams = Object.values(WC_CONFIG.groups).flat();

// Rondas de eliminatoria (solo etiquetas; los cruces los define el admin
// en Fase 2 cuando se conocen los clasificados).
WC_CONFIG.koRounds = [
  { id: 'R32', name: 'Round of 32' },
  { id: 'R16', name: 'Round of 16' },
  { id: 'QF', name: 'Quarter-finals' },
  { id: 'SF', name: 'Semi-finals' },
  { id: 'TP', name: 'Third place' },
  { id: 'F', name: 'Final' },
];

/* ---------- Cuadro de eliminatorias (partidos 73-104) ----------
 * Se cargan con los "slots" (2º Grupo A, Ganador P74, ...). El organizador
 * sustituye los nombres por los equipos reales en la pestaña de admin a
 * medida que se conocen. El id es estable (K-73 ... K-104).
 */
WC_CONFIG.koFixtures = (function buildKo() {
  // [num, round, fecha, local, visitante, sede]
  const raw = [
    [
      73,
      'R32',
      '2026-06-28',
      '2º Grupo A',
      '2º Grupo B',
      'Estadio Los Ángeles',
    ],
    [
      74,
      'R32',
      '2026-06-29',
      '1º Grupo E',
      '3º Grupo A/B/C/D/F',
      'Estadio Boston',
    ],
    [75, 'R32', '2026-06-29', '1º Grupo F', '2º Grupo C', 'Estadio Monterrey'],
    [76, 'R32', '2026-06-29', '1º Grupo C', '2º Grupo F', 'Estadio Houston'],
    [
      77,
      'R32',
      '2026-06-30',
      '1º Grupo I',
      '3º Grupo C/D/F/G/H',
      'Estadio Nueva York Nueva Jersey',
    ],
    [78, 'R32', '2026-06-30', '2º Grupo E', '2º Grupo I', 'Estadio Dallas'],
    [
      79,
      'R32',
      '2026-06-30',
      '1º Grupo A',
      '3º Grupo C/E/F/H/I',
      'Estadio Ciudad de México',
    ],
    [
      80,
      'R32',
      '2026-07-01',
      '1º Grupo L',
      '3º Grupo E/H/I/J/K',
      'Estadio Atlanta',
    ],
    [
      81,
      'R32',
      '2026-07-01',
      '1º Grupo D',
      '3º Grupo B/E/F/I/J',
      'Estadio Bahía de San Francisco',
    ],
    [
      82,
      'R32',
      '2026-07-01',
      '1º Grupo G',
      '3º Grupo A/E/H/I/J',
      'Estadio Seattle',
    ],
    [83, 'R32', '2026-07-02', '2º Grupo K', '2º Grupo L', 'Estadio Toronto'],
    [
      84,
      'R32',
      '2026-07-02',
      '1º Grupo H',
      '2º Grupo J',
      'Estadio Los Ángeles',
    ],
    [
      85,
      'R32',
      '2026-07-02',
      '1º Grupo B',
      '3º Grupo E/F/G/I/J',
      'Estadio BC Place Vancouver',
    ],
    [86, 'R32', '2026-07-03', '1º Grupo J', '2º Grupo H', 'Estadio Miami'],
    [
      87,
      'R32',
      '2026-07-03',
      '1º Grupo K',
      '3º Grupo D/E/I/J/L',
      'Estadio Kansas City',
    ],
    [88, 'R32', '2026-07-03', '2º Grupo D', '2º Grupo G', 'Estadio Dallas'],
    [
      89,
      'R16',
      '2026-07-04',
      'Ganador P74',
      'Ganador P77',
      'Estadio Filadelfia',
    ],
    [90, 'R16', '2026-07-04', 'Ganador P73', 'Ganador P75', 'Estadio Houston'],
    [
      91,
      'R16',
      '2026-07-05',
      'Ganador P76',
      'Ganador P78',
      'Estadio Nueva York Nueva Jersey',
    ],
    [
      92,
      'R16',
      '2026-07-05',
      'Ganador P79',
      'Ganador P80',
      'Estadio Ciudad de México',
    ],
    [93, 'R16', '2026-07-06', 'Ganador P83', 'Ganador P84', 'Estadio Dallas'],
    [94, 'R16', '2026-07-06', 'Ganador P81', 'Ganador P82', 'Estadio Seattle'],
    [95, 'R16', '2026-07-07', 'Ganador P86', 'Ganador P88', 'Estadio Atlanta'],
    [
      96,
      'R16',
      '2026-07-07',
      'Ganador P85',
      'Ganador P87',
      'Estadio BC Place Vancouver',
    ],
    [97, 'QF', '2026-07-09', 'Ganador P89', 'Ganador P90', 'Estadio Boston'],
    [
      98,
      'QF',
      '2026-07-10',
      'Ganador P93',
      'Ganador P94',
      'Estadio Los Ángeles',
    ],
    [99, 'QF', '2026-07-11', 'Ganador P91', 'Ganador P92', 'Estadio Miami'],
    [
      100,
      'QF',
      '2026-07-11',
      'Ganador P95',
      'Ganador P96',
      'Estadio Kansas City',
    ],
    [101, 'SF', '2026-07-14', 'Ganador P97', 'Ganador P98', 'Estadio Dallas'],
    [102, 'SF', '2026-07-15', 'Ganador P99', 'Ganador P100', 'Estadio Atlanta'],
    [
      103,
      'TP',
      '2026-07-18',
      'Perdedor P101',
      'Perdedor P102',
      'Estadio Miami',
    ],
    [
      104,
      'F',
      '2026-07-19',
      'Ganador P101',
      'Ganador P102',
      'Estadio Nueva York Nueva Jersey',
    ],
  ];
  return raw.map(([num, round, date, home, away, venue]) => ({
    id: `K-${num}`,
    num,
    round,
    date,
    venue,
    home,
    away,
  }));
})();
