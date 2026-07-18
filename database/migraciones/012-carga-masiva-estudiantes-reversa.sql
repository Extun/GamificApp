-- Reversa de 012 — Carga masiva de estudiantes (SPEC-014).
-- Deshace columnas e índices en orden inverso. No borra datos de estudiantes.

DROP INDEX uq_est_curso_nombre ON estudiantes;

ALTER TABLE estudiantes
    DROP COLUMN registrado_por;

ALTER TABLE usuarios
    DROP INDEX idx_usuarios_nombre_norm,
    DROP COLUMN nombre_norm;

ALTER TABLE usuarios
    DROP COLUMN codigo_acceso_hash,
    DROP COLUMN codigo_acceso_pista,
    DROP COLUMN codigo_acceso_usado_en;
