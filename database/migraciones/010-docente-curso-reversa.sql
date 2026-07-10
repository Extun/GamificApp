-- Reversa de 010 — elimina la asignación de cursos a docentes.
-- Tras esto, el docente vuelve a poder elegir cualquier curso activo (el
-- backend deja de filtrar por `docente_curso`).

DROP TABLE IF EXISTS docente_curso;
