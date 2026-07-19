// Tipo de juego: Misión Narrativa (SPEC-017, Fase 1).
// Código movido SIN cambios desde los módulos originales.
import { Tipo } from '../../ia/esquema.js';
import { bloqueContexto, REGLAS_COMUNES } from '../prompts.js';

// Exportado aparte: continuarMision() de actividadesIA.js lo reutiliza.
export const MISION_SCHEMA = {
    type: Tipo.OBJECT,
    properties: {
        titulo: { type: Tipo.STRING, description: 'Título corto y atractivo de la aventura' },
        introduccion: { type: Tipo.STRING, description: 'Apertura narrativa que presenta el mundo y al héroe (3-4 frases, segunda persona)' },
        desafios: {
            type: Tipo.ARRAY,
            items: {
                type: Tipo.OBJECT,
                properties: {
                    narrativa: { type: Tipo.STRING, description: 'Escena de la historia que plantea el problema (2-3 frases)' },
                    pregunta: { type: Tipo.STRING, description: 'El desafío concreto de la materia' },
                    alternativas: {
                        type: Tipo.OBJECT,
                        properties: { A: { type: Tipo.STRING }, B: { type: Tipo.STRING }, C: { type: Tipo.STRING } },
                        required: ['A', 'B', 'C']
                    },
                    correcta: { type: Tipo.STRING, description: 'Letra de la alternativa correcta: A, B o C' },
                    pista: { type: Tipo.STRING, description: 'Pista amable si el niño se equivoca, sin dar la respuesta' },
                    exito: { type: Tipo.STRING, description: 'Frase narrativa que celebra el acierto y empuja la historia (1-2 frases)' }
                },
                required: ['narrativa', 'pregunta', 'alternativas', 'correcta', 'pista', 'exito']
            }
        },
        final: { type: Tipo.STRING, description: 'Cierre triunfal de la aventura (2-3 frases)' }
    },
    required: ['titulo', 'introduccion', 'desafios', 'final']
};

export const mision = {
    tipo: 'mision',
    etiqueta: 'Misión Narrativa',
    emoji: '🗺️',
    descripcion: 'Una mini-aventura por capítulos donde el estudiante es el héroe.',
    // Banco descartado conscientemente en SPEC-013 §3: reutilizar desafíos
    // sueltos rompe la narrativa, que es su valor pedagógico central.
    capacidades: { ia: true, banco: false, reutilizar: false, automatico: false },
    verboAuditoria: 'Completó la misión',

    // Forma esperada: { titulo, introduccion, final,
    //   desafios: [{ narrativa, pregunta, alternativas: {A,B,C}, correcta, pista, exito }] }
    validarConfig: (config) => {
        if (!config?.introduccion || !config?.final) {
            return 'La misión necesita introducción y final narrativos';
        }
        if (!Array.isArray(config.desafios) || config.desafios.length < 3) {
            return 'La misión necesita al menos 3 desafíos';
        }
        for (const [i, d] of config.desafios.entries()) {
            const etiqueta = `El desafío ${i + 1}`;
            if (!d?.narrativa || !d?.pregunta) return `${etiqueta} necesita narrativa y pregunta`;
            if (!d?.alternativas?.A || !d?.alternativas?.B || !d?.alternativas?.C) {
                return `${etiqueta} necesita las alternativas A, B y C`;
            }
            if (!['A', 'B', 'C'].includes(String(d?.correcta || '').trim().toUpperCase())) {
                return `${etiqueta} necesita una respuesta correcta (A, B o C)`;
            }
        }
        return null;
    },

    totalEsperado: (config) =>
        (Array.isArray(config?.desafios) && config.desafios.length ? config.desafios.length : null),

    banco: null,

    ia: {
        schema: MISION_SCHEMA,
        rango: [3, 5],
        construirPrompt: (ctx) =>
            `Eres un escritor de cuentos infantiles y docente experto en ${ctx.materia.nombre} para niños de 6 a 9 años. ` +
            `Crea una MISIÓN NARRATIVA: una mini-aventura de temática "${ctx.tematica || 'aventura mágica'}" donde el estudiante es el héroe ` +
            `(nárrala en segunda persona) y debe superar EXACTAMENTE ${ctx.cantidad} desafíos secuenciales sobre '${ctx.tema}'.\n\n` +
            `${bloqueContexto(ctx)}\n\n${REGLAS_COMUNES}\n` +
            `5. Continuidad: los desafíos son capítulos de UNA MISMA historia; cada 'narrativa' continúa la escena anterior y cada 'exito' conecta con el siguiente capítulo.\n` +
            `6. Integración: el desafío debe nacer de la historia, nunca ser un ejercicio suelto.\n` +
            `7. La 'pista' guía el razonamiento sin revelar la respuesta.`,
        normalizar: (data, ctx) => {
            const desafios = Array.isArray(data?.desafios) ? data.desafios.slice(0, ctx.cantidad) : [];
            return {
                titulo: data?.titulo || ctx.tema,
                descripcion: `Misión narrativa de ${ctx.materia.nombre} sobre ${ctx.tema}`,
                configuracion: { ...data, desafios },
                items: desafios.length
            };
        }
    }
};

export default mision;
