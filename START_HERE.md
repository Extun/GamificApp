# START_HERE — Lectura obligatoria antes de modificar código

> Última actualización: 2026-07-07

Este archivo indica exactamente qué debe leer una IA (o desarrollador) nueva antes de tocar GamificApp. Leer **solo** lo que la tarea requiere; el objetivo es trabajar con el mínimo contexto posible.

## Lectura mínima (siempre, en este orden)

1. **`CLAUDE.md`** (raíz) — reglas permanentes de trabajo. Se carga automáticamente en Claude Code.
2. **`docs/architecture/PROJECT_CONTEXT.md`** — qué es GamificApp, stack, arquitectura y principios, en una lectura.
3. **`docs/architecture/CURRENT_STATE.md`** — estado real del MVP, qué está implementado, prioridades inmediatas.

Con esos 3 documentos ya se puede trabajar. No leer nada más salvo que la tarea lo pida:

## Lectura según la tarea

| Si la tarea toca… | Leer además |
|---|---|
| Roadmap / decidir qué sigue | `docs/architecture/MASTER_PLAN.md` |
| Experiencia del estudiante (rediseño en curso) | `docs/audit/Auditoria-UX-Estudiante-v1.md` y `docs/specifications/SPEC-001-Student-Shell-Plan.md` |
| Visión de producto / principios UX de fondo | `docs/architecture/VISION.md` |
| Detalle histórico de endpoints, BD o navegación vieja | `docs/archive/fundamentos/Inventario-Funcional-v1.md` (referencia profunda; puede estar desactualizada — el código manda) |

## Dónde está la verdad técnica

- **Rutas API**: `server/routes/` (auth, admin, docente, materias, materiales, retos, progreso, ranking, ia).
- **Esquema BD**: `database/gamificapp.sql` (dev) y `database/produccion_defaultdb.sql` (producción Aiven).
- **Servicios frontend**: `src/services/` (uno por dominio).
- **Componentes compartidos**: `src/components/dashboard/DashboardWidgets.jsx`, `src/components/archivos/`, etc.

Si un documento contradice al código, **el código es la fuente de verdad** — y hay que corregir el documento.

## docs/archive/

Todo lo que está en `docs/archive/` es histórico o plantillas nunca redactadas. **No leerlo para el trabajo diario**; solo consultarlo si se necesita el "por qué" de una decisión pasada.
