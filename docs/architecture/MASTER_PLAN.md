# MASTER_PLAN

# Objetivo

Roadmap de GamificApp: fases, backlog priorizado, dependencias y riesgos. El estado detallado de cada módulo vive en `CURRENT_STATE.md`.

# Última actualización

2026-07-19 (Backlog ampliado con los diferidos de la auditoría de actividades: ítems 20-23)

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
| 3.7 | Editor de actividades universal (SPEC-013) | Botón único "Agregar" con menú por acciones, lenguaje docente (sin "Banco"/"IA"/"manual"), toggles "Mezclar" del quiz, selección automática desde preguntas guardadas, autoguardado unificado, modal IA único | 🟡 Aprobada 2026-07-17 — diseño congelado, Fases 1-7 por implementar (Fase 8 shell post-tesis) |
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
13. Accesibilidad de modales: sin focus trap, cierre con Escape ni restauración de foco.
14. Rendimiento menor: `TablaPro` recibe `buscar`/`renderFila` inline (memo inútil); chunks grandes de Vite (`index` ~1.44 MB, `pdf.worker` ~1.29 MB) → code-splitting post-tesis.

### Diferidos de la auditoría de actividades (2026-07-19) — anotados, NO implementar sin decisión

20. **Sesiones/tokens de intento contra falsificación de resultados válidos.** El endurecimiento de `POST /api/progreso` cerró la manipulación trivial (crear retos, `xp_recompensa` arbitrario, `puntos_obtenidos` arbitrario, `total` incoherente), pero un usuario técnico puede seguir enviando un resultado **estructuralmente válido pero no jugado** (p. ej. `5/5` en un quiz que sí tiene 5 preguntas). Riesgo residual **aceptado explícitamente por Fabrizio** (2026-07-19) y documentado en SPEC-015. Cerrarlo exigiría que el servidor emita una sesión de intento firmada al iniciar la actividad y/o validar cada respuesta en backend — cambio de arquitectura mayor, fuera del alcance de la tesis.
21. **Decisión arquitectónica: acceso a actividades por `curso_id`.** Hoy `curso_id` **no** es frontera de acceso: `GET /api/retos` lista a cualquier estudiante las actividades publicadas de cualquier materia activa, sin filtrar por curso. `POST /api/progreso` replica deliberadamente ese criterio para que no exista nada visible que no sea enviable. Convertirlo en frontera real es una decisión de producto y debe cambiar **ambos endpoints a la vez** (si no, aparecerían actividades listadas pero rechazadas al enviarlas). Pendiente de decisión de Fabrizio.
22. **Posible duplicación de auditoría posterior al COMMIT.** En `POST /api/progreso`, `registrarAuditoria` se ejecuta **después** del commit y usa `pool` (no la conexión de la transacción). Un reintento de red del cliente podría generar dos entradas de auditoría para un mismo intento. No afecta XP, calificación ni progreso (la transacción es idempotente); es solo ruido en la bitácora. Pre-existente al cambio de 2026-07-19.
23. **Compatibilidad de notas históricas de Línea del tiempo.** El criterio de calificación pasó de posición absoluta (`n` posiciones) a concordancia de Kendall (`n(n-1)/2` pares). `GREATEST` garantiza que ningún estudiante pierda su mejor nota histórica, pero el Libro de Calificaciones mezcla dos criterios en actividades anteriores al cambio, así que las notas de esa actividad no son comparables entre sí. Pendiente: decidir si se menciona como limitación en la tesis, se recalcula o se deja como está.

### Diferidos de SPEC-006 (requieren migración propia)

15. Actividades **programadas** (fecha de publicación futura): no existe columna en BD.
16. Estadísticas por pregunta ("más fallada/acertada") y tiempo promedio: exigen `detalle_json` en `progreso_estudiante` + cambios en todos los reproductores.
17. El Libro de Calificaciones consulta el progreso estudiante por estudiante (N peticiones); con aulas grandes convendría un endpoint agregado por materia.

### Posibles extensiones del Banco de Preguntas (SPEC-010, anotadas 2026-07-16)

18. Banco para el **Clasificador**: analizado en SPEC-013 (2026-07-17) — la unidad viable es el **"grupo de clasificación" completo** (todas las categorías + elementos de una actividad como un solo ítem reutilizable, nunca categorías sueltas). Viable y coherente con el modelo snapshot+`_banco_id`, pero diferido a post-tesis por costo/beneficio.
19. "Banco de misiones" para **Misión Narrativa**: analizado y **descartado conscientemente** en SPEC-013 (2026-07-17) — reutilizar desafíos sueltos rompe la narrativa (su valor pedagógico central) y adaptarla con IA al insertar es costo desproporcionado. Si se retoma, el concepto correcto es reutilizar la historia COMPLETA vía duplicar/adaptar (`/api/ia/adaptar`), no ítems atómicos.

## 4. Dependencias entre items del backlog

- Specs 2–5 dependen de SPEC-001 (el shell con rutas es la base).
- Multi-institución requiere spec propia obligatoria (cambios de BD).
- Detalle técnico de cada dependencia: ver la spec correspondiente en `docs/specifications/`.

## 5. Riesgos (prioridad de mitigación)

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Archivos base64 en MySQL (LONGTEXT) crecen sin límite | Lentitud/costos de BD | Post-tesis: mover a almacenamiento de objetos |
| Plan free de Render (cold start) | Latencia en primer uso | Keep-alive activo vía `/api/health` cada 14 min |
| Dependencia exclusiva de Gemini | Creación de contenido cae si Google falla | Reintentos multi-modelo ya implementados; fallback de proveedor post-tesis |
| Migración a rutas anidadas (SPEC-001) | Deep-links rotos, regresión CSS, romper docente/admin | Ver §5 de SPEC-001 antes de implementar |
| Logros del catálogo que nunca se otorgan | Promesa rota al niño | Backlog §3, ítem 2 |

# Pendientes

- Aprobar SPEC-001 y arrancar su commit 1.
- Redactar Spec 2–5 a medida que se necesiten.
