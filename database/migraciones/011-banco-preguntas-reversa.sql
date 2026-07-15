-- Reversa de la migración 011 (SPEC-010) — Repositorio de Preguntas.
-- Las actividades no dependen del banco (guardan su propio snapshot), así
-- que eliminar la tabla no afecta ningún reto ni progreso.

DROP TABLE IF EXISTS banco_preguntas;
