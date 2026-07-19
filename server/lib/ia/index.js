// Punto de entrada de la IA (SPEC-016) — agnóstico al proveedor.
//
// Expone `generarJSON({ prompt, schema })` con la MISMA firma que tenía
// lib/iaCliente.js, para que el registro de actividades y las rutas no se
// enteren de qué proveedor hay detrás.
//
// El proveedor y el modelo se resuelven en este orden (lib/ia/config.js):
//   1. tabla `configuracion_ia` (lo que elige el administrador);
//   2. variables de entorno IA_PROVEEDOR / IA_MODELO;
//   3. Gemini con modelo automático (comportamiento previo a SPEC-016).
//
// Las API keys se leen SIEMPRE del entorno del servidor. Nunca se guardan en
// la base de datos ni se devuelven por ningún endpoint (SPEC-016 §5).
import { PROVEEDORES, obtenerProveedor } from './registro.js';
import { leerConfiguracion } from './config.js';

// Resuelve proveedor + modelo activos, validando que sea usable.
export const resolverActivo = async () => {
    const { proveedor: id, modelo } = await leerConfiguracion();
    const proveedor = obtenerProveedor(id);
    if (!proveedor) {
        const err = new Error(
            `Proveedor de IA desconocido: "${id}". Disponibles: ${Object.keys(PROVEEDORES).join(', ')}.`
        );
        err.status = 503;
        throw err;
    }
    if (!proveedor.disponible()) {
        const err = new Error(`Falta ${proveedor.variableEntorno} en el servidor`);
        err.status = 503;
        throw err;
    }
    return { proveedor, modelo };
};

// Un JSON malformado gastaba el intento del docente: se concede UN reintento
// antes de rendirse (SPEC-016 §4.4).
const REINTENTOS_FORMATO = 1;

export const generarJSON = async ({ prompt, schema }) => {
    const { proveedor, modelo } = await resolverActivo();
    let ultimoError = null;

    for (let intento = 0; intento <= REINTENTOS_FORMATO; intento++) {
        try {
            return await proveedor.generarJSON({ prompt, schema, modelo });
        } catch (err) {
            ultimoError = err;
            if (proveedor.clasificarError(err) === 'formato' && intento < REINTENTOS_FORMATO) continue;
            throw err;
        }
    }
    throw ultimoError;
};

export const generarTexto = async ({ prompt }) => {
    const { proveedor, modelo } = await resolverActivo();
    return proveedor.generarTexto({ prompt, modelo });
};

export { PROVEEDORES, obtenerProveedor } from './registro.js';
export { leerConfiguracion, guardarConfiguracion, invalidarCache } from './config.js';
export { Tipo } from './esquema.js';

export default generarJSON;
