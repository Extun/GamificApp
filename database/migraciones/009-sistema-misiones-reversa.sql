-- Reversa de la migración 009 — Sistema de Misiones (SPEC-007).
-- Elimina el progreso, el catálogo y las columnas de racha. Destructivo:
-- borra todo el progreso de misiones de los estudiantes.

DROP TABLE IF EXISTS mision_estudiante;
DROP TABLE IF EXISTS misiones;

ALTER TABLE estudiantes
    DROP COLUMN racha_actual,
    DROP COLUMN racha_maxima,
    DROP COLUMN ultima_fecha_actividad;
