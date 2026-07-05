-- ============================================================
-- GamificApp — Migración: sistema de login profesional (3 roles)
--
--   · Rol ADMIN: gestiona docentes y estudiantes desde su panel.
--   · Rol DOCENTE: solo ve/edita SUS materias (tabla docente_materia)
--     y registra estudiantes mediante códigos de invitación.
--   · Rol ESTUDIANTE: entra con nombre completo + PIN de 6 dígitos
--     (por defecto su fecha de nacimiento DDMMAA). Recuperación por
--     código de emergencia impreso en su carné, o reseteo del docente.
--
-- EJECUTAR UNA SOLA VEZ, después de migracion_auth_materiales.sql:
--   mysql -u root -p gamificapp < database/migracion_login_profesional.sql
-- ============================================================

USE gamificapp;

-- ------------------------------------------------------------
-- 1. USUARIOS: tercer rol + campos de login de estudiante y
--    defensa contra fuerza bruta (bloqueo temporal por intentos).
-- ------------------------------------------------------------
ALTER TABLE usuarios
    MODIFY COLUMN rol ENUM('admin','docente','estudiante') NOT NULL DEFAULT 'estudiante';

ALTER TABLE usuarios
    -- Nombre visible tal como lo escribió el estudiante ("Ana María Pérez").
    -- `username` guarda su versión normalizada (minúsculas, espacios simples)
    -- y es UNIQUE: dos estudiantes no pueden registrarse con el mismo nombre.
    ADD COLUMN nombre_completo VARCHAR(120) NULL AFTER username,
    -- PIN de 6 dígitos, SIEMPRE hasheado con bcrypt (nunca en claro).
    -- Por defecto es la fecha de nacimiento DDMMAA: recuperable sin BD.
    ADD COLUMN pin_hash VARCHAR(100) NULL AFTER password_hash,
    -- Código impreso en el carné del estudiante; permite entrar si olvidó
    -- el PIN personalizado (al usarse, el PIN vuelve al de nacimiento).
    ADD COLUMN codigo_emergencia VARCHAR(8) NULL UNIQUE AFTER pin_hash,
    -- Rate limiting: 5 fallos seguidos => bloqueo de 15 minutos.
    ADD COLUMN intentos_fallidos TINYINT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN bloqueado_hasta TIMESTAMP NULL;

-- Fecha de nacimiento: origen del PIN por defecto del estudiante.
ALTER TABLE estudiantes
    ADD COLUMN fecha_nacimiento DATE NULL AFTER curso;

-- ------------------------------------------------------------
-- 2. DOCENTE ↔ MATERIA: cada docente solo gestiona las materias
--    que el admin le asignó.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS docente_materia (
    id         INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    docente_id INT UNSIGNED     NOT NULL,
    materia_id TINYINT UNSIGNED NOT NULL,
    creado_en  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_docente_materia (docente_id, materia_id),
    CONSTRAINT fk_dm_docente FOREIGN KEY (docente_id) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_dm_materia FOREIGN KEY (materia_id) REFERENCES materias (id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE = InnoDB;

-- ------------------------------------------------------------
-- 3. INVITACIONES: códigos de un solo uso (6 caracteres, 7 días)
--    que el docente reparte en clase para que sus estudiantes se
--    registren solos, sin abrir el registro a internet.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invitaciones_estudiante (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    codigo     VARCHAR(6)   NOT NULL UNIQUE,
    docente_id INT UNSIGNED NOT NULL,
    curso      VARCHAR(20)  NOT NULL,                 -- p. ej. "2do A"
    estado     ENUM('pendiente','usado','expirado') NOT NULL DEFAULT 'pendiente',
    usuario_id INT UNSIGNED NULL,                     -- quién lo consumió
    creado_en  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_en  TIMESTAMP    NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_inv_docente FOREIGN KEY (docente_id) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_inv_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    INDEX idx_inv_docente (docente_id)
) ENGINE = InnoDB;

-- ------------------------------------------------------------
-- 4. CUENTA ADMIN INICIAL (admin / admin123 — CAMBIARLA en cuanto
--    entres, desde el propio panel o con scripts/crearUsuario.js).
-- ------------------------------------------------------------
INSERT INTO usuarios (username, password_hash, rol) VALUES
    ('admin', '$2b$10$i.zRZVABI1pk8Pd5d4UL9uPmybN2bAP4KeGYq0qKAAHwOQrVDenYC', 'admin')
ON DUPLICATE KEY UPDATE rol = 'admin';

-- El docente semilla queda asignado a todas las materias para no perder
-- acceso durante la transición (el admin puede recortar esto luego).
INSERT IGNORE INTO docente_materia (docente_id, materia_id)
SELECT u.id, m.id FROM usuarios u JOIN materias m
WHERE u.username = 'docente';

SELECT id, username, rol FROM usuarios;
