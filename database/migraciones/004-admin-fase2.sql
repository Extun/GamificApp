-- Migración 004 — Panel de Administración Fase 2 (SPEC-003)
-- Permisos por administrador, auditoría y papelera (soft-delete).
-- Aditiva e idempotente en initDb.js; este script es la versión manual.
-- Requiere: 002-admin-center.sql y 003-administradores.sql aplicadas.

-- 1. Permisos por administrador (JSON, array de claves).
--    NULL = conjunto operativo por defecto (docentes, estudiantes, materias,
--    cursos, invitaciones): los admins existentes no cambian de capacidades.
ALTER TABLE usuarios
    ADD COLUMN permisos JSON NULL;

-- 2. Papelera (soft-delete): la fila se marca, nunca se pierde información.
--    `eliminado_por` guarda el username de quien eliminó (denormalizado:
--    el dato sobrevive aunque esa cuenta desaparezca después).
ALTER TABLE usuarios
    ADD COLUMN eliminado_en  DATETIME    NULL,
    ADD COLUMN eliminado_por VARCHAR(50) NULL;
ALTER TABLE materias
    ADD COLUMN eliminado_en  DATETIME    NULL,
    ADD COLUMN eliminado_por VARCHAR(50) NULL;
ALTER TABLE cursos
    ADD COLUMN eliminado_en  DATETIME    NULL,
    ADD COLUMN eliminado_por VARCHAR(50) NULL;

-- 3. Auditoría de acciones. Sin FK a usuarios: el historial sobrevive a la
--    eliminación definitiva de la cuenta (nombre denormalizado).
CREATE TABLE IF NOT EXISTS auditoria (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    usuario_id   INT UNSIGNED NULL,
    rol          VARCHAR(15)  NOT NULL,
    nombre       VARCHAR(160) NOT NULL,
    accion       VARCHAR(60)  NOT NULL,
    descripcion  VARCHAR(255) NOT NULL,
    materia      VARCHAR(60)  NULL,
    detalle_json JSON         NULL,
    creado_en    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_auditoria_fecha (creado_en),
    INDEX idx_auditoria_rol (rol)
) ENGINE = InnoDB;
