-- Reversa de 006-catalogo-inteligente.sql.
-- ATENCIÓN: elimina descripciones, banners, competencias, nivel, el orden
-- institucional configurado y las marcas de materia protegida.

ALTER TABLE materias
    DROP COLUMN orden,
    DROP COLUMN descripcion,
    DROP COLUMN banner_data,
    DROP COLUMN competencias,
    DROP COLUMN nivel,
    DROP COLUMN protegida;
