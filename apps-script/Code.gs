/* ============================================================
 * BACKEND · Google Apps Script (Google Sheets como base de datos)
 * ------------------------------------------------------------
 * Pega este código en Extensiones > Apps Script de tu Google Sheet,
 * pon tu clave de admin en ADMIN_CODE y despliega como
 * "Aplicación web" con acceso "Cualquier usuario".
 * Luego copia la URL /exec en js/config.js (sheetsUrl) y pon
 * backend: "sheets".
 *
 * La hoja guarda:
 *   - Pestaña "Predicciones": usuario | actualizado | json
 *   - Pestaña "Estado":       celda A1 con { results, locks } en JSON
 * ============================================================ */

const ADMIN_CODE = 'mundial2026'; // <-- debe coincidir con WC_CONFIG.adminCode

const SHEET_PRED = 'Predicciones';
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
    if (body.action === 'savePrediction') {
      if (!body.username || typeof body.username !== 'string') {
        return json({ error: 'Falta usuario' });
      }
      upsertPrediction(
        body.username.trim().slice(0, 40),
        body.prediction || {},
      );
    } else if (body.action === 'saveResults') {
      if (body.adminCode !== ADMIN_CODE) {
        return json({ error: 'Clave de admin incorrecta' });
      }
      setStateBlob({ results: body.results || {}, locks: body.locks || {} });
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

  let blob = { results: {}, locks: {} };
  const raw = getStateSheet().getRange('A1').getValue();
  if (raw) {
    try {
      blob = JSON.parse(raw);
    } catch (e) {}
  }
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

function setStateBlob(blob) {
  getStateSheet().getRange('A1').setValue(JSON.stringify(blob));
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
