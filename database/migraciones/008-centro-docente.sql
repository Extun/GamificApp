-- Migración 008 — Centro de Trabajo Docente (SPEC-006)
-- Aditiva: metadatos de actividades (origen IA, favoritos, dificultad, curso
-- destino), Papelera de retos y Libro de Calificaciones (observación/revisado).
-- initDb.js la aplica de forma idempotente al arrancar; este script es para
-- aplicación manual (Aiven) tras el backup.

ALTER TABLE retos
    ADD COLUMN origen        VARCHAR(10)  NOT NULL DEFAULT 'manual',
    ADD COLUMN favorito      BOOLEAN      NOT NULL DEFAULT FALSE,
    ADD COLUMN dificultad    VARCHAR(10)  NULL,
    ADD COLUMN curso_id      INT UNSIGNED NULL,
    ADD COLUMN eliminado_en  DATETIME     NULL,
    ADD COLUMN eliminado_por VARCHAR(50)  NULL,
    ADD CONSTRAINT fk_retos_curso FOREIGN KEY (curso_id)
        REFERENCES cursos (id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE progreso_estudiante
    ADD COLUMN observacion VARCHAR(400) NULL,
    ADD COLUMN revisado    BOOLEAN      NOT NULL DEFAULT FALSE;
