-- SPEC-017 — Estado administrativo de los tipos de juego.
--
-- ⚠️ REFERENCIA DOCUMENTAL. Este archivo NO se ejecuta automáticamente.
-- La migración real es `migrarTiposJuego(conn)` en `server/initDb.js`
-- (ver docs/architecture/MASTER_PLAN.md §6).
--
-- Esta tabla NO guarda juegos: los tipos los implementa el desarrollador en el
-- registro (server/lib/juegos/tipos/). Aquí solo se persiste si cada tipo está
-- disponible para crear y/o para jugar.
--
-- NO se siembra ninguna fila a propósito: sin fila, un tipo se considera
-- 'activo', que es el comportamiento anterior a esta spec. Desplegar la
-- migración no cambia nada.
--
-- Cambiar de estado NUNCA elimina actividades, configuraciones, progreso,
-- calificaciones ni XP: esta tabla es independiente de `retos` y de
-- `progreso_estudiante`, y no tiene relación de borrado con ellas.

CREATE TABLE IF NOT EXISTS tipos_juego (
    tipo            VARCHAR(30)  NOT NULL PRIMARY KEY,
    estado          ENUM('activo', 'solo_jugar', 'deshabilitado') NOT NULL DEFAULT 'activo',
    actualizado_en  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    actualizado_por INT UNSIGNED NULL
) ENGINE = InnoDB;
