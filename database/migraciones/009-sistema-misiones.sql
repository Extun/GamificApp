-- Migración 009 — Sistema de Misiones y Progresión (SPEC-007, Fase 5.5)
-- Aditiva: racha de actividad del estudiante + catálogo de misiones
-- (fuente única de verdad, escalable a cientos de misiones) + progreso por
-- estudiante. El SEED de las misiones iniciales lo aplica server/initDb.js de
-- forma idempotente (INSERT ... ON DUPLICATE KEY UPDATE por `clave`), igual
-- que corre en cada arranque contra la BD de producción; este script es para
-- aplicación manual (Aiven) tras el backup.

-- 1) Racha de actividad (constancia). Se actualiza en la transacción de
--    POST /api/progreso, con la fecha local institucional (UTC-5).
ALTER TABLE estudiantes
    ADD COLUMN racha_actual           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN racha_maxima           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN ultima_fecha_actividad DATE NULL;

-- 2) Catálogo de misiones (fuente única de verdad; nada hardcodeado en el front).
CREATE TABLE IF NOT EXISTS misiones (
    id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
    clave               VARCHAR(60)  NOT NULL UNIQUE,
    categoria           VARCHAR(20)  NOT NULL,
    tier                VARCHAR(10)  NOT NULL,
    titulo              VARCHAR(120) NOT NULL,
    descripcion         VARCHAR(255) NOT NULL,
    icono               VARCHAR(16)  NULL,
    tipo_objetivo       VARCHAR(40)  NOT NULL,
    objetivo_meta       INT UNSIGNED NOT NULL DEFAULT 1,
    objetivo_filtro     JSON         NULL,
    requiere_mision_id  INT UNSIGNED NULL,
    recompensa_xp       INT UNSIGNED NOT NULL DEFAULT 0,
    recompensa_insignia VARCHAR(60)  NULL,
    recompensa_banner   VARCHAR(60)  NULL,
    horizonte           VARCHAR(10)  NOT NULL DEFAULT 'corto',
    orden               INT UNSIGNED NOT NULL DEFAULT 0,
    activa              BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_en           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_misiones_categoria (categoria, orden),
    CONSTRAINT fk_mision_requiere FOREIGN KEY (requiere_mision_id)
        REFERENCES misiones (id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE = InnoDB;

-- 3) Progreso del estudiante en cada misión (progreso_actual = caché derivada).
CREATE TABLE IF NOT EXISTS mision_estudiante (
    id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    estudiante_id   INT UNSIGNED NOT NULL,
    mision_id       INT UNSIGNED NOT NULL,
    progreso_actual INT UNSIGNED NOT NULL DEFAULT 0,
    completada      BOOLEAN      NOT NULL DEFAULT FALSE,
    completada_en   DATETIME     NULL,
    actualizado_en  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_est_mision (estudiante_id, mision_id),
    CONSTRAINT fk_me_estudiante FOREIGN KEY (estudiante_id)
        REFERENCES estudiantes (id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_me_mision FOREIGN KEY (mision_id)
        REFERENCES misiones (id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE = InnoDB;
