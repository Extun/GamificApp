-- 010 — Asignación de cursos a docentes (muchos-a-muchos).
--
-- Antes: cualquier docente podía elegir cualquier curso al generar
-- invitaciones. Ahora el administrador asigna qué curso(s) maneja cada
-- docente (igual que ya ocurre con las materias vía `docente_materia`), y el
-- docente solo puede invitar estudiantes a SUS cursos.
--
-- "Empezar en limpio": esta migración NO precarga ninguna asignación. Hasta
-- que el admin asigne cursos, ningún docente podrá generar invitaciones.
--
-- Idempotente (CREATE TABLE IF NOT EXISTS): `initDb.js` la aplica al arrancar.

CREATE TABLE IF NOT EXISTS docente_curso (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    docente_id INT UNSIGNED NOT NULL,
    curso_id   INT UNSIGNED NOT NULL,
    creado_en  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_docente_curso (docente_id, curso_id),
    CONSTRAINT fk_dc_docente FOREIGN KEY (docente_id) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_dc_curso FOREIGN KEY (curso_id) REFERENCES cursos (id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE = InnoDB;
