# Release Candidate 1.0 — Plan de limpieza y backlog único

**Fecha:** 2026-07-30 · **Rol:** Release Manager · **Objetivo:** v1.0 estable en 2 días.
**Fuentes:** `CLAUDE.md`, `START_HERE.md`, `CURRENT_STATE.md`, `MASTER_PLAN.md`, `REPOSITORY_CONTEXT.md`, `REPOSITORY_CLEANUP.md` + auditoría UI/UX del 2026-07-30.

---

## ESTADO DE EJECUCIÓN (actualizado 2026-07-30, tras el commit `b5f1dc3`)

| Bloque | Estado |
|---|---|
| **Fase 1 · Limpieza** | ✅ **Ejecutada parcialmente por decisión de Fabrizio: solo los 4 assets.** `src/assets/react.svg`, `vite.svg`, `hero.png` y `public/icons.svg` borrados (`src/assets/` queda vacía). **`asistenteIA.jsx` y `respuestaIA.jsx` se conservan** — el endpoint `/api/ia/asistente` sigue intacto. Ninguna de las 10 categorías no versionadas se tocó. |
| **Fase 2 · Backlog** | ✅ Vigente. Es la lista de trabajo de la fase. |
| **Fase 3 · P1** | ✅ **13/13 completados y verificados funcionalmente**, incluidos los dos que estaban bloqueados: **P1-B1 (modal de PIN) y P1-B2 (fuentes autoalojadas) fueron autorizados por Fabrizio** y están hechos. |
| **P2** | ✅ **Cerrado: 4 de 8 implementados y verificados** (P2-8, P2-2, P2-3 y P2-5 en variante segura). **P2-1, P2-4 y P2-7 reclasificados a Post v1.0** por decisión de Fabrizio tras reevaluar el backlog a dos días de la entrega. **P2-6 aprobado solo si sobra tiempo — no implementado.** Ver la tabla P2 de abajo y `CURRENT_STATE.md`. |

**Correcciones a este propio documento, encontradas al ejecutar:**

1. **La nota final sobre la línea base de lint era incorrecta.** Decía que la base operativa era **58** y que la diferencia con el 29 documentado se debía a una actualización del plugin de React Hooks. **Las dos afirmaciones son falsas.** El utillaje coincide con el lock (`eslint 10.4.1`, `eslint-plugin-react-hooks 7.1.1`, `eslint-plugin-react-refresh 0.5.2`). La causa real: `npm run lint` ejecuta `eslint .`, que **recorre `release/GamificApp/` —una copia completa del código fuente generada por el empaquetador— porque `.gitignore` no se aplica al flat config de ESLint**. Cada problema se contaba dos veces. **`npx eslint src server` = 29 (26 errores + 3 warnings)**, que es exactamente la línea base ya fijada en `CURRENT_STATE.md` el 2026-07-29 y repetida en `MASTER_PLAN §3`. La conclusión de P1 no cambia (cero problemas nuevos: el ×2 afectaba igual a las dos mediciones). Anotado como ítem **62** del MASTER_PLAN.
2. **P1-B2 costó menos de lo estimado:** se preveían 7 archivos y ~150 kB; salieron **4 archivos y 76 kB**, porque Inter es una fuente **variable** y un solo fichero cubre 400-700.
3. **Dos bugs aparecieron en la verificación funcional, no en la lectura de código** (detalle en `CURRENT_STATE.md`): uno **crítico y preexistente** —equivocarse al teclear el PIN cerraba la sesión del estudiante en silencio— y uno **introducido por P1**, el estado de error inalcanzable porque los servicios devolvían `[]` ante un fallo. Ambos corregidos y verificados. Se registraron los ítems **62** y **63** del MASTER_PLAN.

---

---

## FASE 1 — Plan de limpieza (requiere aprobación)

### Hallazgo que reduce la Fase 1 casi a cero

Verifiqué con `git ls-files` cada candidato de la lista "Eliminar" de `REPOSITORY_CLEANUP.md`. **10 de las 12 categorías no están en el repositorio**: `.gitignore` ya las cubre.

| Candidato | ¿Versionado? | Decisión |
|---|---|---|
| `.env`, `server/.env` | **No** (`.gitignore:14`) | **MANTENER en disco** |
| `CREDENCIALES.txt` | **No** (`.gitignore:24`) | **MANTENER en disco** |
| `logs/`, `.run/`, `.claude/` | **No** | **MANTENER en disco** |
| `node_modules/`, `server/node_modules/`, `dist/` | **No** | **MANTENER en disco** |
| `release/`, `runtime/` | **No** | **MANTENER en disco** |

**Por qué mantener y no borrar del disco.** La limpieza "archivística" que propone el documento ya está hecha por `.gitignore`; borrarlos físicamente no mejora el repositorio y sí destruye el entorno de trabajo justo antes del hito del instalador:

- `server/.env` apunta al MySQL portable en el puerto 3308. Borrarlo deja la app sin arrancar en local.
- `runtime/` son 1,25 GB de Node y MySQL portables. Es **exactamente lo que la etapa siguiente tiene que validar**.
- `release/` es el paquete generado que hay que probar.
- `CREDENCIALES.txt` contiene las credenciales locales de administrador.
- `node_modules/` se regenera, pero reinstalar consume tiempo del plazo de dos días sin ganancia.

**Riesgo asimétrico:** beneficio nulo para el repositorio, coste alto para la entrega. Como Release Manager la recomendación es **no ejecutar ninguna de estas eliminaciones antes de la entrega.**

### Clasificación de los 8 candidatos realmente versionados

**A · Seguro de eliminar** (referencias verificadas = 0)

| Archivo | Verificación |
|---|---|
| `src/pages/admin/asistenteIA.jsx` | Nadie lo importa. Inalcanzable desde `main.jsx`. Usa HTML crudo (`<h1>`, `<form>`, `<textarea>` sin clases del proyecto) ⇒ **no deja CSS huérfano**. |
| `src/pages/admin/respuestaIA.jsx` | Solo lo importa `asistenteIA.jsx`. Son 5 líneas: un `<textarea readOnly>`. |
| `src/assets/react.svg` | 0 referencias en `src/`, `index.html`, `public/`. |
| `src/assets/vite.svg` | 0 referencias. |
| `src/assets/hero.png` | 0 referencias. |
| `public/icons.svg` | 0 referencias (buscado también como cadena de URL). |

Nota: `.asistente-*` de `adminDashboard.css` **NO es CSS huérfano** — lo usan 6 módulos del admin (`ModuloMaterias`, `ModuloMisiones`, `ModuloCursos`, `ModuloInstitucion`, `ModuloAdministradores` y el asistente de docentes de `AdminDashboard.jsx`). El documento de limpieza no lo dice; conviene no confundirse. **No se toca.**

El endpoint `/api/ia/asistente` del backend **se deja intacto** (restricción de API pública).

**B · Requiere revisión — mi recomendación es NO eliminar antes de la entrega**

| Archivo | Verificación | Recomendación |
|---|---|---|
| `server/lib/iaCliente.js` | Shim de 13 líneas; re-exporta desde `./ia/index.js`. **0 importadores** (solo aparece en comentarios). | **Post v1.0.** Eliminarlo obliga a corregir `CLAUDE.md §3`, que hoy documenta este archivo como el camino de la IA (**documentación desactualizada**: el camino real es `server/lib/ia/`). Tocar las reglas permanentes a dos días de la entrega no lo vale. |
| `server/lib/totalEsperado.js` | Shim; re-exporta desde `./juegos/registro.js`. 0 importadores (`progreso.js` y `retos.js` importan del registro). | **Mantener.** El nombre figura en la lista de fórmulas congeladas de SPEC-018 §3 y `totalEsperado` es un control de seguridad de `POST /api/progreso`. Beneficio nulo, roza área congelada. |
| `src/App.css` | 0 bytes, importado por `App.jsx`. | **Post v1.0.** Eliminarlo exige editar el import. Trivial pero sin valor para la 1.0. |

**C · Mantener explícitamente**

- `tools/build_auditoria_docx.py` y `Auditoria-Panel-Docente-SPEC-004.docx` → **evidencia de tesis** (instrucción expresa: no eliminar documentación necesaria para la tesis).
- `docs/archive/` → historial; ya está clasificado como tal y no molesta.
- `docs/audit/*`, `docs/specifications/SPEC-001..019` → trazabilidad de decisiones.
- `scripts/verificar-registros-juegos.mjs` → verificación de consistencia de juegos.
- Todo `src/`, `server/`, `database/`, `instalador/`.

### Acción propuesta para la Fase 1

**Un solo commit, 6 archivos borrados, 0 líneas de código funcional afectadas:**

```
src/pages/admin/asistenteIA.jsx
src/pages/admin/respuestaIA.jsx
src/assets/react.svg
src/assets/vite.svg
src/assets/hero.png
public/icons.svg
```

Verificación posterior: `npm run build` + `npm run lint` + comprobar que `src/assets/` vacío no rompe nada. **Pendiente de tu aprobación — no lo he ejecutado.**

---

## FASE 2 — Backlog único (deduplicado)

Fusión de la auditoría UI/UX del 2026-07-30 con el backlog del `MASTER_PLAN §3`. Se conserva la numeración del MASTER_PLAN cuando el ítem ya existía, para no crear una tercera lista.

### Duplicados eliminados en la fusión

| Mi hallazgo | Ya existía como | Resolución |
|---|---|---|
| I3 estados vacíos | MASTER_PLAN **35** [P1] | Mismo ítem → **P1** |
| I9 `--color-text-muted` | MASTER_PLAN **36** [P1] | Mismo ítem → **P1** |
| C1 `window.prompt` del PIN | MASTER_PLAN **29 / 37** [P2] | Mismo ítem → **P1 pero BLOQUEADO** (ver abajo) |
| R1 saltos de encabezado | MASTER_PLAN **38** [P2] (parte cerrada) | Solo queda el `h3` de `SectionCard` → **P3** |
| O1 `pointerEvents` | MASTER_PLAN **48** [P3] | → **P3** |
| O4 code splitting | MASTER_PLAN: **"fuera del cierre de la tesis"** | **Descartado de la 1.0** |
| R5 hex sueltos | MASTER_PLAN **40** [P2] | → **P3** |
| R4 breakpoints | MASTER_PLAN **47** [P3] | → **P3** |

Decisiones previas que **respeto y no reabro**: ítem **33** (verde `--color-success` global — Fabrizio decidió dejarlo), ítem **60** (insignias de misiones bloqueadas — requiere decisión de diseño), ítem **30/58** (falsos positivos de `requestAnimationFrame`), ítem **52** (nada de Zod ni reestructurar JWT).

### P1 — Crítico (antes de la entrega)

| # | Tarea | Toca | Riesgo |
|---|---|---|---|
| **P1-1** | Estado de carga y de error en el Home del estudiante: hoy muestra *"Todavía no hay juegos"* mientras la petición viaja, y **para siempre si la red falla** (`.catch(() => {})`). Con Render en frío es lo primero que verá el jurado. | `DashboardEstudiante.jsx` | Bajo |
| **P1-2** | Contraste del podio del ranking: blanco sobre oro **2,14:1** y sobre plata **2,56:1** (AA exige 4,5). | `dashboard.css` (2 reglas) | Nulo |
| **P1-3** | Foco invisible en los inputs del generador IA (`border:none; outline:none;` sin sustituto) → falla WCAG 2.4.7. | `dashboard.css` (1 regla) | Nulo |
| **P1-4** | Quitar el `<link>` de **Material Icons**: request externo bloqueante con **0 usos** en `src/`. | `index.html` | Nulo |
| **P1-5** | Shell de carga inline en `#root`: hoy hay pantalla en blanco hasta que React monta. **No es code splitting** (eso queda descartado). | `index.html` | Nulo |
| **P1-6** | Región de toasts siempre presente: `ToastHost` devuelve `null` sin toasts, así que la live region nace con su contenido y el primer aviso puede no anunciarse. | `Toast.jsx` | Bajo |
| **P1-7** | `.toast-cerrar` mide ~18×18 px → incumple WCAG 2.2 SC 2.5.8 (24×24). | `dashboardWidgets.css` | Nulo |
| **P1-8** | `aria-pressed` en las tarjetas de perfil del login: el perfil elegido se comunica **solo por color**. Es el mismo arreglo que SPEC-018 ya aplicó a `.opcion`. | `login.jsx` | Nulo |
| **P1-9** | Mostrar/ocultar el PIN en el login (el docente ya puede ver su contraseña; el niño no puede ver su PIN). **Solo el atributo `type` + un botón; cero lógica de autenticación.** | `login.jsx` | Bajo |
| **P1-10** | Estados vacíos del estudiante a `EmptyState` (MASTER_PLAN 35). Las 4 pestañas de materia usan texto gris plano. | `DashboardEstudiante.jsx` | Bajo |
| **P1-11** | `--color-text-muted` #64748b sobre el fondo del panel = **4,39:1** → falla AA (MASTER_PLAN 36). | `index.css` (1 token) | Medio (global) |
| **P1-12** | Capitalización: "Mis Mundos"/"Mis Premios" en el sidebar vs "Mis mundos"/"Mis premios" en los encabezados, visibles a la vez. | `DashboardEstudiante.jsx` | Nulo |
| **P1-13** | Código muerto del login: el estado `aviso` nunca se puebla (`setAviso` solo recibe `""`), así que el bloque y su CSS son inalcanzables. | `login.jsx`, `login.css` | Nulo |

### 🔒 P1 bloqueados — requieren tu autorización expresa

| # | Tarea | Por qué está bloqueada |
|---|---|---|
| **P1-B1** | **Modal de cambio de PIN** que sustituya los dos `window.prompt` encadenados del estudiante. | Choca con dos cosas tuyas: (a) tu restricción *"no modificar autenticación salvo bug crítico"*, y (b) el `MASTER_PLAN` ítem **37**, que dice literalmente *"toca autenticación (§10, requiere spec)"* y lo remite a SPEC-001. Y me pediste no proponer SPEC nuevas. **Mi lectura técnica:** el cambio es de piel, no de comportamiento — mismo `authService.cambiarPin(actual, nuevo)`, mismo endpoint, mismos parámetros; es el principio que SPEC-018 §3 ya autorizó para áreas congeladas. **Pero es tu llamada, no la mía.** Es el hallazgo nº1 de la auditoría y el único diálogo nativo que queda en el camino del niño. |
| **P1-B2** | **Autoalojar Inter y Poppins.** Hoy vienen del CDN de Google: sin internet la tipografía cae a `system-ui` y la identidad visual cambia — en una app que se instala en Windows y cuya validación es el hito siguiente. | Requiere **descargar 7 archivos `.woff2`** de `fonts.gstatic.com` (~150 kB al instalador). No descargo archivos sin tu permiso. Alternativa sin descargas si prefieres: reforzar la cadena de `font-family` para que el degradado offline sea predecible (mitiga, no resuelve). |

### P2 — Reevaluado y cerrado (2026-07-30)

Backlog reevaluado a dos días de la entrega y aprobado por Fabrizio: **se implementan 4, se reclasifican 3 y 1 queda condicionado al tiempo restante.**

| # | Tarea | Estado |
|---|---|---|
| P2-8 | Estado de carga/error en el resto de vistas. | ✅ **Hecho.** Alcance real menor que el enunciado: la «materia del estudiante» **ya la cubrió P1**, así que solo quedaba el Home del docente. Tres estados explícitos, esqueletos con la geometría real (134 px a 1280 / 170 px a 720-) y «Intentar de nuevo» que recupera sin recargar. |
| P2-2 | `scroll-padding-block-end` → WCAG 2.2 SC 2.4.11. | ✅ **Hecho, y con una corrección al enunciado.** **`.sidebar-nav`/`.sidebar-footer` era premisa falsa** (hermanos, **0 px de solape** medidos) → no se tocó. El caso real de `.contenido` con la barra del editor sí se reprodujo: **4 → 0 controles tapados a 1280 y 3 → 0 a 375**. Valor 188 px acotado con `:has(.editor-publicar-barra)`. |
| P2-3 | `aria-expanded` en el disclosure "¿Olvidaste tu PIN?". | ✅ **Hecho.** Un atributo, cero lógica de autenticación (mismo principio que P1-8). `aria-controls` solo se emite con la región montada, para no dejar una referencia colgada. |
| P2-5 | La racha 🔥 solo se explica en un `title=""`. | ✅ **Hecho en la variante segura, la única autorizada:** `role="img"` + `aria-label` con singular/plural. **Cero texto visible nuevo**; el chip mide **47,78 px a 1280 y a 320**, idéntico, con 0 desbordes. |
| P2-6 | Bienvenida de primer uso para el docente. | 🟡 **Aprobado solo si sobra tiempo — NO implementado.** ~30-45 min, riesgo bajo (aditivo y condicional a `stats.actividades === 0`). |
| P2-1 | Pausar el temporizador de los toasts en hover/foco. | ⛔ **Post v1.0.** Lógica de temporizadores sobre infraestructura compartida por los 3 roles **ya modificada en P1**, para un beneficio que ningún usuario real nota: el niño no hace hover y ningún toast lleva información irrecuperable. |
| P2-4 | `<title>` por vista. | ⛔ **Post v1.0.** Beneficio nulo (una sola pestaña) y WCAG 2.4.2 ya se cumple con el título estático; obligaba a tocar los **tres** paneles porque la navegación es `useState`, pagando la deuda de SPEC-001 sin resolverla. |
| P2-7 | Densidad de filtros de la Biblioteca. | ⛔ **Post v1.0.** Es un rediseño, no un pulido: colapsable nuevo con su responsive, 2-3 h y riesgo de regresión en una vista que hoy funciona. Contra §6.1 y §6.3. |

### P3 — Opcional (solo si sobra tiempo)

Escalas de tipografía y espaciado (30+ tamaños, 14 gaps) · 19 breakpoints → 3 canónicos (MP 47) · 351 hex sueltos (MP 40) · CSS muerto de reproductores y panel del estudiante (MP 42, 43) · `h3` de `SectionCard` (MP 38) · `pointerEvents` en encabezados (MP 48) · 36 familias de clases de botón · metadatos (`theme-color`, `description`) · borrar shims `iaCliente.js` / `App.css`.

### Post v1.0 — no implementar

Pausa de toasts en hover/foco (P2-1) · `<title>` por vista (P2-4) · densidad de filtros de la Biblioteca (P2-7) · code splitting del bundle de 1,6 MB · Zod o cualquier validación nueva · reestructurar JWT · pruebas automatizadas · archivos base64 en MySQL · los 4 `window.confirm` de los editores (MP 28: exige refactor asíncrono en área estabilizada por SPEC-013) · fallback entre proveedores de IA (MP 24) · sistema formal de migraciones (MP 27) · extensiones del Banco de Preguntas (MP 18, 19).

---

## Nota de calidad: la línea base de lint

> ⚠️ **Esta sección se escribió con un diagnóstico equivocado y queda corregida.** Ver «ESTADO DE EJECUCIÓN → Correcciones» al principio del documento. Se conserva el texto original abajo porque explica de dónde salió el número 58 que aparece en el reporte de P1.

**Lo correcto:** la línea base es **29 problemas (26 errores + 3 warnings)** y se mide con **`npx eslint src server`**. El criterio de calidad de cada fase es *«cero problemas nuevos respecto a 29»*. El `58` sale de `npm run lint` (`eslint .`) **solo cuando existe la carpeta `release/` en el disco**, porque ESLint entra en la copia del código que dejó el empaquetador y cuenta todo dos veces. Es un artefacto del entorno, no del código.

*Texto original (incorrecto):* `npm run lint` sobre el árbol limpio (sin cambios míos) da hoy **58 problemas: 52 errores y 6 warnings**. `SPEC-018 §6` documenta 28 (25 + 3) y el `MASTER_PLAN` habla de 29 preexistentes. La diferencia no es código nuevo: el árbol estaba limpio al medir. Lo más probable es una actualización del plugin de React Hooks, que añadió reglas como `react-hooks/set-state-in-effect`. **Decisión de Release Manager:** la línea base operativa para esta fase es **58**.
