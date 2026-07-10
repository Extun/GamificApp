-- Reversa de 007 — vuelve al UNIQUE físico clásico.
-- ⚠️ Falla si hay una materia/curso activo con el mismo nombre que uno en la
-- papelera: purga o renombra los duplicados antes de revertir.

ALTER TABLE materias DROP INDEX uq_materia_nombre_activa;
ALTER TABLE materias ADD UNIQUE KEY nombre (nombre);

ALTER TABLE cursos DROP INDEX uq_curso_activo;
ALTER TABLE cursos ADD UNIQUE KEY uq_curso (nombre, paralelo);
