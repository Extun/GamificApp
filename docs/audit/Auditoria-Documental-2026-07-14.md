# Auditoría documental — Sprint 0 (2026-07-14)

Alcance: revisión de TODA la documentación del repositorio (root + `docs/` recursivo). Sin tocar código, SQL, componentes ni APIs — solo Markdown.

## Fase 2 — Inventario y estado de cada archivo

| Archivo | Última act. | Vigencia | Contradice a | Obsoleto | Duplicado | Útil | Prioridad |
|---|---|---|---|---|---|---|---|
| `README.md` (root) | 2026-06-19 | ❌ | — | Sí (boilerplate Vite sin tocar) | No | No en su forma actual | Alta — reescribir |
| `START_HERE.md` (root) | 2026-07-08 | 🟡 | — | Parcial (referencias correctas, pero no explica cómo correr el proyecto) | No | Sí | Alta — ampliar (Fase 7) |
| `CLAUDE.md` (root) | 2026-07-08 | ✅ | — | No | Parcial con `PROJECT_CONTEXT.md` | Sí | Alta — consolidar (Fase 5) |
| `docs/architecture/PROJECT_CONTEXT.md` | 2026-07-07 | 🔴 | `CURRENT_STATE.md`, SPEC-002, SPEC-005 | Sí (nombre de institución viejo, "5 materias fijas") | No | Sí, una vez corregido | Alta — corregido en este sprint |
| `docs/architecture/CURRENT_STATE.md` | 2026-07-10 | ✅ | — | No | No | Sí, fuente de verdad de estado | Mantener |
| `docs/architecture/MASTER_PLAN.md` | 2026-07-09 | 🟡 | `CURRENT_STATE.md` (nota de migraciones pendientes) | Parcial | No | Sí | Media — corregido en este sprint |
| `docs/architecture/VISION.md` | 2026-07-05 | ✅ | — | No | No | Sí | Mantener |
| `docs/architecture/POLITICA-ELIMINACION.md` | 2026-07-09 | ✅ | — | No | No | Sí | Mantener |
| `docs/audit/Auditoria-Sincronizacion-Global-v1.md` | 2026-07-09 | ✅ (histórico resuelto) | — | No (es bitácora) | No | Sí, como registro | Mantener |
| `docs/audit/Auditoria-UX-Estudiante-v1.md` | 2026-07-09 | 🟡 | `CURRENT_STATE.md` (logros ya reemplazados por SPEC-007) | Parcial (sección de logros resuelta; resto sigue vigente como insumo de SPEC-001) | No | Sí | Mantener, anotar resolución parcial |
| `docs/specifications/SPEC-001` … `SPEC-009` (9 archivos) | 2026-07-06 a 2026-07-10 | ✅ | — | No | No | Sí | Mantener |
| `docs/archive/README.md` | 2026-07-09 | ✅ (es índice del archivo) | — | No | No | Sí | Mantener |
| `docs/archive/API_GUIDELINES.md`, `ARCHITECTURE.md`, `CHATGPT.md`, `CODING_STANDARDS.md`, `DATABASE.md`, `DESIGN_SYSTEM.md`, `GAMIFICATION_ENGINE.md`, `NAVIGATION.md` (8 plantillas) | 2026-07-05 | 🔴 | — | Sí (nunca redactadas, "🔴 Plantilla — pendiente de redacción") | Sí (contenido idéntico entre ellas) | No | Ya archivadas — sin acción |
| `docs/archive/CLAUDE-devos-v1.md` | 2026-07-05 | 🔴 | `CLAUDE.md` (root, reemplazo vigente) | Sí (proceso DevOS abandonado) | Sí | No para trabajo diario | Ya archivado — sin acción |
| `docs/archive/devos-process/RFC-README.md`, `DECISIONS-README.md`, `CHANGELOG-README.md` | 2026-07-05 | 🔴 | Proceso actual (specs + `CURRENT_STATE.md`) | Sí | No | No para trabajo diario | Ya archivados — sin acción |
| `docs/archive/fundamentos/Inventario-Funcional-v1.md` | 2026-07-05 | 🔴 | Estado actual de materias/módulos | Sí (pre-SPEC-002) | No | Solo como referencia histórica | Ya archivado — sin acción |
| `docs/archive/fundamentos/Auditoria-Navegacion-v2.md` | 2026-07-05 | 🟡 | — | No (la navegación plana descrita sigue siendo la real; SPEC-001 aún no se implementa) | No | Sí, como diagnóstico vigente | Ya archivado — sin acción |
| `docs/archive/fundamentos/Navigation-Blueprint-v2.md` | 2026-07-05 | 🔴 | Sidebars reales implementados (SPEC-002/003/004 usan otra agrupación) | Sí (plan no seguido) | No | Solo histórico | Ya archivado — sin acción |

Todos los archivos de `docs/archive/` ya estaban correctamente ubicados (Fase 8 no requiere mover nada adicional — ver conclusión más abajo).

## Fase 3 — Informe de contradicciones detectadas

| # | Tema | Documento desactualizado | Verdad vigente | Fuente de verdad | Acción tomada |
|---|---|---|---|---|---|
| 1 | Nombre de la institución | `PROJECT_CONTEXT.md`: "Unidad Educativa Benemérita Sociedad Filantrópica del Guayas" | "Unidad Educativa Fiscal Clemencia Coronel de Pincay" | `CURRENT_STATE.md` (Polish Sprint 2026-07-07/08), SPEC-002 | Corregido en `PROJECT_CONTEXT.md` |
| 2 | Modelo de materias | `PROJECT_CONTEXT.md`: "Hay 5 materias fijas" | Catálogo 100% dinámico en BD desde SPEC-002; `src/constants/materias.js` eliminado; SPEC-005 agregó más campos | SPEC-002, SPEC-005, `Auditoria-Sincronizacion-Global-v1.md` | Corregido en `PROJECT_CONTEXT.md` |
| 3 | Estado de migraciones en Aiven | `MASTER_PLAN.md` §1 (fila 3.5): "pendiente: backup Aiven + migraciones 002-004 + deploy" | Migraciones 002–009 confirmadas en producción | `CURRENT_STATE.md` ("Corrección post-auditoría", 2026-07-10) | Corregido en `MASTER_PLAN.md` |
| 4 | Sistema de logros/misiones | `Auditoria-UX-Estudiante-v1.md`: 3/5 logros sin lógica de desbloqueo, critica el ranking | Reemplazado por completo por SPEC-007 (misiones server-backed, 46 semillas) | SPEC-007, `CURRENT_STATE.md` | Se anota como resuelto (nota al pie en la auditoría); el resto del documento (rediseño de shell del estudiante) sigue vigente como insumo de SPEC-001 |
| 5 | Blueprint de navegación | `docs/archive/fundamentos/Navigation-Blueprint-v2.md` propone 5 áreas (Inicio/Contenido/Progreso/Comunidad/Perfil) | Los sidebars reales (SPEC-002/003/004) usan agrupaciones distintas por rol, nunca se siguió este blueprint | SPEC-003 §4, SPEC-004 §3 | Ya archivado; sin acción — se documenta aquí como nota histórica |
| 6 | Proceso de gobierno documental | `docs/archive/CLAUDE-devos-v1.md` + `devos-process/` exigían RFC/ADR/Changelog por cambio | Reemplazado por el proceso ligero (`CLAUDE.md` root + specs solo para cambios grandes) | `docs/archive/README.md`, `CLAUDE.md` | Ya archivado; sin acción |
| 7 | README raíz | Plantilla genérica de Vite, cero contenido del proyecto | — | — | Reescrito (Fase 6) |

## Fase 4 — Estructura documental propuesta (única fuente de verdad)

No se reorganizan carpetas (restricción del sprint). La jerarquía de lectura recomendada, ya diseñada para minimizar contexto de IA, se mantiene y se refuerza:

```
CLAUDE.md                              ← reglas de trabajo + resumen ejecutivo (siempre cargado por Claude Code)
START_HERE.md                          ← guía de arranque local + orden de lectura
README.md                               ← puerta de entrada para devs nuevos (setup, sin duplicar CLAUDE.md)
docs/architecture/
  PROJECT_CONTEXT.md                    ← qué es, stack, arquitectura (solo cambia si cambia el producto)
  CURRENT_STATE.md                      ← ÚNICA fuente de verdad del estado actual (changelog vivo)
  MASTER_PLAN.md                        ← roadmap y backlog priorizado
  VISION.md                             ← principios de producto, "qué nunca hacer"
  POLITICA-ELIMINACION.md               ← política de borrado/papelera
docs/specifications/SPEC-00N-*.md       ← una spec por cambio grande, inmutables una vez aprobadas
docs/audit/*.md                         ← auditorías puntuales (bitácora, no se reescriben)
docs/archive/                           ← histórico y plantillas abandonadas, NO leer para trabajo diario
```

Regla de una sola fuente de verdad por tipo de pregunta:
- **"¿Qué es GamificApp / qué stack usa?"** → `PROJECT_CONTEXT.md`
- **"¿Qué está implementado hoy?"** → `CURRENT_STATE.md`
- **"¿Qué sigue / qué falta?"** → `MASTER_PLAN.md`
- **"¿Cómo corro el proyecto?"** → `START_HERE.md`
- **"¿Por qué se decidió X?"** → la spec correspondiente en `docs/specifications/` o la auditoría en `docs/audit/`
- Si el código contradice cualquier documento, **el código manda** (regla ya existente, se mantiene).

## Fase 8 — Archivado

Revisado `docs/archive/` completo: todo lo que debía archivarse (plantillas DevOS vacías, proceso RFC/ADR/Changelog abandonado, inventario funcional pre-SPEC-002, blueprint de navegación no seguido) **ya estaba correctamente movido allí** desde la consolidación del 2026-07-07. No se encontraron documentos vigentes que debieran archivarse ni archivos obsoletos sueltos fuera de `docs/archive/`. No se movió ningún archivo en este sprint.

## Entregables de este sprint

1. Este informe (`docs/audit/Auditoria-Documental-2026-07-14.md`).
2. `docs/architecture/PROJECT_CONTEXT.md` corregido (nombre de institución, modelo de materias dinámico).
3. `docs/architecture/MASTER_PLAN.md` corregido (nota de migraciones ya desplegadas).
4. `CLAUDE.md` (root) reescrito y consolidado.
5. `README.md` (root) reescrito para desarrolladores nuevos.
6. `START_HERE.md` (root) ampliado con arranque local, variables de entorno y comandos.
7. Ningún archivo movido a `docs/archive/` (ya estaba correctamente organizado — ver Fase 8).

Sin cambios de código, SQL, componentes ni APIs en este sprint.
