// Cliente de IA (Gemini) compartido — extraído de routes/ia.js (SPEC-006).
// La API key vive SOLO aquí, en el servidor. Expone `generarJSON`, que
// resuelve el mejor modelo "flash" disponible, reintenta ante saturación y
// devuelve el JSON parseado según el esquema pedido.
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
const resolverModelos = async () => {
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
export const generarConReintentos = async (config) => {
    const candidatos = await resolverModelos();
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

// Pide a la IA un JSON con la forma de `schema` y lo devuelve parseado.
export const generarJSON = async ({ prompt, schema }) => {
    const respuesta = await generarConReintentos({
        contents: prompt,
        config: { responseMimeType: 'application/json', responseSchema: schema }
    });
    const limpio = String(respuesta.text ?? '').trim()
        .replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    return JSON.parse(limpio);
};

export default generarJSON;
