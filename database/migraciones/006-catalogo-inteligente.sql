ALTER TABLE materias
    ADD COLUMN orden        INT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN descripcion  VARCHAR(200) NULL,
    ADD COLUMN banner_data  MEDIUMTEXT   NULL,
    ADD COLUMN competencias TEXT         NULL,
    ADD COLUMN nivel        VARCHAR(60)  NULL,
    ADD COLUMN protegida    BOOLEAN      NOT NULL DEFAULT FALSE;

UPDATE materias SET orden = id WHERE orden = 0;
