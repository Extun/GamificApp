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

// Esquema de una Misión Narrativa: una historia por episodios donde cada
// desafío matemático avanza la trama. Lo consume el reproductor RPG del
// estudiante tal cual, sin transformaciones.
const MISION_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        titulo: { type: Type.STRING, description: 'Título corto y atractivo de la aventura' },
        introduccion: { type: Type.STRING, description: 'Apertura narrativa que presenta el mundo y al héroe (3-4 frases, segunda persona)' },
        desafios: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    narrativa: { type: Type.STRING, description: 'Escena de la historia que plantea el problema (2-3 frases)' },
                    pregunta: { type: Type.STRING, description: 'El desafío matemático concreto' },
                    alternativas: {
                        type: Type.OBJECT,
                        properties: {
                            A: { type: Type.STRING },
                            B: { type: Type.STRING },
                            C: { type: Type.STRING }
                        },
                        required: ['A', 'B', 'C']
                    },
                    correcta: { type: Type.STRING, description: 'Letra de la alternativa correcta: A, B o C' },
                    pista: { type: Type.STRING, description: 'Pista amable si el niño se equivoca, sin dar la respuesta' },
                    exito: { type: Type.STRING, description: 'Frase narrativa que celebra el acierto y empuja la historia (1-2 frases)' }
                },
                required: ['narrativa', 'pregunta', 'alternativas', 'correcta', 'pista', 'exito']
            }
        },
        final: { type: Type.STRING, description: 'Cierre triunfal de la aventura (2-3 frases)' }
    },
    required: ['titulo', 'introduccion', 'desafios', 'final']
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
router.post('/quiz', soloDocente, async (req, res, _next) => {
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

// Valida y normaliza la misión que devolvió Gemini antes de entregarla al
// docente: si falta cualquier pieza de la historia, mejor fallar aquí que
// romper el reproductor del estudiante.
const parsearMision = (texto = '', cantidad = 3) => {
    const limpio = texto.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const data = JSON.parse(limpio);
    const desafios = Array.isArray(data?.desafios) ? data.desafios.slice(0, cantidad) : [];
    const completo = data?.titulo && data?.introduccion && data?.final &&
        desafios.length === cantidad &&
        desafios.every((d) =>
            d?.narrativa && d?.pregunta && d?.pista && d?.exito &&
            ['A', 'B', 'C'].includes(String(d?.correcta || '').trim().toUpperCase()) &&
            d?.alternativas?.A && d?.alternativas?.B && d?.alternativas?.C);
    if (!completo) {
        throw new Error('La IA no devolvió la misión en el formato esperado.');
    }
    return { ...data, desafios };
};

// ---- POST /api/ia/mision ----
// Body: { materia?, tema, tematica, cantidad? } → misión narrativa completa.
// tema = contenido matemático ("sumas con llevadas"); tematica = ambientación
// de la aventura ("piratas", "espacio", "cocina", ...).
router.post('/mision', soloDocente, async (req, res) => {
    const materia = String(req.body?.materia || 'Matemáticas').trim().slice(0, 60);
    const tema = String(req.body?.tema || '').trim().slice(0, 200);
    const tematica = String(req.body?.tematica || '').trim().slice(0, 60);
    const cantidad = Math.min(Math.max(Number(req.body?.cantidad) || 3, 3), 5);

    if (!tema || !tematica) {
        return res.status(400).json({ error: 'Se requieren tema y temática de la aventura' });
    }

    const prompt =
        `Eres un escritor de cuentos infantiles y docente experto en ${materia} para niños de 6 a 9 años. ` +
        `Crea una MISIÓN NARRATIVA: una mini-aventura de temática "${tematica}" donde el estudiante es el héroe ` +
        `(nárrala en segunda persona) y debe superar EXACTAMENTE ${cantidad} desafíos secuenciales sobre '${tema}'.\n\n` +
        `REGLAS ESTRICTAS:\n` +
        `1. Continuidad: los desafíos son capítulos de UNA MISMA historia; cada 'narrativa' continúa la escena ` +
        `anterior y cada 'exito' conecta con el siguiente capítulo.\n` +
        `2. Integración: el problema matemático debe nacer de la historia (contar cofres, repartir raciones), ` +
        `nunca ser un ejercicio suelto.\n` +
        `3. Dificultad creciente y adecuada a educación básica elemental; números pequeños y lenguaje sencillo en español.\n` +
        `4. Veracidad: la alternativa marcada como 'correcta' debe ser matemáticamente exacta; verifica cada cálculo.\n` +
        `5. Las 3 alternativas deben ser plausibles (errores típicos de niños), sin repetirse.\n` +
        `6. La 'pista' guía el razonamiento sin revelar la respuesta.`;

    try {
        const respuesta = await generarConReintentos({
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: MISION_SCHEMA }
        });
        res.json({ mision: parsearMision(respuesta.text, cantidad) });
    } catch (err) {
        console.error('IA/mision:', err.message);
        res.status(502).json({ error: 'No se pudo generar la misión con la IA. Inténtalo de nuevo.' });
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
