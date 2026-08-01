# SPEC-021 — Release Candidate QA & UX Audit

**Estado:** 🟡 **AUDITORÍA ENTREGADA — corrección PARCIALMENTE implementada.** Ver §10 para el estado real, hallazgo por hallazgo (verificado contra el código el 2026-08-01, no contra esta cabecera).
**Fecha:** 2026-07-30 · **Estado revisado:** 2026-08-01
**Origen:** SPEC-020 (POLISH SPRINT v1.0.1) cerrado; frontend congelado.
**Naturaleza:** sprint independiente. **No** continúa SPEC-020 ni lo reabre.

## 0. Alcance y reglas del sprint

**Qué es:** una auditoría de calidad previa a producción, hecha desde la silla del usuario y no desde la del desarrollador. Cinco roles simultáneos: QA Engineer Senior, UX Researcher, Product Designer, Accessibility Reviewer y Software Tester.

**Qué NO es y no será:** funcionalidades nuevas, cambios de lógica de negocio, cambios de arquitectura, pantallas nuevas, rediseño. Ninguna corrección se implementa hasta que Fabrizio apruebe la ola correspondiente de la §5.

**Criterio de hallazgo:** no basta con «falla». Cuenta cualquier momento en el que un usuario real piense *«esto se siente raro»*, *«aquí me confundí»*, *«no entendí qué pasó»*, *«esperaba otra cosa»* o *«esto parece un error aunque funcione»*.

### Método

Lectura completa de `src/` (27.734 líneas, 118 archivos) y de la capa pública de `server/`, recorriendo cada pantalla como una sesión real por perfil. Verificaciones ejecutadas: `npm run build` (limpio, 6,43 s) y `npx eslint src server` (**29 problemas: 26 errores + 3 warnings — línea base intacta, sin regresiones**).

**Límite honesto de esta auditoría:** es estática y de lectura de código, con trazas de ejecución razonadas. **No** hubo sesión con MySQL levantado, ni medición con lector de pantalla real, ni prueba en tablet física. Los hallazgos marcados **[verificado en código]** son deducciones directas del código con la ruta de reproducción exacta; los marcados **[a confirmar en dispositivo]** requieren la pasada manual de la Ola 0. Ninguno es una impresión.

### Perfiles simulados

| Perfil | Hallazgos que destapó |
|---|---|
| Estudiante de primaria (6-9 años) | P1-2, P1-3, P2-10, P3-8 |
| Profesor | P2-1, P2-2, P2-3, P2-4, P2-5, P3-3, P3-4 |
| Usuario nuevo | **P1-1**, P1-2, P2-7 |
| Mala conexión | **P1-4**, **P1-7**, P2-12, P2-13, P3-12 |
| Botón Atrás del navegador | **P0-2** |
| Refresco con F5 | **P0-2**, P1-2 |
| Varias pestañas abiertas | **P1-6** |
| Actividad abierta mucho tiempo | P0-2, P2-13 |
| Cambia constantemente entre mundos | P2-12, P1-7 |
| Navega muy rápido | P2-12, P2-5 |
| Móvil / pantalla pequeña | P1-8, P2-7, P2-10, P3-6, P4-1 |
| Solo teclado | **P1-5**, P1-8, P2-9, P3-9 |
| Intenta romper la aplicación | **P0-1**, P1-6, P2-6 |

---

## 1. Resumen ejecutivo

| Prioridad | Nº | Lectura |
|---|---|---|
| **P0** — impide declarar RC | 2 | Un aula entera puede quedarse fuera; el gesto más común del navegador expulsa al niño de su juego |
| **P1** — daño real y frecuente | 8 | Datos irrecuperables, afirmaciones falsas y pérdida de foco en los 7 juegos |
| **P2** — fricción seria | 14 | Incoherencias de identidad, estados y accesibilidad |
| **P3** — pulido | 13 | Microcopy, semántica y restos de patrones antiguos |
| **P4** — deuda registrada | 4 | Ya conocida y explícitamente fuera del cierre de tesis |
| **Total** | **41** | |

**Veredicto: GamificApp NO está lista para producción.** No por calidad del producto —la base es sólida y el pulido de SPEC-018/020 se nota— sino porque **los dos P0 se disparan exactamente el día del estreno**: 30 niños entrando a la vez desde la red de la escuela, y un niño pulsando «Atrás».

**El patrón transversal más importante:** el equipo ya identificó y corrigió, en el panel del estudiante y en el Inicio del docente, el defecto de «lista vacía significa a la vez *todavía no sé* y *no hay nada*». **Ese mismo defecto sigue vivo en cuatro pantallas que la corrección no alcanzó** (P1-1, P1-4, P1-7, P2-2), y una de ellas es la primerísima que ve un niño. No es un descuido nuevo: es una corrección que se aplicó por pantalla en vez de por patrón.

---

## 2. Hallazgos P0 — impiden declarar Release Candidate

### P0-1 · El límite de peticiones por IP deja fuera a un aula completa

- **Descripción:** todo `/api/auth` está limitado a **30 peticiones cada 5 minutos por IP**, contando también las peticiones que tienen éxito y los `GET` públicos del registro. Una escuela sale a internet por **una sola IP pública (NAT)**. `app.set('trust proxy', 1)` hace que `req.ip` sea justamente esa IP compartida.
- **Impacto:** **crítico y total.** El estudiante nº 31 de la jornada recibe `429 Demasiadas peticiones. Espera unos minutos.` El primer día de clase es peor: el alta por Excel gasta ~3 peticiones por niño (`cursos-pendientes` + `estudiantes-pendientes` + `activar`), así que **el aula se bloquea alrededor del décimo niño**. No hay forma de distinguirlo de «la app está caída».
- **Frecuencia:** garantizada en cualquier uso simultáneo real. Nunca aparece en pruebas de escritorio con un solo usuario, que es exactamente por qué llegó hasta aquí.
- **Cómo reproducirlo:** desde una misma IP, lanzar 31 `POST /api/auth/login` válidos en menos de 5 minutos. El 31.º responde 429. Equivalente real: un laboratorio de cómputo con 30 tablets.
- **Causa probable:** el limitador se diseñó contra fuerza bruta de un atacante individual y se montó sobre el router entero (`app.use('/api/auth', limitarAuth, authRouter)`), sin separar «intento fallido de credencial» de «petición legítima». La defensa **por cuenta** (5 fallos → 15 min) ya existe y es la que de verdad frena la fuerza bruta.
- **Archivos implicados:** `server/server.js:48-70` (limitador), `server/server.js:92` (montaje), `server/routes/auth.js:410-455` (los dos `GET` públicos que consumen cupo).
- **Riesgo de corregirlo:** **Medio.** Toca autenticación → **área protegida CONTRIBUTING §9: exige spec aprobada antes del primer commit.** El cambio en sí es acotado: contar solo respuestas 401/403, excluir los `GET` de catálogo, y subir el techo. No toca JWT, ni PIN, ni bcrypt.
- **Esfuerzo estimado:** S (1-3 h) + la spec.
- **Prioridad recomendada:** **P0 — primero de todo.** Ningún otro hallazgo importa si el aula no entra.

### P0-2 · El botón Atrás y F5 expulsan al niño de su actividad, sin aviso y sin guardar

- **Descripción:** la app es una SPA con **tres rutas planas** (`/`, `/registro`, `/dashboard`); toda la navegación interna —sección, mundo, pestaña, juego abierto— vive en `useState`. Consecuencias encadenadas:
  1. **Atrás** desde cualquier punto del panel sale de `/dashboard` a `/`, desmontando el juego en curso. La guardia de salida (`useGuardiaActividad`) **no intercepta `popstate`**: solo protege la navegación interna y `beforeunload`. El progreso del intento se pierde en silencio.
  2. Como `isAuthenticated()` sigue siendo cierto, `/` **muestra el formulario de login a un usuario que ya tiene sesión**. Un niño de 7 años entiende «me echó».
  3. **F5** dentro de un juego sí avisa (`beforeunload`), pero al recargar devuelve al Inicio: se pierde la sección, el mundo, la pestaña y la actividad abierta.
  4. Como el panel no tiene URL propia, **nada se puede compartir, marcar ni recuperar**.
- **Impacto:** **crítico.** Atrás es el gesto universal de «subir un nivel», y en móvil suele ser un botón físico o un deslizamiento del borde. Aquí no sube un nivel: cierra la aplicación y borra el intento.
- **Frecuencia:** altísima, en todos los perfiles y dispositivos.
- **Cómo reproducirlo:** entrar como estudiante → *Mis mundos* → un mundo → *Juegos* → abrir un juego → responder 2 ítems → pulsar Atrás. Resultado: pantalla de login, intento perdido, sin ninguna confirmación. Repetir con F5: avisa, pero al aceptar aterriza en el Inicio.
- **Causa probable:** deuda conocida y documentada (`CONTRIBUTING.md` §3, SPEC-001, nunca implementada).
- **Archivos implicados:** `src/App.jsx:29-50`, `src/hooks/useGuardiaActividad.jsx:99-108`, `src/pages/estudiante/DashboardEstudiante.jsx:35-44`, `src/pages/admin/dashboard.jsx:180-182`, `src/pages/admin/AdminDashboard.jsx:178`.
- **Riesgo de corregirlo:** **Alto** si se hace bien (sub-rutas reales = tocar los tres paneles). **Bajo-Medio** para la mitigación mínima: (a) `/` redirige a `/dashboard` si hay sesión; (b) empujar una entrada de historial al abrir una actividad y escuchar `popstate` para enrutarlo por la misma guardia que ya existe. **La mitigación cubre el 90 % del daño y no toca la arquitectura.**
- **Esfuerzo estimado:** mitigación M (media jornada). Solución completa XL (>2 días) → **spec propia, fuera de este sprint.**
- **Prioridad recomendada:** **P0 en su versión mitigada.** La versión completa es SPEC-001 y no debe entrar aquí.

---

## 3. Hallazgos P1 — daño real, frecuente o irreversible

### P1-1 · La pantalla de primer ingreso afirma «no hay nadie» mientras está cargando

- **Descripción:** en el registro, al elegir el curso, `pendientes` arranca en `[]` y la vista pinta de inmediato **«No hay nadie por entrar en este curso. Pregúntale a tu profe.»** — una afirmación falsa que aparece durante toda la petición. No hay estado de carga ni de error: si la red falla, el `.catch()` deja `[]` y **el mensaje falso se vuelve permanente**. El `<select>` de cursos tiene el mismo defecto: si `cursosPendientes()` falla, queda vacío y sin explicación.
- **Impacto:** **muy alto.** Es la primerísima pantalla del producto, el día de mayor concurrencia, y el mensaje **manda al niño a molestar al docente** cuando no pasa nada. Con P0-1 activo se convierte en el bucle perfecto: 429 → lista vacía → «pregúntale a tu profe» → 30 niños en la mesa del docente.
- **Frecuencia:** en cada activación (la ventana de carga) y de forma permanente con red lenta o caída.
- **Cómo reproducirlo:** abrir `/registro`, elegir un curso y mirar antes de que responda la API. Con red desconectada, el mensaje ya no se va.
- **Causa probable:** esta pantalla es de SPEC-014 y **se escribió después** de que P1-1 del bloque RC arreglara el mismo defecto en el panel del estudiante. La corrección se aplicó pantalla por pantalla, no como patrón.
- **Archivos implicados:** `src/pages/estudiante/RegistroEstudiante.jsx:39-48, 99-100, 216-222`.
- **Riesgo de corregirlo:** **Bajo.** Añadir `estado: 'cargando' | 'listo' | 'error'` replicando el patrón ya probado en `DashboardEstudiante`. No toca `authService` ni el backend.
- **Esfuerzo estimado:** S (1-3 h).
- **Prioridad recomendada:** **P1, en la misma ola que P0-1** (mismo escenario de fallo).

### P1-2 · El PIN y el código de emergencia se muestran una sola vez, sin copiar y sin recuperación

- **Descripción:** al activar la cuenta, la pantalla muestra el PIN inicial y el código de emergencia **una única vez**, como texto plano, sin botón de copiar, sin imprimir y sin «volver a verlos». La sesión ya quedó guardada y el código de activación **ya se consumió** (`codigo_acceso_hash = NULL`). Si el niño refresca o cierra la pestaña en esa pantalla, vuelve al formulario de primer ingreso, que ahora **lo rechaza con «Ese código no es correcto»** — su cuenta está activa pero el camino por el que entró ya no existe.
- **Impacto:** **alto.** El usuario es un niño de 6-9 años al que se le pide transcribir dos códigos a mano bajo presión. El mensaje de rechazo es engañoso: sugiere que se equivocó, no que ya entró. Recuperar el código de emergencia exige a un **administrador** (la tabla de admin lo muestra en claro); el docente **no** puede: su botón «Regenerar código» regenera el de *activación*, no el de emergencia.
- **Frecuencia:** alta el primer día; el pánico de «me equivoqué» dispara refrescos.
- **Cómo reproducirlo:** activar una cuenta pendiente y pulsar F5 en la pantalla de credenciales. Reintentar con el mismo código → rechazo.
- **Causa probable:** la pantalla se diseñó como paso lineal de éxito, sin contemplar recarga ni cierre accidental. Falta también un `beforeunload` en ese punto exacto.
- **Archivos implicados:** `src/pages/estudiante/RegistroEstudiante.jsx:117-147`, `src/services/authService.js:111-118`, `server/routes/auth.js:455-515`.
- **Riesgo de corregirlo:** **Bajo** para lo que resuelve el 90 %: botón «Copiar mis datos», aviso al salir, y cambiar el mensaje de rechazo por «Esta cuenta ya está activa: entra con tu nombre y tu PIN». **Medio** si se añade reimpresión del carné → toca autenticación (**§9**).
- **Esfuerzo estimado:** S (1-3 h) la parte de bajo riesgo.
- **Prioridad recomendada:** **P1.**

### P1-3 · «¡Seguir jugando!» no lleva al juego, y puede apuntar a algo ya terminado

- **Descripción:** la tarjeta principal del Inicio del estudiante promete *«Te espera "Los animales" en Ciencias»* y, al pulsarla, **abre la materia en la pestaña «Material de estudio»** — no la actividad nombrada. El niño debe encontrarla solo. Además, `ultimaActividad` es simplemente el progreso **más reciente**, sin filtrar por completado: la tarjeta invita a «seguir» una actividad que ya se terminó al 100 %.
- **Impacto:** **alto.** Es la acción primaria del Home, la que responde «¿qué hago ahora?». Rompe la promesa dos veces: destino equivocado y contenido equivocado.
- **Frecuencia:** en cada visita al Inicio con progreso previo.
- **Cómo reproducirlo:** completar un quiz al 100 %, volver a Inicio. La tarjeta dice «¡Seguir jugando!» con ese quiz. Pulsar → aterriza en Material de estudio.
- **Causa probable:** `irAMateria(nombre)` solo acepta el nombre de la materia; nunca se pensó un salto directo al reto. El filtro por estado nunca se añadió.
- **Archivos implicados:** `src/pages/estudiante/DashboardEstudiante.jsx:199-235, 401-418`.
- **Riesgo de corregirlo:** **Bajo-Medio.** Filtrar los completados es trivial. Saltar a la actividad exige propagar el reto a `abrirMateria` y preseleccionar pestaña + actividad: es navegación interna, no arquitectura, pero toca cuatro `setState` encadenados.
- **Esfuerzo estimado:** M (media jornada).
- **Prioridad recomendada:** **P1.**

### P1-4 · Un fallo de red en «Mis premios» se presenta como «Aún no hay misiones»

- **Descripción:** `obtenerMisiones()` se traga cualquier error y devuelve `{ misiones: [], nuevas: [] }`. `PanelMisiones` no distingue ese `[]` de un catálogo vacío y muestra **«Aún no hay misiones — Juega actividades para empezar a completar misiones y ganar premios.»** a un niño que puede tener diez insignias. De paso, `resumen` viene `undefined` y **el bloque de Nivel / XP / Racha desaparece sin explicación**. No hay estado de error ni botón de reintento.
- **Impacto:** **alto.** Es la pantalla de recompensa: borrar los logros de un niño y decirle que aún no ha ganado nada es lo contrario de la filosofía «siempre se termina ganando». Viola `CONTRIBUTING` §6.14.
- **Frecuencia:** en cada corte de red y en cada arranque en frío de Render.
- **Cómo reproducirlo:** abrir *Mis premios* con el backend detenido.
- **Causa probable:** el servicio degrada a `[]` por diseño histórico y esta vista nunca recibió el tratamiento de tres estados que sí recibieron el Inicio del estudiante y el del docente.
- **Archivos implicados:** `src/services/misionesService.js:52-62`, `src/pages/estudiante/PanelMisiones.jsx:64-75, 137-146`.
- **Riesgo de corregirlo:** **Bajo.** Añadir `propagarError` (el mismo opt-in que ya existe en `retosService`) y los tres estados. **No toca el motor de misiones** (`server/lib/misiones.js`), así que **no entra en §9**.
- **Esfuerzo estimado:** S (1-3 h).
- **Prioridad recomendada:** **P1.**

### P1-5 · El foco del teclado se pierde en los 7 juegos, en cada respuesta

- **Descripción:** los siete reproductores deshabilitan el control recién pulsado (`disabled={respondida}`, `disabled={superado}`, `disabled={emparejadas.has(...)}`, flechas de la Línea del tiempo en los extremos). Cuando un elemento **enfocado** pasa a `disabled`, el navegador lo desenfoca y **el foco cae a `<body>`**: el siguiente `Tab` reempieza desde el principio del documento. En el Quiz se suma el auto-scroll a la pregunta siguiente, así que el usuario de teclado **queda mirando un sitio distinto del que tiene el foco**.
- **Impacto:** **alto para accesibilidad.** Cada respuesta obliga a recorrer todo el panel con `Tab` para alcanzar el botón «Siguiente», que está a dos pasos visuales. Contradice el trabajo de foco ya hecho en modales y overlays.
- **Frecuencia:** en cada ítem de cada juego, para todo usuario de teclado o lector de pantalla.
- **Cómo reproducirlo:** abrir un Verdadero/Falso, responder con `Enter`, pulsar `Tab`: el foco no está en «Siguiente afirmación», está al inicio del documento.
- **Causa probable:** patrón de bloqueo copiado entre reproductores sin reubicar el foco. SPEC-018 resolvió el foco en modales; los juegos quedaron fuera.
- **Archivos implicados:** `src/components/quiz/QuizInteractivo.jsx:117-135, 258-301`; `src/components/juegos/VerdaderoFalso.jsx:150-190`; `src/components/juegos/CompletarEspacios.jsx:155-190`; `src/components/juegos/LineaTiempo.jsx:195-215`; `src/components/juegos/Memorama.jsx:150-170`; `src/components/mision/MisionNarrativa.jsx:135-160`.
- **Riesgo de corregirlo:** **Bajo.** Mover el foco al bloque de confirmación al aparecer, o usar `aria-disabled` + guardia en el manejador en vez de `disabled`. **Cero cambios de mecánica y cero cambios visuales.**
- **Esfuerzo estimado:** M (media jornada para los 7).
- **Prioridad recomendada:** **P1.**

### P1-6 · Dos pestañas = identidad cruzada y XP perdido en silencio

- **Descripción:** el token y `edu_estudianteId` viven en `localStorage`, compartido por todas las pestañas. Si el niño B inicia sesión en una pestaña nueva mientras la de A sigue abierta, `guardarSesion()` **sobrescribe token e identidad**. La pestaña vieja sigue mostrando el nombre, el XP y los mundos de A, pero **todas sus peticiones viajan con el token de B**. El servidor sí protege (`req.user.estudiante_id !== estudianteId` → 403, `server/routes/progreso.js:130`): **no hay contaminación entre cuentas**. Lo que ocurre es que el intento de A **se pierde entero, sin error visible** — `guardarProgreso` captura el fallo y el overlay muestra el chip neutro «No pudimos confirmar tu XP». Y como es 403 y no 401, `authFetch` **no cierra la sesión**, así que la pestaña zombi puede seguir así indefinidamente.
- **Impacto:** **alto.** El escenario —un dispositivo compartido, un niño detrás de otro— es literalmente el entorno de despliegue descrito en el propio `authService.js`. El niño termina su juego, ve su nota y su XP se evapora.
- **Frecuencia:** media-alta en aula con tablets compartidas.
- **Cómo reproducirlo:** sesión de A en pestaña 1 → sesión de B en pestaña 2 → volver a la 1 y terminar un juego. La cabecera dice A; el XP no se guarda.
- **Causa probable:** no hay sincronización entre pestañas (`storage` event) ni verificación de que la identidad renderizada siga siendo la del token.
- **Archivos implicados:** `src/services/authService.js:44-57, 192-204`; `src/services/gamificationService.js:71-109`; `src/pages/estudiante/DashboardEstudiante.jsx:94`.
- **Riesgo de corregirlo:** **Medio** — toca sesión (**§9, exige spec**). Mitigación honesta y barata: escuchar el evento `storage` y, si la identidad cambió, mostrar «Otra persona inició sesión en este dispositivo» y volver al login. Alternativa mínima sin §9: tratar el 403 de progreso como error visible en vez de chip neutro.
- **Esfuerzo estimado:** S (1-3 h) la mitigación; M con spec.
- **Prioridad recomendada:** **P1.**

### P1-7 · Un solo fallo de red marca como caídas las cuatro pestañas de la materia

- **Descripción:** al abrir un mundo se lanzan dos peticiones (retos y material) con `Promise.allSettled`, y **si cualquiera de las dos falla, `estadoMateria` pasa a `'error'` para todo**. Si solo falla el material —lo más probable: son archivos base64 pesados— las pestañas **Quizzes, Juegos y Misiones muestran «No pudimos cargar esto»** aunque sus datos llegaron perfectamente y están en memoria.
- **Impacto:** **alto.** Un fallo parcial se convierte en un mundo entero inaccesible. El niño ve cuatro pestañas rotas donde tres funcionan.
- **Frecuencia:** media-alta en la red de una escuela; el material es lo más pesado de toda la app.
- **Cómo reproducirlo:** entrar a un mundo con la petición de material fallando y abrir la pestaña *Juegos*: error, con los juegos ya cargados detrás.
- **Causa probable:** un solo estado compartido para dos cargas independientes.
- **Archivos implicados:** `src/pages/estudiante/DashboardEstudiante.jsx:159-197, 251-272`.
- **Riesgo de corregirlo:** **Bajo.** Separar en `estadoRetosMateria` y `estadoMaterial`. Cambio local, sin efectos fuera de la vista.
- **Esfuerzo estimado:** S (1-3 h).
- **Prioridad recomendada:** **P1.**

### P1-8 · El bloqueo de scroll de fondo no funciona en ningún modal ni overlay de los paneles

- **Descripción:** `ModalPanel`, `ResultadoOverlay`, el diálogo de salida y el menú móvil bloquean el scroll con `document.body.style.overflow = 'hidden'`. Pero **en los tres paneles el `body` no scrollea**: `.sidebar-container` tiene `height: 100dvh; overflow: hidden` y **el contenedor que scrollea es `main.contenido`** (`overflow-y: auto`). Bloquear el `body` es, literalmente, **una operación sin efecto**. Con un modal abierto, la rueda o el gesto táctil siguen desplazando la página de fondo.
- **Impacto:** **alto en móvil.** El overlay de resultado de un juego es lo que el niño ve al terminar; si el fondo se mueve bajo la tarjeta, parece un error. En los formularios largos del docente, el fondo se desliza mientras se edita en el modal.
- **Frecuencia:** en todos los modales de los tres paneles y en el overlay final de los 7 juegos.
- **Cómo reproducirlo:** abrir *Cambiar mi PIN*, o terminar cualquier juego, y hacer scroll fuera del panel. El fondo se mueve.
- **Causa probable:** el patrón se importó de una app con scroll en `body`; el layout de altura completa llegó después (SPEC-018) y nadie revisó el bloqueo.
- **Archivos implicados:** `src/components/dashboard/DashboardWidgets.jsx:103-122`; `src/components/juegos/ResultadoActividad.jsx:198-204`; `src/components/dashboard/SidebarLayout.jsx:99-104`; `src/pages/admin/dashboard.css:8-18, 318-324`.
- **Riesgo de corregirlo:** **Bajo-Medio.** Bloquear el elemento correcto (`.contenido`) o usar `overscroll-behavior: contain` en los overlays. Cuidado con el login/registro, donde el `body` **sí** scrollea: la solución debe cubrir ambos casos.
- **Esfuerzo estimado:** S (1-3 h).
- **Prioridad recomendada:** **P1.**

---

## 4. Hallazgos P2 — fricción seria

Formato compacto: **Descripción · Impacto · Frecuencia · Repro · Causa · Archivos · Riesgo / Esfuerzo.**

### P2-1 · El sidebar del docente lo llama «Docente», no por su nombre
El Home saluda «Buenas tardes, María Pérez» y, tres centímetros a la izquierda, el sidebar muestra la inicial `D` y el nombre `Docente`, con el `username` como detalle. El dato correcto (`nombreDocente`) ya está calculado en el mismo archivo. El panel del estudiante sí usa el nombre real. · **Impacto:** medio — la identidad se siente genérica y desmiente al saludo de al lado. · **Frecuencia:** siempre. · **Repro:** entrar como docente y comparar cabecera y sidebar. · **Causa:** valor de marcador de posición nunca sustituido. · `src/pages/admin/dashboard.jsx:372-373, 491`. · **Riesgo:** muy bajo / **XS** (<1 h).

### P2-2 · «Tus materias» del docente no tiene estados de carga, error ni vacío
La misma pantalla existe dos veces: en el Inicio, con esqueleto + error + `EmptyState`; y como sección propia, **sin nada**: si la lista tarda o falla, se ve un título y un hueco. · **Impacto:** medio-alto — el docente no sabe si no tiene materias o si la app no pudo preguntarlo. · **Frecuencia:** en cada carga lenta o fallida. · **Repro:** abrir *Materias* con el backend caído. · **Causa:** la corrección de estados se aplicó al Inicio y no se replicó. · `src/pages/admin/dashboard.jsx:677-707`. · **Riesgo:** bajo / **S**.

### P2-3 · Errores fantasma: un único mensaje global que sobrevive a la navegación
`errorMaterial` es un solo string compartido por materias, estudiantes, subida de archivos, IA y biblioteca. **No se limpia al cambiar de sección** y **no se renderiza en el Inicio**, donde sí se escribe. Resultado: un fallo ocurrido en el Inicio es invisible allí y **reaparece minutos después**, sin contexto, dentro de una materia. · **Impacto:** medio-alto — mensajes de error que aparecen donde no ocurrieron destruyen la confianza en todos los demás. · **Frecuencia:** cada vez que algo falla fuera de las vistas que lo pintan. · **Repro:** provocar un fallo de materias en el Inicio, navegar a *Materias* → un mundo. El error aparece ahí. · **Causa:** estado de error de página tratado como estado global. · `src/pages/admin/dashboard.jsx:185, 234-237, 259-262, 736-747`. · **Riesgo:** bajo / **S**.

### P2-4 · «Top estudiantes» es el ranking de toda la institución, presentado dentro de una materia
El widget se alimenta de `obtenerRanking(3)` —global, sin filtro de materia ni de curso— y se muestra junto a «Retos publicados **en {materia}**». El docente leerá «los mejores de esta materia». Además, **sin datos la tarjeta queda con encabezado y nada debajo**, sin `EmptyState`. · **Impacto:** medio-alto — dato correcto presentado en un marco que lo vuelve falso; roza `CONTRIBUTING` §6.14. · **Frecuencia:** siempre. · **Repro:** abrir la pestaña *Resumen* de cualquier materia. · **Causa:** widget reutilizado sin ajustar su rótulo ni su fuente. · `src/pages/admin/dashboard.jsx:72-119, 331-336, 770-780`. · **Riesgo:** bajo si solo se corrige el rótulo («Top de la institución») / **XS**. Filtrar de verdad por materia sería backend → fuera de alcance.

### P2-5 · El editor del docente pierde los últimos segundos de escritura al navegar
Los borradores se guardan con `PATCH` **debounced**. Al desmontar, el `useEffect` de limpieza **cancela los temporizadores pendientes**: lo escrito dentro de la ventana de debounce se descarta. No hay guardia de salida ni `beforeunload` en el panel del docente (solo existe para actividades del estudiante), así que **un clic en el sidebar se lleva ese trabajo sin preguntar**. · **Impacto:** medio-alto — pérdida silenciosa de trabajo real. · **Frecuencia:** media; alta en quien escribe y navega rápido. · **Repro:** escribir en un editor y pulsar de inmediato otra sección del sidebar; volver: falta lo último. · **Causa:** el debounce protege contra ráfagas de teclas pero no contra el desmontaje. · `src/components/juegos/HistorialActividades.jsx:81-116`; `src/pages/admin/dashboard.jsx:486-490`. · **Riesgo:** bajo (vaciar los temporizadores pendientes al desmontar en vez de cancelarlos) / **S**.

### P2-6 · Un clic en el fondo del modal cierra y descarta el formulario, sin confirmar
`ModalPanel` cierra con `onClick` en el backdrop. Como el clic se dispara al soltar el ratón, **seleccionar texto dentro del panel y soltar fuera cierra el modal** y pierde lo escrito. Afecta a *Añadir estudiante*, *Editar estudiante*, *Cambiar mi PIN* y a los modales de admin. · **Impacto:** medio-alto — pérdida de datos por un gesto involuntario. · **Frecuencia:** media. · **Repro:** abrir *Añadir estudiante*, escribir, arrastrar una selección desde dentro hacia fuera y soltar. · **Causa:** cierre por backdrop sin distinguir `mousedown` de `mouseup` ni comprobar si hay cambios. · `src/components/dashboard/DashboardWidgets.jsx:170-176`. · **Riesgo:** bajo / **XS**.

### P2-7 · El error del login queda fuera de pantalla en móvil
`login-error` se pinta **arriba de la tarjeta**, sobre el selector de perfil; el botón *Ingresar* está abajo. En una pantalla de 375×667 con el teclado abierto, el niño pulsa, no ve nada y vuelve a pulsar. · **Impacto:** medio-alto — parece que el botón no funciona. · **Frecuencia:** en cada error de credencial en móvil, que es el error más común del público objetivo. · **Repro:** a 375 px, PIN incorrecto → el mensaje nace fuera del viewport. · **Causa:** posición pensada para escritorio. · `src/pages/admin/login.jsx:103`, `src/pages/admin/login.css`. · **Riesgo:** bajo (mover el mensaje junto al botón o hacer scroll hasta él) / **XS**. **[a confirmar en dispositivo]**

### P2-8 · Cuatro patrones distintos de pestañas, uno de ellos con ARIA rota
Conviven: (a) `role="tablist"` **sin ningún `role="tab"` dentro** — ARIA inválida, un lector anuncia una lista de pestañas vacía; (b) `role="tablist"` + `role="tab"` + `aria-selected`, sin `tabpanel` ni navegación por flechas; (c) botones con `aria-pressed`; (d) `<nav>` con botones sin ninguna semántica de estado. · **Impacto:** medio — incoherencia visible para lectores de pantalla y para quien mantenga el código. · **Frecuencia:** siempre. · **Repro:** comparar `dashboard.jsx:611`, `ModuloPapelera.jsx:65`, `RegistroEstudiante.jsx:159`, `DashboardEstudiante.jsx:485-512` y `dashboard.jsx:749`. · **Causa:** patrones añadidos por sprints distintos sin criterio único. · **Riesgo:** bajo si se unifica en `aria-pressed` (el más usado y el más seguro) / **S**.

### P2-9 · `role="listbox"` con `<button>` dentro: ARIA inválida en el registro
La lista de nombres del curso declara `role="listbox"` pero sus hijos son botones, no `role="option"`. Un lector de pantalla anuncia un cuadro de lista **sin opciones**: el niño con lector no encuentra su nombre. · **Impacto:** medio-alto para ese usuario, en la pantalla de entrada. · **Frecuencia:** siempre. · **Repro:** navegar `/registro` con lector de pantalla. · **Causa:** rol elegido por parecido visual. · `src/pages/estudiante/RegistroEstudiante.jsx:205-215`. · **Riesgo:** muy bajo (quitar el rol o completarlo) / **XS**.

### P2-10 · El Clasificador enseña primero el gesto que no funciona en tablet
La instrucción dice **«Arrastra cada tarjeta a su canasta** (o tócala y luego toca la canasta)». El arrastrar-y-soltar de HTML5 **no funciona en navegadores móviles**; el niño de tablet —el dispositivo real de la escuela— intenta lo primero, **no pasa absolutamente nada**, y el modo que sí funciona está entre paréntesis. · **Impacto:** medio-alto — el primer intento falla en silencio en el dispositivo principal. · **Frecuencia:** siempre, en tablet. · **Repro:** abrir el Clasificador en una tablet e intentar arrastrar. · **Causa:** instrucción escrita desde el escritorio. · `src/components/clasificador/JuegoDragAndDrop.jsx:150-155`. · **Riesgo:** muy bajo — **invertir el orden de la frase**, sin tocar mecánica / **XS**. **[a confirmar en dispositivo]**

### P2-11 · El avance de los juegos no se anuncia: barra y contador son solo visuales
Los seis juegos con `.juego-dnd-avance` actualizan «3 / 8» sin `aria-live`. Un usuario de lector de pantalla responde y **no recibe ninguna señal de que avanzó**, ni de cuánto queda. · **Impacto:** medio-alto para accesibilidad; contradice la emoción de «progreso constante» que SPEC-020 fue a instalar. · **Frecuencia:** en cada ítem. · **Repro:** jugar un quiz con lector de pantalla. · **Causa:** el indicador se diseñó como refuerzo visual. · `QuizInteractivo.jsx:419-434`, `Memorama.jsx`, `JuegoDragAndDrop.jsx`, `VerdaderoFalso.jsx`, `CompletarEspacios.jsx`. · **Riesgo:** bajo (`role="status"` en el contador) / **XS**.

### P2-12 · Navegar rápido dispara cargas en cascada sin cancelar
El efecto de materias del docente depende de `pagina`: **cada clic del sidebar relanza dos peticiones encadenadas** (`listarMaterias` → `misMaterias`), y ese efecto **no tiene bandera `vigente`**. Con cinco clics rápidos hay cinco cadenas en vuelo y **gana la que responda última**, no la del destino actual. En el estudiante ocurre lo mismo al saltar entre mundos, ahí sí con `vigente` para retos pero **no para el estado del catálogo**. · **Impacto:** medio — contenido de un mundo pintado sobre otro; parpadeos. · **Frecuencia:** media-alta con red lenta, que es el escenario esperado. · **Repro:** en el docente, alternar secciones a un clic por segundo con la red limitada. · **Causa:** efectos de carga sin cancelación. · `src/pages/admin/dashboard.jsx:221-240`; `src/pages/estudiante/DashboardEstudiante.jsx:80-90`. · **Riesgo:** bajo / **S**.

### P2-13 · El XP local sube aunque el servidor no confirme nada
`completarReto()` llama a `sumarXP()` **antes** de saber si el `POST` funcionó. Con la red caída, el overlay dice correctamente «No pudimos confirmar tu XP», pero **la barra del Home ya subió** con XP que no existe en la BD, y se mantiene así hasta la siguiente lectura del servidor. · **Impacto:** medio — el niño ve dos verdades opuestas en dos pantallas. · **Frecuencia:** en cada fin de partida sin red. · **Repro:** terminar un juego con el backend detenido y volver al Inicio. · **Causa:** actualización optimista sin reversión. · `src/services/gamificationService.js:144-166`. · **Riesgo:** **Medio — el XP es área protegida (§9), exige spec** aunque el cambio sea de caché local. · **Esfuerzo:** S.

### P2-14 · Dos sistemas de notificación con estética distinta, a veces en la misma pantalla
`ToastHost` (arriba, con iconos ✅/❌, cierre y `aria-live`) convive con `LogroToast` (dorado, montado dentro de cada juego, 5 s fijos). Terminar una actividad puede mostrar los dos. · **Impacto:** medio — incoherencia visual justo en el momento de celebración. · **Frecuencia:** en cada fin de partida. · **Repro:** completar un juego y observar. · **Causa:** `LogroToast` es anterior a `ToastHost` y nunca se migró. · `src/components/dashboard/Toast.jsx`, `src/components/quiz/QuizInteractivo.jsx:156-174`. · **Riesgo:** medio (afecta a los 7 juegos) / **M**.

---

## 5. Hallazgos P3 — pulido

| # | Hallazgo | Archivos | Riesgo / Esfuerzo |
|---|---|---|---|
| **P3-1** | `TablaPro` dice «Ningún registro coincide con la búsqueda» **cuando simplemente no hay datos y nadie buscó nada**. Confunde «vacío» con «filtrado». | `DashboardWidgets.jsx:240-249` | Muy bajo / XS |
| **P3-2** | `formatearFecha` omite el año («3 jul»): una actividad del año pasado se ve idéntica a la de ayer en toda la app. | `DashboardWidgets.jsx:9-14` | Muy bajo / XS |
| **P3-3** | «Siguiente paso» dice *«Aún no hay material… súbelo en la pestaña Material»* y el botón lleva a **crear un quiz**. El texto y la acción se contradicen. | `dashboard.jsx:774-779` | Muy bajo / XS |
| **P3-4** | Dos caminos a la misma pantalla de materia aterrizan en pestañas distintas: desde el Inicio en *Crear actividad*, desde *Materias* en *Resumen*. | `dashboard.jsx:308-314, 693` | Muy bajo / XS |
| **P3-5** | Sobreviven **4 `window.confirm` nativos** en el camino del docente, pese a que SPEC-018 migró 18 diálogos a `ConfirmDialog`. Estética del sistema operativo dentro de la app. | `EditorClasificador.jsx:190, 291`, `GeneradorActividadIA.jsx:150`, `GeneradorMision.jsx:237` | Bajo / S |
| **P3-6** | **65 atributos `title`** portan información que no existe en táctil ni con teclado (p. ej. el significado del 🔥 de racha ya se corrigió; el resto no). | transversal | Bajo / M |
| **P3-7** | `style={{ pointerEvents: 'none' }}` en h1/h2 de seis pantallas impide **seleccionar y copiar los títulos**. Truco sin justificación en el código. | `DashboardEstudiante.jsx:457`, `dashboard.jsx:680, 930`, `PanelMisiones.jsx:112`, `SidebarLayout.jsx:130` | Muy bajo / XS |
| **P3-8** | En la Misión Narrativa, **volver a tocar la misma opción incorrecta no produce ningún cambio visible**: `setElegida` recibe el mismo valor. El niño cree que la app se colgó. | `MisionNarrativa.jsx:76-86` | Bajo / S |
| **P3-9** | `ResultadoOverlay` declara `aria-modal="true"` **sin focus trap** (a diferencia de `ModalPanel`, que sí lo tiene): con `Tab` se sale al contenido de detrás. | `ResultadoActividad.jsx:226-241` | Bajo / S |
| **P3-10** | La vista `pagina === 'banco'` **no es alcanzable** (su ítem de menú está comentado) pero se compila y viaja en el bundle. Decisión consciente, sin fecha de resolución. | `dashboard.jsx:474-481, 1098` | Bajo / XS |
| **P3-11** | Widget «Top estudiantes» sin datos: `<ol>` vacío bajo el encabezado, sin `EmptyState` (ver también P2-4). | `dashboard.jsx:81-89` | Muy bajo / XS |
| **P3-12** | Los formularios de login y registro usan `noValidate` y no marcan campos obligatorios: enviar vacío **gasta un viaje completo al servidor** para devolver «Faltan credenciales» — y consume cupo del limitador de P0-1. | `login.jsx:135, 210, 242` | Bajo / XS |
| **P3-13** | `role="status"` sobre textos **estáticos** que nunca cambian (la pista de la Línea del tiempo): ruido en lectores de pantalla al montar. | `LineaTiempo.jsx:219-221` | Muy bajo / XS |

---

## 6. Hallazgos P4 — deuda ya registrada, sin acción en este sprint

| # | Hallazgo | Situación |
|---|---|---|
| **P4-1** | **Nueve breakpoints distintos** (359/480/560/640/720/760/900/1024) repartidos en 6 CSS, mientras los tokens canónicos `--bp-mobile/-tablet/-desktop` de `index.css` **no los usa nadie**. | SPEC-020 Etapa 2-6, **suspendidas** por decisión de Fabrizio. Se retoma cuando él lo indique. |
| **P4-2** | Bundle único de **1,61 MB (456 kB gzip)** + `pdf.worker` de 1,3 MB y `xlsx` de 425 kB. Primera carga costosa en la red de la escuela. | **Explícitamente fuera del cierre de tesis** (`MASTER_PLAN.md`). No se toca. |
| **P4-3** | **29 problemas de lint** de línea base (26 errores `react-hooks/set-state-in-effect` + 3 warnings). Verificado hoy: sin regresiones. | Línea base aceptada por SPEC-020 §6. |
| **P4-4** | `QuickActionCard` y `.contenido-materia*` siguen siendo código muerto, y `CONTRIBUTING` §6.4 **sigue recomendando** `QuickActionCard` como componente reutilizable. | Ya registrado en SPEC-020 §5. Pendiente de decisión: usarlo o borrarlo **y corregir la regla**. |

---

## 7. Hoja de ruta propuesta

Cinco olas. **Cada ola es un bloque de commits independiente y ninguna empieza sin aprobación explícita de Fabrizio.** El orden no es por prioridad numérica: es por **dependencia y por riesgo de retrabajo**.

### Ola 0 — Habilitar la verificación *(pre-requisito, no corrige nada)*

Sin esto, cualquier corrección se cierra «según el código» y no «según el navegador».

1. Levantar el entorno local completo (MySQL portable 3308 + backend 3001 + datos semilla).
2. Pasada manual guiada por esta auditoría a **320 / 375 / 768 / 1280 px**, confirmando los hallazgos marcados **[a confirmar en dispositivo]**: P2-7, P2-10, P1-8.
3. Una pasada con lector de pantalla y otra **solo con teclado** por los 7 juegos, para medir P1-5 y P2-11 antes de tocarlos.

**Salida:** lista de hallazgos confirmados / descartados / nuevos. **Esfuerzo:** M.

### Ola 1 — Que se pueda entrar *(P0-1, P1-1, P1-2, P3-12)*

Va primera porque **es la única ola que puede impedir el uso del producto**, y las cuatro piezas se disparan en el mismo escenario: el primer día de clase.

- **Requiere spec previa** para P0-1 y para la parte de P1-2 que toque autenticación (**§9**).
- Orden interno: P0-1 → P1-1 → P1-2 → P3-12 (este último reduce presión sobre el limitador, así que va después de haberlo arreglado, no antes).
- **Puerta de salida:** prueba de carga desde una sola IP simulando 30 accesos y 10 activaciones consecutivas, sin ningún 429.

### Ola 2 — Que la app nunca afirme lo que no sabe *(P1-4, P1-7, P2-2, P2-3, P2-12, P1-3, P2-4, P3-1, P3-11)*

Una sola ola porque **todos son la misma causa raíz**: estados de carga/error/vacío incompletos y datos presentados fuera de su contexto. Corregirlos juntos permite extraer el patrón una vez y aplicarlo, en vez de parchear pantalla por pantalla — que es precisamente el error que produjo P1-1 y P1-4.

- Empezar por P1-4 y P1-7 (usuario final), luego P2-2/P2-3/P2-12 (docente), cerrar con P1-3 y P2-4 (contenido engañoso).
- **Puerta de salida:** recorrer las tres sesiones completas con el backend detenido. Ninguna pantalla debe afirmar «no hay» cuando la verdad es «no pude preguntar».

### Ola 3 — Que se pueda usar sin ratón y sin tocar dos veces *(P1-5, P1-8, P2-6, P2-9, P2-11, P2-10, P3-9, P3-13)*

Bloque de accesibilidad e interacción. Va tercera porque **es la más segura de todas**: casi ningún cambio es visible con ratón, ninguno toca lógica de negocio y ninguno entra en §9.

- P1-5 primero (afecta a los 7 reproductores y define dónde queda el foco), P2-11 justo después (mismo recorrido de archivos), luego el resto.
- **Puerta de salida:** completar un juego de cada tipo **solo con teclado**, sin perder el foco ni una vez.

### Ola 4 — Que se sienta un solo producto *(P2-1, P2-5, P2-8, P2-14, P2-13, P1-6, P3-2…P3-8, P3-10)*

Coherencia de identidad, patrones y microcopy. Va después de las olas de fondo para no pulir código que las anteriores van a mover.

- **Requiere spec previa** para P2-13 (XP, §9) y P1-6 (sesión, §9). Si Fabrizio prefiere no abrir spec, ambos tienen una mitigación sin §9 documentada en su ficha: aplicar esa y dejar constancia.
- P2-14 (unificar toasts) es el más caro de la ola: decidir explícitamente si entra o se aplaza.

### Ola 5 — Cierre y decisiones pendientes *(P0-2, P4-4)*

- **P0-2 va aquí, no al principio, y esto es deliberado.** Su versión completa es SPEC-001 (sub-rutas reales) y **no cabe en un sprint de QA**. Lo que entra aquí es solo la **mitigación**: `/` redirige si hay sesión, y una entrada de historial que enrute el botón Atrás por la guardia de salida que ya existe. Se deja al final porque toca navegación en los tres paneles y conviene hacerlo sobre un código ya estabilizado por las olas 1-4.
- **Decidir P4-4:** usar `QuickActionCard` o borrarlo, y en cualquier caso **corregir `CONTRIBUTING` §6.4**, que hoy recomienda un componente que nadie importa.
- Actualizar `CURRENT_STATE.md` y `MASTER_PLAN.md`.

### Criterio de «listo para producción»

GamificApp se declara RC cuando: **(1)** las olas 1, 2 y 3 están cerradas con sus puertas de salida superadas; **(2)** P0-2 tiene al menos su mitigación; **(3)** `npm run build` limpio y lint sin regresiones sobre la línea base de 29; **(4)** la sesión completa de los tres roles se recorre en móvil real sin encontrar ningún P0 ni P1 nuevo.

Las olas 4 y 5 **mejoran** el producto pero no bloquean el RC, salvo la mitigación de P0-2.

---

## 8. Nota de método

Ningún hallazgo de este documento se implementa sin aprobación explícita, ola por ola. Los que tocan **login/autenticación, XP, misiones, ranking o permisos** (`CONTRIBUTING` §9) requieren además una spec aprobada antes del primer commit, aunque el cambio parezca pequeño: son **P0-1, P1-2 (parcial), P1-6 y P2-13**.

---

## 9. Resultado de la Ola 0 — verificación en navegador (2026-07-31)

Cierra el límite declarado en §0: esta sección **ya no es lectura de código**. Entorno: MySQL portable `3308` + backend `3001` + frontend `5173`, base con datos reales (estudiante Nivel 8, 7037 XP, 11 insignias, 6 materias, los 7 juegos publicados).

**Las fichas de §2-§5 no se reescriben.** Lo que esta sección diga sobre un hallazgo prevalece sobre su ficha.

### 9.1 Confirmados con medición

| # | Evidencia obtenida |
|---|---|
| **P0-2** | Con **1/3 parejas resueltas** (guardia de salida armada), Atrás → `location.pathname === "/"`, `auth_token` **presente**, `[role="dialog"]` **ausente**, pantalla = formulario de login. Intento perdido sin aviso |
| **P1-5** | Al emparejar, ambas cartas pasan a `disabled` y `document.activeElement` → **`BODY`**. Medido en el reproductor, no deducido |
| **P2-11** | `.juego-dnd-avance` sin `aria-live` ni `role="status"`. La única región viva del documento es `.toast-host` |
| **P1-4** | Con `/api/misiones` fallando: *«Aún no hay misiones»* a una cuenta con **11 insignias**, sin acción de reintento y sin el bloque Nivel/XP/Racha |
| **P1-7** | Bloqueada **una sola** petición (`/api/materias/1/material`), la pestaña **Juegos** —cuyos retos sí llegaron— muestra *«No pudimos cargar esto»* |
| **P2-10** | Copy verificado en `JuegoDragAndDrop.jsx:115`. **Raíz añadida:** el comentario de `JuegoDragAndDrop.jsx:12` afirma que el DnD de HTML5 funciona en «pantallas táctiles modernas». Es falso, y es lo que justificó el orden de la frase |

### 9.2 Rectificaciones

**P2-7 — confirmado, pero la ficha describe mal la condición.** A 375×667 el mensaje **es visible** y además tiene `role="alert"`. Solo se rompe con el teclado en pantalla abierto: a 375×340, con el botón centrado en el viewport, el error queda a `top: -295` (**254 px por encima del borde**). *Corolario nuevo:* al aparecer, el error **empuja «Ingresar» bajo el pliegue** (de `top: 590` a `top: 650` en 667 px de alto).

**P1-8 — DESCARTADO. No se reproduce.** Prueba A/B, gesto de rueda real sobre `.preview-backdrop`, mismo punto:

| Estado | `main.contenido.scrollTop` |
|---|---|
| Modal abierto | **0** (el fondo no se mueve) |
| Modal cerrado | **151** (la rueda sí funciona) |

Causa de la discrepancia: `.preview-backdrop` y `.resultado-overlay` son `position: fixed`, lo que lleva la cadena de scroll **al documento**, y el documento es exactamente lo que `body { overflow: hidden }` sí bloquea. El bloqueo que la ficha daba por inerte resulta ser el efectivo. **Riesgo residual no medible aquí:** touch en iOS Safari, que encadena distinto. Se reclasifica a *verificar en iPad real*, fuera de la ola de accesibilidad.

**Sospecha propia descartada:** las cartas del Memorama llevan su cara en el DOM estando boca abajo, pero `aria-label="Carta boca abajo"` enmascara correctamente el nombre accesible. No hay fuga de respuestas.

### 9.3 Hallazgo nuevo

**P1-1-bis · El `<select>` de cursos vacío no dice absolutamente nada.** Verificado: `GET /api/auth/cursos-pendientes` → `200` con `[]`. Es dato vacío legítimo y aun así el niño ve un desplegable muerto, sin `EmptyState` ni explicación, en la primera pantalla del producto. Es la rama **«vacío»** de la misma causa raíz de P1-1, no la de error; se corrige en el mismo bloque. Riesgo muy bajo / XS.

### 9.4 Límite del arnés — afecta a la puerta de salida de la ola de accesibilidad

La automatización del navegador entrega eventos de teclado con `isTrusted: true` pero con **`code` vacío**, y Chrome exige un `code` válido para ejecutar la activación por defecto de un `<button>`. Consecuencia: **`Tab` navega, pero `Enter` no activa.** P1-5 se midió por la vía del ratón (idéntico mecanismo: control enfocado que pasa a `disabled`), pero la puerta *«completar un juego de cada tipo solo con teclado»* **no es ejecutable por automatización**: exige una pasada manual de Fabrizio en un navegador real.

### 9.5 Pendiente de la Ola 0

Pasada a **320 px** y **768 px**, y los 6 reproductores restantes. Por decisión de Fabrizio se verifican **dentro de su bloque**, cuando se toquen, en vez de bloquear el arranque del sprint.

---

## 10. Estado real de la corrección (revisión del 2026-08-01)

La cabecera decía «nada implementado» y llevaba tiempo siendo falsa: los bloques
B1 y B2 se implementaron en la rama `rc/spec-021`, **que ya está fusionada en
`main`** (`git branch --merged main` la lista, y `main` va 5 commits por
delante). Además, varios P3 se corrigieron sobre la marcha dentro de otros
bloques. Esta sección se levantó **leyendo el código**, no la bitácora.

### 10.1 Cerrados y verificados en el código

| Hallazgo | Dónde se comprobó |
|---|---|
| **P0-1** limitador por IP | Bloque B1 — solo los 401 consumen cupo |
| **P0-2** Atrás expulsa | Bloque B2 (mitigado) — `RutaDeAcceso` en `App.jsx` + `useCapasAtras` |
| **P3-1** vacío ≠ filtrado | `DashboardWidgets.jsx` — «Todavía no hay registros que mostrar» |
| **P3-2** fecha sin año | `DashboardWidgets.jsx` — `esOtroAno` añade el año solo cuando aporta |
| **P3-3** «Siguiente paso» contradictorio | `dashboard.jsx` — el botón lleva a *Subir material* |
| **P3-4** dos caminos, dos pestañas | Bloque B2 — ambos aterrizan en *Resumen* |
| **P3-5** 4 `window.confirm` nativos | Cero restos en `src/`; los 4 usan `ConfirmDialog` |
| **P3-7** `pointerEvents:'none'` en títulos | Cero ocurrencias en `src/` |
| **P3-8** misma opción incorrecta sin respuesta | `MisionNarrativa.jsx` — contador `intentosFallidos` |
| **P3-9** overlay sin focus trap | `ResultadoActividad.jsx` — `onTabulador` con el selector de `ModalPanel` |
| **P3-11** «Top estudiantes» engañoso | `dashboard.jsx` — ahora «Top de la institución» + `EmptyState` |
| **P3-12** formularios sin validación previa | Bloque B1 — validación en cliente conservando `noValidate` |

### 10.2 Abiertos, confirmados en el código

| Hallazgo | Evidencia |
|---|---|
| **P3-6** | **68** atributos `title` en `src/` (la auditoría contó 65: ha crecido) |
| **P3-10** | `pagina === 'banco'` **sigue sin ser alcanzable**: su ítem de menú continúa comentado (`dashboard.jsx:555`) y nadie hace `setPagina('banco')`, pero la vista y `BancoPreguntas.jsx` (441 líneas) se siguen compilando y viajando en el bundle |
| **P3-13** | `role="status"` sobre la pista estática de `LineaTiempo.jsx` |

El resto de hallazgos de las olas 2, 3 y 4 no se han revisado uno a uno en esta
pasada: **se dan por abiertos** salvo que su bloque diga lo contrario.

### 10.3 Regla que sale de esto

Esta desincronización costó una auditoría entera para descubrir que media
docena de puntos ya estaban resueltos. **Al cerrar un hallazgo dentro de un
bloque, se marca aquí en el mismo commit**, aunque el bloque no sea el suyo.
