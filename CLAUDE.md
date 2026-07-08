# CLAUDE.md — Reglas permanentes de GamificApp

Antes de modificar código, leer `START_HERE.md` (raíz) y seguir su orden de lectura mínima.

## Contexto en una frase

Plataforma de gamificación educativa para niños de 6–9 años (proyecto de tesis, escuela real en Guayaquil). React 19 + Vite / Node + Express / MySQL. Producción: Vercel + Render + Aiven.

## Reglas de trabajo (aprendidas durante el desarrollo)

1. **MVP First.** Esto es una tesis con fecha límite: la solución más simple que funcione gana. Nada de sobre-ingeniería ni features no pedidas.
2. **Cambios pequeños e incrementales.** Cada cambio debe dejar la app funcional y verificable (`npm run build` + probar en navegador). Dividir trabajo grande en pasos que compilen.
3. **No refactors grandes.** Nunca reescribir módulos enteros ni reorganizar carpetas por iniciativa propia. Las mejoras detectadas se ANOTAN en `MASTER_PLAN.md` (backlog), no se implementan.
4. **Reutilizar antes de crear.** Componentes existentes primero: `DashboardWidgets` (DashboardHeader, StatCard, SectionCard, EmptyState, QuickActionCard), `ArchivoChip`/`FilePreviewModal`, `LogroToast`, `QuizInteractivo`, `MisionNarrativa`. Servicios en `src/services/`, uno por dominio.
5. **Responsive obligatorio.** Todo cambio de UI debe funcionar en móvil/tablet (los niños usan dispositivos compartidos de la escuela). Verificar resoluciones pequeñas antes de dar por terminado.
6. **Cambios grandes requieren spec aprobada.** Rediseños, cambios de backend/BD/APIs o de arquitectura necesitan un documento en `docs/specifications/` aprobado por Fabrizio antes del primer commit. Bugs y ajustes pequeños se hacen directo.
7. **No depender del historial del chat.** Lo que importa se escribe en `docs/`. Al cerrar trabajo relevante, actualizar `docs/architecture/CURRENT_STATE.md` (y `MASTER_PLAN.md` si cambia el roadmap).
8. **Commits:** mensajes en español, nunca mencionan Claude, IA ni herramientas de IA.

## Reglas de código

- CSS plano con tokens de tema (`--color-*`, `--radius-*`, `--shadow-*`); no introducir librerías de estilos nuevas.
- Comentarios y UI en español. Texto visible para estudiantes comprensible por un niño de 6 años.
- Los permisos se validan SIEMPRE en el servidor; la UI solo oculta, nunca protege.
- `localStorage` es caché, nunca fuente de verdad; toda lista se refresca desde la API tras escribir.
- No romper la compatibilidad de `configuracion_json` de retos ya publicados.
- Secretos (API key Gemini, JWT_SECRET) solo en el servidor.

## Reglas de datos

- **Prohibido el dato ficticio**: ningún número o estadística hardcodeada presentada como real. Sin datos → `EmptyState` que explique cómo llenarlo.
- El XP es transaccional e idempotente (`POST /api/progreso` con `FOR UPDATE`); mantener esa garantía.

## Al terminar una tarea

1. `npm run build` sin errores; si el cambio es visible, verificar en navegador (incluido móvil).
2. Reportar con evidencia real de lo probado, sin exagerar.
3. Actualizar `CURRENT_STATE.md` si cambió el estado de algún módulo.
