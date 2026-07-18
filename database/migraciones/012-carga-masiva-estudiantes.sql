-- 012 — Carga masiva de estudiantes por Excel + activación por código (SPEC-014).
--
-- 1) Código de activación individual de un solo uso: se guarda SOLO como hash
--    bcrypt (codigo_acceso_hash). La "pista" son los 3 primeros caracteres en
--    claro, únicamente para que el docente coteje visualmente qué código es
--    (no permite reconstruirlo). codigo_acceso_usado_en marca la activación.
-- 2) nombre_norm: nombre normalizado NO único para localizar homónimos en el
--    login ("nombre localiza, PIN decide"). `username` sigue UNIQUE; los
--    homónimos reciben internamente un sufijo invisible (~2) que jamás se
--    muestra ni se teclea.
-- 3) estudiantes.registrado_por: qué docente/admin importó la fila (la vía
--    por invitación sigue usando invitaciones_estudiante).
-- 4) uq_est_curso_nombre: unicidad de (curso_id, nombres, apellidos) — dos
--    homónimos exactos en el MISMO curso se prohíben (se piden segundos
--    nombres en el Excel); en cursos distintos se permiten.
--
-- Idempotente vía initDb.js (migrarCargaMasiva); este archivo es la
-- referencia para ejecución manual.

ALTER TABLE usuarios
    ADD COLUMN codigo_acceso_hash     VARCHAR(100) NULL,
    ADD COLUMN codigo_acceso_pista    VARCHAR(3)   NULL,
    ADD COLUMN codigo_acceso_usado_en DATETIME     NULL;

ALTER TABLE usuarios
    ADD COLUMN nombre_norm VARCHAR(120) NULL,
    ADD INDEX idx_usuarios_nombre_norm (nombre_norm);

-- Backfill: para las cuentas de estudiante existentes el username ES el
-- nombre normalizado (así se crean en /registro-estudiante).
UPDATE usuarios SET nombre_norm = username
WHERE rol = 'estudiante' AND nombre_norm IS NULL;

ALTER TABLE estudiantes
    ADD COLUMN registrado_por INT UNSIGNED NULL;

-- Unicidad dentro del curso. OJO: con collation utf8mb4_spanish_ci,
-- "José" y "Jose" cuentan como iguales (deseado para detectar duplicados).
-- Las filas con curso_id NULL no se ven afectadas (NULL no colisiona).
CREATE UNIQUE INDEX uq_est_curso_nombre ON estudiantes (curso_id, nombres, apellidos);
