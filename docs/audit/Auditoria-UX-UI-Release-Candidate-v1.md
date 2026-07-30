# Auditoría UI/UX de acabado profesional — camino a la v1.0

**Fecha:** 2026-07-30
**Alcance:** exclusivamente experiencia de usuario y acabado visual. **Cero** arquitectura, backend, BD, `configuracion_json`, fórmulas de calificación/XP o refactors estructurales.
**Punto de partida:** SPEC-018 (pulido integral) cerrada el 2026-07-29 con sus 8 fases. Esta auditoría **no la repite**: parte de su resultado y busca lo que quedó fuera, lo que se implementó a medias y la deuda nueva.
**Etapa siguiente prevista:** página pública `/descargar` → validación final del instalador Windows → publicación 1.0.

---

## 0. Método y límite honesto de esta auditoría

Lo que se hizo:

- Lectura de los **64 componentes JSX** y **23 hojas CSS** de `src/`, más `index.html`.
- **Medición**, no impresión: ratios de contraste calculados sobre los tokens reales de `src/index.css`; tamaños de control leídos de las reglas CSS; conteos por `grep` (hex sueltos, breakpoints, tamaños de fuente, clases de botón, diálogos nativos).
- `npm run build`: **limpio**, 3.58 s. Bundle principal 1.603 MB (453 kB gzip) + chunk `xlsx` 425 kB ya separado. CSS total 154 kB (24 kB gzip).

Lo que **no** se hizo y hay que hacer al implementar: no se navegó la app en vivo en esta sesión. Los hallazgos son de código con valores medidos, no de sensación. Cuatro puntos concretos exigen confirmación en el entorno local (Docker 3307 o portable 3308) durante la fase de implementación, y están marcados **[verificar en runtime]**:

- comportamiento real a 320 px en la vista de materia del estudiante,
- tiempo real del "flash de estado vacío" con arranque en frío de Render,
- percepción de las microinteracciones ya existentes,
- foco tapado por barras sticky al tabular.

Criterio aplicado a cada propuesta —y motivo por el que este informe es corto: **"¿esto mejora la experiencia o es mi preferencia?"**. Todo lo que no pasó el filtro se descartó. No se propone dark mode, ni rediseño de la paleta, ni cambio de tipografías, ni librerías nuevas, ni reorganización de navegación: nada de eso está roto.

---

## 1. Veredicto ejecutivo

GamificApp **no está todavía en Release Candidate**, pero está cerca y por razones acotadas, no estructurales.

**Estimación: ~85 % del acabado profesional de una 1.0.** El 15 % restante son **4 hallazgos críticos y 10 importantes**, todos de presentación y todos resolubles sin tocar lógica.

Lo relevante del diagnóstico: **la base de diseño y accesibilidad ya es buena** (§2). Lo que falta no es sistema, es **cobertura del sistema que ya existe**. Los tokens semánticos están definidos y el CSS mayoritariamente no los usa; el `ModalPanel` accesible existe y el flujo de cambio de PIN del niño sigue en `window.prompt`; `EmptyState` existe y el rol estudiante recibe texto plano. SPEC-018 construyó las piezas correctas y las aplicó de forma parcial.

Traducción a la defensa de tesis: hoy un jurado que **navegue** la app la percibe madura, y un jurado que **la abra con la red lenta, cambie un PIN o mire el podio del ranking** encuentra tres costuras visibles. Ese es exactamente el 15 %.

| Prioridad | Nº | Esfuerzo total estimado | Efecto en la percepción |
|---|---|---|---|
| 🔴 Crítico | 4 | ~1–1,5 días | Quita las costuras visibles. **Sin esto no hay RC.** |
| 🟠 Importante | 10 | ~1,5–2 días | Cierra accesibilidad AA y coherencia entre roles. **Con esto sí hay RC.** |
| 🟡 Recomendado | 13 | ~2–3 días | Consolida el design system; acabado 1.0 pleno. |
| 🟢 Opcional | 4 | ~0,5 día | Detalle fino, post-1.0. |

---

## 2. Lo que YA está a nivel profesional — no tocar

Se enumera con intención: evita el "cambiar por cambiar" y es material defendible en la sustentación.

| Pieza | Por qué está bien |
|---|---|
| `SidebarLayout.jsx` | Un solo layout para los 3 roles, con hamburguesa en ≤760 px, colapso en escritorio **con raíl de restauración** (la navegación nunca se pierde), relevo de foco al colapsar, Escape, cierre al elegir sección, bloqueo de scroll de fondo, `aria-current="page"`, `aria-expanded`/`aria-controls`. Está por encima del estándar habitual. |
| `ModalPanel` (`DashboardWidgets.jsx:106`) | Foco inicial, focus-trap Tab/Shift+Tab, Escape delegado al mismo `onCerrar` (hereda las guardas de cada consumidor), restauración de foco con comprobación de `isConnected`, contador de modales anidados para el scroll-lock, `aria-labelledby`/`describedby` con `useId`. Correcto. |
| `ConfirmDialog.jsx` | `useRef` anti-doble-confirmación, imposible cerrar mientras procesa por ninguna vía, variantes danger/warning/neutral. |
| `JuegoDragAndDrop.jsx` | **Tres caminos** para la misma mecánica: arrastrar, tocar-y-tocar, y teclado (`role="button"` + Enter/Espacio en las canastas). Esto **cumple WCAG 2.2 SC 2.5.7 (Dragging Movements)**, criterio que la mayoría de productos comerciales falla. Mencionarlo en la defensa. |
| `prefers-reduced-motion` global (`index.css:106`) | Red de seguridad para los 10 archivos con animación, **con excepción deliberada y razonada** para los spinners (congelarlos borraría información). Es la decisión correcta, no la fácil. |
| Login | El rol lo decide el servidor, nunca el formulario. Vía de emergencia real. Ayuda del PIN con ejemplo concreto ("naciste el 15 de marzo de 2017 → 150317"), que es UX writing bien calibrado a la edad. |
| `TablaPro` | Búsqueda + paginación, `aria-label` en controles, envoltura `overflow-x`, umbral inteligente para no mostrar buscador con 3 filas. |
| `Toast.jsx` | `role="alert"` para errores y `role="status"` para el resto —distinción correcta—, anti-duplicado por tipo+mensaje, duraciones diferenciadas. |
| Regla anti-dato-ficticio | `EmptyState` en 22 archivos en lugar de números inventados. Es una decisión de producto que se ve y se defiende. |
| Filosofía "siempre se termina ganando" | El error hace rebotar la ficha y el juego continúa. Coherente con gamificación educativa para 6–9 años (el fallo no expulsa). |

Pantallas que se revisaron y **no necesitan cambios**: `ConfirmDialog`, el raíl del sidebar, `TablaPro`, la ayuda del PIN del login, el overlay de resultado de actividad, la mecánica de las canastas del Clasificador.

---

## 3. 🔴 Crítico — bloquea el RC

### C1 · El niño cambia su PIN con dos `window.prompt` encadenados

**Evidencia:** `src/pages/estudiante/DashboardEstudiante.jsx:211-222`

```js
const pinActual = window.prompt('Escribe tu PIN actual (6 letras o números):');
if (!pinActual) return;
const pinNuevo = window.prompt('Escribe tu PIN nuevo (6 letras o números):');
```

**Por qué es un problema.** Es el **único diálogo nativo que queda en el camino del estudiante** después de que SPEC-018 Fase 4 sustituyera 18 `window.confirm`/`alert` por `ConfirmDialog` y `Toast`. Rompe la consistencia del propio sistema (Nielsen #4), no tiene validación previa (Nielsen #5, WCAG 3.3.2: sin etiqueta persistente ni instrucciones visibles), no hay campo de confirmación del PIN nuevo, no hay mostrar/ocultar, el texto no se puede estilizar ni traducir al lenguaje de un niño de 6 años, y el diálogo nativo no hereda foco, tema ni `prefers-reduced-motion`. Los cuadros nativos también están sujetos a bloqueo por el navegador.

**Impacto.** Alto y desproporcionado a su tamaño: es una de las tres acciones del pie del sidebar del estudiante, o sea de las primeras que un jurado va a pulsar. Un solo cuadro gris del navegador contradice todo el trabajo visual del resto de la app. Además, si el niño se equivoca al teclear el PIN nuevo, lo ha cambiado a algo que no sabe.

**Cómo solucionarlo.** Un modal sobre `ModalPanel` (ya existe y ya es accesible) con tres campos —actual, nuevo, repetir nuevo—, botón mostrar/ocultar, validación en vivo de los 6 caracteres alfanuméricos, y `toast.exito()` al terminar. La llamada a `authService.cambiarPin()` no cambia: mismo endpoint, mismos parámetros.

**Esfuerzo:** bajo–medio (un componente nuevo, cero backend). **Beneficio:** alto.

---

### C2 · No existe el estado "cargando": la app afirma que no hay nada cuando aún no lo sabe

**Evidencia:** patrón sistémico en los 3 roles.
`DashboardEstudiante.jsx:58-64`, `:91-97`, `:129-154`; `src/pages/admin/dashboard.jsx:303`

```js
const [catalogoMaterias, setCatalogoMaterias] = useState([]);
listarMaterias().then(...).catch(() => { /* sin red: el resto sigue funcionando */ });
```

**Por qué es un problema.** Dos defectos en el mismo patrón:

1. **Falso estado vacío.** No hay bandera `cargando`. Mientras la petición viaja, `materias`, `quizzes`, `juegos` y `misionesRetos` son `[]`, así que el estudiante ve la rejilla "Mis mundos" **vacía** y el `EmptyState` **"Todavía no hay juegos — tu docente está preparando aventuras"**. La app afirma un hecho falso. Viola Nielsen #1 (visibilidad del estado del sistema) en su forma más dañina: no es que falte información, es que se muestra información incorrecta.
2. **Fallo de red silencioso.** El `.catch(() => {})` convierte un error en el mismo estado vacío, y **permanente**. El usuario nunca sabe que falló nada ni tiene forma de reintentar. Viola Nielsen #9 (reconocer, diagnosticar y recuperarse de errores).

**Impacto.** El más alto del informe, y **peor en producción que en local**: el backend está en Render, cuyo plan gratuito duerme el servicio. El primer acceso tras la inactividad tarda segundos. Ese es exactamente el escenario "el jurado abre la app por primera vez", y lo que verá es *"Todavía no hay juegos"* sobre una pantalla vacía. Después cargará bien, pero la primera impresión ya se gastó.

**Cómo solucionarlo.** Sin refactor: sustituir cada `useState([])` de las listas principales por un estado de tres valores (`'cargando' | 'listo' | 'error'`) y ramificar el render en tres:

- **cargando** → esqueletos que reutilizan la geometría de las tarjetas que ya existen (`.home-mundo`, `.card`, `.quiz-disponible-item`): mismo tamaño, fondo neutro, sin texto. Coste visual cero, ganancia de rendimiento percibido alta (el usuario ve la estructura antes que los datos).
- **listo y vacío** → el `EmptyState` actual, que ahora sí dice la verdad.
- **error** → mensaje con acción "Reintentar" (para el estudiante, en su lenguaje: *"No pudimos cargar tus mundos. ¿Probamos otra vez?"*).

Empezar por el Home del estudiante y el Home del docente, que son las dos primeras pantallas que ve cualquiera.

**Esfuerzo:** medio (mecánico y repetitivo, pero acotado por archivo). **Beneficio:** muy alto. **[verificar en runtime]** medir el tiempo real del flash con Render en frío.

---

### C3 · Contraste del podio del ranking: 2,14:1 y 2,56:1

**Evidencia:** `src/pages/admin/dashboard.css:495-511`

```css
.rank-pos { color: #fff; background: var(--color-text-muted); font-size: 0.8rem; font-weight: 700; }
.rank-pos-1 { background: #f59e0b; }   /* blanco sobre ámbar  → 2.14:1 */
.rank-pos-2 { background: #94a3b8; }   /* blanco sobre gris   → 2.56:1 */
.rank-pos-3 { background: #b45309; }   /* blanco sobre marrón → 5.02:1 ✓ */
```

**Por qué es un problema.** Texto blanco de 12,8 px y peso 700 sobre ámbar `#f59e0b` da **2,14:1**; sobre `#94a3b8` da **2,56:1**. WCAG 1.4.3 (AA) exige **4,5:1** para texto normal. Son fallos severos, no marginales: el número del 1.º y del 2.º puesto es, literalmente, poco legible. La ironía es que el 3.º sí cumple (5,02:1), lo que confirma que fue un descuido y no una decisión.

**Impacto.** Alto por ubicación. El ranking es la pieza de gamificación que un jurado va a mirar sí o sí, y el oro y la plata son los dos elementos que más se miran dentro de ella. Es también el hallazgo más fácil de que alguien note sin ser especialista: "no se lee bien el número 1".

**Cómo solucionarlo.** Dos opciones, ambas triviales:
- texto oscuro (`--color-text`) sobre oro y plata, que es además la convención de las medallas reales; o
- oscurecer los fondos a `--color-accent-dark` (`#d97706`, blanco = 3,4:1 — aún insuficiente) → mejor la primera opción.

Recomendación: **texto `#0f172a` sobre `#f59e0b` (8,9:1) y sobre `#94a3b8` (7,6:1)**, y añadir un borde de 1 px para que el círculo siga leyéndose como medalla.

**Esfuerzo:** bajo (dos declaraciones). **Beneficio:** alto.

---

### C4 · La tipografía depende de internet en una app que se instala en Windows

**Evidencia:** `index.html:7-16`

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter…&family=Poppins…" />
<link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons" />
```

**Por qué es un problema.** Dos cosas distintas:

1. **Inter y Poppins se cargan desde el CDN de Google.** La etapa siguiente del proyecto es el **instalador Windows** para una escuela pública de Guayaquil. Sin internet —o con la red de la institución lenta o caída— la app cae a `system-ui`: Poppins desaparece de todos los `h1/h2/h3` (`index.css:85`), las métricas cambian, los saltos de línea se recolocan y la identidad visual de la app **es otra**. Y es un fallo intermitente, o sea imposible de anticipar en la demo.
2. **La hoja de `Material+Icons` no se usa en absoluto.** Verificado: **cero** referencias a la clase `material-icons` o al componente `<Icon>` en todo `src/`. La app usa `@mui/icons-material`, que son componentes SVG empaquetados en el bundle. Es un request externo **bloqueante del render** a cambio de nada.

**Impacto.** Alto y directamente ligado al hito siguiente (`/descargar` + instalador). También afecta al rendimiento percibido: dos conexiones externas antes de pintar.

**Cómo solucionarlo.** Autoalojar las fuentes: descargar los `.woff2` de Inter (400/500/600/700) y Poppins (500/600/700) subset `latin`, ponerlos en `public/fonts/`, declarar `@font-face` con `font-display: swap` en `index.css`, y **borrar los tres `<link>` de Google** más el `preconnect`. Peso añadido al instalador: ~120–160 kB, offline garantizado, y un request bloqueante menos.

**Esfuerzo:** bajo. **Beneficio:** alto — y es requisito de facto para que el instalador se comporte igual en cualquier aula.

---

## 4. 🟠 Importante — necesario para declarar RC

| # | Hallazgo | Evidencia | Por qué / impacto | Solución | Esf. | Benef. |
|---|---|---|---|---|---|---|
| **I1** | **PIN sin mostrar/ocultar** mientras la contraseña del docente sí lo tiene | `login.jsx:146-151` vs `:236-243` | Un niño de 6–9 años teclea 6 caracteres enmascarados sin poder verificarlos. El fallo más probable de ese rol es "lo escribí mal" y la interfaz no le deja comprobarlo. Además es una **incoherencia dentro de la misma pantalla**: el adulto puede ver su contraseña y el niño no. | Reutilizar el mismo botón `.login-eye` que ya existe 90 líneas más abajo. | Bajo | Alto |
| **I2** | **Foco invisible** en los inputs del generador IA | `dashboard.css:2268` — `border:none; outline:none;` **sin sustituto** | Falla **WCAG 2.4.7 (Focus Visible, AA)**. El docente que edita con teclado las opciones generadas por IA no ve dónde está. Es la única excepción del proyecto: los otros 9 `outline:none` sí tienen `box-shadow` de reemplazo. | Añadir el mismo `box-shadow: 0 0 0 3px var(--color-primary-soft)` + `border-color` que usa el resto. | Bajo | Alto |
| **I3** | **Estados vacíos de dos calidades distintas** | `<EmptyState>` en 22 archivos vs `<p class="vacio-msg">` en 9 — **5 de ellos en el estudiante** (`DashboardEstudiante.jsx:423,454,507,538,576`) | El docente y el admin reciben tarjeta con icono, título, mensaje y acción; el estudiante recibe una línea de texto gris. El rol que **más** necesita guía es el que **menos** recibe. Inconsistencia entre módulos visible en cuanto se comparan dos pantallas. | Migrar los 5 del estudiante a `EmptyState` con icono y lenguaje infantil. Los 6 de los juegos (`"configuración no válida"`) son errores técnicos, no estados vacíos: dejarlos. | Bajo | Alto |
| **I4** | **La región de toasts no existe hasta que hay un toast** | `Toast.jsx:46` — `if (toasts.length === 0) return null;` | Una región live debe estar en el DOM **antes** de que llegue el contenido; si se inserta al mismo tiempo, muchos lectores de pantalla no anuncian el primer mensaje. Es el defecto clásico de live regions, y aquí anula silenciosamente el buen trabajo de `role="alert"`/`status`. | Renderizar siempre el contenedor `.toast-host` con `aria-live="polite"` y `aria-atomic`, y quitar el `return null` (con `pointer-events:none` cuando esté vacío). | Bajo | Medio-alto |
| **I5** | **Los toasts se van solos y no se pueden retener** | `Toast.jsx:11` — 4,5 s éxito / 8 s error | Un docente que está escribiendo cuando aparece un error de 8 s lo pierde. Relacionado con **SC 2.2.1 (Timing Adjustable)** y contrario a la guía de snackbar de **Material Design 3**, que exige persistir mientras hay hover o foco. | Pausar el temporizador en `mouseenter`/`focusin` y reanudarlo al salir. ~10 líneas. | Bajo | Medio |
| **I6** | **Perfil del login sin estado accesible** | `login.jsx:112-130` — la tarjeta activa se marca solo con la clase `active` | Estudiante/Docente seleccionado se comunica **solo por color**: invisible para lector de pantalla y frágil para daltonismo. SPEC-018 arregló exactamente esto en las pestañas `.opcion` del estudiante añadiendo `aria-pressed`; el login quedó fuera. Es incoherencia con el estándar propio de la casa. | `aria-pressed={modo === 'estudiante'}` en cada tarjeta (o `role="radiogroup"`/`radio`). | Bajo | Medio-alto |
| **I7** | **Objetivo táctil por debajo del mínimo** | `dashboardWidgets.css:531-537` — `.toast-cerrar` con `padding: 2px 4px` y `font-size: .9rem` ⇒ ≈18×18 px | Incumple **WCAG 2.2 SC 2.5.8 (Target Size Minimum, 24×24 px)**. En tablet compartida de escuela, cerrar un aviso se convierte en varios intentos. (El resto está bien: `.preview-close` 38×38, paginación 32×32.) | `min-width/min-height: 24px` + centrado flex. | Bajo | Medio |
| **I8** | **Pantalla en blanco durante la carga inicial** | `index.html:19` — `<div id="root"></div>` vacío; bundle 1,6 MB (453 kB gzip) | Entre la descarga del HTML y el primer render de React no hay **nada**: blanco. En una tablet escolar modesta con el CSS y el JS por descargar, son segundos de pantalla muerta antes incluso de llegar al login. Rendimiento percibido, que es el que cuenta. | Un *shell* inline dentro de `#root` en `index.html`: logo + nombre + spinner con CSS embebido (sin dependencias). React lo reemplaza al montar. ~25 líneas, riesgo cero. | Bajo | Alto |
| **I9** | **`--color-text-muted` falla AA sobre el fondo del panel** | `index.css:16` `#64748b` sobre `index.css:11` `#f1f5f9` = **4,39:1** (AA exige 4,5:1). `.contenido` no declara fondo → hereda el del `body` (`dashboard.css:318`) | Afecta a `.contenido-sub` (`dashboard.css:331`) y `.dash-header-sub` (`dashboardWidgets.css:14`): **el subtítulo que va debajo de cada `h1` de los tres paneles**. Es un fallo marginal (–0,11) pero ubicuo, y SPEC-018 ya lo había anotado como pendiente ("contraste justo, revisar"). | Oscurecer el token a ≈`#55637a` (5,0:1 sobre `#f1f5f9`, 5,4:1 sobre blanco). Un solo cambio de token, sin efecto sobre el texto principal. | Bajo | Medio-alto |
| **I10** | **Capitalización inconsistente en la navegación del estudiante** | Sidebar `"Mis Mundos"` / `"Mis Premios"` (`DashboardEstudiante.jsx:229-230`) vs encabezados `"Mis mundos"` / `"Mis premios"` (`:299, :337, :326`) | La misma etiqueta escrita de dos formas, visibles **a la vez** en pantalla. Es el tipo de detalle que un jurado no sabe nombrar pero sí registra como "descuidado". El español correcto es minúscula. | Unificar a *sentence case* en las 6 apariciones. | Muy bajo | Medio |

---

## 5. 🟡 Recomendado — acabado pleno de 1.0

| # | Hallazgo | Evidencia / medida | Solución y esfuerzo |
|---|---|---|---|
| R1 | **Saltos en la jerarquía de encabezados**: `h1 → h3` y `h1 → h4` | `AdminDashboard.jsx` (1×h1, 1×h3, sin h2); `PanelMisiones.jsx` (h1 → h4 vía `EmptyState`); vista de materia del estudiante (h1 del hero → h3 de las tarjetas) | Incumple la regla `heading-order` (WCAG 1.3.1): un lector de pantalla que navega por encabezados percibe secciones anidadas donde no lo están. Añadir el `h2` que falta o bajar de nivel. **Bajo.** |
| R2 | **No hay escala tipográfica**: 30+ tamaños distintos | `0.72 / 0.75 / 0.76 / 0.78 / 0.8 / 0.82 / 0.84 / 0.85 / 0.86 / 0.88 / 0.9 / 0.92 / 0.95 / 0.98 / 1 / 1.02 / 1.05 …` — solo los cuatro valores `0.82/0.85/0.88/0.9` suman **143 declaraciones** y son indistinguibles entre sí | Los tokens de color, radio y sombra existen; los de **tipo y espacio no**. Crear `--fs-xs…--fs-3xl` (6–7 pasos) y migrar **por archivo**, con verificación visual, igual que SPEC-018 Fase 2 hizo con los colores. **Medio.** |
| R3 | **No hay escala de espaciado**: 14 valores de `gap` | `0.15 / 0.25 / 0.3 / 0.35 / 0.4 / 0.45 / 0.5 / 0.55 / 0.6 / 0.7 / 0.75 / 0.85 / 0.9 / 1 rem` | Igual que R2: `--space-1…--space-8` sobre base 4 px. Es la causa raíz de las desalineaciones de 1–3 px entre módulos. **Medio.** |
| R4 | **19 breakpoints distintos** pese a que la escala canónica ya está documentada | `640(9) 480(9) 1100(5) 900(3) 720(3) 560(3) 520(3) 760(2) 620(2) 420(2) 380 460 440 430 360 359 340 1024 48` vs `--bp-mobile/tablet/desktop` (`index.css:68-70`) | Fase 1 documentó 480/768/1024 y Fase 6 no migró. Consecuencia real: comportamientos responsive que cambian en momentos distintos según el módulo. Consolidar por archivo hacia los 3 canónicos. **Medio.** |
| R5 | **351 hex hardcodeados en 21 CSS** | `grep` sobre `src/**/*.css` | Los tokens semánticos `--color-success/danger/warning/info` existen desde Fase 1 y el CSS sigue mayoritariamente sin usarlos: Fase 2 quedó a medias. Continuar la migración por archivo. **Medio.** |
| R6 | **Densidad de filtros en Biblioteca**: 6 `<select>` + búsqueda en una barra | `BibliotecaActividades.jsx:228-267` (tipo, materia, origen, curso, dificultad, orden) | SPEC-018 §2 lo detectó y Fase 6 no lo redujo. Ley de Hick: 7 controles simultáneos para una tarea que el 90 % de las veces es "busca por nombre". Dejar visibles búsqueda + tipo, mover el resto a un popover "Más filtros" con contador de filtros activos. **Medio.** |
| R7 | **Foco tapado por barras sticky** | `.sidebar-footer` sticky sobre `.sidebar-nav` con scroll (`dashboard.css:159`); `.editor-publicar-barra` sticky bottom (`editorQuiz.css:338`); **cero** `scroll-padding` en todo el proyecto | **WCAG 2.2 SC 2.4.11 (Focus Not Obscured)**: al tabular por los 12 ítems del sidebar del admin o por un editor largo, el elemento enfocado puede quedar debajo de la barra fija. `scroll-padding-block-end` en los dos contenedores con scroll. **Bajo.** **[verificar en runtime]** |
| R8 | **`title=""` como único portador de información** (50 usos) | p. ej. la racha del Home del estudiante: `<span title="Días seguidos jugando">🔥 {racha}</span>` (`DashboardEstudiante.jsx:264`) | El tooltip nativo no aparece con teclado, no aparece en táctil —y **un niño de 7 años no hace hover**. El significado de 🔥 queda sin explicar para el usuario principal. Texto visible corto ("🔥 3 días") o `aria-label` + leyenda. **Bajo.** |
| R9 | **36 familias de clases de botón para 4 roles semánticos** | `editor-btn`, `editor-btn-ghost`, `editor-btn-peligro`, `imp-btn-pri`, `imp-btn-sec`, `quiz-generar-btn`, `resultado-btn`, `mision-btn`, `docente-btn-editar`, `institucion-btn-peligro`, `clasificador-btn-publicar`… | Deuda de sistema de diseño: cada módulo reinventó primario/secundario/fantasma/peligro. **No procede refactor** (regla de la casa). Lo accionable: documentar el mapeo de las 36 a las 4 semánticas y unificar solo los valores compartidos (radio, alto mínimo, peso, transición) vía tokens. **Medio.** |
| R10 | **Sin onboarding de primer uso para el docente** | No hay ningún patrón de bienvenida/primer paso en `src/` | Un docente que entra por primera vez encuentra un panel vacío en todas sus secciones. Los `EmptyState` cumplen, pero no hay **un** siguiente paso claro. Mínimo viable y sin nuevas pantallas: un `QuickActionCard` de bienvenida en el Home del docente que aparezca solo si `resumen.stats.actividades === 0` y lleve a "Crear tu primera actividad". **Bajo.** |
| R11 | **`aria-expanded` ausente en el disclosure "¿Olvidaste tu PIN?"** | `login.jsx:158` | Patrón de mostrar/ocultar sin estado anunciado. Un atributo. **Muy bajo.** |
| R12 | **`<title>` estático** | `index.html:17` — siempre `"GamificApp"` | Con varias pestañas abiertas (situación normal en la revisión de un jurado) son indistinguibles. Además es señal de orientación. `"Inicio · GamificApp"`, `"Biblioteca · GamificApp"`… **Bajo.** |
| R13 | **Código visual muerto en el login** | `login.jsx:25,44,79,107`: `setAviso` se llama **solo** con `""`, así que el bloque `.login-aviso` y su CSS son inalcanzables | Deuda menor pero es exactamente el tipo de resto que confunde en un mantenimiento posterior. Eliminar estado, bloque y CSS asociado. **Muy bajo.** |

---

## 6. 🟢 Opcional — post-1.0

| # | Hallazgo | Nota |
|---|---|---|
| O1 | `pointerEvents: 'none'` en encabezados (`SidebarLayout.jsx:130`, `DashboardEstudiante.jsx:337-338`, `dashboardWidgets.css:17`) | Impide seleccionar y copiar los títulos. Parece un parche antiguo contra clics accidentales; conviene revisar si sigue haciendo falta. **Muy bajo.** |
| O2 | Metadatos de acabado ausentes | `theme-color` (pinta la barra del navegador en móvil), `description`, `apple-touch-icon`, `<noscript>`. Detalle de producto terminado. **Muy bajo.** |
| O3 | Microinteracción de confirmación al guardar | Solo si aporta: un check breve al publicar una actividad refuerza el cierre de la tarea. El coste de accesibilidad ya es cero gracias al `prefers-reduced-motion` global. **Bajo.** |
| O4 | Code splitting por rol | `React.lazy` de los 3 paneles partiría el bundle de 1,6 MB en tres. Complementa I8, pero I8 sola ya resuelve lo que el usuario percibe. **Medio.** |

---

## 7. Análisis módulo por módulo

| Módulo | Estado | Lo que hay que tocar |
|---|---|---|
| **Login / Registro** | 🟠 Bueno con dos costuras | I1 (PIN sin ver), I6 (`aria-pressed`), R11, R13, C4. La estructura, la vía de emergencia y la ayuda del PIN están bien: no tocar. |
| **Home Estudiante** | 🔴 El más afectado | C2 (falso "no hay juegos"), I3 (estados vacíos pobres), I10 (capitalización), R8 (🔥 sin explicar). La jerarquía saludo → acción principal → mundos → premios es **correcta**: responde "¿qué hago ahora?" en un vistazo. No rediseñar. |
| **Materia / juegos (Estudiante)** | 🟡 Correcto | I3, R1. Las pestañas ya tienen `aria-pressed`, los reproductores comparten `PantallaFinal`, la mecánica es sólida. **[verificar en runtime]** a 320 px. |
| **Cambiar PIN (Estudiante)** | 🔴 Sin diseñar | C1. Es el único flujo del estudiante que no pasó por diseño. |
| **Mis Premios** | 🟢 Bien | Confirmado rico en SPEC-018 (tiers, progreso, bloqueos). Solo R1 (h1→h4). |
| **Home Docente** | 🟠 Bien pensado, mal instrumentado | C2 (`resumen` sin estado de carga → tarjetas que aparecen de golpe), R10 (sin primer paso). La decisión de SPEC-004/panel de convertirlo en centro de trabajo en vez de muro de métricas fue acertada. |
| **Biblioteca de Actividades** | 🟡 Funcional, denso | R6 (6 selects). Lo demás —duplicar, archivar, restaurar, favoritos— está bien resuelto. |
| **Editores / Generador IA** | 🟠 Bien salvo el foco | I2 (foco invisible, AA), R7 (barra sticky). El estado "Falta API_KEY" está bien comunicado; la barra de acciones de SPEC-013 está congelada por diseño y **no se toca**. |
| **Ranking** | 🔴 Contraste | C3 (oro 2,14:1, plata 2,56:1). El resto de la tabla está bien. |
| **Panel Admin (módulos)** | 🟡 El más consistente de los tres | `TablaPro` + `ModalPanel` + `EmptyState` en los 10 módulos. Solo R1 (h1→h3) y la deuda transversal R2–R5. Es el rol con mejor acabado. |
| **Papelera / Auditoría** | 🟢 Bien | Pestañas, confirmación de purga, "No registrado" en lugar de inventar. Sin hallazgos propios. |
| **Sistema transversal** | 🟠 | I4, I5, I7 (Toast), I8, I9 (contraste), C4, R2–R5, R9. |

---

## 8. Experiencia de principio a fin

**Estudiante (el recorrido más crítico).** `/` → elige 🎒 → nombre + PIN → Home → mundo → juego → celebración → premios. El arco es correcto y la gamificación está bien calibrada para 6–9 años. Se rompe en tres puntos concretos: **el arranque** (blanco → "no hay juegos" falso: I8 + C2), **el PIN** (dos cuadros grises del navegador: C1) y **los avisos** (texto gris donde el resto del producto pone tarjetas: I3). Los tres son de presentación. Ninguno exige rediseñar el recorrido.

**Docente.** Login → Home centro de trabajo → materia → crear actividad (con o sin IA) → publicar → revisar progreso. El flujo es coherente y la vista de materia en pestañas evita perderse. Fricciones: no hay primer paso en el primer uso (R10), la barra de filtros de la Biblioteca pide demasiado para lo que se suele buscar (R6), y editar con teclado las opciones que generó la IA se hace a ciegas (I2).

**Administrador.** Login → Inicio con actividad real → módulos por grupo del sidebar. Es el rol **mejor acabado**: un solo patrón (`TablaPro` + `ModalPanel` + `EmptyState`) repetido con disciplina en los 10 módulos, permisos que ocultan sin fingir, auditoría que dice "No registrado" en vez de inventar. Solo hereda deuda transversal.

**Inconsistencias entre pantallas (resumen).** Cinco, todas ya listadas y todas del tipo "el sistema existe pero no se aplicó en todas partes":

1. Estados vacíos de dos calidades — `EmptyState` (22 archivos) vs `vacio-msg` (9) → I3.
2. Diálogos de dos naturalezas — `ConfirmDialog`/`Toast` en 18 sitios vs `window.prompt` en 1 → C1. (Los 3 `window.confirm` restantes de los editores, `EditorClasificador.jsx:190,291` y `GeneradorActividadIA.jsx:150`, son guardas de descarte de trabajo en curso: menos visibles y de prioridad 🟡 en el mismo grupo que C1.)
3. Estado seleccionado accesible — `aria-pressed` en las pestañas del estudiante pero no en las tarjetas del login → I6.
4. Visibilidad de credenciales — el adulto puede ver su contraseña, el niño no puede ver su PIN → I1.
5. Contraste — 3.º puesto del podio cumple, 1.º y 2.º no → C3.

**Deuda visual acumulada:** 351 hex sueltos, 30+ tamaños de fuente, 14 gaps, 19 breakpoints, 36 familias de botón. **Deuda de UX:** ausencia de estado de carga y de error en los tres roles. **Deuda de accesibilidad:** 1 fallo severo de contraste, 1 marginal, 1 de foco visible, 1 de objetivo táctil, 1 de live region, saltos de encabezado, `title` como único canal.

---

## 9. Plan de implementación por fases

Cada fase deja la app compilando y verificable, y respeta el punto de parada antes de commit.

| Fase | Contenido | Esfuerzo | Resultado |
|---|---|---|---|
| **UX-1 · Costuras visibles** | C1, C2 (solo Home estudiante + Home docente), C3, C4 | ~1–1,5 días | Desaparecen los tres puntos que un jurado nota sin ser especialista. |
| **UX-2 · Cierre de accesibilidad AA** | I1, I2, I4, I5, I6, I7, I9 + R1, R7, R11 | ~1,5 días | Sin fallos AA conocidos. Material defendible en la sustentación. |
| **UX-3 · Coherencia entre roles** | I3, I8, I10, C2 (resto de vistas), R10, R12, R13 | ~1 día | **Aquí se declara RC.** |
| **UX-4 · Consolidación del design system** | R2, R3, R4, R5, R9 — migración **por archivo** con verificación visual, nunca sustitución masiva | ~2–3 días | Acabado 1.0 pleno. Se puede hacer en paralelo a `/descargar`. |
| **UX-5 · Detalle fino** | R6, R8, O1–O4 | ~1 día | Post-1.0. |

Verificación obligatoria por fase (misma regla que SPEC-018 §6): `npm run build` limpio, lint sin nuevos problemas sobre la línea base de 28, navegación real en el entorno local, responsive 320/375/768/1024/escritorio cuando aplique, consola sin errores nuevos.

**Nota de proceso.** Todo este informe es presentación. Nada de lo propuesto toca `server/`, migraciones, `configuracion_json`, permisos, XP ni fórmulas de calificación — es decir, **ninguna de las áreas del §10 de CLAUDE.md**, y por tanto no requiere SPEC nueva. Si al implementar algo apareciera la necesidad de tocar backend, se detiene y se consulta.

---

## 10. Veredicto: ¿Release Candidate?

**Hoy: no. Es una beta muy avanzada. ~85 % del acabado profesional de una 1.0.**

El argumento no es que falte trabajo, sino **cuál**:

- La **arquitectura de información, la navegación y la jerarquía visual están resueltas.** No hay ninguna pantalla que haya que rediseñar. Eso es lo caro y ya está hecho.
- Los **fundamentos de accesibilidad son reales, no cosméticos**: focus-trap, `prefers-reduced-motion` global razonado, alternativa completa al drag-and-drop, `aria-current`, restauración de foco. Por encima de lo habitual en un proyecto de tesis.
- Lo que falta es **cobertura**: sistemas correctos aplicados en unos sitios y no en otros. Un `window.prompt` donde hay `ModalPanel`; texto plano donde hay `EmptyState`; hex sueltos donde hay tokens; el 3.º puesto con contraste correcto y el 1.º sin él.
- Y un hallazgo que es de verdad crítico y no cosmético: **la app afirma que no hay contenido mientras aún está preguntándolo**, y ese fallo es peor precisamente en producción, con Render en frío, en el primer acceso — el escenario del jurado.

**Se declara RC al cerrar UX-1, UX-2 y UX-3** (los 4 🔴 y los 10 🟠): ~3,5–4 días de trabajo de presentación, sin riesgo funcional, sin tocar áreas congeladas.

**Se declara 1.0 al cerrar UX-4.** UX-5 es post-1.0.

Para el hito siguiente hay una dependencia que conviene no perder: **C4 (autoalojar las fuentes) debe estar cerrado antes de validar el instalador Windows.** Si no, el instalador puede pasar la prueba de aceptación en una máquina con internet y verse distinto en el aula.
