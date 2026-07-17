# SPEC-011 — Eliminar localStorage como fuente de verdad (auditoría y migración)

**Estado:** APROBADA por Fabrizio (2026-07-16) — Fases 1 y 2 implementadas en código; verificación e2e pendiente del deploy (sin MySQL local)
**Fecha:** 2026-07-16
**Alcance:** Frontend + endpoints existentes de `retos` (una ampliación menor al PATCH). Sin migración de BD.

## 1. Problema

La regla permanente del proyecto (CLAUDE.md §6.11) dice: *"localStorage es caché, nunca fuente de verdad"*. La auditoría completa del código (2026-07-16) encontró que casi todo el uso actual cumple la regla, **excepto los historiales de borradores de los generadores**, que viven SOLO en localStorage: si el docente cambia de navegador/dispositivo o limpia datos, pierde sus borradores; y el badge "Publicado" del historial puede divergir de la BD.

## 2. Auditoría completa de localStorage (inventario)

| Clave(s) | Dónde | Clasificación | Acción |
|---|---|---|---|
| `edu_token`, `edu_usuario`, `edu_estudianteId` | `authService.js` | **Sesión JWT** — debe vivir en el cliente; es el mecanismo estándar | ✅ Se queda |
| `edu_materias` | `materiasService.js` | Caché de lectura; la API siempre la pisa al leer | ✅ Se queda (cumple §6.11) |
| `edu_institucion` | `institucionService.js` | Caché de lectura; ídem | ✅ Se queda |
| `edu_xpTotal` | `gamificationService.js` | Caché de XP; el servidor la realinea en cada escritura/lectura (fix 2026-07-10) | ✅ Se queda |
| `edu_logrosObtenidos`, `edu_actividades` | `gamificationService.js` | **Sistema viejo de logros**, reemplazado por Misiones (SPEC-007, migración 009 YA en producción). Solo queda como fallback de toast en reproductores | 🟡 Fase 2: retirar |
| `edu_historialQuizzes`, `edu_historialActividades_{mision,clasificador,memorama,linea-tiempo,completar}` | `HistorialActividades.jsx` + generadores | **Fuente de verdad de borradores** — única copia; viola §6.11 | 🔴 Fase 1: migrar a BD |

**Conclusión:** no hay que "eliminar localStorage de toda la app" — sesión y cachés de lectura son usos correctos que deben quedarse. Lo que sí hay que migrar es el historial de borradores (Fase 1) y retirar el sistema muerto de logros (Fase 2).

## 3. Fase 1 — Historial de borradores respaldado en BD

La infraestructura ya existe: `retos` soporta `estado='borrador'`, con endpoints de gestión (SPEC-004/006): `GET /api/retos/gestion`, `PATCH /api/retos/:id`, duplicar, papelera, detalle, y la **Biblioteca de Actividades** como UI. El historial local duplica (peor) lo que la Biblioteca ya hace bien.

### Diseño

1. **Al generar** (quiz/misión/juegos IA): además del estado en pantalla, la actividad se guarda de inmediato en BD como reto `borrador` (`POST /api/retos` con `estado:'borrador'`, que ya existe). La entrada queda con su `reto_id` real.
2. **Al editar** en el generador: los cambios se sincronizan con `PATCH /api/retos/:id` (debounce ~2 s, y al perder el foco/publicar). *Ampliación necesaria:* el PATCH hoy acepta descripción/XP/estado; se le añaden `titulo` y `configuracion` (validada con los mismos `VALIDADORES_CONFIG` del POST) **solo sobre retos en estado borrador** — un reto publicado no se edita en caliente (se conserva la regla actual: editar = nuevo borrador).
3. **"Últimos generados"**: la lista se lee de `GET /api/retos/gestion` (filtrada por tipo + materia, orden reciente, paginada como hoy). El badge Publicado/Borrador deja de poder divergir de la BD.
4. **Eliminar del historial** = enviar el borrador a la papelera (`DELETE /api/retos/:id`, ya existe, recuperable) — coherente con la POLITICA-ELIMINACION.
5. **localStorage queda como caché offline** del historial (se muestra si la red falla, la API lo pisa al volver), cumpliendo §6.11.
6. **EditorClasificador** (borrador que nace al teclear): igual, pero el borrador en BD se crea recién cuando hay contenido mínimo (título o 1 elemento), para no crear filas vacías.

### Qué NO cambia
- El flujo de publicar (mismo POST, misma validación, mismo upsert).
- La Biblioteca de Actividades (los borradores simplemente empiezan a aparecer ahí también, que es lo esperado).
- Nada de XP, misiones, ranking, permisos ni login (áreas §10 intactas).

### Riesgos
- Más escrituras a la BD (borrador por cada generación): volumen trivial para una escuela.
- Borradores "basura" acumulados: mitigado porque la Biblioteca ya tiene papelera/purga.
- Historiales locales existentes: se conservan visibles (caché) pero los nuevos nacen en BD; sin migración retroactiva de borradores locales (no vale el costo).

## 4. Fase 2 — Retirar el sistema viejo de logros de localStorage

Con Misiones (migración 009) confirmado en producción, `verificarLogros`/`getLogros`/`edu_logrosObtenidos`/`edu_actividades` son código muerto que puede mostrar toasts duplicados/incoherentes con las misiones reales.

- Los reproductores dejan de llamar `verificarLogros` (el toast ya lo alimenta `nuevas_misiones` del servidor).
- `gamificationService` elimina las claves y funciones del catálogo viejo; `getResumen` queda solo con XP/nivel (caché servidor-alineada).
- Al hacer login se limpian las claves huérfanas.
- **Cautela §10:** no se toca el motor de misiones ni `POST /api/progreso`; es solo retiro del fallback frontend. Aun así, por cercanía a áreas protegidas, esta fase se implementa y verifica por separado de la Fase 1.

## 5. Orden de implementación

1. Fase 1 (historial → BD) en pasos que compilen: PATCH ampliado → generadores guardan borrador → lista desde `/gestion` → localStorage a rol de caché.
2. Verificación en producción (sin MySQL local): generar, editar, recargar en otro navegador, publicar, papelera.
3. Fase 2 (logros viejos) después, como cambio independiente.

## 6. Criterios de aceptación

- Un borrador generado en un navegador aparece en el historial de otro navegador (misma cuenta).
- Publicar desde el historial refleja "Publicado" en cualquier dispositivo.
- Con la red caída, el historial muestra la caché local sin romper la UI.
- La Biblioteca de Actividades muestra los mismos borradores (una sola verdad).
- Ningún dato de sesión ni caché legítima se movió de sitio.
