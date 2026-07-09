-- ============================================================
-- Migración 002 — Centro de Administración Institucional (SPEC-002)
-- Fase 1: materias dinámicas, catálogo de cursos, configuración
-- institucional.
--
-- NOTA: el servidor aplica esta migración AUTOMÁTICAMENTE al arrancar
-- (server/initDb.js, con guardas de information_schema). Este archivo
-- documenta la ruta manual equivalente para aplicarla a mano:
--
--   mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p <DB_NAME> \
--         < database/migraciones/002-admin-center.sql
--
-- ¡Hacer BACKUP antes de ejecutar en producción!
-- Reversa: 002-admin-center-reversa.sql
-- ============================================================

-- 1. Materias dinámicas -------------------------------------------------
-- (Si la columna ya existe, MySQL 8 falla: verificar antes con
--  SHOW COLUMNS FROM materias; — initDb.js lo hace automáticamente.)
ALTER TABLE materias
    ADD COLUMN color  VARCHAR(7) NOT NULL DEFAULT '#e0f2fe',
    ADD COLUMN icono  VARCHAR(8) NOT NULL DEFAULT '📚',
    ADD COLUMN activa BOOLEAN    NOT NULL DEFAULT TRUE;

-- Rename conservador: mismo ID, ninguna relación se toca.
UPDATE materias SET nombre = 'Lengua y Literatura' WHERE id = 2 AND nombre = 'Lenguaje';

-- Identidad visual inicial (solo si aún tienen el valor por defecto).
UPDATE materias SET color = '#e0f2fe', icono = '🔢' WHERE id = 1 AND icono = '📚';
UPDATE materias SET color = '#fce7f3', icono = '📖' WHERE id = 2 AND icono = '📚';
UPDATE materias SET color = '#dcfce7', icono = '🌱' WHERE id = 3 AND icono = '📚';
UPDATE materias SET color = '#fef3c7', icono = '🌎' WHERE id = 4 AND icono = '📚';
UPDATE materias SET color = '#ede9fe', icono = '⚽' WHERE id = 5 AND icono = '📚';

-- Materia nueva (no pisa nada existente).
INSERT IGNORE INTO materias (id, nombre, color, icono) VALUES (6, 'Inglés', '#ffe4e6', '🗣️');

-- 2. Catálogo de cursos --------------------------------------------------
CREATE TABLE IF NOT EXISTS cursos (
    id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nombre    VARCHAR(20)  NOT NULL,
    paralelo  VARCHAR(5)   NOT NULL,
    nivel     VARCHAR(30)  NULL,
    activo    BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_curso (nombre, paralelo)
) ENGINE = InnoDB;

ALTER TABLE estudiantes
    ADD COLUMN curso_id INT UNSIGNED NULL,
    ADD CONSTRAINT fk_est_curso FOREIGN KEY (curso_id)
        REFERENCES cursos (id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE invitaciones_estudiante
    ADD COLUMN curso_id INT UNSIGNED NULL,
    ADD CONSTRAINT fk_inv_curso FOREIGN KEY (curso_id)
        REFERENCES cursos (id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Backfill: cada texto libre "nombre paralelo" se vuelve un curso del
-- catálogo. Los textos sin ese patrón quedan con curso_id NULL (se
-- corrigen luego desde el panel del admin).
INSERT IGNORE INTO cursos (nombre, paralelo)
    SELECT DISTINCT TRIM(SUBSTRING_INDEX(curso, ' ', 1)), TRIM(SUBSTRING_INDEX(curso, ' ', -1))
    FROM estudiantes WHERE curso LIKE '% %' AND TRIM(curso) <> '';
INSERT IGNORE INTO cursos (nombre, paralelo)
    SELECT DISTINCT TRIM(SUBSTRING_INDEX(curso, ' ', 1)), TRIM(SUBSTRING_INDEX(curso, ' ', -1))
    FROM invitaciones_estudiante WHERE curso LIKE '% %' AND TRIM(curso) <> '';

UPDATE estudiantes e JOIN cursos c
    ON TRIM(e.curso) = CONCAT(c.nombre, ' ', c.paralelo)
    SET e.curso_id = c.id WHERE e.curso_id IS NULL;
UPDATE invitaciones_estudiante i JOIN cursos c
    ON TRIM(i.curso) = CONCAT(c.nombre, ' ', c.paralelo)
    SET i.curso_id = c.id WHERE i.curso_id IS NULL;

-- 3. Configuración institucional ------------------------------------------
CREATE TABLE IF NOT EXISTS institucion (
    id               TINYINT UNSIGNED NOT NULL DEFAULT 1,
    nombre           VARCHAR(160) NOT NULL,
    ciudad           VARCHAR(80)  NULL,
    provincia        VARCHAR(80)  NULL,
    pais             VARCHAR(80)  NULL,
    logo_data        MEDIUMTEXT   NULL,
    favicon_data     TEXT         NULL,
    color_principal  VARCHAR(7)   NULL,
    color_secundario VARCHAR(7)   NULL,
    anio_lectivo     VARCHAR(20)  NULL,
    xp_escala_max    INT UNSIGNED NOT NULL DEFAULT 1000,
    config_json      JSON         NULL,
    actualizado_en   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT chk_institucion_singleton CHECK (id = 1)
) ENGINE = InnoDB;

INSERT IGNORE INTO institucion (id, nombre, ciudad, provincia, pais)
VALUES (1, 'Unidad Educativa Fiscal Clemencia Coronel de Pincay', 'Guayaquil', 'Guayas', 'Ecuador');

-- Verificación
SELECT id, nombre, color, icono, activa FROM materias ORDER BY id;
SELECT id, nombre, paralelo, activo FROM cursos ORDER BY nombre, paralelo;
SELECT id, nombre FROM institucion;
