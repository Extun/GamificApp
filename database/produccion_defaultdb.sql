-- ============================================================
-- GamificApp — Script único para la base de datos de PRODUCCIÓN
-- (Render/MySQL gestionado, base ya existente llamada `defaultdb`)
--
-- A diferencia de database/gamificapp.sql, este script NO ejecuta
-- CREATE DATABASE ni USE: se aplica sobre la base a la que ya
-- estás conectado (defaultdb). Reúne, en su forma FINAL, el
-- esquema base + todas las migraciones. Es idempotente.
--
-- Cómo ejecutarlo (desde tu PC, con las credenciales de Render):
--   mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p <DB_NAME> \
--         < database/produccion_defaultdb.sql
--
-- Usuarios: este script NO crea cuentas con claves públicas. La cuenta
-- admin la crea el servidor al arrancar (server/initDb.js) con la
-- contraseña de la variable de entorno ADMIN_PASSWORD. Los docentes se
-- crean desde el panel del admin, y los estudiantes con invitaciones.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLAS (forma final, con todas las columnas de las migraciones)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS materias (
    id          TINYINT UNSIGNED NOT NULL,
    nombre      VARCHAR(60)      NOT NULL UNIQUE,
    PRIMARY KEY (id)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS estudiantes (
    id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nombres          VARCHAR(80)  NOT NULL,
    apellidos        VARCHAR(80)  NOT NULL,
    curso            VARCHAR(20)  NOT NULL,
    fecha_nacimiento DATE         NULL,
    xp_total         INT UNSIGNED NOT NULL DEFAULT 0,
    creado_en        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_estudiantes_xp (xp_total DESC)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS retos (
    id                 INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    materia_id         TINYINT UNSIGNED NOT NULL,
    titulo             VARCHAR(120)     NOT NULL,
    tipo               VARCHAR(30)      NOT NULL DEFAULT 'quiz',
    descripcion        TEXT             NULL,
    configuracion_json JSON             NULL,
    xp_recompensa      INT UNSIGNED     NOT NULL DEFAULT 100,
    estado             ENUM('borrador','publicado','archivado') NOT NULL DEFAULT 'borrador',
    creado_en          TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_retos_materia
        FOREIGN KEY (materia_id) REFERENCES materias (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    INDEX idx_retos_materia (materia_id)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS progreso_estudiante (
    id             INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    estudiante_id  INT UNSIGNED     NOT NULL,
    reto_id        INT UNSIGNED     NOT NULL,
    porcentaje     TINYINT UNSIGNED NOT NULL DEFAULT 0,
    xp_obtenido    INT UNSIGNED     NOT NULL DEFAULT 0,
    completado     BOOLEAN          NOT NULL DEFAULT FALSE,
    actualizado_en TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_estudiante_reto (estudiante_id, reto_id),
    CONSTRAINT fk_progreso_estudiante
        FOREIGN KEY (estudiante_id) REFERENCES estudiantes (id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_progreso_reto
        FOREIGN KEY (reto_id) REFERENCES retos (id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT chk_porcentaje CHECK (porcentaje <= 100)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS usuarios (
    id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
    username          VARCHAR(50)  NOT NULL UNIQUE,
    nombre_completo   VARCHAR(120) NULL,
    password_hash     VARCHAR(100) NOT NULL,
    pin_hash          VARCHAR(100) NULL,
    codigo_emergencia VARCHAR(8)   NULL UNIQUE,
    rol               ENUM('admin','docente','estudiante') NOT NULL DEFAULT 'estudiante',
    estudiante_id     INT UNSIGNED NULL,
    intentos_fallidos TINYINT UNSIGNED NOT NULL DEFAULT 0,
    bloqueado_hasta   TIMESTAMP    NULL,
    creado_en         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_usuarios_estudiante
        FOREIGN KEY (estudiante_id) REFERENCES estudiantes (id)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE = InnoDB;

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
        ON UPDATE CASCADE ON DELETE RESTRICT,
    INDEX idx_materiales_materia (materia_id)
) ENGINE = InnoDB;

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

CREATE TABLE IF NOT EXISTS invitaciones_estudiante (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    codigo     VARCHAR(6)   NOT NULL UNIQUE,
    docente_id INT UNSIGNED NOT NULL,
    curso      VARCHAR(20)  NOT NULL,
    estado     ENUM('pendiente','usado','expirado') NOT NULL DEFAULT 'pendiente',
    usuario_id INT UNSIGNED NULL,
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
-- 2. DATOS SEMILLA
-- ------------------------------------------------------------

-- 5 materias oficiales (IDs fijos que referencian frontend y backend).
INSERT INTO materias (id, nombre) VALUES
    (1, 'Matemáticas'),
    (2, 'Lenguaje'),
    (3, 'Ciencias Naturales'),
    (4, 'Ciencias Sociales'),
    (5, 'Educación Física')
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);

-- ------------------------------------------------------------
-- 3. VERIFICACIÓN
-- ------------------------------------------------------------
SELECT id, nombre FROM materias ORDER BY id;
