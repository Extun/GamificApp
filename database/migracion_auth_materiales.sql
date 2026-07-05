-- ============================================================
-- GamificApp — Migración: autenticación JWT y material centralizado
--
-- Crea:
--   · usuarios    → credenciales reales (reemplaza el login admin/admin)
--   · materiales  → material de estudio persistido en MySQL (antes vivía
--                   solo en el localStorage del navegador del docente)
--
-- Idempotente. Ejecución:
--   mysql -u root -p gamificapp < database/migracion_auth_materiales.sql
-- ============================================================

USE gamificapp;

-- ------------------------------------------------------------
-- 1. USUARIOS: la contraseña se guarda SIEMPRE como hash bcrypt,
--    nunca en texto plano. `estudiante_id` vincula la cuenta con
--    su fila de progreso cuando el rol es 'estudiante'.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    username      VARCHAR(50)   NOT NULL UNIQUE,
    password_hash VARCHAR(100)  NOT NULL,
    rol           ENUM('docente','estudiante') NOT NULL DEFAULT 'estudiante',
    estudiante_id INT UNSIGNED  NULL,
    creado_en     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_usuarios_estudiante
        FOREIGN KEY (estudiante_id) REFERENCES estudiantes (id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
) ENGINE = InnoDB;

-- Cuentas iniciales (hash bcrypt de las claves por defecto):
--   docente    / docente123
--   estudiante / estudiante123   (vinculada al estudiante demo id 1)
-- Cambia estas claves con: node server/scripts/crearUsuario.js
INSERT INTO usuarios (username, password_hash, rol, estudiante_id) VALUES
    ('docente',    '$2b$10$TrnHcucqGS53KEM5qrv/W.eLG/IGOh7T0aOwRHfY28wZ6NYgg8qGG', 'docente',    NULL),
    ('estudiante', '$2b$10$P1ORlUCwJrGZIayNPbc00etpS9xbkqtZYCuC9OH9wKQYXeqS5YccS', 'estudiante', 1)
ON DUPLICATE KEY UPDATE rol = VALUES(rol);

-- ------------------------------------------------------------
-- 2. MATERIALES: fuente única de verdad del material de estudio.
--    `data_url` guarda el archivo en base64 (LONGTEXT soporta
--    hasta 4 GB); `is_private` replica la separación
--    público/privado que ya usaba el panel del docente.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS materiales (
    id          INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    materia_id  TINYINT UNSIGNED NOT NULL,
    nombre      VARCHAR(255)     NOT NULL,
    kind        VARCHAR(20)      NOT NULL DEFAULT 'file',
    size_label  VARCHAR(20)      NULL,
    is_private  BOOLEAN          NOT NULL DEFAULT FALSE,
    page_count  INT UNSIGNED     NULL,
    thumbnail   MEDIUMTEXT       NULL,
    data_url    LONGTEXT         NULL,
    creado_en   TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_materiales_materia
        FOREIGN KEY (materia_id) REFERENCES materias (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    INDEX idx_materiales_materia (materia_id)
) ENGINE = InnoDB;

SELECT id, username, rol, estudiante_id FROM usuarios;
