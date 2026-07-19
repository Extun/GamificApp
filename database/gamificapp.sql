-- ============================================================
-- GamificApp — Esquema COMPLETO de la base de datos (desarrollo local)
-- Unidad Educativa Fiscal Clemencia Coronel De Pincay
--
-- Crea la base `gamificapp` con todas las tablas en su forma final
-- (incluye lo que antes vivía en las migraciones) y los datos semilla.
-- Es idempotente: puede ejecutarse las veces que haga falta.
--
-- Para PRODUCCIÓN (Aiven, base ya existente `defaultdb`) usa en su
-- lugar database/produccion_defaultdb.sql (mismo esquema, sin
-- CREATE DATABASE/USE).
--
-- Ejecución:  mysql -u root -p < database/gamificapp.sql
--
-- Usuarios semilla (CAMBIA estas claves al entrar):
--   admin      / admin123        (rol admin)
--   docente    / docente123      (rol docente)
--   estudiante / estudiante123   (rol estudiante, vinculado al demo id 1)
-- ============================================================

CREATE DATABASE IF NOT EXISTS gamificapp
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_spanish_ci;

USE gamificapp;

-- ------------------------------------------------------------
-- 1. TABLAS
-- ------------------------------------------------------------

-- Materias dinámicas (SPEC-002): el admin las gestiona desde su panel.
-- `activa = FALSE` oculta la materia sin romper retos/materiales asociados.
CREATE TABLE IF NOT EXISTS materias (
    id           TINYINT UNSIGNED NOT NULL,
    nombre       VARCHAR(60)      NOT NULL UNIQUE,
    color        VARCHAR(7)       NOT NULL DEFAULT '#e0f2fe',
    icono        VARCHAR(8)       NOT NULL DEFAULT '📚',
    activa       BOOLEAN          NOT NULL DEFAULT TRUE,
    orden        INT UNSIGNED     NOT NULL DEFAULT 0,
    descripcion  VARCHAR(200)     NULL,
    banner_data  MEDIUMTEXT       NULL,
    competencias TEXT             NULL,
    nivel        VARCHAR(60)      NULL,
    protegida    BOOLEAN          NOT NULL DEFAULT FALSE,
    PRIMARY KEY (id)
) ENGINE = InnoDB;

-- Catálogo de cursos (SPEC-002): solo el admin los crea; los docentes
-- eligen de esta lista al generar invitaciones.
CREATE TABLE IF NOT EXISTS cursos (
    id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nombre    VARCHAR(20)  NOT NULL,
    paralelo  VARCHAR(5)   NOT NULL,
    nivel     VARCHAR(30)  NULL,
    activo    BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_curso (nombre, paralelo)
) ENGINE = InnoDB;

-- Configuración institucional (SPEC-002): fila única (id = 1). Logo y
-- favicon como data URL (mismo patrón base64 que `materiales`).
CREATE TABLE IF NOT EXISTS institucion (
    id               TINYINT UNSIGNED NOT NULL DEFAULT 1,
    nombre           VARCHAR(160) NOT NULL,
    ciudad           VARCHAR(80)  NULL,
    provincia        VARCHAR(80)  NULL,
    pais             VARCHAR(80)  NULL,
    logo_data        MEDIUMTEXT   NULL,
    favicon_data     TEXT         NULL,
    color_principal  VARCHAR(7)   NULL,
    color_secundario VARCHAR(7)   NULL,
    anio_lectivo     VARCHAR(20)  NULL,
    xp_escala_max    INT UNSIGNED NOT NULL DEFAULT 1000,
    config_json      JSON         NULL,
    actualizado_en   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT chk_institucion_singleton CHECK (id = 1)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS estudiantes (
    id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nombres          VARCHAR(80)  NOT NULL,
    apellidos        VARCHAR(80)  NOT NULL,
    curso            VARCHAR(20)  NOT NULL,          -- p. ej. "2do A"
    -- Relación al catálogo de cursos; el VARCHAR queda de respaldo (SPEC-002).
    curso_id         INT UNSIGNED NULL,
    -- Origen del PIN por defecto del estudiante (DDMMAA).
    fecha_nacimiento DATE         NULL,
    xp_total         INT UNSIGNED NOT NULL DEFAULT 0,
    creado_en        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_est_curso FOREIGN KEY (curso_id) REFERENCES cursos (id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    -- El ranking Top N ordena por XP acumulado; este índice lo vuelve
    -- una lectura directa sin escaneo completo de la tabla.
    INDEX idx_estudiantes_xp (xp_total DESC)
) ENGINE = InnoDB;

-- Un reto pertenece SIEMPRE a una de las 5 materias oficiales.
-- `tipo` es un slug libre ('quiz', 'clasificador', ...): registrar un juego
-- nuevo NO requiere migrar la BD. `configuracion_json` guarda la mecánica
-- creada por el docente en el editor no-code.
CREATE TABLE IF NOT EXISTS retos (
    id                 INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    materia_id         TINYINT UNSIGNED NOT NULL,
    titulo             VARCHAR(120)     NOT NULL,
    tipo               VARCHAR(30)      NOT NULL DEFAULT 'quiz',
    descripcion        TEXT             NULL,
    configuracion_json JSON             NULL,
    xp_recompensa      INT UNSIGNED     NOT NULL DEFAULT 100,
    estado             ENUM('borrador','publicado','archivado') NOT NULL DEFAULT 'borrador',
    -- Autoría (SPEC-004). Sin FK inline: `usuarios` se crea después; la FK
    -- fk_retos_docente la agrega initDb.js (migración 005).
    docente_id         INT UNSIGNED     NULL,
    -- Centro de Trabajo Docente (SPEC-006, migración 008). curso_id sin FK
    -- inline: `cursos` se crea después; la agrega initDb.js (fk_retos_curso).
    origen             VARCHAR(10)      NOT NULL DEFAULT 'manual',
    favorito           BOOLEAN          NOT NULL DEFAULT FALSE,
    dificultad         VARCHAR(10)      NULL,
    curso_id           INT UNSIGNED     NULL,
    eliminado_en       DATETIME         NULL,
    eliminado_por      VARCHAR(50)      NULL,
    creado_en          TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_retos_materia
        FOREIGN KEY (materia_id) REFERENCES materias (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    INDEX idx_retos_materia (materia_id)
) ENGINE = InnoDB;

-- Progreso de cada estudiante en cada reto. La pareja
-- (estudiante_id, reto_id) es única: un registro por intento vigente.
CREATE TABLE IF NOT EXISTS progreso_estudiante (
    id             INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    estudiante_id  INT UNSIGNED     NOT NULL,
    reto_id        INT UNSIGNED     NOT NULL,
    porcentaje     TINYINT UNSIGNED NOT NULL DEFAULT 0,   -- 0 a 100
    -- Mejor calificación académica /100 (SPEC-015, migración 010). NULL =
    -- el flujo que registró el intento aún no envía aciertos/total.
    calificacion   TINYINT UNSIGNED NULL,
    xp_obtenido    INT UNSIGNED     NOT NULL DEFAULT 0,
    completado     BOOLEAN          NOT NULL DEFAULT FALSE,
    -- Libro de Calificaciones (SPEC-006, migración 008).
    observacion    VARCHAR(400)     NULL,
    revisado       BOOLEAN          NOT NULL DEFAULT FALSE,
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

-- Credenciales (contraseñas/PIN SIEMPRE como hash bcrypt, nunca en claro).
CREATE TABLE IF NOT EXISTS usuarios (
    id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
    username          VARCHAR(50)  NOT NULL UNIQUE,
    nombre_completo   VARCHAR(120) NULL,
    password_hash     VARCHAR(100) NOT NULL,
    pin_hash          VARCHAR(100) NULL,
    codigo_emergencia VARCHAR(8)   NULL UNIQUE,
    rol               ENUM('admin','docente','estudiante') NOT NULL DEFAULT 'estudiante',
    estudiante_id     INT UNSIGNED NULL,
    -- Rate limiting: 5 fallos seguidos => bloqueo de 15 minutos.
    intentos_fallidos TINYINT UNSIGNED NOT NULL DEFAULT 0,
    bloqueado_hasta   TIMESTAMP    NULL,
    -- Foto de perfil del docente (SPEC-004), data URL base64.
    foto_data         MEDIUMTEXT   NULL,
    creado_en         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_usuarios_estudiante
        FOREIGN KEY (estudiante_id) REFERENCES estudiantes (id)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE = InnoDB;

-- Retroalimentación docente (SPEC-004): observaciones privadas del docente
-- asociadas a un estudiante. No son comentarios públicos.
CREATE TABLE IF NOT EXISTS retroalimentaciones (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    docente_id    INT UNSIGNED NOT NULL,
    estudiante_id INT UNSIGNED NOT NULL,
    mensaje       VARCHAR(400) NOT NULL,
    creado_en     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_retro_docente FOREIGN KEY (docente_id)
        REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_retro_estudiante FOREIGN KEY (estudiante_id)
        REFERENCES estudiantes (id) ON UPDATE CASCADE ON DELETE CASCADE,
    INDEX idx_retro_estudiante (estudiante_id)
) ENGINE = InnoDB;

-- Material de estudio: fuente única de verdad. `data_url` guarda el archivo
-- en base64; `is_private` separa el material público del privado del docente.
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

-- Cada docente solo gestiona las materias que el admin le asignó.
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

-- Códigos de un solo uso (6 caracteres, 7 días) que el docente reparte en
-- clase para que sus estudiantes se registren solos.
CREATE TABLE IF NOT EXISTS invitaciones_estudiante (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    codigo     VARCHAR(6)   NOT NULL UNIQUE,
    docente_id INT UNSIGNED NOT NULL,
    curso      VARCHAR(20)  NOT NULL,                 -- p. ej. "2do A"
    curso_id   INT UNSIGNED NULL,
    estado     ENUM('pendiente','usado','expirado') NOT NULL DEFAULT 'pendiente',
    usuario_id INT UNSIGNED NULL,                     -- quién lo consumió
    creado_en  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_en  TIMESTAMP    NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_inv_docente FOREIGN KEY (docente_id) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_inv_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_inv_curso FOREIGN KEY (curso_id) REFERENCES cursos (id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    INDEX idx_inv_docente (docente_id)
) ENGINE = InnoDB;

-- ------------------------------------------------------------
-- 2. DATOS SEMILLA
-- ------------------------------------------------------------

-- Materias oficiales iniciales. INSERT IGNORE a propósito: ahora se editan
-- desde el panel del admin y este script no debe pisar esos cambios.
INSERT IGNORE INTO materias (id, nombre, color, icono) VALUES
    (1, 'Matemáticas',         '#e0f2fe', '🔢'),
    (2, 'Lengua y Literatura', '#fce7f3', '📖'),
    (3, 'Ciencias Naturales',  '#dcfce7', '🌱'),
    (4, 'Ciencias Sociales',   '#fef3c7', '🌎'),
    (5, 'Educación Física',    '#ede9fe', '⚽'),
    (6, 'Inglés',              '#ffe4e6', '🗣️');

-- Fila única de configuración institucional (editable desde el panel).
INSERT IGNORE INTO institucion (id, nombre, ciudad, provincia, pais)
VALUES (1, 'Unidad Educativa Fiscal Clemencia Coronel de Pincay', 'Guayaquil', 'Guayas', 'Ecuador');

-- Estudiante demo (id 1): la sesión de estudiante se vincula a esta fila.
INSERT INTO estudiantes (id, nombres, apellidos, curso)
VALUES (1, 'Estudiante', 'Demo', '2do A')
ON DUPLICATE KEY UPDATE curso = VALUES(curso);

-- Usuarios iniciales. Cambia las claves con: node server/scripts/crearUsuario.js
INSERT INTO usuarios (username, password_hash, rol, estudiante_id) VALUES
    ('admin',      '$2b$10$i.zRZVABI1pk8Pd5d4UL9uPmybN2bAP4KeGYq0qKAAHwOQrVDenYC', 'admin',      NULL),
    ('docente',    '$2b$10$TrnHcucqGS53KEM5qrv/W.eLG/IGOh7T0aOwRHfY28wZ6NYgg8qGG', 'docente',    NULL),
    ('estudiante', '$2b$10$P1ORlUCwJrGZIayNPbc00etpS9xbkqtZYCuC9OH9wKQYXeqS5YccS', 'estudiante', 1)
ON DUPLICATE KEY UPDATE rol = VALUES(rol);

-- El docente semilla queda asignado a todas las materias.
INSERT IGNORE INTO docente_materia (docente_id, materia_id)
SELECT u.id, m.id FROM usuarios u JOIN materias m
WHERE u.username = 'docente';

-- ------------------------------------------------------------
-- 3. VERIFICACIÓN RÁPIDA
-- ------------------------------------------------------------

SELECT id, nombre FROM materias ORDER BY id;
SELECT id, username, rol FROM usuarios ORDER BY id;
