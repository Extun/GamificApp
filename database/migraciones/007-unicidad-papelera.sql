-- Migración 007 — Unicidad compatible con la Papelera (SPEC-003).
-- Problema: el UNIQUE físico de materias.nombre y cursos(nombre, paralelo)
-- también contaba las filas en la papelera (eliminado_en IS NOT NULL):
-- eliminar una materia y volver a crearla con el mismo nombre respondía
-- "ya existe". Estos índices únicos FUNCIONALES solo aplican a filas vivas:
-- las eliminadas dejan de reservar el nombre, y dos materias/cursos ACTIVOS
-- homónimos siguen prohibidos. Requiere MySQL >= 8.0.13.
--
-- initDb.js aplica esta migración automáticamente al arrancar el servidor
-- (migrarUnicidadPapelera); este archivo queda para aplicarla a mano.

ALTER TABLE materias DROP INDEX nombre;
ALTER TABLE materias
    ADD UNIQUE KEY uq_materia_nombre_activa ((IF(eliminado_en IS NULL, nombre, NULL)));

ALTER TABLE cursos DROP INDEX uq_curso;
ALTER TABLE cursos
    ADD UNIQUE KEY uq_curso_activo (
        (IF(eliminado_en IS NULL, nombre, NULL)),
        (IF(eliminado_en IS NULL, paralelo, NULL)));
