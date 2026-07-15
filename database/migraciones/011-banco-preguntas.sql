-- Migración 011 (SPEC-010) — Repositorio de Preguntas.
-- Aditiva y opcional: solo crea la tabla banco_preguntas; ninguna tabla
-- existente cambia. Sin aplicarla, la app funciona igual (el módulo del
-- repositorio simplemente no tiene datos que servir).
-- server/initDb.js la aplica idempotente en cada arranque.

CREATE TABLE IF NOT EXISTS banco_preguntas (
    id                 INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    materia_id         TINYINT UNSIGNED NOT NULL,
    tema               VARCHAR(120)     NULL,
    tipo               VARCHAR(30)      NOT NULL,
    dificultad         VARCHAR(10)      NULL,
    enunciado          VARCHAR(255)     NULL,
    contenido_json     JSON             NOT NULL,
    explicacion        TEXT             NULL,
    etiquetas          VARCHAR(255)     NULL,
    origen             VARCHAR(10)      NOT NULL DEFAULT 'manual',
    estado             ENUM('pendiente','aprobada','archivada') NOT NULL DEFAULT 'aprobada',
    veces_utilizada    INT UNSIGNED     NOT NULL DEFAULT 0,
    ultima_utilizacion DATETIME         NULL,
    tiempo_estimado    SMALLINT UNSIGNED NULL,
    creado_por         INT UNSIGNED     NULL,
    creado_en          TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en     TIMESTAMP        NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_banco_materia FOREIGN KEY (materia_id)
        REFERENCES materias (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_banco_creador FOREIGN KEY (creado_por)
        REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE SET NULL,
    INDEX idx_banco_materia_tipo (materia_id, tipo),
    INDEX idx_banco_estado (estado)
) ENGINE = InnoDB;
