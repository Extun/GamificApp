// Adaptador de OpenAI (SPEC-016, Fase 2).
//
// Traduce los esquemas del registro (formato Gemini, tipos en MAYÚSCULA) a
// JSON Schema estándar en modo `strict`, que es lo que exige OpenAI para
// garantizar salida estructurada. Los esquemas de lib/actividadesIA.js NO se
// modifican: toda la adaptación vive aquí.
import OpenAI from 'openai';

const MAX_INTENTOS = 3;
const ESPERA_MS = 2000;
const MODELO_POR_DEFECTO = 'gpt-4o-mini';
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let cliente_ = null;
const cliente = () => {
    if (!process.env.OPENAI_API_KEY) {
        const err = new Error('Falta OPENAI_API_KEY en el servidor');
        err.status = 503;
        throw err;
    }
    cliente_ ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return cliente_;
};

const esTemporal = (err) =>
    err?.status === 429 || err?.status === 500 || err?.status === 502 ||
    err?.status === 503 || err?.status === 504;

// ---- Traducción de esquema Gemini → JSON Schema strict -----------------------
// Reglas del modo strict de OpenAI:
//   · todo objeto declara additionalProperties: false;
//   · TODAS sus propiedades deben listarse en `required`.
// Para no volver obligatorio lo que el esquema original marcaba como opcional
// (p. ej. `etiqueta` en línea del tiempo), esas propiedades se declaran
// nullables: el modelo puede devolver null y los normalizadores existentes ya
// tratan null como ausente.
const traducir = (nodo, obligatorio = true) => {
    const tipo = String(nodo?.type ?? '').toLowerCase();
    const desc = nodo?.description ? { description: nodo.description } : {};
    const conNulo = (t) => (obligatorio ? t : [t, 'null']);

    if (tipo === 'object') {
        const origen = nodo.properties ?? {};
        const requeridas = new Set(nodo.required ?? Object.keys(origen));
        const properties = {};
        for (const [clave, valor] of Object.entries(origen)) {
            properties[clave] = traducir(valor, requeridas.has(clave));
        }
        return {
            type: conNulo('object'),
            ...desc,
            properties,
            required: Object.keys(properties),
            additionalProperties: false
        };
    }
    if (tipo === 'array') {
        return { type: conNulo('array'), ...desc, items: traducir(nodo.items, true) };
    }
    return { type: conNulo(tipo || 'string'), ...desc };
};

// OpenAI exige que la raíz del esquema sea un objeto. QUIZ_SCHEMA es un ARRAY
// en la raíz, así que se envuelve y se desenvuelve tras la respuesta: hacia
// fuera, generarJSON sigue devolviendo exactamente la misma forma que Gemini.
const CLAVE_ENVOLTORIO = 'resultado';

const prepararEsquema = (schema) => {
    const esRaizArray = String(schema?.type ?? '').toLowerCase() === 'array';
    const cuerpo = esRaizArray
        ? {
            type: 'object',
            properties: { [CLAVE_ENVOLTORIO]: traducir(schema, true) },
            required: [CLAVE_ENVOLTORIO],
            additionalProperties: false
        }
        : traducir(schema, true);
    return { esRaizArray, cuerpo };
};

const llamar = async (peticion) => {
    let ultimoError = null;
    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
        try {
            return await cliente().chat.completions.create(peticion);
        } catch (err) {
            ultimoError = err;
            if (esTemporal(err) && intento < MAX_INTENTOS) {
                await dormir(ESPERA_MS);
                continue;
            }
            break;
        }
    }
    throw ultimoError ?? new Error('No se obtuvo respuesta de OpenAI.');
};

// Catálogo dinámico filtrado. `models.list()` de OpenAI devuelve TODO
// (embeddings, audio, imagen…) y no expone qué modelo soporta salida
// estructurada con json_schema, así que el filtro de compatibilidad lo aporta
// este adaptador: solo familias que sí la soportan.
const FAMILIA_COMPATIBLE = /^(gpt-4o|gpt-4\.1|gpt-5|o[1-9])/i;
const NO_TEXTO = /embedding|tts|whisper|dall-e|audio|realtime|moderation|instruct|transcribe|image|search/i;

export const proveedorOpenAI = {
    id: 'openai',
    etiqueta: 'OpenAI',
    variableEntorno: 'OPENAI_API_KEY',
    disponible: () => Boolean(process.env.OPENAI_API_KEY),

    listarModelos: async () => {
        const pagina = await cliente().models.list();
        const nombres = [];
        for await (const m of pagina) {
            const id = String(m?.id ?? '');
            if (FAMILIA_COMPATIBLE.test(id) && !NO_TEXTO.test(id)) nombres.push(id);
        }
        // "mini" primero: más barato y suficiente para actividades escolares.
        nombres.sort((a, b) => (b.includes('mini') - a.includes('mini')) || a.localeCompare(b));
        if (!nombres.length) throw new Error('La cuenta no expone modelos compatibles con salida estructurada.');
        return nombres;
    },

    generarJSON: async ({ prompt, schema, modelo }) => {
        const { esRaizArray, cuerpo } = prepararEsquema(schema);
        const respuesta = await llamar({
            model: modelo || MODELO_POR_DEFECTO,
            messages: [{ role: 'user', content: prompt }],
            response_format: {
                type: 'json_schema',
                json_schema: { name: 'actividad', strict: true, schema: cuerpo }
            }
        });
        const texto = respuesta?.choices?.[0]?.message?.content ?? '';
        const data = JSON.parse(texto);
        return esRaizArray ? data?.[CLAVE_ENVOLTORIO] : data;
    },

    generarTexto: async ({ prompt, modelo }) => {
        const respuesta = await llamar({
            model: modelo || MODELO_POR_DEFECTO,
            messages: [{ role: 'user', content: prompt }]
        });
        return String(respuesta?.choices?.[0]?.message?.content ?? '');
    },

    clasificarError: (err) => {
        if (err?.status === 401 || err?.status === 403) return 'credencial';
        if (err?.status === 429) return 'cuota';
        if (esTemporal(err)) return 'temporal';
        if (err instanceof SyntaxError) return 'formato';
        return 'permanente';
    },

    _resetCache: () => { cliente_ = null; }
};

export default proveedorOpenAI;
