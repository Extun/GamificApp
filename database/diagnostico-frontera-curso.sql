-- ============================================================================
-- DIAGNÓSTICO de la frontera de curso y de autoría (SPEC-026 + SPEC-027)
--
-- SOLO LECTURA: aquí no hay un solo INSERT, UPDATE ni DELETE. Se puede pegar
-- entero en la consola de Aiven (o en cualquier cliente MySQL) sin riesgo.
--
-- Para qué sirve: las dos specs son fail-open a propósito — el filtro nunca
-- vacía un panel que hoy tiene cosas. El precio es que ciertas situaciones
-- ENSANCHAN la visibilidad en silencio (un estudiante sin curso ve todo, un
-- docente sin cursos publica para toda la institución). Esto las saca a la luz
-- para poder arreglarlas desde el panel del admin, no a mano en la BD.
--
-- Cada bloque devuelve una fila de resumen con `pendientes = 0` cuando no hay
-- nada que revisar, seguida del detalle.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Estudiantes SIN curso registrado → hoy ven TODAS las actividades y todo
--    el material de la institución (fail-open, SPEC-026 §2.3 punto 2).
--    Arreglo: asignarles curso desde Panel del admin → Estudiantes.
-- ---------------------------------------------------------------------------
SELECT '1. Estudiantes sin curso (ven todo)' AS control,
       COUNT(*) AS pendientes
FROM estudiantes e
JOIN usuarios u ON u.estudiante_id = e.id AND u.rol = 'estudiante'
WHERE e.curso_id IS NULL AND u.eliminado_en IS NULL;

SELECT e.id AS estudiante_id, u.id AS usuario_id,
       CONCAT(e.nombres, ' ', e.apellidos) AS estudiante,
       e.curso AS curso_texto_libre, e.xp_total
FROM estudiantes e
JOIN usuarios u ON u.estudiante_id = e.id AND u.rol = 'estudiante'
WHERE e.curso_id IS NULL AND u.eliminado_en IS NULL
ORDER BY e.apellidos, e.nombres;

-- ---------------------------------------------------------------------------
-- 2. Estudiantes cuyo curso está en la Papelera → siguen acotados a ese curso,
--    pero ningún docente puede ya dirigirles contenido nuevo (el selector solo
--    ofrece cursos vivos). Suelen ser cursos borrados por error.
-- ---------------------------------------------------------------------------
SELECT '2. Estudiantes con el curso en la papelera' AS control,
       COUNT(*) AS pendientes
FROM estudiantes e
JOIN cursos c ON c.id = e.curso_id
JOIN usuarios u ON u.estudiante_id = e.id AND u.rol = 'estudiante'
WHERE c.eliminado_en IS NOT NULL AND u.eliminado_en IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Docentes SIN cursos asignados → su contenido sin curso es INSTITUCIONAL:
--    lo ve toda la escuela (SPEC-026 §2.3 punto 1). Ojo: quitarle a un docente
--    su último curso ENSANCHA el alcance de lo que ya publicó.
--    Arreglo: asignarles curso desde Panel del admin → Docentes.
-- ---------------------------------------------------------------------------
SELECT '3. Docentes sin curso (su contenido llega a todos)' AS control,
       COUNT(*) AS pendientes
FROM usuarios u
WHERE u.rol = 'docente' AND u.eliminado_en IS NULL AND u.activo = TRUE
  AND NOT EXISTS (SELECT 1 FROM docente_curso dc WHERE dc.docente_id = u.id);

SELECT u.id, u.username, u.nombre_completo,
       (SELECT COUNT(*) FROM retos r
        WHERE r.docente_id = u.id AND r.eliminado_en IS NULL
          AND r.estado = 'publicado' AND r.curso_id IS NULL) AS actividades_sin_curso
FROM usuarios u
WHERE u.rol = 'docente' AND u.eliminado_en IS NULL AND u.activo = TRUE
  AND NOT EXISTS (SELECT 1 FROM docente_curso dc WHERE dc.docente_id = u.id)
ORDER BY u.username;

-- ---------------------------------------------------------------------------
-- 4. Cursos activos SIN docente asignado → sus estudiantes solo verán el
--    contenido institucional (el del admin o el legacy). Si un curso aparece
--    aquí y sus niños dicen "no tengo nada que hacer", esta es la causa.
-- ---------------------------------------------------------------------------
SELECT '4. Cursos activos sin docente' AS control, COUNT(*) AS pendientes
FROM cursos c
WHERE c.eliminado_en IS NULL AND c.activo = TRUE
  AND NOT EXISTS (SELECT 1 FROM docente_curso dc WHERE dc.curso_id = c.id);

SELECT c.id, CONCAT(c.nombre, ' ', c.paralelo) AS curso,
       (SELECT COUNT(*) FROM estudiantes e WHERE e.curso_id = c.id) AS estudiantes
FROM cursos c
WHERE c.eliminado_en IS NULL AND c.activo = TRUE
  AND NOT EXISTS (SELECT 1 FROM docente_curso dc WHERE dc.curso_id = c.id)
ORDER BY c.nombre, c.paralelo;

-- ---------------------------------------------------------------------------
-- 5. Contenido INSTITUCIONAL: sin autor registrado (filas anteriores a las
--    migraciones 005/015) o creado por un administrador. Lo ven todos los
--    estudiantes y lo gestionan todos los docentes de esa materia, a propósito
--    (SPEC-027 §2.2). No es un error: es el fail-open. Sirve para saber CUÁNTO
--    contenido escapa a la frontera.
-- ---------------------------------------------------------------------------
SELECT '5. Actividades institucionales (las ve toda la escuela)' AS control,
       SUM(r.docente_id IS NULL)                     AS sin_autor,
       SUM(ua.rol = 'admin')                         AS creadas_por_admin,
       COUNT(*)                                      AS total_publicadas
FROM retos r
LEFT JOIN usuarios ua ON ua.id = r.docente_id
WHERE r.eliminado_en IS NULL AND r.estado = 'publicado' AND r.curso_id IS NULL;

SELECT '5-bis. Material institucional' AS control,
       SUM(m.docente_id IS NULL) AS sin_autor,
       COUNT(*)                  AS total
FROM materiales m;

-- ---------------------------------------------------------------------------
-- 6. HISTORIAL CRUZADO: intentos que un estudiante registró en actividades que
--    HOY no le alcanzan (jugadas antes del despliegue de SPEC-026).
--    Su nota y su XP se conservan a propósito — borrarlos descuadraría el XP
--    total del niño (SPEC-026 §2.3 punto 3). Esta consulta solo dice cuánto
--    hay y de quién, para poder explicarlo si alguien pregunta.
-- ---------------------------------------------------------------------------
SELECT '6. Intentos en actividades de otro curso (historial previo)' AS control,
       COUNT(*) AS pendientes
FROM progreso_estudiante p
JOIN retos r      ON r.id = p.reto_id AND r.eliminado_en IS NULL
JOIN estudiantes e ON e.id = p.estudiante_id
WHERE e.curso_id IS NOT NULL
  AND NOT (
      r.curso_id = e.curso_id
      OR (r.curso_id IS NULL AND (
             EXISTS (SELECT 1 FROM docente_curso dc
                     WHERE dc.docente_id = r.docente_id AND dc.curso_id = e.curso_id)
          OR NOT EXISTS (SELECT 1 FROM docente_curso dc2
                         WHERE dc2.docente_id = r.docente_id)))
  );

SELECT CONCAT(e.nombres, ' ', e.apellidos) AS estudiante,
       e.curso AS curso_del_estudiante,
       r.titulo AS actividad,
       CONCAT(c.nombre, ' ', c.paralelo) AS actividad_dirigida_a,
       ua.username AS autor,
       p.calificacion, p.xp_obtenido, p.actualizado_en
FROM progreso_estudiante p
JOIN retos r       ON r.id = p.reto_id AND r.eliminado_en IS NULL
JOIN estudiantes e ON e.id = p.estudiante_id
LEFT JOIN cursos c   ON c.id = r.curso_id
LEFT JOIN usuarios ua ON ua.id = r.docente_id
WHERE e.curso_id IS NOT NULL
  AND NOT (
      r.curso_id = e.curso_id
      OR (r.curso_id IS NULL AND (
             EXISTS (SELECT 1 FROM docente_curso dc
                     WHERE dc.docente_id = r.docente_id AND dc.curso_id = e.curso_id)
          OR NOT EXISTS (SELECT 1 FROM docente_curso dc2
                         WHERE dc2.docente_id = r.docente_id)))
  )
ORDER BY p.actualizado_en DESC;

-- ---------------------------------------------------------------------------
-- 7. Actividades dirigidas a un curso que su autor YA NO tiene asignado
--    (le cambiaron las asignaciones después de publicar). Siguen llegando a
--    ese curso: `curso_id` explícito manda. Se revisa por si es un descuido.
-- ---------------------------------------------------------------------------
SELECT '7. Actividades dirigidas a un curso ajeno al autor de hoy' AS control,
       COUNT(*) AS pendientes
FROM retos r
WHERE r.eliminado_en IS NULL AND r.curso_id IS NOT NULL AND r.docente_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM docente_curso dc
                  WHERE dc.docente_id = r.docente_id AND dc.curso_id = r.curso_id);

-- ---------------------------------------------------------------------------
-- 8. Foto general: qué le llega hoy a cada curso.
-- ---------------------------------------------------------------------------
SELECT CONCAT(c.nombre, ' ', c.paralelo) AS curso,
       (SELECT COUNT(*) FROM estudiantes e WHERE e.curso_id = c.id) AS estudiantes,
       (SELECT COUNT(*) FROM retos r
        WHERE r.eliminado_en IS NULL AND r.estado = 'publicado'
          AND (r.curso_id = c.id
               OR (r.curso_id IS NULL AND (
                      EXISTS (SELECT 1 FROM docente_curso dc
                              WHERE dc.docente_id = r.docente_id AND dc.curso_id = c.id)
                   OR NOT EXISTS (SELECT 1 FROM docente_curso dc2
                                  WHERE dc2.docente_id = r.docente_id))))) AS actividades_visibles
FROM cursos c
WHERE c.eliminado_en IS NULL AND c.activo = TRUE
ORDER BY c.nombre, c.paralelo;
