-- Reversa de 003-administradores.sql
-- Elimina las columnas de roles de admin. No borra usuarios.

ALTER TABLE usuarios
    DROP COLUMN es_principal,
    DROP COLUMN activo;
