-- Reversa de la migración 008 — Centro de Trabajo Docente (SPEC-006)

ALTER TABLE progreso_estudiante
    DROP COLUMN revisado,
    DROP COLUMN observacion;

ALTER TABLE retos
    DROP FOREIGN KEY fk_retos_curso,
    DROP COLUMN eliminado_por,
    DROP COLUMN eliminado_en,
    DROP COLUMN curso_id,
    DROP COLUMN dificultad,
    DROP COLUMN favorito,
    DROP COLUMN origen;
