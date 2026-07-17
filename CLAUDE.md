# CLAUDE.md — Reglas permanentes de GamificApp

Este es el único documento que hace falta leer antes de trabajar. Amplía la lectura solo si la tarea lo pide (ver §8/§9).

## 1. Descripción del proyecto

**GamificApp**: plataforma web de gamificación educativa para niños de **6–9 años** (educación básica elemental). Proyecto de tesis para la Unidad Educativa Fiscal Clemencia Coronel de Pincay (Guayaquil, Ecuador), con escuela real como usuario final.

Roles: **Administrador** (Principal y Administrador — gestiona docentes, estudiantes, materias, cursos, institución, permisos y auditoría), **Docente** (crea contenido educativo con o sin IA, gestiona su aula, revisa progreso), **Estudiante** (aprende jugando; XP, niveles, racha y misiones; login por nombre + PIN de 6 caracteres o código de emergencia).

## 2. Stack tecnológico

| Capa | Stack |
|------|-------|
| Frontend | React 19 + Vite, React Router, MUI (iconos/algunos componentes), CSS plano con tokens de tema |
| Backend | Node.js + Express (`server/`), JWT, bcryptjs, mysql2 |
| Base de datos | MySQL — dev `gamificapp`, producción Aiven `defaultdb`; esquema en `database/*.sql`, migraciones idempotentes vía `server/initDb.js` |
| IA | `@google/genai` (Gemini), solo server-side, endpoints `/api/ia/*` |
| Archivos | `pdfjs-dist` (preview PDF), `mammoth` (texto .docx); archivos como base64 en MySQL |
| Deploy | Vercel (frontend) + Render (backend) + Aiven (MySQL) |

## 3. Arquitectura general

- SPA con 3 rutas planas: `/`, `/registro`, `/dashboard` (navegación interna con `useState`, no sub-rutas — deuda conocida, ver SPEC-001).
- Backend REST en `server/routes/` (auth, admin, docente, materias, materiales, retos, progreso, ranking, ia).
- **Retos polimórficos**: la tabla `retos` guarda cualquier mecánica en `configuracion_json` con un `tipo` slug libre; añadir un juego nuevo no requiere migrar la BD.
- **Materias son un catálogo 100% dinámico en BD** (no hay lista fija en el código; `src/services/materiasService.js`).
- Estructura de carpetas: `src/` (frontend: componentes, páginas por rol, services/, hooks/), `server/` (backend Express: routes/, lib/, middleware/, scripts/), `database/` (esquema SQL + migraciones), `docs/` (documentación).
- Toda generación de contenido con IA pasa por `server/lib/iaCliente.js` (cliente Gemini + reintentos) y `server/lib/actividadesIA.js` (registro por tipo de juego). La API key de Gemini vive **solo** en el servidor.
- XP transaccional e idempotente: `POST /api/progreso` con `FOR UPDATE`, nunca duplica XP en reintentos.
- Detalle completo (principios de arquitectura y UX, filosofía de gamificación "siempre se termina ganando"): `docs/architecture/PROJECT_CONTEXT.md` y `docs/architecture/VISION.md`.

## 4. Roles del sistema

Ver §1. El Administrador Principal es el único que ve institución/administradores; el resto de permisos son configurables por administrador. Los permisos se validan **siempre en el servidor**; la UI solo oculta, nunca protege.

## 5. Módulos implementados

MVP completo y en producción: auth, 3 roles, materias/cursos/institución dinámicos, 6 juegos (Quiz, Clasificador, Misión Narrativa, Memorama, Línea del tiempo, Completar espacios) generables con IA, XP/ranking/misiones, papelera, auditoría, permisos, sistema RESET.

Pendiente: Épica 1 (rediseño del shell del estudiante, SPEC-001 en adelante) — nada implementado aún.

Estado módulo por módulo, prioridad actual y bitácora de cambios: **`docs/architecture/CURRENT_STATE.md`** (fuente de verdad, se actualiza en cada cambio relevante).

## 6. Reglas obligatorias

1. **MVP First.** Tesis con fecha límite: la solución más simple que funcione gana. Nada de sobre-ingeniería ni features no pedidas.
2. **Cambios pequeños e incrementales.** Cada cambio debe dejar la app funcional y verificable (`npm run build` + probar en navegador). Dividir trabajo grande en pasos que compilen.
3. **No refactors grandes.** Nunca reescribir módulos enteros ni reorganizar carpetas por iniciativa propia. Las mejoras detectadas se ANOTAN en `MASTER_PLAN.md` (backlog), no se implementan.
4. **Reutilizar antes de crear.** Componentes existentes primero: `DashboardWidgets` (DashboardHeader, StatCard, SectionCard, EmptyState, QuickActionCard), `ArchivoChip`/`FilePreviewModal`, `LogroToast`, `QuizInteractivo`, `MisionNarrativa`. Servicios en `src/services/`, uno por dominio.
5. **Responsive obligatorio.** Todo cambio de UI debe funcionar en móvil/tablet (los niños usan dispositivos compartidos de la escuela). Verificar resoluciones pequeñas antes de dar por terminado.
6. **Cambios grandes requieren spec aprobada.** Rediseños, cambios de backend/BD/APIs o de arquitectura necesitan un documento en `docs/specifications/` aprobado por Fabrizio antes del primer commit. Bugs y ajustes pequeños se hacen directo.
7. **No depender del historial del chat.** Lo que importa se escribe en `docs/`. Al cerrar trabajo relevante, actualizar `docs/architecture/CURRENT_STATE.md` (y `MASTER_PLAN.md` si cambia el roadmap).
8. **Commits:** mensajes en español, nunca mencionan Claude, IA ni herramientas de IA.
9. CSS plano con tokens de tema (`--color-*`, `--radius-*`, `--shadow-*`); no introducir librerías de estilos nuevas.
10. Comentarios y UI en español. Texto visible para estudiantes comprensible por un niño de 6 años.
11. `localStorage` es caché, nunca fuente de verdad; toda lista se refresca desde la API tras escribir.
12. No romper la compatibilidad de `configuracion_json` de retos ya publicados.
13. Secretos (API key Gemini, JWT_SECRET) solo en el servidor.
14. **Prohibido el dato ficticio**: ningún número o estadística hardcodeada presentada como real. Sin datos → `EmptyState` que explique cómo llenarlo.
15. El XP es transaccional e idempotente (`POST /api/progreso` con `FOR UPDATE`); mantener esa garantía.
16. Sin MySQL local disponible: la verificación end-to-end contra BD real (permisos, migraciones, IA con datos reales) se hace en producción tras el deploy — dejarlo explícito al reportar avances.

## 7. Flujo oficial de desarrollo

1. Leer este archivo + `docs/architecture/CURRENT_STATE.md` (y `MASTER_PLAN.md` si la tarea es de roadmap).
2. Si el cambio es grande (rediseño, backend/BD/API, arquitectura) o toca algo del §10: redactar/usar spec aprobada en `docs/specifications/SPEC-00N-*.md` antes del primer commit.
3. Implementar en pasos pequeños que compilen.
4. Al terminar: `npm run build` sin errores; si el cambio es visible, verificar en navegador (incluido móvil).
5. Reportar con evidencia real de lo probado, sin exagerar.
6. Actualizar `CURRENT_STATE.md` (y `MASTER_PLAN.md` si cambió el roadmap).

## 8. Archivos que SIEMPRE debe consultar

- `CLAUDE.md` (este archivo)
- `docs/architecture/CURRENT_STATE.md`
- `docs/architecture/MASTER_PLAN.md`
- La SPEC activa en `docs/specifications/`, si la tarea toca ese cambio

## 9. Archivos que NO necesita consultar salvo indicación

- `docs/architecture/PROJECT_CONTEXT.md` — solo si hace falta arquitectura/stack en más detalle que este resumen.
- `docs/architecture/VISION.md` — solo para principios de producto / "qué nunca hacer".
- `docs/architecture/POLITICA-ELIMINACION.md` — solo si la tarea toca borrado/papelera de alguna entidad.
- `docs/audit/*.md` — bitácora de auditorías puntuales, no se reescriben.
- `docs/archive/` — histórico y plantillas abandonadas. **No leer para trabajo diario.**
- `README.md` / `START_HERE.md` — guías de arranque local, no de producto.

## 10. Restricciones — nunca modificar sin SPEC aprobada

- Login / autenticación (JWT, PIN, código de emergencia)
- XP y su transaccionalidad (`POST /api/progreso`)
- Sistema de Misiones (motor `server/lib/misiones.js`, catálogo)
- Ranking
- Sistema de permisos (roles, `conPermiso`, `soloAdminPrincipal`)

Cualquier cambio en estas áreas requiere una spec en `docs/specifications/` aprobada por Fabrizio antes del primer commit, incluso si parece un ajuste pequeño.
