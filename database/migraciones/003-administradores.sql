-- Migración 003 — Módulo Administradores (roles de admin)
-- Aditiva e idempotente en initDb.js; este script es la versión manual.
-- Requiere: 002-admin-center.sql aplicada.

-- 1. Roles de administrador y estado de la cuenta.
ALTER TABLE usuarios
    ADD COLUMN es_principal BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN activo       BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. Invariante: siempre existe al menos un Administrador Principal activo.
--    Se promueve al admin activo más antiguo.
UPDATE usuarios SET es_principal = TRUE, activo = TRUE
WHERE rol = 'admin'
ORDER BY id
LIMIT 1;
