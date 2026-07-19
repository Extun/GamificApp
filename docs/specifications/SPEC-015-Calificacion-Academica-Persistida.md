# SPEC-015 — Calificación académica persistida y XP proporcional al desempeño

**Estado:** Aprobada por Fabrizio (solicitud directa, 2026-07-18).
**Toca área restringida (§10):** `POST /api/progreso` y esquema de `progreso_estudiante`.

## Problema

1. El Libro de Calificaciones deriva la "nota" de `porcentaje`, que el backend
   calcula como `xp_obtenido / xp_recompensa`. Si el docente edita la
   recompensa XP, la nota del Libro deja de coincidir con la que vio el
   estudiante (p. ej. overlay 80/100 vs Libro 100/100).
2. El XP se abonaba con `min(puntos_cliente, xp_recompensa)`: con una
   recompensa menor a `aciertos × 100`, un intento parcial ya alcanzaba el
   máximo (60/100 podía otorgar todo el XP).
3. El overlay podía mostrar "+0 XP" en reintentos sin mejora.

## Decisión

- **El backend calcula la nota con datos objetivos del intento**: el cliente
  envía `aciertos` y `total` (enteros del intento realmente jugado — con banco,
  la muestra). El servidor calcula `calificacion = round(aciertos/total × 100)`
  y **nunca** confía en una nota precalculada por el cliente.
- Nueva columna `progreso_estudiante.calificacion TINYINT UNSIGNED NULL`:
  guarda la **mejor** calificación académica histórica (GREATEST). `NULL` =
  intento registrado por un flujo que aún no envía aciertos/total (juegos no
  migrados, ajuste manual de XP del docente): esos flujos **no** alteran la
  calificación existente.
- **XP proporcional al desempeño**: cuando llegan `aciertos/total`, el XP
  acumulable del reto es `round(aciertos/total × xp_recompensa)`, capado por
  `xp_recompensa`. Se conserva intacta la acreditación incremental existente
  (`delta = max(0, nuevo − previo)` con `FOR UPDATE` y `GREATEST`): nunca se
  duplica XP ni se resta por intentos peores.
- **Retrocompatibilidad**: sin `aciertos/total` el endpoint se comporta
  exactamente como antes (`xp = min(puntos_obtenidos, xp_recompensa)`,
  `calificacion` intacta). `porcentaje` conserva su semántica (avance de la
  recompensa; las misiones siguen usando `porcentaje = 100` como "perfecto").
- **Respuesta ampliada** de `POST /api/progreso`:
  `calificacion` (del intento), `mejor_calificacion`, `xp_obtenido_total`
  (acumulado en el reto tras el intento) y `xp_recompensa`, además de los
  campos existentes (`xp_abonado` = XP realmente acreditado en este intento).
- **UI**: el overlay muestra la nota del intento actual; el Libro muestra
  `calificacion` (mejor histórica) con fallback a `porcentaje` para filas
  legadas. El chip de XP tiene 3 estados: ganó XP (+N), sin mejora (mensaje
  amable), o recompensa completa.

## Alternativas descartadas

- Persistir `aciertos`/`total` como columnas: más datos de los necesarios para
  el caso de uso (el Libro solo necesita la nota); se puede añadir después si
  una tesis futura lo pide. Evita sobreingeniería (§6.1).
- Confiar en `calificacion` calculada por el cliente: manipulable con un POST.

## Migración y datos históricos

- Migración 010 (idempotente, `server/initDb.js`): `ADD COLUMN calificacion`
  + backfill único `calificacion = porcentaje` para filas existentes. Es una
  aproximación correcta para todos los retos con recompensa generada
  automáticamente (`jugables × 100`, el 100% de los datos actuales); si algún
  docente hubiera editado el XP antes de esta migración, esa fila arrastraría
  la distorsión antigua hasta el siguiente intento del estudiante.
- Sin MySQL local: se valida en producción tras el deploy (§6.16).
