// Configuración administrativa del proveedor de IA (SPEC-016, Fase 3).
//
// ⚠️ SEGURIDAD: aquí NUNCA se leen ni se guardan API keys. La tabla
// `configuracion_ia` solo persiste QUÉ proveedor y QUÉ modelo usar; los
// secretos viven exclusivamente en variables de entorno del backend.
//
// COMPATIBILIDAD: si la tabla no existe todavía (deploy a medias) o está
// vacía, se cae a las variables de entorno y, en su defecto, a Gemini con
// modelo automático — es decir, el comportamiento anterior a SPEC-016.
import pool from '../../db.js';
import { PROVEEDOR_POR_DEFECTO, obtenerProveedor } from './registro.js';

const TTL_MS = 30_000;
let cache = null;
let cacheEn = 0;

export const invalidarCache = () => { cache = null; cacheEn = 0; };

// Valor de respaldo cuando no hay fila en BD: variables de entorno y, si
// tampoco, Gemini automático.
const desdeEntorno = () => ({
    proveedor: String(process.env.IA_PROVEEDOR || '').trim() || PROVEEDOR_POR_DEFECTO,
    modelo: String(process.env.IA_MODELO || '').trim() || null,
    origen: 'entorno'
});

export const leerConfiguracion = async () => {
    if (cache && Date.now() - cacheEn < TTL_MS) return cache;
    let valor;
    try {
        const [[fila]] = await pool.query(
            'SELECT proveedor, modelo FROM configuracion_ia WHERE id = 1'
        );
        valor = fila
            ? { proveedor: fila.proveedor, modelo: fila.modelo || null, origen: 'bd' }
            : desdeEntorno();
    } catch (err) {
        // Tabla aún no migrada: no es un error, es una instalación previa.
        if (err?.code === 'ER_NO_SUCH_TABLE') valor = desdeEntorno();
        else throw err;
    }
    // Un proveedor guardado que ya no existe en el código no debe romper la
    // generación: se ignora y se usa el por defecto.
    if (!obtenerProveedor(valor.proveedor)) {
        valor = { ...valor, proveedor: PROVEEDOR_POR_DEFECTO, modelo: null, origen: `${valor.origen}-invalido` };
    }
    cache = valor;
    cacheEn = Date.now();
    return valor;
};

export const guardarConfiguracion = async ({ proveedor, modelo, usuarioId }) => {
    await pool.query(
        `INSERT INTO configuracion_ia (id, proveedor, modelo, actualizado_por)
         VALUES (1, ?, ?, ?)
         ON DUPLICATE KEY UPDATE proveedor = VALUES(proveedor),
                                 modelo = VALUES(modelo),
                                 actualizado_por = VALUES(actualizado_por)`,
        [proveedor, modelo || null, usuarioId ?? null]
    );
    invalidarCache();
};

export default leerConfiguracion;
