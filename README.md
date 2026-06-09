# ⚽ Porra Mundial 2026

Aplicación web para la porra del Mundial de fútbol 2026 de la oficina. Cada participante mete sus
predicciones y ve la clasificación en tiempo real. **Coste: 0 €.**

## ✨ Qué incluye

- Los **72 partidos** de la fase de grupos (12 grupos de 4 equipos).
- **Clasificación** de cada uno de los 12 grupos.
- **Top 3 goleadores** del Mundial.
- **Bracket bonus**: campeón, subcampeón y semifinalistas.
- **Modo eliminatoria**: el organizador activa los cruces y todos predicen los resultados.
- **Tabla de clasificación** en tiempo real con desglose de puntos.
- Acceso por **nombre de usuario** (sin contraseñas) + **zona de admin** protegida por clave.

## 🏆 Sistema de puntuación

| Concepto                                               | Puntos |
| ------------------------------------------------------ | ------ |
| Resultado exacto (p. ej. 2–1)                          | 5      |
| Acierto 1X2 (ganador/empate sin marcador)              | 3      |
| Posición acertada en un grupo (cada una)               | 5      |
| Goleador del Top 3 en posición exacta (cada uno)       | 15     |
| Campeón                                                | 20     |
| Subcampeón / finalista                                 | 10     |
| Semifinalista (cada uno de los 2 que caen en semis)    | 5      |
| Eliminatoria: resultado exacto / acierto de quién pasa | 5 / 3  |

Todo es editable en [js/config.js](js/config.js).

## 📁 Estructura

```
worldcup/
├─ index.html
├─ css/styles.css
├─ js/
│  ├─ config.js     ← EDITA AQUÍ (equipos, puntos, backend, clave admin)
│  ├─ api.js        ← capa de datos (local o Google Sheets)
│  ├─ scoring.js    ← motor de puntuación
│  └─ app.js        ← interfaz
├─ apps-script/Code.gs   ← backend para Google Sheets
└─ README.md
```

## 🚀 Probarlo ya (modo local, sin configurar nada)

1. Abre [index.html](index.html) en el navegador (o usa Live Server en VS Code).
2. Entra con un nombre y prueba a meter predicciones.
3. En la pestaña **🔒 Resultados (admin)** la clave por defecto es `mundial2026`.

> En modo local los datos se guardan **solo en tu navegador**. Para compartir entre varias
> personas necesitas Google Sheets (abajo).

## 🌐 Compartir con todos: Google Sheets como backend (~15 min)

1. Crea una **Google Sheet** nueva (vacía).
2. Menú **Extensiones → Apps Script**. Borra lo que haya y pega el contenido de
   [apps-script/Code.gs](apps-script/Code.gs).
3. En ese archivo, cambia `ADMIN_CODE` por tu clave secreta.
4. **Implementar → Nueva implementación → Aplicación web**:
   - Ejecutar como: **Yo**.
   - Quién tiene acceso: **Cualquier usuario**.
   - Copia la **URL** que termina en `/exec`.
5. En [js/config.js](js/config.js):
   ```js
   backend: "sheets",
   sheetsUrl: "https://script.google.com/.../exec",
   adminCode: "TU_CLAVE",   // la misma que ADMIN_CODE
   ```
6. La Sheet creará sola las pestañas `Predicciones` y `Estado`. Verás todas las
   predicciones en tiempo real en la pestaña `Predicciones`.

## ☁️ Publicar la web (gratis)

**Opción Netlify (arrastrar y soltar):**

1. Ve a app.netlify.com → _Add new site_ → _Deploy manually_.
2. Arrastra la carpeta `worldcup`. Listo, te da una URL pública.

**Opción GitHub Pages:**

1. Sube la carpeta a un repo de GitHub.
2. _Settings → Pages → Deploy from branch → main / root_.
3. Comparte la URL `https://usuario.github.io/repo/`.

## 🧑‍💼 Guía del organizador

1. **Antes del Mundial**: edita los equipos reales en `config.js` (grupos A–L) tras el sorteo.
   El calendario de 72 partidos se genera solo.
2. Comparte la URL. Todos meten predicciones de Fase 1.
3. Cuando arranque el torneo, en **admin** marca _🔒 Cerrar predicciones de Fase 1_.
4. Ve metiendo los **resultados de grupos** y, al acabar, la **clasificación final** de cada grupo.
5. Al llegar a eliminatorias: en admin, **añade los cruces** y marca _🔥 Activar modo eliminatoria_.
   Los participantes ya pueden predecir esa fase.
6. Tras la final: mete **goleadores**, **bracket** y los **resultados de eliminatorias**.
   La clasificación se recalcula automáticamente.

## 🔧 Personalización rápida

- **Cambiar puntos**: objeto `scoring` en `config.js`.
- **Más/menos goleadores**: `topScorerCount`.
- **Cambiar equipos**: objeto `groups` en `config.js`.
- **Cambiar clave admin**: `adminCode` (y `ADMIN_CODE` en `Code.gs`).

> Seguridad: la clave de admin se valida en el navegador en modo local y **también en el
> servidor** (Apps Script) en modo Sheets, así que en producción los resultados solo se pueden
> guardar con la clave correcta. Aun así, es una porra de oficina: no guardes datos sensibles.
