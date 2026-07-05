-- ============================================================
-- GamificApp — Migración: estandarización de retos y ranking
--
-- 1. `retos.tipo` deja de ser ENUM y pasa a VARCHAR(30): añadir
--    un juego nuevo ya no requiere ALTER TABLE, solo insertar
--    retos con el nuevo slug de tipo ('lectura', 'memoria', ...).
-- 2. Índice sobre `estudiantes.xp_total` para que el ranking
--    Top N sea una lectura directa del índice.
--
-- Ejecutar SOLO en bases creadas antes de esta migración (las
-- nuevas ya lo incluyen vía database/gamificapp.sql):
--   mysql -u root -p gamificapp < database/migracion_estandarizacion.sql
-- ============================================================

USE gamificapp;

ALTER TABLE retos
    MODIFY COLUMN tipo VARCHAR(30) NOT NULL DEFAULT 'quiz';

ALTER TABLE estudiantes
    ADD INDEX idx_estudiantes_xp (xp_total DESC);

-- Verificación rápida
SHOW COLUMNS FROM retos LIKE 'tipo';
SHOW INDEX FROM estudiantes;
