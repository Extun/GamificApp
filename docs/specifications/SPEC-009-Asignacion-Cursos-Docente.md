# SPEC-009 — Asignación de cursos a docentes

> Estado: **Implementada** (2026-07-10). Migración 010 se aplica sola vía
> `initDb.js` al arrancar. Verificación: `npm run build` + `node --check`
> limpios; e2e pendiente (no hay MySQL local, igual que el resto del proyecto).
> Autor: solicitada por Fabrizio durante la auditoría pre-tesis.

## 1. Problema

Antes, los **cursos** eran un catálogo suelto: **cualquier docente podía elegir
cualquier curso** al generar invitaciones. No existía relación docente↔curso.
Lo correcto es que el **administrador** decida qué curso(s) maneja cada docente
(igual que ya hace con las materias vía `docente_materia`), y que el docente
solo pueda invitar estudiantes a *sus* cursos.

## 2. Decisiones (acordadas con Fabrizio)

- **Muchos-a-muchos** (como materias): un curso puede tener varios docentes y un
  docente varios cursos. Tabla `docente_curso`.
- **Empezar en limpio**: la migración NO precarga asignaciones. Los docentes
  existentes quedan sin cursos hasta que el admin se los asigne (no podrán
  generar invitaciones mientras tanto — comportamiento esperado).

## 3. Cambios

### BD — migración `010-docente-curso.sql` (+ reversa, idempotente en initDb.js)
- Tabla `docente_curso (id, docente_id, curso_id, creado_en)`, `UNIQUE
  (docente_id, curso_id)`, FKs a `usuarios`/`cursos` con `ON DELETE CASCADE`
  (purgar un curso o un docente limpia sus asignaciones sin filas huérfanas).

### Backend
- `GET /api/admin/docentes`: cada docente incluye ahora `cursos: [{id, etiqueta}]`.
- `POST /api/admin/docentes` y `PUT /api/admin/docentes/:id`: aceptan
  `curso_ids: []` (reemplazan las asignaciones en la misma transacción que las
  materias). Auditado.
- `GET /api/admin/cursos`: la columna "Docentes" pasa de contar *emisores de
  invitaciones* a contar *docentes asignados* (`docente_curso`).
- `GET /api/cursos` (docente): devuelve **solo los cursos activos asignados** al
  docente en sesión. Sin asignaciones → `[]`.
- `POST /api/docente/invitaciones`: exige `curso_id` (se eliminó el texto libre)
  y valida que el curso esté **asignado** al docente; si no, **403**. Es la
  defensa real en servidor (la UI solo oculta).
- `server/routes/adminReset.js` (SPEC-008): `docente_curso` añadida a las tablas
  que el RESET vacía.

### Frontend
- **Admin** (`AdminDashboard.jsx`): el asistente de alta de docente gana el paso
  3 "Cursos que gestionará" (`SelectorCursos`); la ficha del docente muestra sus
  cursos (`ChipsCursos`); el modal pasó de "Editar materias" a "Editar
  asignaciones" (materias + cursos). Textos del módulo Cursos actualizados.
- **Docente** (`dashboard.jsx`): el selector de curso al generar invitaciones ya
  solo lista sus cursos; sin cursos asignados muestra "Todavía no tienes cursos
  asignados. Pídele al administrador…" (en vez de un desplegable vacío).

## 4. Escenarios revisados

| Escenario | Resultado |
|---|---|
| Docente sin cursos asignados | No ve el formulario; mensaje explicativo; 403 si fuerza la API |
| Invitar a curso no asignado | 403 en servidor |
| Curso desactivado/eliminado | No aparece en el selector del docente (JOIN filtra activo/papelera) |
| Curso purgado / docente purgado | `docente_curso` se limpia por FK CASCADE |
| RESET de la app | Vacía también `docente_curso` |
| Admin ve invitaciones | Sin cambios (solo lectura, no genera) |

## 5. Riesgo

Los docentes ya existentes en producción **quedarán sin cursos** tras el deploy
(por "empezar en limpio") y no podrán generar invitaciones hasta que el admin
los asigne. Es el comportamiento acordado; conviene avisar al admin para que
haga la asignación tras el deploy.
