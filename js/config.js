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

  // -------- Grupos (sorteo real Mundial 2026) --------
  // 12 grupos (A-L) de 4 equipos. Cada equipo: { name, flag }.
  groups: {
    A: [
      t('México', '🇲🇽'),
      t('Sudáfrica', '🇿🇦'),
      t('República de Corea', '🇰🇷'),
      t('República Checa', '🇨🇿'),
    ],
    B: [
      t('Canadá', '🇨🇦'),
      t('Bosnia y Herzegovina', '🇧🇦'),
      t('Catar', '🇶🇦'),
      t('Suiza', '🇨🇭'),
    ],
    C: [
      t('Brasil', '🇧🇷'),
      t('Marruecos', '🇲🇦'),
      t('Haití', '🇭🇹'),
      t('Escocia', '🏴󠁧󠁢󠁳󠁣󠁴󠁿'),
    ],
    D: [
      t('Estados Unidos', '🇺🇸'),
      t('Paraguay', '🇵🇾'),
      t('Australia', '🇦🇺'),
      t('Turquía', '🇹🇷'),
    ],
    E: [
      t('Alemania', '🇩🇪'),
      t('Curazao', '🇨🇼'),
      t('Costa de Marfil', '🇨🇮'),
      t('Ecuador', '🇪🇨'),
    ],
    F: [
      t('Países Bajos', '🇳🇱'),
      t('Japón', '🇯🇵'),
      t('Suecia', '🇸🇪'),
      t('Túnez', '🇹🇳'),
    ],
    G: [
      t('Bélgica', '🇧🇪'),
      t('Egipto', '🇪🇬'),
      t('Irán', '🇮🇷'),
      t('Nueva Zelanda', '🇳🇿'),
    ],
    H: [
      t('España', '🇪🇸'),
      t('Cabo Verde', '🇨🇻'),
      t('Arabia Saudí', '🇸🇦'),
      t('Uruguay', '🇺🇾'),
    ],
    I: [
      t('Francia', '🇫🇷'),
      t('Senegal', '🇸🇳'),
      t('Irak', '🇮🇶'),
      t('Noruega', '🇳🇴'),
    ],
    J: [
      t('Argentina', '🇦🇷'),
      t('Argelia', '🇩🇿'),
      t('Austria', '🇦🇹'),
      t('Jordania', '🇯🇴'),
    ],
    K: [
      t('Portugal', '🇵🇹'),
      t('RD Congo', '🇨🇩'),
      t('Uzbekistán', '🇺🇿'),
      t('Colombia', '🇨🇴'),
    ],
    L: [
      t('Inglaterra', '🏴󠁧󠁢󠁥󠁮󠁧󠁿'),
      t('Croacia', '🇭🇷'),
      t('Ghana', '🇬🇭'),
      t('Panamá', '🇵🇦'),
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
      'México',
      'Sudáfrica',
      'Estadio Ciudad de México',
    ],
    [
      'A',
      '2026-06-11',
      '22:00',
      'República de Corea',
      'República Checa',
      'Estadio Guadalajara',
    ],
    [
      'B',
      '2026-06-12',
      '15:00',
      'Canadá',
      'Bosnia y Herzegovina',
      'Estadio Toronto',
    ],
    [
      'D',
      '2026-06-12',
      '21:00',
      'Estados Unidos',
      'Paraguay',
      'Estadio Los Ángeles',
    ],
    [
      'B',
      '2026-06-13',
      '15:00',
      'Catar',
      'Suiza',
      'Estadio Bahía de San Francisco',
    ],
    [
      'C',
      '2026-06-13',
      '18:00',
      'Brasil',
      'Marruecos',
      'Estadio Nueva York Nueva Jersey',
    ],
    ['C', '2026-06-13', '21:00', 'Haití', 'Escocia', 'Estadio Boston'],
    [
      'D',
      '2026-06-13',
      '00:00',
      'Australia',
      'Turquía',
      'Estadio BC Place Vancouver',
    ],
    ['E', '2026-06-14', '13:00', 'Alemania', 'Curazao', 'Estadio Houston'],
    ['F', '2026-06-14', '16:00', 'Países Bajos', 'Japón', 'Estadio Dallas'],
    [
      'E',
      '2026-06-14',
      '19:00',
      'Costa de Marfil',
      'Ecuador',
      'Estadio Filadelfia',
    ],
    ['F', '2026-06-14', '22:00', 'Suecia', 'Túnez', 'Estadio Monterrey'],
    ['H', '2026-06-15', '12:00', 'España', 'Cabo Verde', 'Estadio Atlanta'],
    ['G', '2026-06-15', '15:00', 'Bélgica', 'Egipto', 'Estadio Seattle'],
    ['H', '2026-06-15', '18:00', 'Arabia Saudí', 'Uruguay', 'Estadio Miami'],
    [
      'G',
      '2026-06-15',
      '21:00',
      'Irán',
      'Nueva Zelanda',
      'Estadio Los Ángeles',
    ],
    [
      'I',
      '2026-06-16',
      '15:00',
      'Francia',
      'Senegal',
      'Estadio Nueva York Nueva Jersey',
    ],
    ['I', '2026-06-16', '18:00', 'Irak', 'Noruega', 'Estadio Boston'],
    ['J', '2026-06-16', '21:00', 'Argentina', 'Argelia', 'Estadio Kansas City'],
    [
      'J',
      '2026-06-16',
      '00:00',
      'Austria',
      'Jordania',
      'Estadio Bahía de San Francisco',
    ],
    ['K', '2026-06-17', '13:00', 'Portugal', 'RD Congo', 'Estadio Houston'],
    ['L', '2026-06-17', '16:00', 'Inglaterra', 'Croacia', 'Estadio Dallas'],
    ['L', '2026-06-17', '19:00', 'Ghana', 'Panamá', 'Estadio Toronto'],
    [
      'K',
      '2026-06-17',
      '22:00',
      'Uzbekistán',
      'Colombia',
      'Estadio Ciudad de México',
    ],
    [
      'A',
      '2026-06-18',
      '12:00',
      'República Checa',
      'Sudáfrica',
      'Estadio Atlanta',
    ],
    [
      'B',
      '2026-06-18',
      '15:00',
      'Suiza',
      'Bosnia y Herzegovina',
      'Estadio Los Ángeles',
    ],
    [
      'B',
      '2026-06-18',
      '18:00',
      'Canadá',
      'Catar',
      'Estadio BC Place Vancouver',
    ],
    [
      'A',
      '2026-06-18',
      '21:00',
      'México',
      'República de Corea',
      'Estadio Guadalajara',
    ],
    [
      'D',
      '2026-06-19',
      '15:00',
      'Estados Unidos',
      'Australia',
      'Estadio Seattle',
    ],
    ['C', '2026-06-19', '18:00', 'Escocia', 'Marruecos', 'Estadio Boston'],
    ['C', '2026-06-19', '21:00', 'Brasil', 'Haití', 'Estadio Filadelfia'],
    [
      'D',
      '2026-06-19',
      '00:00',
      'Turquía',
      'Paraguay',
      'Estadio Bahía de San Francisco',
    ],
    ['F', '2026-06-20', '13:00', 'Países Bajos', 'Suecia', 'Estadio Houston'],
    [
      'E',
      '2026-06-20',
      '16:00',
      'Alemania',
      'Costa de Marfil',
      'Estadio Toronto',
    ],
    ['E', '2026-06-20', '22:00', 'Ecuador', 'Curazao', 'Estadio Kansas City'],
    ['F', '2026-06-20', '00:00', 'Túnez', 'Japón', 'Estadio Monterrey'],
    ['H', '2026-06-21', '12:00', 'España', 'Arabia Saudí', 'Estadio Atlanta'],
    ['G', '2026-06-21', '15:00', 'Bélgica', 'Irán', 'Estadio Los Ángeles'],
    ['H', '2026-06-21', '18:00', 'Uruguay', 'Cabo Verde', 'Estadio Miami'],
    [
      'G',
      '2026-06-21',
      '21:00',
      'Nueva Zelanda',
      'Egipto',
      'Estadio BC Place Vancouver',
    ],
    ['J', '2026-06-22', '13:00', 'Argentina', 'Austria', 'Estadio Dallas'],
    ['I', '2026-06-22', '17:00', 'Francia', 'Irak', 'Estadio Filadelfia'],
    [
      'I',
      '2026-06-22',
      '20:00',
      'Noruega',
      'Senegal',
      'Estadio Nueva York Nueva Jersey',
    ],
    [
      'J',
      '2026-06-22',
      '23:00',
      'Jordania',
      'Argelia',
      'Estadio Bahía de San Francisco',
    ],
    ['K', '2026-06-23', '13:00', 'Portugal', 'Uzbekistán', 'Estadio Houston'],
    ['L', '2026-06-23', '16:00', 'Inglaterra', 'Ghana', 'Estadio Boston'],
    ['L', '2026-06-23', '19:00', 'Panamá', 'Croacia', 'Estadio Toronto'],
    ['K', '2026-06-23', '22:00', 'Colombia', 'RD Congo', 'Estadio Guadalajara'],
    [
      'B',
      '2026-06-24',
      '15:00',
      'Suiza',
      'Canadá',
      'Estadio BC Place Vancouver',
    ],
    [
      'B',
      '2026-06-24',
      '15:00',
      'Bosnia y Herzegovina',
      'Catar',
      'Estadio Seattle',
    ],
    ['C', '2026-06-24', '18:00', 'Escocia', 'Brasil', 'Estadio Miami'],
    ['C', '2026-06-24', '18:00', 'Marruecos', 'Haití', 'Estadio Atlanta'],
    [
      'A',
      '2026-06-24',
      '21:00',
      'República Checa',
      'México',
      'Estadio Ciudad de México',
    ],
    [
      'A',
      '2026-06-24',
      '21:00',
      'Sudáfrica',
      'República de Corea',
      'Estadio Monterrey',
    ],
    [
      'E',
      '2026-06-25',
      '16:00',
      'Curazao',
      'Costa de Marfil',
      'Estadio Filadelfia',
    ],
    [
      'E',
      '2026-06-25',
      '16:00',
      'Ecuador',
      'Alemania',
      'Estadio Nueva York Nueva Jersey',
    ],
    ['F', '2026-06-25', '19:00', 'Japón', 'Suecia', 'Estadio Dallas'],
    [
      'F',
      '2026-06-25',
      '19:00',
      'Túnez',
      'Países Bajos',
      'Estadio Kansas City',
    ],
    [
      'D',
      '2026-06-25',
      '22:00',
      'Turquía',
      'Estados Unidos',
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
    ['I', '2026-06-26', '15:00', 'Noruega', 'Francia', 'Estadio Boston'],
    ['I', '2026-06-26', '15:00', 'Senegal', 'Irak', 'Estadio Toronto'],
    [
      'H',
      '2026-06-26',
      '20:00',
      'Cabo Verde',
      'Arabia Saudí',
      'Estadio Houston',
    ],
    ['H', '2026-06-26', '20:00', 'Uruguay', 'España', 'Estadio Guadalajara'],
    ['G', '2026-06-26', '23:00', 'Egipto', 'Irán', 'Estadio Seattle'],
    [
      'G',
      '2026-06-26',
      '23:00',
      'Nueva Zelanda',
      'Bélgica',
      'Estadio BC Place Vancouver',
    ],
    [
      'L',
      '2026-06-27',
      '17:00',
      'Panamá',
      'Inglaterra',
      'Estadio Nueva York Nueva Jersey',
    ],
    ['L', '2026-06-27', '17:00', 'Croacia', 'Ghana', 'Estadio Filadelfia'],
    ['K', '2026-06-27', '19:30', 'Colombia', 'Portugal', 'Estadio Miami'],
    ['K', '2026-06-27', '19:30', 'RD Congo', 'Uzbekistán', 'Estadio Atlanta'],
    ['J', '2026-06-27', '22:00', 'Argelia', 'Austria', 'Estadio Kansas City'],
    ['J', '2026-06-27', '22:00', 'Jordania', 'Argentina', 'Estadio Dallas'],
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
  { id: 'R32', name: 'Dieciseisavos' },
  { id: 'R16', name: 'Octavos' },
  { id: 'QF', name: 'Cuartos' },
  { id: 'SF', name: 'Semifinales' },
  { id: 'TP', name: '3er y 4º puesto' },
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
