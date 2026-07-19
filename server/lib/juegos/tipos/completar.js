// Tipo de juego: Completar espacios (SPEC-017, Fase 1).
// Código movido SIN cambios desde los módulos originales.
import { Tipo } from '../../ia/esquema.js';
import { bloqueContexto, REGLAS_COMUNES } from '../prompts.js';

const schema = {
    type: Tipo.OBJECT,
    properties: {
        titulo: { type: Tipo.STRING, description: 'Título corto de la actividad' },
        instruccion: { type: Tipo.STRING, description: 'Instrucción para el niño en una frase' },
        frases: {
            type: Tipo.ARRAY,
            items: {
                type: Tipo.OBJECT,
                properties: {
                    texto: { type: Tipo.STRING, description: 'Frase con EXACTAMENTE un espacio a completar marcado como ___' },
                    opciones: { type: Tipo.ARRAY, items: { type: Tipo.STRING }, description: '3 o 4 opciones, incluida la correcta' },
                    correcta: { type: Tipo.STRING, description: 'La opción correcta, copiada tal cual de "opciones"' }
                },
                required: ['texto', 'opciones', 'correcta']
            }
        }
    },
    required: ['titulo', 'instruccion', 'frases']
};

export const completar = {
    tipo: 'completar',
    etiqueta: 'Completar espacios',
    emoji: '✏️',
    descripcion: 'Elige la palabra que completa correctamente cada frase.',
    capacidades: { ia: true, banco: true, reutilizar: true, automatico: true },
    verboAuditoria: 'Completó los espacios',

    // Forma esperada: { instruccion, frases: [{ texto (con ___), opciones: [3-4], correcta }, ...] }
    validarConfig: (config) => {
        if (!config || !Array.isArray(config.frases)) {
            return 'La actividad de completar debe incluir un arreglo "frases"';
        }
        if (config.frases.length < 2 || config.frases.length > 8) {
            return 'La actividad de completar necesita entre 2 y 8 frases';
        }
        for (const [i, f] of config.frases.entries()) {
            const etiqueta = `La frase ${i + 1}`;
            if (typeof f?.texto !== 'string' || !f.texto.includes('___')) {
                return `${etiqueta} necesita un espacio a completar marcado con ___`;
            }
            if (!Array.isArray(f.opciones) || f.opciones.length < 2 ||
                f.opciones.some((o) => typeof o !== 'string' || !o.trim())) {
                return `${etiqueta} necesita al menos 2 opciones con texto`;
            }
            if (typeof f?.correcta !== 'string' || !f.opciones.includes(f.correcta)) {
                return `${etiqueta} necesita que "correcta" sea una de sus opciones`;
            }
        }
        return null;
    },

    totalEsperado: (config) =>
        (Array.isArray(config?.frases) && config.frases.length ? config.frases.length : null),

    banco: {
        claveItems: 'frases',
        validarItem: (item) => {
            if (typeof item?.texto !== 'string' || !item.texto.includes('___')) {
                return 'La frase necesita un espacio a completar marcado con ___';
            }
            if (!Array.isArray(item.opciones) || item.opciones.length < 2 ||
                item.opciones.some((o) => typeof o !== 'string' || !o.trim())) {
                return 'La frase necesita al menos 2 opciones con texto';
            }
            if (typeof item?.correcta !== 'string' || !item.opciones.includes(item.correcta)) {
                return 'La opción correcta debe ser una de las opciones';
            }
            return null;
        },
        resumenItem: (item) => item?.texto
    },

    ia: {
        schema,
        rango: [2, 8],
        construirPrompt: (ctx) =>
            `Eres un docente experto en ${ctx.materia.nombre}. Diseña una actividad de COMPLETAR ESPACIOS ` +
            `sobre el tema '${ctx.tema}' con EXACTAMENTE ${ctx.cantidad} frases. Cada frase tiene EXACTAMENTE UN ` +
            `espacio en blanco marcado con ___ y de 3 a 4 opciones para llenarlo (una correcta y el resto ` +
            `distractores plausibles). La frase completa debe ser verdadera y natural en español.\n\n` +
            `${bloqueContexto(ctx)}\n\n${REGLAS_COMUNES}`,
        normalizar: (data, ctx) => {
            const frases = (data?.frases || []).slice(0, ctx.cantidad).map((f) => ({
                texto: String(f?.texto || '').trim(),
                opciones: (f?.opciones || []).map((o) => String(o).trim()).filter(Boolean),
                correcta: String(f?.correcta || '').trim()
            }));
            return {
                titulo: data?.titulo || ctx.tema,
                descripcion: `Completar espacios de ${ctx.materia.nombre} sobre ${ctx.tema}`,
                configuracion: { instruccion: data?.instruccion || 'Elige la palabra que completa cada frase.', frases },
                items: frases.length
            };
        }
    }
};

export default completar;
