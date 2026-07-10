# SPEC-005 — Catálogo Inteligente (Sprint Materias)

> Estado: aprobada por Fabrizio (el enunciado del sprint es el requerimiento).
> Fecha: 2026-07-09. No cambia la arquitectura: la perfecciona.

## Objetivo

Materias como fuente única de verdad totalmente configurable desde el panel
Administrador: identidad completa, orden institucional, estado Activa/Oculta,
materias protegidas y asignación inteligente a docentes. Todo se propaga a los
demás paneles vía la API existente (`materiasService`), sin listas duplicadas.

## 1. BD — migración `006-catalogo-inteligente.sql` (+reversa, idempotente en initDb)

Columnas nuevas en `materias`:

| Columna | Tipo | Uso |
|---|---|---|
| `orden` | INT UNSIGNED NOT NULL DEFAULT 0 | Orden institucional (backfill: `orden = id`) |
| `descripcion` | VARCHAR(200) NULL | Descripción corta |
| `banner_data` | MEDIUMTEXT NULL | Banner opcional (data URL); sin banner la UI genera uno con color+emoji |
| `competencias` | TEXT NULL | Texto libre (preparado para futuro) |
| `nivel` | VARCHAR(60) NULL | Nivel recomendado (opcional) |
| `protegida` | BOOLEAN NOT NULL DEFAULT FALSE | No puede eliminarse; solo ocultarse |

`activa` ya existe y equivale a **Activa/Oculta**: oculta no aparece a
docentes nuevos/estudiantes ni permite crear actividades, pero conserva retos,
material, ranking y progreso (comportamiento ya garantizado por SPEC-002/003).

## 2. API

- `GET /api/materias` y `GET /api/docente/mis-materias`: devuelven los campos
  nuevos y ordenan por `orden, id`. Igual las demás consultas que agrupan por
  materia (progreso, detalle de estudiante).
- `POST /api/admin/materias`: acepta identidad completa + `orden = MAX+1` +
  `asignar` (`'todos'` | `[docenteIds]` | ausente) para la asignación al crear.
- `PUT /api/admin/materias/:id`: edita todos los campos (incl. `protegida`).
- `PUT /api/admin/materias/orden`: body `{ ids: [...] }` → reasigna 1..n en
  transacción.
- `POST /api/admin/materias/:id/asignacion`: body `{ modo: 'agregar'|'quitar',
  docentes: 'todos' | [ids] }` → gestión masiva sin tocar el modelo de
  permisos (sigue siendo `docente_materia`).
- `DELETE /api/admin/materias/:id`: **409 si `protegida`** (solo puede
  ocultarse). La papelera no cambia.

## 3. UI (ModuloMaterias)

- Lista ordenada por `orden` con flechas subir/bajar (persisten al soltar).
- Tarjeta: banner (subido o autogenerado con color+emoji), estado
  Activa/Oculta, candado si es protegida, botón "Docentes" (asignación masiva).
- Form: nombre, emoji, color, descripción, competencias, nivel, banner
  (subida con reducción en canvas), estado, protegida.
- Al crear: opciones "Asignar a todos los docentes / Elegir docentes / No
  asignar todavía".
- Editar/ocultar una protegida muestra advertencia previa; eliminar se
  deshabilita.
- La identidad (color/emoji/descripcion) llega a los demás paneles por
  `materiasService` (sin cambios en ellos, salvo mostrar la descripción en el
  hero de materia del docente).

## 4. Fuera de alcance

Cambios al modelo de permisos, drag & drop de reorden (flechas bastan para el
MVP), uso de `competencias`/`nivel` en otras vistas (quedan preparados).

## 5. Verificación

Build limpio, navegación completa, responsive 375/1366/1600/1920, auditoría de
consistencia listando cada vista que consume materias, `CURRENT_STATE.md`.
Sin MySQL local: verificación con BD en el deploy (migraciones 002–006).
