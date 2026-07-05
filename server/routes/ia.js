// Proxy de IA (Gemini) — la API key vive SOLO aquí, en el servidor.
// Antes el frontend llamaba a Gemini con VITE_GEMINI_API_KEY, lo que
// exponía la clave a cualquiera que abriera el JS de la app.
//
//   POST /api/ia/quiz      → genera preguntas de quiz (JSON estructurado)
//   POST /api/ia/asistente → respuesta libre del asistente del docente
//
// Ambas rutas exigen rol docente/admin (montadas tras `autenticar`).
import { Router } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import { soloDocente } from '../middleware/auth.js';

const router = Router();

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

// Esquema que obliga a Gemini a devolver el quiz como JSON estructurado.
const QUIZ_SCHEMA = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            pregunta: { type: Type.STRING },
            alternativas: {
                type: Type.OBJECT,
                properties: {
                    A: { type: Type.STRING },
                    B: { type: Type.STRING },
                    C: { type: Type.STRING },
                    D: { type: Type.STRING }
                },
                required: ['A', 'B', 'C', 'D']
            },
            correcta: { type: Type.STRING, description: 'Letra de la alternativa correcta: A, B, C o D' },
            justificacion: { type: Type.STRING }
        },
        required: ['pregunta', 'alternativas', 'correcta', 'justificacion']
    }
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
const generarConReintentos = async (config) => {
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

const parsearQuiz = (texto = '') => {
    const limpio = texto.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const data = JSON.parse(limpio);
    const preguntas = Array.isArray(data) ? data : data?.preguntas;
    if (!Array.isArray(preguntas) || !preguntas.length) {
        throw new Error('La IA no devolvió preguntas en el formato esperado.');
    }
    return preguntas;
};

// ---- POST /api/ia/quiz ----
// Body: { materia, tema, cantidad, existentes?: [enunciados ya usados] }
router.post('/quiz', soloDocente, async (req, res, next) => {
    const materia = String(req.body?.materia || '').trim().slice(0, 60);
    const tema = String(req.body?.tema || '').trim().slice(0, 200);
    const cantidad = Math.min(Math.max(Number(req.body?.cantidad) || 3, 1), 10);
    const existentes = Array.isArray(req.body?.existentes)
        ? req.body.existentes.map((p) => String(p).trim()).filter(Boolean).slice(0, 50)
        : [];

    if (!materia || !tema) {
        return res.status(400).json({ error: 'Se requieren materia y tema' });
    }

    const reglas =
        `REGLAS ESTRICTAS:\n` +
        `1. Regla de Veracidad: Utiliza únicamente información verificada y factual. ` +
        `Si no tienes certeza sobre un dato, no lo inventes.\n` +
        `2. Regla de Unicidad: Antes de generar una nueva pregunta, analiza la lista de ` +
        `preguntas existentes en el quiz actual y asegúrate de que la nueva pregunta no sea ` +
        `duplicada ni conceptualmente idéntica a ninguna de ellas.`;

    const bloqueExistentes = existentes.length
        ? `\n\nPreguntas que YA existen en el quiz (NO las repitas ni reformules):\n` +
          existentes.map((q, idx) => `${idx + 1}. ${q}`).join('\n')
        : '';

    const prompt =
        `Eres un docente experto en ${materia}. Genera un quiz de opción múltiple ` +
        `sobre el tema '${tema}' con EXACTAMENTE ${cantidad} preguntas. Cada pregunta debe tener ` +
        `4 alternativas (A–D), indicar la letra de la respuesta correcta y una justificación. ` +
        `Usa lenguaje pedagógico para educación básica, en español. ` +
        `Devuelve EXACTAMENTE ${cantidad} preguntas, ni más ni menos.\n\n` +
        reglas +
        bloqueExistentes;

    try {
        const respuesta = await generarConReintentos({
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: QUIZ_SCHEMA }
        });
        res.json({ preguntas: parsearQuiz(respuesta.text) });
    } catch (err) {
        console.error('IA/quiz:', err.message);
        res.status(502).json({ error: 'No se pudo generar el quiz con la IA. Inténtalo de nuevo.' });
    }
});

// ---- POST /api/ia/asistente ----
// Body: { mensaje } → { texto }
router.post('/asistente', soloDocente, async (req, res) => {
    const mensaje = String(req.body?.mensaje || '').trim().slice(0, 4000);
    if (!mensaje) return res.status(400).json({ error: 'Escribe un mensaje' });

    try {
        const respuesta = await generarConReintentos({ contents: mensaje });
        res.json({ texto: respuesta.text });
    } catch (err) {
        console.error('IA/asistente:', err.message);
        res.status(502).json({ error: 'No se pudo obtener la respuesta de la IA. Inténtalo de nuevo.' });
    }
});

export default router;
