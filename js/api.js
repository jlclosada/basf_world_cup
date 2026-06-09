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

  // PINs solo se usan en modo local (para testear). En modo sheets viven en
  // la hoja y nunca se cargan en el cliente salvo para el admin.
  const LS_PINS = 'wc2026_pins';
  function localPins() {
    try {
      return JSON.parse(localStorage.getItem(LS_PINS) || '{}');
    } catch (e) {
      return {};
    }
  }
  function localSavePins(pins) {
    localStorage.setItem(LS_PINS, JSON.stringify(pins));
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
    const data = await res.json();
    if (data && data.error) throw new Error(data.error);
    return mergeState(data);
  }
  async function sheetsPost(payload) {
    const res = await fetch(URL, {
      method: 'POST',
      // text/plain evita el preflight CORS con Apps Script
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('No se pudo guardar (POST)');
    const data = await res.json();
    // El backend devuelve { error } cuando algo falla o la acción no existe
    // (p. ej. si el Apps Script no está redesplegado con la versión nueva).
    if (data && data.error) throw new Error(data.error);
    return mergeState(data);
  }

  // ---------- API pública ----------
  async function load() {
    return MODE === 'sheets' ? sheetsGet() : localLoad();
  }

  // Registra (primera vez) o valida el PIN de un usuario. Devuelve el state.
  async function login(username, pin) {
    if (MODE === 'sheets') {
      return sheetsPost({ action: 'login', username, pin });
    }
    const pins = localPins();
    const existing = pins[username];
    if (existing == null) {
      pins[username] = pin;
      localSavePins(pins);
    } else if (existing !== pin) {
      throw new Error('PIN incorrecto');
    }
    return localLoad();
  }

  async function savePrediction(username, prediction, pin) {
    if (MODE === 'sheets') {
      return sheetsPost({
        action: 'savePrediction',
        username,
        prediction,
        pin,
      });
    }
    const pins = localPins();
    if (pins[username] != null && pins[username] !== pin) {
      throw new Error('PIN incorrecto');
    }
    if (pins[username] == null) {
      pins[username] = pin;
      localSavePins(pins);
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

  // Borra las predicciones de un solo usuario. opts: { pin } (el propio
  // usuario) o { adminCode } (el admin, que elimina también su cuenta/PIN).
  async function deletePrediction(username, opts) {
    opts = opts || {};
    if (MODE === 'sheets') {
      return sheetsPost({
        action: 'deletePrediction',
        username,
        pin: opts.pin,
        adminCode: opts.adminCode,
      });
    }
    const isAdmin = opts.adminCode === WC_CONFIG.adminCode;
    const pins = localPins();
    if (!isAdmin && pins[username] != null && pins[username] !== opts.pin) {
      throw new Error('PIN incorrecto');
    }
    const state = localLoad();
    delete state.predictions[username];
    localSaveAll(state);
    if (isAdmin) {
      delete pins[username];
      localSavePins(pins);
    }
    return state;
  }

  // Devuelve la lista de usuarios con su PIN. Solo admin.
  async function adminGetUsers(adminCode) {
    if (MODE === 'sheets') {
      const res = await fetch(URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'adminGetUsers', adminCode }),
      });
      if (!res.ok) throw new Error('No se pudo cargar usuarios');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data.users || [];
    }
    if (adminCode !== WC_CONFIG.adminCode)
      throw new Error('Clave de admin incorrecta');
    const pins = localPins();
    return Object.keys(pins).map((u) => ({ username: u, pin: pins[u] }));
  }

  // Resetea el PIN de un usuario. Solo admin.
  async function adminSetPin(username, pin, adminCode) {
    if (MODE === 'sheets') {
      const res = await fetch(URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'adminSetPin',
          username,
          pin,
          adminCode,
        }),
      });
      if (!res.ok) throw new Error('No se pudo actualizar el PIN');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data.users || [];
    }
    if (adminCode !== WC_CONFIG.adminCode)
      throw new Error('Clave de admin incorrecta');
    const pins = localPins();
    pins[username] = pin;
    localSavePins(pins);
    return Object.keys(pins).map((u) => ({ username: u, pin: pins[u] }));
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
    localSavePins({});
    return state;
  }

  return {
    load,
    login,
    savePrediction,
    saveResults,
    deletePrediction,
    adminGetUsers,
    adminSetPin,
    resetAll,
    emptyState,
  };
})();
