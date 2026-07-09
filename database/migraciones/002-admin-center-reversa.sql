-- ============================================================
-- REVERSA de la migración 002 (SPEC-002).
-- Devuelve el esquema al estado previo. Los datos creados desde el
-- panel (materias nuevas, cursos, configuración) SE PIERDEN — hacer
-- backup antes si se quiere conservarlos.
-- ============================================================

-- 3. Configuración institucional
DROP TABLE IF EXISTS institucion;

-- 2. Cursos (primero las FKs, luego la tabla)
ALTER TABLE estudiantes DROP FOREIGN KEY fk_est_curso;
ALTER TABLE estudiantes DROP COLUMN curso_id;
ALTER TABLE invitaciones_estudiante DROP FOREIGN KEY fk_inv_curso;
ALTER TABLE invitaciones_estudiante DROP COLUMN curso_id;
DROP TABLE IF EXISTS cursos;

-- 1. Materias: deshacer rename e Inglés; quitar columnas.
-- (Si Inglés ya tiene retos/materiales/docentes, este DELETE fallará por
--  FK RESTRICT: eliminar antes ese contenido o conservar la materia.)
UPDATE materias SET nombre = 'Lenguaje' WHERE id = 2 AND nombre = 'Lengua y Literatura';
DELETE FROM materias WHERE id = 6 AND nombre = 'Inglés';
ALTER TABLE materias
    DROP COLUMN color,
    DROP COLUMN icono,
    DROP COLUMN activa;
