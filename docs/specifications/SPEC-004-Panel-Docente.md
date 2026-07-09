# SPEC-004 — Rediseño del Panel Docente (Épica 3)

> Estado: aprobada por Fabrizio (el enunciado de la Épica 3 es el requerimiento; esta spec lo aterriza).
> Fecha: 2026-07-09

## Objetivo

Convertir el panel docente en un centro de gestión del aprendizaje, con la misma
identidad visual del panel de Administración (hero, `StatCard`, `SectionCard`,
`TablaPro`, `ModalPanel`, sidebar agrupado). Sin romper login, admin,
estudiante, materias, invitaciones, cursos, IA ni BD existente.

## 1. Cambios de base de datos (migración 005, aditiva e idempotente)

- `retos.docente_id INT UNSIGNED NULL` + FK a `usuarios` (`ON DELETE SET NULL`).
  Autoría de actividades de aquí en adelante; las filas previas quedan `NULL`
  (la Biblioteca filtra por materias asignadas, igual que el resto del panel).
- `usuarios.foto_data MEDIUMTEXT NULL` — foto de perfil del docente (data URL,
  mismo patrón base64 que `institucion.logo_data`).
- Tabla `retroalimentaciones`: observaciones privadas del docente sobre un
  estudiante. `id, docente_id (FK usuarios), estudiante_id (FK estudiantes),
  mensaje VARCHAR(400), creado_en`. No son comentarios públicos.

Se aplica en `server/initDb.js` (patrón `faltaColumna`) y se versiona en
`database/migraciones/005-panel-docente.sql` (+ reversa). Los scripts
`gamificapp.sql` y `produccion_defaultdb.sql` incorporan la forma final.

## 2. API nueva (permisos SIEMPRE en servidor)

En `server/routes/retos.js`:
- `GET /api/retos/gestion` (docente/admin): TODOS los retos de sus materias
  asignadas (cualquier estado) + `veces_jugado` (COUNT de progreso).
- `PATCH /api/retos/:id` (docente/admin, materia asignada): cambia `estado`
  (`publicado|archivado|borrador`), `descripcion` y/o `xp_recompensa`.
  Archivar = soft; el estudiante solo ve `publicado` (ya garantizado).
- `POST /api/retos/:id/duplicar`: copia con título "… (copia N)", estado
  `borrador`, `docente_id` del que duplica.
- `POST /api/retos` ahora guarda `docente_id = req.user.id` al crear.

En `server/routes/docente.js`:
- `GET /api/docente/resumen`: conteos reales (retos por tipo, materiales,
  estudiantes, XP entregada, promedio, completados últimos 7 días) + cronología
  (últimos eventos de `auditoria` del docente y de SUS estudiantes).
- `GET /api/docente/estudiantes/:usuarioId/detalle`: ficha del estudiante
  (datos, XP, últimas actividades desde `progreso_estudiante`, insignias
  derivadas de reglas reales, retroalimentaciones).
- `GET|POST|DELETE /api/docente/estudiantes/:usuarioId/retroalimentaciones`:
  observaciones del docente (solo sobre estudiantes que él invitó).
- `GET /api/docente/perfil` / `PUT /api/docente/perfil`
  (nombre visible y foto) / `PUT /api/docente/perfil/password`
  (exige contraseña actual, bcrypt, mínimo 8).

En `server/routes/ranking.js`:
- `GET /api/ranking/completo` (docente/admin): todos los estudiantes activos
  con posición, curso, XP, retos completados, resultados perfectos y última
  actividad (`MAX(progreso.actualizado_en)`).

Insignias mostradas al docente = únicamente las 2 con lógica real derivable en
servidor: "Primer Quiz" (≥1 reto completado) y "Maestro de la Materia"
(≥1 resultado 100%). Las demás del catálogo no se muestran como obtenidas
(prohibido el dato ficticio).

## 3. UI (src/pages/admin/dashboard.jsx + módulos nuevos en src/pages/docente/)

Sidebar: Inicio · Materias · Biblioteca · Mis Estudiantes · Ranking · Mi Perfil.

1. **Home**: hero de bienvenida (nombre, materias, estudiantes, completados de
   la semana) + fila de `StatCard` (actividades, quizzes, misiones, juegos,
   materiales, XP entregada, promedio) + accesos rápidos (Crear Quiz, Crear
   Misión, Subir Material, Ver Ranking, Generar Invitaciones) + Centro de
   Actividad (cronología real del endpoint `resumen`).
2. **Biblioteca** (`BibliotecaActividades.jsx`): todas las actividades de sus
   materias con búsqueda, filtros por tipo/estado/materia, orden, y acciones
   duplicar / editar (descripción y XP) / archivar / restaurar. Nunca borra
   físicamente; lo archivado no aparece al estudiante.
3. **Vista de materia**: hero pastel + pestañas píldora (Resumen · Crear
   actividad · Actividades · Material · Ranking/Calificaciones). Mismo
   contenido actual reorganizado, sin cambiar generadores ni APIs de publicación.
4. **Ranking** (`RankingCompleto.jsx`): botón "Ver ranking completo" y sección
   propia con `TablaPro` (buscar, ordenar por columnas, filtrar por curso).
5. **Mi Perfil** (`PerfilDocente.jsx`): identidad (foto, nombre, usuario,
   institución, materias, fecha de alta), estadísticas reales, reconocimientos
   (sección preparada; sin reglas nuevas → EmptyState), actividad reciente
   propia, y edición de foto / nombre visible / contraseña.
6. **Ficha de estudiante** (`FichaEstudiante.jsx`): ModalPanel desde "Mis
   Estudiantes" sin abandonar la página: curso, nivel, XP, insignias reales,
   últimas actividades, progreso y retroalimentación del docente (crear/borrar).

CSS: `docentePanel.css` nuevo con tokens existentes; se reutilizan las clases
del panel admin. Responsive obligatorio: 375 / 768 / 1366 / 1600 / 1920.

## 4. Fuera de alcance

- Comentarios públicos, nuevas reglas de logros, tracking de "materiales
  vistos" (no existe el dato), sub-rutas de React Router (se mantiene el
  patrón `useState` actual del panel), cambios al panel del estudiante.

## 5. Verificación

`npm run build` limpio, navegación completa de los 3 roles en navegador,
responsive en los anchos listados, actualizar `CURRENT_STATE.md`.
Sin MySQL local: la verificación con BD queda para el deploy (como SPEC-003).
