# CURRENT_STATE — Estado real del proyecto

# Última actualización

2026-07-09

# Responsable

Fabrizio Zurita (Extun)

## 1. Resumen

El **MVP está completo y en producción** (Vercel + Render + Aiven). Los tres roles funcionan de punta a punta. El trabajo actual es la **Épica 1: rediseño de la experiencia del estudiante**, cuya auditoría y primera spec ya existen pero **aún no se ha implementado nada** (el estudiante sigue usando el monolito `DashboardEstudiante.jsx`).

> **SPEC-002 Fase 1 — Centro de Administración Institucional (2026-07-09, implementada en código; migración a Aiven PENDIENTE):**
> - **Materias dinámicas:** catálogo en BD (`color`, `icono`, `activa`), CRUD admin (`/api/admin/materias`), módulo Materias en el panel admin. `src/constants/materias.js` **eliminado**; toda la app consume `src/services/materiasService.js` (caché memoria+localStorage, la API siempre pisa). Colores/emoji de los "mundos" de estudiante y docente vienen de la BD (style inline; las clases de tonos `-1..-5` se eliminaron del CSS).
> - **Cursos:** tabla `cursos` + `curso_id` en `estudiantes`/`invitaciones_estudiante` (el VARCHAR `curso` se conserva denormalizado), CRUD admin + `GET /api/cursos` para docentes, módulo Cursos, y el docente elige el curso de un `<select>` al generar invitaciones (ya no texto libre).
> - **Institución:** tabla singleton `institucion`, `GET /api/institucion` público + `PUT /api/admin/institucion`, módulo Institución (datos, logo con redimensionado en canvas y favicon autogenerado, colores con derivados, año lectivo, escala XP). `institucionService.iniciarInstitucion()` (main.jsx) inyecta colores en `:root` y aplica título/favicon; logo y nombre en Login y en los sidebars de los 3 paneles.
> - **TablaPro** (`DashboardWidgets`): búsqueda en cliente + paginación (10/25/50/100), aplicada a Estudiantes, Invitaciones (pendientes e historial) y Cursos.
> - **useAutoRefresh** (`src/hooks/`): polling 20 s en el panel admin, pausado con modal abierto y con la pestaña oculta.
> - Migraciones versionadas en `database/migraciones/002-admin-center.sql` (+ reversa). `initDb.js` las aplica de forma idempotente al arrancar. **Falta el paso 7 de la spec: backup de Aiven + aplicar migración + deploy.**
> - Editores (Quiz/Clasificador) con candado anti doble publicación (botón "Publicado" hasta editar algo).

> **Endurecimiento por auditoría externa (2026-07-09):** correcciones puntuales sin cambios de esquema ni de arquitectura: (1) un docente solo registra XP (`POST /api/progreso`) de estudiantes que él invitó (misma regla que resetear PIN); (2) los estudiantes ya no acceden a retos ni material de materias desactivadas por ID directo; (3) el DELETE de curso también rechaza cursos con invitaciones pendientes vigentes; (4) nombre + paralelo del curso se validan a máx. 19 caracteres en total (límite de las columnas VARCHAR(20) denormalizadas); (5) el PUT de cursos sincroniza catálogo y denormalizados en una transacción; (6) los textos institucionales hardcodeados en Home admin y Registro ahora usan `institucionService`; (7) ESLint con globals de Node para `server/` (lint: 38 → 15 errores; los 15 restantes son patrones de React documentados en MASTER_PLAN §3). Los hallazgos que requieren migración de BD quedaron en el backlog (MASTER_PLAN §3, ítems 7–14).

> **Módulo Administradores (2026-07-09, adelantado de la Fase 2 de SPEC-002; migración a Aiven PENDIENTE):**
> - Roles de admin: columnas `es_principal` y `activo` en `usuarios` (migración `003-administradores.sql` + reversa; `initDb.js` la aplica idempotente y garantiza que siempre exista ≥1 Principal activo, promoviendo al admin más antiguo si hace falta).
> - **Administrador Principal**: todo el sistema, incluida la institución y la gestión de administradores. **Administrador**: operación diaria (docentes, estudiantes, cursos, materias, invitaciones) sin institución ni administradores.
> - Backend: CRUD `/api/admin/administradores` + middleware `soloAdminPrincipal` (verifica rol contra la BD, no contra el token, para efecto inmediato; tolera la columna ausente pre-migración). `PUT /api/admin/institucion` ahora exige Principal. El login bloquea cuentas con `activo = FALSE` y la sesión incluye `es_principal`.
> - Invariantes en servidor: no se puede quitar el rol, desactivar ni eliminar al último Principal activo (409); nadie puede eliminarse a sí mismo.
> - Frontend: `ModuloAdministradores` (TablaPro + ModalPanel, chips de rol/estado, "(tú)" en la cuenta propia), entradas "Administradores" e "Institución" del sidebar visibles solo para el Principal (la UI oculta, el servidor protege).

> **SPEC-003 — Panel Admin Fase 2 (2026-07-09, sprint final del panel; migración a Aiven PENDIENTE):**
> - **Permisos por administrador:** columna `usuarios.permisos` (JSON, migración `004-admin-fase2.sql` + reversa, idempotente en `initDb.js`). 9 claves en 3 grupos (Gestión Académica: docentes/estudiantes/materias/cursos; Institucional: invitaciones/institucion; Seguridad: administradores/auditoria/papelera). El Principal SIEMPRE tiene todas; `permisos = NULL` ⇒ conjunto operativo (compatibilidad con admins previos). Middleware `conPermiso(clave)` verifica contra la BD en cada endpoint `/api/admin/*`; lo estructural (rol Principal, repartir permisos, tocar Principales) sigue exigiendo Principal. El login devuelve `permisos` y la UI (sidebar, stats, accesos del Inicio) solo oculta.
> - **Auditoría:** tabla `auditoria` (sin FK, nombre denormalizado) + `registrarAuditoria()` fire-and-forget (`server/lib/auditoria.js`). Instrumentado: docente (publicar/editar quiz-clasificador-misión, subir/eliminar material, generar invitaciones, resetear PIN), estudiante (login, registro, emergencia, cambio de PIN, completar retos/XP) y todas las escrituras del panel admin. `GET /api/admin/auditoria` (permiso `auditoria`) + `GET /api/admin/auditoria/reciente` (cualquier admin). Módulo Auditoría: 3 tarjetas (Docente/Estudiantes/Administradores) con TablaPro y modal "Más detalles" (campos ausentes = "No registrado"). La "Actividad reciente" del Inicio consume los últimos 5 eventos reales (se eliminó la lista calculada de altas).
> - **Papelera:** soft-delete (`eliminado_en`/`eliminado_por` en `usuarios`, `materias`, `cursos`). Los DELETE del panel marcan (nunca borran); login, listados, ranking y vistas de docente/estudiante filtran eliminados. Restaurar devuelve el estado exacto (409 amigable si un homónimo ocupa el UNIQUE); la eliminación definitiva (`DELETE /api/admin/papelera/:tipo/:id`) aplica las validaciones de integridad que antes tenían los DELETE directos. Módulo Papelera con pestañas (Todos/Docentes/Estudiantes/Cursos/Materias/Administradores), restaurar y purga con confirmación.
> - **Sidebar agrupado:** `SidebarLayout` acepta `grupo` por ítem (rótulo + separador); el admin queda en Inicio · Gestión Académica · Gestión Institucional · Seguridad. Docente y Estudiante no cambian. En móvil (≤760px) los rótulos se ocultan.
> - Verificado: build y lint limpios (mismos 15 errores React documentados en MASTER_PLAN §3), navegador en 375/768/1024/1366/1600/1920/2560 sin scroll horizontal y con footer siempre visible. **Sin MySQL local no se probó contra BD: la verificación end-to-end (permisos 403, restauración, registros de auditoría) queda para el deploy (paso 5 de SPEC-003).**

> **SPEC-004 — Rediseño del Panel Docente / Épica 3 (2026-07-09, implementada en código; migración 005 a Aiven PENDIENTE):**
> - **BD (migración `005-panel-docente.sql` + reversa, idempotente en `initDb.js`):** `retos.docente_id` (autoría, NULL en filas previas), `usuarios.foto_data` (foto de perfil) y tabla `retroalimentaciones` (observaciones privadas docente→estudiante).
> - **API nueva:** `GET /api/retos/gestion` (Biblioteca: todos los retos de sus materias con `veces_jugado`), `PATCH /api/retos/:id` (estado/descripcion/xp; archivar es soft y el estudiante solo ve `publicado`), `POST /api/retos/:id/duplicar` (copia en borrador); `GET /api/docente/resumen` (stats reales + cronología de auditoría del docente y SUS estudiantes), `GET /api/docente/estudiantes/:id/detalle`, CRUD de retroalimentaciones, `GET|PUT /api/docente/perfil` + `PUT /perfil/password` (exige la actual); `GET /api/ranking/completo` (docente/admin). `POST /api/retos` guarda `docente_id`. Todo con permisos en servidor (materia asignada / estudiante invitado por él).
> - **UI (src/pages/admin/dashboard.jsx + módulos en `src/pages/docente/`):** sidebar agrupado (Inicio · Enseñanza: Materias, Biblioteca · Mi aula: Mis Estudiantes, Ranking · Cuenta: Mi Perfil). Home = hero de bienvenida con datos del aula + StatCards (actividades/quizzes/misiones/clasificadores/materiales/XP/promedio) + acciones rápidas + Centro de Actividad (auditoría real). Vista de materia en pestañas píldora (Resumen · Crear actividad · Actividades · Material · Calificaciones) sin tocar generadores. `BibliotecaActividades` (buscar/filtrar/ordenar/duplicar/editar desc-XP/archivar/restaurar; nunca borra físico), `RankingCompleto` (posición/XP/nivel/insignias reales/última actividad, filtro por curso), `PerfilDocente` (identidad, stats, reconocimientos preparados vacíos, actividad propia; edita foto/nombre/contraseña), `FichaEstudiante` (modal desde Mis Estudiantes con retroalimentación). CSS nuevo en `src/pages/docente/docentePanel.css` con tokens existentes.
> - Insignias mostradas al docente = solo las 2 con regla real derivable de la BD (Primer Quiz, Maestro de la Materia); nada inventado.
> - Verificado: build y lint limpios (mismos errores React pre-existentes documentados en MASTER_PLAN §3), navegador en 375 y 1366 sin scroll horizontal y con estados vacíos correctos. **Sin MySQL local: la verificación end-to-end (endpoints nuevos, archivado, retroalimentación) queda para el deploy, junto con las migraciones 002–005 a Aiven.**
> - Spec: `docs/specifications/SPEC-004-Panel-Docente.md`.

> **Sidebar unificado (2026-07-09):** los tres paneles (Admin, Docente, Estudiante) usan el componente base `src/components/dashboard/SidebarLayout.jsx` (header con logo institucional + nombre, navegación `flex:1` con scroll propio, footer sticky con usuario y acciones siempre visible). El sidebar ocupa `100dvh`; el único scroll vertical del panel vive en `.contenido` (flex + sticky, sin `position: fixed`). En ≤760px pasa a barra superior con navegación horizontal. Estilos compartidos en `dashboard.css` (`.sidebar-header/.sidebar-nav/.sidebar-footer`, `.nav-item-activo` ahora global). Sin cambios de lógica, APIs ni BD.

> Polish Sprint (2026-07-07/08): identidad visual unificada en Login, Home y materias de ambos roles (tarjetas pastel por materia, héroes con gradiente, pestañas píldora, tablas con acentos de la paleta). Nombre institucional actualizado a **Unidad Educativa Fiscal Clemencia Coronel de Pincay** en toda la UI. Sin cambios de lógica, APIs ni BD.

## 2. Módulos implementados (verificado contra el código)

| Módulo | Estado |
|--------|--------|
| Autenticación (login nombre+PIN, registro, emergencia, rate limiting) | ✅ Completo — Login y Registro unificados (2026-07-09, sprint final): layout centrado compartido, tono institucional (sin "jugar" como acción), selector de dos perfiles (Estudiante/Docente); el admin entra por el formulario Docente y `DashboardPorRol` (App.jsx) abre el panel según el rol del JWT — sin login especial ni credenciales hardcodeadas. Nota fija de contraseña olvidada → administrador. Fondo con deriva lenta de burbujas y microanimaciones, todo con `prefers-reduced-motion` |
| Gestión de docentes (admin) | ✅ Completo — rediseño del panel admin (2026-07-09): formulario de alta como asistente en 2 pasos con materias como tarjetas pastel, lista de docentes con chips por materia y modal "Editar materias" que consume el `PUT /api/admin/docentes/:id` existente (agregar/quitar materias sin recrear al docente) |
| Gestión de estudiantes e invitaciones | ✅ Completo — rediseño (2026-07-09): tabla de estudiantes con avatares y chips de curso; Invitaciones dividida en "Pendientes" (pendiente/expirado, con eliminación previa confirmación vía nuevo `DELETE /api/admin/invitaciones/:id`, que rechaza códigos usados) e "Historial de utilizadas" (solo lectura, con fecha de uso = fecha de registro del estudiante, sin columna nueva en BD). Home del admin con hero institucional, accesos rápidos y ancho máximo 1100px centrado |
| Material de estudio (base64 en MySQL, preview PDF/docx) | ✅ Completo |
| Generador de Quiz (IA + editor) / Clasificador / Misión Narrativa (IA) | ✅ Completo (crear y jugar) |
| XP / niveles / ranking | ✅ Completo (transaccional, idempotente) |
| Logros | 🟡 Parcial — 2 de 5 con lógica real (`racha-7`, `estrella-aula`, `explorador` sin desbloqueo) |
| Dashboards de los 3 roles con datos 100% reales | ✅ Completo — Panel Docente rediseñado por completo (2026-07-09, SPEC-004): Home-dashboard con stats y Centro de Actividad, Biblioteca de Actividades, vista de materia en pestañas, Ranking completo, Mi Perfil y ficha rápida de estudiante con retroalimentación |
| Libro de Calificaciones | 🔴 Placeholder vacío |
| Asistente IA | ⚪ Retirado del menú (2026-07-08, Polish Sprint): la IA solo se usa dentro de los generadores de actividades. `asistenteIA.jsx` y la ruta `/api/ia/asistente` siguen existiendo pero sin entrada en la UI |
| Navegación | 🔴 3 rutas planas (`/`, `/registro`, `/dashboard`); todo lo interno con `useState`, sin sub-rutas |

## 3. Prioridad inmediata: Épica 1 — Rediseño de la experiencia del estudiante

Diagnóstico (auditoría 2026-07-06): el estudiante usa una versión recoloreada del panel del docente; hay que llevar el lenguaje de diseño de `MisionNarrativa` (pantalla completa, una decisión a la vez, visual antes que texto) a toda su experiencia.

Plan por specs (en `docs/specifications/`):

| Spec | Alcance | Estado |
|------|---------|--------|
| SPEC-001 | Student Shell: rutas anidadas, sin sidebar, nuevo Inicio, menú de avatar, modal de PIN | 🟡 Redactada, pendiente de aprobación. **Nada implementado.** |
| Spec 2 | Fusión de pestañas de materia (vista de materia rediseñada) | ⚪ Por redactar |
| Spec 3 | Motor único de retos | ⚪ Por redactar |
| Spec 4 | Login infantil (sin teclear nombre completo, PIN numérico visual) | ⚪ Por redactar |
| Spec 5 | Vitrina de premios (logros + ranking) | ⚪ Por redactar |

Insumos: `docs/audit/Auditoria-UX-Estudiante-v1.md` y `docs/specifications/SPEC-001-Student-Shell-Plan.md`.

## 4. Backlog secundario (antes de defensa de tesis, si hay tiempo)

1. Libro de Calificaciones real (consume `GET /api/progreso/:id`, ya existente).
2. Lógica de los 3 logros faltantes.
3. ~~UI de edición de docente~~ ✅ Hecho (2026-07-09, rediseño panel admin).
4. ~~Unificar fuente de materias~~ ✅ Hecho (2026-07-09, SPEC-002 Fase 1).

## 5. Trabajo post-tesis (no tocar ahora)

- Multi-institución. ~~Roles granulares y auditoría de acciones~~ ✅ Hecho (2026-07-09, SPEC-003).
- Mover archivos base64 de MySQL a almacenamiento de objetos.
- Fallback de proveedor de IA (hoy solo Gemini, con reintentos multi-modelo).
- Memoria de conversación en el Asistente IA.
- Validador de configuración para retos tipo `quiz`.

## 6. Riesgos operativos vigentes

- **Render plan free** (cold start): mitigado con keep-alive vía `/api/health` cada 14 min.
- **Archivos base64 en LONGTEXT** crecen sin límite: aceptado hasta post-tesis.
- **Caché localStorage vs BD**: el servidor siempre pisa la caché al leer; mantener esa regla.
