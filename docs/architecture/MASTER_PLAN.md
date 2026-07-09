# MASTER_PLAN

# Objetivo

Roadmap de GamificApp: fases, backlog priorizado, dependencias y riesgos. El estado detallado de cada módulo vive en `CURRENT_STATE.md`.

# Última actualización

2026-07-07 (consolidación documental)

# Responsable

Fabrizio Zurita (Extun)

## 1. Roadmap por fases

| Fase | Nombre | Alcance | Estado |
|------|--------|---------|--------|
| 0 | MVP funcional | Auth, roles, materias, material, 3 juegos, XP/ranking, IA, deploy | ✅ Hecho (en producción) |
| 1 | Fundamentos v2 | Auditoría de navegación, inventario funcional, blueprint (en `docs/archive/fundamentos/`) | ✅ Hecho |
| 2 | Dashboards reales | Reorganización de los 3 dashboards, componentes compartidos, cero datos ficticios | ✅ Hecho |
| 3 | DevOS documental | Sistema documental — **cerrado y simplificado** en la consolidación 2026-07-07 (START_HERE + 4 docs vivos) | ✅ Hecho |
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

1. Libro de Calificaciones (consume `GET /api/progreso/:id`, ya existente) — única sección que promete y no cumple.
2. Lógica de logros `racha-7`, `estrella-aula`, `explorador`.
3. UI de edición de docente (endpoint `PUT /api/admin/docentes/:id` ya existe).
4. Unificar fuente de materias (consumir `GET /api/materias` en vez de la constante).
5. Validador de configuración para retos tipo `quiz`.
6. Memoria de conversación en Asistente IA.

## 4. Dependencias

- Specs 2–5 dependen de SPEC-001 (el shell con rutas es la base).
- Libro de Calificaciones solo necesita datos ya existentes (`progreso_estudiante`); sin backend nuevo.
- Logro `racha-7` puede usar `actualizado_en`; `estrella-aula` requiere corte semanal (hoy no existe noción de semana en la BD — requiere spec de backend).
- Multi-institución requiere cambios de BD → spec propia obligatoria.

## 5. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Archivos base64 en MySQL (LONGTEXT) crecen sin límite | Lentitud/costos de BD | Post-tesis: mover a almacenamiento de objetos |
| Plan free de Render (cold start) | Latencia en primer uso | Keep-alive activo vía `/api/health` cada 14 min |
| Dependencia exclusiva de Gemini | Creación de contenido cae si Google falla | Reintentos multi-modelo ya implementados; fallback de proveedor post-tesis |
| Migración a rutas anidadas (SPEC-001) | Deep-links rotos con F5, regresión CSS cruzada, romper docente/admin | Riesgos §5 de SPEC-001: verificar rewrite SPA en Vercel, copiar clases CSS en el mismo commit, probar los 3 roles |
| Logros del catálogo que nunca se otorgan | Promesa rota al niño | Backlog #2 |

# Pendientes

- Aprobar SPEC-001 y arrancar su commit 1.
- Redactar Spec 2–5 a medida que se necesiten.
