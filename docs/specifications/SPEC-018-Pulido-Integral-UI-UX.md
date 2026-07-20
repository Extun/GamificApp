# SPEC-018 — Pulido integral de UI/UX y accesibilidad

**Estado:** 🟡 **Aprobada — auditoría cerrada, sin implementación iniciada.** Documento base para la etapa de pulido. Ninguna fase comenzada.
**Fecha:** 2026-07-20
**Origen:** Etapa de pulido posterior al cierre de los requerimientos funcionales y a la validación del entorno local. Objetivo de defensa de tesis: que la aplicación se sienta como **un solo producto** —visualmente coherente, profesional, accesible e intuitivo— en los tres roles.
**Alcance:** **Solo presentación (UI/UX y accesibilidad).** Consolidar el design system existente, unificar componentes ya duplicados y corregir problemas de accesibilidad y responsive **confirmados navegando en vivo** el entorno local (Docker + MySQL `gamificapp_dev` + `seedDev.js`). **No** cambia comportamiento funcional de ninguna área estabilizada (ver §3).
**Insumos:** auditoría de código (respuesta inicial de esta etapa) + **auditoría runtime** (navegación real de los 3 roles, 2026-07-20). Entorno de verificación: `docs/DEV-ENTORNO-LOCAL.md`.

---

## 1. Objetivo

Dejar la experiencia visual de los tres roles (**Administrador, Docente, Estudiante**) completamente pulida y consistente:

- Un **design system** real y completo (tokens de color semánticos, z-index y breakpoints), no estilos acumulados por capas.
- **Accesibilidad** básica sólida (foco, teclado, ARIA, contraste, `prefers-reduced-motion`).
- **Responsive** fiable en móvil/tablet/escritorio (el público objetivo usa dispositivos compartidos pequeños).
- **Componentes compartidos** donde ya hay duplicación real (modales, confirmaciones, feedback, sidebar).
- Que los tres roles **compartan fundamentos y componentes**, conservando cada uno su identidad de UX.

**No** es un rediseño. Es **consolidación incremental**: la regla de la casa (MVP-first, cambios pequeños, no refactors grandes) sigue vigente.

## 2. Estado actual (auditado en runtime, 2026-07-20)

Verificado navegando en vivo los 3 roles con datos reales del seed (no solo leyendo JSX/CSS):

- **Tokens semánticos ausentes (confirmado en `:root`):** `--color-success/-danger/-warning/-info` = **no definidos**. El verde "correcto"/rojo "incorrecto" —lo más crítico para el estudiante— vive como **~355 hex hardcodeados** en 21 CSS, con verde/rojo redefinidos ~10 formas distintas.
- **A11y de modales (confirmado abriendo la Vista previa):** `ModalPanel` tiene `role=dialog` + `aria-modal` + `aria-label`, pero **el foco NO entra al abrir** (`focoDentroModal:false`), **Escape NO cierra** (`modalSigueAbierto:true`), sin focus-trap ni restauración de foco. Inconsistente con los overlays de resultado de los juegos, que **sí** cierran con Escape y restauran foco.
- **Navegación móvil (confirmado a 375px):** el sidebar se apila a pantalla completa; el contenido empieza en **y≈460px** → hay que scrollear por **toda** la navegación (12 ítems) antes de llegar al contenido en cada vista. No hay hamburguesa ni colapso. Sin overflow horizontal del body (bien) y las tablas scrollean dentro de su contenedor (bien).
- **Diálogos nativos:** **18+ `window.confirm`** para acciones destructivas (eliminar/archivar/papelera) y **`window.alert`** para errores (incluido el del estudiante). Chocan con `ModalPanel`, no son estilizables ni accesibles de forma consistente.
- **Sin escala de breakpoints:** 8 valores (480/520/560/640/720/760/900/1024).
- **Sin escala de z-index:** valores sueltos (0,1,2,20,50,55,60).
- **Contraste `text-muted` justo:** `#64748b` = **4.76:1** sobre blanco (pasa AA en texto normal, al límite; revisar en <0.875rem).
- **`prefers-reduced-motion` solo en 4 archivos** pese a animaciones en todos los juegos/hover.
- **Densidad:** barra de filtros de Biblioteca con 8 selects + búsqueda.
- **Dos CSS gigantes:** `dashboard.css` (2151 líneas, compartido docente+admin) y `adminDashboard.css` (1102).

**Estados buenos confirmados (no tocar salvo pulido):** registro SPEC-017 correctamente cableado en Biblioteca y Gestión de juegos; estado "Falta API_KEY" de IA bien comunicado; Mis Premios rico (tiers/progreso/bloqueos); **cero errores de consola** en los 3 paneles; existen reglas `:focus-visible`; `aria-label` en botones icon-only; tablas envueltas en `overflow-x`. **Ningún bug funcional** descubierto en la auditoría.

## 3. Áreas CONGELADAS — solo se cambia su piel, nunca su comportamiento

SPEC-018 puede reestilizar la presentación de estas áreas, pero **no** su lógica, contratos ni datos:

- **Lógica de los 7 juegos** (reglas, mecánicas, mezcla, corrección diferida).
- **XP y recompensas** (`POST /api/progreso`, idempotencia, `FOR UPDATE`, incremental).
- **Calificaciones** (`calificacion.js`, rangos, fórmulas Kendall/Memorama).
- **Progreso** del estudiante.
- **Permisos** (roles, `conPermiso`, `soloAdminPrincipal`).
- **Registro/extensibilidad SPEC-017** (`registro/index.js`, contrato de tipos, 3 estados).
- **Lógica funcional estabilizada de SPEC-013** (`BarraAccionesEditor`, menú "Agregar" por acciones, autoguardado, snapshots).
- **Proveedores de IA SPEC-016** (adaptadores, selección de proveedor/modelo, claves solo en el servidor).
- **Migraciones y estructura de BD.**

**Regla dura:** cero cambios en `server/`, migraciones, `configuracion_json`, `initDb.js`, ni en las fórmulas de `calificacion.js`/`totalEsperado.js`/`calificacionMemorama.js`/`ordenSecuencia.js`. Si un pulido visual pareciera exigir tocar backend o lógica, **se detiene y se consulta**.

## 4. Hallazgos priorizados (base oficial de las fases)

| Prioridad | Hallazgo | Fase |
|---|---|---|
| 🟠 **P1** | A11y de `ModalPanel`: foco inicial, focus-trap, Escape, restauración de foco | 3 |
| 🟠 **P1** | Tokens semánticos `success/danger/warning/info` | 1 → 2 |
| 🟠 **P1** | Navegación móvil: sidebar colapsable (contenido no debajo de toda la nav) | 5 |
| 🟠 **P1** | Sustituir progresivamente `window.confirm`/`window.alert` | 4 |
| 🟡 **P2** | Escala coherente de breakpoints | 1 → 6 |
| 🟡 **P2** | Escala coherente de z-index | 1 → 3 |
| 🟡 **P2** | Revisión de `text-muted` y contraste | 2/6 |
| 🟡 **P2** | Reducir densidad visual de filtros | 6 |
| 🟡 **P2** | `prefers-reduced-motion` global | 7 |
| 🔵 **P3** | Unificación de microcopy y pulido final | 6/7 |

**P0:** ninguno (la app es funcional, sin bloqueos).

## 5. Fases definitivas

### Fase 1 — Fundamentos del Design System
Crear/completar en `src/index.css` los tokens de **color semántico** (`--color-success/-success-soft/-success-dark`, `--color-danger/…`, `--color-warning/…`, `--color-info/…`), **z-index** (`--z-dropdown/-sticky/-modal/-overlay/-toast`) y **breakpoints** (documentados: p. ej. 480/768/1024). Los valores iniciales corresponden, en lo posible, a los **valores visuales actuales** (los hex verde/rojo ya en uso) para **evitar un rediseño accidental**.
**Meta: cero cambio visual perceptible.** Solo prepara infraestructura.

### Fase 2 — Consolidación visual
Migrar progresivamente los colores hardcodeados y estilos semánticos duplicados hacia los tokens. **Prioridad: estados success/danger/warning/info y los 7 juegos.** **No** hacer sustitución masiva ciega: migrar **por componente/archivo** y verificar visualmente cada grupo en el navegador local.

### Fase 3 — Sistema unificado de modales
Endurecer `ModalPanel` con: foco inicial correcto; focus-trap; cierre con Escape cuando corresponda; restauración del foco al elemento que abrió el modal; comportamiento consistente del backdrop; atributos ARIA apropiados.
**Antes de tocarlo, inventariar todos los consumidores reales de `ModalPanel`** (es transversal). Después probar realmente **cada categoría de modal** en navegador.

### Fase 4 — Feedback y confirmaciones
Diseñar componentes reutilizables `ConfirmDialog` (sobre `ModalPanel`) y sistema de `Toast`/feedback equivalente. Sustituir progresivamente los `window.confirm`/`window.alert`. **No** cambiar los 18+ casos a la vez: hacerlo **por grupos funcionales** y probar que cada operación siga ejecutando **exactamente la misma acción backend**.

### Fase 5 — Navegación responsive
Implementar un **sidebar móvil colapsable reutilizable** para los 3 roles (evita que el contenido quede debajo de toda la navegación). Conservar navegación por teclado y accesibilidad. Validar al menos **320 / 375 / 480 / 768 / 1024 / escritorio**.

### Fase 6 — Pulido por rol
Con el sistema ya creado, auditar y mejorar visualmente **1) Administrador, 2) Docente, 3) Estudiante**: tablas, formularios, filtros (densidad), estados vacíos/carga/error, jerarquía de botones, cards, responsive. **Un solo sistema visual compartido**; cada rol conserva su identidad de UX.

### Fase 7 — Juegos y experiencia educativa
Revisión **visual** de los 7 juegos **sin tocar reglas**: selección, estados activos, corrección diferida, feedback final, overlays, legibilidad, táctil, responsive, accesibilidad, `prefers-reduced-motion`. **Fórmulas de calificación y XP: fuera de alcance.**

### Fase 8 — Auditoría visual final
Navegar de nuevo los 3 roles completos con Docker/MySQL local; verificar regresiones funcionales y visuales; cerrar la spec.

## 6. Regla de implementación (obligatoria por fase)

**Ninguna fase se considera completada solo porque build y lint pasen.** Para cada fase:

1. **Build** (`npm run build`) sin errores.
2. **Lint** comparado contra baseline (**28 problemas: 25 errores + 3 warnings** al 2026-07-20; cero nuevos).
3. **Pruebas funcionales afectadas** (contra la BD local).
4. **Navegación real** en navegador (entorno local).
5. **Pruebas responsive** cuando corresponda (320–1024 + escritorio).
6. **Comprobación de consola** (cero errores nuevos).
7. **Reporte de regresiones** encontradas.

Se usa **exclusivamente** la BD local `gamificapp_dev` (127.0.0.1:3307). **No** conectar ni modificar producción/Aiven.

## 7. Punto de parada antes de commit (por fase)

Primero implementar y probar; **luego** entregar y **esperar autorización** antes de `commit`/`push` de cada fase o grupo de fases autorizado. El entregable de cada fase incluye:

- Archivos modificados.
- Antes/después conceptual.
- Pruebas realizadas.
- Problemas encontrados.
- Regresiones.
- Cambios de comportamiento (si existen — deberían ser cero).
- Resultado de build/lint.
- Evidencia de navegación real.

## 8. Archivos previstos por fase (estimado, sujeto a inventario en cada fase)

| Fase | Archivos probables |
|---|---|
| 1 | `src/index.css` (tokens). Sin tocar consumidores todavía. |
| 2 | Por grupos: `components/juegos/*.css` (7 juegos: `quizInteractivo.css`, `juegos.css`, `misionNarrativa.css`, `juegoDragAndDrop.css`, `resultadoActividad.css`, `verdaderoFalso.css`), luego `dashboard.css`, `adminDashboard.css`, `docentePanel.css`, módulos. |
| 3 | `components/dashboard/DashboardWidgets.jsx` (`ModalPanel`) + su CSS en `dashboard.css` (`.preview-*`). Verificar todos los consumidores (§9). |
| 4 | Nuevos `ConfirmDialog`/`Toast` (+ CSS); consumidores por grupos: `ModuloMaterias/Cursos/Administradores/Papelera`, `BibliotecaActividades`, `AdminDashboard`, editores, `DashboardEstudiante`. |
| 5 | `components/dashboard/SidebarLayout.jsx` + sidebar en `dashboard.css`; verificar los 3 dashboards. |
| 6 | CSS/JSX por rol (tablas `TablaPro`, formularios, filtros de `BibliotecaActividades`, cards). |
| 7 | CSS de los 7 juegos (solo piel) + `prefers-reduced-motion` global. |
| 8 | Ninguno (auditoría). |

## 9. Componentes transversales de mayor riesgo

- **`ModalPanel`** (`DashboardWidgets.jsx`) — Fase 3. Lo consumen: `PreviewJuegoModal`, `ModalConfigActividad`, `AgregarEstudiante`, `EditarEstudiante`, `ImportarEstudiantes`, modales de `ModuloMaterias/Cursos/Administradores/Misiones`, `SelectorBanco`, etc. Cambio en un punto afecta a todos → inventario obligatorio + prueba por categoría.
- **`SidebarLayout`** (`SidebarLayout.jsx`) + `dashboard.css` compartido docente/admin — Fase 5. Toca los 3 roles a la vez.
- **`src/index.css`** — Fase 1/2. Base de todo; un token mal definido se propaga.
- **`dashboard.css` (2151 líneas)** — sirve a docente **y** admin: cualquier regla no acotada regresiona dos roles.
- **`DashboardWidgets.jsx`** (`TablaPro`, `EmptyState`, cards) — Fase 6; compartido por los 3 roles.

## 10. Orden recomendado de implementación

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8, en ese orden. Justificación:
- **1** es aditiva y de riesgo mínimo (cero cambio visual) y **habilita** el resto.
- **2** consume 1 sin nueva infraestructura.
- **3** antes de **4** porque `ConfirmDialog` se construye sobre el `ModalPanel` ya endurecido.
- **5** independiente pero de riesgo medio (3 roles); va después de estabilizar modales.
- **6/7** son el pulido que aprovecha 1–5.
- **8** cierra.

Cada fase es un **commit lógico** (o grupo de fases que Fabrizio autorice), nunca varias fases grandes en un commit.

## 11. Qué se prueba automáticamente vs en navegador

**Automático (scripts/CLI, sin navegador):**
- `npm run build` y `npx eslint src` (comparado con baseline 28).
- Pruebas funcionales de no-regresión contra la BD local vía API (login 3 roles, permisos, `POST /api/progreso` idempotente/incremental, Libro, Gestión de juegos) — el arnés ya usado en la validación del entorno.
- Verificación de que las acciones destructivas (Fase 4) siguen ejecutando la misma llamada backend (inspección de red / respuesta).

**En navegador (entorno local, obligatorio por fase afectada):**
- Migración de color por grupo (Fase 2): revisar cada juego/panel en vivo.
- Modales (Fase 3): foco inicial, Escape, focus-trap, restauración — medido con `document.activeElement` y pruebas de teclado.
- Confirmaciones/Toast (Fase 4): que aparezcan, se cierren y disparen la acción.
- Responsive (Fase 5/6): 320/375/480/768/1024 + escritorio, con `resize_window` + detección de overflow.
- Consola (todas): cero errores nuevos.
- **Limitación conocida del preview:** el screenshot del panel puede agotar tiempo y el contador de nota se congela en pestaña oculta (rAF); la verificación visual se hace con `read_page`/`get_page_text`/`javascript_tool` (árbol de accesibilidad, estilos computados, clases de estado), no con capturas.

## 12. Límites de validación (heredados del entorno local)

Local valida UI/UX, flujos, permisos por-request y XP/calificación de **una** instancia. **No** valida (queda para producción): concurrencia real `FOR UPDATE`, IA con proveedores reales, Aiven/Render. SPEC-018 es solo presentación, así que su validación local es representativa; aun así, **no** se reporta "validado en producción" lo que solo se probó en local.

---

## Registro de cambios

- **2026-07-20** — Redacción inicial. Consolida la auditoría de código + la auditoría runtime (navegación real de los 3 roles con Docker/MySQL local). Aprobada como base oficial. Sin implementación iniciada.
