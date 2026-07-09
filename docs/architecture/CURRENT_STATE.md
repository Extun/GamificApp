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
| Dashboards de los 3 roles con datos 100% reales | ✅ Completo — Home del docente rediseñado (2026-07-07, Polish Sprint): misma identidad visual que el Home del estudiante (hero "Crear una actividad", materias pastel, tarjeta "Mi aula") y vista de materia rediseñada (2026-07-08: cabecera pastel, selector de tipo de actividad como tarjetas, Libro de Calificaciones como acceso separado), sin cambios de lógica ni APIs |
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

- Multi-institución, roles granulares, auditoría de acciones.
- Mover archivos base64 de MySQL a almacenamiento de objetos.
- Fallback de proveedor de IA (hoy solo Gemini, con reintentos multi-modelo).
- Memoria de conversación en el Asistente IA.
- Validador de configuración para retos tipo `quiz`.

## 6. Riesgos operativos vigentes

- **Render plan free** (cold start): mitigado con keep-alive vía `/api/health` cada 14 min.
- **Archivos base64 en LONGTEXT** crecen sin límite: aceptado hasta post-tesis.
- **Caché localStorage vs BD**: el servidor siempre pisa la caché al leer; mantener esa regla.
