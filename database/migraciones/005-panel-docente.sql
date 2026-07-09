-- Migración 005 — Rediseño del Panel Docente (SPEC-004)
-- Autoría de retos, foto de perfil del docente y retroalimentaciones.
-- Aditiva e idempotente en initDb.js; este script es la versión manual.
-- Requiere: 004-admin-fase2.sql aplicada.

-- 1. Autoría de actividades: quién creó cada reto. Las filas previas quedan
--    NULL (la Biblioteca del docente filtra por materias asignadas).
ALTER TABLE retos
    ADD COLUMN docente_id INT UNSIGNED NULL,
    ADD CONSTRAINT fk_retos_docente FOREIGN KEY (docente_id)
        REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE SET NULL;

-- 2. Foto de perfil del docente (data URL base64, mismo patrón que el logo
--    institucional).
ALTER TABLE usuarios
    ADD COLUMN foto_data MEDIUMTEXT NULL;

-- 3. Retroalimentación docente: observaciones privadas asociadas a un
--    estudiante (no son comentarios públicos).
CREATE TABLE IF NOT EXISTS retroalimentaciones (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    docente_id    INT UNSIGNED NOT NULL,
    estudiante_id INT UNSIGNED NOT NULL,
    mensaje       VARCHAR(400) NOT NULL,
    creado_en     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_retro_docente FOREIGN KEY (docente_id)
        REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_retro_estudiante FOREIGN KEY (estudiante_id)
        REFERENCES estudiantes (id) ON UPDATE CASCADE ON DELETE CASCADE,
    INDEX idx_retro_estudiante (estudiante_id)
) ENGINE = InnoDB;
