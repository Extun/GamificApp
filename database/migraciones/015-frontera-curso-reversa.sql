-- Reversa de 015-frontera-curso.sql (SPEC-026).
--
-- ⚠️ REFERENCIA DOCUMENTAL: ver la cabecera de 015-frontera-curso.sql.
--
-- Al quitar las columnas, el material de estudio vuelve a ser institucional
-- para todos (comportamiento anterior a SPEC-026). No se pierde ningún archivo:
-- `data_url`, `thumbnail` y el resto de la fila no se tocan. Lo único que se
-- pierde es saber quién subió cada material.
--
-- Ojo: el código de `server/routes/materiales.js` posterior a SPEC-026 espera
-- estas columnas, así que revertir la BD exige revertir también el código.

ALTER TABLE materiales
    DROP FOREIGN KEY fk_materiales_docente,
    DROP FOREIGN KEY fk_materiales_curso,
    DROP COLUMN docente_id,
    DROP COLUMN curso_id;
