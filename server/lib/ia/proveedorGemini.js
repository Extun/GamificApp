// Adaptador de Google Gemini (SPEC-016, Fase 2).
//
// Es la lógica que vivía en lib/iaCliente.js, movida SIN cambios de
// comportamiento: misma API key, mismo descubrimiento dinámico de modelos
// "flash", mismos reintentos y mismos criterios de error temporal. Cualquier
// diferencia de resultado frente a la versión anterior es un bug.
import { GoogleGenAI } from '@google/genai';

const MAX_INTENTOS = 3;
const ESPERA_MS = 2000;
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let genAI = null;
const cliente = () => {
    if (!process.env.GEMINI_API_KEY) {
        const err = new Error('Falta GEMINI_API_KEY en el servidor');
        err.status = 503;
        throw err;
    }
    genAI ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    return genAI;
};

// Errores temporales del lado de Google: saturación (503) o cuota (429).
const esTemporal = (err) =>
    err?.status === 503 || err?.status === 429 ||
    /\b(503|429)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand/i.test(err?.message ?? '');

// Descubre los modelos "flash" válidos de la cuenta, ordenados por preferencia.
let candidatosCache = null;
const resolverModelos = async (modeloFijado) => {
    if (modeloFijado) return [modeloFijado];
    if (candidatosCache) return candidatosCache;

    const NO_TEXTO = /image|tts|audio|embedding|vision|veo|imagen|lyria|robotics/i;
    const disponibles = [];
    for await (const m of await cliente().models.list()) {
        const metodos = m?.supportedActions || m?.supportedGenerationMethods || [];
        const soportaGenerar = !metodos.length || metodos.includes('generateContent');
        const nombre = m?.name?.replace(/^models\//, '') ?? '';
        if (soportaGenerar && nombre && !NO_TEXTO.test(nombre)) disponibles.push(nombre);
    }

    const flash = disponibles.filter((n) => n.toLowerCase().includes('flash'));
    if (!flash.length) throw new Error('No hay ningún modelo "flash" disponible en esta cuenta.');

    const puntua = (n) => {
        let p = 0;
        if (n.includes('lite')) p -= 6;
        if (n.includes('latest')) p -= 4;
        if (/preview|exp/.test(n)) p += 3;
        return p;
    };
    flash.sort((a, b) => puntua(a) - puntua(b));
    candidatosCache = flash;
    return flash;
};

// Recorre los modelos candidatos con reintentos ante saturación/cuota.
const generarConReintentos = async (config, modeloFijado) => {
    const candidatos = await resolverModelos(modeloFijado);
    let ultimoError = null;
    for (const model of candidatos) {
        for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
            try {
                return await cliente().models.generateContent({ model, ...config });
            } catch (err) {
                ultimoError = err;
                if (esTemporal(err) && intento < MAX_INTENTOS) {
                    await dormir(ESPERA_MS);
                    continue;
                }
                break;
            }
        }
    }
    throw ultimoError ?? new Error('No se obtuvo respuesta de ningún modelo.');
};

const limpiarJSON = (texto) =>
    String(texto ?? '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

export const proveedorGemini = {
    id: 'gemini',
    etiqueta: 'Google Gemini',
    variableEntorno: 'GEMINI_API_KEY',
    disponible: () => Boolean(process.env.GEMINI_API_KEY),

    // Catálogo DINÁMICO: se consulta la cuenta real y se filtra con las reglas
    // de este adaptador (los mismos "flash" que ya usaba la autodetección).
    // No hay lista hardcodeada que envejezca: los modelos nuevos aparecen
    // solos mientras cumplan el filtro.
    listarModelos: async () => resolverModelos(null),

    generarJSON: async ({ prompt, schema, modelo }) => {
        const respuesta = await generarConReintentos({
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: schema }
        }, modelo);
        return JSON.parse(limpiarJSON(respuesta.text));
    },

    generarTexto: async ({ prompt, modelo }) => {
        const respuesta = await generarConReintentos({ contents: prompt }, modelo);
        return String(respuesta.text ?? '');
    },

    clasificarError: (err) => {
        const msg = err?.message ?? '';
        if (err?.status === 401 || err?.status === 403 ||
            /API[_ ]?key|PERMISSION_DENIED|UNAUTHENTICATED|invalid.*credential/i.test(msg)) {
            return 'credencial';
        }
        if (err?.status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(msg)) return 'cuota';
        if (esTemporal(err)) return 'temporal';
        if (err instanceof SyntaxError) return 'formato';
        return 'permanente';
    },

    // Solo para pruebas de conexión: evita reutilizar un cliente con una key vieja.
    _resetCache: () => { genAI = null; candidatosCache = null; }
};

// Export interno para el re-export de compatibilidad de lib/iaCliente.js.
export { generarConReintentos };

export default proveedorGemini;
