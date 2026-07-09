-- Reversa de 004-admin-fase2.sql
-- ⚠️ DROP TABLE auditoria borra el historial de acciones registrado.
-- ⚠️ Quitar eliminado_en hace visibles de nuevo los elementos en papelera
--    (nada se pierde: la marca desaparece, las filas siguen ahí).

ALTER TABLE usuarios
    DROP COLUMN permisos,
    DROP COLUMN eliminado_en,
    DROP COLUMN eliminado_por;
ALTER TABLE materias
    DROP COLUMN eliminado_en,
    DROP COLUMN eliminado_por;
ALTER TABLE cursos
    DROP COLUMN eliminado_en,
    DROP COLUMN eliminado_por;

DROP TABLE IF EXISTS auditoria;
