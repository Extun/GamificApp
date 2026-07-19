// Tipo de juego: Quiz (SPEC-017, Fase 1).
// Código movido SIN cambios desde validadoresRetos.js, totalEsperado.js,
// actividadesIA.js y bancoPreguntas.js. Ninguna fórmula ni denominador varía.
import { Tipo } from '../../ia/esquema.js';
import { bloqueContexto, REGLAS_COMUNES } from '../prompts.js';

const schema = {
    type: Tipo.ARRAY,
    items: {
        type: Tipo.OBJECT,
        properties: {
            pregunta: { type: Tipo.STRING },
            alternativas: {
                type: Tipo.OBJECT,
                properties: {
                    A: { type: Tipo.STRING }, B: { type: Tipo.STRING },
                    C: { type: Tipo.STRING }, D: { type: Tipo.STRING }
                },
                required: ['A', 'B', 'C', 'D']
            },
            correcta: { type: Tipo.STRING, description: 'Letra de la alternativa correcta: A, B, C o D' },
            justificacion: { type: Tipo.STRING }
        },
        required: ['pregunta', 'alternativas', 'correcta', 'justificacion']
    }
};

export const quiz = {
    tipo: 'quiz',
    etiqueta: 'Quiz',
    emoji: '✨',
    descripcion: 'Preguntas de opción múltiple con una respuesta correcta.',
    capacidades: { ia: true, banco: true, reutilizar: true, automatico: true },
    verboAuditoria: 'Resolvió el quiz',

    // Forma esperada: { preguntas: [{ pregunta, alternativas: {A,B,C,D}, correcta, justificacion }] }
    validarConfig: (config) => {
        if (!config || !Array.isArray(config.preguntas) || !config.preguntas.length) {
            return 'El quiz necesita al menos una pregunta';
        }
        for (const [i, p] of config.preguntas.entries()) {
            const etiqueta = `La pregunta ${i + 1}`;
            if (typeof p?.pregunta !== 'string' || !p.pregunta.trim()) {
                return `${etiqueta} necesita un enunciado`;
            }
            if (!p?.alternativas?.A || !p?.alternativas?.B) {
                return `${etiqueta} necesita al menos las alternativas A y B`;
            }
            const correcta = String(p?.correcta || '').trim().toUpperCase().charAt(0);
            if (!p?.alternativas?.[correcta]) {
                return `${etiqueta} necesita una respuesta correcta que exista entre sus alternativas`;
            }
        }
        return null;
    },

    // Preguntas realmente jugables en UN intento: si el quiz define una muestra
    // por intento (`preguntas_por_intento`), esa es la referencia — nunca el
    // pool completo. Espeja `muestrear()` de QuizInteractivo.jsx.
    totalEsperado: (config) => {
        if (!Array.isArray(config?.preguntas) || !config.preguntas.length) return null;
        const pool = config.preguntas.length;
        const porIntento = Number(config.preguntas_por_intento) || 0;
        return porIntento > 0 ? Math.min(porIntento, pool) : pool;
    },

    banco: {
        claveItems: 'preguntas',
        validarItem: (item) => {
            if (typeof item?.pregunta !== 'string' || !item.pregunta.trim()) {
                return 'La pregunta necesita un enunciado';
            }
            if (!item?.alternativas?.A || !item?.alternativas?.B) {
                return 'La pregunta necesita al menos las alternativas A y B';
            }
            const correcta = String(item?.correcta || '').trim().toUpperCase().charAt(0);
            if (!item?.alternativas?.[correcta]) {
                return 'La respuesta correcta debe existir entre las alternativas';
            }
            return null;
        },
        resumenItem: (item) => item?.pregunta
    },

    ia: {
        schema,
        rango: [3, 10],
        construirPrompt: (ctx) =>
            `Eres un docente experto en ${ctx.materia.nombre}. Genera un quiz de opción múltiple ` +
            `sobre el tema '${ctx.tema}' con EXACTAMENTE ${ctx.cantidad} preguntas. Cada pregunta debe tener ` +
            `4 alternativas (A–D), indicar la letra de la respuesta correcta y una justificación. ` +
            `Devuelve EXACTAMENTE ${ctx.cantidad} preguntas, ni más ni menos.\n\n` +
            `${bloqueContexto(ctx)}\n\n${REGLAS_COMUNES}`,
        normalizar: (data, ctx) => {
            const preguntas = Array.isArray(data) ? data : data?.preguntas;
            return {
                titulo: ctx.tema,
                descripcion: `Quiz de ${ctx.materia.nombre} sobre ${ctx.tema}`,
                configuracion: { preguntas },
                items: preguntas?.length || 0
            };
        }
    }
};

export default quiz;
