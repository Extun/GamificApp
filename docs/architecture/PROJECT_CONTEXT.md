# PROJECT_CONTEXT

# Objetivo

Dar a cualquier desarrollador o IA el contexto completo de GamificApp en una sola lectura, sin depender del historial de ningún chat.

# Estado

🟢 Completo — documento vivo, actualizar al cerrar cada RFC.

# Última actualización

2026-07-05 (RFC-005)

# Responsable

Fabrizio Zurita (Extun)

# Índice

1. Resumen del proyecto
2. Tecnologías utilizadas
3. Arquitectura
4. Estado actual
5. Sprint actual
6. RFC completados / activos / próximos
7. Principios de arquitectura
8. Principios UX

# Contenido

## 1. Resumen del proyecto

**GamificApp** es una plataforma web de gamificación educativa para niños de **6 a 9 años** (educación básica elemental), desarrollada como proyecto de tesis para la Unidad Educativa Benemérita Sociedad Filantrópica del Guayas (Ecuador). Tiene **tres roles**: Administrador (gestiona docentes y estudiantes), Docente (crea contenido educativo con ayuda de IA y gestiona su aula) y Estudiante (aprende jugando y gana XP, niveles y logros).

Las mecánicas de juego son tres: **Quiz** (opción múltiple A-D con justificación), **Clasificador** (drag & drop de elementos en categorías) y **Misión Narrativa** (aventura RPG por capítulos con desafíos matemáticos). El contenido de Quiz y Misión se genera con IA (Google Gemini, proxy en backend). Hay 5 materias fijas: Matemáticas, Lenguaje, Ciencias Naturales, Ciencias Sociales y Educación Física.

## 2. Tecnologías utilizadas

| Capa | Stack |
|------|-------|
| Frontend | React 19 + Vite, React Router, MUI (iconos y algunos componentes), CSS plano con variables de tema |
| Backend | Node.js + Express (`server/`), JWT (jsonwebtoken), bcryptjs, mysql2 |
| Base de datos | MySQL (local: `gamificapp`; producción: Aiven `defaultdb`) — esquema en `database/*.sql` |
| IA | `@google/genai` (Gemini) — solo server-side, endpoints `/api/ia/*` |
| Archivos | `pdfjs-dist` (preview PDF), `mammoth` (texto de .docx); archivos guardados como base64 en MySQL |
| Deploy | Vercel (frontend) + Render (backend, plan free con keep-alive vía `/api/health`) + Aiven (MySQL) |

## 3. Arquitectura

- **SPA con 3 rutas**: `/` (login), `/registro`, `/dashboard` (protegida). Dentro de `/dashboard`, un componente por rol; la navegación interna usa `useState`, NO sub-rutas (deuda conocida, ver Blueprint v2).
- **Backend REST** en `server/routes/`: auth, admin, docente, materias, materiales, retos, progreso, ranking, ia. Middleware JWT global tras `/api/auth`.
- **Retos polimórficos**: la tabla `retos` guarda cualquier mecánica en `configuracion_json` con un `tipo` slug libre — añadir un juego nuevo no requiere migrar la BD.
- **XP transaccional**: `POST /api/progreso` usa `FOR UPDATE` + delta, nunca duplica XP en reintentos; el techo es `xp_recompensa` del reto.
- **Componentes compartidos**: `src/components/dashboard/DashboardWidgets.jsx` (DashboardHeader, StatCard, SectionCard, EmptyState, QuickActionCard), `ArchivoChip` (FileChip + modal), `LogroToast`.

## 4. Estado actual

Funciona en producción: autenticación (3 modos + emergencia + rate limiting), gestión de docentes/estudiantes/invitaciones, material de estudio, las 3 mecánicas de juego (crear y jugar), XP/niveles/ranking, y los 3 dashboards reorganizados con datos 100% reales (RFC-004).

**Incompleto** (ver MASTER_PLAN): Libro de Calificaciones (placeholder vacío), 3 de 5 logros sin lógica de desbloqueo (`racha-7`, `estrella-aula`, `explorador`), edición de docente sin UI (endpoint existe), navegación sin sub-rutas de router, Asistente IA sin memoria de conversación.

## 5. Sprint actual

**Sprint DevOS (RFC-005)** — crear la infraestructura documental del repositorio. Sin cambios de código.

## 6. RFC completados / activos / próximos

| RFC | Título | Estado | Entregable |
|-----|--------|--------|------------|
| RFC-001 | Auditoría de Navegación | ✅ Completado | `docs/Auditoria-Navegacion-v2.md` |
| RFC-002 | Inventario Funcional | ✅ Completado | `docs/Inventario-Funcional-v1.md` |
| RFC-003 | Navigation Blueprint v2 | ✅ Completado | `docs/Navigation-Blueprint-v2.md` |
| RFC-004 | Dashboard Architecture v2 | ✅ Completado (implementado) | Dashboards reorganizados + `DashboardWidgets` |
| RFC-005 | GamificApp DevOS | 🟡 Activo | Esta estructura documental |
| RFC-006 | (Propuesto) Navegación v2 | ⚪ Pendiente | Implementar el Blueprint: rutas anidadas, menús por áreas |

## 7. Principios de arquitectura

1. **El servidor es la fuente de verdad** — localStorage es solo caché; toda lista se refresca consultando la API.
2. **El rol viaja firmado en el JWT** — la UI nunca decide permisos; el backend revalida todo (materias asignadas, progreso propio).
3. **Extensible sin migraciones** — nuevos juegos = nuevo `tipo` + editor + reproductor; la API y la BD no cambian.
4. **Sin datos ficticios** — todo dato visible es trazable a la BD o a un cálculo real; si no hay datos, se muestra un EmptyState (regla desde RFC-004).
5. **Secretos solo en el servidor** — la API key de Gemini y el JWT_SECRET nunca llegan al navegador.

## 8. Principios UX

1. Diseño **"Minimalista Amigable"**: tarjetas suaves, paleta con tokens CSS (`--color-*`), iconografía redondeada, lenguaje en español simple para niños.
2. **El dashboard siempre sugiere la siguiente acción** (QuickActionCard) — nunca es solo un mosaico de estadísticas.
3. **Equivocarse nunca bloquea**: en todos los juegos el niño reintenta hasta terminar; solo los aciertos al primer intento dan XP ("siempre se termina ganando").
4. Ninguna funcionalidad principal a más de 3 clics; los estados vacíos siempre explican qué hacer.
5. Las 5 áreas de navegación objetivo (Inicio, Contenido, Progreso, Comunidad/Aula, Perfil) significan lo mismo en los 3 roles (Blueprint v2).

# Pendientes

- Actualizar la tabla de RFC al cerrar RFC-005 y al abrir RFC-006.
- Mover los documentos de auditoría (`docs/*.md` sueltos) a `docs/audit/` cuando se apruebe.
