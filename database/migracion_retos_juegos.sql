-- ============================================================
-- GamificApp — Migración: soporte de juegos configurables
--
-- Añade a la tabla `retos` las columnas que necesita el juego
-- 'Clasificador de Objetos' (y futuros juegos):
--   · tipo               → mecánica del reto ('quiz' | 'clasificador')
--   · configuracion_json → configuración creada por el docente
--
-- Ejecutar SOLO en bases de datos creadas antes de esta migración
-- (las nuevas ya incluyen las columnas vía database/gamificapp.sql):
--   mysql -u root -p gamificapp < database/migracion_retos_juegos.sql
-- ============================================================

USE gamificapp;

ALTER TABLE retos
    ADD COLUMN tipo ENUM('quiz','clasificador') NOT NULL DEFAULT 'quiz' AFTER titulo,
    ADD COLUMN configuracion_json JSON NULL AFTER descripcion;

-- Verificación rápida
SHOW COLUMNS FROM retos;
