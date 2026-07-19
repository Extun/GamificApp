-- Reversa de 014-tipos-juego.sql (SPEC-017).
--
-- ⚠️ REFERENCIA DOCUMENTAL: ver la cabecera de 014-tipos-juego.sql.
--
-- Al eliminar la tabla, todos los tipos vuelven a considerarse 'activo'.
-- No se pierde ninguna actividad, progreso, calificación ni XP: esta tabla
-- solo guardaba preferencias de disponibilidad.

DROP TABLE IF EXISTS tipos_juego;
