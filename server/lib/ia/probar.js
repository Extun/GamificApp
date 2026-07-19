// "Probar conexión" (SPEC-016, Fase 4).
//
// Ejercita la MISMA cadena que usa la generación de actividades:
//   configuración → registro de proveedor → adaptador → proveedor real →
//   respuesta estructurada válida
//
// Usa `generarJSON` con un esquema mínimo, no una petición trivial: comprobar
// solo que la API key existe no garantizaría que la salida estructurada
// funcione, que es la capacidad crítica para crear actividades.
//
// Coste: un prompt de una línea y un objeto de dos campos. Deliberadamente
// barato; NO genera una actividad completa.
import { Tipo } from './esquema.js';
import { obtenerProveedor } from './registro.js';
import { leerConfiguracion } from './config.js';
import { registrarErrorIA } from './errores.js';

const ESQUEMA_PRUEBA = {
    type: Tipo.OBJECT,
    properties: {
        ok: { type: Tipo.BOOLEAN, description: 'Siempre true' },
        color: { type: Tipo.STRING, description: 'La palabra "azul"' }
    },
    required: ['ok', 'color']
};

const PROMPT_PRUEBA =
    'Prueba de conexión. Responde en JSON con ok=true y color="azul". No añadas nada más.';

// Mensajes para el ADMINISTRADOR: útiles para diagnosticar, pero sin secretos,
// headers internos ni detalles crudos del proveedor.
const MENSAJE = {
    credencial: 'La clave configurada en el servidor fue rechazada por el proveedor. Revisa su valor en las variables de entorno.',
    cuota: 'El proveedor rechazó la petición por límite de uso o cuota agotada. Inténtalo más tarde o revisa el plan de la cuenta.',
    temporal: 'El proveedor no está disponible en este momento (saturación). Vuelve a intentarlo en unos minutos.',
    formato: 'El proveedor respondió, pero no devolvió JSON válido con el modelo elegido. Prueba con otro modelo.',
    permanente: 'No se pudo completar la prueba con este proveedor y modelo.'
};

// `candidata` permite probar una configuración ANTES de guardarla: así un
// proveedor/modelo que no funciona nunca llega a sustituir al que ya está en
// uso (SPEC-016 §4.6). Sin argumento, prueba la configuración activa.
export const probarConexion = async (candidata = null) => {
    const inicio = Date.now();
    const activa = await leerConfiguracion();
    const id = candidata?.proveedor ?? activa.proveedor;
    const modelo = candidata ? (candidata.modelo || null) : activa.modelo;
    const origen = candidata ? 'candidata' : activa.origen;
    const proveedor = obtenerProveedor(id);

    const base = { proveedor: id, modelo: modelo || 'automático', origen };

    if (!proveedor) {
        return { ...base, ok: false, categoria: 'permanente', error: `El proveedor "${id}" no existe en esta versión de la aplicación.` };
    }
    if (!proveedor.disponible()) {
        return {
            ...base,
            proveedor: proveedor.id,
            ok: false,
            categoria: 'credencial',
            error: `Falta la variable de entorno ${proveedor.variableEntorno} en el servidor. Configúrala en el entorno de despliegue.`
        };
    }

    try {
        const data = await proveedor.generarJSON({
            prompt: PROMPT_PRUEBA, schema: ESQUEMA_PRUEBA, modelo
        });
        const valido = data && typeof data === 'object' && 'ok' in data && 'color' in data;
        return {
            ...base,
            ok: Boolean(valido),
            latenciaMs: Date.now() - inicio,
            ...(valido ? {} : { categoria: 'formato', error: MENSAJE.formato })
        };
    } catch (err) {
        const categoria = proveedor.clasificarError(err);
        registrarErrorIA({ operacion: 'probar', proveedor: id, modelo: modelo || 'automatico', categoria, error: err });
        return {
            ...base,
            ok: false,
            latenciaMs: Date.now() - inicio,
            categoria,
            error: MENSAJE[categoria] ?? MENSAJE.permanente
        };
    }
};

export default probarConexion;
