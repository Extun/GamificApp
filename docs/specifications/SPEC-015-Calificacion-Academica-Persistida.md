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

### Qué representan `aciertos/total` en cada juego

El contrato del servidor no cambia (`calificacion = round(aciertos/total × 100)`);
lo que cambia por juego es **qué se cuenta** como acierto:

| Juego | `aciertos` | `total` |
|---|---|---|
| Quiz | respuestas correctas al primer intento | preguntas presentadas en el intento |
| Clasificador | fichas bien clasificadas al primer intento | fichas del tablero |
| Completar espacios | frases correctas | frases |
| Misión Narrativa | desafíos superados al primer intento | desafíos |
| Línea del tiempo | pares de eventos en orden relativo correcto | n(n−1)/2 pares |
| Memorama | la nota, sobre base 100 | 100 |

**Línea del tiempo** no puntúa la posición absoluta sino el orden relativo
entre pares (concordancia de rangos de Kendall): mover un evento desplaza a
todos los siguientes, así que la posición absoluta daba 0 a intentos que sí
demostraban comprender la secuencia. Ver `src/components/juegos/ordenSecuencia.js`.

**Memorama** mide eficiencia con exploración tolerada: si `n` = parejas y `f` =
intentos fallidos de formar pareja, la nota es `100` mientras `f ≤ n` y
`100 · n / (n + (f − n))` después. Justificación: descubrir dónde está cada
carta ES la mecánica del juego, así que una vuelta completa de exploración es
gratuita; a partir de ahí la nota mide con qué eficiencia el estudiante recordó
lo que ya había visto. `f` cuenta **intentos**, no cartas sueltas, y emparejar
no suma nada (los fallos previos ya se contaron una vez cada uno). Como con tan
pocas parejas la nota quedaría cuantizada en muy pocos escalones, se envía sobre
base 100 (`aciertos` = nota, `total` = 100). Ver
`src/components/juegos/calificacionMemorama.js`.

## Modelo de confianza (cierre de seguridad)

`POST /api/progreso` **no confía en el cliente** para nada que determine XP o
calificación. Reglas vigentes:

1. **El estudiante solo registra progreso sobre un `reto_id` existente.** La
   ruta `materia_id + reto_titulo` —que crea el reto si no existe— queda
   reservada a docente/admin. Antes, un estudiante podía crear retos publicados
   y fijarles él mismo el `xp_recompensa` que luego cobraba.
2. **El servidor es autoridad sobre el reto.** Se cargan de BD `tipo`, `estado`,
   `configuracion_json`, `xp_recompensa`, `materia_id` y `curso_id`. La
   recompensa sale **siempre** de la fila persistida; `xp_recompensa` del body
   solo se usa al CREAR un reto (rama de docente/admin).
3. **Acceso del estudiante = mismo criterio que `GET /api/retos`**: reto
   publicado, no eliminado, y materia viva y activa. Se aplica el mismo filtro a
   propósito, para que no exista nada listable que no sea enviable ni viceversa.
   ⚠️ Hoy `curso_id` **no** delimita el acceso en `GET /api/retos`: cualquier
   estudiante ve las actividades publicadas de cualquier materia activa. Por eso
   tampoco se usa aquí. Convertir el curso en frontera de acceso es una decisión
   de producto pendiente que debe cambiar **ambos** endpoints a la vez.
4. **Validación estructural de `aciertos/total`.** `server/lib/totalEsperado.js`
   (función pura) deriva del `tipo` + `configuracion_json` el `total` que un
   intento legítimo puede reportar. Si no coincide → **400**, nunca fallback
   silencioso al flujo histórico (ese fallback era el agujero). `aciertos` y
   `total` deben ser números enteros exactos: se rechazan decimales, negativos,
   `aciertos > total`, strings, `null`/`NaN` y valores desproporcionados.
5. **El estudiante debe enviar siempre `aciertos/total`.** La ruta legacy de
   solo `puntos_obtenidos` queda reservada a docente/admin: la usa
   exclusivamente el ajuste manual de XP del Libro de Calificaciones
   (`LibroCalificaciones.jsx`), que no envía datos de intento y por eso deja la
   calificación intacta.

**Retos legacy sin configuración derivable.** Las filas creadas por la vieja
ruta `materia_id + reto_titulo` nacían con `configuracion_json = NULL` y
`tipo = 'quiz'` (valor por defecto). Para esas, `totalEsperado` devuelve `null`
y el intento se rechaza con 400. No bloquea ningún juego real: todos los
reproductores exigen configuración válida y muestran "Este juego no tiene
configuración válida", así que un intento legítimo nunca puede originarse ahí.
Su XP histórico ya acreditado no se toca.

### Riesgo residual aceptado

Estas validaciones cierran la manipulación trivial y el XP arbitrario, pero
**no** convierten el sistema en server-authoritative: alguien con conocimientos
técnicos puede seguir enviando un resultado estructuralmente válido pero no
jugado (p. ej. `5/5` en un quiz que sí tiene 5 preguntas). El tope por reto
limita el daño a la recompensa de esa actividad, y el XP nunca excede
`xp_recompensa`. Cerrar esto exigiría sesiones de intento firmadas por el
servidor o validar cada respuesta en backend: queda como **mejora futura**,
fuera del alcance de la tesis (§6.1 MVP First).

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
