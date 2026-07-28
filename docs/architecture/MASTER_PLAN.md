# MASTER_PLAN

# Objetivo

Roadmap de GamificApp: fases, backlog priorizado, dependencias y riesgos. El estado detallado de cada módulo vive en `CURRENT_STATE.md`.

# Última actualización

2026-07-28 (**SPEC-018: Fases 1 a 7 CERRADAS y pusheadas; solo queda la Fase 8.** Verificado contra Git, no contra informes: F6.1 Administrador `cf5ef6e`, F6.2 Docente `ccb18b6`, F6.3 Estudiante `43185ac`; F7.A+7.1 Quiz/infraestructura `ac8d6b6`, F7.2 Clasificador `844ede7`, F7.3 Misión Narrativa `25ae1c8`, F7.4 Completar Espacios `07ef88f`, F7.5 Verdadero o Falso `f818ade`, F7.6 Memorama `85d452b`, F7.7 Línea del tiempo `83d9ad1`. Corregidas cinco notas históricas de `CURRENT_STATE.md` que declaraban «Sin commit» fases que Git demuestra commiteadas. **Fase 8 (auditoría visual y funcional final) pendiente**, con el triage de 21 hallazgos diferidos de Fases 6 y 7 como entrada — detalle completo en `CURRENT_STATE.md` y resumen accionable en §3 de este documento. Ningún hallazgo implementado.)

2026-07-20 (Entorno local Docker+MySQL validado y versionado; SPEC-018 —pulido integral UI/UX— redactada y aprobada como base oficial tras auditoría runtime de los 3 roles. Sin implementación iniciada.)

2026-07-19 (SPEC-016 y SPEC-017 implementadas: proveedores de IA agnosticos y arquitectura extensible de juegos con septimo juego de demostracion. Ambas pendientes de validacion en produccion)

# Responsable

Fabrizio Zurita (Extun)

## 1. Roadmap por fases

| Fase | Nombre | Alcance | Estado |
|------|--------|---------|--------|
| 0 | MVP funcional | Auth, roles, materias, material, 3 juegos, XP/ranking, IA, deploy | ✅ Hecho (en producción) |
| 1 | Fundamentos v2 | Auditoría de navegación, inventario funcional, blueprint (en `docs/archive/fundamentos/`) | ✅ Hecho |
| 2 | Dashboards reales | Reorganización de los 3 dashboards, componentes compartidos, cero datos ficticios | ✅ Hecho |
| 3 | DevOS documental | Sistema documental — **cerrado y simplificado** en la consolidación 2026-07-07 (START_HERE + 4 docs vivos) | ✅ Hecho |
| 3.5 | Centro de Administración (SPEC-002 + SPEC-003) | Materias/cursos/institución dinámicos, TablaPro, roles y permisos de admin, auditoría, papelera, sidebar agrupado | ✅ Hecho en código y **desplegado en Aiven** (migraciones 002-004 confirmadas en producción el 2026-07-10, ver `CURRENT_STATE.md`) |
| 3.6 | Centro de Trabajo Docente (SPEC-006) | 3 juegos nuevos (memorama, línea del tiempo, completar), IA genérica por registro, actividad sorpresa, adaptar con IA, Biblioteca IA con papelera/favoritas/estadísticas, Libro de Calificaciones editable | ✅ Hecho en código (2026-07-09) — **pendiente: migración 008 a Aiven + deploy + prueba end-to-end con BD** |
| 3.7 | Editor de actividades universal (SPEC-013) | Botón único "Agregar" con menú por acciones, lenguaje docente (sin "Banco"/"IA"/"manual"), toggles "Mezclar" del quiz, selección automática desde preguntas guardadas, autoguardado unificado, modal IA único | 🟡 **Parcial (estado verificado 2026-07-19): F1 ✅, F2 ✅, F3 ⚠️ parcial, F4-F7 ❌ pendientes.** La F8 queda absorbida por SPEC-017. Detalle por fase en `SPEC-013 §7` |
| 3.8 | Proveedores de IA (SPEC-016) | Arquitectura agnóstica al proveedor: adaptadores Gemini + OpenAI, selección de proveedor/modelo desde administración, "Probar conexión". API Keys solo en variables de entorno | 🟡 Redactada 2026-07-19 — **pendiente de aprobación**, ninguna fase iniciada. Responde a observación del revisor |
| 3.9 | Arquitectura extensible de juegos (SPEC-017) | Registro central de tipos de juego (backend + frontend), 3 estados (Activo / Solo jugar / Deshabilitado), módulo de administración, guía "Cómo añadir un juego" y séptimo juego de demostración | 🟡 **Implementada — pendiente de validación funcional en producción** (2026-07-19). Fases 1-7 en código, migración 014. Extensibilidad demostrada con Verdadero o Falso: 4 archivos propios, 4 líneas de registro, **0 módulos centrales con lógica del tipo y 0 cambios en los 6 juegos existentes** (`docs/COMO-AGREGAR-UN-JUEGO.md`). **NO cerrar** hasta validar en el despliegue |
| 3.10 | Pulido integral UI/UX (SPEC-018) | Design system completo (tokens semánticos, z-index, breakpoints), `ModalPanel` accesible, `ConfirmDialog`/`Toast`, sidebar móvil colapsable, pulido por rol y de los 7 juegos. Solo presentación; §10 y SPEC-013/016/017 congeladas | 🟡 **Fases 1-7 CERRADAS y pusheadas (2026-07-28), verificado contra Git.** F1 tokens/z-index/breakpoints, F2 ~60 hex → tokens, F3 `ModalPanel` accesible, F4 `ConfirmDialog`+`Toast`, F5 sidebar responsive, F6.1/6.2/6.3 pulido de los 3 paneles (`cf5ef6e`/`ccb18b6`/`43185ac`), F7.A-7.7 pulido de los 7 reproductores (`ac8d6b6`, `844ede7`, `25ae1c8`, `07ef88f`, `f818ade`, `85d452b`, `83d9ad1`). Cada fase verificada en el entorno local antes de su commit. **Falta solo la Fase 8** (auditoría visual y funcional final), que arranca con el triage de 21 diferidos de Fases 6 y 7 (§3, «Diferidos de SPEC-018 Fases 6 y 7») |
| Infra | Entorno local de desarrollo/QA (Docker + MySQL) | `docker-compose.dev.yml` + `seedDev.js` (triple barrera) + `initDb.js` real; los 3 roles y 7 juegos jugables en local. **No es SPEC** (infraestructura de dev) | 🟢 **Validado y versionado (2026-07-20).** `docs/DEV-ENTORNO-LOCAL.md` |
| 4 | **Épica 1: Experiencia del estudiante** | Rediseño completo del lado del niño en 5 specs (ver §2) | 🟡 En curso (auditoría y SPEC-001 redactadas; nada implementado) |
| 5 | Módulos incompletos | Libro de Calificaciones, 3 logros faltantes, UI de edición de docente | ⚪ Pendiente (antes de la defensa, si hay tiempo) |
| 6 | Post-tesis | Multi-institución, archivos fuera de la BD, fallback de IA, memoria del asistente | ⚪ Futuro |

## 2. Sprint actual — Épica 1

| Spec | Alcance | Estado |
|------|---------|--------|
| SPEC-001 | Student Shell: rutas anidadas, sin sidebar, nuevo Inicio, menú de avatar, modal de PIN | 🟡 Pendiente de aprobación |
| Spec 2 | Fusión de pestañas / vista de materia rediseñada | ⚪ Por redactar |
| Spec 3 | Motor único de retos | ⚪ Por redactar |
| Spec 4 | Login infantil (curso → estudiante → PIN numérico, sin teclear nombre) | ⚪ Por redactar |
| Spec 5 | Vitrina de premios (logros + ranking) | ⚪ Por redactar |

Insumos: `docs/audit/Auditoria-UX-Estudiante-v1.md`, `docs/specifications/SPEC-001-Student-Shell-Plan.md`.

## 3. Backlog priorizado (fuera de la Épica 1)

1. ~~Libro de Calificaciones~~ ✅ Hecho (2026-07-09, SPEC-006: detalle por intento, observación, revisado y ajuste manual de XP con auditoría).
2. Lógica de logros `racha-7`, `estrella-aula`, `explorador`.
3. UI de edición de docente (endpoint `PUT /api/admin/docentes/:id` ya existe).
4. Unificar fuente de materias (consumir `GET /api/materias` en vez de la constante).
5. Validador de configuración para retos tipo `quiz`.
6. Memoria de conversación en Asistente IA.

### Hallazgos de auditoría externa (2026-07-09) diferidos a post-sustentación

7. Material privado por docente: `materiales` no guarda `docente_id`, así que cualquier docente autenticado ve el material privado de cualquier materia. Requiere migración de BD (columna + backfill) → spec propia.
8. `POST /api/admin/materias` calcula `MAX(id)+1` sin bloqueo; con un solo admin real el riesgo es teórico. Ideal: AUTO_INCREMENT (migración).
9. El upsert de retos por `(materia_id, titulo)` no tiene índice único en BD; dos publicaciones simultáneas podrían duplicar. Requiere migración con deduplicación previa.
10. `useAutoRefresh` puede solapar peticiones si una tarda más que el intervalo (sin cancelación); riesgo bajo con los intervalos actuales.
11. Migraciones manuales 002 no idempotentes y `initDb` agrupa `color/icono/activa` bajo una sola comprobación de `color`; frágil ante migraciones parciales.
12. Lint: quedan 29 errores frontend (`react-hooks/set-state-in-effect`, `react-refresh/only-export-components`, algunos `no-empty`/`no-unused-vars` previos); corregirlos exige reestructurar componentes (los archivos nuevos de SPEC-006 repiten el patrón registro-de-constantes + componente).
13. ~~Accesibilidad de modales: sin focus trap, cierre con Escape ni restauración de foco.~~ ✅ Hecho (2026-07-20, SPEC-018 Fase 3: `ModalPanel` con foco inicial, focus trap, Escape, restauración y scroll-lock).
14. Rendimiento menor: `TablaPro` recibe `buscar`/`renderFila` inline (memo inútil); chunks grandes de Vite (`index` ~1.44 MB, `pdf.worker` ~1.29 MB) → code-splitting post-tesis.

### Diferidos de la auditoría de actividades (2026-07-19) — anotados, NO implementar sin decisión

20. **Sesiones/tokens de intento contra falsificación de resultados válidos.** El endurecimiento de `POST /api/progreso` cerró la manipulación trivial (crear retos, `xp_recompensa` arbitrario, `puntos_obtenidos` arbitrario, `total` incoherente), pero un usuario técnico puede seguir enviando un resultado **estructuralmente válido pero no jugado** (p. ej. `5/5` en un quiz que sí tiene 5 preguntas). Riesgo residual **aceptado explícitamente por Fabrizio** (2026-07-19) y documentado en SPEC-015. Cerrarlo exigiría que el servidor emita una sesión de intento firmada al iniciar la actividad y/o validar cada respuesta en backend — cambio de arquitectura mayor, fuera del alcance de la tesis.
21. **Decisión arquitectónica: acceso a actividades por `curso_id`.** Hoy `curso_id` **no** es frontera de acceso: `GET /api/retos` lista a cualquier estudiante las actividades publicadas de cualquier materia activa, sin filtrar por curso. `POST /api/progreso` replica deliberadamente ese criterio para que no exista nada visible que no sea enviable. Convertirlo en frontera real es una decisión de producto y debe cambiar **ambos endpoints a la vez** (si no, aparecerían actividades listadas pero rechazadas al enviarlas). Pendiente de decisión de Fabrizio.
22. **Posible duplicación de auditoría posterior al COMMIT.** En `POST /api/progreso`, `registrarAuditoria` se ejecuta **después** del commit y usa `pool` (no la conexión de la transacción). Un reintento de red del cliente podría generar dos entradas de auditoría para un mismo intento. No afecta XP, calificación ni progreso (la transacción es idempotente); es solo ruido en la bitácora. Pre-existente al cambio de 2026-07-19.
23. **Compatibilidad de notas históricas de Línea del tiempo.** El criterio de calificación pasó de posición absoluta (`n` posiciones) a concordancia de Kendall (`n(n-1)/2` pares). `GREATEST` garantiza que ningún estudiante pierda su mejor nota histórica, pero el Libro de Calificaciones mezcla dos criterios en actividades anteriores al cambio, así que las notas de esa actividad no son comparables entre sí. Pendiente: decidir si se menciona como limitación en la tesis, se recalcula o se deja como está.

### Diferidos de las specs del revisor (SPEC-016 / SPEC-017, anotados 2026-07-19)

24. **Fallback automático entre proveedores de IA.** Excluido de SPEC-016 por decisión de Fabrizio (2026-07-19) para acotar alcance. El contrato queda preparado: `clasificarError()` en cada adaptador y la columna `configuracion_ia.proveedor_respaldo`, que se **crea pero no se lee**. Incorporarlo después no requiere tocar los adaptadores.
25. **Mecanismo real de migraciones — documentado, no pendiente.** Ver §6 de este documento. Numeración resuelta por Fabrizio el 2026-07-19 (Opción B): SPEC-016 → `013`, SPEC-017 → `014`, sin archivo retroactivo para SPEC-015. Hueco consciente entre `012` y `013`.
27. **Evaluar un sistema formal de migraciones versionadas** (post-tesis, NO implementar ahora). Hoy la idempotencia se deriva del estado del esquema vía `faltaColumna()`, sin bitácora de migraciones aplicadas. Un sistema formal aportaría: tabla `migraciones_aplicadas` con marca de tiempo y checksum, ejecución de los `.sql` como artefactos reales en vez de reimplementarlos en JS, orden explícito y reversibilidad verificable. Motivo de diferirlo: el mecanismo actual **funciona y es idempotente**, y reescribirlo sería un refactor grande no pedido (regla §3) sobre la pieza más delicada del despliegue, a semanas de la sustentación.
26. ~~Séptimo juego de demostración~~ ✅ **Hecho (2026-07-19)**: Verdadero o Falso implementado solo con el contrato del registro. Evidencia medida en `docs/COMO-AGREGAR-UN-JUEGO.md` §Evidencia de extensibilidad. Pendiente de validación funcional en producción.

### Diferidos de SPEC-018 Fases 6 y 7 — triage 2026-07-28, entrada a Fase 8 — NO implementar sin decisión

Recopilación de TODO lo que las Fases 6.1-6.3 y 7.A-7.7 anotaron como diferido. Ninguno está implementado. Detalle y evidencia en `CURRENT_STATE.md` (entrada 2026-07-28 de cierre).

30. **[P0] Overlay de fin de partida muestra `0/100` pese a respuestas correctas.** Reproducido en las Fases 7.3, 7.4, 7.5, 7.6 y 7.7 (siempre con XP ya maximizado en la BD local). Vive en backend + componente compartido `ResultadoCierre`, área **§10 (XP/calificación) → requiere spec aprobada**. Lo primero de la Fase 8 debe ser distinguir si la calificación **persistida** (SPEC-015, Libro de Calificaciones del docente) también sale 0 —dato incorrecto para el docente— o si el fallo es solo de presentación; parte del síntoma observado en preview se debe al contador rAF congelado con la pestaña oculta, así que la comprobación debe hacerse con la pestaña visible y leyendo la BD.
31. **[P1] `SidebarLayout` no expone `aria-current`/`aria-selected`.** La sección activa se distingue solo por color. Componente compartido por **los 3 roles** → cambio transversal, exige regresión en Admin, Docente y Estudiante.
32. **[P1] Contraste del contenido bloqueado en Mis Premios.** `.mision-card.mision-bloqueada { opacity:.62 }` deja en ≈2.4:1 justamente el texto que explica cómo desbloquear la misión. Subir a ~0.75 es una decisión visual del panel.
33. **[P1] `--color-success` #16a34a global falla AA sobre blanco (3.30:1)** allí donde todavía se usa como color de texto. Ya corregido puntualmente en la Fase 7.4 (huecos correctos) y 6.3 (✓ de misión) con `--color-success-dark` #15803d (5.02:1); falta la decisión global.
34. **[P1] `.completar-btn-siguiente` sin `:focus-visible` temático.** Único hueco que queda tras las Fases 7.1-7.7 y 6.3. Es compartido por Completar Espacios **y** Verdadero o Falso → una sola fase transversal con regresión en ambos.
35. **[P1] Estados vacíos inconsistentes.** El Home del estudiante usa el componente `EmptyState`, pero las 4 pestañas de materia usan `<p class="vacio-msg">`; `.vacio-msg` es compartida con 6 reproductores y la Biblioteca del docente → unificar es transversal.
36. **[P1] Formalizar `--color-text-soft`/`--color-text-muted` como tokens globales.** Diferido explícitamente tanto en la Fase 6.1 como en la 6.2.
37. **[P2] `window.prompt` ×2 del cambio de PIN del estudiante.** Duplicado del ítem 29; su reemplazo correcto es el modal de PIN de SPEC-001 y toca autenticación (§10, requiere spec).
38. **[P2] Títulos duplicados H1/H3 en Mis Estudiantes y Ranking, y jerarquía de headings en Mi Perfil** (docente, diferido en 6.2).
39. **[P2] Faltan `aria-label` en los íconos del menú «Agregar preguntas»** (diferido en 6.2; área estabilizada por SPEC-013).
40. **[P2] Hex decorativos sueltos sin token:** ✕ `#ef4444` inline en la revisión de Completar Espacios y Verdadero o Falso, `#f0fdf4` en `.linea-evento.is-correcto`, y los violet/rose de las canastas del Clasificador (estos últimos son hex de identidad, decisión consciente de la Fase 2). Ninguno es fallo AA real: todos son decorativos y van acompañados de texto que sí cumple.
41. **[P2] `.home-mundos-grid` cae a 1 sola columna a 320px** (`minmax(150px,1fr)`): 6 mundos apilados ≈760px de scroll. A 375px ya son 2 columnas; se descartó tocarlo en 6.3 para no mover el layout de 480px.
42. **[P3] CSS muerto en los reproductores.** `.quiz-puntaje` en `quizInteractivo.css` (el marcador migró a `ResultadoOverlay`) y, en Línea del tiempo, `.linea-evento.is-correcto`, `.linea-evento-check`, `.linea-lista.is-sacudida` + `@keyframes linea-sacudida` (verificado leyendo `LineaTiempo.jsx`: el JSX nunca los aplica).
43. **[P3] CSS muerto en el panel del estudiante** (~70 líneas de `dashboardEstudiante.css`): `.home-mundo-2/-4` (los colores llegan inline desde `uiMateria(...).estilo`, SPEC-002), `.logros-grid` + `.logro-card/-icon/-badge/-bloqueado` (retirados por SPEC-011 al sustituir los logros de `localStorage` por Misiones; contienen los **2 únicos `!important`** del archivo) y `.rank-item-yo`.
44. **[P3] `LogroToast` vive dentro del reproductor del Quiz.** Se define en `src/components/quiz/QuizInteractivo.jsx` y `juegosComunes.jsx` solo lo importa y re-exporta (`:11` y `:171`), de modo que los 7 juegos dependen del Quiz para su toast de logro. Deuda de ubicación; mover el componente a `juegosComunes` es refactor, no pulido.
45. **[P3] Divergencia Quiz ↔ `useRecompensa`.** Clasificador, Completar, Memorama, Línea del tiempo, Verdadero o Falso y Misión Narrativa usan el hook compartido; `QuizInteractivo.jsx` **no lo usa** (0 ocurrencias) y mantiene su propio camino de recompensa. Unificarlo toca XP (§10) → requiere spec. Probable causa a investigar del ítem 30.
46. **[P3] `GET /api/progreso/:id` se dispara 4-6 veces al entrar al Home del estudiante** (StrictMode + dependencias `pagina`/`refrescar`). Ruido de red, sin impacto funcional ni de datos.
47. **[P3] Consolidar breakpoints históricos 560/720/900 y unificar las cabeceras de módulo compartidas** (diferido en 6.1).
48. **[P3] `style={{ pointerEvents: 'none' }}` en los `h1`/`p` de «Mis mundos» y «Mis premios»** — hack heredado sin causa documentada.
49. **[P3] `.mision-progreso` sigue siendo un nombre genérico en el panel de Premios.** Deuda de nomenclatura que queda tras el rename del reproductor a `.mision-capitulos` en la Fase 7.3; sin impacto (ya no hay colisión).
50. **[P3] `.memorama-carta-dorso` declara fallbacks hex divergentes del token real** (`var(--color-primary-soft, #e0f2fe)`). Inofensivo: los tokens existen, el fallback nunca se aplica.

### Diferidos de SPEC-018 Fase 4 (anotados 2026-07-20) — NO implementar sin decisión

27. **Inconsistencia mensaje ↔ regla de backend al eliminar cursos (hallazgo PREEXISTENTE, detectado probando Fase 4).** El texto de confirmación dice "Solo es posible si no tiene estudiantes", pero `DELETE /api/admin/cursos/:id` responde 200 (borrado suave a papelera, restaurable) aunque el curso tenga estudiantes **activados**; el 409 de SPEC-014 §13 solo cubre estudiantes **pendientes de activación**. No está decidido cuál comportamiento es el correcto (¿endurecer el backend o corregir el mensaje?): candidato a auditoría funcional. La Fase 4 conservó deliberadamente ambos tal cual.
28. **4 `window.confirm` no destructivos de editores siguen nativos** (`EditorClasificador` ×2, `GeneradorActividadIA`, `GeneradorMision` — avisan antes de sobrescribir contenido al generar con IA). Migrarlos a `ConfirmDialog` exige refactorizar el handler síncrono de generación a confirmación asíncrona en área estabilizada por SPEC-013; diferido.
29. **`window.prompt` ×2 del cambio de PIN del estudiante.** Su reemplazo correcto no es un confirm sino el **modal de PIN** ya previsto en SPEC-001 (Student Shell); los `window.alert` de ese flujo ya son toasts (Fase 4).

### Diferidos de SPEC-006 (requieren migración propia)

15. Actividades **programadas** (fecha de publicación futura): no existe columna en BD.
16. Estadísticas por pregunta ("más fallada/acertada") y tiempo promedio: exigen `detalle_json` en `progreso_estudiante` + cambios en todos los reproductores.
17. El Libro de Calificaciones consulta el progreso estudiante por estudiante (N peticiones); con aulas grandes convendría un endpoint agregado por materia.

### Posibles extensiones del Banco de Preguntas (SPEC-010, anotadas 2026-07-16)

18. Banco para el **Clasificador**: analizado en SPEC-013 (2026-07-17) — la unidad viable es el **"grupo de clasificación" completo** (todas las categorías + elementos de una actividad como un solo ítem reutilizable, nunca categorías sueltas). Viable y coherente con el modelo snapshot+`_banco_id`, pero diferido a post-tesis por costo/beneficio.
19. "Banco de misiones" para **Misión Narrativa**: analizado y **descartado conscientemente** en SPEC-013 (2026-07-17) — reutilizar desafíos sueltos rompe la narrativa (su valor pedagógico central) y adaptarla con IA al insertar es costo desproporcionado. Si se retoma, el concepto correcto es reutilizar la historia COMPLETA vía duplicar/adaptar (`/api/ia/adaptar`), no ítems atómicos.

## 4. Dependencias entre items del backlog

- Specs 2–5 dependen de SPEC-001 (el shell con rutas es la base).
- **SPEC-017 y SPEC-013 ya NO están acopladas** (revisado 2026-07-19). La dependencia anotada antes partía de suponer que SPEC-013 no estaba implementada; en realidad sus fases 1-2 sí lo están y `BarraAccionesEditor` ya unifica la botonera. La Fase 3 de SPEC-017 se reduce a centralizar los mapas paralelos de `GeneradorActividadIA`, sin tocar `BarraAccionesEditor` ni rehacer SPEC-013.
- **SPEC-016 y SPEC-017 son independientes entre sí** y pueden implementarse en cualquier orden. Recomendado: SPEC-016 primero (menor, contenida, sin colisión con nada congelado).
- Multi-institución requiere spec propia obligatoria (cambios de BD).
- Detalle técnico de cada dependencia: ver la spec correspondiente en `docs/specifications/`.

## 5. Riesgos (prioridad de mitigación)

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Archivos base64 en MySQL (LONGTEXT) crecen sin límite | Lentitud/costos de BD | Post-tesis: mover a almacenamiento de objetos |
| Plan free de Render (cold start) | Latencia en primer uso | Keep-alive activo vía `/api/health` cada 14 min |
| Dependencia exclusiva de Gemini | Creación de contenido cae si Google falla | Reintentos multi-modelo ya implementados; **SPEC-016 la elimina** (proveedor conmutable Gemini/OpenAI). Fallback automático diferido: backlog §3 ítem 24 |
| Migración a rutas anidadas (SPEC-001) | Deep-links rotos, regresión CSS, romper docente/admin | Ver §5 de SPEC-001 antes de implementar |
| Logros del catálogo que nunca se otorgan | Promesa rota al niño | Backlog §3, ítem 2 |

## 6. Cómo funcionan realmente las migraciones (auditado 2026-07-19)

**Regla operativa:** los archivos de `database/migraciones/*.sql` son **referencia y versionado documental**. Las migraciones automáticas que se ejecutan en producción son **funciones idempotentes de `server/initDb.js`**.

Secuencia real en cada arranque del servidor (`inicializarEsquema()`, `initDb.js:17-59`):

1. Se abre una conexión de un solo uso con `multipleStatements` (el pool normal NO lo habilita, por defensa contra inyección).
2. Se ejecuta `database/produccion_defaultdb.sql` completo — idempotente (`CREATE TABLE IF NOT EXISTS` + upserts).
3. Se ejecutan en orden las funciones `migrarXxx(conn)` encadenadas en `initDb.js:36-52`, desde `migrarColumnasMaterias` hasta `migrarCalificacionAcademica`. Cada una se protege con `faltaColumna()` contra `information_schema` (MySQL 8 no soporta `ADD COLUMN IF NOT EXISTS`).
4. Se garantizan los invariantes de admin (`asegurarAdmin`, `asegurarAdminPrincipal`).

Consecuencias que hay que tener presentes al implementar una migración nueva:

- **El `.sql` por sí solo no hace nada.** Escribir el archivo y no añadir la función JS equivalente significa que la migración **nunca se aplica**. Este es el error más fácil de cometer en este repositorio.
- **No existe tabla de registro de migraciones aplicadas.** La idempotencia se deriva del estado del esquema, no de una bitácora.
- SPEC-015 está implementada solo como función (`migrarCalificacionAcademica`), sin archivo `.sql`. Es deliberado (decisión del 2026-07-19), no un olvido.
- Numeración actual: archivos hasta `012`; **`013` reservado a SPEC-016 y `014` a SPEC-017**.

Evolucionar esto a un sistema formal de migraciones versionadas está en §3 ítem 27, diferido a post-tesis.

# Pendientes

- **Validar SPEC-016 y SPEC-017 en producción** antes de darlas por cerradas (checklists en `SPEC-016 §16` y en el informe de cierre de SPEC-017).
- Aprobar SPEC-001 y arrancar su commit 1.
- Redactar Spec 2–5 a medida que se necesiten.
