# PROJECT_CONTEXT

# Objetivo

Dar a cualquier desarrollador o IA el contexto completo de GamificApp en una sola lectura, sin depender del historial de ningún chat. El estado actual y las prioridades viven en `CURRENT_STATE.md`; este documento solo cambia si cambia el producto o la arquitectura.

# Última actualización

2026-07-07 (consolidación documental)

# Responsable

Fabrizio Zurita (Extun)

## 1. Resumen del proyecto

**GamificApp** es una plataforma web de gamificación educativa para niños de **6 a 9 años** (educación básica elemental), desarrollada como proyecto de tesis para la Unidad Educativa Benemérita Sociedad Filantrópica del Guayas (Guayaquil, Ecuador). Tiene **tres roles**: Administrador (gestiona docentes y estudiantes), Docente (crea contenido educativo con ayuda de IA y gestiona su aula) y Estudiante (aprende jugando y gana XP, niveles y logros).

Las mecánicas de juego son tres: **Quiz** (opción múltiple A-D con justificación), **Clasificador** (drag & drop de elementos en categorías) y **Misión Narrativa** (aventura RPG por capítulos). El contenido de Quiz y Misión se genera con IA (Google Gemini, proxy en backend). Hay 5 materias fijas: Matemáticas, Lenguaje, Ciencias Naturales, Ciencias Sociales y Educación Física.

El login del niño es **nombre + PIN de 6 caracteres** derivado de su fecha de nacimiento, con código de emergencia impreso en el carné. Filosofía "siempre se termina ganando": equivocarse da pista y reintento; solo los aciertos al primer intento dan XP; ningún niño queda bloqueado.

## 2. Tecnologías

| Capa | Stack |
|------|-------|
| Frontend | React 19 + Vite, React Router, MUI (iconos y algunos componentes), CSS plano con variables de tema |
| Backend | Node.js + Express (`server/`), JWT (jsonwebtoken), bcryptjs, mysql2 |
| Base de datos | MySQL (local: `gamificapp`; producción: Aiven `defaultdb`) — esquema en `database/*.sql`, tablas autocreadas por `initDb.js` |
| IA | `@google/genai` (Gemini) — solo server-side, endpoints `/api/ia/*`, con reintentos multi-modelo |
| Archivos | `pdfjs-dist` (preview PDF), `mammoth` (texto .docx); archivos guardados como base64 en MySQL |
| Deploy | Vercel (frontend) + Render (backend, plan free con keep-alive vía `/api/health`) + Aiven (MySQL) |

## 3. Arquitectura

- **SPA con 3 rutas planas**: `/` (login), `/registro`, `/dashboard` (protegida). Dentro de `/dashboard`, un componente monolítico por rol; la navegación interna usa `useState`, no sub-rutas (deuda conocida; SPEC-001 propone cambiarlo para el estudiante).
- **Backend REST** en `server/routes/`: auth, admin, docente, materias, materiales, retos, progreso, ranking, ia. Middleware JWT global tras `/api/auth`.
- **Retos polimórficos**: la tabla `retos` guarda cualquier mecánica en `configuracion_json` con un `tipo` slug libre — añadir un juego nuevo no requiere migrar la BD.
- **XP transaccional**: `POST /api/progreso` usa `FOR UPDATE` + delta, nunca duplica XP en reintentos; el techo es `xp_recompensa` del reto.
- **Componentes compartidos**: `src/components/dashboard/DashboardWidgets.jsx` (DashboardHeader, StatCard, SectionCard, EmptyState, QuickActionCard), `ArchivoChip` + `FilePreviewModal`, `LogroToast`.

## 4. Principios de arquitectura

1. **El servidor es la fuente de verdad** — localStorage es solo caché; toda lista se refresca consultando la API.
2. **El rol viaja firmado en el JWT** — la UI nunca decide permisos; el backend revalida todo.
3. **Extensible sin migraciones** — nuevos juegos = nuevo `tipo` + editor + reproductor; API y BD no cambian.
4. **Sin datos ficticios** — todo dato visible es trazable a la BD o a un cálculo real; si no hay datos, `EmptyState`.
5. **Secretos solo en el servidor** — la API key de Gemini y el JWT_SECRET nunca llegan al navegador.

## 5. Principios UX

1. Diseño **"Minimalista Amigable"**: tarjetas suaves, tokens CSS (`--color-*`), iconografía redondeada, español simple para niños.
2. **El dashboard siempre sugiere la siguiente acción** — nunca es solo un mosaico de estadísticas.
3. **Equivocarse nunca bloquea**; celebración al terminar; el error enseña con pistas, no castiga.
4. Ninguna funcionalidad principal a más de 3 clics; los estados vacíos explican qué hacer.
5. **Norte actual del rediseño estudiante**: `MisionNarrativa` es la pantalla de referencia (pantalla completa, una decisión a la vez, visual antes que texto) — extender ese lenguaje a toda la experiencia del niño (ver auditoría UX 2026-07-06).

## 6. Documentos relacionados

- `CURRENT_STATE.md` — estado real de módulos y prioridades (leer siempre).
- `MASTER_PLAN.md` — roadmap.
- `VISION.md` — visión de producto y "lo que nunca debemos hacer".
- `docs/audit/` y `docs/specifications/` — auditorías y specs del trabajo en curso.
- `docs/archive/` — histórico (RFC-001..005, plantillas DevOS); no necesario para el trabajo diario.
