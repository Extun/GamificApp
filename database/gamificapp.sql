-- ============================================================
-- GamificApp — Esquema y datos oficiales de la base de datos
-- Unidad Educativa Fiscal Clemencia Coronel De Pincay
--
-- Este script es idempotente: puede ejecutarse las veces que
-- haga falta. Siempre deja la tabla `materias` exactamente con
-- las 5 materias oficiales y elimina cualquier dato de prueba
-- previo en `materias`, `retos` y `progreso_estudiante`.
--
-- Ejecución:  mysql -u root -p < database/gamificapp.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS gamificapp
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_spanish_ci;

USE gamificapp;

-- ------------------------------------------------------------
-- 1. TABLAS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS materias (
    id          TINYINT UNSIGNED NOT NULL,
    nombre      VARCHAR(60)      NOT NULL UNIQUE,
    PRIMARY KEY (id)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS estudiantes (
    id          INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    nombres     VARCHAR(80)      NOT NULL,
    apellidos   VARCHAR(80)      NOT NULL,
    curso       VARCHAR(20)      NOT NULL,          -- p. ej. "2do A"
    xp_total    INT UNSIGNED     NOT NULL DEFAULT 0,
    creado_en   TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    -- El ranking Top N ordena por XP acumulado; este índice lo vuelve
    -- una lectura directa sin escaneo completo de la tabla.
    INDEX idx_estudiantes_xp (xp_total DESC)
) ENGINE = InnoDB;

-- Un reto pertenece SIEMPRE a una de las 5 materias oficiales.
-- ON DELETE RESTRICT impide borrar una materia que tenga retos,
-- garantizando que nunca queden retos huérfanos.
CREATE TABLE IF NOT EXISTS retos (
    id            INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    materia_id    TINYINT UNSIGNED NOT NULL,
    titulo        VARCHAR(120)     NOT NULL,
    -- Tipo de mecánica del reto ('quiz', 'clasificador', 'lectura', ...).
    -- Es un slug libre: registrar un juego nuevo NO requiere migrar la BD,
    -- solo insertar retos con su nuevo tipo y añadir su reproductor en el
    -- frontend. La validación de formato la hace la API.
    tipo          VARCHAR(30)      NOT NULL DEFAULT 'quiz',
    descripcion   TEXT             NULL,
    -- Configuración de la mecánica creada por el docente (categorías y
    -- elementos del clasificador, etc.). La escribe el editor no-code del
    -- panel docente y la consume el reproductor del estudiante.
    configuracion_json JSON        NULL,
    xp_recompensa INT UNSIGNED     NOT NULL DEFAULT 100,
    estado        ENUM('borrador','publicado','archivado') NOT NULL DEFAULT 'borrador',
    creado_en     TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_retos_materia
        FOREIGN KEY (materia_id) REFERENCES materias (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    INDEX idx_retos_materia (materia_id)
) ENGINE = InnoDB;

-- Progreso de cada estudiante en cada reto. La pareja
-- (estudiante_id, reto_id) es única: un registro por intento vigente.
CREATE TABLE IF NOT EXISTS progreso_estudiante (
    id             INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    estudiante_id  INT UNSIGNED     NOT NULL,
    reto_id        INT UNSIGNED     NOT NULL,
    porcentaje     TINYINT UNSIGNED NOT NULL DEFAULT 0,   -- 0 a 100
    xp_obtenido    INT UNSIGNED     NOT NULL DEFAULT 0,
    completado     BOOLEAN          NOT NULL DEFAULT FALSE,
    actualizado_en TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_estudiante_reto (estudiante_id, reto_id),
    CONSTRAINT fk_progreso_estudiante
        FOREIGN KEY (estudiante_id) REFERENCES estudiantes (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_progreso_reto
        FOREIGN KEY (reto_id) REFERENCES retos (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT chk_porcentaje CHECK (porcentaje <= 100)
) ENGINE = InnoDB;

-- ------------------------------------------------------------
-- 2. LIMPIEZA: elimina materias previas y todo dato de prueba
--    que dependa de ellas (retos y progreso asociados).
-- ------------------------------------------------------------

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE progreso_estudiante;
TRUNCATE TABLE retos;
TRUNCATE TABLE materias;
SET FOREIGN_KEY_CHECKS = 1;

-- ------------------------------------------------------------
-- 3. MATERIAS OFICIALES (IDs fijos: el frontend y el backend
--    referencian estos mismos IDs).
-- ------------------------------------------------------------

INSERT INTO materias (id, nombre) VALUES
    (1, 'Matemáticas'),
    (2, 'Lenguaje'),
    (3, 'Ciencias Naturales'),
    (4, 'Ciencias Sociales'),
    (5, 'Educación Física');

-- ------------------------------------------------------------
-- 4. ESTUDIANTE DEMO (id 1): el login de la app vincula la
--    sesión de estudiante a esta fila mientras no exista un
--    inicio de sesión individual por alumno.
-- ------------------------------------------------------------

INSERT INTO estudiantes (id, nombres, apellidos, curso)
VALUES (1, 'Estudiante', 'Demo', '2do A')
ON DUPLICATE KEY UPDATE curso = VALUES(curso);

-- ------------------------------------------------------------
-- 5. VERIFICACIÓN RÁPIDA
-- ------------------------------------------------------------

SELECT id, nombre FROM materias ORDER BY id;
