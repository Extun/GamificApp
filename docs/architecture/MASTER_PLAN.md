# MASTER_PLAN

# Objetivo

Definir el roadmap completo de GamificApp v2: fases, sprint actual, backlog priorizado, estado de cada módulo, dependencias y riesgos.

# Estado

🟢 Completo — documento vivo, actualizar al cerrar cada sprint/RFC.

# Última actualización

2026-07-05 (RFC-005)

# Responsable

Fabrizio Zurita (Extun)

# Índice

1. Roadmap por fases
2. Sprint actual
3. Backlog priorizado
4. Estado de cada módulo
5. Prioridades
6. Dependencias
7. Riesgos

# Contenido

## 1. Roadmap por fases

| Fase | Nombre | Alcance | Estado |
|------|--------|---------|--------|
| 0 | MVP funcional | Auth, roles, materias, material, 3 juegos, XP/ranking, IA, deploy | ✅ Hecho |
| 1 | Fundamentos v2 | Auditoría (RFC-001), Inventario (RFC-002), Blueprint (RFC-003) | ✅ Hecho |
| 2 | Dashboards reales | Reorganización de los 3 dashboards, componentes compartidos, cero datos ficticios (RFC-004) | ✅ Hecho |
| 3 | DevOS | Infraestructura documental del repositorio (RFC-005) | 🟡 En curso |
| 4 | Navegación v2 | Implementar Blueprint: rutas anidadas de React Router, menús por 5 áreas, sidebar compartido, Perfil agrupado, IA contextual | ⚪ Pendiente (RFC-006 propuesto) |
| 5 | Módulos incompletos | Libro de Calificaciones real, lógica de los 3 logros faltantes, UI de edición de docente, vista de progreso detallado del estudiante | ⚪ Pendiente |
| 6 | UX y pulido | Breadcrumbs, formulario propio de cambio de PIN (sin `window.prompt`), visibilidad del modo emergencia, búsqueda | ⚪ Pendiente |
| 7 | Escalabilidad | Multi-institución, roles granulares, auditoría de acciones, almacenamiento de archivos fuera de la BD | ⚪ Futuro |

## 2. Sprint actual

**Sprint DevOS (RFC-005)** — crear `docs/` como sistema documental único. Sin cambios de código, funcionalidades, APIs ni BD. Cierre: cuando exista la estructura completa y PROJECT_CONTEXT/MASTER_PLAN/VISION/CLAUDE estén completos.

## 3. Backlog priorizado

| # | Ítem | Origen | Fase |
|---|------|--------|------|
| 1 | Rutas anidadas de React Router (URLs reflejables, back/forward) | RFC-001 P1 | 4 |
| 2 | Menús reorganizados en 5 áreas por rol | RFC-003 §4 | 4 |
| 3 | Sidebar compartido parametrizable por rol | RFC-003 §7 | 4 |
| 4 | Libro de Calificaciones (consume `GET /api/progreso/:id`, ya existente) | RFC-002 §10.2 | 5 |
| 5 | Lógica de logros `racha-7`, `estrella-aula`, `explorador` | RFC-002 §7.3 | 5 |
| 6 | UI de edición de docente (endpoint `PUT /api/admin/docentes/:id` ya existe) | RFC-002 §10.2 | 5 |
| 7 | Vista de progreso detallado por reto para el estudiante | RFC-002 §10.2 | 5 |
| 8 | Cambio de PIN con formulario propio | RFC-003 §8.7 | 6 |
| 9 | Acceso de emergencia más visible en login | RFC-003 §8.7 | 6 |
| 10 | Unificar fuente de materias (consumir `GET /api/materias` en vez de la constante) | RFC-002 §10.1 | 6 |
| 11 | Validador de configuración para retos tipo `quiz` | RFC-002 §10.7 | 6 |
| 12 | Memoria de conversación en Asistente IA | RFC-002 §8.5 | 7 |

## 4. Estado de cada módulo

| Módulo | Estado |
|--------|--------|
| Autenticación (login/registro/emergencia/PIN) | ✅ Completo |
| Gestión de docentes (admin) | 🟡 Parcial — falta UI de edición |
| Gestión de estudiantes (admin/docente) | ✅ Completo |
| Invitaciones | ✅ Completo |
| Material de estudio | ✅ Completo |
| Generador de Quiz (IA + editor) | ✅ Completo |
| Editor Clasificador | ✅ Completo |
| Generador de Misión (IA) | ✅ Completo |
| Reproductores (quiz/juego/misión) | ✅ Completo |
| XP / niveles / ranking | ✅ Completo |
| Logros | 🟡 Parcial — 2 de 5 con lógica real |
| Dashboards (3 roles) | ✅ Completo (RFC-004) |
| Libro de Calificaciones | 🔴 No implementado (placeholder) |
| Asistente IA | 🟡 Básico — sin memoria de conversación |
| Navegación por rutas | 🔴 No implementado (todo con `useState`) |
| DevOS documental | 🟡 En curso (RFC-005) |

## 5. Prioridades

1. **Alta**: Fase 4 (navegación v2) — desbloquea deep-linking y la estructura de menús del Blueprint.
2. **Alta**: Libro de Calificaciones — única sección visible que promete y no cumple.
3. **Media**: Logros faltantes y UI de edición de docente.
4. **Baja**: pulido UX y escalabilidad.

## 6. Dependencias

- Fase 4 depende del Blueprint (RFC-003) ya aprobado y de los componentes compartidos de RFC-004.
- Libro de Calificaciones depende solo de datos ya existentes (`progreso_estudiante`); no requiere backend nuevo.
- Logro `racha-7` requiere registrar fecha de última actividad (posible con `actualizado_en` existente); `estrella-aula` requiere corte semanal (hoy no existe noción de semana en la BD — puede requerir RFC de backend).
- Multi-institución (Fase 7) requiere cambios de BD → RFC propio obligatorio.

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Archivos base64 en MySQL (LONGTEXT) crecen sin límite | Lentitud/costos de BD | Fase 7: mover a almacenamiento de objetos |
| Plan free de Render (cold start) | Latencia en primer uso | Keep-alive ya activo vía `/api/health` cada 14 min |
| Dependencia exclusiva de Gemini | Creación de contenido cae si Google falla | Reintentos multi-modelo ya implementados; fallback de proveedor en backlog |
| Divergencia caché localStorage vs BD | XP mostrado desactualizado | El servidor siempre pisa la caché al leer; mantener esa regla |
| Constante de materias duplicada (frontend vs BD) | Desincronización si se agregan materias | Backlog #10 |
| Logros del catálogo que nunca se otorgan | Promesa rota al niño | Backlog #5 |

# Pendientes

- Marcar Fase 3 como ✅ al cerrar RFC-005.
- Redactar RFC-006 (Navegación v2) con alcance detallado.
