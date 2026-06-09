/* ============================================================
 * CAPA DE DATOS (API)
 * Dos modos según WC_CONFIG.backend:
 *   - "local"  : guarda en localStorage (para probar tú solo)
 *   - "sheets" : guarda en Google Sheets vía Apps Script (compartido)
 *
 * Estructura del "state":
 * {
 *   predictions: { "Nombre": { ...predicción }, ... },
 *   results: { groupMatches, groupStandings, topScorers, bracket,
 *              koMatches, knockout:{active,matches} },
 *   locks: { groups:false, knockout:false }
 * }
 * ============================================================ */

const API = (function () {
  const MODE = WC_CONFIG.backend;
  const URL = WC_CONFIG.sheetsUrl;
  const LS_KEY = 'wc2026_state';

  function emptyState() {
    return {
      predictions: {},
      results: {
        groupMatches: {},
        groupStandings: {},
        topScorers: [],
        bracket: { champion: '', finalist: '', semifinalists: ['', ''] },
        koMatches: {},
        koTeams: {},
        knockout: { active: false, matches: [] },
      },
      locks: { groups: false, knockout: false },
    };
  }

  // ---------- Modo local ----------
  function localLoad() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? mergeState(JSON.parse(raw)) : emptyState();
    } catch (e) {
      return emptyState();
    }
  }
  function localSaveAll(state) {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }
  function mergeState(s) {
    const base = emptyState();
    return {
      predictions: s.predictions || {},
      results: Object.assign(base.results, s.results || {}),
      locks: Object.assign(base.locks, s.locks || {}),
    };
  }

  // ---------- Modo Sheets ----------
  async function sheetsGet() {
    const res = await fetch(`${URL}?action=load&t=${Date.now()}`);
    if (!res.ok) throw new Error('No se pudo cargar (GET)');
    return mergeState(await res.json());
  }
  async function sheetsPost(payload) {
    const res = await fetch(URL, {
      method: 'POST',
      // text/plain evita el preflight CORS con Apps Script
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('No se pudo guardar (POST)');
    return mergeState(await res.json());
  }

  // ---------- API pública ----------
  async function load() {
    return MODE === 'sheets' ? sheetsGet() : localLoad();
  }

  async function savePrediction(username, prediction) {
    if (MODE === 'sheets') {
      return sheetsPost({ action: 'savePrediction', username, prediction });
    }
    const state = localLoad();
    state.predictions[username] = prediction;
    localSaveAll(state);
    return state;
  }

  async function saveResults(results, locks, adminCode) {
    if (MODE === 'sheets') {
      return sheetsPost({ action: 'saveResults', results, locks, adminCode });
    }
    if (adminCode !== WC_CONFIG.adminCode)
      throw new Error('Clave de admin incorrecta');
    const state = localLoad();
    state.results = results;
    state.locks = locks;
    localSaveAll(state);
    return state;
  }

  // Borra las predicciones de un solo usuario.
  async function deletePrediction(username) {
    if (MODE === 'sheets') {
      return sheetsPost({ action: 'deletePrediction', username });
    }
    const state = localLoad();
    delete state.predictions[username];
    localSaveAll(state);
    return state;
  }

  // Borra TODO (predicciones + resultados). Solo admin.
  async function resetAll(adminCode) {
    if (MODE === 'sheets') {
      return sheetsPost({ action: 'resetAll', adminCode });
    }
    if (adminCode !== WC_CONFIG.adminCode)
      throw new Error('Clave de admin incorrecta');
    const state = emptyState();
    localSaveAll(state);
    return state;
  }

  return {
    load,
    savePrediction,
    saveResults,
    deletePrediction,
    resetAll,
    emptyState,
  };
})();
