-- Reversa de 013-configuracion-ia.sql (SPEC-016).
--
-- ⚠️ REFERENCIA DOCUMENTAL: ver la cabecera de 013-configuracion-ia.sql.
--
-- Al eliminar la tabla, el sistema vuelve a resolver el proveedor por
-- variables de entorno (IA_PROVEEDOR / IA_MODELO) y, en su defecto, a Gemini
-- con modelo automático. No se pierde ninguna actividad ni contenido: esta
-- tabla solo guarda preferencias de configuración.

DROP TABLE IF EXISTS configuracion_ia;
