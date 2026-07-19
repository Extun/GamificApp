// Tipo de juego: Verdadero o Falso (SPEC-017, Fase 7).
//
// Este archivo es la PRUEBA DE EXTENSIBILIDAD de SPEC-017: todo lo que el
// servidor necesita saber de este juego —validación, evaluación, verbo de
// auditoría, banco de preguntas y generación con IA— está declarado aquí.
// Ningún módulo central conoce este tipo.
//
// configuracion_json: { instruccion, afirmaciones: [{ texto, esVerdadera, explicacion? }] }
import { Tipo } from '../../ia/esquema.js';
import { bloqueContexto, REGLAS_COMUNES } from '../prompts.js';

const MIN_AFIRMACIONES = 3;
const MAX_AFIRMACIONES = 8;

const schema = {
    type: Tipo.OBJECT,
    properties: {
        titulo: { type: Tipo.STRING, description: 'Título corto de la actividad' },
        instruccion: { type: Tipo.STRING, description: 'Instrucción para el niño en una frase' },
        afirmaciones: {
            type: Tipo.ARRAY,
            items: {
                type: Tipo.OBJECT,
                properties: {
                    texto: { type: Tipo.STRING, description: 'La afirmación, en una frase corta y clara' },
                    esVerdadera: { type: Tipo.BOOLEAN, description: 'true si la afirmación es verdadera, false si es falsa' },
                    explicacion: { type: Tipo.STRING, description: 'Por qué es verdadera o falsa, en una frase amable' }
                },
                required: ['texto', 'esVerdadera', 'explicacion']
            }
        }
    },
    required: ['titulo', 'instruccion', 'afirmaciones']
};

export const verdaderoFalso = {
    tipo: 'verdadero-falso',
    etiqueta: 'Verdadero o Falso',
    emoji: '✅',
    descripcion: 'Decide si cada afirmación es verdadera o falsa.',
    capacidades: { ia: true, banco: true, reutilizar: true, automatico: true },
    verboAuditoria: 'Resolvió el verdadero o falso',

    // Forma esperada: { instruccion, afirmaciones: [{ texto, esVerdadera, explicacion? }] }
    validarConfig: (config) => {
        if (!config || !Array.isArray(config.afirmaciones)) {
            return 'La actividad debe incluir un arreglo "afirmaciones"';
        }
        if (config.afirmaciones.length < MIN_AFIRMACIONES || config.afirmaciones.length > MAX_AFIRMACIONES) {
            return `El verdadero o falso necesita entre ${MIN_AFIRMACIONES} y ${MAX_AFIRMACIONES} afirmaciones`;
        }
        for (const [i, a] of config.afirmaciones.entries()) {
            const etiqueta = `La afirmación ${i + 1}`;
            if (typeof a?.texto !== 'string' || !a.texto.trim()) {
                return `${etiqueta} necesita un texto`;
            }
            if (typeof a?.esVerdadera !== 'boolean') {
                return `${etiqueta} necesita indicar si es verdadera o falsa`;
            }
        }
        return null;
    },

    // Una afirmación = un ítem evaluable. La calificación es la fórmula común
    // (aciertos / total × 100); aquí solo se declara el denominador.
    totalEsperado: (config) =>
        (Array.isArray(config?.afirmaciones) && config.afirmaciones.length
            ? config.afirmaciones.length
            : null),

    banco: {
        claveItems: 'afirmaciones',
        validarItem: (item) => {
            if (typeof item?.texto !== 'string' || !item.texto.trim()) {
                return 'La afirmación necesita un texto';
            }
            if (typeof item?.esVerdadera !== 'boolean') {
                return 'La afirmación necesita indicar si es verdadera o falsa';
            }
            return null;
        },
        resumenItem: (item) =>
            (item?.texto ? `${item.esVerdadera ? '✔' : '✘'} ${item.texto}` : '')
    },

    ia: {
        schema,
        rango: [MIN_AFIRMACIONES, MAX_AFIRMACIONES],
        construirPrompt: (ctx) =>
            `Eres un docente experto en ${ctx.materia.nombre}. Diseña una actividad de VERDADERO O FALSO ` +
            `sobre el tema '${ctx.tema}' con EXACTAMENTE ${ctx.cantidad} afirmaciones. Cada afirmación es una ` +
            `frase corta y clara que el estudiante debe juzgar como verdadera o falsa, e incluye una ` +
            `explicación breve y amable de por qué lo es.\n\n` +
            `${bloqueContexto(ctx)}\n\n${REGLAS_COMUNES}\n` +
            `5. Equilibrio: mezcla afirmaciones verdaderas y falsas; NO hagas que todas sean del mismo tipo ` +
            `ni sigas un patrón alternado predecible.\n` +
            `6. Calidad de las falsas: cada afirmación falsa debe representar un ERROR CONCEPTUAL PLAUSIBLE ` +
            `que un niño de esta edad cometería de verdad (una confusión común, un dato cercano pero ` +
            `equivocado). NUNCA uses afirmaciones absurdas, disparatadas o tan obvias que no haya que pensar: ` +
            `si la respuesta se adivina sin conocer el tema, la afirmación no sirve.\n` +
            `7. Cada afirmación juzga UNA sola idea: nada de frases con dos hechos unidos por "y" que sean ` +
            `uno verdadero y otro falso.\n` +
            `8. La explicación enseña: dice por qué es verdadera o, si es falsa, cuál es el dato correcto.`,
        normalizar: (data, ctx) => {
            const afirmaciones = (data?.afirmaciones || []).slice(0, ctx.cantidad).map((a) => ({
                texto: String(a?.texto || '').trim(),
                esVerdadera: Boolean(a?.esVerdadera),
                ...(a?.explicacion ? { explicacion: String(a.explicacion).trim() } : {})
            }));
            return {
                titulo: data?.titulo || ctx.tema,
                descripcion: `Verdadero o falso de ${ctx.materia.nombre} sobre ${ctx.tema}`,
                configuracion: {
                    instruccion: data?.instruccion || '¿Es verdadero o falso? Piensa bien antes de responder.',
                    afirmaciones
                },
                items: afirmaciones.length
            };
        }
    }
};

export default verdaderoFalso;
