# CLAUDE

# Objetivo

Instrucciones permanentes para Claude Code (y cualquier otra IA) al trabajar en GamificApp. Este archivo gobierna CÓMO se trabaja; los demás documentos gobiernan QUÉ se construye.

# Estado

🟢 Completo — documento vivo.

# Última actualización

2026-07-05 (RFC-005)

# Responsable

Fabrizio Zurita (Extun)

# Índice

1. Antes de modificar código
2. Reglas de trabajo
3. Reglas de código
4. Reglas de datos
5. Al terminar un RFC
6. Qué hacer al detectar mejoras

# Contenido

## 1. Antes de modificar código

1. **Leer `docs/architecture/PROJECT_CONTEXT.md`** — contexto completo en una lectura.
2. Si la tarea toca navegación/menús: leer `docs/architecture/NAVIGATION.md` y el Blueprint (RFC-003).
3. Si toca gamificación (XP/logros/retos): leer `docs/architecture/GAMIFICATION_ENGINE.md`.
4. Si toca la BD o APIs: leer `docs/architecture/DATABASE.md` y `docs/architecture/API_GUIDELINES.md`.
5. Verificar en `docs/rfc/` que existe un RFC que autoriza el cambio.

## 2. Reglas de trabajo

- **Nunca implementar funcionalidades fuera de un RFC.** Si el usuario pide algo sin RFC, señalarlo y proponer crear uno.
- **Nunca inventar arquitectura.** Si algo no está documentado, leer el código real antes de asumir; si sigue sin estar claro, preguntar.
- **No modificar backend, APIs ni base de datos sin un RFC que lo autorice explícitamente.**
- **Siempre generar CHANGELOG** al terminar un RFC (ver `docs/changelog/README.md`).
- **Registrar decisiones arquitectónicas** no triviales en `docs/decisions/` (ver su README).
- **Nunca depender del historial del chat**: todo lo que importa se escribe en `docs/`.
- Los mensajes de commit **nunca mencionan Claude, IA ni herramientas de IA**.

## 3. Reglas de código

- **Siempre reutilizar componentes existentes** antes de crear nuevos: `DashboardWidgets` (DashboardHeader, StatCard, SectionCard, EmptyState, QuickActionCard), `ArchivoChip`/`FilePreviewModal`, `LogroToast`, `QuizInteractivo`.
- Respetar los tokens de tema (`--color-*`, `--radius-*`, `--shadow-*`) y el estilo CSS plano existente; no introducir librerías de estilos nuevas.
- Seguir el idioma del código: comentarios y UI en español, servicios en `src/services/`, un servicio por dominio.
- Los permisos se validan SIEMPRE en el servidor; la UI solo oculta, nunca protege.
- `localStorage` es caché, nunca fuente de verdad; toda lista se refresca desde la API tras escribir.
- No romper la compatibilidad de `configuracion_json` de retos ya publicados.

## 4. Reglas de datos

- **Prohibido el dato ficticio**: ningún número, lista o estadística hardcodeada presentada como real (regla RFC-004).
- Si no hay datos reales: usar `EmptyState` con una acción que explique cómo llenarlo.
- El texto visible para estudiantes debe ser comprensible por un niño de 6 años.

## 5. Al terminar un RFC

1. Crear `docs/changelog/CHANGELOG-RFC-XXX.md` con el formato oficial.
2. Actualizar `PROJECT_CONTEXT.md` (tabla de RFC, estado actual) y `MASTER_PLAN.md` (fase/sprint/backlog).
3. Verificar el build (`npm run build`) y, si el cambio es visible, verificar en el navegador antes de reportar.
4. Reportar resultados con evidencia (qué se probó y cómo), sin exagerar lo verificado.

## 6. Qué hacer al detectar mejoras

- **Documentar cualquier mejora detectada** como ítem del backlog en `MASTER_PLAN.md` (o como propuesta de RFC si es grande).
- **Nunca implementar una mejora no aprobada**, por obvia que parezca: se anota, no se codifica.
- Si se detecta un bug real durante otra tarea: reportarlo; solo corregirlo si bloquea la tarea autorizada en curso.

# Pendientes

- Evaluar mover/enlazar este archivo como `CLAUDE.md` raíz del repositorio para carga automática de Claude Code (decisión pendiente del responsable).
