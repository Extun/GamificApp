-- 015 — El curso es una frontera de contenido (SPEC-026).
--
-- ⚠️ REFERENCIA DOCUMENTAL: las migraciones que de verdad se aplican son las
-- funciones idempotentes de `server/initDb.js` (aquí, `migrarFronteraCurso`).
-- Este archivo versiona el cambio para poder leerlo y revisarlo.
--
-- Hasta hoy `materiales` no sabía QUIÉN subió cada archivo, así que el material
-- de estudio no podía acotarse a un aula: un estudiante de 2do A veía los PDF
-- que el docente de 3ro A subió para su clase. Se le añaden las dos columnas
-- que `retos` ya tiene, para que la MISMA regla de alcance (server/lib/
-- alcanceCurso.js) sirva para las dos tablas sin duplicarse:
--
--   · docente_id — autor. Es lo que hace funcionar «todos MIS cursos».
--   · curso_id   — destino explícito. Reservado: hoy siempre NULL (no hay
--                  selector de curso al subir material, y no se inventa uno).
--
-- ADITIVA y no destructiva: las filas existentes quedan con ambas columnas en
-- NULL, es decir, contenido INSTITUCIONAL visible para todos. Desplegar esto
-- no le quita a ningún estudiante material que hoy ve (SPEC-026 §2.3).

ALTER TABLE materiales
    ADD COLUMN docente_id INT UNSIGNED NULL,
    ADD COLUMN curso_id   INT UNSIGNED NULL,
    ADD CONSTRAINT fk_materiales_docente FOREIGN KEY (docente_id)
        REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE SET NULL,
    ADD CONSTRAINT fk_materiales_curso FOREIGN KEY (curso_id)
        REFERENCES cursos (id) ON UPDATE CASCADE ON DELETE SET NULL;
