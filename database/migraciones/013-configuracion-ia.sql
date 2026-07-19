-- SPEC-016 — Configuración administrativa del proveedor de IA.
--
-- ⚠️ REFERENCIA DOCUMENTAL. Este archivo NO se ejecuta automáticamente.
-- La migración que realmente se aplica en cada arranque es la función
-- idempotente `migrarConfiguracionIA(conn)` de `server/initDb.js`
-- (ver docs/architecture/MASTER_PLAN.md §6). Este script sirve para
-- aplicarlo a mano y para dejar el cambio versionado.
--
-- SEGURIDAD: esta tabla NUNCA almacena API keys. Los secretos viven
-- exclusivamente en variables de entorno del backend (SPEC-016 §5).
-- Solo se guarda QUÉ proveedor y QUÉ modelo usar.

CREATE TABLE IF NOT EXISTS configuracion_ia (
    id                 TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
    proveedor          VARCHAR(30)  NOT NULL DEFAULT 'gemini',
    modelo             VARCHAR(60)  NULL,        -- NULL = automático (el adaptador elige)
    proveedor_respaldo VARCHAR(30)  NULL,        -- reservado: SPEC-016 NO implementa fallback
    actualizado_en     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    actualizado_por    INT UNSIGNED NULL,
    CONSTRAINT ck_configuracion_ia_fila_unica CHECK (id = 1)
);

-- Sin fila, el sistema usa 'gemini' + modelo automático: exactamente el
-- comportamiento anterior a SPEC-016. La fila NO se siembra a propósito, para
-- que desplegar esta migración no cambie nada de forma silenciosa.
