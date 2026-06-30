/* ============================================================
 * BACKEND · Google Apps Script (Google Sheets como base de datos)
 * ------------------------------------------------------------
 * Pega este código en Extensiones > Apps Script de tu Google Sheet,
 * configura SCHEMA_BUILD_REF y despliega como
 * "Aplicación web" con acceso "Cualquier usuario".
 * Luego copia la URL /exec en js/config.js (sheetsUrl) y pon
 * backend: "sheets".
 *
 * La hoja guarda:
 *   - Pestaña "Predicciones": usuario | actualizado | json
 *   - Pestaña "Usuarios":     usuario | pin | creado | actualizado
 *   - Pestaña "Estado":       celda A1 con { results, locks } en JSON
 * ============================================================ */

// Referencia de build del esquema de datos. Se valida contra la firma del
// bundle del front (_bundleManifestSig en js/app.js) para garantizar que el
// cliente y la hoja están en la misma versión antes de aceptar escrituras.
const SCHEMA_BUILD_REF = 'RG7-x42-boss-2026';

const SHEET_PRED = 'Predicciones';
const SHEET_USERS = 'Usuarios';
const SHEET_STATE = 'Estado';

function doGet() {
  return json(getState());
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ error: 'JSON inválido' });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (body.action === 'login') {
      const username = (body.username || '').toString().trim().slice(0, 40);
      const pin = (body.pin || '').toString().trim();
      if (!username) return json({ error: 'Falta usuario' });
      if (!/^\d{4,8}$/.test(pin))
        return json({ error: 'El PIN debe tener entre 4 y 8 dígitos' });
      const existing = getUserPin(username);
      if (existing === null) {
        setUserPin(username, pin); // registro nuevo
        return json(Object.assign({ ok: true, created: true }, getState()));
      }
      if (existing !== pin) return json({ error: 'PIN incorrecto' });
      return json(Object.assign({ ok: true, created: false }, getState()));
    } else if (body.action === 'savePrediction') {
      if (!body.username || typeof body.username !== 'string') {
        return json({ error: 'Falta usuario' });
      }
      const username = body.username.trim().slice(0, 40);
      const isAdmin = body.adminCode === SCHEMA_BUILD_REF;
      const pin = (body.pin || '').toString().trim();
      const existing = getUserPin(username);
      // El admin puede guardar la predicción de cualquier usuario sin su PIN
      // (p. ej. para rellenar partidos ya bloqueados de quien se unió tarde).
      if (!isAdmin) {
        if (!/^\d{4,8}$/.test(pin)) {
          return json({ error: 'PIN inválido' });
        }
        if (existing !== null && existing !== pin) {
          return json({ error: 'PIN incorrecto' });
        }
        if (existing === null) setUserPin(username, pin);
      }
      // SEGURIDAD: el servidor es la fuente de verdad de los cierres. Aunque
      // el cliente bloquee la edición, alguien podría llamar a este endpoint
      // con curl para cambiar marcadores de partidos YA empezados (trampa con
      // el resultado conocido). Por eso fusionamos la predicción entrante con
      // la guardada y descartamos cualquier cambio sobre partidos o secciones
      // ya cerradas. El admin sí escribe libre (rellena cierres de rezagados).
      let finalPred;
      if (isAdmin) {
        finalPred = body.prediction || {};
      } else {
        const stored = getStoredPrediction(username);
        finalPred = mergePrediction(
          stored,
          body.prediction || {},
          getStateBlob(),
        );
      }
      finalPred.username = username;
      upsertPrediction(username, finalPred);
    } else if (body.action === 'saveResults') {
      if (body.adminCode !== SCHEMA_BUILD_REF) {
        return json({ error: 'Clave de admin incorrecta' });
      }
      setStateBlob({ results: body.results || {}, locks: body.locks || {} });
    } else if (body.action === 'deletePrediction') {
      if (!body.username || typeof body.username !== 'string') {
        return json({ error: 'Falta usuario' });
      }
      const username = body.username.trim().slice(0, 40);
      const isAdmin = body.adminCode === SCHEMA_BUILD_REF;
      if (!isAdmin) {
        const existing = getUserPin(username);
        const pin = (body.pin || '').toString().trim();
        if (existing !== null && existing !== pin) {
          return json({ error: 'PIN incorrecto' });
        }
      }
      deletePrediction(username);
      if (isAdmin) deleteUser(username); // el admin elimina al participante entero
    } else if (body.action === 'adminGetUsers') {
      if (body.adminCode !== SCHEMA_BUILD_REF) {
        return json({ error: 'Clave de admin incorrecta' });
      }
      return json({ ok: true, users: listUsers() });
    } else if (body.action === 'adminSetPin') {
      if (body.adminCode !== SCHEMA_BUILD_REF) {
        return json({ error: 'Clave de admin incorrecta' });
      }
      const username = (body.username || '').toString().trim().slice(0, 40);
      const pin = (body.pin || '').toString().trim();
      if (!username) return json({ error: 'Falta usuario' });
      if (!/^\d{4,8}$/.test(pin))
        return json({ error: 'El PIN debe tener entre 4 y 8 dígitos' });
      setUserPin(username, pin);
      return json({ ok: true, users: listUsers() });
    } else if (body.action === 'resetAll') {
      if (body.adminCode !== SCHEMA_BUILD_REF) {
        return json({ error: 'Clave de admin incorrecta' });
      }
      resetAll();
    } else {
      return json({ error: 'Acción desconocida' });
    }
    return json(getState());
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Helpers de hojas ---------- */
function ss() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getPredSheet() {
  let sh = ss().getSheetByName(SHEET_PRED);
  if (!sh) {
    sh = ss().insertSheet(SHEET_PRED);
    sh.appendRow(['usuario', 'actualizado', 'json']);
  }
  return sh;
}

function getStateSheet() {
  let sh = ss().getSheetByName(SHEET_STATE);
  if (!sh) {
    sh = ss().insertSheet(SHEET_STATE);
    sh.getRange('A1').setValue('');
  }
  return sh;
}

function getUsersSheet() {
  let sh = ss().getSheetByName(SHEET_USERS);
  if (!sh) {
    sh = ss().insertSheet(SHEET_USERS);
    sh.appendRow(['usuario', 'pin', 'creado', 'actualizado']);
  }
  return sh;
}

// Devuelve el PIN (string) de un usuario, o null si no existe.
function getUserPin(username) {
  const sh = getUsersSheet();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username) return ('' + data[i][1]).trim();
  }
  return null;
}

// Crea o actualiza el PIN de un usuario.
function setUserPin(username, pin) {
  const sh = getUsersSheet();
  const data = sh.getDataRange().getValues();
  const now = new Date().toISOString();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username) {
      sh.getRange(i + 1, 2).setValue(pin);
      sh.getRange(i + 1, 4).setValue(now);
      return;
    }
  }
  sh.appendRow([username, pin, now, now]);
}

// Borra la fila de un usuario de la hoja Usuarios.
function deleteUser(username) {
  const sh = getUsersSheet();
  const data = sh.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === username) sh.deleteRow(i + 1);
  }
}

// Lista todos los usuarios con su PIN (solo para uso del admin).
function listUsers() {
  const sh = getUsersSheet();
  const data = sh.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    out.push({
      username: data[i][0],
      pin: ('' + data[i][1]).trim(),
      updated: data[i][3] || data[i][2] || '',
    });
  }
  return out;
}

function getState() {
  const predictions = {};
  const sh = getPredSheet();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const user = data[i][0];
    if (!user) continue;
    try {
      predictions[user] = JSON.parse(data[i][2]);
    } catch (e) {
      predictions[user] = {};
    }
  }

  const blob = getStateBlob();
  return {
    predictions: predictions,
    results: blob.results || {},
    locks: blob.locks || {},
  };
}

function upsertPrediction(username, prediction) {
  const sh = getPredSheet();
  const data = sh.getDataRange().getValues();
  const now = new Date().toISOString();
  const payload = JSON.stringify(prediction);
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username) {
      sh.getRange(i + 1, 2).setValue(now);
      sh.getRange(i + 1, 3).setValue(payload);
      return;
    }
  }
  sh.appendRow([username, now, payload]);
}

// Borra la fila de predicciones de un usuario.
function deletePrediction(username) {
  const sh = getPredSheet();
  const data = sh.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === username) {
      sh.deleteRow(i + 1);
    }
  }
}

// Borra todo: vacía la hoja de predicciones (deja la cabecera) y el estado.
function resetAll() {
  const sh = getPredSheet();
  const last = sh.getLastRow();
  if (last > 1) {
    sh.deleteRows(2, last - 1);
  }
  const us = getUsersSheet();
  const lastU = us.getLastRow();
  if (lastU > 1) {
    us.deleteRows(2, lastU - 1);
  }
  getStateSheet().getRange('A1').setValue('');
}

function setStateBlob(blob) {
  getStateSheet().getRange('A1').setValue(JSON.stringify(blob));
}

/* ============================================================
 * SEGURIDAD · Cierres aplicados en el servidor
 * ------------------------------------------------------------
 * Toda la lógica de "candados" del front es solo cosmética: alguien
 * puede saltarse la web y llamar a /exec con curl. Estas funciones
 * garantizan que el servidor NUNCA acepte cambios sobre partidos o
 * secciones ya cerradas, fusionando lo entrante con lo ya guardado.
 * ============================================================ */

const _ET_OFFSET = 4; // ET -> UTC en verano (igual que el front)
const _LOCK_MS = 60 * 60 * 1000; // el cierre es 1 h antes del inicio

// Cierre (ms UTC) de cada partido de grupos. El orden DEBE coincidir con el
// array `raw` de js/config.js para reproducir los ids estables G-<grupo>-<n>.
const GROUP_DEADLINES = (function buildDeadlines() {
  const raw = [
    ['A', '2026-06-11', '15:00'],
    ['A', '2026-06-11', '22:00'],
    ['B', '2026-06-12', '15:00'],
    ['D', '2026-06-12', '21:00'],
    ['B', '2026-06-13', '15:00'],
    ['C', '2026-06-13', '18:00'],
    ['C', '2026-06-13', '21:00'],
    ['D', '2026-06-13', '00:00'],
    ['E', '2026-06-14', '13:00'],
    ['F', '2026-06-14', '16:00'],
    ['E', '2026-06-14', '19:00'],
    ['F', '2026-06-14', '22:00'],
    ['H', '2026-06-15', '12:00'],
    ['G', '2026-06-15', '15:00'],
    ['H', '2026-06-15', '18:00'],
    ['G', '2026-06-15', '21:00'],
    ['I', '2026-06-16', '15:00'],
    ['I', '2026-06-16', '18:00'],
    ['J', '2026-06-16', '21:00'],
    ['J', '2026-06-16', '00:00'],
    ['K', '2026-06-17', '13:00'],
    ['L', '2026-06-17', '16:00'],
    ['L', '2026-06-17', '19:00'],
    ['K', '2026-06-17', '22:00'],
    ['A', '2026-06-18', '12:00'],
    ['B', '2026-06-18', '15:00'],
    ['B', '2026-06-18', '18:00'],
    ['A', '2026-06-18', '21:00'],
    ['D', '2026-06-19', '15:00'],
    ['C', '2026-06-19', '18:00'],
    ['C', '2026-06-19', '21:00'],
    ['D', '2026-06-19', '00:00'],
    ['F', '2026-06-20', '13:00'],
    ['E', '2026-06-20', '16:00'],
    ['E', '2026-06-20', '22:00'],
    ['F', '2026-06-20', '00:00'],
    ['H', '2026-06-21', '12:00'],
    ['G', '2026-06-21', '15:00'],
    ['H', '2026-06-21', '18:00'],
    ['G', '2026-06-21', '21:00'],
    ['J', '2026-06-22', '13:00'],
    ['I', '2026-06-22', '17:00'],
    ['I', '2026-06-22', '20:00'],
    ['J', '2026-06-22', '23:00'],
    ['K', '2026-06-23', '13:00'],
    ['L', '2026-06-23', '16:00'],
    ['L', '2026-06-23', '19:00'],
    ['K', '2026-06-23', '22:00'],
    ['B', '2026-06-24', '15:00'],
    ['B', '2026-06-24', '15:00'],
    ['C', '2026-06-24', '18:00'],
    ['C', '2026-06-24', '18:00'],
    ['A', '2026-06-24', '21:00'],
    ['A', '2026-06-24', '21:00'],
    ['E', '2026-06-25', '16:00'],
    ['E', '2026-06-25', '16:00'],
    ['F', '2026-06-25', '19:00'],
    ['F', '2026-06-25', '19:00'],
    ['D', '2026-06-25', '22:00'],
    ['D', '2026-06-25', '22:00'],
    ['I', '2026-06-26', '15:00'],
    ['I', '2026-06-26', '15:00'],
    ['H', '2026-06-26', '20:00'],
    ['H', '2026-06-26', '20:00'],
    ['G', '2026-06-26', '23:00'],
    ['G', '2026-06-26', '23:00'],
    ['L', '2026-06-27', '17:00'],
    ['L', '2026-06-27', '17:00'],
    ['K', '2026-06-27', '19:30'],
    ['K', '2026-06-27', '19:30'],
    ['J', '2026-06-27', '22:00'],
    ['J', '2026-06-27', '22:00'],
  ];
  const counters = {};
  const out = {};
  raw.forEach(function (r) {
    const group = r[0];
    counters[group] = (counters[group] || 0) + 1;
    const id = 'G-' + group + '-' + counters[group];
    const p = r[1].split('-').map(Number);
    const t = r[2].split(':').map(Number);
    const kickoff = Date.UTC(p[0], p[1] - 1, p[2], t[0] + _ET_OFFSET, t[1]);
    out[id] = kickoff - _LOCK_MS;
  });
  return out;
})();

// Lee el blob de estado { results, locks } de la celda A1.
function getStateBlob() {
  let blob = { results: {}, locks: {} };
  const raw = getStateSheet().getRange('A1').getValue();
  if (raw) {
    try {
      blob = JSON.parse(raw);
    } catch (e) {}
  }
  return blob;
}

// Devuelve la predicción ya guardada de un usuario (o {} si no hay).
function getStoredPrediction(username) {
  const sh = getPredSheet();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username) {
      try {
        return JSON.parse(data[i][2]);
      } catch (e) {
        return {};
      }
    }
  }
  return {};
}

// Sanea un marcador { home, away, penaltiesWinner?: 'home'|'away' }: enteros 0–99 o '' si no hay predicción.
// penaltiesWinner solo se acepta si hay empate en los 90 minutos.
function _score(o) {
  function n(v) {
    if (v === '' || v === null || v === undefined) return '';
    v = parseInt(v, 10);
    if (isNaN(v)) return '';
    if (v < 0) v = 0;
    if (v > 99) v = 99;
    return v;
  }
  o = o || {};
  const home = n(o.home);
  const away = n(o.away);
  const result = { home: home, away: away };

  // penaltiesWinner solo se guarda si hay empate EN LOS 90 MINUTOS
  if (
    home !== '' &&
    away !== '' &&
    home === away &&
    o.penaltiesWinner &&
    (o.penaltiesWinner === 'home' || o.penaltiesWinner === 'away')
  ) {
    result.penaltiesWinner = o.penaltiesWinner;
  }
  return result;
}

function _str(v, max) {
  return ('' + (v == null ? '' : v)).slice(0, max);
}

// Fusiona la predicción entrante con la guardada respetando los cierres del
// servidor. El resultado NUNCA modifica partidos o secciones ya cerradas,
// pase lo que pase en la petición del cliente.
function mergePrediction(stored, incoming, blob) {
  stored = stored || {};
  incoming = incoming || {};
  const locks = (blob && blob.locks) || {};
  const koActive = !!(
    blob &&
    blob.results &&
    blob.results.knockout &&
    blob.results.knockout.active
  );
  const now = Date.now();

  // Partidos de grupos: candado por partido según su hora de inicio.
  const exGm = stored.groupMatches || {};
  const inGm = incoming.groupMatches || {};
  const groupMatches = {};
  Object.keys(GROUP_DEADLINES).forEach(function (id) {
    const closed = now >= GROUP_DEADLINES[id];
    if (closed) {
      if (exGm[id]) groupMatches[id] = _score(exGm[id]);
    } else if (inGm[id] !== undefined) {
      groupMatches[id] = _score(inGm[id]);
    } else if (exGm[id]) {
      groupMatches[id] = _score(exGm[id]);
    }
  });

  // Tablas de clasificación de grupos.
  let groupStandings;
  if (locks.standings || locks.groups) {
    groupStandings = stored.groupStandings || {};
  } else {
    const src = incoming.groupStandings || stored.groupStandings || {};
    groupStandings = {};
    Object.keys(src)
      .slice(0, 12)
      .forEach(function (g) {
        const arr = Array.isArray(src[g]) ? src[g] : [];
        groupStandings[_str(g, 2)] = arr.slice(0, 4).map(function (x) {
          return _str(x, 40);
        });
      });
  }

  // Goleadores (Top N).
  let topScorers;
  if (locks.scorers || locks.groups) {
    topScorers = stored.topScorers || [];
  } else {
    const arr = Array.isArray(incoming.topScorers)
      ? incoming.topScorers
      : stored.topScorers || [];
    topScorers = arr.slice(0, 10).map(function (x) {
      return _str(x, 60);
    });
  }

  // Bonus de cuadro (campeón / finalista / semifinalistas).
  let bracket;
  if (koActive || locks.groups) {
    bracket = stored.bracket || {};
  } else {
    const b = incoming.bracket || stored.bracket || {};
    bracket = {
      champion: _str(b.champion, 40),
      finalist: _str(b.finalist, 40),
      semifinalists: (Array.isArray(b.semifinalists)
        ? b.semifinalists
        : ['', '']
      )
        .slice(0, 4)
        .map(function (x) {
          return _str(x, 40);
        }),
    };
  }

  // Marcadores de eliminatorias (cierre global con locks.knockout y cierre
  // por partido con locks.koMatches[id]).
  let koMatches;
  if (locks.knockout) {
    koMatches = stored.koMatches || {};
  } else {
    const exKo = stored.koMatches || {};
    const koLocks = locks.koMatches || {};
    const src = incoming.koMatches || exKo || {};
    koMatches = {};
    Object.keys(src)
      .slice(0, 64)
      .forEach(function (id) {
        const key = _str(id, 10);
        if (koLocks[id] && exKo[id]) {
          koMatches[key] = _score(exKo[id]);
        } else {
          koMatches[key] = _score(src[id]);
        }
      });
  }

  return {
    username: stored.username || incoming.username,
    groupMatches: groupMatches,
    groupStandings: groupStandings,
    topScorers: topScorers,
    bracket: bracket,
    koMatches: koMatches,
  };
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
