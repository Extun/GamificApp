-- Reversa de 005-panel-docente.sql — deja la BD como antes de la migración.
-- ATENCIÓN: elimina las retroalimentaciones y las fotos de perfil guardadas.

DROP TABLE IF EXISTS retroalimentaciones;

ALTER TABLE usuarios
    DROP COLUMN foto_data;

ALTER TABLE retos
    DROP FOREIGN KEY fk_retos_docente,
    DROP COLUMN docente_id;
